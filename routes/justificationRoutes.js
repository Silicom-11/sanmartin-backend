// Rutas de Justificaciones - San Martín Digital
// Supports file upload to Cloudflare R2 (or local fallback)
// Auto-justify: approved justifications auto-apply to attendance records

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { Justification, Attendance, Student, Notification } = require('../models');
const { auth, authorize } = require('../middleware/auth');
const r2Storage = require('../services/r2Storage');

// Use memory storage so we get buffers for R2 upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf',
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido. Solo se aceptan imágenes y PDF.'), false);
    }
  },
});

// Map reason values from mobile (English keys) to DB values (Spanish)
const REASON_MAP = {
  illness: 'Enfermedad',
  medical: 'Cita médica',
  family: 'Emergencia familiar',
  official: 'Trámites oficiales',
  other: 'Otros',
  'Enfermedad': 'Enfermedad',
  'Cita médica': 'Cita médica',
  'Emergencia familiar': 'Emergencia familiar',
  'Trámites oficiales': 'Trámites oficiales',
  'Otros': 'Otros',
};

// Helper: generate dates array from startDate/endDate
function generateDateRange(startDate, endDate) {
  const dates = [];
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : new Date(startDate);
  start.setHours(12, 0, 0, 0);
  end.setHours(12, 0, 0, 0);
  const current = new Date(start);
  while (current <= end) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

// ============ GET /api/justifications ============
router.get('/', auth, async (req, res) => {
  try {
    let query = {};

    if (req.user.role === 'padre') {
      query.parent = req.userId;
    }
    if (req.query.status) {
      let s = req.query.status;
      if (s === 'pendiente') s = 'pending';
      if (s === 'aprobada') s = 'approved';
      if (s === 'rechazada') s = 'rejected';
      query.status = s;
    }
    if (req.query.studentId) {
      query.student = req.query.studentId;
    }

    const justifications = await Justification.find(query)
      .populate('student', 'firstName lastName gradeLevel section')
      .populate('parent', 'firstName lastName email')
      .populate('reviewedBy', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(100);

    // Add document URLs
    const result = justifications.map(j => {
      const obj = j.toObject();
      obj.documents = (obj.documents || []).map(doc => ({
        ...doc,
        url: doc.url || (doc.key ? r2Storage.getFileUrl(doc.key) : (doc.path ? `/uploads/${doc.path}` : null)),
      }));
      return obj;
    });

    res.json({ success: true, count: result.length, data: result });
  } catch (error) {
    console.error('Get justifications error:', error);
    res.status(500).json({ success: false, message: 'Error al obtener justificaciones' });
  }
});

// ============ GET /api/justifications/student/:studentId ============
// Used by mobile to get justifications for a specific student
router.get('/student/:studentId', auth, async (req, res) => {
  try {
    const justifications = await Justification.find({ student: req.params.studentId })
      .populate('student', 'firstName lastName gradeLevel section')
      .populate('parent', 'firstName lastName email')
      .populate('reviewedBy', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(50);

    const result = justifications.map(j => {
      const obj = j.toObject();
      obj.documents = (obj.documents || []).map(doc => ({
        ...doc,
        url: doc.url || (doc.key ? r2Storage.getFileUrl(doc.key) : null),
      }));
      return obj;
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Get student justifications error:', error);
    res.status(500).json({ success: false, message: 'Error al obtener justificaciones' });
  }
});

// ============ GET /api/justifications/my-justifications ============
// Used by parent mobile to get all their submitted justifications
router.get('/my-justifications', auth, async (req, res) => {
  try {
    const justifications = await Justification.find({ parent: req.userId })
      .populate('student', 'firstName lastName gradeLevel section')
      .populate('reviewedBy', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(50);

    const result = justifications.map(j => {
      const obj = j.toObject();
      obj.documents = (obj.documents || []).map(doc => ({
        ...doc,
        url: doc.url || (doc.key ? r2Storage.getFileUrl(doc.key) : null),
      }));
      return obj;
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Get my justifications error:', error);
    res.status(500).json({ success: false, message: 'Error al obtener justificaciones' });
  }
});

// ============ GET /api/justifications/stats ============
router.get('/stats', auth, authorize('administrativo', 'docente'), async (req, res) => {
  try {
    const [total, pending, approved, rejected] = await Promise.all([
      Justification.countDocuments(),
      Justification.countDocuments({ status: 'pending' }),
      Justification.countDocuments({ status: 'approved' }),
      Justification.countDocuments({ status: 'rejected' }),
    ]);

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const recentCount = await Justification.countDocuments({ createdAt: { $gte: weekAgo } });

    res.json({ success: true, data: { total, pending, approved, rejected, recentCount } });
  } catch (error) {
    console.error('Get justifications stats error:', error);
    res.status(500).json({ success: false, message: 'Error al obtener estadísticas' });
  }
});

// ============ GET /api/justifications/approved-for-date ============
// Returns map of studentId → justification info for all approved justifications on a date
// Used by attendance screen to auto-mark justified students
router.get('/approved-for-date', auth, async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ success: false, message: 'date es requerido' });
    }

    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);
    const endDate = new Date(targetDate);
    endDate.setDate(endDate.getDate() + 1);

    const justifications = await Justification.find({
      status: 'approved',
      dates: { $elemMatch: { $gte: targetDate, $lt: endDate } },
    })
      .populate('student', 'firstName lastName')
      .select('student reason dates documents');

    const justifiedStudents = {};
    justifications.forEach(j => {
      const sid = j.student?._id?.toString();
      if (sid) {
        justifiedStudents[sid] = {
          reason: j.reason,
          hasDocuments: (j.documents || []).length > 0,
          justificationId: j._id,
        };
      }
    });

    res.json({ success: true, data: justifiedStudents });
  } catch (error) {
    console.error('Get approved justifications error:', error);
    res.status(500).json({ success: false, message: 'Error' });
  }
});

// ============ GET /api/justifications/:id ============
router.get('/:id', auth, async (req, res) => {
  try {
    const justification = await Justification.findById(req.params.id)
      .populate('student', 'firstName lastName gradeLevel section')
      .populate('parent', 'firstName lastName email phone')
      .populate('reviewedBy', 'firstName lastName');

    if (!justification) {
      return res.status(404).json({ success: false, message: 'Justificación no encontrada' });
    }

    if (req.user.role === 'padre' && justification.parent._id.toString() !== req.userId.toString()) {
      return res.status(403).json({ success: false, message: 'No tiene acceso' });
    }

    const obj = justification.toObject();
    obj.documents = (obj.documents || []).map(doc => ({
      ...doc,
      url: doc.url || (doc.key ? r2Storage.getFileUrl(doc.key) : null),
    }));

    res.json({ success: true, data: { justification: obj } });
  } catch (error) {
    console.error('Get justification error:', error);
    res.status(500).json({ success: false, message: 'Error al obtener justificación' });
  }
});

// ============ POST /api/justifications - Create justification (parent) ============
router.post('/', auth, authorize('padre'), upload.array('documents', 5), async (req, res) => {
  try {
    const { studentId, reason, observations, startDate, endDate, dates: rawDates } = req.body;

    if (!studentId) {
      return res.status(400).json({ success: false, message: 'El estudiante es requerido' });
    }

    // Resolve reason
    const resolvedReason = REASON_MAP[reason] || reason;
    if (!['Enfermedad', 'Cita médica', 'Emergencia familiar', 'Trámites oficiales', 'Otros'].includes(resolvedReason)) {
      return res.status(400).json({ success: false, message: `Motivo inválido: ${reason}` });
    }

    // Resolve dates
    let justificationDates;
    if (rawDates && Array.isArray(rawDates) && rawDates.length > 0) {
      justificationDates = rawDates.map(d => new Date(d));
    } else if (startDate) {
      justificationDates = generateDateRange(startDate, endDate || startDate);
    } else {
      return res.status(400).json({ success: false, message: 'Las fechas son requeridas' });
    }

    // Verify student belongs to parent
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Estudiante no encontrado' });
    }

    const parentId = req.userId.toString();
    const isLinked =
      student.parent?.toString() === parentId ||
      (student.guardians || []).some(g => g.toString() === parentId);

    if (!isLinked) {
      return res.status(403).json({ success: false, message: 'No tiene acceso a este estudiante' });
    }

    // Upload documents to R2
    const documents = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        try {
          const uploaded = await r2Storage.uploadMulterFile(file, 'justifications');
          documents.push({
            filename: uploaded.filename || file.originalname,
            originalName: file.originalname,
            path: uploaded.key || file.path,
            url: uploaded.url,
            key: uploaded.key,
            storage: uploaded.storage || 'local',
            mimetype: file.mimetype,
            size: file.size || uploaded.size,
          });
        } catch (uploadErr) {
          console.error('File upload error:', uploadErr);
        }
      }
    }

    const justification = await Justification.create({
      student: studentId,
      parent: req.userId,
      dates: justificationDates,
      reason: resolvedReason,
      observations: observations || '',
      documents,
    });

    await justification.populate([
      { path: 'student', select: 'firstName lastName gradeLevel section' },
    ]);

    // Notify admins
    try {
      const { User } = require('../models');
      const admins = await User.find({ role: 'administrativo', isActive: true }).select('_id');
      if (admins.length > 0) {
        await Notification.create(admins.map(a => ({
          recipient: a._id,
          title: 'Nueva justificación',
          message: `${student.firstName} ${student.lastName} - ${resolvedReason} (${justificationDates.length} día${justificationDates.length > 1 ? 's' : ''})`,
          type: 'info',
          data: { studentId },
        })));
      }
    } catch (notifErr) {
      console.error('Notification error:', notifErr);
    }

    res.status(201).json({
      success: true,
      message: 'Justificación enviada exitosamente',
      data: { justification },
    });
  } catch (error) {
    console.error('Create justification error:', error);
    res.status(500).json({ success: false, message: 'Error al crear justificación', error: error.message });
  }
});

// ============ POST /api/justifications/:id/documents ============
router.post('/:id/documents', auth, authorize('padre'), upload.array('documents', 5), async (req, res) => {
  try {
    const justification = await Justification.findOne({
      _id: req.params.id,
      parent: req.userId,
      status: 'pending',
    });

    if (!justification) {
      return res.status(404).json({ success: false, message: 'Justificación no encontrada o ya fue revisada' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'No se enviaron archivos' });
    }

    for (const file of req.files) {
      const uploaded = await r2Storage.uploadMulterFile(file, 'justifications');
      justification.documents.push({
        filename: uploaded.filename || file.originalname,
        originalName: file.originalname,
        path: uploaded.key || file.path,
        url: uploaded.url,
        key: uploaded.key,
        storage: uploaded.storage || 'local',
        mimetype: file.mimetype,
        size: file.size || uploaded.size,
      });
    }

    await justification.save();

    res.json({
      success: true,
      message: `${req.files.length} documento(s) agregado(s)`,
      data: { justification },
    });
  } catch (error) {
    console.error('Add documents error:', error);
    res.status(500).json({ success: false, message: 'Error al subir documentos' });
  }
});

// ============ PUT /api/justifications/:id/review ============
router.put('/:id/review', auth, authorize('administrativo', 'docente'), async (req, res) => {
  try {
    const { status, reviewNote, reviewNotes } = req.body;

    let normalizedStatus = status;
    if (status === 'aprobada' || status === 'approved') normalizedStatus = 'approved';
    else if (status === 'rechazada' || status === 'rejected') normalizedStatus = 'rejected';
    else {
      return res.status(400).json({ success: false, message: 'Estado inválido' });
    }

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
      return res.status(404).json({ success: false, message: 'Justificación no encontrada' });
    }

    // If APPROVED: auto-update attendance records to 'justified'
    if (normalizedStatus === 'approved') {
      let totalUpdated = 0;
      for (const date of justification.dates) {
        const dayStart = new Date(date);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(date);
        dayEnd.setHours(23, 59, 59, 999);

        const result = await Attendance.updateMany(
          {
            student: justification.student._id,
            date: { $gte: dayStart, $lte: dayEnd },
            status: { $in: ['absent', 'late'] },
          },
          {
            $set: {
              status: 'justified',
              justification: justification._id,
              observations: `Justificado: ${justification.reason}`,
            },
          }
        );
        totalUpdated += result.modifiedCount;
      }
      console.log(`Auto-justified ${totalUpdated} attendance records`);
    }

    // Notify parent
    try {
      const statusText = normalizedStatus === 'approved' ? 'APROBADA ✅' : 'RECHAZADA ❌';
      await Notification.create({
        recipient: justification.parent,
        title: `Justificación ${statusText}`,
        message: `La justificación de ${justification.student.firstName} ${justification.student.lastName} ha sido ${normalizedStatus === 'approved' ? 'aprobada' : 'rechazada'}. ${note ? `Nota: ${note}` : ''}`,
        type: normalizedStatus === 'approved' ? 'success' : 'warning',
        data: { studentId: justification.student._id },
      });
    } catch (notifErr) {
      console.error('Notification error:', notifErr);
    }

    res.json({
      success: true,
      message: `Justificación ${normalizedStatus}`,
      data: { justification },
    });
  } catch (error) {
    console.error('Review justification error:', error);
    res.status(500).json({ success: false, message: 'Error al revisar justificación' });
  }
});

// ============ DELETE /api/justifications/:id ============
router.delete('/:id', auth, authorize('padre'), async (req, res) => {
  try {
    const justification = await Justification.findOne({
      _id: req.params.id,
      parent: req.userId,
      status: 'pending',
    });

    if (!justification) {
      return res.status(404).json({ success: false, message: 'Justificación no encontrada o no puede ser eliminada' });
    }

    // Delete R2 files
    for (const doc of justification.documents) {
      if (doc.key && doc.storage === 'r2') {
        try { await r2Storage.deleteFile(doc.key); } catch (e) { /* ignore */ }
      }
    }

    await justification.deleteOne();
    res.json({ success: true, message: 'Justificación eliminada' });
  } catch (error) {
    console.error('Delete justification error:', error);
    res.status(500).json({ success: false, message: 'Error al eliminar justificación' });
  }
});

module.exports = router;
