// Rutas de Docentes - San Martín Digital
// CRUD completo para gestión de profesores
const express = require('express');
const router = express.Router();
const { Teacher, Course } = require('../models');
const { auth } = require('../middleware/auth');

// ============================================
// GET /api/teachers - Obtener todos los docentes
// ============================================
router.get('/', auth, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      search, 
      specialty, 
      isActive,
      sortBy = 'lastName',
      sortOrder = 'asc'
    } = req.query;

    // Construir filtros
    const filter = {};
    
    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { dni: { $regex: search, $options: 'i' } },
        { employeeCode: { $regex: search, $options: 'i' } },
      ];
    }

    if (specialty) {
      filter.specialty = { $regex: specialty, $options: 'i' };
    }

    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }

    // Ordenamiento
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Paginación
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Ejecutar consulta
    const [teachers, total] = await Promise.all([
      Teacher.find(filter)
        .populate('courses', 'name code gradeLevel section')
        .select('-password')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit)),
      Teacher.countDocuments(filter),
    ]);

    // Estadísticas
    const stats = await Teacher.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: ['$isActive', 1, 0] } },
          withCourses: { $sum: { $cond: [{ $gt: [{ $size: { $ifNull: ['$courses', []] } }, 0] }, 1, 0] } },
        }
      }
    ]);

    res.json({
      success: true,
      data: teachers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
      stats: stats[0] || { total: 0, active: 0, withCourses: 0 },
    });
  } catch (error) {
    console.error('Error obteniendo docentes:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener docentes',
      error: error.message,
    });
  }
});

// ============================================
// GET /api/teachers/stats - Estadísticas
// ============================================
router.get('/stats', auth, async (req, res) => {
  try {
    const stats = await Teacher.aggregate([
      {
        $facet: {
          general: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                active: { $sum: { $cond: ['$isActive', 1, 0] } },
                inactive: { $sum: { $cond: ['$isActive', 0, 1] } },
              }
            }
          ],
          bySpecialty: [
            { $match: { isActive: true } },
            { $group: { _id: '$specialty', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 }
          ],
          byContractType: [
            { $match: { isActive: true } },
            { $group: { _id: '$contractType', count: { $sum: 1 } } },
          ],
          recentHires: [
            { $match: { isActive: true } },
            { $sort: { hireDate: -1 } },
            { $limit: 5 },
            { $project: { firstName: 1, lastName: 1, hireDate: 1, specialty: 1 } }
          ]
        }
      }
    ]);

    const result = stats[0];
    
    res.json({
      success: true,
      data: {
        general: result.general[0] || { total: 0, active: 0, inactive: 0 },
        bySpecialty: result.bySpecialty,
        byContractType: result.byContractType,
        recentHires: result.recentHires,
      }
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
// GET /api/teachers/:id - Obtener un docente
// ============================================
router.get('/:id', auth, async (req, res) => {
  try {
    const teacher = await Teacher.findById(req.params.id)
      .populate('courses', 'name code gradeLevel section students schedule')
      .populate('homerooms', 'name gradeLevel section')
      .select('-password');

    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: 'Docente no encontrado',
      });
    }

    res.json({
      success: true,
      data: teacher,
    });
  } catch (error) {
    console.error('Error obteniendo docente:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener docente',
    });
  }
});

// ============================================
// POST /api/teachers - Crear docente
// ============================================
router.post('/', auth, async (req, res) => {
  try {
    // Verificar que el usuario sea admin
    if (!['administrativo', 'director'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'No autorizado para crear docentes',
      });
    }

    const {
      firstName,
      lastName,
      dni,
      email,
      password,
      phone,
      address,
      birthDate,
      gender,
      specialty,
      secondarySpecialties,
      educationLevel,
      university,
      graduationYear,
      contractType,
      workSchedule,
      hireDate,
    } = req.body;

    // Verificar si ya existe
    const existingTeacher = await Teacher.findOne({
      $or: [{ email }, { dni }]
    });

    if (existingTeacher) {
      return res.status(400).json({
        success: false,
        message: existingTeacher.email === email 
          ? 'Ya existe un docente con este correo' 
          : 'Ya existe un docente con este DNI',
      });
    }

    // Crear docente
    const teacher = await Teacher.create({
      firstName,
      lastName,
      dni,
      email,
      password: password || 'SanMartin2026', // Password por defecto
      phone,
      address,
      birthDate,
      gender,
      specialty,
      secondarySpecialties,
      educationLevel,
      university,
      graduationYear,
      contractType,
      workSchedule,
      hireDate: hireDate || new Date(),
    });

    // No devolver password
    const teacherResponse = teacher.toObject();
    delete teacherResponse.password;

    res.status(201).json({
      success: true,
      message: 'Docente creado exitosamente',
      data: teacherResponse,
    });
  } catch (error) {
    console.error('Error creando docente:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear docente',
      error: error.message,
    });
  }
});

// ============================================
// PUT /api/teachers/:id - Actualizar docente
// ============================================
router.put('/:id', auth, async (req, res) => {
  try {
    // Verificar permisos
    if (!['administrativo', 'director'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'No autorizado para editar docentes',
      });
    }

    const { id } = req.params;
    const updateData = { ...req.body };
    
    // No permitir actualizar password directamente
    delete updateData.password;
    
    // Si se envía nuevo password, usar endpoint específico
    const teacher = await Teacher.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select('-password');

    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: 'Docente no encontrado',
      });
    }

    res.json({
      success: true,
      message: 'Docente actualizado exitosamente',
      data: teacher,
    });
  } catch (error) {
    console.error('Error actualizando docente:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar docente',
      error: error.message,
    });
  }
});

// ============================================
// DELETE /api/teachers/:id - Eliminar docente
// ============================================
router.delete('/:id', auth, async (req, res) => {
  try {
    // Verificar permisos
    if (!['administrativo', 'director'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'No autorizado para eliminar docentes',
      });
    }

    const { id } = req.params;
    const { permanent } = req.query;

    const teacher = await Teacher.findById(id);

    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: 'Docente no encontrado',
      });
    }

    // Verificar si tiene cursos asignados
    if (teacher.courses && teacher.courses.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'No se puede eliminar un docente con cursos asignados. Primero reasigne los cursos.',
      });
    }

    if (permanent === 'true') {
      // Eliminación permanente
      await Teacher.findByIdAndDelete(id);
      res.json({
        success: true,
        message: 'Docente eliminado permanentemente',
      });
    } else {
      // Soft delete - solo desactivar
      teacher.isActive = false;
      await teacher.save();
      res.json({
        success: true,
        message: 'Docente desactivado exitosamente',
        data: teacher,
      });
    }
  } catch (error) {
    console.error('Error eliminando docente:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar docente',
    });
  }
});

// ============================================
// POST /api/teachers/:id/reactivate - Reactivar
// ============================================
router.post('/:id/reactivate', auth, async (req, res) => {
  try {
    if (!['administrativo', 'director'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'No autorizado',
      });
    }

    const teacher = await Teacher.findByIdAndUpdate(
      req.params.id,
      { isActive: true },
      { new: true }
    ).select('-password');

    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: 'Docente no encontrado',
      });
    }

    res.json({
      success: true,
      message: 'Docente reactivado exitosamente',
      data: teacher,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al reactivar docente',
    });
  }
});

// ============================================
// PUT /api/teachers/:id/password - Cambiar contraseña
// ============================================
router.put('/:id/password', auth, async (req, res) => {
  try {
    if (!['administrativo', 'director'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'No autorizado',
      });
    }

    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'La contraseña debe tener al menos 6 caracteres',
      });
    }

    const teacher = await Teacher.findById(req.params.id);
    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: 'Docente no encontrado',
      });
    }

    teacher.password = newPassword;
    await teacher.save();

    res.json({
      success: true,
      message: 'Contraseña actualizada exitosamente',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al cambiar contraseña',
    });
  }
});

// ============================================
// POST /api/teachers/:id/courses - Asignar curso
// ============================================
router.post('/:id/courses', auth, async (req, res) => {
  try {
    if (!['administrativo', 'director'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'No autorizado',
      });
    }

    const { courseId } = req.body;
    const teacherId = req.params.id;

    // Actualizar el docente
    const teacher = await Teacher.findByIdAndUpdate(
      teacherId,
      { $addToSet: { courses: courseId } },
      { new: true }
    ).populate('courses', 'name code gradeLevel section');

    // Actualizar el curso para que apunte al docente
    await Course.findByIdAndUpdate(courseId, { teacher: teacherId });

    res.json({
      success: true,
      message: 'Curso asignado exitosamente',
      data: teacher,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al asignar curso',
    });
  }
});

// ============================================
// DELETE /api/teachers/:id/courses/:courseId - Remover curso
// ============================================
router.delete('/:id/courses/:courseId', auth, async (req, res) => {
  try {
    if (!['administrativo', 'director'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'No autorizado',
      });
    }

    const { id, courseId } = req.params;

    const teacher = await Teacher.findByIdAndUpdate(
      id,
      { $pull: { courses: courseId } },
      { new: true }
    ).populate('courses', 'name code gradeLevel section');

    res.json({
      success: true,
      message: 'Curso removido exitosamente',
      data: teacher,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al remover curso',
    });
  }
});

module.exports = router;
