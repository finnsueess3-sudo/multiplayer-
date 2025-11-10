// scripts.js - Komplett + optimiert
import * as THREE from 'three';
import nipplejs from 'nipplejs';

const MODEL_PATH = '/models/Mandalorian.glb';
let humanoidGLB = null;
let scene, camera, renderer, clock;
let players={}, beams=[], fpArms=null;
let myPlayer={x:0,y:3,z:0,rotation:0,pitch:0,name:'Spieler',hp:100,id:null};
let move={x:0,z:0}, look={x:0,y:0};
let jetVelLocal=0;
const GRAVITY=-18,JET_ACCEL=28,JET_DOWN_ACCEL=-30,MAX_JET_SPEED=12;
let keys={};
let loadProgress=0, totalAssets=2; // GLB + City

// ------------------ DOM ------------------
function initDomRefs(){
  const loadscreen=document.getElementById('loadscreen');
  const usernameModal=document.getElementById('usernameModal');
  const usernameInput=document.getElementById('usernameInput');
  const startBtn=document.getElementById('startBtn');

  startBtn.addEventListener('click', ()=>{
    myPlayer.name=(usernameInput.value||'Spieler').trim().substring(0,16);
    usernameModal.style.display='none';
  });

  window.addEventListener('keydown',e=>{ keys[e.key.toLowerCase()]=true; if(e.key==='9') triggerSaber(); });
  window.addEventListener('keyup',e=>{ keys[e.key.toLowerCase()]=false; });
}

// ------------------ Scene ------------------
async function initScene(){
  scene=new THREE.Scene();
  scene.background=new THREE.Color(0xb0e0ff);

  camera=new THREE.PerspectiveCamera(75,window.innerWidth/window.innerHeight,0.1,8000);
  camera.position.set(0,myPlayer.y+1.6,0);

  renderer=new THREE.WebGLRenderer({canvas:document.getElementById('gameCanvas'),antialias:true});
  renderer.setPixelRatio(window.devicePixelRatio||1);
  renderer.setSize(window.innerWidth,window.innerHeight);
  renderer.shadowMap.enabled=true;

  clock=new THREE.Clock();

  const hemi=new THREE.HemisphereLight(0xfff4e0,0x444455,0.95); hemi.userData.baseIntensity=0.95; scene.add(hemi);
  const sun=new THREE.DirectionalLight(0xffffff,1.6); sun.position.set(180,400,120); sun.castShadow=true; sun.userData.baseIntensity=1.6; scene.add(sun);
  const amb=new THREE.AmbientLight(0xffffff,0.45); amb.userData.baseIntensity=0.45; scene.add(amb);

  const ground=new THREE.Mesh(new THREE.PlaneGeometry(16000,16000), new THREE.MeshStandardMaterial({color:0x0d1722,metalness:0.18,roughness:0.7}));
  ground.rotation.x=-Math.PI/2; ground.receiveShadow=true; scene.add(ground);

  generateCityInstanced(600);
  await loadMandalorianModel();
  setupControls();
  simulateLoadProgressAndHide();
  window.addEventListener('resize',()=>{camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();renderer.setSize(window.innerWidth,window.innerHeight);});
  animate();
}

// ------------------ Mandalorian ------------------
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

// ------------------ Instanced City ------------------
function generateCityInstanced(numBuildings=600){
  const geo=new THREE.BoxGeometry(1,1,1);
  const mat=new THREE.MeshStandardMaterial({color:0x9999ff,metalness:0.7,roughness:0.4});
  const inst=new THREE.InstancedMesh(geo,mat,numBuildings);
  const tmpMat=new THREE.Matrix4();
  for(let i=0;i<numBuildings;i++){
    const x=(Math.random()*2-1)*2000;
    const z=(Math.random()*2-1)*2000;
    const w=40+Math.random()*120, d=40+Math.random()*120, h=100+Math.random()*600;
    tmpMat.compose(new THREE.Vector3(x,h/2,z), new THREE.Quaternion(), new THREE.Vector3(w,h,d));
    inst.setMatrixAt(i,tmpMat);
  }
  scene.add(inst); loadProgress++; updateLoadBar();
}

// ------------------ Ladebalken ------------------
function updateLoadBar(){
  const bar=document.getElementById('loadingBar');
  if(bar) bar.style.width=Math.floor((loadProgress/totalAssets)*100)+'%';
}

function simulateLoadProgressAndHide(){
  const interval=setInterval(()=>{
    updateLoadBar();
    if(loadProgress>=totalAssets){ clearInterval(interval);
      const ls=document.getElementById('loadscreen'); if(ls){ ls.style.transition='opacity 0.8s'; ls.style.opacity='0'; setTimeout(()=>{ls.style.display='none';},900);}
    }
  },50);
}

// ------------------ Controls, FP-Arms, Jetpack, Laser etc ------------------
// [Hier alle vorherigen Funktionen einfügen: setupControls, animate, applyJetpack, buildFPArms, fireDoubleLaser, triggerSaber]

// ------------------ Start ------------------
initDomRefs();
initScene();
