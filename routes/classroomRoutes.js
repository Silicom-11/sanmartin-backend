// Rutas de Aulas (Classrooms) - San Martín Digital
const express = require('express');
const router = express.Router();
const { auth, authorize } = require('../middleware/auth');
const { Classroom, GradeLevel, AcademicYear, Enrollment, CourseSection } = require('../models');

// GET /api/classrooms - Listar aulas
router.get('/', auth, async (req, res) => {
  try {
    const { academicYear, gradeLevel, shift, section } = req.query;
    
    // Si no se especifica año, usar el actual
    let yearId = academicYear;
    if (!yearId) {
      const currentYear = await AcademicYear.findOne({ isCurrent: true });
      yearId = currentYear?._id;
    }
    
    const filter = { isActive: true };
    if (yearId) filter.academicYear = yearId;
    if (gradeLevel) filter.gradeLevel = gradeLevel;
    if (shift) filter.shift = shift;
    if (section) filter.section = section;
    
    const classrooms = await Classroom.find(filter)
      .populate('gradeLevel', 'name shortName type level order')
      .populate('tutor', 'firstName lastName email')
      .populate('academicYear', 'year name')
      .sort({ 'gradeLevel.order': 1, section: 1 });
    
    res.json({
      success: true,
      data: classrooms,
      count: classrooms.length,
    });
  } catch (error) {
    console.error('Error obteniendo aulas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener aulas',
    });
  }
});

// GET /api/classrooms/:id - Obtener aula específica
router.get('/:id', auth, async (req, res) => {
  try {
    const classroom = await Classroom.findById(req.params.id)
      .populate('gradeLevel', 'name shortName type level')
      .populate('tutor', 'firstName lastName email avatar')
      .populate('academicYear', 'year name');
    
    if (!classroom) {
      return res.status(404).json({
        success: false,
        message: 'Aula no encontrada',
      });
    }
    
    res.json({
      success: true,
      data: classroom,
    });
  } catch (error) {
    console.error('Error obteniendo aula:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener aula',
    });
  }
});

// GET /api/classrooms/:id/students - Obtener estudiantes de un aula
router.get('/:id/students', auth, async (req, res) => {
  try {
    const enrollments = await Enrollment.find({
      classroom: req.params.id,
      status: 'matriculado',
    })
      .populate({
        path: 'student',
        select: 'firstName lastName dni gender photo birthDate guardians',
        populate: {
          path: 'guardians.user',
          select: 'firstName lastName phone email',
        },
      })
      .sort({ 'student.lastName': 1 });
    
    const students = enrollments.map(e => ({
      ...e.student.toObject(),
      enrollmentNumber: e.enrollmentNumber,
      enrollmentDate: e.enrollmentDate,
    }));
    
    res.json({
      success: true,
      data: students,
      count: students.length,
    });
  } catch (error) {
    console.error('Error obteniendo estudiantes del aula:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener estudiantes del aula',
    });
  }
});

// GET /api/classrooms/:id/courses - Obtener cursos de un aula
router.get('/:id/courses', auth, async (req, res) => {
  try {
    const courses = await CourseSection.find({
      classroom: req.params.id,
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
    console.error('Error obteniendo cursos del aula:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener cursos del aula',
    });
  }
});

// POST /api/classrooms - Crear aula
router.post('/', auth, authorize('administrativo', 'director'), async (req, res) => {
  try {
    // Si no se especifica año, usar el actual
    if (!req.body.academicYear) {
      const currentYear = await AcademicYear.findOne({ isCurrent: true });
      req.body.academicYear = currentYear?._id;
    }
    
    const classroom = await Classroom.create(req.body);
    
    await classroom.populate([
      { path: 'gradeLevel', select: 'name shortName type' },
      { path: 'academicYear', select: 'year name' },
    ]);
    
    res.status(201).json({
      success: true,
      data: classroom,
      message: 'Aula creada correctamente',
    });
  } catch (error) {
    console.error('Error creando aula:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe un aula con ese grado, sección y turno para este año académico',
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error al crear aula',
    });
  }
});

// PUT /api/classrooms/:id - Actualizar aula
router.put('/:id', auth, authorize('administrativo', 'director'), async (req, res) => {
  try {
    const classroom = await Classroom.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate([
      { path: 'gradeLevel', select: 'name shortName type' },
      { path: 'tutor', select: 'firstName lastName email' },
    ]);
    
    if (!classroom) {
      return res.status(404).json({
        success: false,
        message: 'Aula no encontrada',
      });
    }
    
    res.json({
      success: true,
      data: classroom,
      message: 'Aula actualizada correctamente',
    });
  } catch (error) {
    console.error('Error actualizando aula:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar aula',
    });
  }
});

// PUT /api/classrooms/:id/tutor - Asignar tutor
router.put('/:id/tutor', auth, authorize('administrativo', 'director'), async (req, res) => {
  try {
    const { tutorId } = req.body;
    
    const classroom = await Classroom.findByIdAndUpdate(
      req.params.id,
      { tutor: tutorId },
      { new: true }
    ).populate('tutor', 'firstName lastName email');
    
    res.json({
      success: true,
      data: classroom,
      message: 'Tutor asignado correctamente',
    });
  } catch (error) {
    console.error('Error asignando tutor:', error);
    res.status(500).json({
      success: false,
      message: 'Error al asignar tutor',
    });
  }
});

// DELETE /api/classrooms/:id - Eliminar aula (soft delete)
router.delete('/:id', auth, authorize('administrativo', 'director'), async (req, res) => {
  try {
    // Verificar que no tenga estudiantes matriculados
    const enrollments = await Enrollment.countDocuments({
      classroom: req.params.id,
      status: 'matriculado',
    });
    
    if (enrollments > 0) {
      return res.status(400).json({
        success: false,
        message: `No se puede eliminar el aula porque tiene ${enrollments} estudiantes matriculados`,
      });
    }
    
    await Classroom.findByIdAndUpdate(req.params.id, { isActive: false });
    
    res.json({
      success: true,
      message: 'Aula eliminada correctamente',
    });
  } catch (error) {
    console.error('Error eliminando aula:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar aula',
    });
  }
});

module.exports = router;
