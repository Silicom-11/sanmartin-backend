// Modelo de Asignatura/Materia Base - San Martín Digital
const mongoose = require('mongoose');

const subjectSchema = new mongoose.Schema({
  institution: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Institution',
    required: [true, 'La institución es requerida'],
  },
  name: {
    type: String,
    required: [true, 'El nombre de la asignatura es requerido'],
    trim: true,
  },
  code: {
    type: String,
    required: [true, 'El código es requerido'],
    trim: true,
    uppercase: true,
  },
  description: {
    type: String,
    trim: true,
  },
  
  // A qué grados aplica esta materia
  gradeLevels: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GradeLevel',
  }],
  
  // O si aplica a un rango de tipos
  applicableTo: {
    type: String,
    enum: ['todos', 'primaria', 'secundaria', 'personalizado'],
    default: 'personalizado',
  },
  
  // Horas semanales por defecto
  hoursPerWeek: {
    type: Number,
    default: 4,
    min: 1,
    max: 15,
  },
  
  // ¿Es obligatorio o electivo?
  isRequired: {
    type: Boolean,
    default: true,
  },
  
  // Área curricular
  area: {
    type: String,
    enum: [
      'matematica',
      'comunicacion',
      'ciencias',
      'personal_social',
      'arte',
      'educacion_fisica',
      'religion',
      'ingles',
      'computacion',
      'tutoría',
      'otros'
    ],
    default: 'otros',
  },
  
  // Pesos de evaluación por defecto para esta materia
  defaultWeights: {
    examen: { type: Number, default: 40 },
    tarea: { type: Number, default: 20 },
    proyecto: { type: Number, default: 20 },
    participacion: { type: Number, default: 10 },
    practica: { type: Number, default: 10 },
  },
  
  // Competencias/habilidades a desarrollar
  competencies: [{
    name: String,
    description: String,
  }],
  
  // Color para UI (opcional)
  color: {
    type: String,
    default: '#0066CC',
  },
  
  // Icono para UI (opcional)
  icon: {
    type: String,
    default: 'book',
  },
  
  // Orden para mostrar
  order: {
    type: Number,
    default: 0,
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

// Índices
subjectSchema.index({ institution: 1, code: 1 }, { unique: true });
subjectSchema.index({ institution: 1, area: 1 });
subjectSchema.index({ gradeLevels: 1 });

// Método estático para crear materias por defecto
subjectSchema.statics.createDefaultSubjects = async function(institutionId, gradeLevels) {
  const primaryGrades = gradeLevels.filter(g => g.type === 'primaria').map(g => g._id);
  const secondaryGrades = gradeLevels.filter(g => g.type === 'secundaria').map(g => g._id);
  const allGrades = gradeLevels.map(g => g._id);
  
  const subjects = [
    // Materias comunes (todos los grados)
    { name: 'Matemática', code: 'MAT', area: 'matematica', hoursPerWeek: 6, gradeLevels: allGrades, color: '#E91E63', order: 1 },
    { name: 'Comunicación', code: 'COM', area: 'comunicacion', hoursPerWeek: 6, gradeLevels: allGrades, color: '#2196F3', order: 2 },
    { name: 'Inglés', code: 'ING', area: 'ingles', hoursPerWeek: 3, gradeLevels: allGrades, color: '#9C27B0', order: 3 },
    { name: 'Educación Física', code: 'EFI', area: 'educacion_fisica', hoursPerWeek: 2, gradeLevels: allGrades, color: '#4CAF50', order: 4 },
    { name: 'Arte y Cultura', code: 'ART', area: 'arte', hoursPerWeek: 2, gradeLevels: allGrades, color: '#FF9800', order: 5 },
    { name: 'Educación Religiosa', code: 'REL', area: 'religion', hoursPerWeek: 2, gradeLevels: allGrades, color: '#795548', order: 6 },
    { name: 'Tutoría', code: 'TUT', area: 'tutoría', hoursPerWeek: 1, gradeLevels: allGrades, color: '#607D8B', order: 7 },
    
    // Primaria
    { name: 'Personal Social', code: 'PER', area: 'personal_social', hoursPerWeek: 4, gradeLevels: primaryGrades, color: '#00BCD4', order: 8 },
    { name: 'Ciencia y Tecnología', code: 'CYT', area: 'ciencias', hoursPerWeek: 4, gradeLevels: primaryGrades, color: '#8BC34A', order: 9 },
    
    // Secundaria
    { name: 'Historia, Geografía y Economía', code: 'HGE', area: 'personal_social', hoursPerWeek: 3, gradeLevels: secondaryGrades, color: '#00BCD4', order: 10 },
    { name: 'Formación Ciudadana y Cívica', code: 'FCC', area: 'personal_social', hoursPerWeek: 2, gradeLevels: secondaryGrades, color: '#3F51B5', order: 11 },
    { name: 'Ciencia, Tecnología y Ambiente', code: 'CTA', area: 'ciencias', hoursPerWeek: 4, gradeLevels: secondaryGrades, color: '#8BC34A', order: 12 },
    { name: 'Educación para el Trabajo', code: 'EPT', area: 'otros', hoursPerWeek: 2, gradeLevels: secondaryGrades, color: '#FF5722', order: 13 },
  ];
  
  // Agregar institución a cada subject
  subjects.forEach(s => {
    s.institution = institutionId;
    s.applicableTo = s.gradeLevels === allGrades ? 'todos' : 
                     s.gradeLevels === primaryGrades ? 'primaria' : 
                     s.gradeLevels === secondaryGrades ? 'secundaria' : 'personalizado';
  });
  
  return await this.insertMany(subjects);
};

const Subject = mongoose.model('Subject', subjectSchema);

module.exports = Subject;
