// Script para diagnosticar y corregir vinculación padre-hijo
// San Martín Digital

const mongoose = require('mongoose');
require('dotenv').config();

const User = require('./models/User');
const Student = require('./models/Student');
const Parent = require('./models/Parent');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb+srv://sanmartindigital:sanmartin2024@cluster0.yidwzp0.mongodb.net/sanmartin?retryWrites=true&w=majority&appName=Cluster0';

async function diagnoseAndFix() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Conectado a MongoDB\n');

    // 1. Buscar a Lucas Aquino (padre)
    console.log('🔍 Buscando padre Lucas Aquino...');
    const parentUser = await User.findOne({ 
      firstName: /lucas/i, 
      role: 'padre' 
    });
    
    if (!parentUser) {
      console.log('❌ No se encontró usuario Lucas con rol padre');
      
      // Buscar cualquier usuario con ese nombre
      const anyLucas = await User.findOne({ firstName: /lucas/i });
      if (anyLucas) {
        console.log('📋 Encontrado usuario Lucas:', {
          id: anyLucas._id,
          nombre: `${anyLucas.firstName} ${anyLucas.lastName}`,
          email: anyLucas.email,
          role: anyLucas.role,
          children: anyLucas.children?.length || 0
        });
      }
      
      // Listar todos los padres
      console.log('\n📋 Todos los usuarios con rol padre:');
      const allParents = await User.find({ role: 'padre' });
      allParents.forEach(p => {
        console.log(`  - ${p.firstName} ${p.lastName} (${p.email}) - ${p.children?.length || 0} hijos`);
      });
    } else {
      console.log('✅ Padre encontrado:', {
        id: parentUser._id,
        nombre: `${parentUser.firstName} ${parentUser.lastName}`,
        email: parentUser.email,
        children: parentUser.children
      });
    }

    // 2. Buscar a Leonardo Fox (estudiante)
    console.log('\n🔍 Buscando estudiante Leonardo Fox...');
    const student = await Student.findOne({ 
      $or: [
        { firstName: /leonardo/i },
        { lastName: /fox/i }
      ]
    });

    if (!student) {
      console.log('❌ No se encontró estudiante Leonardo Fox');
      
      // Listar todos los estudiantes
      console.log('\n📋 Todos los estudiantes:');
      const allStudents = await Student.find({}).limit(10);
      allStudents.forEach(s => {
        console.log(`  - ${s.firstName} ${s.lastName} (${s._id}) - parent: ${s.parent || 'N/A'}`);
      });
    } else {
      console.log('✅ Estudiante encontrado:', {
        id: student._id,
        nombre: `${student.firstName} ${student.lastName}`,
        email: student.email,
        parentField: student.parent || 'N/A',
        guardians: student.guardians?.length || 0
      });

      // Mostrar guardians del estudiante
      if (student.guardians && student.guardians.length > 0) {
        console.log('\n👥 Guardians del estudiante:');
        student.guardians.forEach((g, i) => {
          console.log(`  ${i + 1}. user: ${g.user}, parent: ${g.parent}, relación: ${g.relationship}`);
        });
      }
    }

    // 3. Verificar vinculación actual
    if (parentUser && student) {
      console.log('\n🔗 Verificando vinculación...');
      
      // ¿El estudiante tiene al padre en su campo parent?
      const hasParentField = student.parent?.toString() === parentUser._id.toString();
      console.log(`  - Student.parent apunta al padre: ${hasParentField ? '✅ SÍ' : '❌ NO'}`);
      
      // ¿El estudiante tiene al padre en guardians?
      const hasGuardian = student.guardians?.some(g => 
        g.user?.toString() === parentUser._id.toString() ||
        g.parent?.toString() === parentUser._id.toString()
      );
      console.log(`  - Student.guardians incluye al padre: ${hasGuardian ? '✅ SÍ' : '❌ NO'}`);
      
      // ¿El padre tiene al estudiante en children?
      const hasChild = parentUser.children?.some(c => 
        c.student?.toString() === student._id.toString()
      );
      console.log(`  - User.children incluye al estudiante: ${hasChild ? '✅ SÍ' : '❌ NO'}`);

      // 4. ARREGLAR la vinculación
      console.log('\n🔧 Arreglando vinculación...');
      
      // 4a. Agregar parent al student si no existe
      if (!hasParentField) {
        student.parent = parentUser._id;
        console.log('  ✅ Agregado student.parent');
      }
      
      // 4b. Agregar guardian al student si no existe
      if (!hasGuardian) {
        if (!student.guardians) student.guardians = [];
        student.guardians.push({
          user: parentUser._id,
          relationship: 'padre',
          isPrimary: true,
          canPickUp: true,
          emergencyContact: true
        });
        console.log('  ✅ Agregado student.guardians[]');
      }
      
      // Guardar student
      await student.save();
      console.log('  ✅ Student guardado');

      // 4c. Agregar child al parent si no existe
      if (!hasChild) {
        if (!parentUser.children) parentUser.children = [];
        parentUser.children.push({
          student: student._id,
          relationship: 'padre'
        });
        await parentUser.save();
        console.log('  ✅ User.children actualizado');
      }

      console.log('\n✅ ¡Vinculación corregida exitosamente!');
    }

    // 5. Verificar el modelo Parent (legacy)
    console.log('\n🔍 Verificando modelo Parent (legacy)...');
    const legacyParent = await Parent.findOne({ user: parentUser?._id });
    if (legacyParent) {
      console.log('📋 Parent legacy encontrado:', {
        id: legacyParent._id,
        user: legacyParent.user,
        children: legacyParent.children?.length || 0
      });
    } else {
      console.log('ℹ️ No existe registro en modelo Parent (legacy)');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Desconectado de MongoDB');
  }
}

diagnoseAndFix();
