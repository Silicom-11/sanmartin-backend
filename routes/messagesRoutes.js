// Rutas de Mensajería - San Martín Digital
const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { Conversation, Message, User, Teacher, Parent } = require('../models');

// Helper: resolve user from any collection (User, Teacher, Parent)
async function resolveUser(userId) {
  const fields = 'firstName lastName email role avatar';
  let user = await User.findById(userId).select(fields).lean();
  if (user) return user;
  const teacher = await Teacher.findById(userId).select('firstName lastName email specialty avatar').lean();
  if (teacher) return { ...teacher, role: 'docente' };
  const parent = await Parent.findById(userId).select('firstName lastName email phone avatar').lean();
  if (parent) return { ...parent, role: 'padre' };
  return null;
}

// Helper: resolve all participants in conversations
async function resolveParticipants(conversations) {
  // Collect all unique participant IDs
  const allIds = new Set();
  for (const conv of conversations) {
    for (const p of conv.participants || []) {
      allIds.add((p._id || p).toString());
    }
  }

  // Batch resolve from all collections
  const idArray = [...allIds];
  const users = await User.find({ _id: { $in: idArray } }).select('firstName lastName email role avatar').lean();
  const teachers = await Teacher.find({ _id: { $in: idArray } }).select('firstName lastName email specialty avatar').lean();
  const parents = await Parent.find({ _id: { $in: idArray } }).select('firstName lastName email phone avatar').lean();

  const map = {};
  for (const u of users) map[u._id.toString()] = u;
  for (const t of teachers) { if (!map[t._id.toString()]) map[t._id.toString()] = { ...t, role: 'docente' }; }
  for (const p of parents) { if (!map[p._id.toString()]) map[p._id.toString()] = { ...p, role: 'padre' }; }

  return map;
}

// GET /api/messages/conversations - Obtener conversaciones del usuario
router.get('/conversations', auth, async (req, res) => {
  try {
    const conversations = await Conversation.find({
      participants: req.userId,
      isActive: true
    })
      .populate('lastMessage.sender', 'firstName lastName')
      .sort({ 'lastMessage.sentAt': -1, updatedAt: -1 })
      .lean();

    // Resolve participants from all collections (User, Teacher, Parent)
    const participantMap = await resolveParticipants(conversations);

    // Also resolve lastMessage sender if not populated
    for (const conv of conversations) {
      if (conv.lastMessage?.sender && typeof conv.lastMessage.sender === 'string') {
        conv.lastMessage.sender = participantMap[conv.lastMessage.sender] || null;
      }
    }

    // Format for frontend
    const formattedConversations = conversations.map(conv => {
      const resolvedParticipants = (conv.participants || [])
        .map(p => {
          const id = (p._id || p).toString();
          return participantMap[id] || null;
        })
        .filter(Boolean);

      const otherParticipants = resolvedParticipants.filter(
        p => p._id.toString() !== req.userId.toString()
      );

      const unreadCount = conv.unreadCount?.[req.userId.toString()] || 0;

      return {
        _id: conv._id,
        type: conv.type,
        name: conv.name || otherParticipants.map(p => `${p.firstName} ${p.lastName}`).join(', ') || 'Conversación',
        participants: otherParticipants,
        lastMessage: conv.lastMessage,
        unreadCount,
        updatedAt: conv.updatedAt
      };
    });

    res.json({
      success: true,
      data: formattedConversations
    });
  } catch (error) {
    console.error('Error obteniendo conversaciones:', error);
    res.status(500).json({ success: false, message: 'Error del servidor' });
  }
});

// GET /api/messages/conversations/:id - Obtener mensajes de una conversación
router.get('/conversations/:id', auth, async (req, res) => {
  try {
    const conversation = await Conversation.findOne({
      _id: req.params.id,
      participants: req.userId
    }).lean();

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversación no encontrada'
      });
    }

    // Resolve participants from all collections
    const participantMap = await resolveParticipants([conversation]);

    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const skip = (page - 1) * limit;

    const messages = await Message.find({
      conversation: conversation._id,
      isDeleted: false
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Resolve senders from all collections
    const senderIds = [...new Set(messages.map(m => m.sender?.toString()).filter(Boolean))];
    const senderMap = {};
    for (const id of senderIds) {
      senderMap[id] = participantMap[id] || await resolveUser(id);
    }
    for (const msg of messages) {
      if (msg.sender) {
        msg.sender = senderMap[msg.sender.toString()] || { _id: msg.sender, firstName: '?', lastName: '' };
      }
    }

    // Mark messages as read
    await Message.updateMany(
      {
        conversation: conversation._id,
        'readBy.user': { $ne: req.userId }
      },
      {
        $push: { readBy: { user: req.userId, readAt: new Date() } }
      }
    );

    // Reset unread count
    await Conversation.updateOne(
      { _id: conversation._id },
      { $set: { [`unreadCount.${req.userId.toString()}`]: 0 } }
    );

    const total = await Message.countDocuments({
      conversation: conversation._id,
      isDeleted: false
    });

    res.json({
      success: true,
      data: {
        conversation: {
          ...conversation,
          participants: (conversation.participants || []).map(p => participantMap[(p._id || p).toString()] || p),
        },
        messages: messages.reverse(),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error obteniendo mensajes:', error);
    res.status(500).json({ success: false, message: 'Error del servidor' });
  }
});

// POST /api/messages/send - Enviar mensaje
router.post('/send', auth, async (req, res) => {
  try {
    const { conversationId, recipientId, content, type = 'text' } = req.body;

    if (!content || content.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'El contenido es requerido'
      });
    }

    let conversation;

    if (conversationId) {
      // Usar conversación existente
      conversation = await Conversation.findOne({
        _id: conversationId,
        participants: req.userId
      });

      if (!conversation) {
        return res.status(404).json({
          success: false,
          message: 'Conversación no encontrada'
        });
      }
    } else if (recipientId) {
      // Crear o encontrar conversación directa
      conversation = await Conversation.findOrCreateDirect(req.userId, recipientId);
    } else {
      return res.status(400).json({
        success: false,
        message: 'Se requiere conversationId o recipientId'
      });
    }

    // Crear mensaje
    const message = new Message({
      conversation: conversation._id,
      sender: req.userId,
      content: content.trim(),
      type,
      readBy: [{ user: req.userId, readAt: new Date() }]
    });

    await message.save();

    // Actualizar lastMessage en conversación
    conversation.lastMessage = {
      content: content.trim(),
      sender: req.userId,
      sentAt: new Date()
    };

    // Incrementar contador de no leídos para otros participantes
    conversation.participants.forEach(participantId => {
      if (participantId.toString() !== req.userId.toString()) {
        const currentCount = conversation.unreadCount.get(participantId.toString()) || 0;
        conversation.unreadCount.set(participantId.toString(), currentCount + 1);
      }
    });

    await conversation.save();

    // Resolve sender from all collections
    const senderData = await resolveUser(req.userId);
    const messageObj = message.toObject();
    messageObj.sender = senderData || { _id: req.userId, firstName: '?', lastName: '' };

    res.status(201).json({
      success: true,
      data: messageObj
    });
  } catch (error) {
    console.error('Error enviando mensaje:', error);
    res.status(500).json({ success: false, message: 'Error del servidor' });
  }
});

// GET /api/messages/contacts - Obtener contactos disponibles para mensajes
router.get('/contacts', auth, async (req, res) => {
  try {
    // Buscar usuario actual en todas las colecciones
    let currentUser = await User.findById(req.userId);
    let currentRole = currentUser?.role;
    if (!currentUser) {
      const teacher = await Teacher.findById(req.userId);
      if (teacher) { currentUser = teacher; currentRole = 'docente'; }
    }
    if (!currentUser) {
      const parent = await Parent.findById(req.userId);
      if (parent) { currentUser = parent; currentRole = 'padre'; }
    }
    
    let contacts = [];
    
    if (currentRole === 'padre') {
      // Padres: docentes + administrativos
      const usersContacts = await User.find({ _id: { $ne: req.userId }, isActive: true, role: { $in: ['docente', 'administrativo'] } })
        .select('firstName lastName email role avatar');
      const teacherContacts = await Teacher.find({ _id: { $ne: req.userId }, isActive: true })
        .select('firstName lastName email specialty');
      contacts = [
        ...usersContacts.map(u => ({ ...u.toObject(), source: 'users' })),
        ...teacherContacts.map(t => ({ ...t.toObject(), role: 'docente', source: 'teachers' }))
      ];
    } else if (currentRole === 'docente') {
      // Docentes: padres + administrativos
      const usersContacts = await User.find({ _id: { $ne: req.userId }, isActive: true, role: { $in: ['padre', 'administrativo'] } })
        .select('firstName lastName email role avatar');
      const parentContacts = await Parent.find({ _id: { $ne: req.userId }, isActive: true })
        .select('firstName lastName email phone');
      contacts = [
        ...usersContacts.map(u => ({ ...u.toObject(), source: 'users' })),
        ...parentContacts.map(p => ({ ...p.toObject(), role: 'padre', source: 'parents' }))
      ];
    } else {
      // Administrativos: todos
      const usersContacts = await User.find({ _id: { $ne: req.userId }, isActive: true })
        .select('firstName lastName email role avatar');
      const teacherContacts = await Teacher.find({ _id: { $ne: req.userId }, isActive: true })
        .select('firstName lastName email specialty');
      const parentContacts = await Parent.find({ _id: { $ne: req.userId }, isActive: true })
        .select('firstName lastName email phone');
      contacts = [
        ...usersContacts.map(u => ({ ...u.toObject(), source: 'users' })),
        ...teacherContacts.map(t => ({ ...t.toObject(), role: 'docente', source: 'teachers' })),
        ...parentContacts.map(p => ({ ...p.toObject(), role: 'padre', source: 'parents' }))
      ];
    }
    
    // Ordenar por nombre
    contacts.sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));

    res.json({
      success: true,
      data: contacts
    });
  } catch (error) {
    console.error('Error obteniendo contactos:', error);
    res.status(500).json({ success: false, message: 'Error del servidor' });
  }
});

// GET /api/messages/unread-count - Contar mensajes no leidos
router.get('/unread-count', auth, async (req, res) => {
  try {
    const conversations = await Conversation.find({
      participants: req.userId,
      isActive: true
    }).select('unreadCount').lean();

    let totalUnread = 0;
    const userIdStr = req.userId.toString();
    conversations.forEach(conv => {
      // unreadCount is a Map in Mongoose but a plain object when using lean()
      const uc = conv.unreadCount;
      if (uc) {
        if (typeof uc.get === 'function') {
          totalUnread += uc.get(userIdStr) || 0;
        } else if (uc[userIdStr]) {
          totalUnread += uc[userIdStr];
        }
      }
    });

    res.json({
      success: true,
      data: { count: totalUnread }
    });
  } catch (error) {
    console.error('Error contando mensajes:', error);
    res.status(500).json({ success: false, message: 'Error del servidor' });
  }
});

// DELETE /api/messages/:id - Eliminar mensaje (soft delete)
router.delete('/:id', auth, async (req, res) => {
  try {
    const message = await Message.findOneAndUpdate(
      { _id: req.params.id, sender: req.userId },
      { isDeleted: true },
      { new: true }
    );

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Mensaje no encontrado o no autorizado'
      });
    }

    res.json({
      success: true,
      message: 'Mensaje eliminado'
    });
  } catch (error) {
    console.error('Error eliminando mensaje:', error);
    res.status(500).json({ success: false, message: 'Error del servidor' });
  }
});

module.exports = router;
