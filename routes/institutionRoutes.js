// Rutas de Institución - San Martín Digital
const express = require('express');
const router = express.Router();
const { auth, authorize } = require('../middleware/auth');
const { Institution, AcademicYear, GradeLevel, Subject } = require('../models');

// GET /api/institution - Obtener configuración de la institución
router.get('/', auth, async (req, res) => {
  try {
    const institution = await Institution.findOne({ isActive: true })
      .populate('director', 'firstName lastName email');
    
    if (!institution) {
      return res.status(404).json({
        success: false,
        message: 'No se encontró la institución',
      });
    }
    
    res.json({
      success: true,
      data: institution,
    });
  } catch (error) {
    console.error('Error obteniendo institución:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener la institución',
    });
  }
});

// PUT /api/institution - Actualizar configuración (solo admin)
router.put('/', auth, authorize('administrativo', 'director'), async (req, res) => {
  try {
    const institution = await Institution.findOneAndUpdate(
      { isActive: true },
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!institution) {
      return res.status(404).json({
        success: false,
        message: 'No se encontró la institución',
      });
    }
    
    res.json({
      success: true,
      data: institution,
      message: 'Institución actualizada correctamente',
    });
  } catch (error) {
    console.error('Error actualizando institución:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar la institución',
    });
  }
});

// ==========================================
// AÑOS ACADÉMICOS
// ==========================================

// GET /api/institution/academic-years - Listar años académicos
router.get('/academic-years', auth, async (req, res) => {
  try {
    const institution = await Institution.findOne({ isActive: true });
    const years = await AcademicYear.find({ institution: institution._id })
      .sort({ year: -1 });
    
    res.json({
      success: true,
      data: years,
      currentYear: years.find(y => y.isCurrent),
    });
  } catch (error) {
    console.error('Error obteniendo años académicos:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener años académicos',
    });
  }
});

// GET /api/institution/academic-years/current - Obtener año actual
router.get('/academic-years/current', auth, async (req, res) => {
  try {
    const currentYear = await AcademicYear.findOne({ isCurrent: true });
    
    if (!currentYear) {
      return res.status(404).json({
        success: false,
        message: 'No hay año académico activo',
      });
    }
    
    res.json({
      success: true,
      data: currentYear,
    });
  } catch (error) {
    console.error('Error obteniendo año actual:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener año académico actual',
    });
  }
});

// POST /api/institution/academic-years - Crear año académico
router.post('/academic-years', auth, authorize('administrativo', 'director'), async (req, res) => {
  try {
    const institution = await Institution.findOne({ isActive: true });
    
    const academicYear = await AcademicYear.create({
      ...req.body,
      institution: institution._id,
    });
    
    res.status(201).json({
      success: true,
      data: academicYear,
      message: 'Año académico creado correctamente',
    });
  } catch (error) {
    console.error('Error creando año académico:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear año académico',
    });
  }
});

// PUT /api/institution/academic-years/:id/activate - Activar año académico
router.put('/academic-years/:id/activate', auth, authorize('administrativo', 'director'), async (req, res) => {
  try {
    const academicYear = await AcademicYear.findByIdAndUpdate(
      req.params.id,
      { isCurrent: true, status: 'activo' },
      { new: true }
    );
    
    res.json({
      success: true,
      data: academicYear,
      message: 'Año académico activado',
    });
  } catch (error) {
    console.error('Error activando año académico:', error);
    res.status(500).json({
      success: false,
      message: 'Error al activar año académico',
    });
  }
});

// ==========================================
// GRADOS
// ==========================================

// GET /api/institution/grade-levels - Listar grados
router.get('/grade-levels', auth, async (req, res) => {
  try {
    const institution = await Institution.findOne({ isActive: true });
    const { type } = req.query;
    
    const filter = { institution: institution._id, isActive: true };
    if (type) filter.type = type;
    
    const gradeLevels = await GradeLevel.find(filter).sort({ order: 1 });
    
    res.json({
      success: true,
      data: gradeLevels,
    });
  } catch (error) {
    console.error('Error obteniendo grados:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener grados',
    });
  }
});

// ==========================================
// ASIGNATURAS
// ==========================================

// GET /api/institution/subjects - Listar asignaturas
router.get('/subjects', auth, async (req, res) => {
  try {
    const institution = await Institution.findOne({ isActive: true });
    const { gradeLevel, area } = req.query;
    
    const filter = { institution: institution._id, isActive: true };
    if (gradeLevel) filter.gradeLevels = gradeLevel;
    if (area) filter.area = area;
    
    const subjects = await Subject.find(filter)
      .populate('gradeLevels', 'name shortName type')
      .sort({ order: 1 });
    
    res.json({
      success: true,
      data: subjects,
    });
  } catch (error) {
    console.error('Error obteniendo asignaturas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener asignaturas',
    });
  }
});

// POST /api/institution/subjects - Crear asignatura
router.post('/subjects', auth, authorize('administrativo', 'director'), async (req, res) => {
  try {
    const institution = await Institution.findOne({ isActive: true });
    
    const subject = await Subject.create({
      ...req.body,
      institution: institution._id,
    });
    
    res.status(201).json({
      success: true,
      data: subject,
      message: 'Asignatura creada correctamente',
    });
  } catch (error) {
    console.error('Error creando asignatura:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear asignatura',
    });
  }
});

// PUT /api/institution/subjects/:id - Actualizar asignatura
router.put('/subjects/:id', auth, authorize('administrativo', 'director'), async (req, res) => {
  try {
    const subject = await Subject.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    res.json({
      success: true,
      data: subject,
      message: 'Asignatura actualizada correctamente',
    });
  } catch (error) {
    console.error('Error actualizando asignatura:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar asignatura',
    });
  }
});

module.exports = router;
