const express = require('express')
const router = express.Router()
const auth = require('../middleware/auth')
const { Event, Notification, User } = require('../models')

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

// POST /api/events - Crear nuevo evento
router.post('/', auth, async (req, res) => {
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
      const users = await User.find({ role: { $in: notificationRoles }, isActive: true })
      
      if (users.length > 0) {
        const notifications = users.map(user => ({
          recipient: user._id,
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
router.put('/:id', auth, async (req, res) => {
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
router.delete('/:id', auth, async (req, res) => {
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

    // Obtener todos los usuarios activos
    const users = await User.find({ isActive: true })
    
    if (users.length > 0) {
      const notifications = users.map(user => ({
        recipient: user._id,
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
