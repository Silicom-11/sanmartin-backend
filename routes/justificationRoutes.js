// Rutas de Justificaciones - San Martín Digital
// Supports file upload to Cloudflare R2 (or local fallback)
// Auto-justify: approved justifications auto-apply to attendance records

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { Justification, Attendance, Student, Notification, Parent, User } = require('../models');
const { auth, authorize } = require('../middleware/auth');
const r2Storage = require('../services/r2Storage');

// Helper: resolve parent info from Parent or User collection (dual collection problem)
const resolveParent = async (parentId) => {
  if (!parentId) return null;
  // Try Parent collection first
  let parent = await Parent.findById(parentId).select('firstName lastName email phone userId').lean();
  if (parent) return parent;
  // Try User collection
  parent = await User.findById(parentId).select('firstName lastName email phone').lean();
  if (parent) return parent;
  // Try finding Parent by userId
  parent = await Parent.findOne({ userId: parentId }).select('firstName lastName email phone userId').lean();
  return parent;
};

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

    // Add document URLs + resolve parent from either collection
    const result = [];
    for (const j of justifications) {
      const obj = j.toObject();
      // Resolve parent if populate returned null (dual collection problem)
      if (!obj.parent && j._doc?.parent) {
        obj.parent = await resolveParent(j._doc.parent);
      } else if (!obj.parent && obj.parent === null) {
        // Try raw query to get the stored ObjectId
        const raw = await Justification.findById(j._id).select('parent').lean();
        if (raw?.parent) obj.parent = await resolveParent(raw.parent);
      }
      obj.documents = (obj.documents || []).map(doc => ({
        ...doc,
        url: doc.url || (doc.key ? r2Storage.getFileUrl(doc.key) : (doc.path ? `/uploads/${doc.path}` : null)),
      }));
      result.push(obj);
    }

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

    const result = [];
    for (const j of justifications) {
      const obj = j.toObject();
      if (!obj.parent) {
        const raw = await Justification.findById(j._id).select('parent').lean();
        if (raw?.parent) obj.parent = await resolveParent(raw.parent);
      }
      obj.documents = (obj.documents || []).map(doc => ({
        ...doc,
        url: doc.url || (doc.key ? r2Storage.getFileUrl(doc.key) : null),
      }));
      result.push(obj);
    }

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
      .populate('parent', 'firstName lastName')
      .select('student parent reason dates documents observations createdAt')
      .lean();

    const justifiedStudents = {};
    for (const j of justifications) {
      const sid = j.student?._id?.toString();
      if (!sid) continue;
      // Resolve parent if populate returned null
      let parentDoc = j.parent;
      if (!parentDoc) {
        // Get raw parent ID from a lean query without populate
        const raw = await Justification.findById(j._id).select('parent').lean();
        if (raw?.parent) parentDoc = await resolveParent(raw.parent);
      }
      justifiedStudents[sid] = {
        reason: j.reason,
        hasDocuments: (j.documents || []).length > 0,
        documentCount: (j.documents || []).length,
        justificationId: j._id,
        parentName: parentDoc ? `${parentDoc.firstName} ${parentDoc.lastName}` : null,
        observations: j.observations || null,
        documents: (j.documents || []).map(doc => ({
          name: doc.originalName || doc.filename,
          url: doc.url || (doc.key ? r2Storage.getFileUrl(doc.key) : null),
          mimetype: doc.mimetype,
          storage: doc.storage,
        })),
        createdAt: j.createdAt,
      };
    }

    res.json({ success: true, data: justifiedStudents });
  } catch (error) {
    console.error('Get approved justifications error:', error);
    res.status(500).json({ success: false, message: 'Error' });
  }
});

// ============ GET /api/justifications/for-date ============
// Returns ALL justifications (any status) for a date - for attendance eye icon
router.get('/for-date', auth, async (req, res) => {
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
      dates: { $elemMatch: { $gte: targetDate, $lt: endDate } },
    })
      .populate('student', 'firstName lastName gradeLevel section')
      .populate('parent', 'firstName lastName email phone')
      .select('student parent reason dates documents observations status createdAt reviewedAt reviewNote')
      .sort({ createdAt: -1 })
      .lean();

    const result = {};
    for (const j of justifications) {
      const sid = j.student?._id?.toString();
      if (!sid) continue;
      // Resolve parent if populate returned null
      let parentDoc = j.parent;
      if (!parentDoc) {
        const raw = await Justification.findById(j._id).select('parent').lean();
        if (raw?.parent) parentDoc = await resolveParent(raw.parent);
      }
      result[sid] = {
        justificationId: j._id,
        status: j.status,
        reason: j.reason,
        observations: j.observations || null,
        parentName: parentDoc ? `${parentDoc.firstName} ${parentDoc.lastName}` : null,
        parentEmail: parentDoc?.email,
        parentPhone: parentDoc?.phone,
        documents: (j.documents || []).map(doc => ({
          name: doc.originalName || doc.filename,
          url: doc.url || (doc.key ? r2Storage.getFileUrl(doc.key) : null),
          mimetype: doc.mimetype,
          size: doc.size,
          storage: doc.storage,
        })),
        documentCount: (j.documents || []).length,
        createdAt: j.createdAt,
        reviewedAt: j.reviewedAt,
        reviewNote: j.reviewNote,
      };
    }

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Get justifications for date error:', error);
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

    const obj = justification.toObject();
    
    // Resolve parent if populate returned null (dual collection problem)
    if (!obj.parent) {
      const raw = await Justification.findById(justification._id).select('parent').lean();
      if (raw?.parent) obj.parent = await resolveParent(raw.parent);
    }

    // Access check for parents
    if (req.user.role === 'padre') {
      const parentId = obj.parent?._id?.toString();
      if (parentId !== req.userId.toString()) {
        // Also check if parent's userId matches
        const parentUserId = obj.parent?.userId?.toString();
        if (parentUserId !== req.userId.toString()) {
          return res.status(403).json({ success: false, message: 'No tiene acceso' });
        }
      }
    }

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
    let isLinked = false;

    // Check 1: Student.parent field
    if (student.parent?.toString() === parentId) {
      isLinked = true;
    }

    // Check 2: Student.guardians array (each guardian has .user and .parent fields)
    if (!isLinked && student.guardians?.length > 0) {
      isLinked = student.guardians.some(g => 
        g.user?.toString() === parentId || g.parent?.toString() === parentId
      );
    }

    // Check 3: Parent collection — parent.children[].student
    if (!isLinked) {
      const Parent = require('../models/Parent');
      const parentRecord = await Parent.findById(parentId);
      if (parentRecord?.children?.length > 0) {
        isLinked = parentRecord.children.some(c => c.student?.toString() === studentId.toString());
      }
    }

    // Check 4: Parent collection — find any parent doc that has this user AND this student
    if (!isLinked) {
      const Parent = require('../models/Parent');
      const parentByEmail = await Parent.findOne({ 'children.student': studentId });
      if (parentByEmail && parentByEmail._id.toString() === parentId) {
        isLinked = true;
      }
    }

    console.log(`🔍 Justification access check: parent=${parentId}, student=${studentId}, isLinked=${isLinked}`);

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
