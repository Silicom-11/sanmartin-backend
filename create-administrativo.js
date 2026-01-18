// Script para crear usuario administrativo
require('dotenv').config();
const mongoose = require('mongoose');
const { User } = require('./models');

const createAdministrativo = async () => {
  try {
    // Conectar a MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Conectado a MongoDB');

    // Verificar si ya existe
    const existing = await User.findOne({ email: 'admin@sanmartin.edu.pe' });
    if (existing) {
      console.log('⚠️ El usuario administrativo ya existe');
      console.log('Usuario:', {
        email: existing.email,
        firstName: existing.firstName,
        lastName: existing.lastName,
        role: existing.role,
        isActive: existing.isActive,
      });
      process.exit(0);
    }

    // Crear nuevo usuario administrativo
    const admin = await User.create({
      email: 'admin@sanmartin.edu.pe',
      password: 'admin123',
      firstName: 'María',
      lastName: 'González',
      role: 'administrativo',
      isActive: true,
    });

    console.log('✅ Usuario administrativo creado exitosamente:');
    console.log({
      email: admin.email,
      password: 'admin123',
      firstName: admin.firstName,
      lastName: admin.lastName,
      fullName: admin.fullName,
      role: admin.role,
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

createAdministrativo();
