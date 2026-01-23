// Rutas para Padres de Familia - San Martín Digital
const express = require('express');
const router = express.Router();
const { auth, authorize } = require('../middleware/auth');
const { User, Parent, Student, Enrollment, CourseSection, Grade, Attendance, AcademicYear } = require('../models');

// GET /api/parent/children - Obtener hijos del padre logueado
router.get('/children', auth, authorize('padre'), async (req, res) => {
  try {
    // Determinar si es User antiguo o Parent nuevo
    let children = [];
    
    // Si es un Parent (nueva colección)
    if (req.user.children && Array.isArray(req.user.children)) {
      // Obtener los IDs de los estudiantes y hacer populate
      const parent = await Parent.findById(req.user._id)
        .populate({
          path: 'children.student',
          select: 'firstName lastName dni gender photo birthDate gradeLevel section',
        });
      
      if (parent && parent.children) {
        children = parent.children
          .filter(c => c.student) // Filtrar null values
          .map(c => c.student);
      }
    } 
    // Si es un User antiguo con método getChildren
    else if (req.user.getChildren) {
      children = await req.user.getChildren();
    }
    
    if (children.length === 0) {
      return res.json({
        success: true,
        data: [],
        count: 0,
        message: 'No hay hijos registrados',
      });
    }
    
    // Para cada hijo, obtener su matrícula actual y datos académicos básicos
    const childrenWithDetails = await Promise.all(
      children.map(async (child) => {
        const enrollment = await Enrollment.getCurrentEnrollment(child._id);
        
        let classroomInfo = null;
        if (enrollment) {
          await enrollment.populate({
            path: 'classroom',
            select: 'section shift',
            populate: { path: 'gradeLevel', select: 'name shortName type' },
          });
          
          classroomInfo = {
            grade: enrollment.classroom?.gradeLevel?.name,
            section: enrollment.classroom?.section,
            shift: enrollment.classroom?.shift,
          };
        }
        
        // Obtener resumen de asistencia del mes
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        
        const attendanceThisMonth = await Attendance.countDocuments({
          student: child._id,
          date: { $gte: startOfMonth },
          status: 'presente',
        });
        
        const absencesThisMonth = await Attendance.countDocuments({
          student: child._id,
          date: { $gte: startOfMonth },
          status: { $in: ['ausente', 'justificado'] },
        });
        
        return {
          _id: child._id,
          firstName: child.firstName,
          lastName: child.lastName,
          dni: child.dni,
          gender: child.gender,
          photo: child.photo,
          birthDate: child.birthDate,
          classroom: classroomInfo,
          attendanceSummary: {
            present: attendanceThisMonth,
            absent: absencesThisMonth,
          },
        };
      })
    );
    
    res.json({
      success: true,
      data: childrenWithDetails,
      count: childrenWithDetails.length,
    });
  } catch (error) {
    console.error('Error obteniendo hijos:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener la lista de hijos',
    });
  }
});

// GET /api/parent/children/:childId - Obtener datos completos de un hijo
router.get('/children/:childId', auth, authorize('padre'), async (req, res) => {
  try {
    // Verificar que el hijo pertenece al padre (compatible con User y Parent)
    let isParentOf = false;
    
    if (req.user.children && Array.isArray(req.user.children)) {
      isParentOf = req.user.children.some(c => {
        const studentId = c.student?._id || c.student;
        return studentId.toString() === req.params.childId;
      });
    }
    
    if (!isParentOf) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para ver los datos de este estudiante',
      });
    }
    
    // Buscar el estudiante
    const student = await Student.findById(req.params.childId);
    
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Estudiante no encontrado',
      });
    }
    
    // Obtener datos académicos
    const enrollment = await Enrollment.getCurrentEnrollment(student._id);
    let classroomInfo = null;
    
    if (enrollment) {
      await enrollment.populate({
        path: 'classroom',
        select: 'section shift',
        populate: { path: 'gradeLevel', select: 'name shortName type' },
      });
      
      classroomInfo = {
        grade: enrollment.classroom?.gradeLevel?.name,
        section: enrollment.classroom?.section,
        shift: enrollment.classroom?.shift,
      };
    }
    
    const childData = {
      _id: student._id,
      firstName: student.firstName,
      lastName: student.lastName,
      dni: student.dni,
      gender: student.gender,
      photo: student.photo,
      birthDate: student.birthDate,
      address: student.address,
      classroom: classroomInfo,
    };
    
    res.json({
      success: true,
      data: childData,
    });
  } catch (error) {
    console.error('Error obteniendo datos del hijo:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener datos del estudiante',
    });
  }
});

// GET /api/parent/children/:childId/courses - Obtener cursos de un hijo
router.get('/children/:childId/courses', auth, authorize('padre'), async (req, res) => {
  try {
    // Verificar permiso (compatible con User y Parent)
    let isParentOf = false;
    
    if (req.user.children && Array.isArray(req.user.children)) {
      isParentOf = req.user.children.some(c => {
        const studentId = c.student?._id || c.student;
        return studentId.toString() === req.params.childId;
      });
    }
    
    if (!isParentOf) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para ver los datos de este estudiante',
      });
    }
    
    // Obtener matrícula actual
    const enrollment = await Enrollment.getCurrentEnrollment(req.params.childId);
    
    if (!enrollment) {
      return res.status(404).json({
        success: false,
        message: 'El estudiante no tiene matrícula activa',
      });
    }
    
    // Obtener cursos del aula
    const courses = await CourseSection.find({
      classroom: enrollment.classroom,
      isActive: true,
    })
      .populate('subject', 'name code area color icon hoursPerWeek')
      .populate('teacher', 'firstName lastName email avatar')
      .sort({ 'subject.order': 1 });
    
    res.json({
      success: true,
      data: courses,
      count: courses.length,
    });
  } catch (error) {
    console.error('Error obteniendo cursos del hijo:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener cursos del estudiante',
    });
  }
});

// GET /api/parent/children/:childId/grades - Obtener notas de un hijo
router.get('/children/:childId/grades', auth, authorize('padre'), async (req, res) => {
  try {
    const { period, courseSection } = req.query;
    
    // Verificar permiso (compatible con User y Parent)
    let isParentOf = false;
    
    if (req.user.children && Array.isArray(req.user.children)) {
      isParentOf = req.user.children.some(c => {
        const studentId = c.student?._id || c.student;
        return studentId.toString() === req.params.childId;
      });
    }
    
    if (!isParentOf) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para ver las notas de este estudiante',
      });
    }
    
    // Obtener año académico actual
    const currentYear = await AcademicYear.findOne({ isCurrent: true });
    
    const filter = {
      student: req.params.childId,
      academicYear: currentYear?._id,
    };
    if (period) filter.period = parseInt(period);
    if (courseSection) filter.courseSection = courseSection;
    
    const grades = await Grade.find(filter)
      .populate({
        path: 'courseSection',
        select: 'subject teacher',
        populate: [
          { path: 'subject', select: 'name code area color' },
          { path: 'teacher', select: 'firstName lastName' },
        ],
      })
      .sort({ period: 1 });
    
    // Agrupar por curso
    const gradesByCourse = {};
    grades.forEach(grade => {
      const courseId = grade.courseSection?._id?.toString();
      if (courseId) {
        if (!gradesByCourse[courseId]) {
          gradesByCourse[courseId] = {
            course: {
              _id: grade.courseSection._id,
              name: grade.courseSection.subject?.name,
              code: grade.courseSection.subject?.code,
              area: grade.courseSection.subject?.area,
              color: grade.courseSection.subject?.color,
              teacher: grade.courseSection.teacher,
            },
            periods: [],
            finalGrade: null,
          };
        }
        gradesByCourse[courseId].periods.push({
          period: grade.period,
          grade: grade.finalGrade,
          components: grade.components,
          status: grade.status,
        });
      }
    });
    
    res.json({
      success: true,
      data: Object.values(gradesByCourse),
      academicYear: currentYear,
    });
  } catch (error) {
    console.error('Error obteniendo notas del hijo:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener notas del estudiante',
    });
  }
});

// GET /api/parent/children/:childId/attendance - Obtener asistencia de un hijo
router.get('/children/:childId/attendance', auth, authorize('padre'), async (req, res) => {
  try {
    const { month, year, courseSection } = req.query;
    
    // Verificar permiso (compatible con User y Parent)
    let isParentOf = false;
    
    if (req.user.children && Array.isArray(req.user.children)) {
      isParentOf = req.user.children.some(c => {
        const studentId = c.student?._id || c.student;
        return studentId.toString() === req.params.childId;
      });
    }
    
    if (!isParentOf) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para ver la asistencia de este estudiante',
      });
    }
    
    // Construir filtro de fechas
    const now = new Date();
    const targetMonth = month ? parseInt(month) - 1 : now.getMonth();
    const targetYear = year ? parseInt(year) : now.getFullYear();
    
    const startDate = new Date(targetYear, targetMonth, 1);
    const endDate = new Date(targetYear, targetMonth + 1, 0);
    
    const filter = {
      student: req.params.childId,
      date: { $gte: startDate, $lte: endDate },
    };
    if (courseSection) filter.courseSection = courseSection;
    
    const attendance = await Attendance.find(filter)
      .populate({
        path: 'courseSection',
        select: 'subject',
        populate: { path: 'subject', select: 'name code' },
      })
      .sort({ date: -1 });
    
    // Estadísticas del mes
    const stats = {
      total: attendance.length,
      present: attendance.filter(a => a.status === 'presente').length,
      absent: attendance.filter(a => a.status === 'ausente').length,
      late: attendance.filter(a => a.status === 'tardanza').length,
      justified: attendance.filter(a => a.status === 'justificado').length,
    };
    stats.attendanceRate = stats.total > 0 
      ? Math.round(((stats.present + stats.justified) / stats.total) * 100) 
      : 100;
    
    res.json({
      success: true,
      data: attendance,
      stats,
      period: {
        month: targetMonth + 1,
        year: targetYear,
      },
    });
  } catch (error) {
    console.error('Error obteniendo asistencia del hijo:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener asistencia del estudiante',
    });
  }
});

// GET /api/parent/children/:childId/schedule - Obtener horario de un hijo
router.get('/children/:childId/schedule', auth, authorize('padre'), async (req, res) => {
  try {
    // Verificar permiso (compatible con User y Parent)
    let isParentOf = false;
    
    if (req.user.children && Array.isArray(req.user.children)) {
      isParentOf = req.user.children.some(c => {
        const studentId = c.student?._id || c.student;
        return studentId.toString() === req.params.childId;
      });
    }
    
    if (!isParentOf) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para ver el horario de este estudiante',
      });
    }
    
    // Obtener matrícula actual
    const enrollment = await Enrollment.getCurrentEnrollment(req.params.childId);
    
    if (!enrollment) {
      return res.status(404).json({
        success: false,
        message: 'El estudiante no tiene matrícula activa',
      });
    }
    
    // Obtener cursos con horarios
    const courses = await CourseSection.find({
      classroom: enrollment.classroom,
      isActive: true,
    })
      .populate('subject', 'name code color icon')
      .populate('teacher', 'firstName lastName')
      .select('subject teacher schedule');
    
    // Organizar por día de la semana
    const weekdays = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    const scheduleByDay = {};
    
    weekdays.forEach(day => {
      scheduleByDay[day] = [];
    });
    
    courses.forEach(course => {
      course.schedule?.forEach(slot => {
        if (scheduleByDay[slot.day]) {
          scheduleByDay[slot.day].push({
            courseId: course._id,
            subject: course.subject?.name,
            code: course.subject?.code,
            color: course.subject?.color,
            teacher: course.teacher 
              ? `${course.teacher.firstName} ${course.teacher.lastName}` 
              : null,
            startTime: slot.startTime,
            endTime: slot.endTime,
            room: slot.room,
          });
        }
      });
    });
    
    // Ordenar por hora de inicio
    Object.keys(scheduleByDay).forEach(day => {
      scheduleByDay[day].sort((a, b) => {
        const timeA = a.startTime.replace(':', '');
        const timeB = b.startTime.replace(':', '');
        return parseInt(timeA) - parseInt(timeB);
      });
    });
    
    res.json({
      success: true,
      data: scheduleByDay,
    });
  } catch (error) {
    console.error('Error obteniendo horario del hijo:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener horario del estudiante',
    });
  }
});

module.exports = router;
