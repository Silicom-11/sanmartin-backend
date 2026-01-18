// Modelo de Curso-Sección (Instancia de Materia + Aula + Profesor) - San Martín Digital
const mongoose = require('mongoose');

const courseSectionSchema = new mongoose.Schema({
  // Asignatura base
  subject: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    required: [true, 'La asignatura es requerida'],
  },
  // Aula donde se dicta
  classroom: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Classroom',
    required: [true, 'El aula es requerida'],
  },
  // Docente que dicta
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'El docente es requerido'],
  },
  // Año académico
  academicYear: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AcademicYear',
    required: [true, 'El año académico es requerido'],
  },
  
  // Horario específico de este curso
  schedule: [{
    day: {
      type: String,
      enum: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
      required: true,
    },
    startTime: {
      type: String,
      required: true,
    },
    endTime: {
      type: String,
      required: true,
    },
    room: String, // Si es diferente al aula principal
  }],
  
  // Pesos de evaluación (override de Subject si es necesario)
  evaluationWeights: {
    examen: { type: Number, default: 40 },
    tarea: { type: Number, default: 20 },
    proyecto: { type: Number, default: 20 },
    participacion: { type: Number, default: 10 },
    practica: { type: Number, default: 10 },
  },
  
  // Configuración de evaluaciones del período
  periodEvaluations: [{
    period: Number,  // 1, 2, 3, 4
    evaluations: [{
      name: String,
      type: {
        type: String,
        enum: ['examen', 'tarea', 'proyecto', 'participacion', 'practica', 'exposicion'],
      },
      weight: Number,
      maxGrade: { type: Number, default: 20 },
      date: Date,
    }],
  }],
  
  // Estadísticas (se actualizan automáticamente)
  stats: {
    totalStudents: { type: Number, default: 0 },
    averageGrade: { type: Number, default: 0 },
    passRate: { type: Number, default: 0 }, // % de aprobados
    attendanceRate: { type: Number, default: 0 }, // % de asistencia
  },
  
  // Recursos/materiales del curso
  resources: [{
    name: String,
    type: { type: String, enum: ['link', 'file', 'video'] },
    url: String,
    uploadedAt: { type: Date, default: Date.now },
  }],
  
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
courseSectionSchema.virtual('fullName').get(function() {
  const subjectName = this.populated('subject') ? this.subject.name : 'Curso';
  const classroomName = this.populated('classroom') ? this.classroom.fullName : '';
  return `${subjectName} - ${classroomName}`;
});

// Virtual para horas totales semanales
courseSectionSchema.virtual('totalWeeklyHours').get(function() {
  return this.schedule.reduce((total, s) => {
    const start = parseInt(s.startTime.replace(':', ''));
    const end = parseInt(s.endTime.replace(':', ''));
    return total + (end - start) / 100;
  }, 0);
});

// Índices
courseSectionSchema.index({ subject: 1, classroom: 1, academicYear: 1 }, { unique: true });
courseSectionSchema.index({ teacher: 1 });
courseSectionSchema.index({ academicYear: 1 });

// Método para obtener estudiantes del curso
courseSectionSchema.methods.getStudents = async function() {
  const Enrollment = mongoose.model('Enrollment');
  const enrollments = await Enrollment.find({
    classroom: this.classroom,
    status: 'matriculado',
  }).populate('student');
  
  return enrollments.map(e => e.student);
};

// Método para actualizar estadísticas
courseSectionSchema.methods.updateStats = async function() {
  const Grade = mongoose.model('Grade');
  const Attendance = mongoose.model('Attendance');
  
  const students = await this.getStudents();
  this.stats.totalStudents = students.length;
  
  if (students.length > 0) {
    // Promedio de notas
    const grades = await Grade.find({
      courseSection: this._id,
      isPublished: true,
    });
    
    if (grades.length > 0) {
      const sum = grades.reduce((acc, g) => acc + (g.periodGrade || 0), 0);
      this.stats.averageGrade = sum / grades.length;
      
      const passingGrade = 11; // TODO: obtener de Institution
      const passed = grades.filter(g => g.periodGrade >= passingGrade).length;
      this.stats.passRate = (passed / grades.length) * 100;
    }
    
    // Asistencia promedio
    const attendances = await Attendance.find({
      courseSection: this._id,
    });
    
    if (attendances.length > 0) {
      const present = attendances.filter(a => a.status === 'presente').length;
      this.stats.attendanceRate = (present / attendances.length) * 100;
    }
  }
  
  await this.save();
};

const CourseSection = mongoose.model('CourseSection', courseSectionSchema);

module.exports = CourseSection;
