// Modelo de Estudiante - San Martín Digital
// ACTUALIZADO: Nueva arquitectura con múltiples tutores y relación con Enrollment
const mongoose = require('mongoose');

// Subdocumento para tutores/apoderados
const guardianSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  relationship: {
    type: String,
    enum: ['padre', 'madre', 'tutor', 'abuelo', 'abuela', 'tio', 'tia', 'hermano', 'hermana', 'otro'],
    required: true,
  },
  isPrimary: {
    type: Boolean,
    default: false,
  },
  canPickUp: {
    type: Boolean,
    default: true,
  },
  emergencyContact: {
    type: Boolean,
    default: false,
  },
}, { _id: false });

const studentSchema = new mongoose.Schema({
  // Datos personales
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
    enum: ['M', 'F'],
    required: true,
  },
  photo: {
    type: String,
    default: null,
  },
  
  // Datos de contacto
  address: {
    street: String,
    district: String,
    city: String,
    reference: String,
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
  
  // ==========================================
  // TUTORES/APODERADOS - MÚLTIPLES
  // ==========================================
  guardians: [guardianSchema],
  
  // Backward compatibility: referencia al apoderado principal
  parent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  
  // ==========================================
  // INFORMACIÓN MÉDICA
  // ==========================================
  medicalInfo: {
    bloodType: {
      type: String,
      enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', ''],
    },
    allergies: [String],
    conditions: [String],           // Condiciones médicas
    medications: [String],          // Medicamentos que toma
    insuranceProvider: String,      // EPS o seguro
    insuranceNumber: String,
    emergencyNotes: String,
  },
  
  // ==========================================
  // DOCUMENTOS
  // ==========================================
  documents: {
    birthCertificate: String,
    dniCopy: String,
    photos: [String],
    vaccinationCard: String,
    medicalCertificate: String,
    enrollmentForm: String,
    previousGrades: String,
  },
  
  // Cuenta de usuario (si el estudiante tiene acceso a la app)
  userAccount: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  
  // ==========================================
  // DATOS DE ADMISIÓN
  // ==========================================
  enrollmentNumber: {
    type: String,
    unique: true,
    sparse: true,
  },
  admissionDate: {
    type: Date,
    default: Date.now,
  },
  previousSchool: {
    type: String,
    trim: true,
  },
  
  // ==========================================
  // DATOS ACADÉMICOS LEGACY (para compatibilidad)
  // El grado/sección ACTUAL se obtiene de la última Enrollment
  // ==========================================
  gradeLevel: {
    type: String,
    enum: ['1º Primaria', '2º Primaria', '3º Primaria', '4º Primaria', '5º Primaria', '6º Primaria',
           '1º Secundaria', '2º Secundaria', '3º Secundaria', '4º Secundaria', '5º Secundaria'],
  },
  section: {
    type: String,
    enum: ['A', 'B', 'C', 'D', 'E', 'F'],
    default: 'A',
  },
  shift: {
    type: String,
    enum: ['Mañana', 'Tarde'],
    default: 'Mañana',
  },
  
  // Cursos legacy
  courses: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
  }],
  
  // Estado
  status: {
    type: String,
    enum: ['activo', 'inactivo', 'retirado', 'trasladado', 'egresado'],
    default: 'activo',
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

// Virtual para obtener el apoderado principal
studentSchema.virtual('primaryGuardian').get(function() {
  const primary = this.guardians?.find(g => g.isPrimary);
  return primary || this.guardians?.[0];
});

// Método para obtener la matrícula actual
studentSchema.methods.getCurrentEnrollment = async function() {
  const Enrollment = mongoose.model('Enrollment');
  return await Enrollment.getCurrentEnrollment(this._id);
};

// Método para obtener los cursos actuales
studentSchema.methods.getCurrentCourses = async function() {
  const enrollment = await this.getCurrentEnrollment();
  if (!enrollment) return [];
  
  const CourseSection = mongoose.model('CourseSection');
  return await CourseSection.find({
    classroom: enrollment.classroom,
    academicYear: enrollment.academicYear,
    isActive: true,
  }).populate(['subject', 'teacher']);
};

// Generar número de matrícula automáticamente
studentSchema.pre('save', async function(next) {
  if (!this.enrollmentNumber) {
    const year = new Date().getFullYear();
    const count = await this.constructor.countDocuments();
    this.enrollmentNumber = `SMP-${year}-${String(count + 1).padStart(4, '0')}`;
  }
  
  // Sincronizar parent con el guardian primario
  if (this.guardians?.length > 0 && !this.parent) {
    const primary = this.guardians.find(g => g.isPrimary) || this.guardians[0];
    this.parent = primary.user;
  }
  
  next();
});

// Índices
studentSchema.index({ dni: 1 });
studentSchema.index({ parent: 1 });
studentSchema.index({ 'guardians.user': 1 });
studentSchema.index({ gradeLevel: 1, section: 1 });
studentSchema.index({ status: 1, isActive: 1 });

const Student = mongoose.model('Student', studentSchema);

module.exports = Student;
