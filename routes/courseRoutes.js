// Rutas de Cursos - San Martín Digital
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { Course, User, Student } = require('../models');
const { auth, authorize, isTeacherOrAdmin } = require('../middleware/auth');

// GET /api/courses/stats - Estadísticas de cursos
router.get('/stats', auth, async (req, res) => {
  try {
    const totalCourses = await Course.countDocuments() || 0;
    const activeCourses = await Course.countDocuments({ isActive: true }) || 0;
    const totalStudents = await Student.countDocuments({ isActive: true }) || 0;
    
    let avgPerCourse = 0;
    try {
      const coursesWithStudents = await Course.aggregate([
        { $match: { isActive: true } },
        { $project: { studentsCount: { $size: { $ifNull: ['$students', []] } } } },
        { $group: { _id: null, totalStudentsInCourses: { $sum: '$studentsCount' }, avgStudentsPerCourse: { $avg: '$studentsCount' } } }
      ]);
      avgPerCourse = coursesWithStudents[0]?.avgStudentsPerCourse || 0;
    } catch (aggError) {
      console.log('Aggregation skipped:', aggError.message);
    }

    res.json({
      success: true,
      data: {
        totalCourses,
        activeCourses,
        totalStudents,
        avgStudentsPerCourse: Math.round(avgPerCourse)
      }
    });
  } catch (error) {
    console.error('Get course stats error:', error);
    res.status(500).json({ success: false, message: 'Error al obtener estadísticas', error: error.message });
  }
});

// GET /api/courses - Listar cursos
router.get('/', auth, async (req, res) => {
  try {
    let query = { isActive: true };
    
    // Si es docente, solo sus cursos
    if (req.user.role === 'docente') {
      query.teacher = req.userId;
    }
    
    // Filtros
    if (req.query.gradeLevel) {
      query.gradeLevel = req.query.gradeLevel;
    }
    if (req.query.section) {
      query.section = req.query.section;
    }
    if (req.query.year) {
      query.academicYear = parseInt(req.query.year);
    }

    const courses = await Course.find(query)
      .populate('teacher', 'firstName lastName email')
      .sort({ name: 1 });

    res.json({
      success: true,
      count: courses.length,
      data: { courses },
    });
  } catch (error) {
    console.error('Get courses error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener cursos',
    });
  }
});

// GET /api/courses/:id - Obtener un curso
router.get('/:id', auth, async (req, res) => {
  try {
    const course = await Course.findById(req.params.id)
      .populate('teacher', 'firstName lastName email')
      .populate('students', 'firstName lastName enrollmentNumber gradeLevel');

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Curso no encontrado',
      });
    }

    res.json({
      success: true,
      data: { course },
    });
  } catch (error) {
    console.error('Get course error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener curso',
    });
  }
});

// POST /api/courses - Crear curso
router.post('/', auth, authorize('administrativo'), [
  body('name').notEmpty().withMessage('El nombre es requerido'),
  body('code').notEmpty().withMessage('El código es requerido'),
  body('gradeLevel').notEmpty().withMessage('El grado es requerido'),
  body('teacherId').notEmpty().withMessage('El docente es requerido'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { name, code, description, gradeLevel, section, teacherId, schedule, evaluationWeights } = req.body;

    // Verificar código único
    const existingCourse = await Course.findOne({ code: code.toUpperCase() });
    if (existingCourse) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe un curso con ese código',
      });
    }

    // Verificar que el docente existe
    const teacher = await User.findOne({ _id: teacherId, role: 'docente' });
    if (!teacher) {
      return res.status(400).json({
        success: false,
        message: 'Docente no encontrado',
      });
    }

    const course = await Course.create({
      name,
      code: code.toUpperCase(),
      description,
      gradeLevel,
      section: section || 'A',
      teacher: teacherId,
      schedule,
      evaluationWeights,
    });

    // Agregar curso al docente
    await User.findByIdAndUpdate(teacherId, {
      $push: { courses: course._id },
    });

    await course.populate('teacher', 'firstName lastName');

    res.status(201).json({
      success: true,
      message: 'Curso creado exitosamente',
      data: { course },
    });
  } catch (error) {
    console.error('Create course error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear curso',
      error: error.message,
    });
  }
});

// PUT /api/courses/:id - Actualizar curso
router.put('/:id', auth, authorize('administrativo'), async (req, res) => {
  try {
    const course = await Course.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('teacher', 'firstName lastName');

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Curso no encontrado',
      });
    }

    res.json({
      success: true,
      message: 'Curso actualizado',
      data: { course },
    });
  } catch (error) {
    console.error('Update course error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar curso',
    });
  }
});

// POST /api/courses/:id/students - Agregar estudiantes al curso
router.post('/:id/students', auth, authorize('administrativo'), async (req, res) => {
  try {
    const { studentIds } = req.body;

    const course = await Course.findByIdAndUpdate(
      req.params.id,
      { $addToSet: { students: { $each: studentIds } } },
      { new: true }
    ).populate('students', 'firstName lastName');

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Curso no encontrado',
      });
    }

    // Agregar curso a cada estudiante
    await Student.updateMany(
      { _id: { $in: studentIds } },
      { $addToSet: { courses: course._id } }
    );

    res.json({
      success: true,
      message: 'Estudiantes agregados al curso',
      data: { course },
    });
  } catch (error) {
    console.error('Add students to course error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al agregar estudiantes',
    });
  }
});

// DELETE /api/courses/:id/students/:studentId - Remover estudiante del curso
router.delete('/:id/students/:studentId', auth, authorize('administrativo'), async (req, res) => {
  try {
    const course = await Course.findByIdAndUpdate(
      req.params.id,
      { $pull: { students: req.params.studentId } },
      { new: true }
    );

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Curso no encontrado',
      });
    }

    // Remover curso del estudiante
    await Student.findByIdAndUpdate(req.params.studentId, {
      $pull: { courses: course._id },
    });

    res.json({
      success: true,
      message: 'Estudiante removido del curso',
    });
  } catch (error) {
    console.error('Remove student from course error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al remover estudiante',
    });
  }
});

// DELETE /api/courses/:id - Desactivar curso
router.delete('/:id', auth, authorize('administrativo'), async (req, res) => {
  try {
    const course = await Course.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Curso no encontrado',
      });
    }

    res.json({
      success: true,
      message: 'Curso desactivado',
    });
  } catch (error) {
    console.error('Delete course error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar curso',
    });
  }
});

module.exports = router;
