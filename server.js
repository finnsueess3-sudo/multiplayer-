const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http, { cors: { origin: "*" } });

app.use(express.static("public"));

io.on("connection", socket => {
  socket.on("move", data => socket.broadcast.emit("move", { id: socket.id, ...data }));
  socket.on("disconnect", () => io.emit("remove", socket.id));
});

http.listen(process.env.PORT || 3000);
