// Rutas CRUD de Padres/Apoderados - San Martín Digital
// Gestión completa de padres de familia desde el dashboard admin
const express = require('express');
const router = express.Router();
const { Parent, Student } = require('../models');
const { auth } = require('../middleware/auth');

// ============================================
// GET /api/parents-management - Obtener todos los padres
// ============================================
router.get('/', auth, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      search, 
      hasChildren,
      isActive,
      sortBy = 'lastName',
      sortOrder = 'asc'
    } = req.query;

    // Construir filtros
    const filter = {};
    
    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { dni: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }

    if (hasChildren === 'true') {
      filter['children.0'] = { $exists: true };
    } else if (hasChildren === 'false') {
      filter['children.0'] = { $exists: false };
    }

    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }

    // Ordenamiento
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Paginación
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Ejecutar consulta
    const [parents, total] = await Promise.all([
      Parent.find(filter)
        .populate({
          path: 'children.student',
          select: 'firstName lastName dni photo gradeLevel section',
        })
        .select('-password')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit)),
      Parent.countDocuments(filter),
    ]);

    // Estadísticas
    const stats = await Parent.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: ['$isActive', 1, 0] } },
          withChildren: { $sum: { $cond: [{ $gt: [{ $size: { $ifNull: ['$children', []] } }, 0] }, 1, 0] } },
          verified: { $sum: { $cond: ['$isVerified', 1, 0] } },
        }
      }
    ]);

    res.json({
      success: true,
      data: parents,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
      stats: stats[0] || { total: 0, active: 0, withChildren: 0, verified: 0 },
    });
  } catch (error) {
    console.error('Error obteniendo padres:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener padres',
      error: error.message,
    });
  }
});

// ============================================
// GET /api/parents-management/stats - Estadísticas
// ============================================
router.get('/stats', auth, async (req, res) => {
  try {
    const stats = await Parent.aggregate([
      {
        $facet: {
          general: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                active: { $sum: { $cond: ['$isActive', 1, 0] } },
                inactive: { $sum: { $cond: ['$isActive', 0, 1] } },
                verified: { $sum: { $cond: ['$isVerified', 1, 0] } },
                withChildren: { $sum: { $cond: [{ $gt: [{ $size: { $ifNull: ['$children', []] } }, 0] }, 1, 0] } },
              }
            }
          ],
          byRelationship: [
            { $unwind: { path: '$children', preserveNullAndEmptyArrays: false } },
            { $group: { _id: '$children.relationship', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
          ],
          recentRegistrations: [
            { $match: { isActive: true } },
            { $sort: { createdAt: -1 } },
            { $limit: 5 },
            { $project: { firstName: 1, lastName: 1, createdAt: 1, childrenCount: { $size: { $ifNull: ['$children', []] } } } }
          ],
          childrenStats: [
            { $unwind: { path: '$children', preserveNullAndEmptyArrays: false } },
            { $group: { _id: null, totalChildren: { $sum: 1 } } }
          ]
        }
      }
    ]);

    const result = stats[0];
    
    res.json({
      success: true,
      data: {
        general: result.general[0] || { total: 0, active: 0, inactive: 0, verified: 0, withChildren: 0 },
        byRelationship: result.byRelationship,
        recentRegistrations: result.recentRegistrations,
        totalChildrenLinked: result.childrenStats[0]?.totalChildren || 0,
      }
    });
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener estadísticas',
    });
  }
});

// ============================================
// GET /api/parents-management/search-students - Buscar estudiantes
// ============================================
router.get('/search-students', auth, async (req, res) => {
  try {
    const { search } = req.query;

    if (!search || search.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Ingrese al menos 2 caracteres para buscar',
      });
    }

    const students = await Student.find({
      $or: [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { dni: { $regex: search, $options: 'i' } },
      ],
      isActive: true,
    })
      .select('firstName lastName dni photo gradeLevel section')
      .limit(10);

    res.json({
      success: true,
      data: students,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al buscar estudiantes',
    });
  }
});

// ============================================
// GET /api/parents-management/:id - Obtener un padre
// ============================================
router.get('/:id', auth, async (req, res) => {
  try {
    const parent = await Parent.findById(req.params.id)
      .populate({
        path: 'children.student',
        select: 'firstName lastName dni photo gradeLevel section email phone birthDate',
      })
      .select('-password');

    if (!parent) {
      return res.status(404).json({
        success: false,
        message: 'Padre no encontrado',
      });
    }

    res.json({
      success: true,
      data: parent,
    });
  } catch (error) {
    console.error('Error obteniendo padre:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener padre',
    });
  }
});

// ============================================
// POST /api/parents-management - Crear padre
// ============================================
router.post('/', auth, async (req, res) => {
  try {
    // Verificar permisos
    if (!['administrativo', 'director'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'No autorizado para crear padres',
      });
    }

    const {
      firstName,
      lastName,
      dni,
      email,
      password,
      phone,
      secondaryPhone,
      address,
      birthDate,
      gender,
      occupation,
      workplace,
      children,
    } = req.body;

    // Verificar si ya existe
    const existingParent = await Parent.findOne({
      $or: [{ email }, { dni }]
    });

    if (existingParent) {
      return res.status(400).json({
        success: false,
        message: existingParent.email === email 
          ? 'Ya existe un padre con este correo' 
          : 'Ya existe un padre con este DNI',
      });
    }

    // Preparar datos de hijos
    const childrenData = [];
    if (children && Array.isArray(children)) {
      for (const child of children) {
        const student = await Student.findById(child.studentId);
        if (student) {
          childrenData.push({
            student: child.studentId,
            relationship: child.relationship || 'padre',
            isPrimaryContact: child.isPrimaryContact || false,
            canPickUp: child.canPickUp !== false,
            isEmergencyContact: child.isEmergencyContact !== false,
          });
        }
      }
    }

    // Crear padre
    const parent = await Parent.create({
      firstName,
      lastName,
      dni,
      email,
      password: password || 'SanMartin2026',
      phone,
      secondaryPhone,
      address,
      birthDate,
      gender,
      occupation,
      workplace,
      children: childrenData,
    });

    // Poblar y devolver
    const populatedParent = await Parent.findById(parent._id)
      .populate('children.student', 'firstName lastName dni photo')
      .select('-password');

    res.status(201).json({
      success: true,
      message: 'Padre registrado exitosamente',
      data: populatedParent,
    });
  } catch (error) {
    console.error('Error creando padre:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear padre',
      error: error.message,
    });
  }
});

// ============================================
// PUT /api/parents-management/:id - Actualizar padre
// ============================================
router.put('/:id', auth, async (req, res) => {
  try {
    if (!['administrativo', 'director'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'No autorizado para editar padres',
      });
    }

    const { id } = req.params;
    const updateData = { ...req.body };
    
    delete updateData.password;
    delete updateData.children;
    
    const parent = await Parent.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    )
      .populate('children.student', 'firstName lastName dni photo')
      .select('-password');

    if (!parent) {
      return res.status(404).json({
        success: false,
        message: 'Padre no encontrado',
      });
    }

    res.json({
      success: true,
      message: 'Padre actualizado exitosamente',
      data: parent,
    });
  } catch (error) {
    console.error('Error actualizando padre:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar padre',
      error: error.message,
    });
  }
});

// ============================================
// DELETE /api/parents-management/:id - Eliminar padre
// ============================================
router.delete('/:id', auth, async (req, res) => {
  try {
    if (!['administrativo', 'director'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'No autorizado para eliminar padres',
      });
    }

    const { id } = req.params;
    const { permanent } = req.query;

    const parent = await Parent.findById(id);

    if (!parent) {
      return res.status(404).json({
        success: false,
        message: 'Padre no encontrado',
      });
    }

    if (permanent === 'true') {
      await Parent.findByIdAndDelete(id);
      res.json({
        success: true,
        message: 'Padre eliminado permanentemente',
      });
    } else {
      parent.isActive = false;
      await parent.save();
      res.json({
        success: true,
        message: 'Padre desactivado exitosamente',
        data: parent,
      });
    }
  } catch (error) {
    console.error('Error eliminando padre:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar padre',
    });
  }
});

// ============================================
// POST /api/parents-management/:id/children - Vincular hijo
// ============================================
router.post('/:id/children', auth, async (req, res) => {
  try {
    if (!['administrativo', 'director'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'No autorizado',
      });
    }

    const { studentId, relationship, isPrimaryContact, canPickUp, isEmergencyContact } = req.body;
    const parentId = req.params.id;

    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Estudiante no encontrado',
      });
    }

    const parent = await Parent.findById(parentId);
    if (!parent) {
      return res.status(404).json({
        success: false,
        message: 'Padre no encontrado',
      });
    }

    const alreadyLinked = parent.children.some(
      c => c.student.toString() === studentId
    );
    if (alreadyLinked) {
      return res.status(400).json({
        success: false,
        message: 'Este estudiante ya está vinculado',
      });
    }

    parent.children.push({
      student: studentId,
      relationship: relationship || 'padre',
      isPrimaryContact: isPrimaryContact || false,
      canPickUp: canPickUp !== false,
      isEmergencyContact: isEmergencyContact !== false,
    });
    await parent.save();

    const updatedParent = await Parent.findById(parentId)
      .populate('children.student', 'firstName lastName dni photo gradeLevel section')
      .select('-password');

    res.json({
      success: true,
      message: 'Hijo vinculado exitosamente',
      data: updatedParent,
    });
  } catch (error) {
    console.error('Error vinculando hijo:', error);
    res.status(500).json({
      success: false,
      message: 'Error al vincular hijo',
    });
  }
});

// ============================================
// DELETE /api/parents-management/:id/children/:studentId
// ============================================
router.delete('/:id/children/:studentId', auth, async (req, res) => {
  try {
    if (!['administrativo', 'director'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'No autorizado',
      });
    }

    const { id, studentId } = req.params;

    const parent = await Parent.findByIdAndUpdate(
      id,
      { $pull: { children: { student: studentId } } },
      { new: true }
    )
      .populate('children.student', 'firstName lastName dni photo')
      .select('-password');

    res.json({
      success: true,
      message: 'Hijo desvinculado exitosamente',
      data: parent,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al desvincular hijo',
    });
  }
});

// ============================================
// POST /api/parents-management/:id/reactivate
// ============================================
router.post('/:id/reactivate', auth, async (req, res) => {
  try {
    if (!['administrativo', 'director'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'No autorizado',
      });
    }

    const parent = await Parent.findByIdAndUpdate(
      req.params.id,
      { isActive: true },
      { new: true }
    )
      .populate('children.student', 'firstName lastName dni photo')
      .select('-password');

    if (!parent) {
      return res.status(404).json({
        success: false,
        message: 'Padre no encontrado',
      });
    }

    res.json({
      success: true,
      message: 'Padre reactivado exitosamente',
      data: parent,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al reactivar padre',
    });
  }
});

// ============================================
// PUT /api/parents-management/:id/password
// ============================================
router.put('/:id/password', auth, async (req, res) => {
  try {
    if (!['administrativo', 'director'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'No autorizado',
      });
    }

    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'La contraseña debe tener al menos 6 caracteres',
      });
    }

    const parent = await Parent.findById(req.params.id);
    if (!parent) {
      return res.status(404).json({
        success: false,
        message: 'Padre no encontrado',
      });
    }

    parent.password = newPassword;
    await parent.save();

    res.json({
      success: true,
      message: 'Contraseña actualizada exitosamente',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al cambiar contraseña',
    });
  }
});

module.exports = router;
