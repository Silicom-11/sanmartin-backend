// Script de diagnóstico completo
const mongoose = require('mongoose');
require('dotenv').config();

const User = require('./models/User');
const Student = require('./models/Student');
const Parent = require('./models/Parent');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb+srv://sanmartindigital:sanmartin2024@cluster0.yidwzp0.mongodb.net/sanmartin?retryWrites=true&w=majority&appName=Cluster0';

async function fullDiagnosis() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Conectado a MongoDB\n');

    // 1. Ver TODOS los Users
    console.log('==========================================');
    console.log('📋 TODOS LOS USUARIOS EN LA BASE DE DATOS:');
    console.log('==========================================\n');
    const allUsers = await User.find({});
    allUsers.forEach(u => {
      console.log(`👤 ${u.firstName} ${u.lastName}`);
      console.log(`   Email: ${u.email}`);
      console.log(`   Role: ${u.role}`);
      console.log(`   ID: ${u._id}`);
      console.log(`   Children: ${u.children?.length || 0}`);
      console.log('');
    });

    // 2. Ver TODOS los Parents (modelo legacy)
    console.log('==========================================');
    console.log('📋 TODOS LOS PARENTS (MODELO LEGACY):');
    console.log('==========================================\n');
    const allParents = await Parent.find({}).populate('user').populate('children.student');
    allParents.forEach(p => {
      console.log(`👨‍👩‍👧 Parent ID: ${p._id}`);
      console.log(`   User linked: ${p.user ? `${p.user.firstName} ${p.user.lastName}` : 'undefined'}`);
      console.log(`   User ID: ${p.user?._id || 'N/A'}`);
      console.log(`   Children count: ${p.children?.length || 0}`);
      if (p.children && p.children.length > 0) {
        p.children.forEach((c, i) => {
          console.log(`   Hijo ${i + 1}: ${c.student ? `${c.student.firstName} ${c.student.lastName}` : c.student}`);
        });
      }
      console.log('');
    });

    // 3. Ver Leonardo Fox (estudiante)
    console.log('==========================================');
    console.log('🎓 ESTUDIANTE LEONARDO FOX:');
    console.log('==========================================\n');
    const leonardo = await Student.findOne({ firstName: /leonardo/i });
    if (leonardo) {
      console.log(`   ID: ${leonardo._id}`);
      console.log(`   Nombre: ${leonardo.firstName} ${leonardo.lastName}`);
      console.log(`   Email: ${leonardo.email}`);
      console.log(`   Parent field: ${leonardo.parent || 'null'}`);
      console.log(`   Guardians: ${leonardo.guardians?.length || 0}`);
      console.log(`   Last Location:`, leonardo.lastLocation || 'null');
    }

    // 4. Buscar quién es Lucas Aquino
    console.log('\n==========================================');
    console.log('🔍 BUSCANDO LUCAS AQUINO:');
    console.log('==========================================\n');
    
    const lucasUser = await User.findOne({ 
      $or: [
        { firstName: /lucas/i },
        { lastName: /aquino/i }
      ]
    });
    
    const lucasParent = await Parent.findOne({
      $or: [
        { firstName: /lucas/i },
        { lastName: /aquino/i },
        { 'mainGuardian.firstName': /lucas/i },
        { 'mainGuardian.lastName': /aquino/i }
      ]
    }).populate('user');

    if (lucasUser) {
      console.log('✅ Usuario Lucas encontrado:', {
        id: lucasUser._id,
        nombre: `${lucasUser.firstName} ${lucasUser.lastName}`,
        email: lucasUser.email,
        role: lucasUser.role
      });
    } else {
      console.log('❌ Usuario Lucas NO encontrado en Users');
    }

    if (lucasParent) {
      console.log('✅ Parent Lucas encontrado:', {
        id: lucasParent._id,
        user: lucasParent.user ? `${lucasParent.user.firstName} ${lucasParent.user.lastName}` : 'N/A',
        children: lucasParent.children?.length || 0
      });
    } else {
      console.log('❌ Parent Lucas NO encontrado en Parents');
    }

    // 5. Ver todos los Parent con sus emails
    console.log('\n==========================================');
    console.log('📋 PARENTS CON EMAILS:');
    console.log('==========================================\n');
    const parentsWithInfo = await Parent.find({});
    for (const p of parentsWithInfo) {
      console.log(`Parent ID: ${p._id}`);
      console.log(`  mainGuardian: ${p.mainGuardian?.firstName || 'N/A'} ${p.mainGuardian?.lastName || ''}`);
      console.log(`  email: ${p.mainGuardian?.email || p.email || 'N/A'}`);
      console.log('');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Desconectado de MongoDB');
  }
}

fullDiagnosis();
