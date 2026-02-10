const express = require('express')
const router = express.Router()
const { auth, authorize } = require('../middleware/auth')
const { Event, Notification, User, Teacher, Parent, Student } = require('../models')

// GET /api/events - Obtener todos los eventos
router.get('/', auth, async (req, res) => {
  try {
    const { startDate, endDate, type } = req.query
    
    let query = { isActive: true }
    
    if (startDate) {
      query.date = { ...query.date, $gte: startDate }
    }
    if (endDate) {
      query.date = { ...query.date, $lte: endDate }
    }
    if (type) {
      query.type = type
    }
    
    const events = await Event.find(query)
      .sort({ date: 1 })
      .populate('createdBy', 'firstName lastName')
    
    res.json({
      success: true,
      data: events
    })
  } catch (error) {
    console.error('Error obteniendo eventos:', error)
    res.status(500).json({ success: false, message: 'Error del servidor' })
  }
})

// GET /api/events/upcoming - Próximos eventos (para mobile app)
router.get('/upcoming', auth, async (req, res) => {
  try {
    const { limit = 10 } = req.query
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const events = await Event.find({
      isActive: true,
      date: { $gte: today.toISOString().split('T')[0] }
    })
      .sort({ date: 1 })
      .limit(parseInt(limit))
      .populate('createdBy', 'firstName lastName')
    
    res.json({ success: true, data: events })
  } catch (error) {
    console.error('Error obteniendo próximos eventos:', error)
    res.status(500).json({ success: false, message: 'Error del servidor' })
  }
})

// POST /api/events - Crear nuevo evento
router.post('/', auth, authorize('administrativo'), async (req, res) => {
  try {
    const {
      title,
      date,
      time,
      type,
      description,
      location,
      participants,
      notifyStudents,
      notifyParents,
      notifyTeachers
    } = req.body

    if (!title || !date || !type) {
      return res.status(400).json({
        success: false,
        message: 'Título, fecha y tipo son requeridos'
      })
    }

    const newEvent = new Event({
      title,
      date,
      time,
      type,
      description,
      location,
      participants,
      notifyStudents,
      notifyParents,
      notifyTeachers,
      createdBy: req.userId
    })

    await newEvent.save()

    // Crear notificaciones para usuarios correspondientes
    const notificationRoles = []
    if (notifyStudents) notificationRoles.push('estudiante')
    if (notifyParents) notificationRoles.push('padre')
    if (notifyTeachers) notificationRoles.push('docente')

    if (notificationRoles.length > 0) {
      // Buscar recipientes en todas las colecciones
      const recipientIds = [];
      const usersInUserCol = await User.find({ role: { $in: notificationRoles }, isActive: true }).select('_id');
      recipientIds.push(...usersInUserCol.map(u => u._id));
      
      if (notificationRoles.includes('docente')) {
        const teachers = await Teacher.find({ isActive: true }).select('_id');
        recipientIds.push(...teachers.map(t => t._id));
      }
      if (notificationRoles.includes('padre')) {
        const parents = await Parent.find({ isActive: true }).select('_id');
        recipientIds.push(...parents.map(p => p._id));
      }
      if (notificationRoles.includes('estudiante')) {
        const students = await Student.find({ isActive: true }).select('_id');
        recipientIds.push(...students.map(s => s._id));
      }
      
      if (recipientIds.length > 0) {
        const notifications = recipientIds.map(id => ({
          recipient: id,
          title: `📅 Nuevo evento: ${title}`,
          message: description || `Evento programado para ${date}${time ? ` a las ${time}` : ''}`,
          type: 'event',
          isRead: false
        }))
        
        await Notification.insertMany(notifications)
      }
    }

    res.status(201).json({
      success: true,
      data: newEvent,
      message: 'Evento creado exitosamente'
    })
  } catch (error) {
    console.error('Error creando evento:', error)
    res.status(500).json({ success: false, message: 'Error del servidor' })
  }
})

// GET /api/events/:id - Obtener evento por ID
router.get('/:id', auth, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id).populate('createdBy', 'firstName lastName')
    
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Evento no encontrado'
      })
    }

    res.json({ success: true, data: event })
  } catch (error) {
    console.error('Error obteniendo evento:', error)
    res.status(500).json({ success: false, message: 'Error del servidor' })
  }
})

// PUT /api/events/:id - Actualizar evento
router.put('/:id', auth, authorize('administrativo'), async (req, res) => {
  try {
    const event = await Event.findByIdAndUpdate(
      req.params.id,
      { ...req.body },
      { new: true, runValidators: true }
    )
    
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Evento no encontrado'
      })
    }

    res.json({
      success: true,
      data: event,
      message: 'Evento actualizado exitosamente'
    })
  } catch (error) {
    console.error('Error actualizando evento:', error)
    res.status(500).json({ success: false, message: 'Error del servidor' })
  }
})

// DELETE /api/events/:id - Eliminar evento
router.delete('/:id', auth, authorize('administrativo'), async (req, res) => {
  try {
    const event = await Event.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    )
    
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Evento no encontrado'
      })
    }

    res.json({
      success: true,
      message: 'Evento eliminado exitosamente'
    })
  } catch (error) {
    console.error('Error eliminando evento:', error)
    res.status(500).json({ success: false, message: 'Error del servidor' })
  }
})

// POST /api/events/:id/reminder - Enviar recordatorio del evento
router.post('/:id/reminder', auth, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id)
    
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Evento no encontrado'
      })
    }

    // Obtener todos los usuarios activos de TODAS las colecciones
    const [users, teachers, parents, students] = await Promise.all([
      User.find({ isActive: true }).select('_id'),
      Teacher.find({ isActive: true }).select('_id'),
      Parent.find({ isActive: true }).select('_id'),
      Student.find({ isActive: true }).select('_id'),
    ]);
    const allRecipientIds = [
      ...users.map(u => u._id),
      ...teachers.map(t => t._id),
      ...parents.map(p => p._id),
      ...students.map(s => s._id),
    ];
    
    if (allRecipientIds.length > 0) {
      const notifications = allRecipientIds.map(id => ({
        recipient: id,
        title: `⏰ Recordatorio: ${event.title}`,
        message: `${event.description || 'No olvides este evento'}${event.time ? ` - Hora: ${event.time}` : ''}`,
        type: 'reminder',
        isRead: false
      }))

      await Notification.insertMany(notifications)
    }

    res.json({
      success: true,
      message: 'Recordatorio enviado exitosamente'
    })
  } catch (error) {
    console.error('Error enviando recordatorio:', error)
    res.status(500).json({ success: false, message: 'Error del servidor' })
  }
})

module.exports = router
