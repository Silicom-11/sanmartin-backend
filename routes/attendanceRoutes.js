// Rutas de Asistencia - San Martín Digital
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { Attendance, Course, Student } = require('../models');
const { auth, authorize, isTeacherOrAdmin } = require('../middleware/auth');

// GET /api/attendance - Listar asistencia
router.get('/', auth, async (req, res) => {
  try {
    let query = {};
    
    if (req.query.courseId) {
      query.course = req.query.courseId;
    }
    if (req.query.studentId) {
      query.student = req.query.studentId;
    }
    if (req.query.date) {
      const date = new Date(req.query.date);
      query.date = {
        $gte: new Date(date.setHours(0, 0, 0, 0)),
        $lte: new Date(date.setHours(23, 59, 59, 999)),
      };
    }
    if (req.query.status) {
      query.status = req.query.status;
    }
    
    // Si es docente, solo sus cursos
    if (req.user.role === 'docente') {
      query.teacher = req.userId;
    }

    const attendance = await Attendance.find(query)
      .populate('student', 'firstName lastName enrollmentNumber')
      .populate('course', 'name code')
      .sort({ date: -1 });

    res.json({
      success: true,
      count: attendance.length,
      data: { attendance },
    });
  } catch (error) {
    console.error('Get attendance error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener asistencia',
    });
  }
});

// GET /api/attendance/course/:courseId/date/:date - Asistencia por curso y fecha
router.get('/course/:courseId/date/:date', auth, isTeacherOrAdmin, async (req, res) => {
  try {
    const { courseId, date } = req.params;
    const targetDate = new Date(date);

    const course = await Course.findById(courseId)
      .populate('students', 'firstName lastName enrollmentNumber photo');

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Curso no encontrado',
      });
    }

    // Obtener asistencia existente para esa fecha
    const existingAttendance = await Attendance.find({
      course: courseId,
      date: {
        $gte: new Date(targetDate.setHours(0, 0, 0, 0)),
        $lte: new Date(targetDate.setHours(23, 59, 59, 999)),
      },
    });

    // Crear mapa de asistencia
    const attendanceMap = {};
    existingAttendance.forEach(a => {
      attendanceMap[a.student.toString()] = a;
    });

    // Combinar estudiantes con su asistencia
    const studentsWithAttendance = course.students.map(student => ({
      student,
      attendance: attendanceMap[student._id.toString()] || null,
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
        date: req.params.date,
        students: studentsWithAttendance,
      },
    });
  } catch (error) {
    console.error('Get course attendance error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener asistencia del curso',
    });
  }
});

// POST /api/attendance - Registrar asistencia individual
router.post('/', auth, isTeacherOrAdmin, [
  body('studentId').notEmpty().withMessage('El estudiante es requerido'),
  body('courseId').notEmpty().withMessage('El curso es requerido'),
  body('date').isISO8601().withMessage('Fecha inválida'),
  body('status').isIn(['present', 'absent', 'late', 'justified']).withMessage('Estado inválido'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { studentId, courseId, date, status, arrivalTime, observations } = req.body;
    const attendanceDate = new Date(date);

    // Buscar si ya existe
    let attendance = await Attendance.findOne({
      student: studentId,
      course: courseId,
      date: {
        $gte: new Date(attendanceDate.setHours(0, 0, 0, 0)),
        $lte: new Date(attendanceDate.setHours(23, 59, 59, 999)),
      },
    });

    if (attendance) {
      // Actualizar
      attendance.status = status;
      attendance.arrivalTime = arrivalTime;
      attendance.observations = observations;
      await attendance.save();
    } else {
      // Crear
      attendance = await Attendance.create({
        student: studentId,
        course: courseId,
        teacher: req.userId,
        date: new Date(date),
        status,
        arrivalTime,
        observations,
      });
    }

    res.status(201).json({
      success: true,
      message: 'Asistencia registrada',
      data: { attendance },
    });
  } catch (error) {
    console.error('Save attendance error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al registrar asistencia',
      error: error.message,
    });
  }
});

// POST /api/attendance/bulk - Registrar asistencia masiva
router.post('/bulk', auth, isTeacherOrAdmin, async (req, res) => {
  try {
    const { courseId, date, students } = req.body;
    const attendanceDate = new Date(date);

    const results = [];
    const errors = [];

    for (const studentData of students) {
      try {
        const attendance = await Attendance.findOneAndUpdate(
          {
            student: studentData.studentId,
            course: courseId,
            date: {
              $gte: new Date(new Date(date).setHours(0, 0, 0, 0)),
              $lte: new Date(new Date(date).setHours(23, 59, 59, 999)),
            },
          },
          {
            $set: {
              status: studentData.status,
              arrivalTime: studentData.arrivalTime,
              observations: studentData.observations,
              teacher: req.userId,
              date: attendanceDate,
            },
          },
          { upsert: true, new: true }
        );
        results.push(attendance);
      } catch (err) {
        errors.push({
          studentId: studentData.studentId,
          error: err.message,
        });
      }
    }

    res.json({
      success: true,
      message: `${results.length} registros de asistencia guardados`,
      data: {
        saved: results.length,
        errors: errors.length,
        errorDetails: errors,
      },
    });
  } catch (error) {
    console.error('Bulk save attendance error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al guardar asistencia',
    });
  }
});

// GET /api/attendance/stats/:studentId - Estadísticas de asistencia
router.get('/stats/:studentId', auth, async (req, res) => {
  try {
    const { studentId } = req.params;
    const year = req.query.year || new Date().getFullYear();
    
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31);

    const stats = await Attendance.getStudentAttendanceStats(studentId, startDate, endDate);

    res.json({
      success: true,
      data: { stats },
    });
  } catch (error) {
    console.error('Get attendance stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener estadísticas',
    });
  }
});

module.exports = router;
