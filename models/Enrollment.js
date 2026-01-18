// Modelo de Matrícula - San Martín Digital
const mongoose = require('mongoose');

const enrollmentSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: [true, 'El estudiante es requerido'],
  },
  classroom: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Classroom',
    required: [true, 'El aula es requerida'],
  },
  academicYear: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AcademicYear',
    required: [true, 'El año académico es requerido'],
  },
  
  // Fecha de matrícula
  enrollmentDate: {
    type: Date,
    default: Date.now,
  },
  
  // Código de matrícula único
  enrollmentNumber: {
    type: String,
    required: true,
    unique: true,
  },
  
  // Estado de la matrícula
  status: {
    type: String,
    enum: ['matriculado', 'retirado', 'trasladado', 'promovido', 'repitente', 'reservado'],
    default: 'matriculado',
  },
  statusDate: {
    type: Date,
    default: Date.now,
  },
  statusReason: {
    type: String,
    trim: true,
  },
  
  // Tipo de matrícula
  enrollmentType: {
    type: String,
    enum: ['regular', 'traslado', 'reingreso', 'extemporanea'],
    default: 'regular',
  },
  
  // Historial de cambios de estado
  statusHistory: [{
    status: String,
    date: { type: Date, default: Date.now },
    reason: String,
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  }],
  
  // Documentos de matrícula
  documents: {
    enrollmentForm: String,        // Ficha de matrícula
    paymentReceipt: String,        // Constancia de pago
    commitmentLetter: String,      // Carta compromiso
    previousReport: String,        // Libreta anterior
  },
  
  // Datos adicionales
  previousClassroom: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Classroom',
  },
  previousSchool: {
    type: String,
    trim: true,
  },
  
  // Observaciones
  observations: {
    type: String,
    trim: true,
  },
  
  // Quién realizó la matrícula
  enrolledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  
  isActive: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Virtual para verificar si está vigente
enrollmentSchema.virtual('isCurrentlyEnrolled').get(function() {
  return this.status === 'matriculado' && this.isActive;
});

// Índices
enrollmentSchema.index({ student: 1, academicYear: 1 }, { unique: true });
enrollmentSchema.index({ classroom: 1 });
enrollmentSchema.index({ academicYear: 1, status: 1 });
enrollmentSchema.index({ enrollmentNumber: 1 }, { unique: true });

// Middleware: Generar número de matrícula antes de guardar
enrollmentSchema.pre('save', async function(next) {
  if (this.isNew && !this.enrollmentNumber) {
    const AcademicYear = mongoose.model('AcademicYear');
    const Classroom = mongoose.model('Classroom');
    
    const year = await AcademicYear.findById(this.academicYear);
    const classroom = await Classroom.findById(this.classroom).populate('gradeLevel');
    
    // Formato: 2026-1PA-001
    const count = await this.constructor.countDocuments({
      academicYear: this.academicYear,
      classroom: this.classroom,
    });
    
    const gradeCode = classroom.gradeLevel?.shortName || 'XX';
    const section = classroom.section || 'X';
    const sequence = String(count + 1).padStart(3, '0');
    
    this.enrollmentNumber = `${year?.year || new Date().getFullYear()}-${gradeCode}${section}-${sequence}`;
  }
  next();
});

// Middleware: Agregar al historial cuando cambia el estado
enrollmentSchema.pre('save', function(next) {
  if (this.isModified('status')) {
    this.statusDate = new Date();
    this.statusHistory.push({
      status: this.status,
      date: new Date(),
      reason: this.statusReason,
    });
  }
  next();
});

// Middleware: Actualizar estadísticas del aula después de guardar
enrollmentSchema.post('save', async function() {
  const Classroom = mongoose.model('Classroom');
  const classroom = await Classroom.findById(this.classroom);
  if (classroom) {
    await classroom.updateStats();
  }
});

// Método estático para obtener la matrícula actual de un estudiante
enrollmentSchema.statics.getCurrentEnrollment = async function(studentId) {
  const AcademicYear = mongoose.model('AcademicYear');
  const currentYear = await AcademicYear.findOne({ isCurrent: true });
  
  if (!currentYear) return null;
  
  return this.findOne({
    student: studentId,
    academicYear: currentYear._id,
    status: 'matriculado',
  }).populate(['classroom', 'academicYear']);
};

const Enrollment = mongoose.model('Enrollment', enrollmentSchema);

module.exports = Enrollment;
