// Rutas CRUD de Estudiantes - San Martín Digital
// Gestión completa de estudiantes desde el dashboard admin
const express = require('express');
const router = express.Router();
const { Student, Parent, User, Grade, Attendance, Enrollment, Classroom } = require('../models');
const { auth } = require('../middleware/auth');

// ============================================
// GET /api/students-management/stats - Estadísticas
// ============================================
router.get('/stats', auth, async (req, res) => {
  try {
    // Estadísticas generales
    const [
      total,
      active,
      inactive,
      byGrade,
      bySection,
      byGender,
      byStatus,
      recentEnrollments
    ] = await Promise.all([
      Student.countDocuments(),
      Student.countDocuments({ isActive: true, status: 'activo' }),
      Student.countDocuments({ isActive: false }),
      Student.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$gradeLevel', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      Student.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$section', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      Student.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$gender', count: { $sum: 1 } } }
      ]),
      Student.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      Student.countDocuments({
        createdAt: { $gte: new Date(new Date().setMonth(new Date().getMonth() - 1)) }
      })
    ]);

    // Convertir arrays a objetos para más fácil acceso
    const gradeStats = {};
    byGrade.forEach(g => { gradeStats[g._id] = g.count; });

    const sectionStats = {};
    bySection.forEach(s => { sectionStats[s._id] = s.count; });

    const genderStats = { Masculino: 0, Femenino: 0 };
    byGender.forEach(g => { genderStats[g._id] = g.count; });

    const statusStats = { activo: 0, inactivo: 0, retirado: 0, trasladado: 0, egresado: 0 };
    byStatus.forEach(s => { statusStats[s._id] = s.count; });

    res.json({
      success: true,
      data: {
        general: {
          total,
          active,
          inactive,
          recentEnrollments,
        },
        byGrade: gradeStats,
        bySection: sectionStats,
        byGender: genderStats,
        byStatus: statusStats,
      },
    });
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener estadísticas',
      error: error.message,
    });
  }
});

// ============================================
// GET /api/students-management/search-parents - Buscar padres para vincular
// ============================================
router.get('/search-parents', auth, async (req, res) => {
  try {
    const { search } = req.query;
    
    if (!search || search.length < 2) {
      return res.json({ success: true, data: [] });
    }

    // Buscar en colección Parent
    const parents = await Parent.find({
      isActive: true,
      $or: [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { dni: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ]
    })
    .select('firstName lastName dni email phone children')
    .limit(10);

    // También buscar en colección User con role padre (legacy)
    const users = await User.find({
      isActive: true,
      role: 'padre',
      $or: [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { dni: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ]
    })
    .select('firstName lastName dni email phone')
    .limit(10);

    // Combinar resultados
    const results = [
      ...parents.map(p => ({
        _id: p._id,
        firstName: p.firstName,
        lastName: p.lastName,
        dni: p.dni,
        email: p.email,
        phone: p.phone,
        childrenCount: p.children?.length || 0,
        source: 'parent', // Colección Parent
      })),
      ...users.map(u => ({
        _id: u._id,
        firstName: u.firstName,
        lastName: u.lastName,
        dni: u.dni,
        email: u.email,
        phone: u.phone,
        source: 'user', // Colección User
      }))
    ];

    res.json({
      success: true,
      data: results,
    });
  } catch (error) {
    console.error('Error buscando padres:', error);
    res.status(500).json({
      success: false,
      message: 'Error al buscar padres',
    });
  }
});

// ============================================
// GET /api/students-management - Obtener todos los estudiantes
// ============================================
router.get('/', auth, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      search, 
      gradeLevel,
      section,
      status,
      gender,
      hasParent,
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
        { studentCode: { $regex: search, $options: 'i' } },
        { enrollmentNumber: { $regex: search, $options: 'i' } },
      ];
    }

    if (gradeLevel) filter.gradeLevel = gradeLevel;
    if (section) filter.section = section;
    if (status) filter.status = status;
    if (gender) filter.gender = gender;
    
    if (hasParent === 'true') {
      filter.$or = [
        { parent: { $exists: true, $ne: null } },
        { 'guardians.0': { $exists: true } }
      ];
    } else if (hasParent === 'false') {
      filter.parent = { $exists: false };
      filter['guardians.0'] = { $exists: false };
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
    const [students, total] = await Promise.all([
      Student.find(filter)
        .populate('parent', 'firstName lastName email phone')
        .populate('guardians.user', 'firstName lastName email phone')
        .populate('guardians.parent', 'firstName lastName email phone')
        .select('-password')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit)),
      Student.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: students,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Error obteniendo estudiantes:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener estudiantes',
      error: error.message,
    });
  }
});

// ============================================
// GET /api/students-management/:id - Obtener un estudiante
// ============================================
router.get('/:id', auth, async (req, res) => {
  try {
    const student = await Student.findById(req.params.id)
      .populate('parent', 'firstName lastName email phone dni')
      .populate('guardians.user', 'firstName lastName email phone')
      .populate('guardians.parent', 'firstName lastName email phone')
      .populate('courses', 'name code')
      .select('-password');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Estudiante no encontrado',
      });
    }

    // Obtener estadísticas académicas
    const currentYear = new Date().getFullYear();
    const [gradesCount, attendanceStats, enrollment] = await Promise.all([
      Grade.countDocuments({ student: student._id, academicYear: currentYear }),
      Attendance.aggregate([
        { 
          $match: { 
            student: student._id,
            date: { $gte: new Date(currentYear, 0, 1) }
          } 
        },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]),
      Enrollment.findOne({ 
        student: student._id, 
        academicYear: currentYear,
        status: 'activo'
      }).populate({
        path: 'classroom',
        populate: { path: 'gradeLevel', select: 'name shortName' }
      })
    ]);

    // Formatear estadísticas de asistencia
    const attendance = { presente: 0, ausente: 0, tardanza: 0, justificado: 0 };
    attendanceStats.forEach(a => { attendance[a._id] = a.count; });

    res.json({
      success: true,
      data: {
        ...student.toObject(),
        academicInfo: {
          gradesCount,
          attendance,
          currentEnrollment: enrollment,
        }
      },
    });
  } catch (error) {
    console.error('Error obteniendo estudiante:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener estudiante',
      error: error.message,
    });
  }
});

// ============================================
// POST /api/students-management - Crear estudiante
// ============================================
router.post('/', auth, async (req, res) => {
  try {
    // Verificar permisos
    if (!['administrativo', 'director'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'No autorizado para crear estudiantes',
      });
    }

    const {
      firstName,
      lastName,
      dni,
      email,
      password,
      birthDate,
      gender,
      phone,
      address,
      gradeLevel,
      section,
      shift,
      parentId,
      parentSource, // 'parent' o 'user'
      relationship,
      medicalInfo,
      previousSchool,
    } = req.body;

    // Verificar si ya existe
    const existingStudent = await Student.findOne({
      $or: [{ email }, { dni }]
    });

    if (existingStudent) {
      return res.status(400).json({
        success: false,
        message: existingStudent.email === email 
          ? 'Ya existe un estudiante con este correo' 
          : 'Ya existe un estudiante con este DNI',
      });
    }

    // Preparar datos de guardians si se proporcionó un padre
    const guardians = [];
    let parentRef = null;

    if (parentId) {
      if (parentSource === 'parent') {
        // Padre de la colección Parent
        guardians.push({
          parent: parentId,
          relationship: relationship || 'tutor',
          isPrimary: true,
          canPickUp: true,
          emergencyContact: true,
        });
        
        // También vincular en el documento Parent
        await Parent.findByIdAndUpdate(parentId, {
          $push: {
            children: {
              student: null, // Se actualizará después de crear el estudiante
              relationship: relationship || 'tutor',
              isPrimaryContact: true,
            }
          }
        });
      } else {
        // Padre de la colección User (legacy)
        guardians.push({
          user: parentId,
          relationship: relationship || 'tutor',
          isPrimary: true,
          canPickUp: true,
          emergencyContact: true,
        });
        parentRef = parentId;
      }
    }

    // Crear estudiante
    const student = await Student.create({
      firstName,
      lastName,
      dni,
      email,
      password: password || 'SanMartin2026',
      birthDate,
      gender,
      phone,
      address,
      gradeLevel,
      section,
      shift: shift || 'Mañana',
      guardians,
      parent: parentRef,
      medicalInfo,
      previousSchool,
      status: 'activo',
      isActive: true,
    });

    // Actualizar la referencia en Parent si aplica
    if (parentId && parentSource === 'parent') {
      await Parent.findByIdAndUpdate(parentId, {
        $set: {
          'children.$[elem].student': student._id
        }
      }, {
        arrayFilters: [{ 'elem.student': null }]
      });
    }

    // Poblar y devolver
    const populatedStudent = await Student.findById(student._id)
      .populate('parent', 'firstName lastName email')
      .populate('guardians.parent', 'firstName lastName email')
      .select('-password');

    res.status(201).json({
      success: true,
      message: 'Estudiante registrado exitosamente',
      data: populatedStudent,
    });
  } catch (error) {
    console.error('Error creando estudiante:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear estudiante',
      error: error.message,
    });
  }
});

// ============================================
// PUT /api/students-management/:id - Actualizar estudiante
// ============================================
router.put('/:id', auth, async (req, res) => {
  try {
    // Verificar permisos
    if (!['administrativo', 'director'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'No autorizado para editar estudiantes',
      });
    }

    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Estudiante no encontrado',
      });
    }

    // Campos actualizables
    const allowedUpdates = [
      'firstName', 'lastName', 'phone', 'address', 'photo',
      'gradeLevel', 'section', 'shift', 'status', 'isActive',
      'medicalInfo', 'documents'
    ];

    const updates = {};
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    const updatedStudent = await Student.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    )
    .populate('parent', 'firstName lastName email')
    .populate('guardians.parent', 'firstName lastName email')
    .select('-password');

    res.json({
      success: true,
      message: 'Estudiante actualizado exitosamente',
      data: updatedStudent,
    });
  } catch (error) {
    console.error('Error actualizando estudiante:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar estudiante',
      error: error.message,
    });
  }
});

// ============================================
// DELETE /api/students-management/:id - Eliminar/desactivar estudiante
// ============================================
router.delete('/:id', auth, async (req, res) => {
  try {
    // Verificar permisos
    if (!['administrativo', 'director'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'No autorizado para eliminar estudiantes',
      });
    }

    const { permanent } = req.query;
    const student = await Student.findById(req.params.id);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Estudiante no encontrado',
      });
    }

    if (permanent === 'true') {
      // Eliminar permanentemente
      await Student.findByIdAndDelete(req.params.id);
      
      // Limpiar referencias en Parent
      await Parent.updateMany(
        { 'children.student': req.params.id },
        { $pull: { children: { student: req.params.id } } }
      );
      
      res.json({
        success: true,
        message: 'Estudiante eliminado permanentemente',
      });
    } else {
      // Soft delete
      await Student.findByIdAndUpdate(req.params.id, {
        isActive: false,
        status: 'retirado',
      });

      res.json({
        success: true,
        message: 'Estudiante desactivado exitosamente',
      });
    }
  } catch (error) {
    console.error('Error eliminando estudiante:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar estudiante',
      error: error.message,
    });
  }
});

// ============================================
// POST /api/students-management/:id/reactivate - Reactivar estudiante
// ============================================
router.post('/:id/reactivate', auth, async (req, res) => {
  try {
    if (!['administrativo', 'director'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'No autorizado para reactivar estudiantes',
      });
    }

    const student = await Student.findByIdAndUpdate(
      req.params.id,
      { isActive: true, status: 'activo' },
      { new: true }
    ).select('-password');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Estudiante no encontrado',
      });
    }

    res.json({
      success: true,
      message: 'Estudiante reactivado exitosamente',
      data: student,
    });
  } catch (error) {
    console.error('Error reactivando estudiante:', error);
    res.status(500).json({
      success: false,
      message: 'Error al reactivar estudiante',
    });
  }
});

// ============================================
// PUT /api/students-management/:id/password - Cambiar contraseña
// ============================================
router.put('/:id/password', auth, async (req, res) => {
  try {
    if (!['administrativo', 'director'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'No autorizado para cambiar contraseñas',
      });
    }

    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'La contraseña debe tener al menos 6 caracteres',
      });
    }

    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Estudiante no encontrado',
      });
    }

    student.password = newPassword;
    await student.save();

    res.json({
      success: true,
      message: 'Contraseña actualizada exitosamente',
    });
  } catch (error) {
    console.error('Error cambiando contraseña:', error);
    res.status(500).json({
      success: false,
      message: 'Error al cambiar contraseña',
    });
  }
});

// ============================================
// POST /api/students-management/:id/guardians - Vincular padre/tutor
// ============================================
router.post('/:id/guardians', auth, async (req, res) => {
  try {
    const { parentId, parentSource, relationship, isPrimary, canPickUp, emergencyContact } = req.body;

    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Estudiante no encontrado',
      });
    }

    // Verificar que el padre existe
    let parentExists = false;
    if (parentSource === 'parent') {
      parentExists = await Parent.exists({ _id: parentId });
    } else {
      parentExists = await User.exists({ _id: parentId, role: 'padre' });
    }

    if (!parentExists) {
      return res.status(404).json({
        success: false,
        message: 'Padre/tutor no encontrado',
      });
    }

    // Verificar que no esté ya vinculado
    const alreadyLinked = student.guardians.some(g => 
      (g.parent && g.parent.toString() === parentId) || 
      (g.user && g.user.toString() === parentId)
    );

    if (alreadyLinked) {
      return res.status(400).json({
        success: false,
        message: 'Este padre/tutor ya está vinculado al estudiante',
      });
    }

    // Si es primary, quitar el flag de los demás
    if (isPrimary) {
      student.guardians.forEach(g => { g.isPrimary = false; });
    }

    // Agregar nuevo guardian
    const newGuardian = {
      relationship: relationship || 'tutor',
      isPrimary: isPrimary || student.guardians.length === 0,
      canPickUp: canPickUp !== false,
      emergencyContact: emergencyContact !== false,
    };

    if (parentSource === 'parent') {
      newGuardian.parent = parentId;
      
      // También vincular en el documento Parent
      await Parent.findByIdAndUpdate(parentId, {
        $push: {
          children: {
            student: student._id,
            relationship: relationship || 'tutor',
            isPrimaryContact: isPrimary || false,
          }
        }
      });
    } else {
      newGuardian.user = parentId;
      if (!student.parent) {
        student.parent = parentId;
      }
    }

    student.guardians.push(newGuardian);
    await student.save();

    const updatedStudent = await Student.findById(student._id)
      .populate('guardians.parent', 'firstName lastName email phone')
      .populate('guardians.user', 'firstName lastName email phone')
      .select('-password');

    res.json({
      success: true,
      message: 'Padre/tutor vinculado exitosamente',
      data: updatedStudent,
    });
  } catch (error) {
    console.error('Error vinculando padre:', error);
    res.status(500).json({
      success: false,
      message: 'Error al vincular padre/tutor',
      error: error.message,
    });
  }
});

// ============================================
// DELETE /api/students-management/:id/guardians/:guardianId - Desvincular padre/tutor
// ============================================
router.delete('/:id/guardians/:guardianId', auth, async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Estudiante no encontrado',
      });
    }

    // Encontrar el guardian a eliminar
    const guardianIndex = student.guardians.findIndex(g => 
      (g.parent && g.parent.toString() === req.params.guardianId) || 
      (g.user && g.user.toString() === req.params.guardianId)
    );

    if (guardianIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Padre/tutor no encontrado en el estudiante',
      });
    }

    const removedGuardian = student.guardians[guardianIndex];
    student.guardians.splice(guardianIndex, 1);

    // Si era el primary y quedan otros, asignar el primero
    if (removedGuardian.isPrimary && student.guardians.length > 0) {
      student.guardians[0].isPrimary = true;
    }

    // Limpiar parent si era el parent principal
    if (removedGuardian.user && student.parent?.toString() === removedGuardian.user.toString()) {
      const nextUserGuardian = student.guardians.find(g => g.user);
      student.parent = nextUserGuardian?.user || null;
    }

    await student.save();

    // También eliminar del documento Parent si aplica
    if (removedGuardian.parent) {
      await Parent.findByIdAndUpdate(removedGuardian.parent, {
        $pull: { children: { student: student._id } }
      });
    }

    res.json({
      success: true,
      message: 'Padre/tutor desvinculado exitosamente',
    });
  } catch (error) {
    console.error('Error desvinculando padre:', error);
    res.status(500).json({
      success: false,
      message: 'Error al desvincular padre/tutor',
    });
  }
});

// ============================================
// GET /api/students-management/:id/academic - Información académica
// ============================================
router.get('/:id/academic', auth, async (req, res) => {
  try {
    const { year = new Date().getFullYear() } = req.query;
    
    const [grades, attendance, enrollment] = await Promise.all([
      Grade.find({ 
        student: req.params.id, 
        academicYear: parseInt(year) 
      })
      .populate('course', 'name code')
      .sort({ 'course.name': 1 }),
      
      Attendance.find({ 
        student: req.params.id,
        date: { 
          $gte: new Date(parseInt(year), 0, 1),
          $lte: new Date(parseInt(year), 11, 31)
        }
      })
      .populate('course', 'name code')
      .sort({ date: -1 })
      .limit(50),
      
      Enrollment.findOne({ 
        student: req.params.id, 
        academicYear: parseInt(year) 
      })
      .populate({
        path: 'classroom',
        populate: { path: 'gradeLevel', select: 'name shortName' }
      })
    ]);

    // Calcular promedio general
    let averageGrade = '-';
    if (grades.length > 0) {
      const validGrades = grades.filter(g => g.averages?.final);
      if (validGrades.length > 0) {
        const sum = validGrades.reduce((acc, g) => acc + g.averages.final, 0);
        averageGrade = (sum / validGrades.length).toFixed(1);
      }
    }

    // Estadísticas de asistencia
    const attendanceStats = {
      presente: 0,
      ausente: 0,
      tardanza: 0,
      justificado: 0,
      total: attendance.length,
    };
    attendance.forEach(a => {
      if (attendanceStats[a.status] !== undefined) {
        attendanceStats[a.status]++;
      }
    });
    attendanceStats.rate = attendanceStats.total > 0 
      ? ((attendanceStats.presente / attendanceStats.total) * 100).toFixed(1) + '%'
      : '0%';

    res.json({
      success: true,
      data: {
        grades,
        attendance: attendance.slice(0, 20), // Solo últimos 20
        attendanceStats,
        enrollment,
        averageGrade,
      },
    });
  } catch (error) {
    console.error('Error obteniendo información académica:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener información académica',
    });
  }
});

module.exports = router;
