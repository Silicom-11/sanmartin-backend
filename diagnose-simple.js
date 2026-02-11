// Script de diagnóstico sin populate
const mongoose = require('mongoose');
require('dotenv').config();

const User = require('./models/User');
const Student = require('./models/Student');
const Parent = require('./models/Parent');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb+srv://sanmartindigital:sanmartin2024@cluster0.yidwzp0.mongodb.net/sanmartin?retryWrites=true&w=majority&appName=Cluster0';

async function diagnose() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Conectado a MongoDB\n');

    // 1. Ver TODOS los Parents
    console.log('==========================================');
    console.log('📋 TODOS LOS PARENTS:');
    console.log('==========================================\n');
    const allParents = await Parent.find({});
    for (const p of allParents) {
      console.log(`👨‍👩‍👧 Parent: ${p.firstName} ${p.lastName}`);
      console.log(`   ID: ${p._id}`);
      console.log(`   Email: ${p.email}`);
      console.log(`   DNI: ${p.dni}`);
      console.log(`   Children IDs:`, p.children?.map(c => ({ 
        studentId: c.student?.toString(), 
        relationship: c.relationship 
      })));
      console.log('');
    }

    // 2. Ver Leonardo Fox
    console.log('==========================================');
    console.log('🎓 ESTUDIANTE LEONARDO FOX:');
    console.log('==========================================\n');
    const leonardo = await Student.findOne({ firstName: /leonardo/i });
    if (leonardo) {
      console.log(`   ID: ${leonardo._id}`);
      console.log(`   Nombre: ${leonardo.firstName} ${leonardo.lastName}`);
      console.log(`   Email: ${leonardo.email}`);
      console.log(`   Parent field: ${leonardo.parent || 'null'}`);
      console.log(`   Guardians:`, leonardo.guardians);
    }

    // 3. Verificar vinculación
    if (allParents.length > 0 && leonardo) {
      console.log('\n==========================================');
      console.log('🔗 VERIFICANDO VINCULACIONES:');
      console.log('==========================================\n');
      
      for (const parent of allParents) {
        const hasChild = parent.children?.some(c => 
          c.student?.toString() === leonardo._id.toString()
        );
        console.log(`${parent.firstName} ${parent.lastName} -> Leonardo Fox: ${hasChild ? '✅ VINCULADO' : '❌ NO VINCULADO'}`);
        
        if (hasChild) {
          // Verificar que el estudiante tenga referencia al padre
          const studentHasParent = leonardo.parent?.toString() === parent._id.toString();
          const studentHasGuardian = leonardo.guardians?.some(g => 
            g.parent?.toString() === parent._id.toString()
          );
          
          console.log(`   - Student.parent apunta a ${parent.firstName}: ${studentHasParent ? '✅' : '❌'}`);
          console.log(`   - Student.guardians incluye a ${parent.firstName}: ${studentHasGuardian ? '✅' : '❌'}`);
        }
      }
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Desconectado de MongoDB');
  }
}

diagnose();
