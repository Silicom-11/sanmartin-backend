// Modelo de Conversación - San Martín Digital
const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  type: {
    type: String,
    enum: ['direct', 'group', 'support'],
    default: 'direct'
  },
  name: {
    type: String,
    trim: true
  },
  lastMessage: {
    content: String,
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    sentAt: Date
  },
  unreadCount: {
    type: Map,
    of: Number,
    default: {}
  },
  isActive: {
    type: Boolean,
    default: true
  },
  metadata: {
    // Para conversaciones relacionadas a estudiantes (padre-docente)
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' }
  }
}, {
  timestamps: true
});

// Índices
conversationSchema.index({ participants: 1 });
conversationSchema.index({ 'lastMessage.sentAt': -1 });

// Método para obtener el otro participante en conversación directa
conversationSchema.methods.getOtherParticipant = function(userId) {
  return this.participants.find(p => p.toString() !== userId.toString());
};

// Método estático para encontrar o crear conversación directa
conversationSchema.statics.findOrCreateDirect = async function(userId1, userId2) {
  let conversation = await this.findOne({
    type: 'direct',
    participants: { $all: [userId1, userId2], $size: 2 }
  });

  if (!conversation) {
    conversation = await this.create({
      type: 'direct',
      participants: [userId1, userId2]
    });
  }

  return conversation;
};

const Conversation = mongoose.model('Conversation', conversationSchema);

module.exports = Conversation;
