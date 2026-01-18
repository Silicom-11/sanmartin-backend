// Rutas de Usuarios - San Martín Digital
const express = require('express');
const router = express.Router();
const { User, CourseSection, AcademicYear } = require('../models');
const { auth, authorize } = require('../middleware/auth');

// GET /api/users - Listar usuarios (filtrable por rol)
router.get('/', auth, authorize('administrativo'), async (req, res) => {
  try {
    const { role, search, isActive, page = 1, limit = 50 } = req.query;
    
    const filter = {};
    if (role) filter.role = role;
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    
    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { dni: { $regex: search, $options: 'i' } },
      ];
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const users = await User.find(filter)
      .select('-password -passwordResetToken -passwordResetExpires')
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ lastName: 1, firstName: 1 });
    
    // Para docentes, agregar conteo de cursos asignados
    let enrichedUsers = users;
    if (role === 'docente') {
      const currentYear = await AcademicYear.findOne({ isCurrent: true });
      
      enrichedUsers = await Promise.all(users.map(async (user) => {
        const coursesCount = await CourseSection.countDocuments({
          teacher: user._id,
          academicYear: currentYear?._id,
          isActive: true,
        });
        
        return {
          ...user.toObject(),
          assignedCourses: coursesCount,
        };
      }));
    }
    
    const total = await User.countDocuments(filter);
    
    res.json({
      success: true,
      data: enrichedUsers,
      count: enrichedUsers.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    console.error('Error obteniendo usuarios:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener usuarios',
    });
  }
});

// GET /api/users/stats - Estadísticas de usuarios
router.get('/stats', auth, authorize('administrativo'), async (req, res) => {
  try {
    const currentYear = await AcademicYear.findOne({ isCurrent: true });
    
    // Conteos por rol
    const [totalTeachers, activeTeachers, totalParents, totalStudents] = await Promise.all([
      User.countDocuments({ role: 'docente' }),
      User.countDocuments({ role: 'docente', isActive: true }),
      User.countDocuments({ role: 'padre' }),
      User.countDocuments({ role: 'estudiante' }),
    ]);
    
    // Docentes con cursos asignados
    const teachersWithCourses = await CourseSection.distinct('teacher', {
      academicYear: currentYear?._id,
      isActive: true,
    });
    
    // Promedio de cursos por docente
    const coursesPerTeacher = await CourseSection.aggregate([
      { $match: { academicYear: currentYear?._id, isActive: true } },
      { $group: { _id: '$teacher', count: { $sum: 1 } } },
      { $group: { _id: null, avg: { $avg: '$count' } } },
    ]);
    
    res.json({
      success: true,
      data: {
        teachers: {
          total: totalTeachers,
          active: activeTeachers,
          withCourses: teachersWithCourses.length,
          avgCourses: coursesPerTeacher[0]?.avg?.toFixed(1) || 0,
        },
        parents: { total: totalParents },
        students: { total: totalStudents },
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

// GET /api/users/:id - Obtener usuario específico
router.get('/:id', auth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password -passwordResetToken -passwordResetExpires')
      .populate('children', 'firstName lastName gradeLevel');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado',
      });
    }
    
    // Si es docente, incluir cursos
    let userData = user.toObject();
    if (user.role === 'docente') {
      const currentYear = await AcademicYear.findOne({ isCurrent: true });
      const courses = await CourseSection.find({
        teacher: user._id,
        academicYear: currentYear?._id,
        isActive: true,
      })
        .populate('subject', 'name code')
        .populate({
          path: 'classroom',
          select: 'section',
          populate: { path: 'gradeLevel', select: 'name shortName' },
        });
      
      userData.courses = courses;
      userData.assignedCourses = courses.length;
    }
    
    res.json({
      success: true,
      data: userData,
    });
  } catch (error) {
    console.error('Error obteniendo usuario:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener usuario',
    });
  }
});

// POST /api/users - Crear usuario (solo admin)
router.post('/', auth, authorize('administrativo'), async (req, res) => {
  try {
    const { email, password, firstName, lastName, role, phone, dni, specialty } = req.body;
    
    // Verificar email único
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'El correo ya está registrado',
      });
    }
    
    const user = await User.create({
      email,
      password: password || 'password123', // Contraseña temporal
      firstName,
      lastName,
      role,
      phone,
      dni,
      specialty,
    });
    
    res.status(201).json({
      success: true,
      message: 'Usuario creado exitosamente',
      data: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Error creando usuario:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear usuario',
    });
  }
});

// PUT /api/users/:id - Actualizar usuario
router.put('/:id', auth, authorize('administrativo'), async (req, res) => {
  try {
    const allowedUpdates = ['firstName', 'lastName', 'phone', 'dni', 'specialty', 'isActive'];
    const updates = {};
    
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });
    
    const user = await User.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    ).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado',
      });
    }
    
    res.json({
      success: true,
      message: 'Usuario actualizado exitosamente',
      data: user,
    });
  } catch (error) {
    console.error('Error actualizando usuario:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar usuario',
    });
  }
});

// DELETE /api/users/:id - Desactivar usuario
router.delete('/:id', auth, authorize('administrativo'), async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado',
      });
    }
    
    res.json({
      success: true,
      message: 'Usuario desactivado exitosamente',
    });
  } catch (error) {
    console.error('Error desactivando usuario:', error);
    res.status(500).json({
      success: false,
      message: 'Error al desactivar usuario',
    });
  }
});

module.exports = router;
