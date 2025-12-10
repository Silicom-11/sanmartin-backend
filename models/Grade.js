// Modelo de Calificación - San Martín Digital
const mongoose = require('mongoose');

const gradeSchema = new mongoose.Schema({
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
  // Calificaciones por tipo
  evaluations: [{
    type: {
      type: String,
      enum: ['examen', 'tarea', 'participacion', 'proyecto', 'practica'],
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    grade: {
      type: Number,
      min: 0,
      max: 20,
      required: true,
    },
    weight: {
      type: Number,
      default: 1,
    },
    date: {
      type: Date,
      default: Date.now,
    },
    observations: String,
  }],
  // Promedios calculados
  averages: {
    exams: { type: Number, default: 0 },
    tasks: { type: Number, default: 0 },
    participation: { type: Number, default: 0 },
    projects: { type: Number, default: 0 },
    final: { type: Number, default: 0 },
  },
  // Período
  period: {
    type: String,
    enum: ['Primer Trimestre', 'Segundo Trimestre', 'Tercer Trimestre', 'Anual'],
    required: true,
  },
  academicYear: {
    type: Number,
    default: () => new Date().getFullYear(),
  },
  // Estado
  status: {
    type: String,
    enum: ['pendiente', 'en-proceso', 'completado', 'publicado'],
    default: 'pendiente',
  },
  isPublished: {
    type: Boolean,
    default: false,
  },
  publishedAt: Date,
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Método para calcular promedios
gradeSchema.methods.calculateAverages = function() {
  const evaluationsByType = {};
  
  this.evaluations.forEach(evalItem => {
    if (!evaluationsByType[evalItem.type]) {
      evaluationsByType[evalItem.type] = [];
    }
    evaluationsByType[evalItem.type].push(evalItem.grade);
  });
  
  // Calcular promedio por tipo
  const calculateAverage = (grades) => {
    if (!grades || grades.length === 0) return 0;
    return grades.reduce((a, b) => a + b, 0) / grades.length;
  };
  
  this.averages.exams = calculateAverage(evaluationsByType.examen);
  this.averages.tasks = calculateAverage(evaluationsByType.tarea);
  this.averages.participation = calculateAverage(evaluationsByType.participacion);
  this.averages.projects = calculateAverage(evaluationsByType.proyecto);
  
  // Calcular promedio final (con pesos por defecto)
  this.averages.final = (
    this.averages.exams * 0.4 +
    this.averages.tasks * 0.3 +
    this.averages.participation * 0.1 +
    this.averages.projects * 0.2
  );
  
  return this.averages;
};

// Pre-save hook para calcular promedios
gradeSchema.pre('save', function(next) {
  this.calculateAverages();
  next();
});

// Índices compuestos
gradeSchema.index({ student: 1, course: 1, period: 1, academicYear: 1 }, { unique: true });
gradeSchema.index({ course: 1, period: 1 });
gradeSchema.index({ teacher: 1 });

const Grade = mongoose.model('Grade', gradeSchema);

module.exports = Grade;
