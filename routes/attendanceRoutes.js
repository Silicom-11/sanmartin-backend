// Rutas de Asistencia - San Martín Digital
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { Attendance, Course, Student } = require('../models');
const { auth, authorize, isTeacherOrAdmin } = require('../middleware/auth');

// GET /api/attendance/stats - Estadísticas de asistencia de hoy
router.get('/stats', auth, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const targetDate = req.query.date ? new Date(req.query.date) : today;
    const endDate = new Date(targetDate);
    endDate.setDate(endDate.getDate() + 1);

    const [totalStudents, attendanceStats] = await Promise.all([
      Student.countDocuments({ isActive: true }),
      Attendance.aggregate([
        { $match: { date: { $gte: targetDate, $lt: endDate } } },
        { $group: {
          _id: '$status',
          count: { $sum: 1 }
        }}
      ])
    ]);

    const stats = { present: 0, absent: 0, late: 0, justified: 0 };
    attendanceStats.forEach(s => { stats[s._id] = s.count; });
    
    const totalRecorded = stats.present + stats.absent + stats.late + stats.justified;
    const attendanceRate = totalRecorded > 0 
      ? ((stats.present + stats.late + stats.justified) / totalRecorded * 100).toFixed(1) 
      : 0;

    res.json({
      success: true,
      data: {
        totalStudents,
        present: stats.present,
        absent: stats.absent,
        late: stats.late,
        justified: stats.justified,
        attendanceRate,
        date: targetDate.toISOString().split('T')[0]
      }
    });
  } catch (error) {
    console.error('Get attendance stats error:', error);
    res.status(500).json({ success: false, message: 'Error al obtener estadísticas' });
  }
});

// GET /api/attendance/by-course - Asistencia agrupada por curso
router.get('/by-course', auth, async (req, res) => {
  try {
    const targetDate = req.query.date ? new Date(req.query.date) : new Date();
    targetDate.setHours(0, 0, 0, 0);
    const endDate = new Date(targetDate);
    endDate.setDate(endDate.getDate() + 1);

    const courseAttendance = await Attendance.aggregate([
      { $match: { date: { $gte: targetDate, $lt: endDate } } },
      { $lookup: { from: 'courses', localField: 'course', foreignField: '_id', as: 'courseInfo' } },
      { $unwind: '$courseInfo' },
      { $lookup: { from: 'users', localField: 'teacher', foreignField: '_id', as: 'teacherInfo' } },
      { $unwind: { path: '$teacherInfo', preserveNullAndEmptyArrays: true } },
      { $group: {
        _id: '$course',
        courseName: { $first: '$courseInfo.name' },
        gradeLevel: { $first: '$courseInfo.gradeLevel' },
        section: { $first: '$courseInfo.section' },
        teacher: { $first: { $concat: [{ $ifNull: ['$teacherInfo.firstName', ''] }, ' ', { $ifNull: ['$teacherInfo.lastName', ''] }] } },
        date: { $first: '$date' },
        present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
        absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
        late: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } },
        justified: { $sum: { $cond: [{ $eq: ['$status', 'justified'] }, 1, 0] } },
        total: { $sum: 1 }
      }}
    ]);

    res.json({
      success: true,
      data: courseAttendance
    });
  } catch (error) {
    console.error('Get course attendance error:', error);
    res.status(500).json({ success: false, message: 'Error al obtener asistencia por curso' });
  }
});

// GET /api/attendance/alerts - Alertas de asistencia
router.get('/alerts', auth, async (req, res) => {
  try {
    // Estudiantes con 3+ faltas consecutivas en el último mes
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    const [frequentAbsences, frequentLates] = await Promise.all([
      Attendance.aggregate([
        { $match: { status: 'absent', date: { $gte: oneMonthAgo } } },
        { $group: { _id: '$student', absences: { $sum: 1 } } },
        { $match: { absences: { $gte: 3 } } },
        { $count: 'total' }
      ]),
      Attendance.aggregate([
        { $match: { status: 'late', date: { $gte: oneMonthAgo } } },
        { $group: { _id: '$student', lates: { $sum: 1 } } },
        { $match: { lates: { $gte: 5 } } },
        { $count: 'total' }
      ])
    ]);

    res.json({
      success: true,
      data: {
        studentsWithFrequentAbsences: frequentAbsences[0]?.total || 0,
        studentsWithFrequentLates: frequentLates[0]?.total || 0
      }
    });
  } catch (error) {
    console.error('Get attendance alerts error:', error);
    res.status(500).json({ success: false, message: 'Error al obtener alertas' });
  }
});

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
