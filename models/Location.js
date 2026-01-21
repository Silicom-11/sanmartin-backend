// Modelo de Ubicación - San Martín Digital
// Almacena las ubicaciones de usuarios para seguridad escolar
const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema({
  // Usuario al que pertenece esta ubicación
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  
  // Coordenadas geográficas
  coordinates: {
    latitude: {
      type: Number,
      required: true,
    },
    longitude: {
      type: Number,
      required: true,
    },
    accuracy: {
      type: Number, // Precisión en metros
      default: null,
    },
    altitude: {
      type: Number,
      default: null,
    },
    speed: {
      type: Number, // Velocidad en m/s
      default: null,
    },
    heading: {
      type: Number, // Dirección en grados
      default: null,
    },
  },
  
  // Información del dispositivo
  deviceInfo: {
    platform: {
      type: String,
      enum: ['android', 'ios', 'web'],
      default: 'android',
    },
    deviceId: String,
    appVersion: String,
  },
  
  // Estado de la sesión
  sessionStatus: {
    type: String,
    enum: ['online', 'offline', 'background', 'inactive'],
    default: 'online',
  },
  
  // Tipo de actualización
  updateType: {
    type: String,
    enum: ['login', 'periodic', 'manual', 'logout', 'background', 'app_open', 'app_close'],
    default: 'periodic',
  },
  
  // Dirección aproximada (geocodificación inversa)
  address: {
    street: String,
    city: String,
    district: String,
    country: String,
    formattedAddress: String,
  },
  
  // Batería del dispositivo (opcional)
  batteryLevel: {
    type: Number,
    min: 0,
    max: 100,
    default: null,
  },
  
  // Conexión de red
  networkType: {
    type: String,
    enum: ['wifi', 'mobile', 'none', 'unknown'],
    default: 'unknown',
  },
  
  // Timestamp del cliente (cuando se capturó la ubicación)
  clientTimestamp: {
    type: Date,
    default: Date.now,
  },
  
}, {
  timestamps: true, // createdAt y updatedAt automáticos
});

// Índices para búsquedas eficientes
locationSchema.index({ user: 1, createdAt: -1 });
locationSchema.index({ user: 1, sessionStatus: 1 });
locationSchema.index({ createdAt: -1 });
locationSchema.index({ 'coordinates.latitude': 1, 'coordinates.longitude': 1 });

// Índice geoespacial 2dsphere para queries de ubicación
locationSchema.index({
  'coordinates.latitude': 1,
  'coordinates.longitude': 1,
});

// Método estático para obtener la última ubicación de un usuario
locationSchema.statics.getLastLocation = async function(userId) {
  return this.findOne({ user: userId })
    .sort({ createdAt: -1 })
    .populate('user', 'firstName lastName email role profilePhoto');
};

// Método estático para obtener usuarios online
locationSchema.statics.getOnlineUsers = async function(role = null, minutesThreshold = 5) {
  const threshold = new Date(Date.now() - minutesThreshold * 60 * 1000);
  
  const pipeline = [
    {
      $match: {
        createdAt: { $gte: threshold },
        sessionStatus: { $in: ['online', 'background'] },
      },
    },
    {
      $sort: { createdAt: -1 },
    },
    {
      $group: {
        _id: '$user',
        lastLocation: { $first: '$$ROOT' },
      },
    },
    {
      $replaceRoot: { newRoot: '$lastLocation' },
    },
    {
      $lookup: {
        from: 'users',
        localField: 'user',
        foreignField: '_id',
        as: 'userInfo',
      },
    },
    {
      $unwind: '$userInfo',
    },
  ];
  
  if (role) {
    pipeline.push({
      $match: { 'userInfo.role': role },
    });
  }
  
  return this.aggregate(pipeline);
};

// Método estático para obtener historial de ubicaciones
locationSchema.statics.getLocationHistory = async function(userId, hours = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  
  return this.find({
    user: userId,
    createdAt: { $gte: since },
  })
    .sort({ createdAt: 1 })
    .select('coordinates sessionStatus updateType createdAt clientTimestamp');
};

// Virtual para GeoJSON Point (útil para mapas)
locationSchema.virtual('geoPoint').get(function() {
  return {
    type: 'Point',
    coordinates: [this.coordinates.longitude, this.coordinates.latitude],
  };
});

// Limpiar ubicaciones antiguas (más de 30 días)
locationSchema.statics.cleanOldLocations = async function(daysToKeep = 30) {
  const threshold = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
  return this.deleteMany({ createdAt: { $lt: threshold } });
};

const Location = mongoose.model('Location', locationSchema);

module.exports = Location;
