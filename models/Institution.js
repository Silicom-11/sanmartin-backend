// Modelo de Institución Educativa - San Martín Digital
const mongoose = require('mongoose');

const institutionSchema = new mongoose.Schema({
  // Datos básicos
  name: {
    type: String,
    required: [true, 'El nombre de la institución es requerido'],
    trim: true,
  },
  code: {
    type: String,
    required: [true, 'El código modular es requerido'],
    unique: true,
    trim: true,
    uppercase: true,
  },
  logo: {
    type: String,
    default: null,
  },
  
  // Contacto
  address: {
    street: String,
    district: String,
    city: String,
    region: String,
    postalCode: String,
  },
  phone: {
    type: String,
    trim: true,
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
  },
  website: {
    type: String,
    trim: true,
  },
  
  // Director
  director: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  
  // ==========================================
  // CONFIGURACIÓN ACADÉMICA - MUY IMPORTANTE
  // ==========================================
  evaluationSystem: {
    type: {
      type: String,
      enum: ['bimestral', 'trimestral', 'semestral', 'anual'],
      default: 'bimestral',
    },
    periodsPerYear: {
      type: Number,
      default: 4, // 4 para bimestral, 3 para trimestral, 2 para semestral
    },
    periodNames: {
      type: [String],
      default: ['I Bimestre', 'II Bimestre', 'III Bimestre', 'IV Bimestre'],
    },
  },
  
  // Sistema de calificación
  gradeScale: {
    type: {
      type: String,
      enum: ['vigesimal', 'centesimal', 'literal'],
      default: 'vigesimal',
    },
    minGrade: {
      type: Number,
      default: 0,
    },
    maxGrade: {
      type: Number,
      default: 20,
    },
    passingGrade: {
      type: Number,
      default: 11,
    },
    // Para escala literal
    literalScale: [{
      letter: String,    // 'A', 'B', 'C', 'D', 'F'
      minScore: Number,  // 18
      maxScore: Number,  // 20
      description: String, // 'Excelente'
    }],
  },
  
  // Turnos disponibles
  shifts: {
    type: [String],
    default: ['Mañana', 'Tarde'],
  },
  
  // Horarios por turno
  shiftSchedules: {
    morning: {
      startTime: { type: String, default: '07:30' },
      endTime: { type: String, default: '13:00' },
    },
    afternoon: {
      startTime: { type: String, default: '13:00' },
      endTime: { type: String, default: '18:30' },
    },
  },
  
  // Niveles académicos que ofrece
  academicLevels: {
    initial: {
      enabled: { type: Boolean, default: false },
      grades: { type: Number, default: 0 }, // 3, 4, 5 años
    },
    primary: {
      enabled: { type: Boolean, default: true },
      from: { type: Number, default: 1 },
      to: { type: Number, default: 6 },
    },
    secondary: {
      enabled: { type: Boolean, default: true },
      from: { type: Number, default: 1 },
      to: { type: Number, default: 5 },
    },
  },
  
  // Secciones máximas por grado
  maxSectionsPerGrade: {
    type: Number,
    default: 4, // A, B, C, D
  },
  
  // Capacidad máxima por aula
  defaultClassroomCapacity: {
    type: Number,
    default: 35,
  },
  
  // Tipos de evaluación disponibles
  evaluationTypes: {
    type: [String],
    default: ['examen', 'tarea', 'proyecto', 'participacion', 'practica', 'exposicion'],
  },
  
  // Pesos de evaluación por defecto
  defaultEvaluationWeights: {
    examen: { type: Number, default: 40 },
    tarea: { type: Number, default: 20 },
    proyecto: { type: Number, default: 20 },
    participacion: { type: Number, default: 10 },
    practica: { type: Number, default: 10 },
  },
  
  // Estado
  isActive: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Índices
institutionSchema.index({ code: 1 }, { unique: true });

const Institution = mongoose.model('Institution', institutionSchema);

module.exports = Institution;
