const socket = io();
let scene, camera, renderer, clock;
let players = {};
let myPlayer = { x: 0, y: 1, z: 0, rotation: 0 };
let bullets = [];

init();
animate();

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
    camera.position.set(0, 2, 5);

    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas') });
    renderer.setSize(window.innerWidth, window.innerHeight);

    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(10, 10, 10);
    scene.add(light);

    const floorGeometry = new THREE.PlaneGeometry(200, 200);
    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x555555 });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    // Einfache Gebäude (City Blocks)
    for(let i=-50; i<=50; i+=20){
        for(let j=-50; j<=50; j+=20){
            if(Math.random() > 0.5){
                let h = Math.random() * 15 + 5;
                const geo = new THREE.BoxGeometry(10, h, 10);
                const mat = new THREE.MeshStandardMaterial({ color: 0x888888 });
                const bld = new THREE.Mesh(geo, mat);
                bld.position.set(i, h/2, j);
                scene.add(bld);
            }
        }
    }

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    setupMobileControls();

    clock = new THREE.Clock();

    socket.on('currentPlayers', (serverPlayers) => {
        players = serverPlayers;
        for (let id in players) if (id !== socket.id) addOtherPlayer(id, players[id]);
    });

    socket.on('newPlayer', ({ id, data }) => addOtherPlayer(id, data));
    socket.on('playerMoved', ({ id, data }) => updatePlayer(id, data));
    socket.on('playerDisconnected', (id) => removePlayer(id));
}

function addOtherPlayer(id, data){
    const geometry = new THREE.BoxGeometry(1, 2, 1);
    const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(data.x, data.y, data.z);
    scene.add(mesh);
    players[id].mesh = mesh;
}

function updatePlayer(id, data){
    if(players[id] && players[id].mesh){
        players[id].mesh.position.set(data.x, data.y, data.z);
        players[id].mesh.rotation.y = data.rotation;
    }
}

function removePlayer(id){
    if(players[id] && players[id].mesh) scene.remove(players[id].mesh);
    delete players[id];
}

let keys = {};
function handleKeyDown(e){ keys[e.key.toLowerCase()] = true; }
function handleKeyUp(e){ keys[e.key.toLowerCase()] = false; }

function setupMobileControls(){
    const map = { up:'w', down:'s', left:'a', right:'d', jetpack:' ', shoot:'shoot' };
    Object.keys(map).forEach(id=>{
        const btn = document.getElementById(id);
        btn.addEventListener('touchstart', ()=>keys[map[id]] = true);
        btn.addEventListener('touchend', ()=>keys[map[id]] = false);
    });
}

function shootBullet(){
    const bulletGeo = new THREE.SphereGeometry(0.1,8,8);
    const bulletMat = new THREE.MeshBasicMaterial({color:0xffff00});
    const bullet = new THREE.Mesh(bulletGeo, bulletMat);
    bullet.position.set(myPlayer.x, myPlayer.y+1, myPlayer.z);
    bullet.velocity = new THREE.Vector3(0,0,-1).applyEuler(camera.rotation).multiplyScalar(50);
    bullets.push(bullet);
    scene.add(bullet);
}

function animate(){
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    // Bewegung
    if(keys['w']) myPlayer.z -= 10*delta;
    if(keys['s']) myPlayer.z += 10*delta;
    if(keys['a']) myPlayer.x -= 10*delta;
    if(keys['d']) myPlayer.x += 10*delta;
    if(keys[' ']) myPlayer.y += 10*delta; // Jetpack hoch
    if(keys['shift']) myPlayer.y -= 10*delta; // Jetpack runter

    // Schießen
    if(keys['shoot']){
        shootBullet();
        keys['shoot'] = false;
    }

    // Update Bullets
    bullets.forEach((b,i)=>{
        b.position.add(b.velocity.clone().multiplyScalar(delta));
        if(b.position.length() > 200){ // entfernen außerhalb
            scene.remove(b);
            bullets.splice(i,1);
        }
    });

    camera.position.set(myPlayer.x, myPlayer.y+1, myPlayer.z+5);
    camera.lookAt(myPlayer.x, myPlayer.y, myPlayer.z);

    socket.emit('playerMovement', myPlayer);

    renderer.render(scene, camera);
}
