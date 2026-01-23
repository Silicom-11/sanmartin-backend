// Modelo de Docente - San Martín Digital
// Colección separada para gestión de profesores
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const teacherSchema = new mongoose.Schema({
  // ==========================================
  // DATOS PERSONALES
  // ==========================================
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
  email: {
    type: String,
    required: [true, 'El correo es requerido'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Por favor ingrese un correo válido'],
  },
  password: {
    type: String,
    required: [true, 'La contraseña es requerida'],
    minlength: [6, 'La contraseña debe tener al menos 6 caracteres'],
    select: false,
  },
  phone: {
    type: String,
    trim: true,
  },
  address: {
    type: String,
    trim: true,
  },
  birthDate: {
    type: Date,
  },
  gender: {
    type: String,
    enum: ['M', 'F', 'Otro'],
  },
  photo: {
    type: String,
    default: null,
  },

  // ==========================================
  // INFORMACIÓN PROFESIONAL
  // ==========================================
  employeeCode: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
  },
  specialty: {
    type: String,
    trim: true,
    // Especialidad principal (Matemáticas, Comunicación, etc.)
  },
  secondarySpecialties: [{
    type: String,
    trim: true,
  }],
  educationLevel: {
    type: String,
    enum: ['Licenciatura', 'Maestría', 'Doctorado', 'Técnico', 'Bachiller'],
  },
  university: {
    type: String,
    trim: true,
  },
  graduationYear: {
    type: Number,
  },
  certifications: [{
    name: String,
    institution: String,
    year: Number,
    document: String, // URL del documento
  }],

  // ==========================================
  // INFORMACIÓN LABORAL
  // ==========================================
  hireDate: {
    type: Date,
    default: Date.now,
  },
  contractType: {
    type: String,
    enum: ['Tiempo Completo', 'Tiempo Parcial', 'Contratado', 'Nombrado'],
    default: 'Contratado',
  },
  workSchedule: {
    type: String,
    enum: ['Mañana', 'Tarde', 'Completo'],
    default: 'Completo',
  },
  salary: {
    type: Number,
    select: false, // No mostrar por defecto
  },
  bankAccount: {
    bank: String,
    accountNumber: String,
    cci: String,
  },

  // ==========================================
  // CURSOS ASIGNADOS
  // ==========================================
  courses: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
  }],
  
  // Aulas asignadas como tutor
  homerooms: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Classroom',
  }],

  // ==========================================
  // DOCUMENTOS
  // ==========================================
  documents: {
    cv: String,
    dniCopy: String,
    degree: String,
    backgroundCheck: String,
    contract: String,
  },

  // ==========================================
  // ESTADO Y CONTROL
  // ==========================================
  isActive: {
    type: Boolean,
    default: true,
  },
  lastLogin: {
    type: Date,
  },
  lastActive: {
    type: Date,
  },
  isOnline: {
    type: Boolean,
    default: false,
  },

  // Referencia al User para compatibilidad (opcional)
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// ==========================================
// VIRTUALS
// ==========================================

teacherSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

teacherSchema.virtual('courseCount').get(function() {
  return this.courses ? this.courses.length : 0;
});

teacherSchema.virtual('age').get(function() {
  if (!this.birthDate) return null;
  const today = new Date();
  const birth = new Date(this.birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
});

// ==========================================
// MIDDLEWARES
// ==========================================

// Encriptar contraseña antes de guardar
teacherSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Generar código de empleado automáticamente
teacherSchema.pre('save', async function(next) {
  if (!this.employeeCode) {
    const count = await mongoose.model('Teacher').countDocuments();
    this.employeeCode = `DOC-${String(count + 1).padStart(4, '0')}`;
  }
  next();
});

// ==========================================
// MÉTODOS
// ==========================================

// Comparar contraseña
teacherSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Método para login (sin devolver password)
teacherSchema.methods.toAuthJSON = function() {
  return {
    id: this._id,
    email: this.email,
    firstName: this.firstName,
    lastName: this.lastName,
    fullName: this.fullName,
    role: 'docente',
    specialty: this.specialty,
    photo: this.photo,
    employeeCode: this.employeeCode,
  };
};

// ==========================================
// STATICS
// ==========================================

// Buscar por email con password
teacherSchema.statics.findByCredentials = async function(email, password) {
  const teacher = await this.findOne({ email, isActive: true }).select('+password');
  if (!teacher) {
    throw new Error('Credenciales inválidas');
  }
  const isMatch = await teacher.comparePassword(password);
  if (!isMatch) {
    throw new Error('Credenciales inválidas');
  }
  return teacher;
};

// Buscar docentes activos con cursos
teacherSchema.statics.getActiveWithCourses = function() {
  return this.find({ isActive: true })
    .populate('courses', 'name code gradeLevel section')
    .select('-password')
    .sort({ lastName: 1 });
};

// ==========================================
// ÍNDICES
// ==========================================

teacherSchema.index({ email: 1 });
teacherSchema.index({ dni: 1 });
teacherSchema.index({ employeeCode: 1 });
teacherSchema.index({ specialty: 1 });
teacherSchema.index({ isActive: 1 });
teacherSchema.index({ firstName: 'text', lastName: 'text', specialty: 'text' });

const Teacher = mongoose.model('Teacher', teacherSchema);

module.exports = Teacher;
