// server.js (Node)
// npm i express socket.io
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

const players = {}; // {id: {x,y,z,rotation,name,hp}}
const interactiveBuildings = []; // {id,x,z,width,depth,height,hp}

function createBuildings() {
  // create a moderate number of interactive buildings (smaller than total city)
  let id = 1;
  for (let i = -20; i <= 20; i+=2) {
    for (let j = -20; j <= 20; j+=2) {
      if (Math.random() < 0.2) {
        const w = 12 + Math.floor(Math.random()*20);
        const d = 12 + Math.floor(Math.random()*20);
        const h = 40 + Math.floor(Math.random()*160);
        interactiveBuildings.push({ id: id++, x: i*30, z: j*30, width:w, depth:d, height:h, hp: 200 + Math.floor(Math.random()*400) });
      }
    }
  }
}
createBuildings();

io.on('connection', socket => {
  console.log('conn', socket.id);

  // send current buildings to client (positions/hp)
  socket.emit('initBuildings', interactiveBuildings);

  socket.on('newPlayer', data => {
    players[socket.id] = { x: data.x||0, y: data.y||3, z: data.z||0, rotation: data.rotation||0, name: data.name || 'Spieler', hp:100 };
    socket.emit('currentPlayers', players);
    socket.broadcast.emit('newPlayer', { id: socket.id, data: players[socket.id] });
  });

  socket.on('playerMovement', data => {
    if (!players[socket.id]) return;
    players[socket.id].x = data.x; players[socket.id].y = data.y; players[socket.id].z = data.z; players[socket.id].rotation = data.rotation;
    socket.broadcast.emit('playerMoved', { id: socket.id, data: players[socket.id] });
  });

  // shoot: validate hits server-side against interactiveBuildings and players
  socket.on('shoot', data => {
    // data: { shooterId, pos:{x,y,z}, dir:{x,y,z} }
    // We'll compute simple ray-AABB intersection on server
    const shooterId = data.shooterId || socket.id;
    const origin = data.pos;
    const dir = data.dir;
    // normalize dir
    const len = Math.sqrt(dir.x*dir.x + dir.y*dir.y + dir.z*dir.z) || 1;
    const nd = { x: dir.x/len, y: dir.y/len, z: dir.z/len };
    const maxRange = 1500;

    // check buildings
    for (let b of interactiveBuildings) {
      // compute AABB
      const min = { x: b.x - b.width/2, y: 0, z: b.z - b.depth/2 };
      const max = { x: b.x + b.width/2, y: b.height, z: b.z + b.depth/2 };
      // ray-AABB (slab method)
      let tmin = 0, tmax = maxRange;
      for (let axis of ['x','y','z']) {
        const o = origin[axis], dcomp = nd[axis], minA = min[axis], maxA = max[axis];
        if (Math.abs(dcomp) < 1e-6) {
          if (o < minA || o > maxA) { tmin = 1; tmax = 0; break; }
        } else {
          const t1 = (minA - o) / dcomp;
          const t2 = (maxA - o) / dcomp;
          const ta = Math.min(t1,t2), tb = Math.max(t1,t2);
          tmin = Math.max(tmin, ta);
          tmax = Math.min(tmax, tb);
          if (tmin > tmax) break;
        }
      }
      if (tmin <= tmax && tmax > 0 && tmin < maxRange) {
        // hit
        b.hp -= 60;
        // notify clients about building HP change (and if destroyed)
        io.emit('buildingHit', { id: b.id, hp: b.hp });
        if (b.hp <= 0) {
          io.emit('buildingDestroy', { id: b.id });
        }
        // stop at first hit (laser stops at first obstacle)
        break;
      }
    }

    // check players (simple distance to ray)
    for (let pid in players) {
      if (pid === shooterId) continue;
      const p = players[pid];
      // project player position onto ray, find closest point
      const vx = p.x - origin.x, vy = p.y - origin.y, vz = p.z - origin.z;
      const t = vx*nd.x + vy*nd.y + vz*nd.z;
      if (t > 0 && t < maxRange) {
        // closest point
        const cx = origin.x + nd.x * t, cy = origin.y + nd.y * t, cz = origin.z + nd.z * t;
        const dist2 = (p.x-cx)*(p.x-cx)+(p.y-cy)*(p.y-cy)+(p.z-cz)*(p.z-cz);
        if (dist2 < 0.8*0.8) { // hit radius ~0.8m
          players[pid].hp -= 20;
          io.emit('playerHit', { id: pid, hp: players[pid].hp });
          if (players[pid].hp <= 0) {
            // respawn
            players[pid].x = 0; players[pid].y = 5; players[pid].z = 0; players[pid].hp = 100;
            io.emit('playerKilled', { id: pid });
            io.emit('playerMoved', { id: pid, data: players[pid] });
          }
          break;
        }
      }
    }

    // broadcast shoot event to others so they can show beam
    io.emit('shoot', { shooterId, pos: origin, dir: nd });
  });

  socket.on('saber', data => {
    // simple server-side validation like shoot but shorter range/higher damage
    io.emit('saber', data);
    // optionally apply player damage similar to above
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
    socket.broadcast.emit('playerDisconnected', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log('Server läuft auf', PORT));
