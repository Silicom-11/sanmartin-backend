// Servicio de Notificaciones Push - San Martín Digital
// Usa Firebase Cloud Messaging para enviar notificaciones a dispositivos móviles
const admin = require('firebase-admin');

// Inicializar Firebase Admin (solo una vez)
let firebaseInitialized = false;

const initializeFirebase = () => {
  if (firebaseInitialized) return;
  
  try {
    // Configuración desde variables de entorno
    const serviceAccount = {
      type: 'service_account',
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: 'https://accounts.google.com/o/oauth2/auth',
      token_uri: 'https://oauth2.googleapis.com/token',
      auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
      client_x509_cert_url: process.env.FIREBASE_CERT_URL,
    };

    // Solo inicializar si tenemos las credenciales
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      firebaseInitialized = true;
      console.log('✅ Firebase Admin SDK inicializado');
    } else {
      console.warn('⚠️ Firebase Admin SDK no configurado - notificaciones push deshabilitadas');
    }
  } catch (error) {
    console.error('❌ Error inicializando Firebase Admin:', error.message);
  }
};

// Enviar notificación a un token específico
const sendToDevice = async (fcmToken, notification, data = {}) => {
  if (!firebaseInitialized) {
    console.warn('Firebase no inicializado, notificación no enviada');
    return { success: false, error: 'Firebase no configurado' };
  }

  try {
    const message = {
      token: fcmToken,
      notification: {
        title: notification.title,
        body: notification.body,
      },
      data: {
        ...data,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          clickAction: 'FLUTTER_NOTIFICATION_CLICK',
          channelId: 'san_martin_alerts',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
    };

    const response = await admin.messaging().send(message);
    console.log('✅ Notificación enviada:', response);
    return { success: true, messageId: response };
  } catch (error) {
    console.error('❌ Error enviando notificación:', error);
    return { success: false, error: error.message };
  }
};

// Enviar notificación a múltiples tokens
const sendToMultipleDevices = async (fcmTokens, notification, data = {}) => {
  if (!firebaseInitialized || !fcmTokens.length) {
    return { success: false, error: 'Firebase no configurado o sin tokens' };
  }

  try {
    const message = {
      notification: {
        title: notification.title,
        body: notification.body,
      },
      data: {
        ...data,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'san_martin_alerts',
        },
      },
      tokens: fcmTokens,
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(`✅ Notificaciones enviadas: ${response.successCount}/${fcmTokens.length}`);
    
    return {
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount,
      responses: response.responses,
    };
  } catch (error) {
    console.error('❌ Error enviando notificaciones:', error);
    return { success: false, error: error.message };
  }
};

// Notificaciones específicas para el sistema escolar

// Notificar a padres cuando el hijo se desconecta
const notifyParentOfDisconnection = async (parentTokens, studentName, location) => {
  return sendToMultipleDevices(
    parentTokens,
    {
      title: '📍 Desconexión detectada',
      body: `${studentName} se ha desconectado de la aplicación`,
    },
    {
      type: 'student_disconnected',
      studentName,
      latitude: location?.latitude?.toString() || '',
      longitude: location?.longitude?.toString() || '',
      action: 'open_child_location',
    }
  );
};

// Notificar nueva calificación
const notifyNewGrade = async (parentTokens, studentName, subject, grade) => {
  return sendToMultipleDevices(
    parentTokens,
    {
      title: '📊 Nueva calificación',
      body: `${studentName} obtuvo ${grade} en ${subject}`,
    },
    {
      type: 'new_grade',
      studentName,
      subject,
      grade: grade.toString(),
      action: 'open_grades',
    }
  );
};

// Notificar inasistencia
const notifyAbsence = async (parentTokens, studentName, date) => {
  return sendToMultipleDevices(
    parentTokens,
    {
      title: '⚠️ Inasistencia registrada',
      body: `${studentName} no asistió a clases el ${date}`,
    },
    {
      type: 'absence',
      studentName,
      date,
      action: 'open_justification',
    }
  );
};

// Notificar nuevo mensaje
const notifyNewMessage = async (userToken, senderName, preview) => {
  return sendToDevice(
    userToken,
    {
      title: `💬 Mensaje de ${senderName}`,
      body: preview.length > 50 ? preview.substring(0, 50) + '...' : preview,
    },
    {
      type: 'new_message',
      senderName,
      action: 'open_messages',
    }
  );
};

// Notificar evento próximo
const notifyUpcomingEvent = async (userTokens, eventTitle, eventDate) => {
  return sendToMultipleDevices(
    userTokens,
    {
      title: '📅 Recordatorio de evento',
      body: `${eventTitle} - ${eventDate}`,
    },
    {
      type: 'event_reminder',
      eventTitle,
      eventDate,
      action: 'open_calendar',
    }
  );
};

module.exports = {
  initializeFirebase,
  sendToDevice,
  sendToMultipleDevices,
  notifyParentOfDisconnection,
  notifyNewGrade,
  notifyAbsence,
  notifyNewMessage,
  notifyUpcomingEvent,
};
