// Modelo de Estudiante - San Martín Digital
const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: [true, 'El nombre es requerido'],
    trim: true,
  },
  lastName: {
    type: String,
    required: [true, 'El apellido es requerido'],
    trim: true,
  },
  dni: {
    type: String,
    required: [true, 'El DNI es requerido'],
    unique: true,
    trim: true,
  },
  birthDate: {
    type: Date,
    required: [true, 'La fecha de nacimiento es requerida'],
  },
  gender: {
    type: String,
    enum: ['Masculino', 'Femenino'],
    required: true,
  },
  address: {
    type: String,
    trim: true,
  },
  photo: {
    type: String,
    default: null,
  },
  // Datos académicos
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
  shift: {
    type: String,
    enum: ['Mañana', 'Tarde'],
    default: 'Mañana',
  },
  enrollmentDate: {
    type: Date,
    default: Date.now,
  },
  enrollmentNumber: {
    type: String,
    unique: true,
  },
  previousSchool: {
    type: String,
    trim: true,
  },
  // Relaciones
  parent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'El apoderado es requerido'],
  },
  courses: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
  }],
  // Documentos
  documents: {
    birthCertificate: { type: String, default: null },
    parentDniCopy: { type: String, default: null },
    previousGrades: { type: String, default: null },
    photos: [{ type: String }],
  },
  // Estado
  isActive: {
    type: Boolean,
    default: true,
  },
  status: {
    type: String,
    enum: ['matriculado', 'retirado', 'trasladado', 'egresado'],
    default: 'matriculado',
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Virtual para nombre completo
studentSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Virtual para calcular edad
studentSchema.virtual('age').get(function() {
  if (!this.birthDate) return null;
  const today = new Date();
  const birth = new Date(this.birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
});

// Generar número de matrícula automáticamente
studentSchema.pre('save', async function(next) {
  if (!this.enrollmentNumber) {
    const year = new Date().getFullYear();
    const count = await this.constructor.countDocuments();
    this.enrollmentNumber = `SMP-${year}-${String(count + 1).padStart(4, '0')}`;
  }
  next();
});

// Índices
studentSchema.index({ dni: 1 });
studentSchema.index({ parent: 1 });
studentSchema.index({ gradeLevel: 1, section: 1 });

const Student = mongoose.model('Student', studentSchema);

module.exports = Student;
