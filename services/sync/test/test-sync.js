
const { io } = require('socket.io-client');

const TOKEN = process.argv[2];

if (!TOKEN) {
  console.error('Usage: node test-sync.js YOUR_JWT_TOKEN');
  process.exit(1);
}

console.log('Connecting to sync service...');

const socket = io('http://localhost:3004', {
  extraHeaders: {
    Authorization: `Bearer ${TOKEN}`,
  },
  auth: {
    token: TOKEN,
  },
});

socket.on('connect', () => {
  console.log('Connected! Socket ID:', socket.id);
  console.log('Waiting for sync events...\n');
});

socket.on('connected', (data) => {
  console.log('Server confirmed connection:', data);
});

socket.on('file:uploaded', (data) => {
  console.log('\nFILE UPLOADED EVENT RECEIVED:');
  console.log(JSON.stringify(data, null, 2));
});

socket.on('file:synced', (data) => {
  console.log('\nFILE SYNCED EVENT RECEIVED:');
  console.log(JSON.stringify(data, null, 2));
});

socket.on('file:shared', (data) => {
  console.log('\nFILE SHARED EVENT RECEIVED:');
  console.log(JSON.stringify(data, null, 2));
});

socket.on('connect_error', (err) => {
  console.error('Connection error:', err.message);
});

socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
});