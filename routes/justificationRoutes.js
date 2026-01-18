// Rutas de Justificaciones - San Martín Digital
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');
const { Justification, Attendance, Student } = require('../models');
const { auth, authorize, isParentOf } = require('../middleware/auth');

// Configuración de multer para subir archivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/justifications');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `justification-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido'), false);
    }
  },
});

// GET /api/justifications - Listar justificaciones
router.get('/', auth, async (req, res) => {
  try {
    let query = {};
    
    // Si es padre, solo sus justificaciones
    if (req.user.role === 'padre') {
      query.parent = req.userId;
    }
    
    // Filtros
    if (req.query.status) {
      query.status = req.query.status;
    }
    if (req.query.studentId) {
      query.student = req.query.studentId;
    }

    const justifications = await Justification.find(query)
      .populate('student', 'firstName lastName gradeLevel section')
      .populate('parent', 'firstName lastName email')
      .populate('reviewedBy', 'firstName lastName')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: justifications.length,
      data: justifications,
    });
  } catch (error) {
    console.error('Get justifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener justificaciones',
    });
  }
});

// GET /api/justifications/stats - Estadísticas de justificaciones
router.get('/stats', auth, authorize('administrativo', 'docente'), async (req, res) => {
  try {
    const [total, pending, approved, rejected] = await Promise.all([
      Justification.countDocuments(),
      Justification.countDocuments({ status: 'pending' }),
      Justification.countDocuments({ status: 'approved' }),
      Justification.countDocuments({ status: 'rejected' }),
    ]);

    res.json({
      success: true,
      data: { total, pending, approved, rejected },
    });
  } catch (error) {
    console.error('Get justifications stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener estadísticas',
    });
  }
});

// GET /api/justifications/:id - Obtener una justificación
router.get('/:id', auth, async (req, res) => {
  try {
    const justification = await Justification.findById(req.params.id)
      .populate('student', 'firstName lastName gradeLevel section')
      .populate('parent', 'firstName lastName email phone')
      .populate('reviewedBy', 'firstName lastName');

    if (!justification) {
      return res.status(404).json({
        success: false,
        message: 'Justificación no encontrada',
      });
    }

    // Verificar permisos
    if (req.user.role === 'padre' && justification.parent.toString() !== req.userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'No tiene acceso a esta justificación',
      });
    }

    res.json({
      success: true,
      data: { justification },
    });
  } catch (error) {
    console.error('Get justification error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener justificación',
    });
  }
});

// POST /api/justifications - Crear justificación
router.post('/', auth, authorize('padre'), upload.array('documents', 3), [
  body('studentId').notEmpty().withMessage('El estudiante es requerido'),
  body('dates').isArray({ min: 1 }).withMessage('Las fechas son requeridas'),
  body('reason').isIn(['Enfermedad', 'Cita médica', 'Emergencia familiar', 'Trámites oficiales', 'Otros']).withMessage('Motivo inválido'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { studentId, dates, reason, observations } = req.body;

    // Verificar que el estudiante pertenece al padre
    const student = await Student.findById(studentId);
    if (!student || student.parent.toString() !== req.userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'No tiene acceso a este estudiante',
      });
    }

    // Procesar documentos
    const documents = req.files ? req.files.map(file => ({
      filename: file.filename,
      originalName: file.originalname,
      path: file.path,
      mimetype: file.mimetype,
      size: file.size,
    })) : [];

    const justification = await Justification.create({
      student: studentId,
      parent: req.userId,
      dates: Array.isArray(dates) ? dates.map(d => new Date(d)) : [new Date(dates)],
      reason,
      observations,
      documents,
    });

    await justification.populate([
      { path: 'student', select: 'firstName lastName' },
    ]);

    res.status(201).json({
      success: true,
      message: 'Justificación enviada exitosamente',
      data: { justification },
    });
  } catch (error) {
    console.error('Create justification error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear justificación',
      error: error.message,
    });
  }
});

// PUT /api/justifications/:id/review - Revisar justificación (admin/docente)
router.put('/:id/review', auth, authorize('administrativo', 'docente'), [
  body('status').isIn(['approved', 'rejected', 'aprobada', 'rechazada']).withMessage('Estado inválido'),
], async (req, res) => {
  try {
    const { status, reviewNote, reviewNotes } = req.body;
    
    // Normalizar el estado
    let normalizedStatus = status;
    if (status === 'aprobada' || status === 'approved') {
      normalizedStatus = 'approved';
    } else if (status === 'rechazada' || status === 'rejected') {
      normalizedStatus = 'rejected';
    }
    
    // Usar reviewNote o reviewNotes
    const note = reviewNote || reviewNotes || '';

    const justification = await Justification.findByIdAndUpdate(
      req.params.id,
      {
        status: normalizedStatus,
        reviewNote: note,
        reviewedBy: req.userId,
        reviewedAt: new Date(),
      },
      { new: true }
    ).populate('student', 'firstName lastName');

    if (!justification) {
      return res.status(404).json({
        success: false,
        message: 'Justificación no encontrada',
      });
    }

    // Si se aprueba, actualizar los registros de asistencia
    if (normalizedStatus === 'approved') {
      for (const date of justification.dates) {
        await Attendance.updateMany(
          {
            student: justification.student._id,
            date: {
              $gte: new Date(date.setHours(0, 0, 0, 0)),
              $lte: new Date(date.setHours(23, 59, 59, 999)),
            },
            status: 'absent',
          },
          {
            $set: {
              status: 'justified',
              justification: justification._id,
            },
          }
        );
      }
    }

    // TODO: Enviar notificación al padre

    res.json({
      success: true,
      message: `Justificación ${status}`,
      data: { justification },
    });
  } catch (error) {
    console.error('Review justification error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al revisar justificación',
    });
  }
});

// DELETE /api/justifications/:id - Eliminar justificación (solo pendientes)
router.delete('/:id', auth, authorize('padre'), async (req, res) => {
  try {
    const justification = await Justification.findOne({
      _id: req.params.id,
      parent: req.userId,
      status: 'pendiente',
    });

    if (!justification) {
      return res.status(404).json({
        success: false,
        message: 'Justificación no encontrada o no puede ser eliminada',
      });
    }

    await justification.deleteOne();

    res.json({
      success: true,
      message: 'Justificación eliminada',
    });
  } catch (error) {
    console.error('Delete justification error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar justificación',
    });
  }
});

module.exports = router;
