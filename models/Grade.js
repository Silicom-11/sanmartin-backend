// Modelo de Calificación - San Martín Digital
// Un documento Grade por estudiante + curso + bimestre
// Las notas (scores) se vinculan a Evaluaciones creadas por el docente

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
  bimester: {
    type: Number,
    enum: [1, 2, 3, 4],
    required: [true, 'El bimestre es requerido'],
  },
  academicYear: {
    type: Number,
    default: () => new Date().getFullYear(),
  },
  // Notas individuales vinculadas a evaluaciones del docente
  scores: [{
    evaluation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Evaluation',
      required: true,
    },
    score: {
      type: Number,
      min: 0,
      max: 20,
      default: null,
    },
    comments: {
      type: String,
      trim: true,
    },
    gradedAt: {
      type: Date,
      default: Date.now,
    },
    gradedBy: {
      type: mongoose.Schema.Types.ObjectId,
    },
  }],
  // Promedio del bimestre (calculado automáticamente)
  average: {
    type: Number,
    default: 0,
  },
  // Estado del bimestre
  status: {
    type: String,
    enum: ['abierto', 'cerrado', 'publicado'],
    default: 'abierto',
  },
  closedAt: Date,
  closedBy: {
    type: mongoose.Schema.Types.ObjectId,
  },
  publishedAt: Date,
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    // Puede ser User o Teacher (dual collection)
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Método para calcular el promedio del bimestre
gradeSchema.methods.calculateAverage = function() {
  const validScores = this.scores.filter(s => s.score !== null && s.score !== undefined);
  if (validScores.length === 0) {
    this.average = 0;
    return 0;
  }
  const sum = validScores.reduce((acc, s) => acc + s.score, 0);
  this.average = Math.round((sum / validScores.length) * 10) / 10;
  return this.average;
};

// Pre-save: recalcular promedio
gradeSchema.pre('save', function(next) {
  this.calculateAverage();
  next();
});

// Índices compuestos
gradeSchema.index({ student: 1, course: 1, bimester: 1, academicYear: 1 }, { unique: true });
gradeSchema.index({ course: 1, bimester: 1, academicYear: 1 });
gradeSchema.index({ teacher: 1 });
gradeSchema.index({ student: 1, academicYear: 1 });

const Grade = mongoose.model('Grade', gradeSchema);

module.exports = Grade;
