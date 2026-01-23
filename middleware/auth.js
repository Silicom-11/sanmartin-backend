// Middleware de Autenticación - San Martín Digital
const jwt = require('jsonwebtoken');
const { User, Teacher, Parent } = require('../models');

// Verificar token JWT
const auth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Token de autenticación no proporcionado',
      });
    }
    
    const token = authHeader.split(' ')[1];
    
    // Verificar token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Buscar usuario en las diferentes colecciones
    let user = null;
    let userRole = null;
    
    // Primero buscar en Users (administrativos, etc.)
    user = await User.findById(decoded.userId);
    if (user) {
      userRole = user.role;
    }
    
    // Si no está en Users, buscar en Teachers
    if (!user) {
      user = await Teacher.findById(decoded.userId);
      if (user) {
        userRole = 'docente';
      }
    }
    
    // Si no está en Teachers, buscar en Parents
    if (!user) {
      user = await Parent.findById(decoded.userId);
      if (user) {
        userRole = 'padre';
      }
    }
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no encontrado',
      });
    }
    
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Cuenta desactivada',
      });
    }
    
    // Agregar usuario al request con el rol correcto
    req.user = user;
    req.user.role = userRole;
    req.userId = user._id;
    
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Token inválido',
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expirado',
      });
    }
    
    console.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error de autenticación',
    });
  }
};

// Verificar roles específicos
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'No tiene permisos para realizar esta acción',
      });
    }
    next();
  };
};

// Verificar que sea docente o administrador
const isTeacherOrAdmin = (req, res, next) => {
  if (!['docente', 'administrativo'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Acceso restringido a docentes y administradores',
    });
  }
  next();
};

// Verificar que sea padre del estudiante
const isParentOf = async (req, res, next) => {
  try {
    const studentId = req.params.studentId || req.body.studentId;
    
    if (req.user.role === 'administrativo' || req.user.role === 'docente') {
      return next();
    }
    
    if (req.user.role === 'padre') {
      const isParent = req.user.students.some(
        s => s.toString() === studentId
      );
      
      if (!isParent) {
        return res.status(403).json({
          success: false,
          message: 'No tiene acceso a este estudiante',
        });
      }
    }
    
    next();
  } catch (error) {
    console.error('isParentOf middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error verificando permisos',
    });
  }
};

module.exports = {
  auth,
  authorize,
  isTeacherOrAdmin,
  isParentOf,
};
