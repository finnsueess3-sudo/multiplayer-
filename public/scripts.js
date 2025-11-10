const socket = io();
let scene, camera, renderer, clock;
let players = {}, buildings = [], bullets = [];
let myPlayer = { x: 0, y: 2, z: 0, rotation: 0 };
let move = { x: 0, z: 0 }, look = { x: 0, y: 0 };
let loadscreen = document.getElementById('loadscreen');

init();
animate();

function init() {
    // Szene und Kamera
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb); // Himmelblau

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 10, 20);
    camera.lookAt(0, 0, 0);

    // Renderer
    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas'), antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;

    // Licht
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(50, 50, 50);
    dirLight.castShadow = true;
    scene.add(dirLight);

    // Boden
    const floorGeo = new THREE.PlaneGeometry(500, 500);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Joysticks
    const leftJoystick = nipplejs.create({ zone: document.getElementById('joystickLeft'), mode: 'static', position: { left: '50px', bottom: '50px' } });
    const rightJoystick = nipplejs.create({ zone: document.getElementById('joystickRight'), mode: 'static', position: { right: '50px', bottom: '50px' } });

    leftJoystick.on('move', (evt, data) => { move.x = data.vector.x; move.z = -data.vector.y; });
    leftJoystick.on('end', () => { move = { x: 0, z: 0 }; });

    rightJoystick.on('move', (evt, data) => { look.x = data.vector.x; look.y = data.vector.y; });
    rightJoystick.on('end', () => { look = { x: 0, y: 0 }; });

    // Buttons
    document.getElementById('shootBtn').addEventListener('touchstart', shootBullet);
    document.getElementById('jetpackBtn').addEventListener('touchstart', () => myPlayer.y += 5);

    clock = new THREE.Clock();

    // Socket.IO Events
    socket.on('currentPlayers', (serverPlayers) => { 
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

// Gebäude hinzufügen
function addBuilding(b) {
    const geo = new THREE.BoxGeometry(b.width, b.height, b.depth);
    const mat = new THREE.MeshStandardMaterial({ color: 0x5555ff, metalness: 0.3, roughness: 0.7 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(b.x, b.height / 2, b.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    b.mesh = mesh;
    scene.add(mesh);
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

// Blaster
function shootBullet() {
    const bulletGeo = new THREE.SphereGeometry(0.1, 8, 8);
    const bulletMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    const bullet = new THREE.Mesh(bulletGeo, bulletMat);
    bullet.position.set(myPlayer.x, myPlayer.y + 1, myPlayer.z);
    bullet.velocity = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation).multiplyScalar(100);
    bullets.push(bullet);
    scene.add(bullet);
    socket.emit('shoot', { position: { ...myPlayer }, direction: bullet.velocity });
}

// Bullet von anderen Spielern
function addBullet(position, direction) {
    const bulletGeo = new THREE.SphereGeometry(0.1, 8, 8);
    const bulletMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
    const bullet = new THREE.Mesh(bulletGeo, bulletMat);
    bullet.position.set(position.x, position.y + 1, position.z);
    bullet.velocity = new THREE.Vector3(direction.x, direction.y, direction.z);
    bullets.push(bullet);
    scene.add(bullet);
}

// Animation Loop
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    // Bewegung
    myPlayer.x += move.x * 10 * delta;
    myPlayer.z += move.z * 10 * delta;
    myPlayer.rotation += look.x * 5 * delta;

    // Kamera
    camera.position.set(myPlayer.x, myPlayer.y + 1, myPlayer.z + 5);
    camera.lookAt(myPlayer.x, myPlayer.y, myPlayer.z);

    // Kollision mit Gebäuden
    buildings.forEach(b => {
        if (Math.abs(myPlayer.x - b.x) < b.width / 2 && Math.abs(myPlayer.z - b.z) < b.depth / 2) {
            // Einfach zurückschieben
            if (myPlayer.x > b.x) myPlayer.x = b.x + b.width / 2;
            else myPlayer.x = b.x - b.width / 2;
            if (myPlayer.z > b.z) myPlayer.z = b.z + b.depth / 2;
            else myPlayer.z = b.z - b.depth / 2;
        }
    });

    // Update Bullets
    bullets.forEach((b, i) => {
        b.position.add(b.velocity.clone().multiplyScalar(delta));
        if (b.position.length() > 500) { scene.remove(b); bullets.splice(i, 1); }
    });

    socket.emit('playerMovement', myPlayer);
    renderer.render(scene, camera);
}
