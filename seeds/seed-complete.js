// Seeder Completo - San Martín Digital
// Ejecutar con: node seeds/seed-complete.js
// Este seed crea TODOS los datos necesarios para probar la app
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const {
  User,
  Student,
  Course,
  Grade,
  Attendance,
  Notification,
  Event,
  Justification,
  Conversation,
  Message,
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

// ==========================================
// CREAR USUARIOS
// ==========================================
const createUsers = async () => {
  console.log('👥 Creando usuarios...');
  
  const hashedPassword = await bcrypt.hash('password123', 12);
  
  // 1. ADMINISTRADOR
  const admin = await User.findOneAndUpdate(
    { email: 'admin@sanmartin.edu.pe' },
    {
      email: 'admin@sanmartin.edu.pe',
      password: hashedPassword,
      firstName: 'Carlos',
      lastName: 'Mendoza',
      role: 'administrativo',
      dni: '10000001',
      phone: '999111222',
      isActive: true,
      permissions: [
        'view_grades', 'edit_grades', 'publish_grades',
        'view_attendance', 'edit_attendance',
        'view_students', 'edit_students', 'delete_students',
        'view_teachers', 'edit_teachers', 'delete_teachers',
        'view_courses', 'edit_courses', 'delete_courses',
        'view_reports', 'generate_reports',
        'manage_users', 'manage_institution',
        'send_notifications', 'manage_notifications',
      ],
    },
    { upsert: true, new: true }
  );
  console.log('   ✓ Admin creado: admin@sanmartin.edu.pe');

  // 2. DOCENTES (4 profesores)
  const docentesData = [
    { firstName: 'Ana', lastName: 'Torres', dni: '20000001', email: 'docente@sanmartin.edu.pe', phone: '999222111' },
    { firstName: 'María', lastName: 'González', dni: '20000002', email: 'maria.gonzalez@sanmartin.edu.pe', phone: '999222222' },
    { firstName: 'Luis', lastName: 'Rodríguez', dni: '20000003', email: 'luis.rodriguez@sanmartin.edu.pe', phone: '999222333' },
    { firstName: 'Carmen', lastName: 'Flores', dni: '20000004', email: 'carmen.flores@sanmartin.edu.pe', phone: '999222444' },
  ];

  const docentes = [];
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
  console.log(`   ✓ ${docentes.length} docentes creados`);

  // 3. PADRES (2 padres)
  const padre1 = await User.findOneAndUpdate(
    { email: 'padre@sanmartin.edu.pe' },
    {
      email: 'padre@sanmartin.edu.pe',
      password: hashedPassword,
      firstName: 'Carlos',
      lastName: 'Ramírez',
      role: 'padre',
      dni: '30000001',
      phone: '999333111',
      isActive: true,
    },
    { upsert: true, new: true }
  );

  const padre2 = await User.findOneAndUpdate(
    { email: 'padre2@sanmartin.edu.pe' },
    {
      email: 'padre2@sanmartin.edu.pe',
      password: hashedPassword,
      firstName: 'Rosa',
      lastName: 'Mendoza',
      role: 'padre',
      dni: '30000002',
      phone: '999333222',
      isActive: true,
    },
    { upsert: true, new: true }
  );
  console.log('   ✓ 2 padres creados');

  // 4. ESTUDIANTE con cuenta (para probar login de estudiante)
  const estudianteUser = await User.findOneAndUpdate(
    { email: 'estudiante@sanmartin.edu.pe' },
    {
      email: 'estudiante@sanmartin.edu.pe',
      password: hashedPassword,
      firstName: 'Diego',
      lastName: 'Ramírez',
      role: 'estudiante',
      dni: '70000010',
      isActive: true,
    },
    { upsert: true, new: true }
  );
  console.log('   ✓ 1 estudiante con cuenta creado');

  return { admin, docentes, padre1, padre2, estudianteUser };
};

// ==========================================
// CREAR ESTUDIANTES
// ==========================================
const createStudents = async (padre1, padre2, estudianteUser) => {
  console.log('👨‍🎓 Creando estudiantes...');

  // Estudiantes del Padre 1 (Carlos Ramírez)
  const estudiante1 = await Student.findOneAndUpdate(
    { dni: '70000001' },
    {
      firstName: 'Diego',
      lastName: 'Ramírez',
      dni: '70000001',
      enrollmentNumber: 'SMP-2026-0001',
      birthDate: new Date('2013-05-15'),
      gender: 'M',
      gradeLevel: '1º Secundaria',
      section: 'A',
      shift: 'Mañana',
      parent: padre1._id,
      userAccount: estudianteUser._id, // Vinculado a cuenta de usuario
      guardians: [{ user: padre1._id, relationship: 'padre', isPrimary: true }],
      status: 'activo',
      isActive: true,
    },
    { upsert: true, new: true }
  );

  const estudiante2 = await Student.findOneAndUpdate(
    { dni: '70000002' },
    {
      firstName: 'Lucía',
      lastName: 'Ramírez',
      dni: '70000002',
      enrollmentNumber: 'SMP-2026-0002',
      birthDate: new Date('2016-08-22'),
      gender: 'F',
      gradeLevel: '3º Primaria',
      section: 'A',
      shift: 'Mañana',
      parent: padre1._id,
      guardians: [{ user: padre1._id, relationship: 'padre', isPrimary: true }],
      status: 'activo',
      isActive: true,
    },
    { upsert: true, new: true }
  );

  // Estudiantes del Padre 2 (Rosa Mendoza)
  const estudiante3 = await Student.findOneAndUpdate(
    { dni: '70000003' },
    {
      firstName: 'Miguel',
      lastName: 'Mendoza',
      dni: '70000003',
      enrollmentNumber: 'SMP-2026-0003',
      birthDate: new Date('2014-03-10'),
      gender: 'M',
      gradeLevel: '5º Primaria',
      section: 'A',
      shift: 'Mañana',
      parent: padre2._id,
      guardians: [{ user: padre2._id, relationship: 'madre', isPrimary: true }],
      status: 'activo',
      isActive: true,
    },
    { upsert: true, new: true }
  );

  // Más estudiantes para los cursos
  const moreStudents = [];
  const studentsData = [
    { firstName: 'Sofía', lastName: 'García', dni: '70000004', enrollmentNumber: 'SMP-2026-0004', gender: 'F', birthDate: '2013-02-14', grade: '1º Secundaria', section: 'A' },
    { firstName: 'Mateo', lastName: 'López', dni: '70000005', enrollmentNumber: 'SMP-2026-0005', gender: 'M', birthDate: '2013-06-25', grade: '1º Secundaria', section: 'A' },
    { firstName: 'Valentina', lastName: 'Torres', dni: '70000006', enrollmentNumber: 'SMP-2026-0006', gender: 'F', birthDate: '2013-09-08', grade: '1º Secundaria', section: 'A' },
    { firstName: 'Sebastián', lastName: 'Hernández', dni: '70000007', enrollmentNumber: 'SMP-2026-0007', gender: 'M', birthDate: '2013-11-30', grade: '1º Secundaria', section: 'A' },
    { firstName: 'Isabella', lastName: 'Martínez', dni: '70000008', enrollmentNumber: 'SMP-2026-0008', gender: 'F', birthDate: '2016-04-12', grade: '3º Primaria', section: 'A' },
    { firstName: 'Nicolás', lastName: 'Rodríguez', dni: '70000009', enrollmentNumber: 'SMP-2026-0009', gender: 'M', birthDate: '2016-07-19', grade: '3º Primaria', section: 'A' },
  ];

  for (const data of studentsData) {
    const student = await Student.findOneAndUpdate(
      { dni: data.dni },
      {
        firstName: data.firstName,
        lastName: data.lastName,
        dni: data.dni,
        enrollmentNumber: data.enrollmentNumber,
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
    moreStudents.push(student);
  }

  // Actualizar padres con sus hijos
  padre1.students = [estudiante1._id, estudiante2._id];
  padre1.children = [
    { student: estudiante1._id, relationship: 'padre' },
    { student: estudiante2._id, relationship: 'padre' },
  ];
  await padre1.save();

  padre2.students = [estudiante3._id];
  padre2.children = [{ student: estudiante3._id, relationship: 'madre' }];
  await padre2.save();

  // Vincular usuario estudiante con su perfil de Student
  estudianteUser.studentProfile = estudiante1._id;
  await estudianteUser.save();

  console.log(`   ✓ ${3 + moreStudents.length} estudiantes creados`);
  
  return { estudiante1, estudiante2, estudiante3, moreStudents };
};

// ==========================================
// CREAR CURSOS (Legacy - para compatibilidad con la app actual)
// ==========================================
const createCourses = async (docentes, students) => {
  console.log('📚 Creando cursos...');

  const { estudiante1, estudiante2, estudiante3, moreStudents } = students;
  
  // Estudiantes de 1º Secundaria A
  const students1SecA = [estudiante1, ...moreStudents.filter(s => s.gradeLevel === '1º Secundaria')];
  
  // Estudiantes de 3º Primaria A
  const students3PriA = [estudiante2, ...moreStudents.filter(s => s.gradeLevel === '3º Primaria')];
  
  // Estudiantes de 5º Primaria A
  const students5PriA = [estudiante3];

  const coursesData = [
    // Cursos de Ana Torres (docente@sanmartin.edu.pe) - 1º Secundaria
    { name: 'Matemáticas', code: 'MAT-1S-A', teacher: docentes[0]._id, gradeLevel: '1º Secundaria', section: 'A', students: students1SecA.map(s => s._id) },
    { name: 'Comunicación', code: 'COM-1S-A', teacher: docentes[0]._id, gradeLevel: '1º Secundaria', section: 'A', students: students1SecA.map(s => s._id) },
    
    // Cursos de María González - 1º Secundaria
    { name: 'Ciencias Naturales', code: 'CIE-1S-A', teacher: docentes[1]._id, gradeLevel: '1º Secundaria', section: 'A', students: students1SecA.map(s => s._id) },
    { name: 'Historia', code: 'HIS-1S-A', teacher: docentes[1]._id, gradeLevel: '1º Secundaria', section: 'A', students: students1SecA.map(s => s._id) },
    
    // Cursos de Luis Rodríguez - 3º Primaria
    { name: 'Matemáticas', code: 'MAT-3P-A', teacher: docentes[2]._id, gradeLevel: '3º Primaria', section: 'A', students: students3PriA.map(s => s._id) },
    { name: 'Comunicación', code: 'COM-3P-A', teacher: docentes[2]._id, gradeLevel: '3º Primaria', section: 'A', students: students3PriA.map(s => s._id) },
    
    // Cursos de Carmen Flores - 5º Primaria
    { name: 'Matemáticas', code: 'MAT-5P-A', teacher: docentes[3]._id, gradeLevel: '5º Primaria', section: 'A', students: students5PriA.map(s => s._id) },
    { name: 'Ciencias', code: 'CIE-5P-A', teacher: docentes[3]._id, gradeLevel: '5º Primaria', section: 'A', students: students5PriA.map(s => s._id) },
  ];

  const courses = [];
  for (const data of coursesData) {
    const course = await Course.findOneAndUpdate(
      { code: data.code },
      {
        ...data,
        academicYear: 2026,
        schedule: [
          { day: 'Lunes', startTime: '08:00', endTime: '09:30', classroom: 'Aula 101' },
          { day: 'Miércoles', startTime: '10:00', endTime: '11:30', classroom: 'Aula 101' },
        ],
        isActive: true,
      },
      { upsert: true, new: true }
    );
    courses.push(course);
  }

  // Actualizar docentes con sus cursos
  for (const docente of docentes) {
    const docenteCourses = courses.filter(c => c.teacher.toString() === docente._id.toString());
    docente.courses = docenteCourses.map(c => c._id);
    await docente.save();
  }

  // Actualizar estudiantes con sus cursos
  for (const student of [estudiante1, estudiante2, estudiante3, ...moreStudents]) {
    const studentCourses = courses.filter(c => 
      c.students.some(s => s.toString() === student._id.toString())
    );
    student.courses = studentCourses.map(c => c._id);
    await student.save();
  }

  console.log(`   ✓ ${courses.length} cursos creados`);
  return courses;
};

// ==========================================
// CREAR CALIFICACIONES
// ==========================================
const createGrades = async (courses, docentes) => {
  console.log('📝 Creando calificaciones...');

  let gradesCount = 0;
  const year = 2026;

  for (const course of courses) {
    const students = await Student.find({ _id: { $in: course.students } });
    
    for (const student of students) {
      // Crear calificaciones para el primer bimestre
      const evaluations = [
        { name: 'Examen Parcial', type: 'exam', score: Math.floor(Math.random() * 6) + 14, date: new Date('2026-03-20'), weight: 30 },
        { name: 'Trabajo Práctico 1', type: 'homework', score: Math.floor(Math.random() * 5) + 15, date: new Date('2026-03-25'), weight: 20 },
        { name: 'Participación', type: 'participation', score: Math.floor(Math.random() * 4) + 16, date: new Date('2026-04-01'), weight: 10 },
        { name: 'Examen Final', type: 'exam', score: Math.floor(Math.random() * 6) + 13, date: new Date('2026-04-15'), weight: 40 },
      ];

      // Calcular promedios
      let totalWeight = 0;
      let weightedSum = 0;
      evaluations.forEach(e => {
        weightedSum += e.score * e.weight;
        totalWeight += e.weight;
      });
      const finalAvg = totalWeight > 0 ? (weightedSum / totalWeight).toFixed(1) : 0;

      await Grade.findOneAndUpdate(
        { student: student._id, course: course._id, academicYear: year, period: 1 },
        {
          student: student._id,
          course: course._id,
          teacher: course.teacher,
          academicYear: year,
          period: 1,
          periodName: 'I Bimestre',
          evaluations,
          averages: {
            period: parseFloat(finalAvg),
            final: parseFloat(finalAvg),
          },
          isPublished: true,
          publishedAt: new Date(),
        },
        { upsert: true, new: true }
      );
      gradesCount++;
    }
  }

  console.log(`   ✓ ${gradesCount} registros de calificaciones creados`);
};

// ==========================================
// CREAR ASISTENCIAS
// ==========================================
const createAttendances = async (courses, docentes) => {
  console.log('✅ Creando asistencias...');

  let attendanceCount = 0;
  const statuses = ['present', 'present', 'present', 'present', 'late', 'absent']; // 66% presente, 16% tarde, 16% ausente

  // Crear asistencias de los últimos 5 días escolares
  const today = new Date();
  const dates = [];
  for (let i = 0; i < 5; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    if (date.getDay() !== 0 && date.getDay() !== 6) { // Skip weekends
      dates.push(date);
    }
  }

  for (const course of courses) {
    const students = await Student.find({ _id: { $in: course.students } });
    
    for (const date of dates) {
      for (const student of students) {
        const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
        
        await Attendance.findOneAndUpdate(
          { student: student._id, course: course._id, date: date },
          {
            student: student._id,
            course: course._id,
            teacher: course.teacher,
            date: date,
            status: randomStatus,
            arrivalTime: randomStatus === 'late' ? '08:15' : (randomStatus === 'present' ? '07:45' : null),
            notes: randomStatus === 'absent' ? 'Sin justificación' : '',
          },
          { upsert: true, new: true }
        );
        attendanceCount++;
      }
    }
  }

  console.log(`   ✓ ${attendanceCount} registros de asistencia creados`);
};

// ==========================================
// CREAR EVENTOS
// ==========================================
const createEvents = async () => {
  console.log('📅 Creando eventos...');

  const eventsData = [
    {
      title: 'Inicio de Clases - I Bimestre',
      description: 'Inicio del año escolar 2026',
      type: 'activity',
      date: '2026-03-02',
      time: '08:00',
      location: 'Colegio San Martín de Porres',
      notifyStudents: true,
      notifyParents: true,
      notifyTeachers: true,
    },
    {
      title: 'Reunión de Padres',
      description: 'Primera reunión de padres de familia del año escolar',
      type: 'meeting',
      date: '2026-03-15',
      time: '18:00',
      location: 'Auditorio Principal',
      notifyParents: true,
      notifyTeachers: true,
    },
    {
      title: 'Exámenes Parciales',
      description: 'Semana de exámenes parciales del I Bimestre',
      type: 'exam',
      date: '2026-04-07',
      time: '',
      location: 'Aulas',
      notifyStudents: true,
      notifyParents: true,
      notifyTeachers: true,
    },
    {
      title: 'Día del Maestro',
      description: 'Celebración del día del maestro - Sin clases',
      type: 'holiday',
      date: '2026-07-06',
      time: '',
      location: '',
      notifyStudents: true,
      notifyParents: true,
      notifyTeachers: true,
    },
    {
      title: 'Feria de Ciencias',
      description: 'Exposición de proyectos científicos de los estudiantes',
      type: 'activity',
      date: '2026-05-20',
      time: '09:00',
      location: 'Patio Central',
      notifyStudents: true,
      notifyParents: true,
    },
    {
      title: 'Fin del I Bimestre',
      description: 'Último día de clases del primer bimestre',
      type: 'deadline',
      date: '2026-05-15',
      time: '13:00',
      location: 'Colegio',
      notifyStudents: true,
      notifyParents: true,
      notifyTeachers: true,
    },
  ];

  for (const eventData of eventsData) {
    await Event.findOneAndUpdate(
      { title: eventData.title, date: eventData.date },
      {
        ...eventData,
        isActive: true,
        createdBy: null,
      },
      { upsert: true, new: true }
    );
  }

  console.log(`   ✓ ${eventsData.length} eventos creados`);
};

// ==========================================
// CREAR NOTIFICACIONES
// ==========================================
const createNotifications = async (users) => {
  console.log('🔔 Creando notificaciones...');

  const { padre1, padre2, docentes } = users;
  let notifCount = 0;

  // Notificaciones para padres
  const parentNotifs = [
    { title: 'Bienvenido a San Martín Digital', message: 'Gracias por registrarte. Aquí podrás ver el progreso académico de tus hijos.', type: 'info' },
    { title: 'Nueva calificación publicada', message: 'Se ha publicado una nueva calificación en Matemáticas para tu hijo.', type: 'grade' },
    { title: 'Recordatorio: Reunión de Padres', message: 'No olvides asistir a la reunión de padres el 15 de marzo a las 6:00 PM.', type: 'event' },
  ];

  for (const padre of [padre1, padre2]) {
    for (const notif of parentNotifs) {
      await Notification.create({
        recipient: padre._id,
        title: notif.title,
        message: notif.message,
        type: notif.type,
        isRead: Math.random() > 0.5, // Algunas leídas, otras no
        createdAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000), // Últimos 7 días
      });
      notifCount++;
    }
  }

  // Notificaciones para docentes
  const teacherNotifs = [
    { title: 'Nueva justificación pendiente', message: 'Un padre ha enviado una justificación de inasistencia para revisar.', type: 'info' },
    { title: 'Recordatorio: Cierre de notas', message: 'Recuerda ingresar todas las calificaciones antes del 30 de abril.', type: 'warning' },
  ];

  for (const docente of docentes) {
    for (const notif of teacherNotifs) {
      await Notification.create({
        recipient: docente._id,
        title: notif.title,
        message: notif.message,
        type: notif.type,
        isRead: false,
        createdAt: new Date(),
      });
      notifCount++;
    }
  }

  console.log(`   ✓ ${notifCount} notificaciones creadas`);
};

// ==========================================
// CREAR JUSTIFICACIONES DE EJEMPLO
// ==========================================
const createJustifications = async (padre1, estudiante1) => {
  console.log('📋 Creando justificaciones de ejemplo...');

  await Justification.findOneAndUpdate(
    { student: estudiante1._id, reason: 'Cita médica' },
    {
      student: estudiante1._id,
      parent: padre1._id,
      dates: [new Date('2026-01-15')],
      reason: 'Cita médica',
      observations: 'Cita con el pediatra programada',
      status: 'approved',
      reviewedBy: null,
      reviewedAt: new Date('2026-01-16'),
      reviewNote: 'Justificación aprobada con documento médico',
    },
    { upsert: true, new: true }
  );

  await Justification.findOneAndUpdate(
    { student: estudiante1._id, reason: 'Enfermedad' },
    {
      student: estudiante1._id,
      parent: padre1._id,
      dates: [new Date('2026-01-10')],
      reason: 'Enfermedad',
      observations: 'Gripe estacional',
      status: 'pending',
      documents: [],
    },
    { upsert: true, new: true }
  );

  console.log('   ✓ 2 justificaciones de ejemplo creadas');
};

// ==========================================
// CREAR CONVERSACIONES Y MENSAJES
// ==========================================
const createConversations = async (users) => {
  console.log('💬 Creando conversaciones y mensajes...');
  
  const { padre1, docentes } = users;
  const docente1 = docentes[0]; // Ana Torres
  
  // Primero eliminar conversaciones existentes entre ellos
  await Conversation.deleteMany({
    type: 'direct',
    participants: { $all: [padre1._id, docente1._id] }
  });

  // Crear conversación directa
  const conversation = await Conversation.create({
    type: 'direct',
    participants: [padre1._id, docente1._id],
    lastMessage: {
      content: 'Perfecto, muchas gracias por la información.',
      sender: padre1._id,
      sentAt: new Date(Date.now() - 1000 * 60 * 30),
    },
    unreadCount: new Map([[docente1._id.toString(), 1]]),
    isActive: true,
  });

  // Crear mensajes de ejemplo
  const messages = [
    {
      conversation: conversation._id,
      sender: padre1._id,
      content: 'Buenos días profesora Ana, quisiera saber cómo va Diego en Matemáticas.',
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
    },
    {
      conversation: conversation._id,
      sender: docente1._id,
      content: 'Buenos días Sr. Ramírez. Diego está yendo muy bien, ha mejorado mucho en las últimas semanas.',
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 23),
    },
    {
      conversation: conversation._id,
      sender: docente1._id,
      content: 'Su promedio actual es 17 y participa activamente en clase.',
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 22),
    },
    {
      conversation: conversation._id,
      sender: padre1._id,
      content: 'Me alegra mucho escuchar eso. ¿Hay algo en lo que deba apoyarlo en casa?',
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
    },
    {
      conversation: conversation._id,
      sender: docente1._id,
      content: 'Le recomiendo que practique más los ejercicios de ecuaciones. Puede usar las guías que subimos a la plataforma.',
      createdAt: new Date(Date.now() - 1000 * 60 * 60),
    },
    {
      conversation: conversation._id,
      sender: padre1._id,
      content: 'Perfecto, muchas gracias por la información.',
      createdAt: new Date(Date.now() - 1000 * 60 * 30),
    },
  ];

  // Limpiar mensajes existentes de esta conversación
  await Message.deleteMany({ conversation: conversation._id });
  
  // Insertar nuevos mensajes
  await Message.insertMany(messages);

  console.log('   ✓ 1 conversación con 6 mensajes creada');
};

// ==========================================
// FUNCIÓN PRINCIPAL
// ==========================================
const seedComplete = async () => {
  try {
    await connectDB();
    
    console.log('\n🚀 Iniciando seed completo...\n');
    
    // Crear datos
    const users = await createUsers();
    const students = await createStudents(users.padre1, users.padre2, users.estudianteUser);
    const courses = await createCourses(users.docentes, students);
    await createGrades(courses, users.docentes);
    await createAttendances(courses, users.docentes);
    await createEvents();
    await createNotifications({ padre1: users.padre1, padre2: users.padre2, docentes: users.docentes });
    await createJustifications(users.padre1, students.estudiante1);
    await createConversations({ padre1: users.padre1, docentes: users.docentes });
    
    console.log('\n' + '='.repeat(50));
    console.log('🎉 ¡SEED COMPLETADO EXITOSAMENTE!');
    console.log('='.repeat(50));
    
    console.log('\n📊 RESUMEN DE DATOS CREADOS:');
    console.log('   • 1 Administrador');
    console.log('   • 4 Docentes');
    console.log('   • 2 Padres');
    console.log('   • 1 Estudiante con cuenta de usuario');
    console.log(`   • ${3 + students.moreStudents.length} Estudiantes totales`);
    console.log(`   • ${courses.length} Cursos`);
    console.log('   • Calificaciones para todos los estudiantes');
    console.log('   • Asistencias de los últimos 5 días');
    console.log('   • 6 Eventos del calendario');
    console.log('   • Notificaciones de prueba');
    console.log('   • 2 Justificaciones de ejemplo');
    console.log('   • 1 Conversación con mensajes de ejemplo');
    
    console.log('\n🔐 CREDENCIALES DE PRUEBA:');
    console.log('   ┌─────────────────────────────────────────────────┐');
    console.log('   │ ROL           │ EMAIL                  │ PASS  │');
    console.log('   ├─────────────────────────────────────────────────┤');
    console.log('   │ Admin         │ admin@sanmartin.edu.pe │ password123 │');
    console.log('   │ Docente       │ docente@sanmartin.edu.pe │ password123 │');
    console.log('   │ Padre         │ padre@sanmartin.edu.pe │ password123 │');
    console.log('   │ Estudiante    │ estudiante@sanmartin.edu.pe │ password123 │');
    console.log('   └─────────────────────────────────────────────────┘');
    
    console.log('\n👨‍👧 RELACIONES PADRE-HIJO:');
    console.log('   • padre@sanmartin.edu.pe tiene 2 hijos:');
    console.log('     - Diego Ramírez (1º Secundaria A)');
    console.log('     - Lucía Ramírez (3º Primaria A)');
    console.log('   • padre2@sanmartin.edu.pe tiene 1 hijo:');
    console.log('     - Miguel Mendoza (5º Primaria A)');
    
    console.log('\n👨‍🏫 CURSOS POR DOCENTE:');
    console.log('   • docente@sanmartin.edu.pe (Ana Torres):');
    console.log('     - Matemáticas 1º Sec A (5 estudiantes)');
    console.log('     - Comunicación 1º Sec A (5 estudiantes)');
    console.log('');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error en seed:', error);
    process.exit(1);
  }
};

seedComplete();
