// Modelo de Mensaje - San Martín Digital
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  conversation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: [true, 'La conversación es requerida']
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'El remitente es requerido']
  },
  content: {
    type: String,
    required: [true, 'El contenido es requerido'],
    trim: true
  },
  type: {
    type: String,
    enum: ['text', 'image', 'file', 'system'],
    default: 'text'
  },
  attachments: [{
    name: String,
    url: String,
    type: String,
    size: Number
  }],
  readBy: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    readAt: { type: Date, default: Date.now }
  }],
  isDeleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indices para busquedas eficientes
messageSchema.index({ conversation: 1, createdAt: -1 });
messageSchema.index({ sender: 1 });
messageSchema.index({ conversation: 1, isDeleted: 1, createdAt: -1 }); // Para paginacion de mensajes
messageSchema.index({ conversation: 1, 'readBy.user': 1 }); // Para marcar como leido

const Message = mongoose.model('Message', messageSchema);

module.exports = Message;
