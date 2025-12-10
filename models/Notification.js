// Modelo de Notificación - San Martín Digital
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'El destinatario es requerido'],
  },
  title: {
    type: String,
    required: [true, 'El título es requerido'],
    trim: true,
  },
  message: {
    type: String,
    required: [true, 'El mensaje es requerido'],
    trim: true,
  },
  type: {
    type: String,
    enum: ['info', 'warning', 'success', 'error', 'grade', 'attendance', 'event', 'payment'],
    default: 'info',
  },
  // Datos adicionales según el tipo
  data: {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
    gradeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Grade' },
    attendanceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Attendance' },
    link: String,
  },
  isRead: {
    type: Boolean,
    default: false,
  },
  readAt: Date,
  // Expiración opcional
  expiresAt: Date,
}, {
  timestamps: true,
});

// Índices
notificationSchema.index({ recipient: 1, isRead: 1 });
notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Método estático para crear notificaciones masivas
notificationSchema.statics.createBulk = async function(recipientIds, notificationData) {
  const notifications = recipientIds.map(recipientId => ({
    recipient: recipientId,
    ...notificationData,
  }));
  return await this.insertMany(notifications);
};

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
