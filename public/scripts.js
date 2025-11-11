// ==========================
// Coruscant Flight Battle - scripts.js
// ==========================
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import nipplejs from 'https://cdn.jsdelivr.net/npm/nipplejs@0.9.0/dist/nipplejs.mjs';

let scene, camera, renderer, clock;
let myPlayer = { x:0, y:3, z:0, rotation:0, pitch:0 };
let move = { x:0, z:0 }, look = { x:0, y:0 };
let jetVelLocal = 0;
const GRAVITY = -18, JET_ACCEL = 28, JET_DOWN_ACCEL = -30, MAX_JET_SPEED = 12;
let keys = {}, fpArms = null, humanoidGLB = null;
let ships = [], loadProgress = 0;
const totalAssets = 2;

// ---------------- DOM ----------------
function initDomRefs() {
  window.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; });
  window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
}

// ---------------- LOAD SCREEN ----------------
function updateLoadBar() {
  const bar = document.getElementById('loadingBar');
  if (bar) bar.style.width = Math.floor((loadProgress / totalAssets) * 100) + '%';
}

function createShips(num=5) {
  const container = document.getElementById('loadscreen');
  for (let i=0; i<num; i++) {
    const img = document.createElement('img');
    img.src = '/assets/ship.png';
    img.style.position = 'absolute';
    img.style.top = (Math.random()*80)+'%';
    img.style.left = (-100)+'px';
    img.style.width = (30+Math.random()*40)+'px';
    container.appendChild(img);
    ships.push({ el: img, speed: 50+Math.random()*100 });
  }
}

function animateShips(delta) {
  ships.forEach(s=>{
    let left = parseFloat(s.el.style.left);
    left += s.speed * delta * 50;
    if(left > window.innerWidth) left = -100;
    s.el.style.left = left+'px';
  });
}

// ---------------- SCENE ----------------
async function initScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xb0d0ff);
  camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 8000);
  camera.position.set(0, myPlayer.y+1.6, 0);

  renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas'), antialias:true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  clock = new THREE.Clock();

  // Licht
  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(200,400,150);
  sun.castShadow = true;
  scene.add(sun);

  // Boden
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(16000,16000),
    new THREE.MeshStandardMaterial({ color:0x1b2430 })
  );
  ground.rotation.x = -Math.PI/2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Ladeanimation starten
  createShips(4);
  animateLoadscreen();

  // Assets laden
  await loadAssets();

  // Fertig geladen
  const ls = document.getElementById('loadscreen');
  ls.style.transition = 'opacity 0.8s';
  ls.style.opacity = '0';
  setTimeout(()=>{ ls.style.display='none'; startGame(); }, 1000);
}

function animateLoadscreen() {
  let last = performance.now();
  function loop(now) {
    const delta = (now-last)/1000;
    last = now;
    animateShips(delta);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

// ---------------- LOAD ASSETS ----------------
async function loadAssets() {
  const loader = new GLTFLoader();

  // Mandalorian Modell laden
  await new Promise((res, rej)=>{
    loader.load('/models/Mandalorian.glb', gltf=>{
      humanoidGLB = gltf.scene;
      humanoidGLB.scale.set(1,1,1);
      humanoidGLB.traverse(n=>{ if(n.isMesh){ n.castShadow=true; n.receiveShadow=true; }});
      loadProgress++; updateLoadBar(); res();
    }, 
    (xhr)=>{ updateLoadBar(); },
    (err)=>{ console.error(err); rej(); });
  });

  // Stadt generieren
  generateCityInstanced(600);
  loadProgress++; updateLoadBar();
}

function generateCityInstanced(numBuildings=600) {
  const geo = new THREE.BoxGeometry(1,1,1);
  const mat = new THREE.MeshStandardMaterial({ color:0xaaaaee, emissive:0x111155, metalness:0.7, roughness:0.4 });
  const inst = new THREE.InstancedMesh(geo, mat, numBuildings);
  const tmp = new THREE.Matrix4();

  for(let i=0;i<numBuildings;i++){
    const x=(Math.random()*2-1)*2000;
    const z=(Math.random()*2-1)*2000;
    const w=40+Math.random()*120, d=40+Math.random()*120, h=100+Math.random()*600;
    tmp.compose(new THREE.Vector3(x,h/2,z), new THREE.Quaternion(), new THREE.Vector3(w,h,d));
    inst.setMatrixAt(i,tmp);
  }
  scene.add(inst);
}

// ---------------- CONTROLS ----------------
function setupControls() {
  const leftZone = document.getElementById('joystickLeft');
  const rightZone = document.getElementById('rightTouch');

  if(leftZone) {
    const leftJoy = nipplejs.create({ zone:leftZone, mode:'static', position:{ left:'80px', bottom:'80px' }, size:120 });
    leftJoy.on('move',(evt,data)=>{ if(!data)return; move.x=data.vector.x; move.z=-data.vector.y; });
    leftJoy.on('end',()=>{ move.x=0; move.z=0; });
  }

  if(rightZone){
    rightZone.style.touchAction='none';
    let touching=false,last=null;
    rightZone.addEventListener('touchstart',(e)=>{ touching=true; last=e.touches[0]; });
    rightZone.addEventListener('touchmove',(e)=>{
      if(!touching) return;
      const t=e.touches[0];
      look.x=(t.clientX-last.clientX)/window.innerWidth*6;
      look.y=(t.clientY-last.clientY)/window.innerHeight*6;
      last=t;
    },{passive:false});
    rightZone.addEventListener('touchend',()=>{ touching=false; look.x=0; look.y=0; });
  }
}

// ---------------- ANIMATION ----------------
function startGame() {
  setupControls();
  animate();
}

const tmpV = new THREE.Vector3();

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(0.06, clock.getDelta());

  // Bewegung & Jetpack
  const forward = new THREE.Vector3(Math.sin(myPlayer.rotation),0,-Math.cos(myPlayer.rotation));
  const right = new THREE.Vector3(forward.z,0,-forward.x);
  tmpV.set(0,0,0);
  tmpV.addScaledVector(forward, move.z*10*delta);
  tmpV.addScaledVector(right, move.x*10*delta);
  myPlayer.x += tmpV.x; myPlayer.z += tmpV.z;

  applyJetpack(delta);

  // Kamera
  camera.position.set(myPlayer.x, myPlayer.y+1.6, myPlayer.z);
  camera.rotation.order='YXZ';
  camera.rotation.y += look.x * delta * 3;
  camera.rotation.x += -look.y * delta * 3;

  renderer.render(scene,camera);
}

// ---------------- JETPACK ----------------
function applyJetpack(delta) {
  let thrust = 0;
  if(keys[' ']) thrust += JET_ACCEL;
  if(keys['shift']) thrust += JET_DOWN_ACCEL;
  jetVelLocal += (thrust + GRAVITY) * delta;
  jetVelLocal = Math.max(-MAX_JET_SPEED, Math.min(MAX_JET_SPEED, jetVelLocal));
  myPlayer.y += jetVelLocal * delta;
  if(myPlayer.y < 1.2){ myPlayer.y = 1.2; jetVelLocal = 0; }
}

// ---------------- START ----------------
initDomRefs();
initScene();
