// Modelo de Estudiante - San Martín Digital
// ACTUALIZADO: Nueva arquitectura con múltiples tutores, autenticación y relación con Enrollment
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Subdocumento para tutores/apoderados
const guardianSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  parent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Parent',
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
  // ==========================================
  // DATOS DE AUTENTICACIÓN
  // ==========================================
  email: {
    type: String,
    required: [true, 'El correo es requerido'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Correo inválido'],
  },
  password: {
    type: String,
    required: [true, 'La contraseña es requerida'],
    minlength: [6, 'La contraseña debe tener al menos 6 caracteres'],
    select: false,
  },
  studentCode: {
    type: String,
    unique: true,
    sparse: true,
  },
  
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
    enum: ['Masculino', 'Femenino'],
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

// Generar número de matrícula y código de estudiante automáticamente
studentSchema.pre('save', async function(next) {
  // Generar código de estudiante si no existe
  if (!this.studentCode) {
    const year = new Date().getFullYear();
    const count = await this.constructor.countDocuments();
    this.studentCode = `EST-${year}-${String(count + 1).padStart(4, '0')}`;
  }
  
  if (!this.enrollmentNumber) {
    const year = new Date().getFullYear();
    const count = await this.constructor.countDocuments();
    this.enrollmentNumber = `SMP-${year}-${String(count + 1).padStart(4, '0')}`;
  }
  
  // Hashear password si fue modificada
  if (this.isModified('password')) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
  
  // Sincronizar parent con el guardian primario
  if (this.guardians?.length > 0 && !this.parent) {
    const primary = this.guardians.find(g => g.isPrimary) || this.guardians[0];
    this.parent = primary.user || primary.parent;
  }
  
  next();
});

// ==========================================
// MÉTODOS DE AUTENTICACIÓN
// ==========================================

// Comparar contraseña
studentSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Generar JWT
studentSchema.methods.generateAuthToken = function() {
  return jwt.sign(
    { id: this._id, role: 'estudiante', type: 'student' },
    process.env.JWT_SECRET || 'sanmartin_secret_key_2026',
    { expiresIn: '7d' }
  );
};

// Retornar datos para autenticación (sin password)
studentSchema.methods.toAuthJSON = function() {
  return {
    _id: this._id,
    studentCode: this.studentCode,
    email: this.email,
    firstName: this.firstName,
    lastName: this.lastName,
    fullName: this.fullName,
    dni: this.dni,
    photo: this.photo,
    gradeLevel: this.gradeLevel,
    section: this.section,
    role: 'estudiante',
    token: this.generateAuthToken(),
  };
};

// Método estático para buscar por credenciales
studentSchema.statics.findByCredentials = async function(email, password) {
  const student = await this.findOne({ email, isActive: true }).select('+password');
  if (!student) {
    throw new Error('Credenciales inválidas');
  }
  
  const isMatch = await student.comparePassword(password);
  if (!isMatch) {
    throw new Error('Credenciales inválidas');
  }
  
  return student;
};

// Índices
studentSchema.index({ email: 1 });
studentSchema.index({ studentCode: 1 });
studentSchema.index({ dni: 1 });
studentSchema.index({ parent: 1 });
studentSchema.index({ 'guardians.user': 1 });
studentSchema.index({ 'guardians.parent': 1 });
studentSchema.index({ gradeLevel: 1, section: 1 });
studentSchema.index({ status: 1, isActive: 1 });
studentSchema.index({ firstName: 'text', lastName: 'text', dni: 'text' });

const Student = mongoose.model('Student', studentSchema);

module.exports = Student;
