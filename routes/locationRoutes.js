// Rutas de Ubicación - San Martín Digital
// API para tracking de ubicación de usuarios
const express = require('express');
const router = express.Router();
const Location = require('../models/Location');
const User = require('../models/User');
const Student = require('../models/Student');
const Parent = require('../models/Parent');
const Notification = require('../models/Notification');
const { auth } = require('../middleware/auth');
const pushService = require('../services/pushNotifications');

// ============================================
// POST /api/location - Guardar ubicación actual
// ============================================
router.post('/', auth, async (req, res) => {
  try {
    const { 
      latitude, 
      longitude, 
      accuracy, 
      altitude, 
      speed, 
      heading,
      updateType = 'periodic',
      sessionStatus = 'online',
      batteryLevel,
      networkType,
      deviceInfo,
      clientTimestamp,
    } = req.body;

    // Validar coordenadas
    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Latitud y longitud son requeridas',
      });
    }

    // Crear registro de ubicación
    const location = await Location.create({
      user: req.user.id,
      coordinates: {
        latitude,
        longitude,
        accuracy,
        altitude,
        speed,
        heading,
      },
      updateType,
      sessionStatus,
      batteryLevel,
      networkType,
      deviceInfo: deviceInfo || {
        platform: 'android',
      },
      clientTimestamp: clientTimestamp || new Date(),
    });

    // Actualizar última actividad del usuario
    await User.findByIdAndUpdate(req.user.id, {
      lastActive: new Date(),
      isOnline: sessionStatus === 'online',
    });

    res.status(201).json({
      success: true,
      message: 'Ubicación guardada',
      data: {
        id: location._id,
        coordinates: location.coordinates,
        sessionStatus: location.sessionStatus,
        timestamp: location.createdAt,
      },
    });
  } catch (error) {
    console.error('Error guardando ubicación:', error);
    res.status(500).json({
      success: false,
      message: 'Error al guardar ubicación',
      error: error.message,
    });
  }
});

// ============================================
// POST /api/location/logout - Marcar última ubicación al cerrar sesión
// ============================================
router.post('/logout', auth, async (req, res) => {
  try {
    const { latitude, longitude, accuracy } = req.body;

    if (latitude && longitude) {
      await Location.create({
        user: req.user.id,
        coordinates: { latitude, longitude, accuracy },
        updateType: 'logout',
        sessionStatus: 'offline',
        clientTimestamp: new Date(),
      });
    }

    // Marcar usuario como offline
    await User.findByIdAndUpdate(req.user.id, {
      lastActive: new Date(),
      isOnline: false,
    });

    res.json({
      success: true,
      message: 'Sesión cerrada, ubicación guardada',
    });
  } catch (error) {
    console.error('Error en logout location:', error);
    res.status(500).json({
      success: false,
      message: 'Error al guardar ubicación de logout',
    });
  }
});

// ============================================
// GET /api/location/me - Obtener mi última ubicación
// ============================================
router.get('/me', auth, async (req, res) => {
  try {
    const location = await Location.getLastLocation(req.user.id);

    if (!location) {
      return res.json({
        success: true,
        data: null,
        message: 'No hay ubicación registrada',
      });
    }

    res.json({
      success: true,
      data: location,
    });
  } catch (error) {
    console.error('Error obteniendo ubicación:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener ubicación',
    });
  }
});

// ============================================
// GET /api/location/history - Historial de ubicaciones del usuario
// ============================================
router.get('/history', auth, async (req, res) => {
  try {
    const { hours = 24 } = req.query;
    const history = await Location.getLocationHistory(req.user.id, parseInt(hours));

    res.json({
      success: true,
      count: history.length,
      data: history,
    });
  } catch (error) {
    console.error('Error obteniendo historial:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener historial',
    });
  }
});

// ============================================
// GET /api/location/users/online - Usuarios en línea (Admin)
// ============================================
router.get('/users/online', auth, async (req, res) => {
  try {
    // Solo admin puede ver ubicaciones de todos
    if (req.user.role !== 'administrativo') {
      return res.status(403).json({
        success: false,
        message: 'No autorizado para ver ubicaciones de usuarios',
      });
    }

    const { role, minutes = 5 } = req.query;
    const onlineUsers = await Location.getOnlineUsers(role, parseInt(minutes));

    res.json({
      success: true,
      count: onlineUsers.length,
      data: onlineUsers.map(loc => ({
        user: {
          _id: loc.userInfo._id,
          firstName: loc.userInfo.firstName,
          lastName: loc.userInfo.lastName,
          email: loc.userInfo.email,
          role: loc.userInfo.role,
          profilePhoto: loc.userInfo.profilePhoto,
        },
        location: {
          latitude: loc.coordinates.latitude,
          longitude: loc.coordinates.longitude,
          accuracy: loc.coordinates.accuracy,
        },
        sessionStatus: loc.sessionStatus,
        lastUpdate: loc.createdAt,
        batteryLevel: loc.batteryLevel,
        networkType: loc.networkType,
      })),
    });
  } catch (error) {
    console.error('Error obteniendo usuarios online:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener usuarios online',
    });
  }
});

// ============================================
// GET /api/location/students - Ubicaciones de estudiantes (Admin/Docente)
// ============================================
router.get('/students', auth, async (req, res) => {
  try {
    // Solo admin y docentes pueden ver
    if (!['administrativo', 'docente'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'No autorizado',
      });
    }

    const { minutes = 30 } = req.query;
    const threshold = new Date(Date.now() - parseInt(minutes) * 60 * 1000);

    // Obtener últimas ubicaciones de estudiantes
    // ACTUALIZADO: Ahora busca en la colección students directamente
    const studentLocations = await Location.aggregate([
      {
        $match: {
          createdAt: { $gte: threshold },
        },
      },
      {
        $sort: { createdAt: -1 },
      },
      {
        $group: {
          _id: '$user',
          lastLocation: { $first: '$$ROOT' },
        },
      },
      {
        $replaceRoot: { newRoot: '$lastLocation' },
      },
      {
        $lookup: {
          from: 'students',
          localField: 'user',
          foreignField: '_id',
          as: 'studentInfo',
        },
      },
      {
        $unwind: {
          path: '$studentInfo',
          preserveNullAndEmptyArrays: false, // Solo estudiantes
        },
      },
    ]);

    res.json({
      success: true,
      count: studentLocations.length,
      data: studentLocations.map(loc => ({
        user: {
          _id: loc.studentInfo._id,
          firstName: loc.studentInfo.firstName,
          lastName: loc.studentInfo.lastName,
          email: loc.studentInfo.email,
          profilePhoto: loc.studentInfo.photo,
        },
        student: {
          gradeLevel: loc.studentInfo.gradeLevel,
          section: loc.studentInfo.section,
          studentCode: loc.studentInfo.studentCode,
        },
        location: {
          latitude: loc.coordinates.latitude,
          longitude: loc.coordinates.longitude,
          accuracy: loc.coordinates.accuracy,
        },
        isOnline: loc.sessionStatus === 'online',
        sessionStatus: loc.sessionStatus,
        lastUpdate: loc.createdAt,
        batteryLevel: loc.batteryLevel,
      })),
    });
  } catch (error) {
    console.error('Error obteniendo ubicaciones de estudiantes:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener ubicaciones',
    });
  }
});

// ============================================
// GET /api/location/user/:userId - Ubicación de usuario específico (Admin)
// ============================================
router.get('/user/:userId', auth, async (req, res) => {
  try {
    // Solo admin puede ver ubicación de otros
    if (req.user.role !== 'administrativo' && req.user.id !== req.params.userId) {
      return res.status(403).json({
        success: false,
        message: 'No autorizado',
      });
    }

    const location = await Location.getLastLocation(req.params.userId);
    
    if (!location) {
      return res.status(404).json({
        success: false,
        message: 'No hay ubicación para este usuario',
      });
    }

    res.json({
      success: true,
      data: location,
    });
  } catch (error) {
    console.error('Error obteniendo ubicación de usuario:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener ubicación',
    });
  }
});

// ============================================
// GET /api/location/user/:userId/history - Historial de usuario (Admin)
// ============================================
router.get('/user/:userId/history', auth, async (req, res) => {
  try {
    if (req.user.role !== 'administrativo') {
      return res.status(403).json({
        success: false,
        message: 'No autorizado',
      });
    }

    const { hours = 24 } = req.query;
    const history = await Location.getLocationHistory(req.params.userId, parseInt(hours));

    res.json({
      success: true,
      count: history.length,
      data: history,
    });
  } catch (error) {
    console.error('Error obteniendo historial:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener historial',
    });
  }
});

// ============================================
// GET /api/location/stats - Estadísticas de ubicación (Admin)
// ============================================
router.get('/stats', auth, async (req, res) => {
  try {
    if (req.user.role !== 'administrativo') {
      return res.status(403).json({
        success: false,
        message: 'No autorizado',
      });
    }

    const now = new Date();
    const fiveMinutesAgo = new Date(now - 5 * 60 * 1000);
    const thirtyMinutesAgo = new Date(now - 30 * 60 * 1000);

    // Contar usuarios online por rol
    const onlineByRole = await Location.aggregate([
      {
        $match: {
          createdAt: { $gte: fiveMinutesAgo },
          sessionStatus: { $in: ['online', 'background'] },
        },
      },
      {
        $sort: { createdAt: -1 },
      },
      {
        $group: {
          _id: '$user',
          lastLocation: { $first: '$$ROOT' },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'userInfo',
        },
      },
      {
        $unwind: '$userInfo',
      },
      {
        $group: {
          _id: '$userInfo.role',
          count: { $sum: 1 },
        },
      },
    ]);

    // Total de registros hoy
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    
    const todayCount = await Location.countDocuments({
      createdAt: { $gte: startOfDay },
    });

    // Usuarios activos en última media hora
    const activeUsers = await Location.distinct('user', {
      createdAt: { $gte: thirtyMinutesAgo },
    });

    res.json({
      success: true,
      data: {
        onlineByRole: onlineByRole.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        totalActiveUsers: activeUsers.length,
        locationRecordsToday: todayCount,
        timestamp: now,
      },
    });
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener estadísticas',
    });
  }
});

// ============================================
// GET /api/location/children - Ubicaciones de hijos para padres
// ============================================
router.get('/children', auth, async (req, res) => {
  try {
    // Solo padres pueden acceder a este endpoint
    if (req.user.role !== 'padre') {
      return res.status(403).json({
        success: false,
        message: 'Solo los padres pueden ver la ubicación de sus hijos',
      });
    }

    const parentId = req.user._id || req.user.id;
    console.log('🔍 Buscando hijos para padre:', parentId, 'Email:', req.user.email);

    // Buscar estudiantes vinculados a este padre
    const students = await Student.find({
      $or: [
        { parent: parentId },
        { 'guardians.parent': parentId },
        { 'guardians.user': parentId }
      ],
      isActive: true
    }).select('_id firstName lastName photo gradeLevel section studentCode');

    console.log('📋 Estudiantes encontrados:', students.length, students.map(s => `${s.firstName} ${s.lastName}`));

    if (!students.length) {
      // Buscar también si el padre tiene children en el modelo Parent
      const Parent = require('../models/Parent');
      const parentRecord = await Parent.findById(parentId);
      
      if (parentRecord && parentRecord.children && parentRecord.children.length > 0) {
        console.log('📋 Buscando desde Parent.children:', parentRecord.children.length);
        const childIds = parentRecord.children.map(c => c.student);
        const childStudents = await Student.find({
          _id: { $in: childIds },
          isActive: true
        }).select('_id firstName lastName photo gradeLevel section studentCode');
        
        if (childStudents.length > 0) {
          console.log('✅ Encontrados desde Parent:', childStudents.length);
          // Continuar con estos estudiantes
          return processStudents(childStudents, res);
        }
      }

      return res.json({
        success: true,
        message: 'No tienes hijos vinculados',
        data: [],
      });
    }

    return processStudents(students, res);
  } catch (error) {
    console.error('Error obteniendo ubicación de hijos:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener ubicaciones',
      error: error.message,
    });
  }
});

// Función helper para procesar estudiantes y sus ubicaciones
async function processStudents(students, res) {
  try {
    const studentIds = students.map(s => s._id);

    // Obtener última ubicación de cada hijo
    const locations = await Location.aggregate([
      {
        $match: {
          user: { $in: studentIds }
        }
      },
      {
        $sort: { createdAt: -1 }
      },
      {
        $group: {
          _id: '$user',
          lastLocation: { $first: '$$ROOT' }
        }
      },
      {
        $replaceRoot: { newRoot: '$lastLocation' }
      }
    ]);

    // Combinar info de estudiantes con ubicaciones
    const childrenWithLocation = students.map(student => {
      const location = locations.find(l => l.user.toString() === student._id.toString());
      const now = new Date();
      
      let isOnline = false;
      let lastSeenText = 'Sin ubicación registrada';
      let minutesAgo = null;
      
      if (location) {
        const lastUpdate = new Date(location.createdAt);
        const diffMs = now - lastUpdate;
        minutesAgo = Math.floor(diffMs / 60000);
        
        // Consideramos online si la última ubicación fue hace menos de 5 minutos
        isOnline = minutesAgo < 5 && location.sessionStatus === 'online';
        
        if (minutesAgo < 1) {
          lastSeenText = 'Justo ahora';
        } else if (minutesAgo < 60) {
          lastSeenText = `Hace ${minutesAgo} minuto${minutesAgo > 1 ? 's' : ''}`;
        } else if (minutesAgo < 1440) {
          const hours = Math.floor(minutesAgo / 60);
          lastSeenText = `Hace ${hours} hora${hours > 1 ? 's' : ''}`;
        } else {
          const days = Math.floor(minutesAgo / 1440);
          lastSeenText = `Hace ${days} día${days > 1 ? 's' : ''}`;
        }
      }
      
      return {
        student: {
          _id: student._id,
          firstName: student.firstName,
          lastName: student.lastName,
          fullName: `${student.firstName} ${student.lastName}`,
          photo: student.photo,
          gradeLevel: student.gradeLevel,
          section: student.section,
          studentCode: student.studentCode,
        },
        location: location ? {
          latitude: location.coordinates.latitude,
          longitude: location.coordinates.longitude,
          accuracy: location.coordinates.accuracy,
          address: location.address?.formattedAddress || null,
        } : null,
        isOnline,
        sessionStatus: location?.sessionStatus || 'offline',
        lastUpdate: location?.createdAt || null,
        lastSeenText,
        minutesAgo,
        batteryLevel: location?.batteryLevel || null,
        networkType: location?.networkType || null,
      };
    });

    res.json({
      success: true,
      count: childrenWithLocation.length,
      data: childrenWithLocation,
    });
  } catch (error) {
    console.error('Error obteniendo ubicación de hijos:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener ubicaciones',
      error: error.message,
    });
  }
}

// ============================================
// GET /api/location/child/:studentId - Ubicación detallada de un hijo
// ============================================
router.get('/child/:studentId', auth, async (req, res) => {
  try {
    // Solo padres pueden acceder
    if (req.user.role !== 'padre') {
      return res.status(403).json({
        success: false,
        message: 'No autorizado',
      });
    }

    const { studentId } = req.params;
    const { hours = 24 } = req.query;

    // Verificar que el estudiante está vinculado a este padre
    const student = await Student.findOne({
      _id: studentId,
      $or: [
        { parent: req.user.id },
        { 'guardians.parent': req.user.id },
        { 'guardians.user': req.user.id }
      ],
      isActive: true
    });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Estudiante no encontrado o no está vinculado a tu cuenta',
      });
    }

    // Obtener última ubicación
    const lastLocation = await Location.findOne({ user: studentId })
      .sort({ createdAt: -1 });

    // Obtener historial de las últimas X horas
    const since = new Date(Date.now() - parseInt(hours) * 60 * 60 * 1000);
    const history = await Location.find({
      user: studentId,
      createdAt: { $gte: since }
    })
      .sort({ createdAt: -1 })
      .select('coordinates sessionStatus updateType createdAt batteryLevel networkType address')
      .limit(100);

    // Calcular estadísticas del día
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    
    const todayStats = await Location.aggregate([
      {
        $match: {
          user: student._id,
          createdAt: { $gte: startOfDay }
        }
      },
      {
        $group: {
          _id: null,
          totalUpdates: { $sum: 1 },
          avgBattery: { $avg: '$batteryLevel' },
          onlineCount: {
            $sum: { $cond: [{ $eq: ['$sessionStatus', 'online'] }, 1, 0] }
          },
          offlineCount: {
            $sum: { $cond: [{ $eq: ['$sessionStatus', 'offline'] }, 1, 0] }
          }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        student: {
          _id: student._id,
          firstName: student.firstName,
          lastName: student.lastName,
          fullName: `${student.firstName} ${student.lastName}`,
          photo: student.photo,
          gradeLevel: student.gradeLevel,
          section: student.section,
        },
        lastLocation: lastLocation ? {
          latitude: lastLocation.coordinates.latitude,
          longitude: lastLocation.coordinates.longitude,
          accuracy: lastLocation.coordinates.accuracy,
          address: lastLocation.address?.formattedAddress,
          sessionStatus: lastLocation.sessionStatus,
          batteryLevel: lastLocation.batteryLevel,
          networkType: lastLocation.networkType,
          timestamp: lastLocation.createdAt,
        } : null,
        history: history.map(h => ({
          latitude: h.coordinates.latitude,
          longitude: h.coordinates.longitude,
          sessionStatus: h.sessionStatus,
          updateType: h.updateType,
          timestamp: h.createdAt,
          batteryLevel: h.batteryLevel,
        })),
        todayStats: todayStats[0] || {
          totalUpdates: 0,
          avgBattery: null,
          onlineCount: 0,
          offlineCount: 0
        }
      }
    });
  } catch (error) {
    console.error('Error obteniendo ubicación del hijo:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener ubicación',
    });
  }
});

// ============================================
// POST /api/location/disconnect - Notificar desconexión a padres
// Este endpoint se llama cuando el estudiante se desconecta
// ============================================
router.post('/disconnect', auth, async (req, res) => {
  try {
    // Solo estudiantes pueden notificar su desconexión
    if (req.user.role !== 'estudiante') {
      return res.status(403).json({
        success: false,
        message: 'Solo estudiantes pueden usar este endpoint',
      });
    }

    const { latitude, longitude, reason = 'app_closed' } = req.body;

    // Guardar última ubicación con estado offline
    if (latitude && longitude) {
      await Location.create({
        user: req.user.id,
        coordinates: { latitude, longitude },
        updateType: 'logout',
        sessionStatus: 'offline',
        clientTimestamp: new Date(),
      });
    }

    // Buscar al estudiante para obtener su nombre
    const student = await Student.findById(req.user.id)
      .select('firstName lastName parent guardians');

    if (!student) {
      return res.json({ success: true, message: 'Desconexión registrada' });
    }

    // Obtener todos los padres/tutores vinculados
    const parentIds = [];
    if (student.parent) {
      parentIds.push(student.parent);
    }
    if (student.guardians && student.guardians.length > 0) {
      student.guardians.forEach(g => {
        if (g.parent) parentIds.push(g.parent);
        if (g.user) parentIds.push(g.user);
      });
    }

    // Crear notificaciones para cada padre
    const notifications = [];
    for (const parentId of parentIds) {
      notifications.push({
        recipient: parentId,
        title: '📍 Desconexión detectada',
        message: `${student.firstName} ${student.lastName} se ha desconectado`,
        type: 'location_alert',
        priority: 'high',
        data: {
          studentId: student._id,
          studentName: `${student.firstName} ${student.lastName}`,
          reason,
          lastLatitude: latitude,
          lastLongitude: longitude,
          timestamp: new Date(),
          action: 'open_child_location',
        },
        isRead: false,
      });
    }

    if (notifications.length > 0) {
      await Notification.insertMany(notifications);
    }

    // Enviar notificaciones push a los padres
    try {
      // Obtener tokens FCM de los padres
      const parentTokens = [];
      
      for (const parentId of parentIds) {
        // Buscar en Parent
        let parent = await Parent.findById(parentId);
        if (parent && parent.pushTokens) {
          parent.pushTokens
            .filter(t => t.isActive)
            .forEach(t => parentTokens.push(t.token));
        }
        
        // Buscar en User (por si es padre en colección users)
        const user = await User.findById(parentId);
        if (user && user.pushTokens) {
          user.pushTokens
            .filter(t => t.isActive)
            .forEach(t => parentTokens.push(t.token));
        }
      }

      if (parentTokens.length > 0) {
        await pushService.notifyParentOfDisconnection(
          parentTokens,
          `${student.firstName} ${student.lastName}`,
          { latitude, longitude }
        );
        console.log(`📱 Notificación push enviada a ${parentTokens.length} dispositivo(s)`);
      }
    } catch (pushError) {
      console.error('Error enviando push notification:', pushError);
      // No fallar la petición si falla el push
    }

    res.json({
      success: true,
      message: 'Desconexión registrada y padres notificados',
      notifiedParents: parentIds.length,
    });
  } catch (error) {
    console.error('Error en desconexión:', error);
    res.status(500).json({
      success: false,
      message: 'Error al procesar desconexión',
    });
  }
});

module.exports = router;
