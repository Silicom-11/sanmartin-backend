// Script para verificar datos de Maciel Cataño en la base de datos
const mongoose = require('mongoose');
const { Parent, Student } = require('./models');

// URI de MongoDB Atlas
const MONGODB_URI = 'mongodb+srv://SanMartinDigitalUser:KpkjbzKqwT4gH9cM@sanmartindigital.b4zkj.mongodb.net/sanmartin_db?retryWrites=true&w=majority&appName=SanMartinDigital';

async function checkMacielData() {
  try {
    console.log('🔌 Conectando a MongoDB...\n');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Conectado a MongoDB\n');

    // Buscar a Maciel Cataño en la colección Parent
    console.log('📋 Buscando a Maciel Cataño en colección Parent...\n');
    const parent = await Parent.findOne({ 
      $or: [
        { firstName: /maciel/i },
        { lastName: /cataño/i },
        { email: /maciel/i }
      ]
    }).populate('children.student');

    if (parent) {
      console.log('✅ ENCONTRADO en colección Parent:');
      console.log('-----------------------------------');
      console.log(`ID: ${parent._id}`);
      console.log(`Nombre: ${parent.firstName} ${parent.lastName}`);
      console.log(`Email: ${parent.email}`);
      console.log(`DNI: ${parent.dni}`);
      console.log(`Ocupación: ${parent.occupation}`);
      console.log(`Activo: ${parent.isActive}`);
      console.log(`\n👶 Hijos vinculados (${parent.children.length}):`);
      
      parent.children.forEach((child, index) => {
        console.log(`\n  ${index + 1}. Relación: ${child.relationship}`);
        if (child.student) {
          console.log(`     Estudiante ID: ${child.student._id}`);
          console.log(`     Nombre: ${child.student.firstName} ${child.student.lastName}`);
          console.log(`     DNI: ${child.student.dni}`);
          console.log(`     Grado: ${child.student.gradeLevel}`);
          console.log(`     Sección: ${child.student.section}`);
          console.log(`     Es contacto principal: ${child.isPrimaryContact}`);
          console.log(`     Es contacto emergencia: ${child.isEmergencyContact}`);
        } else {
          console.log(`     ⚠️ ADVERTENCIA: student es null/undefined`);
          console.log(`     Student ID guardado: ${child.student}`);
        }
      });
    } else {
      console.log('❌ NO encontrado en colección Parent');
    }

    // Buscar a Diego Ramírez en la colección Student
    console.log('\n\n📋 Buscando a Diego Ramírez en colección Student...\n');
    const student = await Student.findOne({
      $or: [
        { firstName: /diego/i, lastName: /ramirez/i },
        { dni: '87654321' }
      ]
    });

    if (student) {
      console.log('✅ ENCONTRADO en colección Student:');
      console.log('-----------------------------------');
      console.log(`ID: ${student._id}`);
      console.log(`Nombre: ${student.firstName} ${student.lastName}`);
      console.log(`DNI: ${student.dni}`);
      console.log(`Grado: ${student.gradeLevel}`);
      console.log(`Sección: ${student.section}`);
      console.log(`Parent (campo antiguo): ${student.parent}`);
      console.log(`Activo: ${student.isActive}`);
    } else {
      console.log('❌ NO encontrado en colección Student');
    }

    // Verificar si hay algún error de referencia
    console.log('\n\n🔍 DIAGNÓSTICO:');
    console.log('================');
    
    if (parent && student) {
      const childLinked = parent.children.some(c => 
        c.student && c.student._id.toString() === student._id.toString()
      );
      
      if (childLinked) {
        console.log('✅ La vinculación existe correctamente en Parent.children');
      } else {
        console.log('❌ El estudiante NO está vinculado en Parent.children');
        console.log('\nIDs de estudiantes en Parent.children:');
        parent.children.forEach((c, i) => {
          console.log(`  ${i + 1}. ${c.student ? c.student._id : 'NULL'}`);
        });
        console.log(`\nID del estudiante Diego: ${student._id}`);
      }
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Desconectado de MongoDB');
  }
}

checkMacielData();
