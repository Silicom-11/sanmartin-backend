// Rutas de Evaluaciones - San Martín Digital
// CRUD de evaluaciones (columnas de notas) creadas por docentes
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { Evaluation, Course, Grade, Teacher, User } = require('../models');
const { auth, authorize, isTeacherOrAdmin } = require('../middleware/auth');

// GET /api/evaluations/course/:courseId - Listar evaluaciones de un curso
router.get('/course/:courseId', auth, async (req, res) => {
  try {
    const { courseId } = req.params;
    const bimester = req.query.bimester ? parseInt(req.query.bimester) : null;
    const year = parseInt(req.query.year) || new Date().getFullYear();

    const query = { course: courseId, academicYear: year, isActive: true };
    if (bimester) query.bimester = bimester;

    const evaluations = await Evaluation.find(query).sort({ bimester: 1, order: 1, createdAt: 1 });

    // Agrupar por bimestre
    const byBimester = {};
    evaluations.forEach(e => {
      if (!byBimester[e.bimester]) byBimester[e.bimester] = [];
      byBimester[e.bimester].push(e);
    });

    res.json({
      success: true,
      count: evaluations.length,
      data: {
        evaluations,
        byBimester,
      }
    });
  } catch (error) {
    console.error('Get evaluations error:', error);
    res.status(500).json({ success: false, message: 'Error al obtener evaluaciones' });
  }
});

// POST /api/evaluations - Crear nueva evaluación (docente crea "columna")
router.post('/', auth, isTeacherOrAdmin, [
  body('courseId').notEmpty().withMessage('El curso es requerido'),
  body('name').notEmpty().withMessage('El nombre es requerido'),
  body('type').isIn(['examen', 'tarea', 'practica', 'proyecto', 'participacion', 'exposicion', 'otro']),
  body('bimester').isInt({ min: 1, max: 4 }).withMessage('Bimestre inválido'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { courseId, name, type, bimester, maxGrade, weight, date, description } = req.body;
    const year = req.body.academicYear || new Date().getFullYear();

    // Verificar que el curso existe
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Curso no encontrado' });
    }

    // Calcular el orden (siguiente posición)
    const lastEval = await Evaluation.findOne({ 
      course: courseId, bimester, academicYear: year 
    }).sort({ order: -1 });
    const nextOrder = (lastEval?.order || 0) + 1;

    const evaluation = await Evaluation.create({
      course: courseId,
      teacher: req.userId,
      name,
      type,
      bimester,
      maxGrade: maxGrade || 20,
      weight: weight || 1,
      date: date || new Date(),
      description,
      academicYear: year,
      order: nextOrder,
    });

    res.status(201).json({
      success: true,
      message: 'Evaluación creada exitosamente',
      data: { evaluation },
    });
  } catch (error) {
    console.error('Create evaluation error:', error);
    res.status(500).json({ success: false, message: 'Error al crear evaluación', error: error.message });
  }
});

// PUT /api/evaluations/:id - Actualizar evaluación
router.put('/:id', auth, isTeacherOrAdmin, async (req, res) => {
  try {
    const evaluation = await Evaluation.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!evaluation) {
      return res.status(404).json({ success: false, message: 'Evaluación no encontrada' });
    }

    res.json({
      success: true,
      message: 'Evaluación actualizada',
      data: { evaluation },
    });
  } catch (error) {
    console.error('Update evaluation error:', error);
    res.status(500).json({ success: false, message: 'Error al actualizar evaluación' });
  }
});

// DELETE /api/evaluations/:id - Desactivar evaluación
router.delete('/:id', auth, isTeacherOrAdmin, async (req, res) => {
  try {
    const evaluation = await Evaluation.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!evaluation) {
      return res.status(404).json({ success: false, message: 'Evaluación no encontrada' });
    }

    // También eliminar las notas asociadas a esta evaluación
    await Grade.updateMany(
      {},
      { $pull: { scores: { evaluation: req.params.id } } }
    );

    res.json({
      success: true,
      message: 'Evaluación eliminada',
    });
  } catch (error) {
    console.error('Delete evaluation error:', error);
    res.status(500).json({ success: false, message: 'Error al eliminar evaluación' });
  }
});

// PUT /api/evaluations/reorder - Reordenar evaluaciones
router.put('/reorder', auth, isTeacherOrAdmin, async (req, res) => {
  try {
    const { evaluationIds } = req.body; // Array de IDs en el orden deseado

    for (let i = 0; i < evaluationIds.length; i++) {
      await Evaluation.findByIdAndUpdate(evaluationIds[i], { order: i + 1 });
    }

    res.json({
      success: true,
      message: 'Evaluaciones reordenadas',
    });
  } catch (error) {
    console.error('Reorder evaluations error:', error);
    res.status(500).json({ success: false, message: 'Error al reordenar' });
  }
});

module.exports = router;
