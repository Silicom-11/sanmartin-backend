// Rutas de Ubicación - San Martín Digital
// API para tracking de ubicación de usuarios
const express = require('express');
const router = express.Router();
const Location = require('../models/Location');
const User = require('../models/User');
const { auth } = require('../middleware/auth');

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

module.exports = router;
