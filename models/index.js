// Exportación de todos los modelos - San Martín Digital
// ACTUALIZADO: Nueva arquitectura de base de datos

// ==========================================
// MODELOS CORE (Nueva Arquitectura)
// ==========================================
const Institution = require('./Institution');
const AcademicYear = require('./AcademicYear');
const GradeLevel = require('./GradeLevel');
const Subject = require('./Subject');
const Classroom = require('./Classroom');
const CourseSection = require('./CourseSection');
const Enrollment = require('./Enrollment');

// ==========================================
// MODELOS DE USUARIO Y ESTUDIANTE
// ==========================================
const User = require('./User');
const Student = require('./Student');
const Teacher = require('./Teacher');
const Parent = require('./Parent');

// ==========================================
// MODELOS ACADÉMICOS
// ==========================================
const Course = require('./Course');          // Legacy - mantener compatibilidad
const Grade = require('./Grade');
const Evaluation = require('./Evaluation');
const Attendance = require('./Attendance');

// ==========================================
// MODELOS ADMINISTRATIVOS
// ==========================================
const Justification = require('./Justification');
const Notification = require('./Notification');
const Event = require('./Event');

// ==========================================
// MODELOS DE MENSAJERÍA
// ==========================================
const Conversation = require('./Conversation');
const Message = require('./Message');

// ==========================================
// MODELOS DE SEGURIDAD Y TRACKING
// ==========================================
const Location = require('./Location');

module.exports = {
  // Core (nuevos)
  Institution,
  AcademicYear,
  GradeLevel,
  Subject,
  Classroom,
  CourseSection,
  Enrollment,
  
  // Usuarios
  User,
  Student,
  Teacher,
  Parent,
  
  // Académicos
  Course,       // Legacy
  Grade,
  Evaluation,
  Attendance,
  
  // Administrativos
  Justification,
  Notification,
  Event,
  
  // Mensajería
  Conversation,
  Message,
  
  // Seguridad y Tracking
  Location,
};
