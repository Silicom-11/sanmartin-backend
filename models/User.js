// Modelo de Usuario - San Martín Digital
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
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
    required: function() { return !this.googleId; },
    minlength: [6, 'La contraseña debe tener al menos 6 caracteres'],
    select: false,
  },
  googleId: {
    type: String,
    sparse: true,
  },
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
    unique: true,
    sparse: true,
    trim: true,
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
  role: {
    type: String,
    enum: ['padre', 'docente', 'estudiante', 'administrativo', 'director'],
    required: [true, 'El rol es requerido'],
    default: 'padre',
  },
  avatar: {
    type: String,
    default: null,
  },
  
  // ==========================================
  // RELACIONES ESPECÍFICAS POR ROL
  // ==========================================
  
  // Solo para PADRES - referencia a sus hijos
  children: [{
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
    },
    relationship: {
      type: String,
      enum: ['padre', 'madre', 'tutor', 'abuelo', 'abuela', 'tio', 'tia', 'otro'],
    },
  }],
  
  // Legacy: mantener compatibilidad
  students: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
  }],
  
  // Solo para DOCENTES - sus cursos asignados
  assignedCourses: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CourseSection',
  }],
  
  // Legacy: mantener compatibilidad
  courses: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
  }],
  
  // Solo para ESTUDIANTES - referencia a su registro de estudiante
  studentProfile: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
  },
  
  // ==========================================
  // PERMISOS ESPECIALES
  // ==========================================
  permissions: [{
    type: String,
    enum: [
      'view_grades', 'edit_grades', 'publish_grades',
      'view_attendance', 'edit_attendance',
      'view_students', 'edit_students', 'delete_students',
      'view_teachers', 'edit_teachers', 'delete_teachers',
      'view_courses', 'edit_courses', 'delete_courses',
      'view_reports', 'generate_reports',
      'manage_users', 'manage_institution',
      'view_gps', 'manage_gps',
      'send_notifications', 'manage_notifications',
    ],
  }],
  
  // ==========================================
  // CONFIGURACIÓN DE USUARIO
  // ==========================================
  settings: {
    notifications: { type: Boolean, default: true },
    emailNotifications: { type: Boolean, default: true },
    pushNotifications: { type: Boolean, default: true },
    smsNotifications: { type: Boolean, default: false },
    language: { type: String, default: 'es' },
    theme: { type: String, default: 'light' },
    timezone: { type: String, default: 'America/Lima' },
  },
  
  // Legacy: mantener compatibilidad
  notificationsEnabled: {
    type: Boolean,
    default: true,
  },
  emailNotifications: {
    type: Boolean,
    default: true,
  },
  
  // ==========================================
  // PUSH TOKENS PARA NOTIFICACIONES
  // ==========================================
  pushTokens: [{
    token: String,
    device: String,           // "Samsung Galaxy S21"
    platform: {
      type: String,
      enum: ['android', 'ios', 'web'],
    },
    lastUsed: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true },
  }],
  
  // Metadata
  isActive: {
    type: Boolean,
    default: true,
  },
  lastLogin: {
    type: Date,
  },
  loginAttempts: {
    type: Number,
    default: 0,
  },
  lockUntil: Date,
  
  passwordResetToken: String,
  passwordResetExpires: Date,
  
  // Verificación de email
  emailVerified: {
    type: Boolean,
    default: false,
  },
  emailVerificationToken: String,
  emailVerificationExpires: Date,
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Virtual para nombre completo
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Virtual para verificar si la cuenta está bloqueada
userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Encriptar contraseña antes de guardar
userSchema.pre('save', async function(next) {
  if (!this.isModified('password') || !this.password) return next();
  
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Método para comparar contraseñas
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Método para generar token de reset
userSchema.methods.createPasswordResetToken = function() {
  const crypto = require('crypto');
  const resetToken = crypto.randomBytes(32).toString('hex');
  
  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  
  this.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutos
  
  return resetToken;
};

// ==========================================
// MÉTODOS ESPECÍFICOS POR ROL
// ==========================================

// Para PADRES: obtener todos los hijos
userSchema.methods.getChildren = async function() {
  if (this.role !== 'padre') return [];
  
  const Student = mongoose.model('Student');
  
  // Buscar por la nueva estructura (children) o la legacy (students)
  if (this.children?.length > 0) {
    return await Student.find({
      _id: { $in: this.children.map(c => c.student) },
      isActive: true,
    });
  }
  
  // Legacy: buscar por students o por guardians
  return await Student.find({
    $or: [
      { _id: { $in: this.students || [] } },
      { 'guardians.user': this._id },
      { parent: this._id },
    ],
    isActive: true,
  });
};

// Para PADRES: obtener un hijo específico con sus datos académicos
userSchema.methods.getChildWithAcademics = async function(studentId) {
  if (this.role !== 'padre') return null;
  
  const children = await this.getChildren();
  const child = children.find(c => c._id.toString() === studentId.toString());
  
  if (!child) return null;
  
  // Obtener matrícula actual
  const enrollment = await child.getCurrentEnrollment();
  
  // Obtener cursos actuales
  const courses = await child.getCurrentCourses();
  
  return {
    student: child,
    enrollment,
    courses,
  };
};

// Para DOCENTES: obtener todos los cursos asignados
userSchema.methods.getAssignedCourses = async function() {
  if (this.role !== 'docente') return [];
  
  const CourseSection = mongoose.model('CourseSection');
  
  return await CourseSection.find({
    $or: [
      { _id: { $in: this.assignedCourses || [] } },
      { teacher: this._id },
    ],
    isActive: true,
  }).populate(['subject', 'classroom']);
};

// Para DOCENTES: obtener estudiantes de un curso específico
userSchema.methods.getCourseStudents = async function(courseSectionId) {
  if (this.role !== 'docente') return [];
  
  const CourseSection = mongoose.model('CourseSection');
  const course = await CourseSection.findById(courseSectionId);
  
  if (!course) return [];
  
  return await course.getStudents();
};

// Para ESTUDIANTES: obtener su información académica
userSchema.methods.getStudentAcademics = async function() {
  if (this.role !== 'estudiante' || !this.studentProfile) return null;
  
  const Student = mongoose.model('Student');
  const student = await Student.findById(this.studentProfile);
  
  if (!student) return null;
  
  const enrollment = await student.getCurrentEnrollment();
  const courses = await student.getCurrentCourses();
  
  return {
    student,
    enrollment,
    courses,
  };
};

// Índices
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ role: 1 });
userSchema.index({ 'children.student': 1 });
userSchema.index({ studentProfile: 1 });
userSchema.index({ isActive: 1 });

const User = mongoose.model('User', userSchema);

module.exports = User;
