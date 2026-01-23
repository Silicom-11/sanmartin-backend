// Test API endpoint para verificar respuesta de /api/parent/children
const https = require('https');

// Token de ejemplo (reemplazar con uno real si se tiene)
const token = 'TOKEN_AQUI';

const options = {
  hostname: 'sanmartin-backend.onrender.com',
  port: 443,
  path: '/api/parent/children',
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  }
};

console.log('🔌 Haciendo request a:', `https://${options.hostname}${options.path}\n`);

const req = https.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  console.log(`Headers:`, JSON.stringify(res.headers, null, 2));
  console.log('\n📦 Response:\n');
  
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log(JSON.stringify(json, null, 2));
    } catch (e) {
      console.log(data);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Error:', error.message);
});

req.end();
