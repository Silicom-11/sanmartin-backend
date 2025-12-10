// Modelo de Curso - San Martín Digital
const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'El nombre del curso es requerido'],
    trim: true,
  },
  code: {
    type: String,
    required: [true, 'El código del curso es requerido'],
    unique: true,
    trim: true,
    uppercase: true,
  },
  description: {
    type: String,
    trim: true,
  },
  gradeLevel: {
    type: String,
    required: [true, 'El grado es requerido'],
    enum: ['1º Primaria', '2º Primaria', '3º Primaria', '4º Primaria', '5º Primaria', '6º Primaria',
           '1º Secundaria', '2º Secundaria', '3º Secundaria', '4º Secundaria', '5º Secundaria'],
  },
  section: {
    type: String,
    enum: ['A', 'B', 'C', 'D'],
    default: 'A',
  },
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'El docente es requerido'],
  },
  students: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
  }],
  schedule: [{
    day: {
      type: String,
      enum: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'],
    },
    startTime: String,
    endTime: String,
    classroom: String,
  }],
  // Configuración de evaluaciones
  evaluationWeights: {
    exams: { type: Number, default: 40 },
    tasks: { type: Number, default: 30 },
    participation: { type: Number, default: 10 },
    projects: { type: Number, default: 20 },
  },
  // Período académico
  academicYear: {
    type: Number,
    default: () => new Date().getFullYear(),
  },
  period: {
    type: String,
    enum: ['Anual', 'Primer Trimestre', 'Segundo Trimestre', 'Tercer Trimestre'],
    default: 'Anual',
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

// Virtual para nombre completo del curso
courseSchema.virtual('fullName').get(function() {
  return `${this.name} - ${this.gradeLevel} ${this.section}`;
});

// Virtual para contar estudiantes
courseSchema.virtual('studentCount').get(function() {
  return this.students ? this.students.length : 0;
});

// Índices
courseSchema.index({ code: 1 });
courseSchema.index({ teacher: 1 });
courseSchema.index({ gradeLevel: 1, section: 1 });

const Course = mongoose.model('Course', courseSchema);

module.exports = Course;
