// Servidor Principal - San Martín Digital Backend
// I.E. San Martín de Porres - Sistema de Gestión Académica

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

// Importar rutas
const authRoutes = require('./routes/authRoutes');
const studentRoutes = require('./routes/studentRoutes');
const gradesRoutes = require('./routes/gradesRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const justificationRoutes = require('./routes/justificationRoutes');
const courseRoutes = require('./routes/courseRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const usersRoutes = require('./routes/usersRoutes');
// Nuevas rutas para arquitectura mejorada
const institutionRoutes = require('./routes/institutionRoutes');
const classroomRoutes = require('./routes/classroomRoutes');
const enrollmentRoutes = require('./routes/enrollmentRoutes');
const courseSectionRoutes = require('./routes/courseSectionRoutes');
const parentRoutes = require('./routes/parentRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Confiar en proxy (Render, Heroku, etc.)
app.set('trust proxy', 1);

// Configuración de seguridad
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // límite de 100 requests por ventana
  message: {
    success: false,
    message: 'Demasiadas solicitudes, por favor intente más tarde.',
  },
});
app.use('/api/', limiter);

// Configuración de CORS
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : [
      'http://localhost:3000', 
      'http://localhost:8081',
      'https://sanmartin-dashboard.vercel.app',
      'https://sanmartin-dashboard-git-main-silicom-11.vercel.app'
    ];

app.use(cors({
  origin: (origin, callback) => {
    // Permitir requests sin origin (apps móviles, Postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    // Permitir todos los dominios de Vercel para preview deployments
    if (origin && origin.includes('sanmartin-dashboard') && origin.includes('vercel.app')) {
      return callback(null, true);
    }
    return callback(new Error('No permitido por CORS'));
  },
  credentials: true,
}));

// Middleware para parsear JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Servir archivos estáticos (uploads)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Conexión a MongoDB
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      // Nuevas opciones de Mongoose 8
    });
    console.log(`✅ MongoDB conectado: ${conn.connection.host}`);
  } catch (error) {
    console.error('❌ Error conectando a MongoDB:', error.message);
    process.exit(1);
  }
};

// Rutas de la API
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/grades', gradesRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/justifications', justificationRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/dashboard', dashboardRoutes);
// Nuevas rutas para arquitectura mejorada
app.use('/api/institution', institutionRoutes);
app.use('/api/classrooms', classroomRoutes);
app.use('/api/enrollments', enrollmentRoutes);
app.use('/api/course-sections', courseSectionRoutes);
app.use('/api/parent', parentRoutes);

// Ruta de salud del servidor
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'San Martín Digital API funcionando correctamente',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// Ruta raíz
app.get('/', (req, res) => {
  res.json({
    name: 'San Martín Digital API',
    version: '2.0.0',
    description: 'Backend del Sistema de Gestión Académica - I.E. San Martín de Porres',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      students: '/api/students',
      grades: '/api/grades',
      attendance: '/api/attendance',
      justifications: '/api/justifications',
      courses: '/api/courses',
      notifications: '/api/notifications',
      dashboard: '/api/dashboard',
      // Nuevos endpoints
      institution: '/api/institution',
      classrooms: '/api/classrooms',
      enrollments: '/api/enrollments',
      courseSections: '/api/course-sections',
      parent: '/api/parent',
    },
  });
});

// Manejo de rutas no encontradas (Express 5 compatible)
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint no encontrado',
    path: req.originalUrl,
  });
});

// Manejo global de errores
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Error interno del servidor',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// Iniciar servidor
const startServer = async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    console.log(`📍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🌐 URL: http://localhost:${PORT}`);
  });
};

startServer();

module.exports = app;
