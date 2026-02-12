// Modelo de Justificación - San Martín Digital
const mongoose = require('mongoose');

const justificationSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: [true, 'El estudiante es requerido'],
  },
  parent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Parent',
    required: [true, 'El apoderado es requerido'],
  },
  dates: [{
    type: Date,
    required: true,
  }],
  reason: {
    type: String,
    enum: ['Enfermedad', 'Cita médica', 'Emergencia familiar', 'Trámites oficiales', 'Otros'],
    required: [true, 'El motivo es requerido'],
  },
  observations: {
    type: String,
    trim: true,
  },
  documents: [{
    filename: String,
    originalName: String,
    path: String,
    url: String,
    key: String,
    storage: { type: String, enum: ['local', 'r2'], default: 'local' },
    mimetype: String,
    size: Number,
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  }],
  // Courses affected - for auto-justify when taking attendance
  coursesAffected: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
  }],
  // Estado de la solicitud
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'approved',
  },
  // Revisión
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  reviewedAt: Date,
  reviewNote: String,
}, {
  timestamps: true,
});

// Índices
justificationSchema.index({ student: 1, status: 1 });
justificationSchema.index({ parent: 1 });
justificationSchema.index({ status: 1 });
justificationSchema.index({ createdAt: -1 });

const Justification = mongoose.model('Justification', justificationSchema);

module.exports = Justification;
