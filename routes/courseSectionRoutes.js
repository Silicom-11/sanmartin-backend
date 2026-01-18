// Rutas de Cursos-Sección (CourseSections) - San Martín Digital
const express = require('express');
const router = express.Router();
const { auth, authorize } = require('../middleware/auth');
const { CourseSection, Subject, Classroom, AcademicYear, Enrollment, Grade } = require('../models');

// GET /api/course-sections - Listar cursos-sección
router.get('/', auth, async (req, res) => {
  try {
    const { academicYear, classroom, teacher, subject } = req.query;
    
    // Si no se especifica año, usar el actual
    let yearId = academicYear;
    if (!yearId) {
      const currentYear = await AcademicYear.findOne({ isCurrent: true });
      yearId = currentYear?._id;
    }
    
    const filter = { isActive: true };
    if (yearId) filter.academicYear = yearId;
    if (classroom) filter.classroom = classroom;
    if (teacher) filter.teacher = teacher;
    if (subject) filter.subject = subject;
    
    const courses = await CourseSection.find(filter)
      .populate('subject', 'name code area color icon hoursPerWeek')
      .populate({
        path: 'classroom',
        select: 'section shift',
        populate: { path: 'gradeLevel', select: 'name shortName type' },
      })
      .populate('teacher', 'firstName lastName email avatar')
      .populate('academicYear', 'year name')
      .sort({ 'classroom.gradeLevel.order': 1, 'subject.order': 1 });
    
    res.json({
      success: true,
      data: courses,
      count: courses.length,
    });
  } catch (error) {
    console.error('Error obteniendo cursos-sección:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener cursos-sección',
    });
  }
});

// GET /api/course-sections/teacher/:teacherId - Obtener cursos de un docente
router.get('/teacher/:teacherId', auth, async (req, res) => {
  try {
    const currentYear = await AcademicYear.findOne({ isCurrent: true });
    
    const courses = await CourseSection.find({
      teacher: req.params.teacherId,
      academicYear: currentYear?._id,
      isActive: true,
    })
      .populate('subject', 'name code area color icon')
      .populate({
        path: 'classroom',
        select: 'section shift stats',
        populate: { path: 'gradeLevel', select: 'name shortName type' },
      })
      .sort({ 'subject.order': 1 });
    
    res.json({
      success: true,
      data: courses,
      count: courses.length,
    });
  } catch (error) {
    console.error('Error obteniendo cursos del docente:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener cursos del docente',
    });
  }
});

// GET /api/course-sections/:id - Obtener curso-sección específico
router.get('/:id', auth, async (req, res) => {
  try {
    const course = await CourseSection.findById(req.params.id)
      .populate('subject', 'name code area color icon hoursPerWeek description competencies')
      .populate({
        path: 'classroom',
        select: 'section shift capacity stats location',
        populate: { path: 'gradeLevel', select: 'name shortName type level' },
      })
      .populate('teacher', 'firstName lastName email avatar phone')
      .populate('academicYear', 'year name periods');
    
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Curso-sección no encontrado',
      });
    }
    
    res.json({
      success: true,
      data: course,
    });
  } catch (error) {
    console.error('Error obteniendo curso-sección:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener curso-sección',
    });
  }
});

// GET /api/course-sections/:id/students - Obtener estudiantes de un curso
router.get('/:id/students', auth, async (req, res) => {
  try {
    const course = await CourseSection.findById(req.params.id);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Curso-sección no encontrado',
      });
    }
    
    const students = await course.getStudents();
    
    // Obtener notas de cada estudiante para este curso
    const studentsWithGrades = await Promise.all(
      students.map(async (student) => {
        const grades = await Grade.find({
          student: student._id,
          courseSection: course._id,
        }).sort({ 'period': 1 });
        
        return {
          ...student.toObject(),
          grades,
        };
      })
    );
    
    res.json({
      success: true,
      data: studentsWithGrades,
      count: students.length,
    });
  } catch (error) {
    console.error('Error obteniendo estudiantes del curso:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener estudiantes del curso',
    });
  }
});

// POST /api/course-sections - Crear curso-sección
router.post('/', auth, authorize('administrativo', 'director'), async (req, res) => {
  try {
    const { subjectId, classroomId, teacherId, schedule, evaluationWeights } = req.body;
    
    // Si no se especifica año, usar el actual
    let academicYearId = req.body.academicYearId;
    if (!academicYearId) {
      const currentYear = await AcademicYear.findOne({ isCurrent: true });
      academicYearId = currentYear?._id;
    }
    
    // Verificar que no exista ya este curso-sección
    const existing = await CourseSection.findOne({
      subject: subjectId,
      classroom: classroomId,
      academicYear: academicYearId,
    });
    
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe este curso para esta aula en este año académico',
      });
    }
    
    // Obtener pesos de evaluación por defecto de la materia si no se proporcionan
    let weights = evaluationWeights;
    if (!weights) {
      const subject = await Subject.findById(subjectId);
      weights = subject?.defaultWeights;
    }
    
    const courseSection = await CourseSection.create({
      subject: subjectId,
      classroom: classroomId,
      teacher: teacherId,
      academicYear: academicYearId,
      schedule: schedule || [],
      evaluationWeights: weights,
    });
    
    // Poblar para respuesta
    await courseSection.populate([
      { path: 'subject', select: 'name code area color' },
      { path: 'classroom', populate: { path: 'gradeLevel', select: 'name shortName' } },
      { path: 'teacher', select: 'firstName lastName email' },
    ]);
    
    res.status(201).json({
      success: true,
      data: courseSection,
      message: 'Curso-sección creado correctamente',
    });
  } catch (error) {
    console.error('Error creando curso-sección:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear curso-sección',
    });
  }
});

// PUT /api/course-sections/:id - Actualizar curso-sección
router.put('/:id', auth, authorize('administrativo', 'director', 'docente'), async (req, res) => {
  try {
    const course = await CourseSection.findById(req.params.id);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Curso-sección no encontrado',
      });
    }
    
    // Si es docente, solo puede modificar su propio curso
    if (req.user.role === 'docente' && course.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para modificar este curso',
      });
    }
    
    // Campos que puede modificar el docente
    const allowedUpdates = ['schedule', 'evaluationWeights', 'periodEvaluations', 'resources'];
    
    // Si es admin, permitir más campos
    if (['administrativo', 'director'].includes(req.user.role)) {
      allowedUpdates.push('teacher', 'subject', 'classroom');
    }
    
    const updates = {};
    Object.keys(req.body).forEach(key => {
      if (allowedUpdates.includes(key)) {
        updates[key] = req.body[key];
      }
    });
    
    const updatedCourse = await CourseSection.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    ).populate([
      { path: 'subject', select: 'name code area' },
      { path: 'teacher', select: 'firstName lastName email' },
    ]);
    
    res.json({
      success: true,
      data: updatedCourse,
      message: 'Curso-sección actualizado correctamente',
    });
  } catch (error) {
    console.error('Error actualizando curso-sección:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar curso-sección',
    });
  }
});

// PUT /api/course-sections/:id/teacher - Cambiar docente
router.put('/:id/teacher', auth, authorize('administrativo', 'director'), async (req, res) => {
  try {
    const { teacherId } = req.body;
    
    const course = await CourseSection.findByIdAndUpdate(
      req.params.id,
      { teacher: teacherId },
      { new: true }
    ).populate('teacher', 'firstName lastName email');
    
    res.json({
      success: true,
      data: course,
      message: 'Docente asignado correctamente',
    });
  } catch (error) {
    console.error('Error cambiando docente:', error);
    res.status(500).json({
      success: false,
      message: 'Error al cambiar docente',
    });
  }
});

// DELETE /api/course-sections/:id - Eliminar curso-sección
router.delete('/:id', auth, authorize('administrativo', 'director'), async (req, res) => {
  try {
    // Verificar que no tenga notas registradas
    const gradesCount = await Grade.countDocuments({ courseSection: req.params.id });
    
    if (gradesCount > 0) {
      return res.status(400).json({
        success: false,
        message: `No se puede eliminar el curso porque tiene ${gradesCount} registros de notas`,
      });
    }
    
    await CourseSection.findByIdAndUpdate(req.params.id, { isActive: false });
    
    res.json({
      success: true,
      message: 'Curso-sección eliminado correctamente',
    });
  } catch (error) {
    console.error('Error eliminando curso-sección:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar curso-sección',
    });
  }
});

module.exports = router;
