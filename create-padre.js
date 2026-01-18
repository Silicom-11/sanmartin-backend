// Script para crear usuario padre
require('dotenv').config();
const mongoose = require('mongoose');
const { User } = require('./models');

const createPadre = async () => {
  try {
    // Conectar a MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Conectado a MongoDB');

    // Verificar si ya existe
    const existing = await User.findOne({ email: 'padre@sanmartin.edu.pe' });
    if (existing) {
      console.log('⚠️ El usuario padre ya existe');
      console.log('Usuario:', {
        email: existing.email,
        firstName: existing.firstName,
        lastName: existing.lastName,
        role: existing.role,
        isActive: existing.isActive,
      });
      process.exit(0);
    }

    // Crear nuevo usuario padre
    const padre = await User.create({
      email: 'padre@sanmartin.edu.pe',
      password: 'padre123',
      firstName: 'Carlos',
      lastName: 'Ramirez',
      role: 'padre',
      isActive: true,
    });

    console.log('✅ Usuario padre creado exitosamente:');
    console.log({
      email: padre.email,
      password: 'padre123',
      firstName: padre.firstName,
      lastName: padre.lastName,
      fullName: padre.fullName,
      role: padre.role,
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

createPadre();
