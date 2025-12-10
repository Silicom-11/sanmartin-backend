// Rutas de Calificaciones - San Martín Digital
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { Grade, Course, Student } = require('../models');
const { auth, authorize, isTeacherOrAdmin } = require('../middleware/auth');

// GET /api/grades - Listar calificaciones
router.get('/', auth, async (req, res) => {
  try {
    let query = {};
    
    // Filtros
    if (req.query.courseId) {
      query.course = req.query.courseId;
    }
    if (req.query.studentId) {
      query.student = req.query.studentId;
    }
    if (req.query.period) {
      query.period = req.query.period;
    }
    if (req.query.year) {
      query.academicYear = parseInt(req.query.year);
    }
    
    // Si es docente, solo sus cursos
    if (req.user.role === 'docente') {
      query.teacher = req.userId;
    }

    const grades = await Grade.find(query)
      .populate('student', 'firstName lastName enrollmentNumber')
      .populate('course', 'name code gradeLevel section')
      .populate('teacher', 'firstName lastName')
      .sort({ 'student.lastName': 1 });

    res.json({
      success: true,
      count: grades.length,
      data: { grades },
    });
  } catch (error) {
    console.error('Get grades error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener calificaciones',
    });
  }
});

// GET /api/grades/course/:courseId - Calificaciones por curso
router.get('/course/:courseId', auth, isTeacherOrAdmin, async (req, res) => {
  try {
    const { courseId } = req.params;
    const period = req.query.period || 'Primer Trimestre';
    const year = req.query.year || new Date().getFullYear();

    const course = await Course.findById(courseId)
      .populate('students', 'firstName lastName enrollmentNumber');

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Curso no encontrado',
      });
    }

    // Obtener calificaciones existentes
    const grades = await Grade.find({
      course: courseId,
      period,
      academicYear: year,
    }).populate('student', 'firstName lastName');

    // Crear mapa de calificaciones por estudiante
    const gradesMap = {};
    grades.forEach(g => {
      gradesMap[g.student._id.toString()] = g;
    });

    // Combinar estudiantes con sus calificaciones
    const studentsWithGrades = course.students.map(student => ({
      student,
      grades: gradesMap[student._id.toString()] || null,
    }));

    res.json({
      success: true,
      data: {
        course: {
          id: course._id,
          name: course.name,
          gradeLevel: course.gradeLevel,
          section: course.section,
        },
        period,
        academicYear: year,
        students: studentsWithGrades,
      },
    });
  } catch (error) {
    console.error('Get course grades error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener calificaciones del curso',
    });
  }
});

// POST /api/grades - Crear/actualizar calificaciones
router.post('/', auth, isTeacherOrAdmin, [
  body('studentId').notEmpty().withMessage('El estudiante es requerido'),
  body('courseId').notEmpty().withMessage('El curso es requerido'),
  body('period').notEmpty().withMessage('El período es requerido'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { studentId, courseId, period, evaluations, academicYear } = req.body;
    const year = academicYear || new Date().getFullYear();

    // Buscar si ya existe
    let grade = await Grade.findOne({
      student: studentId,
      course: courseId,
      period,
      academicYear: year,
    });

    if (grade) {
      // Actualizar evaluaciones existentes
      if (evaluations) {
        grade.evaluations = evaluations;
      }
      await grade.save();
    } else {
      // Crear nuevo registro
      grade = await Grade.create({
        student: studentId,
        course: courseId,
        teacher: req.userId,
        period,
        academicYear: year,
        evaluations: evaluations || [],
      });
    }

    await grade.populate([
      { path: 'student', select: 'firstName lastName' },
      { path: 'course', select: 'name code' },
    ]);

    res.status(201).json({
      success: true,
      message: 'Calificaciones guardadas exitosamente',
      data: { grade },
    });
  } catch (error) {
    console.error('Save grades error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al guardar calificaciones',
      error: error.message,
    });
  }
});

// POST /api/grades/bulk - Guardar calificaciones masivas
router.post('/bulk', auth, isTeacherOrAdmin, async (req, res) => {
  try {
    const { courseId, period, academicYear, students } = req.body;
    const year = academicYear || new Date().getFullYear();

    const results = [];
    const errors = [];

    for (const studentData of students) {
      try {
        let grade = await Grade.findOneAndUpdate(
          {
            student: studentData.studentId,
            course: courseId,
            period,
            academicYear: year,
          },
          {
            $set: {
              evaluations: studentData.evaluations,
              teacher: req.userId,
            },
          },
          { upsert: true, new: true }
        );
        results.push(grade);
      } catch (err) {
        errors.push({
          studentId: studentData.studentId,
          error: err.message,
        });
      }
    }

    res.json({
      success: true,
      message: `${results.length} calificaciones guardadas`,
      data: {
        saved: results.length,
        errors: errors.length,
        errorDetails: errors,
      },
    });
  } catch (error) {
    console.error('Bulk save grades error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al guardar calificaciones',
    });
  }
});

// PUT /api/grades/:id/publish - Publicar calificaciones
router.put('/:id/publish', auth, isTeacherOrAdmin, async (req, res) => {
  try {
    const grade = await Grade.findByIdAndUpdate(
      req.params.id,
      {
        isPublished: true,
        publishedAt: new Date(),
        status: 'publicado',
      },
      { new: true }
    );

    if (!grade) {
      return res.status(404).json({
        success: false,
        message: 'Calificación no encontrada',
      });
    }

    // TODO: Enviar notificación al padre

    res.json({
      success: true,
      message: 'Calificaciones publicadas',
      data: { grade },
    });
  } catch (error) {
    console.error('Publish grades error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al publicar calificaciones',
    });
  }
});

// GET /api/grades/download/:studentId - Descargar boleta PDF
router.get('/download/:studentId', auth, async (req, res) => {
  try {
    // TODO: Implementar generación de PDF
    res.json({
      success: true,
      message: 'Funcionalidad de descarga en desarrollo',
      data: {
        downloadUrl: null,
      },
    });
  } catch (error) {
    console.error('Download grades error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al generar boleta',
    });
  }
});

module.exports = router;
