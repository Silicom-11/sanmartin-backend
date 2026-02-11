// Modelo de Evaluación - San Martín Digital
// Define evaluaciones creadas por docentes para un curso/bimestre
// Los docentes crean evaluaciones (columnas) desde la app móvil,
// luego ingresan notas por estudiante para cada evaluación.

const mongoose = require('mongoose');

const evaluationSchema = new mongoose.Schema({
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: [true, 'El curso es requerido'],
  },
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    // Puede ser User o Teacher (dual collection)
    required: [true, 'El docente es requerido'],
  },
  name: {
    type: String,
    required: [true, 'El nombre de la evaluación es requerido'],
    trim: true,
  },
  type: {
    type: String,
    enum: ['examen', 'tarea', 'practica', 'proyecto', 'participacion', 'exposicion', 'otro'],
    required: [true, 'El tipo de evaluación es requerido'],
  },
  bimester: {
    type: Number,
    enum: [1, 2, 3, 4],
    required: [true, 'El bimestre es requerido'],
  },
  maxGrade: {
    type: Number,
    default: 20,
    min: 1,
    max: 100,
  },
  weight: {
    type: Number,
    default: 1,
    min: 0,
  },
  date: {
    type: Date,
    default: Date.now,
  },
  description: {
    type: String,
    trim: true,
  },
  academicYear: {
    type: Number,
    default: () => new Date().getFullYear(),
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  order: {
    type: Number,
    default: 0,
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Índices
evaluationSchema.index({ course: 1, bimester: 1, academicYear: 1 });
evaluationSchema.index({ teacher: 1 });
evaluationSchema.index({ course: 1, order: 1 });

const Evaluation = mongoose.model('Evaluation', evaluationSchema);

module.exports = Evaluation;
