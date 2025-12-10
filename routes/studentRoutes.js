// Rutas de Estudiantes - San Martín Digital
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { Student, User } = require('../models');
const { auth, authorize, isParentOf } = require('../middleware/auth');

// GET /api/students - Listar estudiantes
router.get('/', auth, async (req, res) => {
  try {
    let query = {};
    
    // Si es padre, solo ver sus estudiantes
    if (req.user.role === 'padre') {
      query._id = { $in: req.user.students };
    }
    
    // Filtros opcionales
    if (req.query.gradeLevel) {
      query.gradeLevel = req.query.gradeLevel;
    }
    if (req.query.section) {
      query.section = req.query.section;
    }
    if (req.query.search) {
      query.$or = [
        { firstName: { $regex: req.query.search, $options: 'i' } },
        { lastName: { $regex: req.query.search, $options: 'i' } },
        { dni: { $regex: req.query.search, $options: 'i' } },
      ];
    }

    const students = await Student.find(query)
      .populate('parent', 'firstName lastName email phone')
      .sort({ lastName: 1, firstName: 1 });

    res.json({
      success: true,
      count: students.length,
      data: { students },
    });
  } catch (error) {
    console.error('Get students error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener estudiantes',
    });
  }
});

// GET /api/students/:id - Obtener un estudiante
router.get('/:id', auth, isParentOf, async (req, res) => {
  try {
    const student = await Student.findById(req.params.id)
      .populate('parent', 'firstName lastName email phone')
      .populate('courses', 'name code teacher');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Estudiante no encontrado',
      });
    }

    res.json({
      success: true,
      data: { student },
    });
  } catch (error) {
    console.error('Get student error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener estudiante',
    });
  }
});

// POST /api/students - Registrar estudiante
router.post('/', auth, authorize('administrativo', 'padre'), [
  body('firstName').notEmpty().withMessage('El nombre es requerido'),
  body('lastName').notEmpty().withMessage('El apellido es requerido'),
  body('dni').notEmpty().withMessage('El DNI es requerido'),
  body('birthDate').isISO8601().withMessage('Fecha de nacimiento inválida'),
  body('gender').isIn(['Masculino', 'Femenino']).withMessage('Género inválido'),
  body('gradeLevel').notEmpty().withMessage('El grado es requerido'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    // Verificar DNI único
    const existingStudent = await Student.findOne({ dni: req.body.dni });
    if (existingStudent) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe un estudiante con ese DNI',
      });
    }

    // Si es padre, asociar automáticamente
    const parentId = req.user.role === 'padre' ? req.userId : req.body.parentId;

    const student = await Student.create({
      ...req.body,
      parent: parentId,
    });

    // Agregar estudiante a la lista del padre
    await User.findByIdAndUpdate(parentId, {
      $push: { students: student._id },
    });

    res.status(201).json({
      success: true,
      message: 'Estudiante registrado exitosamente',
      data: { student },
    });
  } catch (error) {
    console.error('Create student error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al registrar estudiante',
      error: error.message,
    });
  }
});

// PUT /api/students/:id - Actualizar estudiante
router.put('/:id', auth, authorize('administrativo'), async (req, res) => {
  try {
    const student = await Student.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Estudiante no encontrado',
      });
    }

    res.json({
      success: true,
      message: 'Estudiante actualizado exitosamente',
      data: { student },
    });
  } catch (error) {
    console.error('Update student error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar estudiante',
    });
  }
});

// DELETE /api/students/:id - Eliminar/desactivar estudiante
router.delete('/:id', auth, authorize('administrativo'), async (req, res) => {
  try {
    const student = await Student.findByIdAndUpdate(
      req.params.id,
      { isActive: false, status: 'retirado' },
      { new: true }
    );

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Estudiante no encontrado',
      });
    }

    res.json({
      success: true,
      message: 'Estudiante desactivado exitosamente',
    });
  } catch (error) {
    console.error('Delete student error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar estudiante',
    });
  }
});

// GET /api/students/:id/grades - Obtener calificaciones del estudiante
router.get('/:id/grades', auth, isParentOf, async (req, res) => {
  try {
    const { Grade } = require('../models');
    
    const grades = await Grade.find({
      student: req.params.id,
      ...(req.query.period && { period: req.query.period }),
      ...(req.query.year && { academicYear: parseInt(req.query.year) }),
    })
    .populate('course', 'name code')
    .populate('teacher', 'firstName lastName')
    .sort({ 'course.name': 1 });

    res.json({
      success: true,
      data: { grades },
    });
  } catch (error) {
    console.error('Get student grades error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener calificaciones',
    });
  }
});

// GET /api/students/:id/attendance - Obtener asistencia del estudiante
router.get('/:id/attendance', auth, isParentOf, async (req, res) => {
  try {
    const { Attendance } = require('../models');
    
    const startDate = req.query.startDate 
      ? new Date(req.query.startDate) 
      : new Date(new Date().getFullYear(), 0, 1);
    const endDate = req.query.endDate 
      ? new Date(req.query.endDate) 
      : new Date();

    const attendance = await Attendance.find({
      student: req.params.id,
      date: { $gte: startDate, $lte: endDate },
    })
    .populate('course', 'name code')
    .sort({ date: -1 });

    // Estadísticas
    const stats = await Attendance.getStudentAttendanceStats(
      req.params.id,
      startDate,
      endDate
    );

    res.json({
      success: true,
      data: {
        attendance,
        stats,
      },
    });
  } catch (error) {
    console.error('Get student attendance error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener asistencia',
    });
  }
});

module.exports = router;
