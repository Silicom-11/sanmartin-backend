# San Martín Digital - Backend API

Sistema de Gestión Académica para la I.E. San Martín de Porres

## 🚀 Inicio Rápido

### Prerequisitos
- Node.js 18+
- MongoDB Atlas (ya configurado)

### Instalación

```bash
# Instalar dependencias
npm install

# Desarrollo
npm run dev

# Producción
npm start
```

## 📚 Endpoints de la API

### Autenticación (`/api/auth`)
- `POST /register` - Registrar nuevo usuario
- `POST /login` - Iniciar sesión
- `POST /google` - Login con Google
- `GET /me` - Obtener usuario actual
- `PUT /profile` - Actualizar perfil
- `POST /forgot-password` - Solicitar reset de contraseña
- `POST /change-password` - Cambiar contraseña

### Estudiantes (`/api/students`)
- `GET /` - Listar estudiantes
- `GET /:id` - Obtener un estudiante
- `POST /` - Registrar estudiante
- `PUT /:id` - Actualizar estudiante
- `DELETE /:id` - Desactivar estudiante
- `GET /:id/grades` - Calificaciones del estudiante
- `GET /:id/attendance` - Asistencia del estudiante

### Calificaciones (`/api/grades`)
- `GET /` - Listar calificaciones
- `GET /course/:courseId` - Calificaciones por curso
- `POST /` - Crear/actualizar calificaciones
- `POST /bulk` - Guardar calificaciones masivas
- `PUT /:id/publish` - Publicar calificaciones
- `GET /download/:studentId` - Descargar boleta

### Asistencia (`/api/attendance`)
- `GET /` - Listar asistencia
- `GET /course/:courseId/date/:date` - Asistencia por curso y fecha
- `POST /` - Registrar asistencia individual
- `POST /bulk` - Registrar asistencia masiva
- `GET /stats/:studentId` - Estadísticas de asistencia

### Justificaciones (`/api/justifications`)
- `GET /` - Listar justificaciones
- `GET /:id` - Obtener una justificación
- `POST /` - Crear justificación
- `PUT /:id/review` - Revisar justificación
- `DELETE /:id` - Eliminar justificación

### Cursos (`/api/courses`)
- `GET /` - Listar cursos
- `GET /:id` - Obtener un curso
- `POST /` - Crear curso
- `PUT /:id` - Actualizar curso
- `POST /:id/students` - Agregar estudiantes
- `DELETE /:id/students/:studentId` - Remover estudiante
- `DELETE /:id` - Desactivar curso

### Notificaciones (`/api/notifications`)
- `GET /` - Listar notificaciones
- `GET /unread-count` - Contar no leídas
- `PUT /:id/read` - Marcar como leída
- `PUT /read-all` - Marcar todas como leídas
- `POST /` - Crear notificación
- `POST /broadcast` - Enviar a múltiples usuarios
- `DELETE /:id` - Eliminar notificación

### Dashboard (`/api/dashboard`)
- `GET /parent` - Dashboard para padres
- `GET /teacher` - Dashboard para docentes
- `GET /admin` - Dashboard para administración
- `GET /student` - Dashboard para estudiantes

## 🔐 Autenticación

La API usa JWT (JSON Web Tokens). Incluye el token en el header:

```
Authorization: Bearer <token>
```

## 🎭 Roles

- `padre` - Padres de familia
- `docente` - Docentes
- `estudiante` - Estudiantes
- `administrativo` - Personal administrativo

## 📦 Variables de Entorno

```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb+srv://...
JWT_SECRET=your_secret_key
JWT_EXPIRES_IN=7d
GOOGLE_CLIENT_ID=your_google_client_id
ALLOWED_ORIGINS=http://localhost:3000
```

## 📁 Estructura

```
sanmartin-backend/
├── server.js          # Servidor principal
├── models/            # Modelos de MongoDB
│   ├── User.js
│   ├── Student.js
│   ├── Course.js
│   ├── Grade.js
│   ├── Attendance.js
│   ├── Justification.js
│   └── Notification.js
├── routes/            # Rutas de la API
│   ├── authRoutes.js
│   ├── studentRoutes.js
│   ├── gradesRoutes.js
│   ├── attendanceRoutes.js
│   ├── justificationRoutes.js
│   ├── courseRoutes.js
│   ├── notificationRoutes.js
│   └── dashboardRoutes.js
├── middleware/        # Middlewares
│   └── auth.js
└── uploads/           # Archivos subidos
```

## 🌐 Despliegue en Render

1. Crear nuevo Web Service en Render
2. Conectar repositorio GitHub: https://github.com/Silicom-11/sanmartin-backend.git
3. Configurar variables de entorno
4. Build command: `npm install`
5. Start command: `npm start`

## 📄 Licencia

MIT
