// Script para actualizar estudiantes existentes con email y password
// Ejecutar con: node update-students.js

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://sanmartindigital:W7m3cJ6V59sBYxiA@sanmartin.rrlcy.mongodb.net/sanmartin_db?retryWrites=true&w=majority&appName=sanmartin';

async function updateStudents() {
  try {
    console.log('🔌 Conectando a MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Conectado a MongoDB');

    const db = mongoose.connection.db;
    const studentsCollection = db.collection('students');

    // Obtener todos los estudiantes
    const students = await studentsCollection.find({}).toArray();
    console.log(`📚 Encontrados ${students.length} estudiantes para actualizar`);

    // Password por defecto (hasheada)
    const defaultPassword = await bcrypt.hash('123456', 12);

    for (const student of students) {
      const updates = {};

      // 1. Agregar email si no existe
      if (!student.email) {
        // Generar email basado en DNI
        const email = `estudiante${student.dni}@sanmartin.edu.pe`;
        updates.email = email;
        console.log(`  📧 Agregando email: ${email}`);
      }

      // 2. Agregar password si no existe
      if (!student.password) {
        updates.password = defaultPassword;
        console.log(`  🔐 Agregando password por defecto`);
      }

      // 3. Corregir gender de 'M'/'F' a 'Masculino'/'Femenino'
      if (student.gender === 'M') {
        updates.gender = 'Masculino';
        console.log(`  👤 Corrigiendo género: M -> Masculino`);
      } else if (student.gender === 'F') {
        updates.gender = 'Femenino';
        console.log(`  👤 Corrigiendo género: F -> Femenino`);
      }

      // 4. Generar studentCode si no existe
      if (!student.studentCode) {
        const year = new Date().getFullYear();
        const count = await studentsCollection.countDocuments({ studentCode: { $exists: true, $ne: null } });
        const code = `EST-${year}-${String(count + 1).padStart(4, '0')}`;
        updates.studentCode = code;
        console.log(`  🎫 Generando studentCode: ${code}`);
      }

      // Aplicar actualizaciones si hay alguna
      if (Object.keys(updates).length > 0) {
        await studentsCollection.updateOne(
          { _id: student._id },
          { $set: updates }
        );
        console.log(`✅ Estudiante ${student.firstName} ${student.lastName} actualizado`);
      } else {
        console.log(`⏭️ Estudiante ${student.firstName} ${student.lastName} ya está actualizado`);
      }
    }

    console.log('\n🎉 ¡Migración completada!');
    console.log('📋 Credenciales por defecto:');
    console.log('   Email: estudianteDNI@sanmartin.edu.pe');
    console.log('   Password: 123456');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Desconectado de MongoDB');
  }
}

updateStudents();
