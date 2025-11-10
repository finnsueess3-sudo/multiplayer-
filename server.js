const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

const players = {};
const buildings = []; // Gebäude mit Widerstand

// Beispielgebäude
for(let i=-50;i<=50;i+=20){
    for(let j=-50;j<=50;j+=20){
        if(Math.random() > 0.5){
            buildings.push({x:i, z:j, width:10, depth:10, height:Math.random()*15+5, hp:100});
        }
    }
}

io.on('connection', (socket) => {
    console.log('Spieler verbunden:', socket.id);

    players[socket.id] = {x:0,y:1,z:0,rotation:0};

    socket.emit('currentPlayers', players);
    socket.emit('currentBuildings', buildings);
    socket.broadcast.emit('newPlayer', {id: socket.id, data: players[socket.id]});

    socket.on('playerMovement', (data) => {
        players[socket.id] = data;
        socket.broadcast.emit('playerMoved', {id: socket.id, data});
    });

    socket.on('shoot', ({position, direction}) => {
        // Prüfen ob Gebäude getroffen wird
        buildings.forEach(b => {
            let dx = position.x - b.x;
            let dz = position.z - b.z;
            if(Math.abs(dx)<b.width/2 && Math.abs(dz)<b.depth/2){
                b.hp -= 25; // Schaden
                if(b.hp<=0) console.log("Gebäude zerstört!");
            }
        });
        socket.broadcast.emit('bulletFired', {position, direction});
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        socket.broadcast.emit('playerDisconnected', socket.id);
    });
});

http.listen(3000, () => console.log('Server läuft auf Port 3000'));
