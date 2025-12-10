// Modelo de Asistencia - San Martín Digital
const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: [true, 'El estudiante es requerido'],
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: [true, 'El curso es requerido'],
  },
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'El docente es requerido'],
  },
  date: {
    type: Date,
    required: [true, 'La fecha es requerida'],
  },
  status: {
    type: String,
    enum: ['present', 'absent', 'late', 'justified'],
    required: [true, 'El estado es requerido'],
  },
  arrivalTime: {
    type: String, // HH:mm
  },
  observations: {
    type: String,
    trim: true,
  },
  // Si tiene justificación asociada
  justification: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Justification',
  },
}, {
  timestamps: true,
});

// Índices
attendanceSchema.index({ student: 1, course: 1, date: 1 }, { unique: true });
attendanceSchema.index({ course: 1, date: 1 });
attendanceSchema.index({ date: 1 });

// Métodos estáticos
attendanceSchema.statics.getStudentAttendanceStats = async function(studentId, startDate, endDate) {
  const stats = await this.aggregate([
    {
      $match: {
        student: new mongoose.Types.ObjectId(studentId),
        date: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
      },
    },
  ]);
  
  const result = {
    present: 0,
    absent: 0,
    late: 0,
    justified: 0,
    total: 0,
  };
  
  stats.forEach(stat => {
    result[stat._id] = stat.count;
    result.total += stat.count;
  });
  
  result.attendanceRate = result.total > 0 
    ? ((result.present + result.late + result.justified) / result.total * 100).toFixed(2) 
    : 0;
  
  return result;
};

const Attendance = mongoose.model('Attendance', attendanceSchema);

module.exports = Attendance;
