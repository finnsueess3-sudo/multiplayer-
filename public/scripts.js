// scripts.js - Coruscant FPS client
const socket = io();
let scene, camera, renderer, clock;
let players = {}, buildings = [], beams = [];
let myPlayer = { x: 0, y: 3.0, z: 0, rotation: 0, pitch: 0, name: 'Spieler' };
let move = { x: 0, z: 0 }, look = { x: 0, y: 0 };
let jetVel = 0;
const GRAVITY = -18;
const JET_ACCEL = 30;
const JET_DOWN_ACCEL = -30;
const MAX_JET_SPEED = 12;
let keys = {};
let loadscreen = document.getElementById('loadscreen');
const raycaster = new THREE.Raycaster();
const tempVec = new THREE.Vector3();
let usernameModal = document.getElementById('usernameModal');
let usernameInput = document.getElementById('usernameInput');
let startBtn = document.getElementById('startBtn');

initUI();
initScene();

function initUI(){
  // username start
  startBtn.addEventListener('click', () => {
    const name = (usernameInput.value || 'Spieler').trim().substring(0,16);
    myPlayer.name = name || 'Spieler';
    usernameModal.style.display = 'none';
    // notify server about new player
    socket.emit('newPlayer', { x: myPlayer.x, y: myPlayer.y, z: myPlayer.z, rotation: myPlayer.rotation, name: myPlayer.name });
  });

  // keyboard secret: 9 = lightsaber
  window.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
    if (e.key === '9') {
      triggerSaber(); // secret action
    }
  });
  window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
}

function initScene(){
  // three basics
  scene = new THREE.Scene();
  // bright Coruscant-ish sky: use subtle bluish-orange grad by background color
  scene.background = new THREE.Color(0xe0f7ff);

  camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 6000);
  camera.position.set(0, myPlayer.y + 1.6, 0);

  renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas'), antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  clock = new THREE.Clock();

  // lights - bright city
  scene.add(new THREE.HemisphereLight(0xfff7e6, 0x444466, 0.9));
  const dir = new THREE.DirectionalLight(0xffffff, 1.2);
  dir.position.set(120, 220, 100);
  dir.castShadow = true;
  scene.add(dir);

  // ground (big, slightly glossy)
  const grd = new THREE.Mesh(
    new THREE.PlaneGeometry(8000,8000),
    new THREE.MeshStandardMaterial({ color: 0x0f1720, metalness: 0.2, roughness: 0.85 })
  );
  grd.rotation.x = -Math.PI/2;
  grd.receiveShadow = true;
  scene.add(grd);

  generateCoruscantCity();

  // crosshair style tweak
  const ch = document.getElementById('crosshair');
  ch.style.background = 'transparent';

  // controls UI
  setupMobileControls();

  // socket events
  socket.on('currentPlayers', serverPlayers => {
    players = serverPlayers;
    for (let id in players) {
      if (id !== socket.id) createRemoteAvatar(id, players[id]);
    }
  });

  socket.on('newPlayer', ({ id, data }) => createRemoteAvatar(id, data));
  socket.on('playerMoved', ({ id, data }) => {
    if (players[id]) {
      players[id].x = data.x; players[id].y = data.y; players[id].z = data.z; players[id].rotation = data.rotation;
      if (players[id].mesh) players[id].mesh.position.set(data.x, data.y, data.z);
      if (players[id].nameSprite) updateNameSprite(players[id]);
    }
  });
  socket.on('playerDisconnected', id => {
    if (players[id] && players[id].mesh) scene.remove(players[id].mesh);
    if (players[id] && players[id].nameSprite) scene.remove(players[id].nameSprite);
    delete players[id];
  });
  socket.on('shoot', (data) => {
    // show beam for other players
    const origin = new THREE.Vector3(data.pos.x, data.pos.y, data.pos.z);
    const dirVec = new THREE.Vector3(data.dir.x, data.dir.y, data.dir.z);
    spawnBeamVisual(origin, dirVec, 0xffaa00);
  });
  socket.on('saber', (data) => {
    const origin = new THREE.Vector3(data.pos.x, data.pos.y, data.pos.z);
    const dirVec = new THREE.Vector3(data.dir.x, data.dir.y, data.dir.z);
    spawnSaberVisual(origin, dirVec, 0x66ccff);
  });

  // hide loadscreen
  setTimeout(()=>{ if (loadscreen) loadscreen.style.display='none'; }, 800);

  window.addEventListener('resize', ()=> {
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // kick off animation
  animate();
}

// ============== City generation ==============
function generateCoruscantCity(){
  // Parameters
  const grid = 60;            // how many steps from center
  const spacing = 30;         // spacing between building centers
  const radius = grid * spacing;

  for (let ix = -grid; ix <= grid; ix++) {
    for (let iz = -grid; iz <= grid; iz++) {
      // create open avenues/roads every few blocks to feel like city lanes
      if (ix % 6 === 0 || iz % 6 === 0) continue;
      const px = ix * spacing + (Math.random()*10 - 5);
      const pz = iz * spacing + (Math.random()*10 - 5);
      const w = 12 + Math.random()*28;
      const d = 12 + Math.random()*28;
      const h = 20 + Math.random()*220; // tall towers to emulate Coruscant
      const hue = 0.6 + Math.random()*0.05;
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(hue, 0.25, 0.36 + Math.random()*0.18),
        metalness: 0.6, roughness: 0.35, emissive: new THREE.Color(0x000000)
      });
      const box = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
      box.position.set(px, h/2, pz);
      box.castShadow = true; box.receiveShadow = true;
      box.userData.hp = 150 + Math.floor(Math.random()*350);
      scene.add(box);
      buildings.push(box);

      // occasional neon band / windows: add small emissive planes (cheap)
      if (Math.random() < 0.45) {
        const bands = 1 + Math.floor(Math.random()*6);
        for (let b = 0; b < bands; b++) {
          const bandMat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(0.65 + Math.random()*0.1, 0.8, 0.6), transparent:true, opacity:0.25 });
          const bandGeo = new THREE.PlaneGeometry(w * 0.9, 2);
          const band = new THREE.Mesh(bandGeo, bandMat);
          band.position.set(px, 6 + b * (h / (bands+1)), pz + d/2 + 0.1);
          band.rotation.y = 0;
          scene.add(band);
        }
      }

      // occasional sky-bridge
      if (Math.random() < 0.05) {
        const len = spacing * (2 + Math.floor(Math.random()*4));
        const bridge = new THREE.Mesh(new THREE.BoxGeometry(w*0.6, 3, len), new THREE.MeshStandardMaterial({ color:0x99aaff, metalness:0.6, roughness:0.25 }));
        bridge.position.set(px, 40 + Math.random()*140, pz + spacing/2);
        bridge.userData.hp = 300;
        scene.add(bridge);
        buildings.push(bridge);
      }
    }
  }
}

// ============== Remote avatar (capsule) with name sprite ==============
function createRemoteAvatar(id, data){
  if (!data) return;
  const geo = new THREE.CapsuleGeometry(0.45, 1.0, 4, 8);
  const mat = new THREE.MeshStandardMaterial({ color: 0xff4444, metalness:0.4, roughness:0.5 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(data.x, data.y, data.z);
  mesh.castShadow = true;
  scene.add(mesh);
  players[id] = data;
  players[id].mesh = mesh;
  // name sprite
  const sprite = makeNameSprite(data.name || 'Spieler');
  sprite.position.set(data.x, data.y + 2.4, data.z);
  scene.add(sprite);
  players[id].nameSprite = sprite;
}

function updateNameSprite(p){
  if (!p || !p.nameSprite) return;
  p.nameSprite.position.set(p.x, p.y + 2.4, p.z);
  // optionally update texture if name changed (omitted for speed)
}

// make a simple canvas sprite for name
function makeNameSprite(name){
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(10,10,30,0.6)';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.font = 'bold 28px Arial';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.fillText(name, canvas.width/2, 40);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(1.5, 0.4, 1);
  return spr;
}

// ============== Controls & Joysticks ==============
function setupMobileControls(){
  const leftZone = document.getElementById('joystickLeft');
  const rightZone = document.getElementById('rightTouch');
  // left joystick via nipplejs
  const leftJoy = nipplejs.create({ zone:leftZone, mode:'static', position:{ left:'80px', bottom:'80px' }, size:120 });
  leftJoy.on('move', (evt, data) => {
    if (!data || !data.vector) return;
    move.x = data.vector.x;
    move.z = -data.vector.y;
  });
  leftJoy.on('end', ()=>{ move.x = 0; move.z = 0; });

  // right swipe area for look
  rightZone.style.touchAction = 'none';
  let touching = false, lastTouch = null;
  rightZone.addEventListener('touchstart', (e)=>{ touching = true; lastTouch = e.touches[0]; }, {passive:false});
  rightZone.addEventListener('touchmove', (e)=> {
    if (!touching) return;
    const t = e.touches[0];
    const dx = (t.clientX - lastTouch.clientX) / window.innerWidth;
    const dy = (t.clientY - lastTouch.clientY) / window.innerHeight;
    look.x = dx * 6.0;
    look.y = dy * 6.0;
    lastTouch = t;
    e.preventDefault();
  }, {passive:false});
  rightZone.addEventListener('touchend', ()=>{ touching = false; look.x = 0; look.y = 0; });

  // jet and shoot buttons
  const jetUp = document.getElementById('jetUpBtn');
  const jetDown = document.getElementById('jetDownBtn');
  const shootBtn = document.getElementById('shootBtn');

  // hold flags
  const hold = { up:false, down:false };
  if (jetUp) {
    jetUp.addEventListener('touchstart',(e)=>{ hold.up=true; e.preventDefault(); }, {passive:false});
    jetUp.addEventListener('touchend', ()=>{ hold.up=false; });
    jetUp.addEventListener('mousedown', ()=>{ hold.up=true; });
    jetUp.addEventListener('mouseup', ()=>{ hold.up=false; });
  }
  if (jetDown) {
    jetDown.addEventListener('touchstart',(e)=>{ hold.down=true; e.preventDefault(); }, {passive:false});
    jetDown.addEventListener('touchend', ()=>{ hold.down=false; });
    jetDown.addEventListener('mousedown', ()=>{ hold.down=true; });
    jetDown.addEventListener('mouseup', ()=>{ hold.down=false; });
  }
  if (shootBtn) {
    shootBtn.addEventListener('touchstart', (e)=>{ e.preventDefault(); fireDoubleLaser(); }, {passive:false});
    shootBtn.addEventListener('mousedown', ()=> fireDoubleLaser());
  }

  // store hold object on setup for applyGravityAndJetpack
  setupMobileControls.hold = hold;
}

// ============== Physics: jetpack & gravity ==============
let jetVelLocal = 0;
function applyGravityAndJetpack(delta){
  const hold = setupMobileControls.hold || { up:false, down:false };
  let thrust = 0;
  if (keys[' ']) thrust += JET_ACCEL;
  if (keys['shift']) thrust += JET_DOWN_ACCEL;
  if (hold.up) thrust += JET_ACCEL;
  if (hold.down) thrust += JET_DOWN_ACCEL;

  // integrate
  jetVelLocal += (thrust + GRAVITY) * delta;
  if (jetVelLocal > MAX_JET_SPEED) jetVelLocal = MAX_JET_SPEED;
  if (jetVelLocal < -MAX_JET_SPEED * 1.5) jetVelLocal = -MAX_JET_SPEED * 1.5;
  myPlayer.y += jetVelLocal * delta;

  // ground clamp
  if (myPlayer.y < 1.2) { myPlayer.y = 1.2; jetVelLocal = 0; }

  // simple damping when neither up nor down pressed
  if (!hold.up && !hold.down && !keys[' '] && !keys['shift']) {
    jetVelLocal *= 0.98;
  }
}

// ============== Collision with buildings (box intersection) ==============
function checkBuildingCollision(){
  // approximate player's bbox
  const playerBox = new THREE.Box3(
    new THREE.Vector3(myPlayer.x - 0.35, myPlayer.y - 1.6, myPlayer.z - 0.35),
    new THREE.Vector3(myPlayer.x + 0.35, myPlayer.y + 1.6, myPlayer.z + 0.35)
  );

  for (let b of buildings) {
    const box = new THREE.Box3().setFromObject(b);
    if (box.intersectsBox(playerBox)) {
      // push out horizontally by shortest axis
      const c = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const dx = myPlayer.x - c.x, dz = myPlayer.z - c.z;
      if (Math.abs(dx) > Math.abs(dz)) {
        if (dx > 0) myPlayer.x = c.x + size.x/2 + 0.5;
        else myPlayer.x = c.x - size.x/2 - 0.5;
      } else {
        if (dz > 0) myPlayer.z = c.z + size.z/2 + 0.5;
        else myPlayer.z = c.z - size.z/2 - 0.5;
      }
      jetVelLocal = Math.min(jetVelLocal, 2);
    }
  }
}

// ============== Laser beams (instant raycast + visual beam) ==============
function fireDoubleLaser(){
  // compute from camera; two lateral offsets
  const offsets = [-0.28, 0.28];
  for (let off of offsets) {
    const origin = new THREE.Vector3().copy(camera.position);
    // camera's right vector
    const right = new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion).normalize();
    origin.addScaledVector(right, off);
    origin.y -= 0.2;

    const dir = new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion).normalize();

    // Raycast against buildings & remote player meshes
    raycaster.set(origin, dir);
    const possible = buildings.concat(Object.values(players).map(p => p.mesh).filter(Boolean));
    const hits = raycaster.intersectObjects(possible, true);
    let hitPoint = null;
    if (hits.length > 0) {
      hitPoint = hits[0].point.clone();
      const obj = hits[0].object;
      // apply damage to building if it's ours
      if (obj.userData && typeof obj.userData.hp === 'number') {
        obj.userData.hp -= 60;
        // color tint
        obj.material.color.offsetHSL(0,0,-0.04);
        if (obj.userData.hp <= 0) {
          scene.remove(obj);
          const idx = buildings.indexOf(obj);
          if (idx !== -1) buildings.splice(idx,1);
        }
      } else {
        // hit other player? could emit event to server (not implemented full HP server-side)
      }
    } else {
      // no hit: far point
      hitPoint = origin.clone().add(dir.clone().multiplyScalar(1500));
    }

    spawnBeamVisual(origin, dir, 0xff3333, hitPoint);
    // tell server so others can render beam
    socket.emit('shoot', { shooterId: socket.id, pos: { x: origin.x, y: origin.y, z: origin.z }, dir: { x: dir.x, y: dir.y, z: dir.z } });
  }
}

// visual beam creation: short-lived cylinder aligned to direction
function spawnBeamVisual(origin, dir, color = 0xff3300, explicitHitPoint = null){
  const maxLen = explicitHitPoint ? origin.distanceTo(explicitHitPoint) : 1200;
  const len = Math.min(maxLen, 1200);
  const geo = new THREE.CylinderGeometry(0.045,0.045,len,6,1,true);
  const mat = new THREE.MeshBasicMaterial({ color: color, transparent:true, opacity:0.95, depthWrite:false });
  const mesh = new THREE.Mesh(geo, mat);
  const mid = origin.clone().add(dir.clone().multiplyScalar(len/2));
  mesh.position.copy(mid);
  // align (cylinder up axis aligned with dir)
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir.clone().normalize());
  mesh.userData.life = 0.08 + Math.random()*0.03;
  scene.add(mesh);
  beams.push(mesh);
}

// ============== Lightsaber (secret) ==============
function triggerSaber(){
  const origin = new THREE.Vector3().copy(camera.position);
  const dir = new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion).normalize();
  // spawn short, bright saber visual at close range
  spawnSaberVisual(origin, dir, 0x66ccff);
  socket.emit('saber', { shooterId: socket.id, pos: { x: origin.x, y: origin.y, z: origin.z }, dir: { x: dir.x, y: dir.y, z: dir.z } });
}

function spawnSaberVisual(origin, dir, color=0x66ccff){
  const len = 6;
  const geo = new THREE.CylinderGeometry(0.12,0.12,len,8,1,true);
  const mat = new THREE.MeshBasicMaterial({ color: color, transparent:true, opacity:0.98, blending: THREE.AdditiveBlending });
  const mesh = new THREE.Mesh(geo, mat);
  const mid = origin.clone().add(dir.clone().multiplyScalar(len/2));
  mesh.position.copy(mid);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir.clone().normalize());
  mesh.userData.life = 0.22;
  scene.add(mesh);
  beams.push(mesh);
}

// ============== Main animate loop ==============
function animate(){
  requestAnimationFrame(animate);
  const delta = Math.min(0.06, clock.getDelta());

  // apply look deltas to yaw/pitch
  myPlayer.rotation += look.x * 1.6 * delta;
  myPlayer.pitch = (myPlayer.pitch || 0) + (-look.y * 1.6 * delta);
  myPlayer.pitch = Math.max(-Math.PI/3, Math.min(Math.PI/3, myPlayer.pitch));
  // damp look
  look.x *= 0.35; look.y *= 0.35;

  // movement relative to yaw
  const forward = new THREE.Vector3(Math.sin(myPlayer.rotation),0,-Math.cos(myPlayer.rotation));
  const right = new THREE.Vector3(forward.z,0,-forward.x);
  const speed = 10;
  // keyboard fallback
  if (keys['w']) { move.z = -1; } else if (keys['s']) { move.z = 1; }
  if (keys['a']) { move.x = -1; } else if (keys['d']) { move.x = 1; }

  tempVec.set(0,0,0);
  tempVec.addScaledVector(forward, move.z * speed * delta);
  tempVec.addScaledVector(right, move.x * speed * delta);

  myPlayer.x += tempVec.x;
  myPlayer.z += tempVec.z;

  // jetpack/gravity
  applyGravityAndJetpack(delta);

  // building collision
  checkBuildingCollision();

  // camera first-person
  camera.position.set(myPlayer.x, myPlayer.y + 1.6, myPlayer.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = myPlayer.rotation;
  camera.rotation.x = myPlayer.pitch;

  // beams life update
  for (let i = beams.length -1; i >=0; i--){
    const b = beams[i];
    b.userData.life -= delta;
    if (b.userData.life <= 0) {
      scene.remove(b); beams.splice(i,1);
    } else {
      if (b.material && b.material.opacity !== undefined) b.material.opacity = Math.max(0, b.userData.life / 0.22);
    }
  }

  // send position to server
  socket.emit('playerMovement', { x: myPlayer.x, y: myPlayer.y, z: myPlayer.z, rotation: myPlayer.rotation });

  // render
  renderer.render(scene, camera);
}
