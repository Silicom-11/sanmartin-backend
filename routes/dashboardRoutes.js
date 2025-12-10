// Rutas del Dashboard - San Martín Digital
const express = require('express');
const router = express.Router();
const { Student, Course, Grade, Attendance, Justification, User, Notification } = require('../models');
const { auth, authorize } = require('../middleware/auth');

// GET /api/dashboard/parent - Dashboard para padres
router.get('/parent', auth, authorize('padre'), async (req, res) => {
  try {
    const userId = req.userId;
    
    // Obtener estudiantes del padre
    const students = await Student.find({ parent: userId })
      .populate('courses', 'name code');

    // Estadísticas por estudiante
    const studentsData = await Promise.all(students.map(async (student) => {
      const year = new Date().getFullYear();
      const startDate = new Date(year, 0, 1);
      const endDate = new Date();

      // Última asistencia
      const lastAttendance = await Attendance.findOne({ student: student._id })
        .sort({ date: -1 });

      // Estadísticas de asistencia
      const attendanceStats = await Attendance.getStudentAttendanceStats(
        student._id,
        startDate,
        endDate
      );

      // Promedio general
      const grades = await Grade.find({
        student: student._id,
        academicYear: year,
        isPublished: true,
      });

      const avgFinal = grades.length > 0
        ? (grades.reduce((sum, g) => sum + g.averages.final, 0) / grades.length).toFixed(1)
        : '-';

      // Justificaciones pendientes
      const pendingJustifications = await Justification.countDocuments({
        student: student._id,
        status: 'pendiente',
      });

      return {
        student: {
          id: student._id,
          name: student.fullName,
          gradeLevel: student.gradeLevel,
          section: student.section,
          photo: student.photo,
        },
        averageGrade: avgFinal,
        attendanceRate: attendanceStats.attendanceRate,
        lastAttendance: lastAttendance ? {
          date: lastAttendance.date,
          status: lastAttendance.status,
        } : null,
        pendingJustifications,
        coursesCount: student.courses.length,
      };
    }));

    // Notificaciones no leídas
    const unreadNotifications = await Notification.countDocuments({
      recipient: userId,
      isRead: false,
    });

    // Últimas notificaciones
    const recentNotifications = await Notification.find({ recipient: userId })
      .sort({ createdAt: -1 })
      .limit(5);

    res.json({
      success: true,
      data: {
        students: studentsData,
        unreadNotifications,
        recentNotifications,
      },
    });
  } catch (error) {
    console.error('Parent dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener dashboard',
    });
  }
});

// GET /api/dashboard/teacher - Dashboard para docentes
router.get('/teacher', auth, authorize('docente'), async (req, res) => {
  try {
    const userId = req.userId;
    
    // Cursos del docente
    const courses = await Course.find({ teacher: userId, isActive: true })
      .populate('students', 'firstName lastName');

    // Estadísticas por curso
    const coursesData = courses.map(course => ({
      id: course._id,
      name: course.name,
      code: course.code,
      gradeLevel: course.gradeLevel,
      section: course.section,
      studentCount: course.students.length,
      schedule: course.schedule,
    }));

    // Total de estudiantes
    const totalStudents = courses.reduce((sum, c) => sum + c.students.length, 0);

    // Asistencias pendientes de hoy
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayAttendance = await Attendance.find({
      teacher: userId,
      date: { $gte: today, $lt: tomorrow },
    });

    const coursesWithAttendance = [...new Set(todayAttendance.map(a => a.course.toString()))];
    const pendingAttendance = courses.length - coursesWithAttendance.length;

    // Calificaciones pendientes de publicar
    const pendingGrades = await Grade.countDocuments({
      teacher: userId,
      isPublished: false,
    });

    // Justificaciones por revisar
    const pendingJustifications = await Justification.countDocuments({
      status: 'pendiente',
    });

    // Notificaciones
    const unreadNotifications = await Notification.countDocuments({
      recipient: userId,
      isRead: false,
    });

    res.json({
      success: true,
      data: {
        courses: coursesData,
        stats: {
          totalCourses: courses.length,
          totalStudents,
          pendingAttendance,
          pendingGrades,
          pendingJustifications,
        },
        unreadNotifications,
      },
    });
  } catch (error) {
    console.error('Teacher dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener dashboard',
    });
  }
});

// GET /api/dashboard/admin - Dashboard para administración
router.get('/admin', auth, authorize('administrativo'), async (req, res) => {
  try {
    // Estadísticas generales
    const [
      totalStudents,
      activeStudents,
      totalTeachers,
      totalParents,
      totalCourses,
      pendingJustifications,
    ] = await Promise.all([
      Student.countDocuments(),
      Student.countDocuments({ isActive: true }),
      User.countDocuments({ role: 'docente', isActive: true }),
      User.countDocuments({ role: 'padre', isActive: true }),
      Course.countDocuments({ isActive: true }),
      Justification.countDocuments({ status: 'pendiente' }),
    ]);

    // Estudiantes por grado
    const studentsByGrade = await Student.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$gradeLevel', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);

    // Asistencia de hoy
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayStats = await Attendance.aggregate([
      { $match: { date: { $gte: today, $lt: tomorrow } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    const attendanceToday = {
      present: 0,
      absent: 0,
      late: 0,
      justified: 0,
    };
    todayStats.forEach(s => {
      attendanceToday[s._id] = s.count;
    });

    // Últimos registros
    const recentStudents = await Student.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('firstName lastName gradeLevel createdAt');

    res.json({
      success: true,
      data: {
        stats: {
          totalStudents,
          activeStudents,
          totalTeachers,
          totalParents,
          totalCourses,
          pendingJustifications,
        },
        studentsByGrade,
        attendanceToday,
        recentStudents,
      },
    });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener dashboard',
    });
  }
});

// GET /api/dashboard/student - Dashboard para estudiantes
router.get('/student', auth, authorize('estudiante'), async (req, res) => {
  try {
    // Buscar estudiante asociado al usuario
    const student = await Student.findOne({ 
      // En un sistema real, habría una relación user-student
      // Por ahora, asumimos que el estudiante se busca por email
    }).populate('courses', 'name code schedule');

    // Datos de ejemplo
    const data = {
      upcomingClasses: [],
      recentGrades: [],
      attendanceRate: 0,
      pendingTasks: 0,
      unreadMessages: 0,
    };

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Student dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener dashboard',
    });
  }
});

module.exports = router;
