// Modelo de Evento - San Martín Digital
const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'El título es requerido'],
    trim: true
  },
  date: {
    type: String,
    required: [true, 'La fecha es requerida']
  },
  time: {
    type: String,
    default: ''
  },
  type: {
    type: String,
    enum: ['exam', 'meeting', 'holiday', 'activity', 'deadline'],
    default: 'activity'
  },
  description: {
    type: String,
    default: ''
  },
  location: {
    type: String,
    default: ''
  },
  participants: {
    type: String,
    default: ''
  },
  notifyStudents: {
    type: Boolean,
    default: false
  },
  notifyParents: {
    type: Boolean,
    default: false
  },
  notifyTeachers: {
    type: Boolean,
    default: false
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Índices para búsquedas eficientes
eventSchema.index({ date: 1 });
eventSchema.index({ type: 1 });
eventSchema.index({ isActive: 1 });

module.exports = mongoose.model('Event', eventSchema);
