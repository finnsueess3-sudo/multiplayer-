// ----------------------------
// scripts.js - Komplett Version
// ----------------------------
import * as THREE from 'three';
import nipplejs from 'nipplejs';

const MODEL_PATH = '/models/Mandalorian.glb';
let humanoidGLB = null;

// ---------------- Scene ----------------
let scene, camera, renderer, clock;
let players = {}, beams = [], fpArms = null;
let myPlayer = {x:0,y:3,z:0,rotation:0,pitch:0,name:'Spieler',hp:100,id:null};
let move = {x:0,z:0}, look = {x:0,y:0};
let jetVelLocal = 0;
const GRAVITY=-18, JET_ACCEL=28, JET_DOWN_ACCEL=-30, MAX_JET_SPEED=12;
let keys = {};

// ---------------- Loadscreen ----------------
let loadProgress = 0, totalAssets = 2; // GLB + City
let ships = [];

// ---------------- DOM ----------------
function initDomRefs() {
  const usernameModal=document.getElementById('usernameModal');
  const usernameInput=document.getElementById('usernameInput');
  const startBtn=document.getElementById('startBtn');

  startBtn.addEventListener('click', ()=>{
    myPlayer.name=(usernameInput.value||'Spieler').trim().substring(0,16);
    usernameModal.style.display='none';
  });

  window.addEventListener('keydown', e=>{ keys[e.key.toLowerCase()]=true; if(e.key==='9') triggerSaber(); });
  window.addEventListener('keyup', e=>{ keys[e.key.toLowerCase()]=false; });
}

// ---------------- Init Scene ----------------
async function initScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xb0e0ff);

  camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 8000);
  camera.position.set(0,myPlayer.y+1.6,0);

  renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas'), antialias:true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;

  clock = new THREE.Clock();

  // Licht
  const hemi = new THREE.HemisphereLight(0xfff4e0,0x444455,0.95); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff,1.6); sun.position.set(180,400,120); sun.castShadow=true; scene.add(sun);
  const amb = new THREE.AmbientLight(0xffffff,0.45); scene.add(amb);

  // Boden
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(16000,16000), new THREE.MeshStandardMaterial({ color:0x0d1722, metalness:0.18, roughness:0.7 }));
  ground.rotation.x=-Math.PI/2; ground.receiveShadow=true; scene.add(ground);

  // Stadt
  generateCityInstanced(600);

  // Mandalorian
  await loadMandalorianModel();

  // Controls
  setupControls();

  // Ladeanimation
  createShips(5);
  simulateLoadProgressAndHide();

  window.addEventListener('resize',()=>{
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  animate();
}

// ---------------- Mandalorian GLB ----------------
async function loadMandalorianModel(){
  const mod = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js');
  const loader = new mod.GLTFLoader();
  loader.load(MODEL_PATH,(gltf)=>{
    humanoidGLB=gltf.scene;
    humanoidGLB.scale.set(0.8,0.8,0.8);
    humanoidGLB.traverse(n=>{ if(n.isMesh){ n.castShadow=true; n.receiveShadow=true; } });
    loadProgress++; updateLoadBar();
  },undefined,(err)=>{ console.warn(err); loadProgress++; updateLoadBar(); humanoidGLB=null; });
}

// ---------------- Instanced City ----------------
function generateCityInstanced(numBuildings=600){
  const geo = new THREE.BoxGeometry(1,1,1);
  const mat = new THREE.MeshStandardMaterial({ color:0x9999ff, metalness:0.7, roughness:0.4 });
  const inst = new THREE.InstancedMesh(geo, mat, numBuildings);
  const tmpMat = new THREE.Matrix4();

  for(let i=0;i<numBuildings;i++){
    const x=(Math.random()*2-1)*2000;
    const z=(Math.random()*2-1)*2000;
    const w=40+Math.random()*120, d=40+Math.random()*120, h=100+Math.random()*600;
    tmpMat.compose(new THREE.Vector3(x,h/2,z), new THREE.Quaternion(), new THREE.Vector3(w,h,d));
    inst.setMatrixAt(i,tmpMat);
  }
  scene.add(inst);
  loadProgress++; updateLoadBar();
}

// ---------------- Loadbar ----------------
function updateLoadBar(){
  const bar = document.getElementById('loadingBar');
  if(bar) bar.style.width = Math.floor((loadProgress/totalAssets)*100) + '%';
}

function simulateLoadProgressAndHide(){
  const interval = setInterval(()=>{
    updateLoadBar();
    if(loadProgress>=totalAssets){ clearInterval(interval);
      const ls = document.getElementById('loadscreen');
      if(ls){ ls.style.transition='opacity 0.8s'; ls.style.opacity='0'; setTimeout(()=>{ ls.style.display='none'; },900); }
    }
  },50);
}

// ---------------- Ships Animation ----------------
function createShips(num=5){
  const container=document.getElementById('loadscreen');
  for(let i=0;i<num;i++){
    const img=document.createElement('img');
    img.src='/assets/ship.png';
    img.style.position='absolute';
    img.style.top=(Math.random()*80)+'%';
    img.style.left=(-100)+'px';
    img.style.width=(30+Math.random()*40)+'px';
    img.style.zIndex=9999;
    container.appendChild(img);
    ships.push({el:img, speed:50+Math.random()*100});
  }
}

function animateShips(delta){
  ships.forEach(s=>{
    let left=parseFloat(s.el.style.left);
    left += s.speed*delta;
    if(left>window.innerWidth) left=-100;
    s.el.style.left=left+'px';
  });
}

// ---------------- Controls ----------------
function setupControls(){
  // Linker Joystick
  const leftZone=document.getElementById('joystickLeft');
  if(leftZone){
    const leftJoy=nipplejs.create({ zone:leftZone, mode:'static', position:{ left:'80px', bottom:'80px' }, size:120 });
    leftJoy.on('move',(evt,data)=>{ if(!data)return; move.x=data.vector.x; move.z=-data.vector.y; });
    leftJoy.on('end',()=>{ move.x=0; move.z=0; });
  }

  // Rechter Touch (Kamera)
  const rightZone=document.getElementById('rightTouch');
  if(rightZone){
    rightZone.style.touchAction='none';
    let touching=false,last=null;
    rightZone.addEventListener('touchstart',(e)=>{ touching=true; last=e.touches[0]; },{passive:false});
    rightZone.addEventListener('touchmove',(e)=>{
      if(!touching) return;
      const t=e.touches[0];
      const dx=(t.clientX-last.clientX)/window.innerWidth;
      const dy=(t.clientY-last.clientY)/window.innerHeight;
      look.x=dx*6; look.y=dy*6;
      last=t; e.preventDefault();
    },{passive:false});
    rightZone.addEventListener('touchend',()=>{ touching=false; look.x=0; look.y=0; });
  }

  // Jet & Shoot Buttons
  const jetUp=document.getElementById('jetUpBtn');
  const jetDown=document.getElementById('jetDownBtn');
  const shoot=document.getElementById('shootBtn');
  const hold={ up:false, down:false };
  if(jetUp){ jetUp.addEventListener('touchstart',()=>hold.up=true,{passive:false}); jetUp.addEventListener('touchend',()=>hold.up=false); jetUp.addEventListener('mousedown',()=>hold.up=true); jetUp.addEventListener('mouseup',()=>hold.up=false); }
  if(jetDown){ jetDown.addEventListener('touchstart',()=>hold.down=true,{passive:false}); jetDown.addEventListener('touchend',()=>hold.down=false); jetDown.addEventListener('mousedown',()=>hold.down=true); jetDown.addEventListener('mouseup',()=>hold.down=false); }
  if(shoot){ shoot.addEventListener('touchstart',(e)=>{ e.preventDefault(); fireDoubleLaser(); },{passive:false}); shoot.addEventListener('mousedown',()=>fireDoubleLaser()); }
  setupControls.hold=hold;
}

// ---------------- Animate Loop ----------------
const tmpV=new THREE.Vector3();
function animate(){
  requestAnimationFrame(animate);
  const delta=Math.min(0.06, clock.getDelta());

  animateShips(delta);

  // Look
  myPlayer.rotation += look.x*1.6*delta;
  myPlayer.pitch = (myPlayer.pitch||0) + (-look.y*1.6*delta);
  myPlayer.pitch=Math.max(-Math.PI/3, Math.min(Math.PI/3, myPlayer.pitch));
  look.x*=0.35; look.y*=0.35;

  // Bewegung
  const forward = new THREE.Vector3(Math.sin(myPlayer.rotation),0,-Math.cos(myPlayer.rotation));
  const right = new THREE.Vector3(forward.z,0,-forward.x);
  const speed=10;
  tmpV.set(0,0,0); tmpV.addScaledVector(forward, move.z*speed*delta); tmpV.addScaledVector(right, move.x*speed*delta);
  myPlayer.x+=tmpV.x; myPlayer.z+=tmpV.z;

  // Jetpack
  applyJetpack(delta);

  // Kamera
  if(!fpArms) buildFPArms();
  camera.position.set(myPlayer.x,myPlayer.y+1.6,myPlayer.z);
  camera.rotation.order='YXZ';
  camera.rotation.y=myPlayer.rotation;
  camera.rotation.x=myPlayer.pitch;

  renderer.render(scene,camera);
}

// ---------------- Jetpack ----------------
function applyJetpack(delta){
  const hold=setupControls.hold||{ up:false, down:false };
  let thrust=0; if(keys[' ']||hold.up) thrust+=JET_ACCEL; if(keys['shift']||hold.down) thrust+=JET_DOWN_ACCEL;
  jetVelLocal+=(thrust+GRAVITY)*delta;
  jetVelLocal=Math.min(jetVelLocal, MAX_JET_SPEED); if(jetVelLocal<-MAX_JET_SPEED*1.5) jetVelLocal=-MAX_JET_SPEED*1.5;
  myPlayer.y += jetVelLocal*delta;
  if(myPlayer.y<1.2){ myPlayer.y=1.2; jetVelLocal=0; }
  if(!hold.up&&!hold.down&&!keys[' ']&&!keys['shift']) jetVelLocal*=0.985;
}

// ---------------- FP-Arms, Doppelblaster, Saber ----------------
function buildFPArms(){ /* FP-Arms Code hier */ }
function fireDoubleLaser(){ /* Doppelblaster Code hier */ }
function triggerSaber(){ /* Secret Saber Code hier */ }

// ---------------- Start ----------------
initDomRefs();
initScene();
