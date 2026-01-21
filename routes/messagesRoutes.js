// Rutas de Mensajería - San Martín Digital
const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { Conversation, Message, User } = require('../models');

// GET /api/messages/conversations - Obtener conversaciones del usuario
router.get('/conversations', auth, async (req, res) => {
  try {
    const conversations = await Conversation.find({
      participants: req.userId,
      isActive: true
    })
      .populate('participants', 'firstName lastName email role avatar')
      .populate('lastMessage.sender', 'firstName lastName')
      .sort({ 'lastMessage.sentAt': -1, updatedAt: -1 });

    // Formatear para el frontend
    const formattedConversations = conversations.map(conv => {
      const otherParticipants = conv.participants.filter(
        p => p._id.toString() !== req.userId.toString()
      );
      
      const unreadCount = conv.unreadCount?.get(req.userId.toString()) || 0;

      return {
        _id: conv._id,
        type: conv.type,
        name: conv.name || otherParticipants.map(p => `${p.firstName} ${p.lastName}`).join(', '),
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
    }).populate('participants', 'firstName lastName email role avatar');

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversación no encontrada'
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const messages = await Message.find({
      conversation: conversation._id,
      isDeleted: false
    })
      .populate('sender', 'firstName lastName avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Marcar mensajes como leídos
    await Message.updateMany(
      {
        conversation: conversation._id,
        'readBy.user': { $ne: req.userId }
      },
      {
        $push: { readBy: { user: req.userId, readAt: new Date() } }
      }
    );

    // Resetear contador de no leídos
    conversation.unreadCount.set(req.userId.toString(), 0);
    await conversation.save();

    const total = await Message.countDocuments({
      conversation: conversation._id,
      isDeleted: false
    });

    res.json({
      success: true,
      data: {
        conversation,
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

    // Poblar datos del mensaje
    await message.populate('sender', 'firstName lastName avatar');

    res.status(201).json({
      success: true,
      data: message
    });
  } catch (error) {
    console.error('Error enviando mensaje:', error);
    res.status(500).json({ success: false, message: 'Error del servidor' });
  }
});

// GET /api/messages/contacts - Obtener contactos disponibles para mensajes
router.get('/contacts', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    
    // Dependiendo del rol, mostrar diferentes contactos
    let query = { _id: { $ne: req.userId }, isActive: true };
    
    if (user.role === 'padre') {
      // Padres pueden contactar docentes
      query.role = { $in: ['docente', 'administrativo'] };
    } else if (user.role === 'estudiante') {
      // Estudiantes pueden contactar docentes
      query.role = 'docente';
    } else if (user.role === 'docente') {
      // Docentes pueden contactar padres y administración
      query.role = { $in: ['padre', 'administrativo'] };
    }
    // Administradores pueden contactar a todos

    const contacts = await User.find(query)
      .select('firstName lastName email role avatar')
      .sort({ firstName: 1, lastName: 1 });

    res.json({
      success: true,
      data: contacts
    });
  } catch (error) {
    console.error('Error obteniendo contactos:', error);
    res.status(500).json({ success: false, message: 'Error del servidor' });
  }
});

// GET /api/messages/unread-count - Contar mensajes no leídos
router.get('/unread-count', auth, async (req, res) => {
  try {
    const conversations = await Conversation.find({
      participants: req.userId,
      isActive: true
    });

    let totalUnread = 0;
    conversations.forEach(conv => {
      totalUnread += conv.unreadCount?.get(req.userId.toString()) || 0;
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
