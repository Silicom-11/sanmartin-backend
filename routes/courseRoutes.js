// Rutas de Cursos - San Martín Digital
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { Course, User, Student, Teacher } = require('../models');
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

// GET /api/courses/my-courses - Obtener cursos del docente autenticado
router.get('/my-courses', auth, authorize('docente'), async (req, res) => {
  try {
    // Teacher may be stored via User ID or Teacher ID
    // Also check if Teacher has a userId that matches
    let teacherIds = [req.userId];
    
    // If the logged-in user is from Teacher collection, check if they have a userId
    const teacherDoc = await Teacher.findById(req.userId).select('userId').lean();
    if (teacherDoc?.userId) {
      teacherIds.push(teacherDoc.userId);
    }
    // Also check if there's a Teacher record whose userId matches
    const teacherByUser = await Teacher.findOne({ userId: req.userId }).select('_id').lean();
    if (teacherByUser) {
      teacherIds.push(teacherByUser._id);
    }
    
    const courses = await Course.find({
      teacher: { $in: teacherIds },
      isActive: true,
    })
      .populate('students', 'firstName lastName enrollmentNumber')
      .sort({ name: 1 });

    res.json({
      success: true,
      count: courses.length,
      data: courses,
    });
  } catch (error) {
    console.error('Get my courses error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener mis cursos',
    });
  }
});

// GET /api/courses - Listar cursos
router.get('/', auth, async (req, res) => {
  try {
    let query = {};
    
    // Si es docente, solo sus cursos (check both User and Teacher IDs)
    if (req.user.role === 'docente') {
      let teacherIds = [req.userId];
      const teacherDoc = await Teacher.findById(req.userId).select('userId').lean();
      if (teacherDoc?.userId) teacherIds.push(teacherDoc.userId);
      const teacherByUser = await Teacher.findOne({ userId: req.userId }).select('_id').lean();
      if (teacherByUser) teacherIds.push(teacherByUser._id);
      query.teacher = { $in: teacherIds };
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
    // Por defecto mostrar solo activos, pero permitir ver todos
    if (req.query.showAll !== 'true') {
      query.isActive = true;
    }

    // Save raw teacher ObjectIds BEFORE populate (populate replaces with null if not found in ref collection)
    let coursesRaw = await Course.find(query).lean().sort({ gradeLevel: 1, name: 1 });
    
    // Populate teacher: check User collection first, then Teacher collection
    for (let i = 0; i < coursesRaw.length; i++) {
      const teacherId = coursesRaw[i].teacher;
      if (!teacherId) continue;
      
      // Try User collection first
      let teacherDoc = await User.findById(teacherId).select('firstName lastName email').lean();
      
      // If not in User, try Teacher collection
      if (!teacherDoc) {
        teacherDoc = await Teacher.findById(teacherId).select('firstName lastName email').lean();
      }
      
      // If still not found, try searching by userId in Teacher collection
      if (!teacherDoc) {
        teacherDoc = await Teacher.findOne({ userId: teacherId }).select('firstName lastName email').lean();
      }
      
      coursesRaw[i].teacher = teacherDoc || null;
    }
    
    const courses = coursesRaw;

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
    let courseRaw = await Course.findById(req.params.id).lean();

    if (!courseRaw) {
      return res.status(404).json({ success: false, message: 'Curso no encontrado' });
    }

    // Populate teacher: check User, then Teacher collection
    if (courseRaw.teacher) {
      let teacherDoc = await User.findById(courseRaw.teacher).select('firstName lastName email').lean();
      if (!teacherDoc) {
        teacherDoc = await Teacher.findById(courseRaw.teacher).select('firstName lastName email').lean();
      }
      if (!teacherDoc) {
        teacherDoc = await Teacher.findOne({ userId: courseRaw.teacher }).select('firstName lastName email').lean();
      }
      courseRaw.teacher = teacherDoc || null;
    }
    
    // Populate students
    if (courseRaw.students?.length > 0) {
      const Student = require('../models').Student;
      courseRaw.students = await Student.find({ _id: { $in: courseRaw.students } })
        .select('firstName lastName enrollmentNumber gradeLevel section').lean();
    }
    
    let result = courseRaw;

    res.json({ success: true, data: { course: result } });
  } catch (error) {
    console.error('Get course error:', error);
    res.status(500).json({ success: false, message: 'Error al obtener curso' });
  }
});

// POST /api/courses - Crear curso
router.post('/', auth, authorize('administrativo'), [
  body('name').notEmpty().withMessage('El nombre es requerido'),
  body('code').notEmpty().withMessage('El código es requerido'),
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

    const { name, code, description, gradeLevel, section, teacherId, schedule, evaluationWeights, studentIds } = req.body;

    // Verificar código único
    const existingCourse = await Course.findOne({ code: code.toUpperCase() });
    if (existingCourse) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe un curso con ese código',
      });
    }

    // Verificar que el docente existe (buscar en User Y Teacher)
    let teacherRef = null;
    if (teacherId) {
      let teacher = await User.findOne({ _id: teacherId, role: 'docente' });
      if (!teacher) {
        teacher = await Teacher.findById(teacherId);
      }
      if (!teacher) {
        return res.status(400).json({
          success: false,
          message: 'Docente no encontrado',
        });
      }
      teacherRef = teacherId;
    }

    // Verificar estudiantes si se proporcionan
    let validStudentIds = [];
    if (studentIds && Array.isArray(studentIds) && studentIds.length > 0) {
      const students = await Student.find({ _id: { $in: studentIds } });
      validStudentIds = students.map(s => s._id);
    }

    const course = await Course.create({
      name,
      code: code.toUpperCase(),
      description,
      gradeLevel,
      section: section || 'A',
      teacher: teacherRef,
      students: validStudentIds,
      schedule,
      evaluationWeights,
    });

    // Agregar curso al docente (buscar en ambas colecciones)
    if (teacherRef) {
      await User.findByIdAndUpdate(teacherRef, {
        $push: { courses: course._id },
      }).catch(() => {});
      await Teacher.findByIdAndUpdate(teacherRef, {
        $push: { courses: course._id },
      }).catch(() => {});
    }

    // Agregar curso a cada estudiante
    if (validStudentIds.length > 0) {
      await Student.updateMany(
        { _id: { $in: validStudentIds } },
        { $addToSet: { courses: course._id } }
      );
    }

    // Populate teacher from either collection
    let populatedCourse = course.toObject();
    if (teacherRef) {
      let teacherDoc = await User.findById(teacherRef).select('firstName lastName email').lean();
      if (!teacherDoc) {
        teacherDoc = await Teacher.findById(teacherRef).select('firstName lastName email').lean();
      }
      populatedCourse.teacher = teacherDoc;
    }

    res.status(201).json({
      success: true,
      message: 'Curso creado exitosamente',
      data: { course: populatedCourse },
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
    const updateData = { ...req.body };

    // Si se envía teacherId, convertirlo a teacher y validar
    if (updateData.teacherId !== undefined) {
      if (updateData.teacherId) {
        let teacher = await User.findOne({ _id: updateData.teacherId, role: 'docente' });
        if (!teacher) {
          teacher = await Teacher.findById(updateData.teacherId);
        }
        if (!teacher) {
          return res.status(400).json({ success: false, message: 'Docente no encontrado' });
        }
        updateData.teacher = updateData.teacherId;
      } else {
        updateData.teacher = null;
      }
      delete updateData.teacherId;
    }

    const course = await Course.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!course) {
      return res.status(404).json({ success: false, message: 'Curso no encontrado' });
    }

    // Populate teacher from either collection
    let result = course.toObject();
    if (result.teacher) {
      let teacherDoc = await User.findById(result.teacher).select('firstName lastName email').lean();
      if (!teacherDoc) {
        teacherDoc = await Teacher.findById(result.teacher).select('firstName lastName email').lean();
      }
      result.teacher = teacherDoc;
    }

    res.json({
      success: true,
      message: 'Curso actualizado',
      data: { course: result },
    });
  } catch (error) {
    console.error('Update course error:', error);
    res.status(500).json({ success: false, message: 'Error al actualizar curso' });
  }
});

// GET /api/courses/:id/students - Obtener estudiantes del curso
router.get('/:id/students', auth, async (req, res) => {
  try {
    const course = await Course.findById(req.params.id)
      .populate('students', 'firstName lastName enrollmentNumber dni gradeLevel section');

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Curso no encontrado',
      });
    }

    res.json({
      success: true,
      count: course.students?.length || 0,
      data: course.students || [],
    });
  } catch (error) {
    console.error('Get course students error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener estudiantes del curso',
    });
  }
});

// POST /api/courses/:id/students - Agregar estudiantes al curso
router.post('/:id/students', auth, authorize('administrativo'), async (req, res) => {
  try {
    // Aceptar tanto studentIds (array) como studentId (single)
    let studentIds = req.body.studentIds;
    if (!studentIds && req.body.studentId) {
      studentIds = [req.body.studentId];
    }
    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Se requiere al menos un estudiante' });
    }

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
