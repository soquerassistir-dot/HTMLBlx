const express = require("express");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const { Server } = require("socket.io");

const { players, createPlayer, removePlayer } = require("./server/state/players");
const { blocks, addBlock, removeBlock, resetWorld } = require("./server/state/world");
const { messages, addMessage, resetChat } = require("./server/state/chat");

const app = express();
const server = http.createServer(app);

// ================= ADMIN (HASH) =================
const ADMIN_HASH = crypto
  .createHash("sha256")
  .update("68@nisRY")
  .digest("hex");

// ================= ROTAS =================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.use(express.static(__dirname));

// ================= SOCKET =================
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// ================= CONEXÃO =================
io.on("connection", (socket) => {
  console.log("✅ Conectado:", socket.id);

  const player = createPlayer(socket.id);

  socket.emit("init", {
    id: socket.id,
    players,
    blocks,
    messages
  });

  socket.broadcast.emit("playerJoined", player);

  // ================= MOVIMENTO (SEGURANÇA) =================
  socket.on("update", (data) => {
    const p = players[socket.id];
    if (!p) return;

    if (
      typeof data.x !== "number" ||
      typeof data.y !== "number" ||
      typeof data.z !== "number"
    ) return;

    // ANTI-TELEPORT
    const MAX_DIST = 2;
    if (Math.abs(data.x - p.x) > MAX_DIST) return;
    if (Math.abs(data.z - p.z) > MAX_DIST) return;

    Object.assign(p, data);

    socket.broadcast.emit("playerMoved", {
      id: socket.id,
      ...data
    });
  });

  // ================= CHAT =================
  socket.on("sendMessage", ({ text }) => {
    if (!players[socket.id]) return;
    if (typeof text !== "string" || text.length > 200) return;

    const msg = addMessage({
      id: socket.id,
      username: players[socket.id].username,
      text,
      time: new Date().toLocaleTimeString()
    });

    io.emit("receiveMessage", msg);
  });

  // ================= CORES =================
  socket.on("updateColor", (data) => {
    const p = players[socket.id];
    if (!p) return;
    if (!["skinColor", "torsoColor", "legsColor"].includes(data.part)) return;

    p[data.part] = data.color;

    socket.broadcast.emit("playerColorChanged", {
      id: socket.id,
      part: data.part,
      color: data.color
    });
  });

  // ================= USERNAME =================
  socket.on("updateUsername", (username) => {
    const p = players[socket.id];
    if (!p) return;
    if (typeof username !== "string" || username.length > 16) return;

    const oldName = p.username;
    p.username = username;

    io.emit("playerRenamed", {
      id: socket.id,
      oldName,
      username
    });
  });

  // ================= BLOCOS =================
  socket.on("placeBlock", (blockData) => {
    const block = addBlock({
      ...blockData,
      id: Date.now().toString(),
      playerId: socket.id,
      timestamp: new Date().toISOString()
    });

    io.emit("blockPlaced", block);
  });

  // ================= ADMIN =================
  socket.on("adminAuth", (key) => {
    const hash = crypto.createHash("sha256").update(key).digest("hex");
    if (hash !== ADMIN_HASH) {
      socket.emit("adminAuthFail");
      return;
    }

    players[socket.id].isAdmin = true;
    players[socket.id].username = "Admin";
    socket.isAdmin = true;

    socket.emit("adminAuthSuccess");
    io.emit("playerJoined", players[socket.id]);

    console.log("🔐 Admin autenticado:", socket.id);
  });

  socket.on("resetWorld", () => {
    if (!socket.isAdmin) return;
    resetWorld();
    resetChat();
    io.emit("worldReset");
  });

  socket.on("removeBlock", (id) => {
    if (!socket.isAdmin) return;
    removeBlock(id);
    io.emit("blockRemoved", id);
  });

  socket.on("disconnect", () => {
    removePlayer(socket.id);
    io.emit("playerLeft", socket.id);
    console.log("❌ Desconectado:", socket.id);
  });
});

// ================= PORTA =================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("🚀 Servidor online na porta", PORT);
});
