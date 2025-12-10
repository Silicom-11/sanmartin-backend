// Rutas de Autenticación - San Martín Digital
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { User } = require('../models');
const { auth } = require('../middleware/auth');

// Generar token JWT
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

// POST /api/auth/register - Registrar nuevo usuario
router.post('/register', [
  body('email').isEmail().withMessage('Correo inválido'),
  body('password').isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres'),
  body('firstName').notEmpty().withMessage('El nombre es requerido'),
  body('lastName').notEmpty().withMessage('El apellido es requerido'),
  body('role').isIn(['padre', 'docente', 'administrativo']).withMessage('Rol inválido'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Datos de validación incorrectos',
        errors: errors.array(),
      });
    }

    const { email, password, firstName, lastName, role, phone, dni } = req.body;

    // Verificar si el usuario ya existe
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'El correo ya está registrado',
      });
    }

    // Crear usuario
    const user = await User.create({
      email,
      password,
      firstName,
      lastName,
      role,
      phone,
      dni,
    });

    // Generar token
    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: 'Usuario registrado exitosamente',
      data: {
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          fullName: user.fullName,
          role: user.role,
        },
        token,
      },
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al registrar usuario',
      error: error.message,
    });
  }
});

// POST /api/auth/login - Iniciar sesión
router.post('/login', [
  body('email').isEmail().withMessage('Correo inválido'),
  body('password').notEmpty().withMessage('La contraseña es requerida'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Datos de validación incorrectos',
        errors: errors.array(),
      });
    }

    const { email, password } = req.body;

    // Buscar usuario con contraseña
    const user = await User.findOne({ email }).select('+password');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales incorrectas',
      });
    }

    // Verificar contraseña
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales incorrectas',
      });
    }

    // Actualizar último login
    user.lastLogin = new Date();
    await user.save();

    // Generar token
    const token = generateToken(user._id);

    res.json({
      success: true,
      message: 'Inicio de sesión exitoso',
      data: {
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          fullName: user.fullName,
          role: user.role,
          avatar: user.avatar,
        },
        token,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al iniciar sesión',
      error: error.message,
    });
  }
});

// POST /api/auth/google - Login con Google
router.post('/google', async (req, res) => {
  try {
    const { idToken, googleId, email, firstName, lastName, avatar } = req.body;

    if (!googleId || !email) {
      return res.status(400).json({
        success: false,
        message: 'Datos de Google incompletos',
      });
    }

    // Buscar usuario por googleId o email
    let user = await User.findOne({ $or: [{ googleId }, { email }] });

    if (user) {
      // Actualizar googleId si no lo tiene
      if (!user.googleId) {
        user.googleId = googleId;
      }
      user.lastLogin = new Date();
      await user.save();
    } else {
      // Crear nuevo usuario
      user = await User.create({
        googleId,
        email,
        firstName: firstName || 'Usuario',
        lastName: lastName || 'Google',
        role: 'padre', // Por defecto
        avatar,
      });
    }

    // Generar token
    const token = generateToken(user._id);

    res.json({
      success: true,
      message: 'Inicio de sesión con Google exitoso',
      data: {
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          fullName: user.fullName,
          role: user.role,
          avatar: user.avatar,
        },
        token,
        isNewUser: !user.createdAt || user.createdAt === user.updatedAt,
      },
    });
  } catch (error) {
    console.error('Google auth error:', error);
    res.status(500).json({
      success: false,
      message: 'Error en autenticación con Google',
      error: error.message,
    });
  }
});

// GET /api/auth/me - Obtener usuario actual
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .populate('students', 'firstName lastName gradeLevel section');

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          fullName: user.fullName,
          role: user.role,
          phone: user.phone,
          avatar: user.avatar,
          dni: user.dni,
          students: user.students,
          notificationsEnabled: user.notificationsEnabled,
          emailNotifications: user.emailNotifications,
        },
      },
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener datos del usuario',
    });
  }
});

// PUT /api/auth/profile - Actualizar perfil
router.put('/profile', auth, async (req, res) => {
  try {
    const updates = {};
    const allowedUpdates = ['firstName', 'lastName', 'phone', 'address', 'avatar', 'notificationsEnabled', 'emailNotifications'];
    
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    const user = await User.findByIdAndUpdate(
      req.userId,
      updates,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'Perfil actualizado exitosamente',
      data: { user },
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar perfil',
    });
  }
});

// POST /api/auth/forgot-password - Solicitar reset de contraseña
router.post('/forgot-password', [
  body('email').isEmail().withMessage('Correo inválido'),
], async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      // No revelar si el email existe
      return res.json({
        success: true,
        message: 'Si el correo existe, recibirá instrucciones para restablecer su contraseña',
      });
    }

    // Generar token de reset
    const resetToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });

    // TODO: Enviar email con el token
    // En producción, enviar email real

    res.json({
      success: true,
      message: 'Si el correo existe, recibirá instrucciones para restablecer su contraseña',
      // Solo en desarrollo:
      ...(process.env.NODE_ENV === 'development' && { resetToken }),
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al procesar solicitud',
    });
  }
});

// POST /api/auth/change-password - Cambiar contraseña
router.post('/change-password', auth, [
  body('currentPassword').notEmpty().withMessage('Contraseña actual requerida'),
  body('newPassword').isLength({ min: 6 }).withMessage('La nueva contraseña debe tener al menos 6 caracteres'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.userId).select('+password');
    
    if (!user.password) {
      return res.status(400).json({
        success: false,
        message: 'Usuario con cuenta Google no puede cambiar contraseña aquí',
      });
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Contraseña actual incorrecta',
      });
    }

    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: 'Contraseña actualizada exitosamente',
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al cambiar contraseña',
    });
  }
});

module.exports = router;
