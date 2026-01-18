// Modelo de Aula/Sección - San Martín Digital
const mongoose = require('mongoose');

const classroomSchema = new mongoose.Schema({
  gradeLevel: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GradeLevel',
    required: [true, 'El grado es requerido'],
  },
  academicYear: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AcademicYear',
    required: [true, 'El año académico es requerido'],
  },
  section: {
    type: String,
    required: [true, 'La sección es requerida'],
    uppercase: true,
    enum: ['A', 'B', 'C', 'D', 'E', 'F'],
  },
  shift: {
    type: String,
    required: true,
    enum: ['Mañana', 'Tarde'],
    default: 'Mañana',
  },
  
  // Docente tutor del aula
  tutor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  
  // Capacidad
  capacity: {
    type: Number,
    default: 35,
    min: 1,
    max: 50,
  },
  
  // Ubicación física
  location: {
    building: String,     // "Pabellón A"
    floor: Number,        // 1
    room: String,         // "Aula 101"
  },
  
  // Estadísticas (se actualizan automáticamente)
  stats: {
    enrolledStudents: { type: Number, default: 0 },
    maleStudents: { type: Number, default: 0 },
    femaleStudents: { type: Number, default: 0 },
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
classroomSchema.virtual('fullName').get(function() {
  // Se poblará con el gradeLevel
  if (this.populated('gradeLevel') || this.gradeLevel?.name) {
    return `${this.gradeLevel.name} - ${this.section} (${this.shift})`;
  }
  return `Sección ${this.section} (${this.shift})`;
});

// Virtual para espacios disponibles
classroomSchema.virtual('availableSpots').get(function() {
  return this.capacity - this.stats.enrolledStudents;
});

// Índices
classroomSchema.index({ gradeLevel: 1, academicYear: 1, section: 1, shift: 1 }, { unique: true });
classroomSchema.index({ academicYear: 1 });
classroomSchema.index({ tutor: 1 });

// Método para actualizar estadísticas
classroomSchema.methods.updateStats = async function() {
  const Enrollment = mongoose.model('Enrollment');
  const Student = mongoose.model('Student');
  
  const enrollments = await Enrollment.find({
    classroom: this._id,
    status: 'matriculado',
  }).populate('student');
  
  this.stats.enrolledStudents = enrollments.length;
  this.stats.maleStudents = enrollments.filter(e => e.student?.gender === 'M').length;
  this.stats.femaleStudents = enrollments.filter(e => e.student?.gender === 'F').length;
  
  await this.save();
};

const Classroom = mongoose.model('Classroom', classroomSchema);

module.exports = Classroom;
