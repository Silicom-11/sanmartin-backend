// Rutas de Configuración Académica - San Martín Digital
const express = require('express');
const router = express.Router();
const { auth, authorize } = require('../middleware/auth');
const { AcademicYear, Institution } = require('../models');

// GET /api/academic-settings - Obtener configuración académica actual
router.get('/', auth, async (req, res) => {
  try {
    const institution = await Institution.findOne({ isActive: true });
    const currentYear = await AcademicYear.findOne({ isCurrent: true });

    if (!currentYear && !institution) {
      return res.json({
        success: true,
        data: {
          currentYear: new Date().getFullYear().toString(),
          evaluationSystem: 'bimestral',
          gradeScale: 'vigesimal',
          passingGrade: 11,
          startDate: `${new Date().getFullYear()}-03-01`,
          endDate: `${new Date().getFullYear()}-12-20`
        }
      });
    }

    res.json({
      success: true,
      data: {
        currentYear: currentYear?.year?.toString() || new Date().getFullYear().toString(),
        evaluationSystem: currentYear?.evaluationSystem || institution?.academicConfig?.evaluationSystem || 'bimestral',
        gradeScale: currentYear?.gradeScale || institution?.academicConfig?.gradeScale || 'vigesimal',
        passingGrade: institution?.academicConfig?.passingGrade || 11,
        startDate: currentYear?.startDate ? new Date(currentYear.startDate).toISOString().split('T')[0] : `${new Date().getFullYear()}-03-01`,
        endDate: currentYear?.endDate ? new Date(currentYear.endDate).toISOString().split('T')[0] : `${new Date().getFullYear()}-12-20`
      }
    });
  } catch (error) {
    console.error('Get academic settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener configuración académica'
    });
  }
});

// PUT /api/academic-settings - Actualizar configuración académica
router.put('/', auth, authorize('administrativo', 'director'), async (req, res) => {
  try {
    const { currentYear, evaluationSystem, gradeScale, passingGrade, startDate, endDate } = req.body;

    // Buscar o crear institución
    let institution = await Institution.findOne({ isActive: true });
    
    if (!institution) {
      institution = await Institution.create({
        name: 'Colegio San Martín',
        code: 'CSM-001',
        isActive: true,
        academicConfig: {
          evaluationSystem,
          gradeScale,
          passingGrade
        }
      });
    } else {
      institution.academicConfig = {
        ...institution.academicConfig,
        evaluationSystem,
        gradeScale,
        passingGrade
      };
      await institution.save();
    }

    // Buscar o crear año académico actual
    let academicYear = await AcademicYear.findOne({ year: parseInt(currentYear) });
    
    if (!academicYear) {
      // Desactivar otros años
      await AcademicYear.updateMany({}, { isCurrent: false });
      
      academicYear = await AcademicYear.create({
        year: parseInt(currentYear),
        name: `Año Académico ${currentYear}`,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        evaluationSystem,
        gradeScale,
        isCurrent: true,
        status: 'activo',
        institution: institution._id,
        periods: generatePeriods(evaluationSystem, startDate, endDate)
      });
    } else {
      // Actualizar año existente
      await AcademicYear.updateMany({}, { isCurrent: false });
      
      academicYear.isCurrent = true;
      academicYear.startDate = new Date(startDate);
      academicYear.endDate = new Date(endDate);
      academicYear.evaluationSystem = evaluationSystem;
      academicYear.gradeScale = gradeScale;
      academicYear.status = 'activo';
      await academicYear.save();
    }

    res.json({
      success: true,
      data: {
        currentYear: academicYear.year.toString(),
        evaluationSystem,
        gradeScale,
        passingGrade,
        startDate,
        endDate
      },
      message: 'Configuración académica actualizada correctamente'
    });
  } catch (error) {
    console.error('Update academic settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar configuración académica'
    });
  }
});

// Función auxiliar para generar períodos
function generatePeriods(evaluationSystem, startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const totalDays = Math.round((end - start) / (1000 * 60 * 60 * 24));
  
  let periodsCount = 4;
  let periodName = 'Bimestre';
  
  if (evaluationSystem === 'trimestral') {
    periodsCount = 3;
    periodName = 'Trimestre';
  } else if (evaluationSystem === 'semestral') {
    periodsCount = 2;
    periodName = 'Semestre';
  }
  
  const daysPerPeriod = Math.floor(totalDays / periodsCount);
  const periods = [];
  
  for (let i = 0; i < periodsCount; i++) {
    const periodStart = new Date(start);
    periodStart.setDate(periodStart.getDate() + (i * daysPerPeriod));
    
    const periodEnd = new Date(start);
    periodEnd.setDate(periodEnd.getDate() + ((i + 1) * daysPerPeriod) - 1);
    
    periods.push({
      name: `${periodName} ${i + 1}`,
      number: i + 1,
      startDate: periodStart,
      endDate: periodEnd,
      isCurrent: i === 0
    });
  }
  
  return periods;
}

module.exports = router;
