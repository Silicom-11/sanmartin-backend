// Modelo de Nivel/Grado - San Martín Digital
const mongoose = require('mongoose');

const gradeLevelSchema = new mongoose.Schema({
  institution: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Institution',
    required: [true, 'La institución es requerida'],
  },
  name: {
    type: String,
    required: [true, 'El nombre del grado es requerido'],
    trim: true,
  },
  shortName: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
  },
  level: {
    type: Number,
    required: [true, 'El número de grado es requerido'],
    min: 1,
    max: 11,
  },
  type: {
    type: String,
    required: true,
    enum: ['inicial', 'primaria', 'secundaria'],
  },
  // Para ordenar correctamente
  order: {
    type: Number,
    required: true,
  },
  // Descripción opcional
  description: {
    type: String,
    trim: true,
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
gradeLevelSchema.virtual('fullName').get(function() {
  const typeName = this.type === 'primaria' ? 'Primaria' : 
                   this.type === 'secundaria' ? 'Secundaria' : 'Inicial';
  return `${this.level}° ${typeName}`;
});

// Índices
gradeLevelSchema.index({ institution: 1, order: 1 });
gradeLevelSchema.index({ institution: 1, type: 1, level: 1 }, { unique: true });

// Método estático para crear todos los grados de una institución
gradeLevelSchema.statics.createDefaultGrades = async function(institutionId, academicLevels) {
  const grades = [];
  let order = 1;
  
  // Primaria
  if (academicLevels.primary.enabled) {
    for (let i = academicLevels.primary.from; i <= academicLevels.primary.to; i++) {
      grades.push({
        institution: institutionId,
        name: `${i}° Primaria`,
        shortName: `${i}P`,
        level: i,
        type: 'primaria',
        order: order++,
      });
    }
  }
  
  // Secundaria
  if (academicLevels.secondary.enabled) {
    for (let i = academicLevels.secondary.from; i <= academicLevels.secondary.to; i++) {
      grades.push({
        institution: institutionId,
        name: `${i}° Secundaria`,
        shortName: `${i}S`,
        level: i,
        type: 'secundaria',
        order: order++,
      });
    }
  }
  
  return await this.insertMany(grades);
};

const GradeLevel = mongoose.model('GradeLevel', gradeLevelSchema);

module.exports = GradeLevel;
