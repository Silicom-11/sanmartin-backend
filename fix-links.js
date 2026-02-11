// Script para corregir la vinculación padre-hijo
const mongoose = require('mongoose');
require('dotenv').config();

const Student = require('./models/Student');
const Parent = require('./models/Parent');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb+srv://sanmartindigital:sanmartin2024@cluster0.yidwzp0.mongodb.net/sanmartin?retryWrites=true&w=majority&appName=Cluster0';

async function fixLinks() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Conectado a MongoDB\n');

    // Obtener todos los padres
    const parents = await Parent.find({});
    console.log(`📋 Encontrados ${parents.length} padres\n`);

    let fixed = 0;

    for (const parent of parents) {
      console.log(`\n👨‍👩‍👧 Procesando: ${parent.firstName} ${parent.lastName} (${parent._id})`);
      
      if (!parent.children || parent.children.length === 0) {
        console.log('   ⚠️ Sin hijos vinculados, saltando...');
        continue;
      }

      for (const child of parent.children) {
        const studentId = child.student;
        const relationship = child.relationship;

        console.log(`   📍 Vinculando estudiante: ${studentId}`);

        // Buscar el estudiante
        const student = await Student.findById(studentId);
        if (!student) {
          console.log(`   ❌ Estudiante no encontrado: ${studentId}`);
          continue;
        }

        console.log(`   ✅ Estudiante: ${student.firstName} ${student.lastName}`);

        let needsSave = false;

        // 1. Asignar parent si está vacío
        if (!student.parent) {
          student.parent = parent._id;
          console.log('      ✅ Asignado student.parent');
          needsSave = true;
        }

        // 2. Agregar a guardians si no existe
        const hasGuardian = student.guardians?.some(g => 
          g.parent?.toString() === parent._id.toString()
        );

        if (!hasGuardian) {
          if (!student.guardians) {
            student.guardians = [];
          }
          student.guardians.push({
            parent: parent._id,
            relationship: relationship || 'padre',
            isPrimary: true,
            canPickUp: true,
            emergencyContact: true
          });
          console.log('      ✅ Agregado a student.guardians');
          needsSave = true;
        }

        if (needsSave) {
          await student.save();
          fixed++;
          console.log('      💾 Guardado!');
        } else {
          console.log('      ℹ️ Ya estaba vinculado correctamente');
        }
      }
    }

    console.log(`\n✅ Proceso completado! ${fixed} vinculaciones corregidas.`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Desconectado de MongoDB');
  }
}

fixLinks();
