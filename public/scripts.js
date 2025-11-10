// scripts.js - Komplett überarbeitet
const socket = io();
let scene, camera, renderer, clock;
let players = {}, buildings = [], instancedDecor = null, beams = [];
let myPlayer = { x: 0, y: 3.0, z: 0, rotation: 0, pitch: 0, name: 'Spieler', hp:100 };
let move = { x: 0, z: 0 }, look = { x: 0, y: 0 };
let jetVel = 0;
const GRAVITY = -18, JET_ACCEL = 28, JET_DOWN_ACCEL = -30, MAX_JET_SPEED = 12;
let keys = {}, loadscreen = document.getElementById('loadscreen'), usernameModal = document.getElementById('usernameModal');
const raycaster = new THREE.Raycaster();
const tmpV = new THREE.Vector3();
let controlMode = 'ipad'; // default

initUI();
initScene();
animate();

/* ================== UI & Controls & Menu ================== */
function initUI(){
  const startBtn = document.getElementById('startBtn');
  const usernameInput = document.getElementById('usernameInput');
  const controlSelect = document.getElementById('controlSelect');

  startBtn.addEventListener('click', ()=>{
    const name = (usernameInput.value || 'Spieler').trim().substring(0,16);
    myPlayer.name = name || 'Spieler';
    controlMode = controlSelect.value || 'ipad';
    usernameModal.style.display = 'none';
    // tell server about new player
    socket.emit('newPlayer', { x: myPlayer.x, y: myPlayer.y, z: myPlayer.z, rotation: myPlayer.rotation, name: myPlayer.name });
  });

  // top-right menu
  const menuBtn = document.getElementById('menuButton');
  const optionsPanel = document.getElementById('optionsPanel');
  menuBtn.addEventListener('click', ()=> optionsPanel.classList.toggle('hidden'));
  document.getElementById('closeOptions').addEventListener('click', ()=> optionsPanel.classList.add('hidden'));
  // options panel control select
  document.getElementById('optControlSelect').addEventListener('change', e=>{
    controlMode = e.target.value;
    applyControlPreset(controlMode);
  });
  // brightness slider
  document.getElementById('brightness').addEventListener('input', e=>{
    const v = parseFloat(e.target.value);
    if (scene) scene.traverse(obj => { if (obj.isLight) obj.intensity = obj.userData.baseIntensity ? obj.userData.baseIntensity * v : obj.intensity; });
  });

  // keyboard secret: 9 = saber
  window.addEventListener('keydown', (e)=> {
    keys[e.key.toLowerCase()] = true;
    if (e.key === '9') triggerSaber();
    if (e.key === ' ') e.preventDefault();
  });
  window.addEventListener('keyup', (e)=> keys[e.key.toLowerCase()] = false);
}

function applyControlPreset(mode){
  // switch behavior — currently adjusts sensitivity or visibility of HUD
  controlMode = mode;
  if (mode === 'keyboard') {
    // hide joystick zones to avoid interfering
    document.getElementById('joystickLeft').style.display = 'none';
    document.getElementById('rightTouch').style.display = 'none';
    document.getElementById('hud').style.display = 'flex';
  } else if (mode === 'ipad') {
    document.getElementById('joystickLeft').style.display = 'block';
    document.getElementById('rightTouch').style.display = 'block';
    document.getElementById('hud').style.display = 'flex';
  } else {
    // controller - show HUD but also enable keyboard fallback
    document.getElementById('joystickLeft').style.display = 'none';
    document.getElementById('rightTouch').style.display = 'none';
  }
}

/* ================== Scene Init ================== */
function initScene(){
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeaf6ff); // very bright sky

  camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 8000);
  camera.position.set(0, myPlayer.y + 1.6, 0);

  renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas'), antialias:true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;

  clock = new THREE.Clock();

  // LIGHTS (keep baseIntensity for brightness slider)
  const hemi = new THREE.HemisphereLight(0xfff1d6, 0x404060, 1.0);
  hemi.userData.baseIntensity = 1.0;
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(200, 400, 150);
  sun.castShadow = true;
  sun.userData.baseIntensity = 1.6;
  scene.add(sun);

  // subtle ambient fill
  const amb = new THREE.AmbientLight(0xffffff, 0.45);
  amb.userData.baseIntensity = 0.45;
  scene.add(amb);

  // ground reflective strip to brighten overall look
  const grd = new THREE.Mesh(new THREE.PlaneGeometry(10000,10000), new THREE.MeshStandardMaterial({ color:0x0f2130, metalness:0.2, roughness:0.6 }));
  grd.rotation.x = -Math.PI/2; grd.receiveShadow = true; scene.add(grd);

  // generate city (decorative instanced + interactive buildings)
  generateCityWithInstancing();

  // crosshair tweak
  const ch = document.getElementById('crosshair');
  if (ch) ch.style.filter = 'drop-shadow(0 0 6px rgba(255,210,150,0.55))';

  // controls setup (nipplejs etc)
  setupControls();

  // socket events
  socket.on('currentPlayers', serverPlayers => {
    players = serverPlayers;
    for (let id in players) if (id !== socket.id) createRemote(id, players[id]);
  });
  socket.on('newPlayer', ({id,data}) => createRemote(id,data));
  socket.on('playerMoved', ({id,data})=> {
    if (players[id]) { Object.assign(players[id], data); if (players[id].mesh) players[id].mesh.position.set(data.x,data.y,data.z); }
  });
  socket.on('playerDisconnected', id => { if (players[id] && players[id].mesh) scene.remove(players[id].mesh); if (players[id] && players[id].nameSprite) scene.remove(players[id].nameSprite); delete players[id]; });

  // building init from server (interactive set)
  socket.on('initBuildings', serverBuildings => {
    // serverBuildings: array with id,x,z,width,depth,height,hp
    for (let b of serverBuildings) addInteractiveBuilding(b);
  });
  socket.on('buildingHit', ({id,hp}) => {
    // tint building to show damage (find mesh)
    const m = buildings.find(x=>x.userData.serverId === id);
    if (m) {
      m.userData.hp = hp;
      if (m.material) m.material.color.offsetHSL(0,0,-0.03);
    }
  });
  socket.on('buildingDestroy', ({id}) => {
    const idx = buildings.findIndex(x=>x.userData.serverId === id);
    if (idx !== -1) { scene.remove(buildings[idx]); buildings.splice(idx,1); }
  });

  socket.on('playerHit', ({id,hp}) => {
    if (id === socket.id) {
      myPlayer.hp = hp;
      // optionally show UI flash (omitted)
    } else if (players[id]) players[id].hp = hp;
  });
  socket.on('playerKilled', ({id}) => { /* respawn handled by server's playerMoved */ });

  // show remote shoot/saber visuals
  socket.on('shoot', (data) => {
    const origin = new THREE.Vector3(data.pos.x,data.pos.y,data.pos.z);
    const dir = new THREE.Vector3(data.dir.x,data.dir.y,data.dir.z);
    spawnBeamVisual(origin, dir, 0xffaa66);
  });
  socket.on('saber', (data) => {
    const origin = new THREE.Vector3(data.pos.x,data.pos.y,data.pos.z);
    const dir = new THREE.Vector3(data.dir.x,data.dir.y,data.dir.z);
    spawnSaberVisual(origin, dir, 0x66ccff);
  });

  // hide loadscreen nicely by increasing loader to 100 during init (simulate progress)
  const prog = document.getElementById('loaderProgress');
  let p = 10;
  const tick = setInterval(()=>{
    p = Math.min(100, p + Math.random()*20);
    prog.style.width = `${p}%`;
    if (p >= 100) { clearInterval(tick); setTimeout(()=>{ if (loadscreen) loadscreen.style.display='none'; }, 350); }
  }, 250);

  window.addEventListener('resize', ()=> {
    camera.aspect = window.innerWidth/window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

/* ================== City generation + instancing ================== */
function generateCityWithInstancing(){
  // create many small decorative towers as InstancedMesh for performance
  const total = 2000;
  const geo = new THREE.BoxGeometry(1,1,1);
  const mat = new THREE.MeshStandardMaterial({ color:0x88aaff, metalness:0.6, roughness:0.5 });
  const inst = new THREE.InstancedMesh(geo, mat, total);
  inst.castShadow = false; inst.receiveShadow = false;
  let idx = 0;
  const spread = 1400;
  for (let i=0;i<total;i++){
    const px = Math.floor((Math.random()*2-1)*spread);
    const pz = Math.floor((Math.random()*2-1)*spread);
    const sx = 8 + Math.random()*36;
    const sz = 8 + Math.random()*36;
    const h = 20 + Math.random()*250;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(px, h/2, pz), new THREE.Quaternion(), new THREE.Vector3(sx,h,sz));
    inst.setMatrixAt(idx++, m);
  }
  scene.add(inst);
  instancedDecor = inst;

  // interactive buildings are requested from server (we add in socket 'initBuildings')
  // create a few large unique 'plaza' landmarks client-side to enrich scene
  for (let k=0;k<6;k++){
    const w = 80 + Math.random()*160, h = 80 + Math.random()*240, d = 80 + Math.random()*160;
    const box = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.62 + Math.random()*0.06, 0.25, 0.4), metalness:0.7, roughness:0.3 }));
    box.position.set((Math.random()*2-1)*600, h/2, (Math.random()*2-1)*600);
    box.receiveShadow = true; box.castShadow = true;
    scene.add(box);
    // decorative only
  }
}

/* add interactive building from server */
function addInteractiveBuilding(b){
  // b: {id,x,z,width,depth,height,hp}
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.62,0.25,0.42), metalness:0.6, roughness:0.35 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.width,b.height,b.depth), mat);
  mesh.position.set(b.x, b.height/2, b.z);
  mesh.userData.hp = b.hp; mesh.userData.serverId = b.id;
  mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh);
  buildings.push(mesh);
}

/* ================== remote player avatar creation ================== */
function createRemote(id, data){
  const geo = new THREE.CapsuleGeometry(0.45, 1.0, 4, 8);
  const mat = new THREE.MeshStandardMaterial({ color: 0xff6666, metalness:0.4, roughness:0.5 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(data.x, data.y, data.z);
  mesh.castShadow = true; scene.add(mesh);
  players[id] = Object.assign({}, data, { mesh: mesh, hp: data.hp || 100 });
  // name sprite
  const spr = makeNameSprite(data.name || 'Spieler');
  spr.position.set(data.x, data.y+2.4, data.z);
  scene.add(spr);
  players[id].nameSprite = spr;
}

function makeNameSprite(name){
  const canvas = document.createElement('canvas'); canvas.width=256; canvas.height=64;
  const ctx = canvas.getContext('2d'); ctx.fillStyle='rgba(8,8,16,0.6)'; ctx.fillRect(0,0,256,64);
  ctx.font='bold 26px Arial'; ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.fillText(name,128,40);
  const tex = new THREE.CanvasTexture(canvas); tex.needsUpdate=true;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest:false });
  const spr = new THREE.Sprite(mat); spr.scale.set(1.8,0.5,1); return spr;
}

/* ================== Controls (nipplejs + touch + mouse) ================== */
function setupControls(){
  // left joystick
  const leftZone = document.getElementById('joystickLeft');
  const rightZone = document.getElementById('rightTouch');
  const leftJoy = nipplejs.create({ zone:leftZone, mode:'static', position:{ left:'80px', bottom:'80px' }, size:120 });
  leftJoy.on('move', (evt, data)=>{ if (!data) return; move.x = data.vector.x; move.z = -data.vector.y; });
  leftJoy.on('end', ()=>{ move.x = 0; move.z = 0; });

  // right swipe for look
  rightZone.style.touchAction = 'none';
  let touching = false, last = null;
  rightZone.addEventListener('touchstart', e=>{ touching=true; last = e.touches[0]; }, {passive:false});
  rightZone.addEventListener('touchmove', e=>{ if(!touching) return; const t=e.touches[0]; const dx=(t.clientX-last.clientX)/window.innerWidth; const dy=(t.clientY-last.clientY)/window.innerHeight; look.x = dx*6; look.y = dy*6; last = t; e.preventDefault(); }, {passive:false});
  rightZone.addEventListener('touchend', ()=>{ touching=false; look.x=0; look.y=0; });

  // mouse for desktop
  let down=false, lastMouse=null;
  window.addEventListener('mousedown', e=>{ if(e.clientX>window.innerWidth/2){ down=true; lastMouse = e; }});
  window.addEventListener('mousemove', e=>{ if(!down || !lastMouse) return; const dx=(e.clientX-lastMouse.clientX)/window.innerWidth; const dy=(e.clientY-lastMouse.clientY)/window.innerHeight; look.x = dx*6; look.y = dy*6; lastMouse=e; });
  window.addEventListener('mouseup', ()=>{ down=false; look.x=0; look.y=0; lastMouse=null; });

  // HUD buttons
  const jetUp = document.getElementById('jetUpBtn'), jetDown = document.getElementById('jetDownBtn'), shootBtn = document.getElementById('shootBtn');
  const hold = { up:false, down:false };
  if (jetUp){ jetUp.addEventListener('touchstart', e=>{ hold.up=true; e.preventDefault(); }, {passive:false}); jetUp.addEventListener('touchend', ()=>hold.up=false); jetUp.addEventListener('mousedown', ()=>hold.up=true); jetUp.addEventListener('mouseup', ()=>hold.up=false); }
  if (jetDown){ jetDown.addEventListener('touchstart', e=>{ hold.down=true; e.preventDefault(); }, {passive:false}); jetDown.addEventListener('touchend', ()=>hold.down=false); jetDown.addEventListener('mousedown', ()=>hold.down=true); jetDown.addEventListener('mouseup', ()=>hold.down=false); }
  if (shootBtn){ shootBtn.addEventListener('touchstart', e=>{ e.preventDefault(); fireDoubleLaser(); }, {passive:false}); shootBtn.addEventListener('mousedown', ()=> fireDoubleLaser()); }

  setupControls.hold = hold;
}

/* ================== Physics: jetpack & collision ================== */
let jetVelLocal = 0;
function applyGravityAndJetpack(delta){
  const hold = setupControls.hold || { up:false, down:false };
  let thrust = 0;
  if (keys[' ']) thrust += JET_ACCEL;
  if (keys['shift']) thrust += JET_DOWN_ACCEL;
  if (hold.up) thrust += JET_ACCEL;
  if (hold.down) thrust += JET_DOWN_ACCEL;

  jetVelLocal += (thrust + GRAVITY) * delta;
  if (jetVelLocal > MAX_JET_SPEED) jetVelLocal = MAX_JET_SPEED;
  if (jetVelLocal < -MAX_JET_SPEED*1.5) jetVelLocal = -MAX_JET_SPEED*1.5;
  myPlayer.y += jetVelLocal * delta;

  // clamp ground
  if (myPlayer.y < 1.2) { myPlayer.y = 1.2; jetVelLocal = 0; }
  // gentle damping if no thrust
  if (!hold.up && !hold.down && !keys[' '] && !keys['shift']) jetVelLocal *= 0.985;
}

/* building collision using Box3 intersection */
function checkBuildingCollision(){
  const playerBox = new THREE.Box3(new THREE.Vector3(myPlayer.x-0.35,myPlayer.y-1.6,myPlayer.z-0.35), new THREE.Vector3(myPlayer.x+0.35,myPlayer.y+1.6,myPlayer.z+0.35));
  for (let b of buildings) {
    const box = new THREE.Box3().setFromObject(b);
    if (box.intersectsBox(playerBox)) {
      const c = box.getCenter(new THREE.Vector3()); const s = box.getSize(new THREE.Vector3());
      const dx = myPlayer.x - c.x, dz = myPlayer.z - c.z;
      if (Math.abs(dx) > Math.abs(dz)) {
        if (dx > 0) myPlayer.x = c.x + s.x/2 + 0.6; else myPlayer.x = c.x - s.x/2 - 0.6;
      } else {
        if (dz > 0) myPlayer.z = c.z + s.z/2 + 0.6; else myPlayer.z = c.z - s.z/2 - 0.6;
      }
      jetVelLocal = Math.min(jetVelLocal, 2);
    }
  }
}

/* ================== Laser: instant hits + visual beam + particles ================== */
function fireDoubleLaser(){
  // two offsets so beams come from left/right gun
  const offs = [-0.28, 0.28];
  for (let off of offs){
    const origin = new THREE.Vector3().copy(camera.position);
    const right = new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion).normalize();
    origin.addScaledVector(right, off);
    origin.y -= 0.2;
    const dir = new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion).normalize();

    // raycast client-side to show immediate hit and spawn impact particle
    raycaster.set(origin, dir);
    const possible = buildings.concat(Object.values(players).map(p=>p.mesh).filter(Boolean));
    const hits = raycaster.intersectObjects(possible, true);
    let hitPoint = null;
    if (hits.length>0){ hitPoint = hits[0].point.clone(); spawnImpact(hitPoint); }
    else hitPoint = origin.clone().add(dir.clone().multiplyScalar(1200));
    spawnBeamVisual(origin, dir, 0xff4444, hitPoint);

    // tell server (server does authoritative hit validation)
    socket.emit('shoot', { shooterId: socket.id, pos: { x: origin.x, y: origin.y, z: origin.z }, dir: { x: dir.x, y: dir.y, z: dir.z } });
  }
}

/* spawn small spark particles at hit */
function spawnImpact(pos){
  const spriteMat = new THREE.SpriteMaterial({ map: makeSparkTexture(), blending: THREE.AdditiveBlending, transparent:true });
  const s = new THREE.Sprite(spriteMat);
  s.position.copy(pos);
  s.scale.set(1.2,1.2,1.2);
  s.userData.life = 0.35; scene.add(s);
  beams.push(s); // reuse beams array for cleanup
}

/* create a tiny canvas texture for sparks */
function makeSparkTexture(){
  const c = document.createElement('canvas'); c.width=64; c.height=64;
  const ctx = c.getContext('2d'); const g = ctx.createRadialGradient(32,32,2,32,32,32);
  g.addColorStop(0,'rgba(255,255,210,1)'); g.addColorStop(0.4,'rgba(255,150,50,0.8)'); g.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0,0,64,64);
  return new THREE.CanvasTexture(c);
}

/* spawn beam visual as thin cylinder with additive material */
function spawnBeamVisual(origin, dir, color=0xff3300, explicitHit=null){
  const length = explicitHit ? origin.distanceTo(explicitHit) : 1200;
  const geo = new THREE.CylinderGeometry(0.035,0.035,length,6,1,true);
  const mat = new THREE.MeshBasicMaterial({ color: color, transparent:true, opacity:0.95, blending:THREE.AdditiveBlending, depthWrite:false });
  const mesh = new THREE.Mesh(geo, mat);
  const mid = origin.clone().add(dir.clone().multiplyScalar(length/2));
  mesh.position.copy(mid);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir.clone().normalize());
  mesh.userData.life = 0.08 + Math.random()*0.04;
  scene.add(mesh);
  beams.push(mesh);
}

/* saber (secret) */
function triggerSaber(){
  const origin = new THREE.Vector3().copy(camera.position);
  const dir = new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion).normalize();
  spawnSaberVisual(origin, dir, 0x88ccff);
  socket.emit('saber', { shooterId: socket.id, pos:{x:origin.x,y:origin.y,z:origin.z}, dir:{x:dir.x,y:dir.y,z:dir.z} });
}
function spawnSaberVisual(origin, dir, color=0x66ccff){
  const len = 6; const geo = new THREE.CylinderGeometry(0.12,0.12,len,8,1,true);
  const mat = new THREE.MeshBasicMaterial({ color: color, transparent:true, opacity:0.95, blending:THREE.AdditiveBlending });
  const mesh = new THREE.Mesh(geo, mat);
  const mid = origin.clone().add(dir.clone().multiplyScalar(len/2));
  mesh.position.copy(mid); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir.clone().normalize());
  mesh.userData.life = 0.22; scene.add(mesh); beams.push(mesh);
}

/* ================== Animate loop ================== */
function animate(){
  requestAnimationFrame(animate);
  const delta = Math.min(0.06, clock.getDelta());

  // apply look
  myPlayer.rotation += look.x * 1.6 * delta;
  myPlayer.pitch = (myPlayer.pitch||0) + (-look.y * 1.6 * delta);
  myPlayer.pitch = Math.max(-Math.PI/3, Math.min(Math.PI/3, myPlayer.pitch));
  look.x *= 0.35; look.y *= 0.35;

  // movement relative to yaw
  const forward = new THREE.Vector3(Math.sin(myPlayer.rotation),0,-Math.cos(myPlayer.rotation));
  const right = new THREE.Vector3(forward.z,0,-forward.x);
  const speed = 10;
  if (keys['w']) move.z = -1; else if (keys['s']) move.z = 1;
  if (keys['a']) move.x = -1; else if (keys['d']) move.x = 1;

  tmpV.set(0,0,0);
  tmpV.addScaledVector(forward, move.z * speed * delta);
  tmpV.addScaledVector(right, move.x * speed * delta);
  myPlayer.x += tmpV.x; myPlayer.z += tmpV.z;

  // jetpack/gravity
  applyGravityAndJetpack(delta);

  // collisions
  checkBuildingCollision();

  // camera position & rotation (first-person)
  camera.position.set(myPlayer.x, myPlayer.y + 1.6, myPlayer.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = myPlayer.rotation;
  camera.rotation.x = myPlayer.pitch;

  // beams & sparks life update
  for (let i=beams.length-1;i>=0;i--){
    const b = beams[i];
    b.userData.life -= delta;
    if (b.userData.life <= 0){ scene.remove(b); beams.splice(i,1); }
    else if (b.material && b.material.opacity !== undefined) b.material.opacity = Math.max(0, b.userData.life / 0.22);
  }

  // name sprites update
  for (let id in players){
    const p = players[id];
    if (p && p.nameSprite) p.nameSprite.position.set(p.x, p.y+2.4, p.z);
  }

  // send movement to server
  socket.emit('playerMovement', { x: myPlayer.x, y: myPlayer.y, z: myPlayer.z, rotation: myPlayer.rotation });

  renderer.render(scene, camera);
}

/* End of file */
