// server.js
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

const players = {}; // { socketId: { x,y,z,rotation, name } }

io.on('connection', (socket) => {
  console.log('connected', socket.id);

  // new player
  socket.on('newPlayer', (data) => {
    players[socket.id] = { x: data.x||0, y: data.y||3, z: data.z||0, rotation: data.rotation||0, name: data.name || 'Spieler' };
    // send current players to this client
    socket.emit('currentPlayers', players);
    // notify others
    socket.broadcast.emit('newPlayer', { id: socket.id, data: players[socket.id] });
  });

  // movement updates
  socket.on('playerMovement', (data) => {
    if (!players[socket.id]) return;
    players[socket.id].x = data.x; players[socket.id].y = data.y; players[socket.id].z = data.z;
    players[socket.id].rotation = data.rotation;
    socket.broadcast.emit('playerMoved', { id: socket.id, data: players[socket.id] });
  });

  // shooting: broadcast to others (they'll render visual beam)
  socket.on('shoot', (data) => {
    socket.broadcast.emit('shoot', data);
  });

  // lightsaber: broadcast (secret)
  socket.on('saber', (data) => {
    socket.broadcast.emit('saber', data);
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
    socket.broadcast.emit('playerDisconnected', socket.id);
  });
});

http.listen(3000, () => console.log('Server läuft auf :3000'));
