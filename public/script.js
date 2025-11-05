const socket = io();
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

let players = {};
let me = { x: Math.random()*780, y: Math.random()*580, color: "#" + Math.floor(Math.random()*16777215).toString(16) };

document.addEventListener("keydown", e => {
  if(e.key==="ArrowUp") me.y-=10;
  if(e.key==="ArrowDown") me.y+=10;
  if(e.key==="ArrowLeft") me.x-=10;
  if(e.key==="ArrowRight") me.x+=10;
  socket.emit("move", me);
});

socket.on("move", data => players[data.id] = data);
socket.on("remove", id => delete players[id]);

(function draw() {
  ctx.clearRect(0,0,800,600);
  ctx.fillStyle = me.color; ctx.fillRect(me.x,me.y,20,20);
  for(let id in players) { let p = players[id]; ctx.fillStyle = p.color; ctx.fillRect(p.x,p.y,20,20); }
  requestAnimationFrame(draw);
})();
