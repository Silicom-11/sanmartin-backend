// Rutas de Notificaciones - San Martín Digital
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { Notification, User, Teacher, Parent, Student } = require('../models');
const { auth, authorize } = require('../middleware/auth');

// GET /api/notifications - Listar notificaciones del usuario
router.get('/', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    let query = { recipient: req.userId };
    
    if (req.query.unread === 'true') {
      query.isRead = false;
    }

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('data.studentId', 'firstName lastName')
        .populate('data.courseId', 'name'),
      Notification.countDocuments(query),
      Notification.countDocuments({ recipient: req.userId, isRead: false }),
    ]);

    res.json({
      success: true,
      data: {
        notifications,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
        unreadCount,
      },
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener notificaciones',
    });
  }
});

// GET /api/notifications/unread-count - Contar no leídas
router.get('/unread-count', auth, async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      recipient: req.userId,
      isRead: false,
    });

    res.json({
      success: true,
      data: { count },
    });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener conteo',
    });
  }
});

// PUT /api/notifications/:id/read - Marcar como leída
router.put('/:id/read', auth, async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.userId },
      { isRead: true, readAt: new Date() },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notificación no encontrada',
      });
    }

    res.json({
      success: true,
      data: { notification },
    });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al marcar notificación',
    });
  }
});

// PUT /api/notifications/read-all - Marcar todas como leídas
router.put('/read-all', auth, async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.userId, isRead: false },
      { isRead: true, readAt: new Date() }
    );

    res.json({
      success: true,
      message: 'Todas las notificaciones marcadas como leídas',
    });
  } catch (error) {
    console.error('Mark all as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al marcar notificaciones',
    });
  }
});

// POST /api/notifications - Crear notificación (admin)
router.post('/', auth, authorize('administrativo'), [
  body('recipientId').notEmpty().withMessage('El destinatario es requerido'),
  body('title').notEmpty().withMessage('El título es requerido'),
  body('message').notEmpty().withMessage('El mensaje es requerido'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { recipientId, title, message, type, data } = req.body;

    const notification = await Notification.create({
      recipient: recipientId,
      title,
      message,
      type: type || 'info',
      data,
    });

    res.status(201).json({
      success: true,
      message: 'Notificación creada',
      data: { notification },
    });
  } catch (error) {
    console.error('Create notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear notificación',
    });
  }
});

// POST /api/notifications/broadcast - Enviar a múltiples usuarios
router.post('/broadcast', auth, authorize('administrativo', 'docente'), [
  body('title').notEmpty().withMessage('El título es requerido'),
  body('message').notEmpty().withMessage('El mensaje es requerido'),
], async (req, res) => {
  try {
    const { title, message, type, roles, recipientIds } = req.body;

    let recipients = [];

    if (recipientIds && recipientIds.length > 0) {
      recipients = recipientIds;
    } else if (roles && roles.length > 0) {
      // Buscar en todas las colecciones según roles
      const userRecipients = await User.find({ role: { $in: roles }, isActive: true }).select('_id');
      recipients = userRecipients.map(u => u._id);
      
      if (roles.includes('docente')) {
        const teacherRecipients = await Teacher.find({ isActive: true }).select('_id');
        recipients = [...recipients, ...teacherRecipients.map(t => t._id)];
      }
      if (roles.includes('padre')) {
        const parentRecipients = await Parent.find({ isActive: true }).select('_id');
        recipients = [...recipients, ...parentRecipients.map(p => p._id)];
      }
      if (roles.includes('estudiante')) {
        const studentRecipients = await Student.find({ isActive: true }).select('_id');
        recipients = [...recipients, ...studentRecipients.map(s => s._id)];
      }
    } else {
      // Enviar a TODOS los usuarios activos en todas las colecciones
      const [users, teachers, parents, students] = await Promise.all([
        User.find({ isActive: true }).select('_id'),
        Teacher.find({ isActive: true }).select('_id'),
        Parent.find({ isActive: true }).select('_id'),
        Student.find({ isActive: true }).select('_id'),
      ]);
      recipients = [
        ...users.map(u => u._id),
        ...teachers.map(t => t._id),
        ...parents.map(p => p._id),
        ...students.map(s => s._id),
      ];
    }

    if (recipients.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No hay destinatarios',
      });
    }

    // Crear notificaciones en masa
    const notifications = recipients.map(recipientId => ({
      recipient: recipientId,
      title,
      message,
      type: type || 'info',
      isRead: false,
      createdAt: new Date()
    }));

    await Notification.insertMany(notifications);

    res.json({
      success: true,
      message: `Notificación enviada a ${recipients.length} usuarios`,
      data: { recipientCount: recipients.length }
    });
  } catch (error) {
    console.error('Broadcast notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al enviar notificaciones',
    });
  }
});

// DELETE /api/notifications/:id - Eliminar notificación
router.delete('/:id', auth, async (req, res) => {
  try {
    const notification = await Notification.findOneAndDelete({
      _id: req.params.id,
      recipient: req.userId,
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notificación no encontrada',
      });
    }

    res.json({
      success: true,
      message: 'Notificación eliminada',
    });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar notificación',
    });
  }
});

module.exports = router;
