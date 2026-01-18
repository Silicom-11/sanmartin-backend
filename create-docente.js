// Script para crear usuario docente
require('dotenv').config();
const mongoose = require('mongoose');
const { User } = require('./models');

const createDocente = async () => {
  try {
    // Conectar a MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Conectado a MongoDB');

    // Verificar si ya existe
    const existing = await User.findOne({ email: 'docente@sanmartin.edu.pe' });
    if (existing) {
      console.log('⚠️ El usuario docente ya existe');
      console.log('Usuario:', {
        email: existing.email,
        firstName: existing.firstName,
        lastName: existing.lastName,
        role: existing.role,
        isActive: existing.isActive,
      });
      process.exit(0);
    }

    // Crear nuevo usuario docente
    const docente = await User.create({
      email: 'docente@sanmartin.edu.pe',
      password: 'docente123',
      firstName: 'Ana',
      lastName: 'Torres',
      role: 'docente',
      isActive: true,
    });

    console.log('✅ Usuario docente creado exitosamente:');
    console.log({
      email: docente.email,
      firstName: docente.firstName,
      lastName: docente.lastName,
      fullName: docente.fullName,
      role: docente.role,
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

createDocente();
