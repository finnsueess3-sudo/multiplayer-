const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

const players = {};

io.on('connection', (socket) => {
    console.log('Ein Spieler verbunden:', socket.id);

    // Spieler initialisieren
    players[socket.id] = { x: 0, y: 0, z: 0, rotation: 0 };

    // Sende allen Spielern die aktuellen Spieler-Positionen
    socket.emit('currentPlayers', players);
    socket.broadcast.emit('newPlayer', { id: socket.id, data: players[socket.id] });

    socket.on('playerMovement', (data) => {
        players[socket.id] = data;
        socket.broadcast.emit('playerMoved', { id: socket.id, data });
    });

    socket.on('disconnect', () => {
        console.log('Spieler getrennt:', socket.id);
        delete players[socket.id];
        socket.broadcast.emit('playerDisconnected', socket.id);
    });
});

http.listen(3000, () => console.log('Server läuft auf Port 3000'));
