// Test script to send a chat message via WebSocket
const WebSocket = require('ws');

const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjIsImVtYWlsIjoidGVzdEB0ZXN0LmNvbSIsImlhdCI6MTc2NzA1NTU2MSwiZXhwIjoxNzY3MDYyNzYxfQ.KZYe9vGAt0hD7TEJLLjzJlKTU0nQ7sleEg7iZuU8hcc";
const CHAT_ID = 11;

const ws = new WebSocket(`ws://localhost:3002/ws?token=${TOKEN}`);

ws.on('open', () => {
  console.log('Connected to WebSocket');

  // Send a chat message to build a simple login page
  const message = {
    type: 'chat:stream',
    chatId: CHAT_ID,
    prompt: 'Create a simple login page with an email field, password field, and a submit button. Use plain HTML and CSS, no frameworks. Save it as index.html.'
  };

  console.log('Sending message:', JSON.stringify(message, null, 2));
  ws.send(JSON.stringify(message));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());

  if (msg.type === 'chat:response:delta') {
    process.stdout.write(msg.delta || '');
  } else if (msg.type === 'chat:response:end') {
    console.log('\n\n=== Chat completed ===');
    console.log('Updated files:', msg.updatedFiles);
    console.log('Session ID:', msg.sessionId);
    ws.close();
  } else if (msg.type === 'chat:response:error') {
    console.error('\nError:', msg.error);
    ws.close();
  } else if (msg.type === 'chat:response:chunk') {
    // Initial chunk with messages
    console.log('Received chunk');
  } else {
    console.log('Other message:', msg.type);
  }
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err.message);
});

ws.on('close', () => {
  console.log('WebSocket closed');
  process.exit(0);
});

// Timeout after 5 minutes
setTimeout(() => {
  console.log('\nTimeout - closing connection');
  ws.close();
  process.exit(1);
}, 300000);
