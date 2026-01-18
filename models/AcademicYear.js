// Modelo de Año Académico - San Martín Digital
const mongoose = require('mongoose');

// Subdocumento para períodos académicos
const academicPeriodSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  number: {
    type: Number,
    required: true,
  },
  startDate: {
    type: Date,
    required: true,
  },
  endDate: {
    type: Date,
    required: true,
  },
  isActive: {
    type: Boolean,
    default: false,
  },
  gradesLocked: {
    type: Boolean,
    default: false, // Si es true, no se pueden modificar notas
  },
  status: {
    type: String,
    enum: ['pendiente', 'activo', 'finalizado'],
    default: 'pendiente',
  },
}, { _id: true });

const academicYearSchema = new mongoose.Schema({
  institution: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Institution',
    required: [true, 'La institución es requerida'],
  },
  year: {
    type: Number,
    required: [true, 'El año es requerido'],
  },
  name: {
    type: String,
    required: [true, 'El nombre es requerido'],
    trim: true,
  },
  startDate: {
    type: Date,
    required: [true, 'La fecha de inicio es requerida'],
  },
  endDate: {
    type: Date,
    required: [true, 'La fecha de fin es requerida'],
  },
  
  // Períodos del año (bimestres, trimestres, etc.)
  periods: [academicPeriodSchema],
  
  // Fechas importantes
  importantDates: [{
    name: String,
    date: Date,
    type: {
      type: String,
      enum: ['inicio_clases', 'fin_clases', 'vacaciones', 'feriado', 'examen', 'evento'],
    },
  }],
  
  // Estado del año académico
  isCurrent: {
    type: Boolean,
    default: false,
  },
  status: {
    type: String,
    enum: ['planificacion', 'matricula', 'activo', 'finalizado', 'cerrado'],
    default: 'planificacion',
  },
  
  // Estadísticas (se actualizan automáticamente)
  stats: {
    totalStudents: { type: Number, default: 0 },
    totalTeachers: { type: Number, default: 0 },
    totalClassrooms: { type: Number, default: 0 },
    totalCourses: { type: Number, default: 0 },
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

// Virtual para obtener el período actual
academicYearSchema.virtual('currentPeriod').get(function() {
  const now = new Date();
  return this.periods.find(p => 
    p.isActive && now >= p.startDate && now <= p.endDate
  );
});

// Método para obtener el período por número
academicYearSchema.methods.getPeriodByNumber = function(number) {
  return this.periods.find(p => p.number === number);
};

// Método para activar un período
academicYearSchema.methods.activatePeriod = function(periodNumber) {
  this.periods.forEach(p => {
    p.isActive = p.number === periodNumber;
    if (p.number < periodNumber) {
      p.status = 'finalizado';
    } else if (p.number === periodNumber) {
      p.status = 'activo';
    }
  });
};

// Índices
academicYearSchema.index({ institution: 1, year: 1 }, { unique: true });
academicYearSchema.index({ isCurrent: 1 });

// Middleware: Solo puede haber un año actual por institución
academicYearSchema.pre('save', async function(next) {
  if (this.isCurrent) {
    await this.constructor.updateMany(
      { institution: this.institution, _id: { $ne: this._id } },
      { isCurrent: false }
    );
  }
  next();
});

const AcademicYear = mongoose.model('AcademicYear', academicYearSchema);

module.exports = AcademicYear;
