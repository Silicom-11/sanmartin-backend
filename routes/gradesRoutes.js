// Rutas de Calificaciones - San Martín Digital
// Sistema de evaluación por bimestres
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { Grade, Course, Student, Evaluation, Teacher } = require('../models');
const { auth, authorize, isTeacherOrAdmin } = require('../middleware/auth');

// ==========================================
// ESTADÍSTICAS
// ==========================================

// GET /api/grades/stats - Estadísticas de calificaciones
router.get('/stats', auth, async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const bimester = req.query.bimester ? parseInt(req.query.bimester) : null;

    const matchQuery = { academicYear: year };
    if (bimester) matchQuery.bimester = bimester;

    const [totalGrades, gradeStats, gradeDistribution] = await Promise.all([
      Grade.countDocuments(matchQuery),
      Grade.aggregate([
        { $match: { ...matchQuery, average: { $gt: 0 } } },
        { $group: {
          _id: null,
          avgScore: { $avg: '$average' },
          totalStudents: { $addToSet: '$student' },
          aprobados: { $sum: { $cond: [{ $gte: ['$average', 11] }, 1, 0] } },
          destacados: { $sum: { $cond: [{ $gte: ['$average', 17] }, 1, 0] } },
          total: { $sum: 1 },
        }}
      ]),
      Grade.aggregate([
        { $match: { ...matchQuery, average: { $gt: 0 } } },
        { $bucket: {
          groupBy: '$average',
          boundaries: [0, 10.5, 13.5, 16.5, 20.01],
          default: 'other',
          output: { count: { $sum: 1 } }
        }}
      ]),
    ]);

    const stats = gradeStats[0] || { avgScore: 0, totalStudents: [], aprobados: 0, destacados: 0, total: 0 };
    const uniqueStudents = stats.totalStudents?.length || 0;
    const passingRate = stats.total > 0 ? (stats.aprobados / stats.total * 100).toFixed(1) : 0;

    // Distribución: C (0-10), B (11-13), A (14-16), AD (17-20)
    const distribution = { AD: 0, A: 0, B: 0, C: 0 };
    gradeDistribution.forEach(b => {
      if (b._id === 0) distribution.C = b.count;
      else if (b._id === 10.5) distribution.B = b.count;
      else if (b._id === 13.5) distribution.A = b.count;
      else if (b._id === 16.5) distribution.AD = b.count;
    });

    // Per-bimester average breakdown (for reports page chart)
    const byBimester = await Grade.aggregate([
      { $match: { academicYear: year, average: { $gt: 0 } } },
      { $group: {
        _id: '$bimester',
        avgScore: { $avg: '$average' },
        count: { $sum: 1 },
      }},
      { $sort: { _id: 1 } },
    ]);

    const bimesterAvgs = {};
    byBimester.forEach(b => {
      bimesterAvgs[b._id] = { avg: parseFloat(b.avgScore.toFixed(1)), count: b.count };
    });

    res.json({
      success: true,
      data: {
        totalGrades,
        uniqueStudents,
        avgScore: stats.avgScore?.toFixed(1) || '0.0',
        passingRate,
        excellentStudents: stats.destacados || 0,
        distribution,
        byBimester: bimesterAvgs,
      }
    });
  } catch (error) {
    console.error('Get grade stats error:', error);
    res.status(500).json({ success: false, message: 'Error al obtener estadísticas' });
  }
});

// GET /api/grades/by-course - Calificaciones agrupadas por curso
router.get('/by-course', auth, async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const bimester = req.query.bimester ? parseInt(req.query.bimester) : null;

    const matchQuery = { academicYear: year, average: { $gt: 0 } };
    if (bimester) matchQuery.bimester = bimester;

    const courseGrades = await Grade.aggregate([
      { $match: matchQuery },
      { $lookup: { from: 'courses', localField: 'course', foreignField: '_id', as: 'courseInfo' } },
      { $unwind: '$courseInfo' },
      { $group: {
        _id: '$course',
        courseName: { $first: '$courseInfo.name' },
        gradeLevel: { $first: '$courseInfo.gradeLevel' },
        section: { $first: '$courseInfo.section' },
        teacherId: { $first: '$courseInfo.teacher' },
        studentsCount: { $sum: 1 },
        avgScore: { $avg: '$average' },
        aprobados: { $sum: { $cond: [{ $gte: ['$average', 11] }, 1, 0] } }
      }},
      { $project: {
        _id: 1,
        courseName: 1,
        gradeLevel: 1,
        section: 1,
        teacherId: 1,
        studentsCount: 1,
        averageScore: { $round: ['$avgScore', 1] },
        passingRate: { $round: [{ $multiply: [{ $divide: ['$aprobados', { $max: ['$studentsCount', 1] }] }, 100] }, 0] }
      }}
    ]);

    // Resolver nombres de docentes (buscar en User y Teacher)
    for (const cg of courseGrades) {
      if (cg.teacherId) {
        const { User } = require('../models');
        let teacher = await User.findById(cg.teacherId).select('firstName lastName').lean();
        if (!teacher) {
          teacher = await Teacher.findById(cg.teacherId).select('firstName lastName').lean();
        }
        cg.teacher = teacher ? `${teacher.firstName} ${teacher.lastName}` : 'Sin asignar';
      } else {
        cg.teacher = 'Sin asignar';
      }
      delete cg.teacherId;
    }

    res.json({
      success: true,
      data: courseGrades
    });
  } catch (error) {
    console.error('Get course grades error:', error);
    res.status(500).json({ success: false, message: 'Error al obtener calificaciones por curso' });
  }
});

// ==========================================
// CONSULTAS POR CURSO
// ==========================================

// GET /api/grades/course/:courseId - Notas de un curso por bimestre
router.get('/course/:courseId', auth, async (req, res) => {
  try {
    const { courseId } = req.params;
    const bimester = parseInt(req.query.bimester) || 1;
    const year = parseInt(req.query.year) || new Date().getFullYear();

    const course = await Course.findById(courseId)
      .populate('students', 'firstName lastName enrollmentNumber');

    if (!course) {
      return res.status(404).json({ success: false, message: 'Curso no encontrado' });
    }

    // Obtener evaluaciones del bimestre para este curso
    const evaluations = await Evaluation.find({
      course: courseId,
      bimester,
      academicYear: year,
      isActive: true,
    }).sort({ order: 1, createdAt: 1 });

    // Obtener calificaciones de todos los estudiantes
    const grades = await Grade.find({
      course: courseId,
      bimester,
      academicYear: year,
    }).populate('scores.evaluation');

    // Crear mapa de calificaciones por estudiante
    const gradesMap = {};
    grades.forEach(g => {
      gradesMap[g.student.toString()] = g;
    });

    // Info del bimestre
    const bimesterStatus = grades.length > 0 && grades.every(g => g.status === 'cerrado') 
      ? 'cerrado' 
      : grades.length > 0 && grades.some(g => g.status === 'publicado')
        ? 'publicado'
        : 'abierto';

    // Combinar estudiantes con sus calificaciones
    const studentsWithGrades = (course.students || []).map(student => {
      const gradeDoc = gradesMap[student._id.toString()];
      const scoresMap = {};
      if (gradeDoc) {
        gradeDoc.scores.forEach(s => {
          scoresMap[s.evaluation?._id?.toString() || s.evaluation?.toString()] = {
            score: s.score,
            comments: s.comments,
          };
        });
      }

      return {
        student: {
          _id: student._id,
          firstName: student.firstName,
          lastName: student.lastName,
          enrollmentNumber: student.enrollmentNumber,
        },
        gradeId: gradeDoc?._id || null,
        average: gradeDoc?.average || 0,
        status: gradeDoc?.status || 'abierto',
        scores: scoresMap,
      };
    });

    res.json({
      success: true,
      data: {
        course: {
          _id: course._id,
          name: course.name,
          gradeLevel: course.gradeLevel,
          section: course.section,
        },
        bimester,
        academicYear: year,
        bimesterStatus,
        evaluations: evaluations.map(e => ({
          _id: e._id,
          name: e.name,
          type: e.type,
          maxGrade: e.maxGrade,
          weight: e.weight,
          date: e.date,
          order: e.order,
        })),
        students: studentsWithGrades,
      }
    });
  } catch (error) {
    console.error('Get course grades error:', error);
    res.status(500).json({ success: false, message: 'Error al obtener calificaciones del curso' });
  }
});

// ==========================================
// HISTORIAL DE ESTUDIANTE
// ==========================================

// GET /api/grades/history/:studentId - Historial de notas de un estudiante
router.get('/history/:studentId', auth, async (req, res) => {
  try {
    const { studentId } = req.params;
    const year = parseInt(req.query.year) || new Date().getFullYear();

    const grades = await Grade.find({
      student: studentId,
      academicYear: year,
    })
      .populate('course', 'name code gradeLevel')
      .populate('scores.evaluation', 'name type')
      .sort({ 'course.name': 1, bimester: 1 });

    // Agrupar por curso
    const courseMap = {};
    grades.forEach(g => {
      const courseId = g.course?._id?.toString();
      if (!courseId) return;
      if (!courseMap[courseId]) {
        courseMap[courseId] = {
          courseId,
          courseName: g.course.name,
          courseCode: g.course.code,
          gradeLevel: g.course.gradeLevel,
          bimesters: {},
        };
      }
      courseMap[courseId].bimesters[g.bimester] = {
        average: g.average,
        status: g.status,
        scores: g.scores.map(s => ({
          evaluationName: s.evaluation?.name || 'Evaluación',
          evaluationType: s.evaluation?.type || 'otro',
          score: s.score,
        })),
      };
    });

    // Calcular promedio general
    const allAverages = grades.filter(g => g.average > 0).map(g => g.average);
    const generalAverage = allAverages.length > 0 
      ? (allAverages.reduce((a, b) => a + b, 0) / allAverages.length).toFixed(1) 
      : '0.0';

    res.json({
      success: true,
      data: {
        average: generalAverage,
        courses: Object.values(courseMap),
      }
    });
  } catch (error) {
    console.error('Get grades history error:', error);
    res.status(500).json({ success: false, message: 'Error al obtener historial' });
  }
});

// ==========================================
// GUARDAR NOTAS
// ==========================================

// POST /api/grades/save-score - Guardar nota individual (evaluación + estudiante)
router.post('/save-score', auth, isTeacherOrAdmin, [
  body('studentId').notEmpty(),
  body('courseId').notEmpty(),
  body('evaluationId').notEmpty(),
  body('bimester').isInt({ min: 1, max: 4 }),
  body('score').isFloat({ min: 0, max: 20 }),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { studentId, courseId, evaluationId, bimester, score, comments } = req.body;
    const year = req.body.academicYear || new Date().getFullYear();

    // Buscar o crear documento de calificación
    let grade = await Grade.findOne({
      student: studentId,
      course: courseId,
      bimester,
      academicYear: year,
    });

    if (!grade) {
      grade = new Grade({
        student: studentId,
        course: courseId,
        bimester,
        academicYear: year,
        teacher: req.userId,
        scores: [],
      });
    }

    // Verificar que el bimestre no esté cerrado
    if (grade.status === 'cerrado' || grade.status === 'publicado') {
      return res.status(400).json({
        success: false,
        message: `El bimestre ${bimester} está ${grade.status}. No se pueden modificar notas.`,
      });
    }

    // Actualizar o agregar score
    const existingScoreIdx = grade.scores.findIndex(
      s => s.evaluation.toString() === evaluationId
    );

    if (existingScoreIdx >= 0) {
      grade.scores[existingScoreIdx].score = score;
      grade.scores[existingScoreIdx].comments = comments || '';
      grade.scores[existingScoreIdx].gradedAt = new Date();
      grade.scores[existingScoreIdx].gradedBy = req.userId;
    } else {
      grade.scores.push({
        evaluation: evaluationId,
        score,
        comments: comments || '',
        gradedAt: new Date(),
        gradedBy: req.userId,
      });
    }

    await grade.save(); // pre-save recalcula el promedio

    res.json({
      success: true,
      message: 'Nota guardada',
      data: { grade },
    });
  } catch (error) {
    console.error('Save score error:', error);
    res.status(500).json({ success: false, message: 'Error al guardar nota', error: error.message });
  }
});

// POST /api/grades/save-bulk - Guardar notas masivas (soporta multi-evaluación)
// Acepta 2 formatos:
//   A) { courseId, evaluationId, bimester, scores: [{ studentId, score, comments }] }  (una sola evaluación)
//   B) { courseId, bimester, scores: [{ studentId, evaluationId, score, comments }] } (multi-evaluación)
router.post('/save-bulk', auth, isTeacherOrAdmin, async (req, res) => {
  try {
    const { courseId, bimester, academicYear } = req.body;
    const topLevelEvalId = req.body.evaluationId; // puede ser undefined en formato B
    const scores = req.body.scores || [];
    const year = academicYear || new Date().getFullYear();

    if (!courseId || !bimester || !Array.isArray(scores) || scores.length === 0) {
      return res.status(400).json({ success: false, message: 'courseId, bimester y scores son requeridos' });
    }

    // Agrupar scores por estudiante para hacer un solo save por estudiante
    const studentScoresMap = {};
    for (const item of scores) {
      const sid = item.studentId;
      const evalId = item.evaluationId || topLevelEvalId;
      if (!sid || !evalId) continue;
      if (!studentScoresMap[sid]) studentScoresMap[sid] = [];
      studentScoresMap[sid].push({ evaluationId: evalId, score: item.score, comments: item.comments || '' });
    }

    const results = [];
    const errors = [];

    for (const [studentId, scoreItems] of Object.entries(studentScoresMap)) {
      try {
        let grade = await Grade.findOne({
          student: studentId,
          course: courseId,
          bimester,
          academicYear: year,
        });

        if (!grade) {
          grade = new Grade({
            student: studentId,
            course: courseId,
            bimester,
            academicYear: year,
            teacher: req.userId,
            scores: [],
          });
        }

        if (grade.status === 'cerrado' || grade.status === 'publicado') {
          errors.push({ studentId, error: 'Bimestre cerrado' });
          continue;
        }

        // Aplicar cada score para este estudiante
        for (const si of scoreItems) {
          const existingIdx = grade.scores.findIndex(
            s => s.evaluation && s.evaluation.toString() === si.evaluationId
          );

          if (existingIdx >= 0) {
            grade.scores[existingIdx].score = si.score;
            grade.scores[existingIdx].comments = si.comments;
            grade.scores[existingIdx].gradedAt = new Date();
            grade.scores[existingIdx].gradedBy = req.userId;
          } else {
            grade.scores.push({
              evaluation: si.evaluationId,
              score: si.score,
              comments: si.comments,
              gradedAt: new Date(),
              gradedBy: req.userId,
            });
          }
        }

        await grade.save(); // pre-save recalcula promedio ponderado
        results.push(grade);
      } catch (err) {
        errors.push({ studentId, error: err.message });
      }
    }

    res.json({
      success: true,
      message: `${results.length} notas guardadas`,
      data: { saved: results.length, errors: errors.length, errorDetails: errors },
    });
  } catch (error) {
    console.error('Bulk save grades error:', error);
    res.status(500).json({ success: false, message: 'Error al guardar calificaciones' });
  }
});

// ==========================================
// CERRAR / PUBLICAR BIMESTRE
// ==========================================

// PUT /api/grades/close-bimester - Cerrar bimestre para un curso
router.put('/close-bimester', auth, isTeacherOrAdmin, async (req, res) => {
  try {
    const { courseId, bimester, academicYear } = req.body;
    const year = academicYear || new Date().getFullYear();

    const result = await Grade.updateMany(
      { course: courseId, bimester, academicYear: year, status: 'abierto' },
      { $set: { status: 'cerrado', closedAt: new Date(), closedBy: req.userId } }
    );

    res.json({
      success: true,
      message: `Bimestre ${bimester} cerrado para ${result.modifiedCount} estudiantes`,
      data: { modifiedCount: result.modifiedCount },
    });
  } catch (error) {
    console.error('Close bimester error:', error);
    res.status(500).json({ success: false, message: 'Error al cerrar bimestre' });
  }
});

// PUT /api/grades/reopen-bimester - Reabrir bimestre
router.put('/reopen-bimester', auth, authorize('administrativo'), async (req, res) => {
  try {
    const { courseId, bimester, academicYear } = req.body;
    const year = academicYear || new Date().getFullYear();

    const result = await Grade.updateMany(
      { course: courseId, bimester, academicYear: year, status: 'cerrado' },
      { $set: { status: 'abierto', closedAt: null, closedBy: null } }
    );

    res.json({
      success: true,
      message: `Bimestre ${bimester} reabierto`,
      data: { modifiedCount: result.modifiedCount },
    });
  } catch (error) {
    console.error('Reopen bimester error:', error);
    res.status(500).json({ success: false, message: 'Error al reabrir bimestre' });
  }
});

// PUT /api/grades/publish-bimester - Publicar notas del bimestre (notifica padres)
router.put('/publish-bimester', auth, isTeacherOrAdmin, async (req, res) => {
  try {
    const { courseId, bimester, academicYear } = req.body;
    const year = academicYear || new Date().getFullYear();

    const result = await Grade.updateMany(
      { course: courseId, bimester, academicYear: year },
      { $set: { status: 'publicado', publishedAt: new Date() } }
    );

    // TODO: Enviar notificaciones a padres

    res.json({
      success: true,
      message: `Notas del bimestre ${bimester} publicadas`,
      data: { modifiedCount: result.modifiedCount },
    });
  } catch (error) {
    console.error('Publish grades error:', error);
    res.status(500).json({ success: false, message: 'Error al publicar notas' });
  }
});

// ==========================================
// REPORTE: Notas por bimestre para un curso
// ==========================================

// GET /api/grades/report/:courseId - Resumen de notas (todos los bimestres)
router.get('/report/:courseId', auth, async (req, res) => {
  try {
    const { courseId } = req.params;
    const year = parseInt(req.query.year) || new Date().getFullYear();

    const course = await Course.findById(courseId)
      .populate('students', 'firstName lastName enrollmentNumber');

    if (!course) {
      return res.status(404).json({ success: false, message: 'Curso no encontrado' });
    }

    // Obtener todos los grades del año para este curso
    const grades = await Grade.find({
      course: courseId,
      academicYear: year,
    });

    // Organizar por estudiante
    const studentReport = (course.students || []).map(student => {
      const sid = student._id.toString();
      const bimesters = {};
      let totalAvg = 0;
      let countBimesters = 0;

      [1, 2, 3, 4].forEach(b => {
        const bGrade = grades.find(g => g.student.toString() === sid && g.bimester === b);
        bimesters[b] = {
          average: bGrade?.average || 0,
          status: bGrade?.status || 'abierto',
        };
        if (bGrade?.average > 0) {
          totalAvg += bGrade.average;
          countBimesters++;
        }
      });

      return {
        student: {
          _id: student._id,
          firstName: student.firstName,
          lastName: student.lastName,
          enrollmentNumber: student.enrollmentNumber,
        },
        bimesters,
        finalAverage: countBimesters > 0 ? Math.round((totalAvg / countBimesters) * 10) / 10 : 0,
        status: (totalAvg / Math.max(countBimesters, 1)) >= 11 ? 'aprobado' : countBimesters === 0 ? 'proceso' : 'desaprobado',
      };
    });

    res.json({
      success: true,
      data: {
        course: { _id: course._id, name: course.name, gradeLevel: course.gradeLevel, section: course.section },
        academicYear: year,
        students: studentReport,
      }
    });
  } catch (error) {
    console.error('Get grade report error:', error);
    res.status(500).json({ success: false, message: 'Error al obtener reporte' });
  }
});

// GET /api/grades - Listar calificaciones (compatibilidad)
router.get('/', auth, async (req, res) => {
  try {
    let query = {};
    if (req.query.courseId) query.course = req.query.courseId;
    if (req.query.studentId) query.student = req.query.studentId;
    if (req.query.bimester) query.bimester = parseInt(req.query.bimester);
    if (req.query.year) query.academicYear = parseInt(req.query.year);
    if (req.user.role === 'docente') query.teacher = req.userId;

    const grades = await Grade.find(query)
      .populate('student', 'firstName lastName enrollmentNumber')
      .populate('course', 'name code gradeLevel section')
      .sort({ 'student.lastName': 1 });

    res.json({ success: true, count: grades.length, data: { grades } });
  } catch (error) {
    console.error('Get grades error:', error);
    res.status(500).json({ success: false, message: 'Error al obtener calificaciones' });
  }
});

module.exports = router;
