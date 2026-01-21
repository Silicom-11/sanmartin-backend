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

// ==========================================
// MODELOS ACADÉMICOS
// ==========================================
const Course = require('./Course');          // Legacy - mantener compatibilidad
const Grade = require('./Grade');
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
  
  // Académicos
  Course,       // Legacy
  Grade,
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
