const express = require('express')
const router = express.Router()
const auth = require('../middleware/auth')
const Notification = require('../models/Notification')

// Modelo simple de Event (si no existe, se puede agregar)
let events = []

// GET /api/events - Obtener todos los eventos
router.get('/', auth, async (req, res) => {
  try {
    const { startDate, endDate, type } = req.query
    
    let filteredEvents = [...events]
    
    if (startDate) {
      filteredEvents = filteredEvents.filter(e => new Date(e.date) >= new Date(startDate))
    }
    if (endDate) {
      filteredEvents = filteredEvents.filter(e => new Date(e.date) <= new Date(endDate))
    }
    if (type) {
      filteredEvents = filteredEvents.filter(e => e.type === type)
    }
    
    res.json({
      success: true,
      data: filteredEvents.sort((a, b) => new Date(a.date) - new Date(b.date))
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

    const newEvent = {
      id: Date.now().toString(),
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
      createdBy: req.user.id,
      createdAt: new Date()
    }

    events.push(newEvent)

    // Crear notificaciones para usuarios correspondientes
    const notificationPromises = []
    const notificationRoles = []
    
    if (notifyStudents) notificationRoles.push('estudiante')
    if (notifyParents) notificationRoles.push('padre')
    if (notifyTeachers) notificationRoles.push('docente')

    if (notificationRoles.length > 0) {
      // Crear notificación general para el evento
      const notification = new Notification({
        title: `📅 Nuevo evento: ${title}`,
        message: description || `Evento programado para ${date}${time ? ` a las ${time}` : ''}`,
        type: 'event',
        priority: type === 'exam' ? 'high' : 'normal',
        metadata: {
          eventId: newEvent.id,
          eventType: type,
          eventDate: date,
          eventTime: time,
          location
        },
        targetRoles: notificationRoles
      })
      
      await notification.save().catch(err => console.log('Error guardando notificación:', err))
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
    const event = events.find(e => e.id === req.params.id)
    
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
    const eventIndex = events.findIndex(e => e.id === req.params.id)
    
    if (eventIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Evento no encontrado'
      })
    }

    events[eventIndex] = {
      ...events[eventIndex],
      ...req.body,
      updatedAt: new Date()
    }

    res.json({
      success: true,
      data: events[eventIndex],
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
    const eventIndex = events.findIndex(e => e.id === req.params.id)
    
    if (eventIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Evento no encontrado'
      })
    }

    events.splice(eventIndex, 1)

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
    const event = events.find(e => e.id === req.params.id)
    
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Evento no encontrado'
      })
    }

    // Crear notificación de recordatorio
    const notification = new Notification({
      title: `⏰ Recordatorio: ${event.title}`,
      message: `${event.description || 'No olvides este evento'}${event.time ? ` - Hora: ${event.time}` : ''}`,
      type: 'reminder',
      priority: 'high',
      metadata: {
        eventId: event.id,
        eventType: event.type,
        eventDate: event.date
      },
      targetRoles: ['estudiante', 'padre', 'docente']
    })

    await notification.save()

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
