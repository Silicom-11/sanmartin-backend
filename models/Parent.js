// Modelo de Padre/Apoderado - San Martín Digital
// Colección separada para gestión de padres de familia
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const parentSchema = new mongoose.Schema({
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
    required: [true, 'El teléfono es requerido'],
    trim: true,
  },
  secondaryPhone: {
    type: String,
    trim: true,
  },
  address: {
    street: String,
    district: String,
    city: String,
    reference: String,
  },
  birthDate: {
    type: Date,
  },
  gender: {
    type: String,
    enum: ['M', 'F'],
  },
  photo: {
    type: String,
    default: null,
  },

  // ==========================================
  // INFORMACIÓN LABORAL (OPCIONAL)
  // ==========================================
  occupation: {
    type: String,
    trim: true,
  },
  workplace: {
    type: String,
    trim: true,
  },
  workPhone: {
    type: String,
    trim: true,
  },

  // ==========================================
  // RELACIÓN CON ESTUDIANTES (HIJOS)
  // ==========================================
  children: [{
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
    },
    relationship: {
      type: String,
      enum: ['padre', 'madre', 'tutor', 'abuelo', 'abuela', 'tio', 'tia', 'hermano', 'hermana', 'otro'],
      required: true,
    },
    isPrimaryContact: {
      type: Boolean,
      default: false,
    },
    canPickUp: {
      type: Boolean,
      default: true,
    },
    isEmergencyContact: {
      type: Boolean,
      default: true,
    },
  }],

  // ==========================================
  // CONFIGURACIÓN DE NOTIFICACIONES
  // ==========================================
  notifications: {
    email: {
      grades: { type: Boolean, default: true },
      attendance: { type: Boolean, default: true },
      events: { type: Boolean, default: true },
      messages: { type: Boolean, default: true },
    },
    push: {
      grades: { type: Boolean, default: true },
      attendance: { type: Boolean, default: true },
      events: { type: Boolean, default: true },
      messages: { type: Boolean, default: true },
    },
    sms: {
      emergencies: { type: Boolean, default: true },
      attendance: { type: Boolean, default: false },
    },
  },

  // ==========================================
  // DOCUMENTOS
  // ==========================================
  documents: {
    dniCopy: String,
    proofOfAddress: String,
    authorization: String, // Carta de autorización para recoger
  },

  // ==========================================
  // ESTADO Y CONTROL
  // ==========================================
  isActive: {
    type: Boolean,
    default: true,
  },
  isVerified: {
    type: Boolean,
    default: false,
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

  // ==========================================
  // PUSH TOKENS PARA NOTIFICACIONES
  // ==========================================
  pushTokens: [{
    token: String,
    device: String,
    platform: {
      type: String,
      enum: ['android', 'ios', 'web'],
    },
    lastUsed: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true },
  }],

  // Referencia al User para compatibilidad (opcional)
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },

  // Notas internas (solo visible para admin)
  internalNotes: {
    type: String,
    select: false,
  },

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// ==========================================
// VIRTUALS
// ==========================================

parentSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

parentSchema.virtual('childrenCount').get(function() {
  return this.children ? this.children.length : 0;
});

parentSchema.virtual('fullAddress').get(function() {
  if (!this.address) return null;
  const parts = [
    this.address.street,
    this.address.district,
    this.address.city,
  ].filter(Boolean);
  return parts.join(', ');
});

// ==========================================
// MIDDLEWARES
// ==========================================

// Encriptar contraseña antes de guardar
parentSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// ==========================================
// MÉTODOS
// ==========================================

// Comparar contraseña
parentSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Método para login
parentSchema.methods.toAuthJSON = function() {
  return {
    id: this._id,
    email: this.email,
    firstName: this.firstName,
    lastName: this.lastName,
    fullName: this.fullName,
    role: 'padre',
    photo: this.photo,
    childrenCount: this.childrenCount,
  };
};

// Agregar hijo
parentSchema.methods.addChild = async function(studentId, relationship, options = {}) {
  const exists = this.children.some(c => c.student.toString() === studentId.toString());
  if (exists) {
    throw new Error('Este estudiante ya está vinculado');
  }
  
  this.children.push({
    student: studentId,
    relationship,
    isPrimaryContact: options.isPrimaryContact || false,
    canPickUp: options.canPickUp !== false,
    isEmergencyContact: options.isEmergencyContact !== false,
  });
  
  return this.save();
};

// Remover hijo
parentSchema.methods.removeChild = async function(studentId) {
  this.children = this.children.filter(
    c => c.student.toString() !== studentId.toString()
  );
  return this.save();
};

// ==========================================
// STATICS
// ==========================================

// Buscar por email con password
parentSchema.statics.findByCredentials = async function(email, password) {
  const parent = await this.findOne({ email, isActive: true }).select('+password');
  if (!parent) {
    throw new Error('Credenciales inválidas');
  }
  const isMatch = await parent.comparePassword(password);
  if (!isMatch) {
    throw new Error('Credenciales inválidas');
  }
  return parent;
};

// Obtener padres con sus hijos populados
parentSchema.statics.getWithChildren = function() {
  return this.find({ isActive: true })
    .populate({
      path: 'children.student',
      select: 'firstName lastName dni gradeLevel section photo',
    })
    .select('-password')
    .sort({ lastName: 1 });
};

// Buscar padres de un estudiante específico
parentSchema.statics.findByStudent = function(studentId) {
  return this.find({
    'children.student': studentId,
    isActive: true,
  })
    .select('-password')
    .sort({ 'children.isPrimaryContact': -1 });
};

// ==========================================
// ÍNDICES
// ==========================================

parentSchema.index({ email: 1 });
parentSchema.index({ dni: 1 });
parentSchema.index({ phone: 1 });
parentSchema.index({ 'children.student': 1 });
parentSchema.index({ isActive: 1 });
parentSchema.index({ firstName: 'text', lastName: 'text' });

const Parent = mongoose.model('Parent', parentSchema);

module.exports = Parent;
