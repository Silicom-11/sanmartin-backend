// Seeder - Datos iniciales para San Martín Digital
// Ejecutar con: node seeds/seed.js
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const {
  Institution,
  AcademicYear,
  GradeLevel,
  Subject,
  Classroom,
  CourseSection,
  Enrollment,
  User,
  Student,
} = require('../models');

// Conectar a MongoDB
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`✅ MongoDB conectado: ${conn.connection.host}`);
  } catch (error) {
    console.error('❌ Error conectando a MongoDB:', error.message);
    process.exit(1);
  }
};

// Limpiar colecciones
const clearCollections = async () => {
  console.log('🗑️  Limpiando colecciones...');
  await Promise.all([
    Institution.deleteMany({}),
    AcademicYear.deleteMany({}),
    GradeLevel.deleteMany({}),
    Subject.deleteMany({}),
    Classroom.deleteMany({}),
    CourseSection.deleteMany({}),
    Enrollment.deleteMany({}),
    // No limpiamos User y Student para no perder datos existentes
  ]);
  console.log('✅ Colecciones limpiadas');
};

// Crear institución
const createInstitution = async () => {
  console.log('🏫 Creando institución...');
  
  const institution = await Institution.create({
    name: 'Institución Educativa San Martín de Porres',
    code: 'IESMP001',
    address: {
      street: 'Av. Los Educadores 1234',
      district: 'Los Olivos',
      city: 'Lima',
      region: 'Lima',
    },
    phone: '01-5551234',
    email: 'contacto@sanmartindigital.edu.pe',
    website: 'https://sanmartindigital.edu.pe',
    
    evaluationSystem: {
      type: 'bimestral',
      periodsPerYear: 4,
      periodNames: ['I Bimestre', 'II Bimestre', 'III Bimestre', 'IV Bimestre'],
    },
    
    gradeScale: {
      type: 'vigesimal',
      minGrade: 0,
      maxGrade: 20,
      passingGrade: 11,
    },
    
    shifts: ['Mañana', 'Tarde'],
    
    academicLevels: {
      primary: { enabled: true, from: 1, to: 6 },
      secondary: { enabled: true, from: 1, to: 5 },
    },
  });
  
  console.log(`✅ Institución creada: ${institution.name}`);
  return institution;
};

// Crear año académico
const createAcademicYear = async (institutionId) => {
  console.log('📅 Creando año académico 2026...');
  
  const academicYear = await AcademicYear.create({
    institution: institutionId,
    year: 2026,
    name: 'Año Escolar 2026',
    startDate: new Date('2026-03-02'),
    endDate: new Date('2026-12-20'),
    
    periods: [
      {
        name: 'I Bimestre',
        number: 1,
        startDate: new Date('2026-03-02'),
        endDate: new Date('2026-05-15'),
        isActive: true,
        status: 'activo',
      },
      {
        name: 'II Bimestre',
        number: 2,
        startDate: new Date('2026-05-18'),
        endDate: new Date('2026-07-24'),
        isActive: false,
        status: 'pendiente',
      },
      {
        name: 'III Bimestre',
        number: 3,
        startDate: new Date('2026-08-10'),
        endDate: new Date('2026-10-16'),
        isActive: false,
        status: 'pendiente',
      },
      {
        name: 'IV Bimestre',
        number: 4,
        startDate: new Date('2026-10-19'),
        endDate: new Date('2026-12-18'),
        isActive: false,
        status: 'pendiente',
      },
    ],
    
    isCurrent: true,
    status: 'activo',
  });
  
  console.log(`✅ Año académico creado: ${academicYear.name}`);
  return academicYear;
};

// Crear grados
const createGradeLevels = async (institutionId) => {
  console.log('📚 Creando niveles de grado...');
  
  const institution = await Institution.findById(institutionId);
  const gradeLevels = await GradeLevel.createDefaultGrades(institutionId, institution.academicLevels);
  
  console.log(`✅ ${gradeLevels.length} grados creados`);
  return gradeLevels;
};

// Crear asignaturas
const createSubjects = async (institutionId, gradeLevels) => {
  console.log('📖 Creando asignaturas...');
  
  const subjects = await Subject.createDefaultSubjects(institutionId, gradeLevels);
  
  console.log(`✅ ${subjects.length} asignaturas creadas`);
  return subjects;
};

// Crear aulas
const createClassrooms = async (gradeLevels, academicYearId) => {
  console.log('🏠 Creando aulas...');
  
  const classrooms = [];
  const sections = ['A', 'B'];
  
  for (const gradeLevel of gradeLevels) {
    for (const section of sections) {
      const classroom = await Classroom.create({
        gradeLevel: gradeLevel._id,
        academicYear: academicYearId,
        section,
        shift: 'Mañana',
        capacity: 30,
        location: {
          building: 'Pabellón Principal',
          floor: gradeLevel.type === 'primaria' ? 1 : 2,
          room: `Aula ${gradeLevel.level}${section}`,
        },
      });
      classrooms.push(classroom);
    }
  }
  
  console.log(`✅ ${classrooms.length} aulas creadas`);
  return classrooms;
};

// Crear usuarios de ejemplo
const createUsers = async () => {
  console.log('👥 Creando usuarios de ejemplo...');
  
  const hashedPassword = await bcrypt.hash('password123', 12);
  
  // Administrador
  const admin = await User.findOneAndUpdate(
    { email: 'admin@sanmartin.edu.pe' },
    {
      email: 'admin@sanmartin.edu.pe',
      password: hashedPassword,
      firstName: 'Administrador',
      lastName: 'Sistema',
      role: 'administrativo',
      dni: '00000001',
      isActive: true,
      permissions: [
        'view_grades', 'edit_grades', 'publish_grades',
        'view_attendance', 'edit_attendance',
        'view_students', 'edit_students', 'delete_students',
        'view_teachers', 'edit_teachers', 'delete_teachers',
        'view_courses', 'edit_courses', 'delete_courses',
        'view_reports', 'generate_reports',
        'manage_users', 'manage_institution',
        'view_gps', 'manage_gps',
        'send_notifications', 'manage_notifications',
      ],
    },
    { upsert: true, new: true }
  );
  
  // Docentes
  const docentes = [];
  const docentesData = [
    { firstName: 'María', lastName: 'González', dni: '12345678', email: 'maria.gonzalez@sanmartin.edu.pe' },
    { firstName: 'Carlos', lastName: 'Rodríguez', dni: '23456789', email: 'carlos.rodriguez@sanmartin.edu.pe' },
    { firstName: 'Ana', lastName: 'Martínez', dni: '34567890', email: 'ana.martinez@sanmartin.edu.pe' },
    { firstName: 'Luis', lastName: 'Sánchez', dni: '45678901', email: 'luis.sanchez@sanmartin.edu.pe' },
  ];
  
  for (const data of docentesData) {
    const docente = await User.findOneAndUpdate(
      { email: data.email },
      {
        ...data,
        password: hashedPassword,
        role: 'docente',
        isActive: true,
        permissions: ['view_grades', 'edit_grades', 'publish_grades', 'view_attendance', 'edit_attendance'],
      },
      { upsert: true, new: true }
    );
    docentes.push(docente);
  }
  
  // Padre con 2 hijos
  const padre = await User.findOneAndUpdate(
    { email: 'padre@demo.com' },
    {
      email: 'padre@demo.com',
      password: hashedPassword,
      firstName: 'Juan',
      lastName: 'Pérez',
      role: 'padre',
      dni: '56789012',
      phone: '999888777',
      isActive: true,
    },
    { upsert: true, new: true }
  );
  
  console.log(`✅ Usuarios creados: 1 admin, ${docentes.length} docentes, 1 padre`);
  return { admin, docentes, padre };
};

// Crear estudiantes de ejemplo
const createStudents = async (padre, classrooms) => {
  console.log('👨‍🎓 Creando estudiantes de ejemplo...');
  
  // Encontrar aulas específicas
  const classroom1P = classrooms.find(c => c.location.room === 'Aula 1A');
  const classroom3P = classrooms.find(c => c.location.room === 'Aula 3A');
  const classroom1S = classrooms.find(c => c.location.room === 'Aula 1A' && c.location.floor === 2);
  
  // Estudiante 1: María (hija del padre Juan) - 3° Primaria A
  const maria = await Student.findOneAndUpdate(
    { dni: '70000001' },
    {
      firstName: 'María',
      lastName: 'Pérez',
      dni: '70000001',
      birthDate: new Date('2016-05-15'),
      gender: 'F',
      address: { street: 'Jr. Las Flores 123', district: 'Los Olivos', city: 'Lima' },
      guardians: [
        { user: padre._id, relationship: 'padre', isPrimary: true, canPickUp: true, emergencyContact: true },
      ],
      parent: padre._id,
      gradeLevel: '3º Primaria',
      section: 'A',
      shift: 'Mañana',
      status: 'activo',
      isActive: true,
    },
    { upsert: true, new: true }
  );
  
  // Estudiante 2: Pedro (hijo del padre Juan) - 1° Secundaria B
  const pedro = await Student.findOneAndUpdate(
    { dni: '70000002' },
    {
      firstName: 'Pedro',
      lastName: 'Pérez',
      dni: '70000002',
      birthDate: new Date('2013-08-20'),
      gender: 'M',
      address: { street: 'Jr. Las Flores 123', district: 'Los Olivos', city: 'Lima' },
      guardians: [
        { user: padre._id, relationship: 'padre', isPrimary: true, canPickUp: true, emergencyContact: true },
      ],
      parent: padre._id,
      gradeLevel: '1º Secundaria',
      section: 'B',
      shift: 'Mañana',
      status: 'activo',
      isActive: true,
    },
    { upsert: true, new: true }
  );
  
  // Actualizar padre con referencia a hijos
  padre.children = [
    { student: maria._id, relationship: 'padre' },
    { student: pedro._id, relationship: 'padre' },
  ];
  padre.students = [maria._id, pedro._id];
  await padre.save();
  
  // Estudiantes adicionales para llenar aulas
  const studentsData = [
    { firstName: 'Lucas', lastName: 'García', dni: '70000003', gender: 'M', birthDate: '2017-02-10', grade: '1º Primaria', section: 'A' },
    { firstName: 'Sofía', lastName: 'López', dni: '70000004', gender: 'F', birthDate: '2017-06-22', grade: '1º Primaria', section: 'A' },
    { firstName: 'Diego', lastName: 'Hernández', dni: '70000005', gender: 'M', birthDate: '2016-11-05', grade: '3º Primaria', section: 'A' },
    { firstName: 'Valentina', lastName: 'Torres', dni: '70000006', gender: 'F', birthDate: '2016-03-18', grade: '3º Primaria', section: 'A' },
    { firstName: 'Mateo', lastName: 'Ramírez', dni: '70000007', gender: 'M', birthDate: '2013-07-25', grade: '1º Secundaria', section: 'B' },
    { firstName: 'Isabella', lastName: 'Flores', dni: '70000008', gender: 'F', birthDate: '2013-12-08', grade: '1º Secundaria', section: 'B' },
  ];
  
  const additionalStudents = [];
  for (const data of studentsData) {
    const student = await Student.findOneAndUpdate(
      { dni: data.dni },
      {
        firstName: data.firstName,
        lastName: data.lastName,
        dni: data.dni,
        birthDate: new Date(data.birthDate),
        gender: data.gender,
        gradeLevel: data.grade,
        section: data.section,
        shift: 'Mañana',
        status: 'activo',
        isActive: true,
      },
      { upsert: true, new: true }
    );
    additionalStudents.push(student);
  }
  
  console.log(`✅ Estudiantes creados: María, Pedro + ${additionalStudents.length} adicionales`);
  return { maria, pedro, additionalStudents };
};

// Generar número de matrícula
const generateEnrollmentNumber = (academicYear, counter) => {
  const year = new Date().getFullYear();
  const seq = String(counter).padStart(5, '0');
  return `MAT-${year}-${seq}`;
};

// Crear matrículas
const createEnrollments = async (students, classrooms, academicYearId) => {
  console.log('📝 Creando matrículas...');
  
  const allStudents = await Student.find({ isActive: true });
  const enrollments = [];
  let counter = 1;
  
  for (const student of allStudents) {
    // Encontrar el aula correspondiente
    const gradeMatch = student.gradeLevel.match(/(\d+)º?\s*(Primaria|Secundaria)/i);
    if (!gradeMatch) continue;
    
    const level = parseInt(gradeMatch[1]);
    const type = gradeMatch[2].toLowerCase();
    const floor = type === 'primaria' ? 1 : 2;
    
    const classroom = classrooms.find(c => 
      c.section === student.section &&
      c.location.floor === floor &&
      c.location.room.includes(level.toString())
    );
    
    if (!classroom) continue;
    
    // Verificar si ya existe la matrícula
    let enrollment = await Enrollment.findOne({
      student: student._id,
      academicYear: academicYearId,
    });
    
    if (!enrollment) {
      enrollment = await Enrollment.create({
        student: student._id,
        classroom: classroom._id,
        academicYear: academicYearId,
        enrollmentNumber: generateEnrollmentNumber(academicYearId, counter++),
        enrollmentDate: new Date(),
        status: 'matriculado',
        enrollmentType: 'regular',
      });
    }
    
    enrollments.push(enrollment);
  }
  
  console.log(`✅ ${enrollments.length} matrículas creadas`);
  return enrollments;
};

// Crear cursos-sección (asignar profesores a materias en aulas)
const createCourseSections = async (subjects, classrooms, docentes, academicYearId) => {
  console.log('📋 Creando cursos-sección...');
  
  const courseSections = [];
  let docenteIndex = 0;
  
  // Solo crear para algunas aulas (las primeras de cada grado)
  const selectedClassrooms = classrooms.filter(c => c.section === 'A').slice(0, 4);
  
  for (const classroom of selectedClassrooms) {
    // Obtener el gradeLevel del classroom
    const gradeLevel = await GradeLevel.findById(classroom.gradeLevel);
    
    // Filtrar materias que aplican a este grado
    const applicableSubjects = subjects.filter(s => 
      s.gradeLevels.some(gl => gl.toString() === gradeLevel._id.toString())
    ).slice(0, 5); // Limitar a 5 materias por aula para el demo
    
    for (const subject of applicableSubjects) {
      const docente = docentes[docenteIndex % docentes.length];
      docenteIndex++;
      
      const courseSection = await CourseSection.create({
        subject: subject._id,
        classroom: classroom._id,
        teacher: docente._id,
        academicYear: academicYearId,
        schedule: [
          { day: 'Lunes', startTime: '08:00', endTime: '09:30' },
          { day: 'Miércoles', startTime: '10:00', endTime: '11:30' },
        ],
        evaluationWeights: subject.defaultWeights,
        isActive: true,
      });
      
      courseSections.push(courseSection);
      
      // Agregar curso a la lista de cursos asignados del docente
      if (!docente.assignedCourses) docente.assignedCourses = [];
      docente.assignedCourses.push(courseSection._id);
    }
  }
  
  // Guardar docentes con sus cursos asignados
  for (const docente of docentes) {
    await docente.save();
  }
  
  console.log(`✅ ${courseSections.length} cursos-sección creados`);
  return courseSections;
};

// Función principal
const seed = async () => {
  try {
    await connectDB();
    await clearCollections();
    
    // Crear datos en orden
    const institution = await createInstitution();
    const academicYear = await createAcademicYear(institution._id);
    const gradeLevels = await createGradeLevels(institution._id);
    const subjects = await createSubjects(institution._id, gradeLevels);
    const classrooms = await createClassrooms(gradeLevels, academicYear._id);
    const { admin, docentes, padre } = await createUsers();
    const { maria, pedro, additionalStudents } = await createStudents(padre, classrooms);
    const enrollments = await createEnrollments([maria, pedro, ...additionalStudents], classrooms, academicYear._id);
    const courseSections = await createCourseSections(subjects, classrooms, docentes, academicYear._id);
    
    console.log('\n🎉 ¡Seed completado exitosamente!\n');
    console.log('📊 Resumen:');
    console.log(`   • 1 Institución`);
    console.log(`   • 1 Año académico con 4 bimestres`);
    console.log(`   • ${gradeLevels.length} grados`);
    console.log(`   • ${subjects.length} asignaturas`);
    console.log(`   • ${classrooms.length} aulas`);
    console.log(`   • ${docentes.length + 2} usuarios (1 admin, ${docentes.length} docentes, 1 padre)`);
    console.log(`   • ${2 + additionalStudents.length} estudiantes`);
    console.log(`   • ${enrollments.length} matrículas`);
    console.log(`   • ${courseSections.length} cursos-sección`);
    console.log('\n🔐 Credenciales de prueba:');
    console.log('   Admin:   admin@sanmartin.edu.pe / password123');
    console.log('   Docente: maria.gonzalez@sanmartin.edu.pe / password123');
    console.log('   Padre:   padre@demo.com / password123');
    console.log('   (Padre tiene 2 hijos: María en 3° Primaria y Pedro en 1° Secundaria)');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error en seed:', error);
    process.exit(1);
  }
};

seed();
