// Rutas de Matrículas (Enrollments) - San Martín Digital
const express = require('express');
const router = express.Router();
const { auth, authorize } = require('../middleware/auth');
const { Enrollment, Student, Classroom, AcademicYear } = require('../models');

// GET /api/enrollments - Listar matrículas
router.get('/', auth, async (req, res) => {
  try {
    const { academicYear, classroom, status, page = 1, limit = 20 } = req.query;
    
    // Si no se especifica año, usar el actual
    let yearId = academicYear;
    if (!yearId) {
      const currentYear = await AcademicYear.findOne({ isCurrent: true });
      yearId = currentYear?._id;
    }
    
    const filter = {};
    if (yearId) filter.academicYear = yearId;
    if (classroom) filter.classroom = classroom;
    if (status) filter.status = status;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [enrollments, total] = await Promise.all([
      Enrollment.find(filter)
        .populate({
          path: 'student',
          select: 'firstName lastName dni gender photo birthDate',
        })
        .populate({
          path: 'classroom',
          select: 'section shift',
          populate: { path: 'gradeLevel', select: 'name shortName' },
        })
        .populate('academicYear', 'year name')
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ enrollmentDate: -1 }),
      Enrollment.countDocuments(filter),
    ]);
    
    res.json({
      success: true,
      data: enrollments,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Error obteniendo matrículas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener matrículas',
    });
  }
});

// GET /api/enrollments/student/:studentId - Obtener matrículas de un estudiante
router.get('/student/:studentId', auth, async (req, res) => {
  try {
    const enrollments = await Enrollment.find({
      student: req.params.studentId,
    })
      .populate({
        path: 'classroom',
        select: 'section shift',
        populate: { path: 'gradeLevel', select: 'name shortName type' },
      })
      .populate('academicYear', 'year name isCurrent')
      .sort({ 'academicYear.year': -1 });
    
    // Encontrar la matrícula actual
    const currentEnrollment = enrollments.find(e => 
      e.academicYear?.isCurrent && e.status === 'matriculado'
    );
    
    res.json({
      success: true,
      data: enrollments,
      current: currentEnrollment,
    });
  } catch (error) {
    console.error('Error obteniendo matrículas del estudiante:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener matrículas del estudiante',
    });
  }
});

// GET /api/enrollments/student/:studentId/current - Obtener matrícula actual
router.get('/student/:studentId/current', auth, async (req, res) => {
  try {
    const currentEnrollment = await Enrollment.getCurrentEnrollment(req.params.studentId);
    
    if (!currentEnrollment) {
      return res.status(404).json({
        success: false,
        message: 'El estudiante no tiene matrícula activa para el año actual',
      });
    }
    
    // Poblar datos adicionales
    await currentEnrollment.populate([
      {
        path: 'classroom',
        populate: { path: 'gradeLevel', select: 'name shortName type' },
      },
      { path: 'academicYear', select: 'year name' },
    ]);
    
    res.json({
      success: true,
      data: currentEnrollment,
    });
  } catch (error) {
    console.error('Error obteniendo matrícula actual:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener matrícula actual',
    });
  }
});

// POST /api/enrollments - Crear matrícula
router.post('/', auth, authorize('administrativo', 'director'), async (req, res) => {
  try {
    const { studentId, classroomId, academicYearId, enrollmentType = 'regular' } = req.body;
    
    // Verificar si ya existe matrícula para este estudiante en este año
    let yearId = academicYearId;
    if (!yearId) {
      const currentYear = await AcademicYear.findOne({ isCurrent: true });
      yearId = currentYear?._id;
    }
    
    const existingEnrollment = await Enrollment.findOne({
      student: studentId,
      academicYear: yearId,
    });
    
    if (existingEnrollment) {
      return res.status(400).json({
        success: false,
        message: 'El estudiante ya tiene una matrícula para este año académico',
        existingEnrollment,
      });
    }
    
    // Verificar capacidad del aula
    const classroom = await Classroom.findById(classroomId);
    if (!classroom) {
      return res.status(404).json({
        success: false,
        message: 'Aula no encontrada',
      });
    }
    
    const enrolledCount = await Enrollment.countDocuments({
      classroom: classroomId,
      status: 'matriculado',
    });
    
    if (enrolledCount >= classroom.capacity) {
      return res.status(400).json({
        success: false,
        message: `El aula ha alcanzado su capacidad máxima (${classroom.capacity} estudiantes)`,
      });
    }
    
    // Crear matrícula
    const enrollment = await Enrollment.create({
      student: studentId,
      classroom: classroomId,
      academicYear: yearId,
      enrollmentType,
      enrolledBy: req.user._id,
    });
    
    // Actualizar datos legacy del estudiante
    const gradeLevel = await classroom.populate('gradeLevel');
    await Student.findByIdAndUpdate(studentId, {
      gradeLevel: gradeLevel.gradeLevel?.name,
      section: classroom.section,
      shift: classroom.shift,
    });
    
    // Poblar para respuesta
    await enrollment.populate([
      { path: 'student', select: 'firstName lastName dni' },
      { 
        path: 'classroom', 
        populate: { path: 'gradeLevel', select: 'name shortName' },
      },
      { path: 'academicYear', select: 'year name' },
    ]);
    
    res.status(201).json({
      success: true,
      data: enrollment,
      message: 'Matrícula realizada correctamente',
    });
  } catch (error) {
    console.error('Error creando matrícula:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear matrícula',
    });
  }
});

// PUT /api/enrollments/:id/status - Cambiar estado de matrícula
router.put('/:id/status', auth, authorize('administrativo', 'director'), async (req, res) => {
  try {
    const { status, reason } = req.body;
    
    const enrollment = await Enrollment.findById(req.params.id);
    if (!enrollment) {
      return res.status(404).json({
        success: false,
        message: 'Matrícula no encontrada',
      });
    }
    
    enrollment.status = status;
    enrollment.statusReason = reason;
    enrollment.statusHistory.push({
      status,
      reason,
      changedBy: req.user._id,
    });
    
    await enrollment.save();
    
    res.json({
      success: true,
      data: enrollment,
      message: `Estado de matrícula actualizado a: ${status}`,
    });
  } catch (error) {
    console.error('Error actualizando estado de matrícula:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar estado de matrícula',
    });
  }
});

// PUT /api/enrollments/:id/transfer - Trasladar estudiante a otra aula
router.put('/:id/transfer', auth, authorize('administrativo', 'director'), async (req, res) => {
  try {
    const { newClassroomId, reason } = req.body;
    
    const enrollment = await Enrollment.findById(req.params.id);
    if (!enrollment) {
      return res.status(404).json({
        success: false,
        message: 'Matrícula no encontrada',
      });
    }
    
    // Guardar aula anterior
    enrollment.previousClassroom = enrollment.classroom;
    enrollment.classroom = newClassroomId;
    enrollment.statusReason = reason || 'Traslado de aula';
    enrollment.statusHistory.push({
      status: 'trasladado',
      reason: reason || 'Traslado de aula',
      changedBy: req.user._id,
    });
    
    await enrollment.save();
    
    // Actualizar datos del estudiante
    const newClassroom = await Classroom.findById(newClassroomId).populate('gradeLevel');
    await Student.findByIdAndUpdate(enrollment.student, {
      gradeLevel: newClassroom.gradeLevel?.name,
      section: newClassroom.section,
      shift: newClassroom.shift,
    });
    
    await enrollment.populate([
      { path: 'student', select: 'firstName lastName' },
      { path: 'classroom', populate: { path: 'gradeLevel' } },
      { path: 'previousClassroom', populate: { path: 'gradeLevel' } },
    ]);
    
    res.json({
      success: true,
      data: enrollment,
      message: 'Estudiante trasladado correctamente',
    });
  } catch (error) {
    console.error('Error trasladando estudiante:', error);
    res.status(500).json({
      success: false,
      message: 'Error al trasladar estudiante',
    });
  }
});

module.exports = router;
