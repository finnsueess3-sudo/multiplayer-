// scripts.js - Komplettes Clientskript
// Features: helle Coruscant-Map, humanoider Spieler (remote GLB), FP-Arme lokal,
// mobile joysticks, swipe-look, smooth jetpack, double-laser (raycast + beam visuals),
// username modal, menu/options, server socket.io integration.

// ---------- Konfiguration ----------
const MODEL_PATH = '/models/humanoid.glb'; // lege dein GLB hier ab (optional)
const USE_REMOTE_MODEL = true; // wenn true, versucht das GLB zu laden für remote avatars
const CITY_SPREAD = 700; // wie weit die Stadt reicht (performance tradeoff)
const INSTANCED_DECOR_COUNT = 1600; // mehr = schöner, langsamer
const LASER_DAMAGE_BUILDING = 60;
const LASER_DAMAGE_PLAYER = 22;

// ---------- globale Variablen ----------
const socket = io();
let scene, camera, renderer, clock;
let players = {};          // remote players info
let instancedDecor = null; // decorative instanced mesh
let interactiveBuildings = []; // server-driven interactive buildings (meshes)
let beams = [];            // visuelle beams & partikel
let myPlayer = { x: 0, y: 3.0, z: 0, rotation: 0, pitch: 0, name: 'Spieler', hp: 100, id: null };
let move = { x: 0, z: 0 }, look = { x: 0, y: 0 };
let jetVel = 0;
const GRAVITY = -18, JET_ACCEL = 28, JET_DOWN_ACCEL = -30, MAX_JET_SPEED = 12;
let keys = {};
let loadscreen, usernameModal, usernameInput, startBtn;
const raycaster = new THREE.Raycaster();
const tmpV = new THREE.Vector3();

// For GLTF loader dynamic import
let GLTFLoaderClass = null;

// ---------- Start ----------
initDomRefs();
initScene(); // Starts also animation loop and sockets

// ---------- DOM / UI Refs & Init ----------
function initDomRefs(){
  loadscreen = document.getElementById('loadscreen');
  usernameModal = document.getElementById('usernameModal');
  usernameInput = document.getElementById('usernameInput');
  startBtn = document.getElementById('startBtn');

  // username start
  startBtn.addEventListener('click', () => {
    const name = (usernameInput.value || 'Spieler').trim().substring(0,16);
    myPlayer.name = name || 'Spieler';
    usernameModal.style.display = 'none';
    // send introduce to server
    socket.emit('newPlayer', { x: myPlayer.x, y: myPlayer.y, z: myPlayer.z, rotation: myPlayer.rotation, name: myPlayer.name });
  });

  // keyboard secret 9 = saber
  window.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
    if (e.key === '9') triggerSaber();
  });
  window.addEventListener('keyup', (e) => keys[e.key.toLowerCase()] = false);

  // menu button - toggling options panel
  const menuBtn = document.getElementById('menuButton');
  const optionsPanel = document.getElementById('optionsPanel');
  if (menuBtn && optionsPanel) {
    menuBtn.addEventListener('click', () => optionsPanel.classList.toggle('hidden'));
    document.getElementById('closeOptions').addEventListener('click', ()=> optionsPanel.classList.add('hidden'));
    document.getElementById('optControlSelect').addEventListener('change', (e)=> applyControlPreset(e.target.value));
    document.getElementById('brightness').addEventListener('input', (e)=> {
      const v = parseFloat(e.target.value);
      scene.traverse(obj => { if (obj.isLight && obj.userData.baseIntensity) obj.intensity = obj.userData.baseIntensity * v; });
    });
  }
}

// ---------- SCENE Initialization ----------
function initScene(){
  // renderer + camera + scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe8f6ff); // helle Coruscant-Stimmung

  camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 8000);
  camera.position.set(0, myPlayer.y + 1.6, 0);

  renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas'), antialias:true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;

  clock = new THREE.Clock();

  // Licht (hell)
  const hemi = new THREE.HemisphereLight(0xfff4e0, 0x444455, 0.95); hemi.userData.baseIntensity = 0.95; scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(180, 400, 120); sun.castShadow = true; sun.userData.baseIntensity = 1.6; scene.add(sun);
  const amb = new THREE.AmbientLight(0xffffff, 0.45); amb.userData.baseIntensity = 0.45; scene.add(amb);

  // Boden (groß)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(16000,16000), new THREE.MeshStandardMaterial({ color:0x0d1722, metalness:0.18, roughness:0.7 }));
  ground.rotation.x = -Math.PI/2; ground.receiveShadow = true; scene.add(ground);

  // Crosshair visual
  const cross = document.getElementById('crosshair');
  if (cross) { cross.style.pointerEvents = 'none'; cross.style.filter = 'drop-shadow(0 0 8px rgba(255,220,160,0.6))'; }

  // City generation
  generateCityLarge();

  // instanced decor for distant buildings (performance)
  generateInstancedDecor(INSTANCED_DECOR_COUNT);

  // load humanoid model (for remote avatars) asynchronously
  if (USE_REMOTE_MODEL) ensureGLTFLoader().then(() => {
    attemptLoadHumanoidModel();
  }).catch(err => {
    console.warn('GLTFLoader import failed, falling back to capsule avatars.', err);
  });

  // controls & UI wiring
  setupControls();

  // socket listeners
  setupSocketHandlers();

  // nice load screen progress simulation
  simulateLoadProgressAndHide();

  // resize handling
  window.addEventListener('resize', ()=> {
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // animate loop
  animate();
}

// ---------- Dynamic import GLTFLoader ----------
async function ensureGLTFLoader(){
  if (GLTFLoaderClass) return GLTFLoaderClass;
  // dynamic import from jsDelivr/UNPKG
  const mod = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js');
  GLTFLoaderClass = mod.GLTFLoader;
  return GLTFLoaderClass;
}

// ---------- Try load humanoid model for remote players ----------
let humanoidGLB = null;
async function attemptLoadHumanoidModel(){
  try {
    const Loader = GLTFLoaderClass;
    const loader = new Loader();
    loader.load(MODEL_PATH, (gltf) => {
      humanoidGLB = gltf.scene;
      console.log('Humanoid GLB loaded.');
    }, undefined, (err) => {
      console.warn('Failed to load humanoid glb:', err);
      humanoidGLB = null;
    });
  } catch(e){
    console.warn('GLB load error', e);
    humanoidGLB = null;
  }
}

// ---------- City generation (interactive and decorative) ----------
function generateCityLarge(){
  // Interactive buildings are added by server; here create some big decorative landmarks
  for (let i=0;i<8;i++){
    const w = 80 + Math.random()*220, d = 80 + Math.random()*220, h = 80 + Math.random()*400;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.62 + Math.random()*0.06, 0.28, 0.36 + Math.random()*0.12), metalness:0.7, roughness:0.3 }));
    m.position.set((Math.random()*2-1)*CITY_SPREAD*0.8, h/2, (Math.random()*2-1)*CITY_SPREAD*0.8);
    m.castShadow = true; scene.add(m);
  }
  // leave roads every few grid cells by simply not filling them in instanced decor
}

function generateInstancedDecor(count=1000){
  // Many small towers as instancing — cheap and pretty
  const geo = new THREE.BoxGeometry(1,1,1);
  const mat = new THREE.MeshStandardMaterial({ color:0x88bbff, metalness:0.55, roughness:0.5 });
  const inst = new THREE.InstancedMesh(geo, mat, count);
  inst.castShadow = false; inst.receiveShadow = false;
  const spread = CITY_SPREAD;
  const tmpMat = new THREE.Matrix4();
  let idx=0;
  for (let i=0;i<count;i++){
    const px = Math.floor((Math.random()*2-1) * spread);
    const pz = Math.floor((Math.random()*2-1) * spread);
    const sx = 8 + Math.random()*32;
    const sz = 8 + Math.random()*32;
    const h = 20 + Math.random()*260;
    tmpMat.compose(new THREE.Vector3(px, h/2, pz), new THREE.Quaternion(), new THREE.Vector3(sx,h,sz));
    inst.setMatrixAt(idx++, tmpMat);
  }
  scene.add(inst);
  instancedDecor = inst;
}

// ---------- Controls (joystick left, right swipe, hud buttons, keyboard fallback) ----------
function setupControls(){
  // left joystick (nipplejs)
  const leftZone = document.getElementById('joystickLeft');
  const rightZone = document.getElementById('rightTouch');
  try {
    const leftJoy = nipplejs.create({ zone: leftZone, mode: 'static', position: { left: '80px', bottom: '80px' }, size: 120 });
    leftJoy.on('move', (evt, data) => { if (!data) return; move.x = data.vector.x; move.z = -data.vector.y; });
    leftJoy.on('end', () => { move.x = 0; move.z = 0; });
  } catch(e){ console.warn('nipplejs missing or failed', e); }

  // right swipe area for look
  if (rightZone) {
    rightZone.style.touchAction = 'none';
    let touching=false, last=null;
    rightZone.addEventListener('touchstart', (e)=>{ touching=true; last = e.touches[0]; }, {passive:false});
    rightZone.addEventListener('touchmove', (e)=>{ if(!touching) return; const t = e.touches[0]; const dx=(t.clientX-last.clientX)/window.innerWidth; const dy=(t.clientY-last.clientY)/window.innerHeight; look.x = dx*6; look.y = dy*6; last=t; e.preventDefault(); }, {passive:false});
    rightZone.addEventListener('touchend', ()=>{ touching=false; look.x=0; look.y=0; });
  }

  // mouse look on right-half screen
  let mouseDown=false, lastMouse=null;
  window.addEventListener('mousedown', (e)=>{ if (e.clientX > window.innerWidth/2) { mouseDown=true; lastMouse=e; }});
  window.addEventListener('mousemove', (e)=>{ if(!mouseDown || !lastMouse) return; const dx=(e.clientX-lastMouse.clientX)/window.innerWidth; const dy=(e.clientY-lastMouse.clientY)/window.innerHeight; look.x = dx*6; look.y = dy*6; lastMouse=e; });
  window.addEventListener('mouseup', ()=>{ mouseDown=false; look.x=0; look.y=0; lastMouse=null; });

  // HUD buttons for jet & shoot
  const jetUp = document.getElementById('jetUpBtn');
  const jetDown = document.getElementById('jetDownBtn');
  const shoot = document.getElementById('shootBtn');
  const hold = { up:false, down:false };
  if (jetUp){ jetUp.addEventListener('touchstart', (e)=>{ hold.up=true; e.preventDefault(); }, {passive:false}); jetUp.addEventListener('touchend', ()=>hold.up=false); jetUp.addEventListener('mousedown', ()=>hold.up=true); jetUp.addEventListener('mouseup', ()=>hold.up=false); }
  if (jetDown){ jetDown.addEventListener('touchstart', (e)=>{ hold.down=true; e.preventDefault(); }, {passive:false}); jetDown.addEventListener('touchend', ()=>hold.down=false); jetDown.addEventListener('mousedown', ()=>hold.down=true); jetDown.addEventListener('mouseup', ()=>hold.down=false); }
  if (shoot){ shoot.addEventListener('touchstart', (e)=>{ e.preventDefault(); fireDoubleLaser(); }, {passive:false}); shoot.addEventListener('mousedown', ()=> fireDoubleLaser()); }

  setupControls.hold = hold;

  // keyboard fallback
  window.addEventListener('keydown', (e)=> { keys[e.key.toLowerCase()] = true; if (e.key === ' ') e.preventDefault(); });
  window.addEventListener('keyup', (e)=> keys[e.key.toLowerCase()] = false);
}

// apply control preset from options
function applyControlPreset(mode){
  const leftZone = document.getElementById('joystickLeft');
  const rightZone = document.getElementById('rightTouch');
  const hud = document.getElementById('hud');
  if (mode === 'keyboard') { if (leftZone) leftZone.style.display='none'; if (rightZone) rightZone.style.display='none'; if (hud) hud.style.display='flex'; }
  else if (mode === 'ipad') { if (leftZone) leftZone.style.display='block'; if (rightZone) rightZone.style.display='block'; if (hud) hud.style.display='flex'; }
  else { if (leftZone) leftZone.style.display='none'; if (rightZone) rightZone.style.display='none'; if (hud) hud.style.display='flex'; }
}

// ---------- Socket handlers ----------
function setupSocketHandlers(){
  socket.on('currentPlayers', (serverPlayers) => {
    players = serverPlayers;
    for (let id in players) { if (id !== socket.id) createRemoteAvatar(id, players[id]); else { myPlayer.id = id; } }
  });

  socket.on('newPlayer', ({ id, data }) => createRemoteAvatar(id, data));
  socket.on('playerMoved', ({ id, data }) => {
    if (players[id]) { Object.assign(players[id], data); if (players[id].mesh) players[id].mesh.position.set(data.x, data.y, data.z); if (players[id].nameSprite) players[id].nameSprite.position.set(data.x, data.y+2.4, data.z); }
  });
  socket.on('playerDisconnected', id => { if (players[id] && players[id].mesh) scene.remove(players[id].mesh); if (players[id] && players[id].nameSprite) scene.remove(players[id].nameSprite); delete players[id]; });

  socket.on('initBuildings', (bldArr) => {
    // server-provided interactive buildings (object with id,x,z,width,depth,height,hp)
    for (let b of bldArr) addInteractiveBuilding(b);
  });

  socket.on('buildingHit', ({ id, hp }) => {
    const m = interactiveBuildings.find(x => x.userData && x.userData.serverId === id);
    if (m) { m.userData.hp = hp; if (m.material) m.material.color.offsetHSL(0,0,-0.03); }
  });

  socket.on('buildingDestroy', ({ id }) => {
    const idx = interactiveBuildings.findIndex(x => x.userData && x.userData.serverId === id);
    if (idx !== -1) { scene.remove(interactiveBuildings[idx]); interactiveBuildings.splice(idx,1); }
  });

  socket.on('playerHit', ({ id, hp }) => {
    if (id === socket.id) { myPlayer.hp = hp; /* show UI feedback if implemented */ } else if (players[id]) players[id].hp = hp;
  });

  // remote shoot -> spawn beam visual
  socket.on('shoot', (data) => {
    const origin = new THREE.Vector3(data.pos.x, data.pos.y, data.pos.z);
    const dir = new THREE.Vector3(data.dir.x, data.dir.y, data.dir.z);
    spawnBeamVisual(origin, dir, 0xffaa66);
  });

  socket.on('saber', (data) => {
    const origin = new THREE.Vector3(data.pos.x, data.pos.y, data.pos.z);
    const dir = new THREE.Vector3(data.dir.x, data.dir.y, data.dir.z);
    spawnSaberVisual(origin, dir, 0x66ccff);
  });
}

// ---------- Interactive buildings (client-side mesh for server interactive objects) ----------
function addInteractiveBuilding(b) {
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.62, 0.25, 0.42), metalness:0.64, roughness:0.34 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.width, b.height, b.depth), mat);
  mesh.position.set(b.x, b.height/2, b.z);
  mesh.userData.hp = b.hp; mesh.userData.serverId = b.id;
  mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh);
  interactiveBuildings.push(mesh);
}

// ---------- Remote avatar creation (GLB if available, otherwise capsule) ----------
function createRemoteAvatar(id, data){
  if (!data) return;
  // attempt to use GLB if loaded
  if (humanoidGLB) {
    // clone gltf scene (fast shallow clone by clone(true) may duplicate materials; acceptable for now)
    const model = humanoidGLB.clone(true);
    model.traverse(node => { if (node.isMesh) node.castShadow = true; });
    model.position.set(data.x, data.y, data.z);
    scene.add(model);
    players[id] = Object.assign({}, data, { mesh: model, hp: data.hp || 100 });
    // name sprite
    const s = makeNameSprite(data.name || 'Spieler');
    s.position.set(data.x, data.y + 2.6, data.z);
    scene.add(s);
    players[id].nameSprite = s;
    return;
  }

  // fallback capsule
  const geo = new THREE.CapsuleGeometry(0.45, 1.0, 4, 8);
  const mat = new THREE.MeshStandardMaterial({ color: 0xff4444, metalness:0.35, roughness:0.5 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(data.x, data.y, data.z);
  mesh.castShadow = true; scene.add(mesh);
  players[id] = Object.assign({}, data, { mesh: mesh, hp: data.hp || 100 });
  const s = makeNameSprite(data.name || 'Spieler'); s.position.set(data.x, data.y+2.4, data.z); scene.add(s); players[id].nameSprite = s;
}

// make name sprite
function makeNameSprite(name){
  const canvas = document.createElement('canvas'); canvas.width=256; canvas.height=64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(10,10,20,0.6)'; ctx.fillRect(0,0,256,64);
  ctx.font = 'bold 26px Arial'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(name,128,40);
  const tex = new THREE.CanvasTexture(canvas); tex.needsUpdate=true;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
  const spr = new THREE.Sprite(mat); spr.scale.set(1.8,0.5,1); return spr;
}

// ---------- FIRST-PERSON ARMS (simple geometry attached to camera so you "feel" humanoid) ----------
let fpArms = null;
function buildFPArms(){
  // create a simple torso+arms rig attached to camera (visible in FP)
  const group = new THREE.Group();
  // torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.25), new THREE.MeshStandardMaterial({ color:0x334455, metalness:0.3, roughness:0.6 }));
  torso.position.set(0, -0.3, -0.4);
  group.add(torso);
  // left arm
  const larm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.6, 0.18), new THREE.MeshStandardMaterial({ color:0x223344 }));
  larm.position.set(-0.35, -0.45, -0.25); larm.rotation.z = 0.15; group.add(larm);
  // right arm (holds gun)
  const rarm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.6, 0.18), new THREE.MeshStandardMaterial({ color:0x223344 }));
  rarm.position.set(0.35, -0.45, -0.25); rarm.rotation.z = -0.15; group.add(rarm);
  // small "gun" meshes on arms
  const gunL = new THREE.Mesh(new THREE.BoxGeometry(0.12,0.08,0.28), new THREE.MeshStandardMaterial({ color:0x222222 }));
  gunL.position.set(-0.35, -0.7, -0.1); group.add(gunL);
  const gunR = gunL.clone(); gunR.position.set(0.35, -0.7, -0.1); group.add(gunR);

  // attach to camera
  camera.add(group);
  group.position.set(0, -0.1, 0);
  fpArms = group;
}

// ---------- Laser: Instant raycast + visual beam + impact particle ----------
function fireDoubleLaser(){
  const offs = [-0.28, 0.28];
  for (let off of offs){
    const origin = new THREE.Vector3().copy(camera.position);
    const right = new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion).normalize();
    origin.addScaledVector(right, off); origin.y -= 0.2;
    const dir = new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion).normalize();

    // client-side raycast to spawn immediate impact visuals
    raycaster.set(origin, dir);
    const possible = interactiveBuildings.concat(Object.values(players).map(p => p.mesh).filter(Boolean));
    const hits = raycaster.intersectObjects(possible, true);
    let hitPoint = null;
    if (hits.length > 0) {
      hitPoint = hits[0].point.clone();
      spawnImpactParticle(hitPoint);
    } else {
      hitPoint = origin.clone().add(dir.clone().multiplyScalar(1500));
    }

    spawnBeamVisual(origin, dir, 0xff4444, hitPoint);
    // emit to server for authoritative validation and for others to see beam
    socket.emit('shoot', { shooterId: socket.id, pos: { x: origin.x, y: origin.y, z: origin.z }, dir: { x: dir.x, y: dir.y, z: dir.z } });
  }
}

// visual beam
function spawnBeamVisual(origin, dir, color=0xff3333, explicitHitPoint=null){
  const length = explicitHitPoint ? origin.distanceTo(explicitHitPoint) : 1200;
  const geo = new THREE.CylinderGeometry(0.03, 0.03, length, 6, 1, true);
  const mat = new THREE.MeshBasicMaterial({ color: color, transparent:true, opacity:0.98, blending: THREE.AdditiveBlending, depthWrite:false });
  const mesh = new THREE.Mesh(geo, mat);
  const mid = origin.clone().add(dir.clone().multiplyScalar(length/2));
  mesh.position.copy(mid);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir.clone().normalize());
  mesh.userData.life = 0.08 + Math.random()*0.04;
  scene.add(mesh);
  beams.push(mesh);
}

// impact spark
function spawnImpactParticle(pos){
  const mat = new THREE.SpriteMaterial({ map: makeSparkTexture(), blending: THREE.AdditiveBlending, transparent:true });
  const s = new THREE.Sprite(mat);
  s.position.copy(pos); s.scale.set(1.2,1.2,1.2); s.userData.life = 0.35; scene.add(s); beams.push(s);
}
function makeSparkTexture(){
  const c = document.createElement('canvas'); c.width=64; c.height=64; const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32,32,2,32,32,32); g.addColorStop(0,'rgba(255,255,210,1)'); g.addColorStop(0.4,'rgba(255,140,40,0.9)'); g.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0,0,64,64);
  return new THREE.CanvasTexture(c);
}

// ---------- Saber (secret) ----------
function triggerSaber(){
  const origin = new THREE.Vector3().copy(camera.position);
  const dir = new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion).normalize();
  spawnSaberVisual(origin, dir, 0x66ccff);
  socket.emit('saber', { shooterId: socket.id, pos:{ x: origin.x, y: origin.y, z: origin.z }, dir:{ x: dir.x, y: dir.y, z: dir.z } });
}
function spawnSaberVisual(origin, dir, color){
  const len = 6; const geo = new THREE.CylinderGeometry(0.12,0.12,len,8,1,true);
  const mat = new THREE.MeshBasicMaterial({ color: color, transparent:true, opacity:0.98, blending: THREE.AdditiveBlending });
  const mesh = new THREE.Mesh(geo, mat);
  const mid = origin.clone().add(dir.clone().multiplyScalar(len/2)); mesh.position.copy(mid);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir.clone().normalize()); mesh.userData.life = 0.22; scene.add(mesh); beams.push(mesh);
}

// ---------- Jetpack physics & collision ----------
let jetVelLocal = 0;
function applyGravityAndJetpack(delta){
  const hold = setupControls && setupControls.hold ? setupControls.hold : { up:false, down:false };
  let thrust = 0;
  if (keys[' ']) thrust += JET_ACCEL;
  if (keys['shift']) thrust += JET_DOWN_ACCEL;
  if (hold.up) thrust += JET_ACCEL;
  if (hold.down) thrust += JET_DOWN_ACCEL;

  jetVelLocal += (thrust + GRAVITY) * delta;
  if (jetVelLocal > MAX_JET_SPEED) jetVelLocal = MAX_JET_SPEED;
  if (jetVelLocal < -MAX_JET_SPEED * 1.5) jetVelLocal = -MAX_JET_SPEED * 1.5;
  myPlayer.y += jetVelLocal * delta;

  if (myPlayer.y < 1.2) { myPlayer.y = 1.2; jetVelLocal = 0; }

  if (!hold.up && !hold.down && !keys[' '] && !keys['shift']) jetVelLocal *= 0.985;
}

function checkBuildingCollision(){
  const playerBox = new THREE.Box3(new THREE.Vector3(myPlayer.x - 0.35, myPlayer.y - 1.6, myPlayer.z - 0.35), new THREE.Vector3(myPlayer.x + 0.35, myPlayer.y + 1.6, myPlayer.z + 0.35));
  for (let b of interactiveBuildings) {
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

// ---------- Load progress simulation ----------
function simulateLoadProgressAndHide(){
  const prog = document.getElementById('loaderProgress');
  if (!prog) { if (loadscreen) loadscreen.style.display='none'; return; }
  let p = 10;
  const t = setInterval(()=> {
    p = Math.min(100, p + Math.random()*18);
    prog.style.width = p + '%';
    if (p >= 100) { clearInterval(t); setTimeout(()=>{ if (loadscreen) loadscreen.style.display='none'; }, 420); }
  }, 240);
}

// ---------- Animate loop ----------
function animate(){
  requestAnimationFrame(animate);
  const delta = Math.min(0.06, clock.getDelta());

  // update look (apply to yaw/pitch)
  myPlayer.rotation += look.x * 1.6 * delta;
  myPlayer.pitch = (myPlayer.pitch || 0) + (-look.y * 1.6 * delta);
  myPlayer.pitch = Math.max(-Math.PI/3, Math.min(Math.PI/3, myPlayer.pitch));
  look.x *= 0.35; look.y *= 0.35;

  // movement relative to yaw
  const forward = new THREE.Vector3(Math.sin(myPlayer.rotation), 0, -Math.cos(myPlayer.rotation));
  const right = new THREE.Vector3(forward.z, 0, -forward.x);
  const speed = 10;
  if (keys['w']) move.z = -1; else if (keys['s']) move.z = 1;
  if (keys['a']) move.x = -1; else if (keys['d']) move.x = 1;

  tmpV.set(0,0,0);
  tmpV.addScaledVector(forward, move.z * speed * delta);
  tmpV.addScaledVector(right, move.x * speed * delta);
  myPlayer.x += tmpV.x; myPlayer.z += tmpV.z;

  // jetpack + gravity
  applyGravityAndJetpack(delta);

  // collisions
  checkBuildingCollision();

  // camera and FP arms
  if (!fpArms) buildFPArms();
  camera.position.set(myPlayer.x, myPlayer.y + 1.6, myPlayer.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = myPlayer.rotation;
  camera.rotation.x = myPlayer.pitch;

  // beams life update
  for (let i = beams.length - 1; i >= 0; i--) {
    const b = beams[i];
    b.userData.life -= delta;
    if (b.userData.life <= 0) { scene.remove(b); beams.splice(i,1); }
    else if (b.material && b.material.opacity !== undefined) b.material.opacity = Math.max(0, b.userData.life / 0.22);
  }

  // update remote names
  for (let id in players) {
    const p = players[id];
    if (p && p.nameSprite) p.nameSprite.position.set(p.x, p.y + 2.4, p.z);
  }

  // send movement periodically
  socket.emit('playerMovement', { x: myPlayer.x, y: myPlayer.y, z: myPlayer.z, rotation: myPlayer.rotation });

  renderer.render(scene, camera);
}

// ---------- Helper: FP arms builder (attached to camera) ----------
function buildFPArms(){
  if (fpArms) return;
  fpArms = new THREE.Group();
  // simple torso + arms geometry (see earlier)
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5,0.7,0.25), new THREE.MeshStandardMaterial({ color:0x334455, metalness:0.25, roughness:0.6 }));
  torso.position.set(0, -0.3, -0.4); fpArms.add(torso);
  const larm = new THREE.Mesh(new THREE.BoxGeometry(0.16,0.6,0.16), new THREE.MeshStandardMaterial({ color:0x223344 })); larm.position.set(-0.33, -0.45, -0.25); larm.rotation.z = 0.12; fpArms.add(larm);
  const rarm = new THREE.Mesh(new THREE.BoxGeometry(0.16,0.6,0.16), new THREE.MeshStandardMaterial({ color:0x223344 })); rarm.position.set(0.33, -0.45, -0.25); rarm.rotation.z = -0.12; fpArms.add(rarm);
  const gunL = new THREE.Mesh(new THREE.BoxGeometry(0.12,0.07,0.26), new THREE.MeshStandardMaterial({ color:0x111111 })); gunL.position.set(-0.33, -0.7, -0.12); fpArms.add(gunL);
  const gunR = gunL.clone(); gunR.position.set(0.33, -0.7, -0.12); fpArms.add(gunR);

  camera.add(fpArms);
  fpArms.position.set(0,-0.1,0);
}

// ---------- END OF FILE ----------
