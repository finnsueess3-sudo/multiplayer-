const socket = io();
let scene, camera, renderer, clock;
let players = {}, buildings = [], bullets = [];
let myPlayer = { x: 0, y: 2, z: 0, rotation: 0 };
let move = { x: 0, z: 0 }, look = { x: 0, y: 0 };
let jetpackVelocity = 0;
const jetpackAccel = 15;
const jetpackMaxSpeed = 10;
let loadscreen = document.getElementById('loadscreen');
let keys = {};

init();
animate();

function init() {
    // Szene und Kamera
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a); // dunkel, futuristisch
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.set(0, 10, 20);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas'), antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;

    // Licht
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(100, 200, 100);
    dirLight.castShadow = true;
    scene.add(dirLight);

    // Boden
    const floorGeo = new THREE.PlaneGeometry(1000, 1000);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Große futuristische Stadt generieren
    generateCity();

    // Joysticks
    const leftJoystick = nipplejs.create({ zone: document.getElementById('joystickLeft'), mode: 'static', position: { left: '50px', bottom: '50px' } });
    const rightJoystick = nipplejs.create({ zone: document.getElementById('joystickRight'), mode: 'static', position: { right: '50px', bottom: '50px' } });

    leftJoystick.on('move', (evt, data) => { move.x = data.vector.x; move.z = -data.vector.y; });
    leftJoystick.on('end', () => { move = { x: 0, z: 0 }; });
    rightJoystick.on('move', (evt, data) => { look.x = data.vector.x; look.y = data.vector.y; });
    rightJoystick.on('end', () => { look = { x: 0, y: 0 }; });

    // Buttons
    document.getElementById('shootBtn').addEventListener('touchstart', shootDoppelblaster);
    document.getElementById('jetpackBtn').addEventListener('touchstart', () => { jetpackVelocity += jetpackAccel * 0.1; });

    // Tasten für PC
    document.addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
    document.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

    clock = new THREE.Clock();

    // Socket.IO Events
    socket.on('currentPlayers', serverPlayers => {
        players = serverPlayers;
        for (let id in players) if (id !== socket.id) addOtherPlayer(id, players[id]);
    });
    socket.on('newPlayer', ({ id, data }) => addOtherPlayer(id, data));
    socket.on('playerMoved', ({ id, data }) => updatePlayer(id, data));
    socket.on('playerDisconnected', id => removePlayer(id));
    socket.on('currentBuildings', data => { buildings = data; buildings.forEach(addBuilding); });
    socket.on('bulletFired', ({ position, direction }) => addBullet(position, direction));

    // Loadscreen weg nach 2 Sekunden
    setTimeout(() => { loadscreen.style.display = 'none'; }, 2000);
}

// Stadt generieren
function generateCity() {
    const citySize = 400;
    const spacing = 20;

    for (let i = -citySize; i <= citySize; i += spacing) {
        for (let j = -citySize; j <= citySize; j += spacing) {
            if (Math.random() > 0.2) {
                let h = Math.random() * 50 + 10; // sehr hohe Gebäude
                const geo = new THREE.BoxGeometry(15, h, 15);
                const mat = new THREE.MeshStandardMaterial({ color: 0x5555ff, metalness: 0.4, roughness: 0.6 });
                const mesh = new THREE.Mesh(geo, mat);
                mesh.position.set(i, h / 2, j);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                scene.add(mesh);
                buildings.push({ mesh, x: i, z: j, width: 15, depth: 15, height: h });
            }

            // Brücken
            if (Math.random() > 0.7 && j < citySize) {
                let bridgeGeo = new THREE.BoxGeometry(15, 2, 15);
                let bridgeMat = new THREE.MeshStandardMaterial({ color: 0x3333ff, metalness: 0.5, roughness: 0.3 });
                let bridge = new THREE.Mesh(bridgeGeo, bridgeMat);
                bridge.position.set(i, 30, j + spacing / 2);
                bridge.castShadow = true;
                bridge.receiveShadow = true;
                scene.add(bridge);
                buildings.push({ mesh: bridge, x: i, z: j + spacing / 2, width: 15, depth: 15, height: 2 });
            }
        }
    }
}

// Gebäude
function addBuilding(b) {
    scene.add(b.mesh);
}

// Andere Spieler
function addOtherPlayer(id, data) {
    const geo = new THREE.BoxGeometry(1, 2, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(data.x, data.y, data.z);
    scene.add(mesh);
    players[id].mesh = mesh;
}

function updatePlayer(id, data) {
    if (players[id] && players[id].mesh) {
        players[id].mesh.position.set(data.x, data.y, data.z);
        players[id].mesh.rotation.y = data.rotation;
    }
}

function removePlayer(id) {
    if (players[id] && players[id].mesh) scene.remove(players[id].mesh);
    delete players[id];
}

// Doppelblaster
function shootDoppelblaster() {
    const offsets = [-0.3, 0.3];
    offsets.forEach(offset => {
        const laserGeo = new THREE.CylinderGeometry(0.05, 0.05, 5, 8);
        const laserMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const laser = new THREE.Mesh(laserGeo, laserMat);

        const dir = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
        laser.position.set(myPlayer.x + offset, myPlayer.y + 1, myPlayer.z);
        laser.lookAt(laser.position.clone().add(dir));
        laser.userData.velocity = dir.clone().multiplyScalar(300); // schneller Strahl
        bullets.push(laser);
        scene.add(laser);
    });
}

// Laser von anderen Spielern
function addBullet(position, direction) {
    const laserGeo = new THREE.CylinderGeometry(0.05, 0.05, 5, 8);
    const laserMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
    const laser = new THREE.Mesh(laserGeo, laserMat);
    laser.position.set(position.x, position.y + 1, position.z);
    laser.userData.velocity = new THREE.Vector3(direction.x, direction.y, direction.z);
    bullets.push(laser);
    scene.add(laser);
}

// Jetpack Bewegung
function updateJetpack(delta) {
    if (keys[' ']) { jetpackVelocity += jetpackAccel * delta; }
    else if (keys['shift']) { jetpackVelocity -= jetpackAccel * delta; }
    else { jetpackVelocity *= 0.9; } // sanft abbremsen

    if (jetpackVelocity > jetpackMaxSpeed) jetpackVelocity = jetpackMaxSpeed;
    if (jetpackVelocity < -jetpackMaxSpeed) jetpackVelocity = -jetpackMaxSpeed;

    myPlayer.y += jetpackVelocity * delta;
    if (myPlayer.y < 1) { myPlayer.y = 1; jetpackVelocity = 0; } // Bodenlimit
}

// Animate Loop
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    // Jetpack
    updateJetpack(delta);

    // Bewegung
    myPlayer.x += move.x * 15 * delta;
    myPlayer.z += move.z * 15 * delta;
    myPlayer.rotation += look.x * 2 * delta;

    // Kamera First-Person
    camera.position.set(myPlayer.x, myPlayer.y + 1.6, myPlayer.z);
    camera.rotation.x += -look.y * 2 * delta;
    camera.rotation.y = myPlayer.rotation;
    camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camera.rotation.x));

    // Kollision Gebäude
    buildings.forEach(b => {
        if (Math.abs(myPlayer.x - b.x) < b.width / 2 && Math.abs(myPlayer.z - b.z) < b.depth / 2) {
            if (myPlayer.x > b.x) myPlayer.x = b.x + b.width / 2;
            else myPlayer.x = b.x - b.width / 2;
            if (myPlayer.z > b.z) myPlayer.z = b.z + b.depth / 2;
            else myPlayer.z = b.z - b.depth / 2;
        }
    });

    // Bullets bewegen
    bullets.forEach((b, i) => {
        b.position.add(b.userData.velocity.clone().multiplyScalar(delta));
        if (b.position.length() > 2000) { scene.remove(b); bullets.splice(i, 1); }
    });

    // Server Update
    socket.emit('playerMovement', myPlayer);

    renderer.render(scene, camera);
}
