const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const { loadJSON, saveJSON } = require("./server/utils/jsonStore");

const ADMIN_KEY = "68@nisRY";

const app = express();
const server = http.createServer(app);

// ================= ROTAS =================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.use(express.static(__dirname));

// ================= SOCKET =================
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// ================= ARQUIVOS JSON =================
const BLOCKS_FILE = "./world_blocks.json";
const MESSAGES_FILE = "./world_messages.json";

// ================= ESTADO GLOBAL =================
let players = {};
let blocks = loadJSON(BLOCKS_FILE, []);
let messages = loadJSON(MESSAGES_FILE, []);

// ================= CONEXÃO =================
io.on("connection", (socket) => {
  console.log("✅ Conectado:", socket.id);

  // PLAYER PADRÃO
  players[socket.id] = {
    id: socket.id,
    x: 0,
    y: 1,
    z: 0,
    rotation: 0,
    username: "Player",
    skinColor: 0xFFFF00,
    torsoColor: 0x0000FF,
    legsColor: 0x00FF00,
    animation: "idle",
    walking: false,
    velocityY: 0,
    isAdmin: false
  };

  // Enviar dados iniciais
  socket.emit("init", {
    id: socket.id,
    players,
    blocks,
    messages
  });

  socket.broadcast.emit("playerJoined", players[socket.id]);

  // ================= MOVIMENTO =================
  socket.on("update", (data) => {
    if (!players[socket.id]) return;
    Object.assign(players[socket.id], data);
    socket.broadcast.emit("playerMoved", { id: socket.id, ...data });
  });

  // ================= CHAT =================
  socket.on("sendMessage", ({ text }) => {
    if (!players[socket.id]) return;

    const msg = {
      id: socket.id,
      username: players[socket.id].username,
      text,
      time: new Date().toLocaleTimeString()
    };

    messages.push(msg);
    if (messages.length > 100) messages.shift();

    saveJSON(MESSAGES_FILE, messages);
    io.emit("receiveMessage", msg);
  });

  // ================= CORES =================
  socket.on("updateColor", (data) => {
    if (!players[socket.id]) return;
    players[socket.id][data.part] = data.color;

    socket.broadcast.emit("playerColorChanged", {
      id: socket.id,
      part: data.part,
      color: data.color
    });
  });

  // ================= USERNAME =================
  socket.on("updateUsername", (username) => {
    if (!players[socket.id]) return;

    const oldName = players[socket.id].username;
    players[socket.id].username = username;

    io.emit("playerRenamed", {
      id: socket.id,
      oldName,
      username
    });
  });

  // ================= ANIMAÇÃO =================
  socket.on("updateAnimation", (data) => {
    if (!players[socket.id]) return;

    Object.assign(players[socket.id], data);

    socket.broadcast.emit("playerAnimated", {
      id: socket.id,
      ...data
    });
  });

  // ================= BLOCOS =================
  socket.on("placeBlock", (blockData) => {
    const block = {
      ...blockData,
      id: Date.now().toString(),
      playerId: socket.id,
      timestamp: new Date().toISOString()
    };

    blocks.push(block);
    saveJSON(BLOCKS_FILE, blocks);

    io.emit("blockPlaced", block);
    console.log("🧱 Bloco colocado:", block);
  });

  // ================= ADMIN =================
  socket.on("adminAuth", (key) => {
    if (key !== ADMIN_KEY) {
      socket.emit("adminAuthFail");
      return;
    }

    players[socket.id] = {
      ...players[socket.id],
      username: "Admin",
      skinColor: 0xFFFFFF,
      torsoColor: 0xFFFFFF,
      legsColor: 0xFFFFFF,
      isAdmin: true
    };

    socket.isAdmin = true;
    socket.emit("adminAuthSuccess");
    io.emit("playerJoined", players[socket.id]);

    console.log("🔐 Admin autenticado:", socket.id);
  });

  socket.on("adminMove", (dir) => {
    if (!socket.isAdmin || !players[socket.id]) return;

    const p = players[socket.id];
    const speed = 0.3;

    if (dir === "up") p.z -= speed;
    if (dir === "down") p.z += speed;
    if (dir === "left") p.x -= speed;
    if (dir === "right") p.x += speed;

    io.emit("playerMoved", p);
  });

  socket.on("adminMessage", (text) => {
    if (!socket.isAdmin) return;

    io.emit("receiveMessage", {
      id: "ADMIN",
      username: "🌐 ADMIN",
      text,
      time: new Date().toLocaleTimeString()
    });
  });

  socket.on("resetWorld", () => {
    if (!socket.isAdmin) return;

    blocks = [];
    messages = [];

    saveJSON(BLOCKS_FILE, blocks);
    saveJSON(MESSAGES_FILE, messages);

    io.emit("worldReset");
    console.log("♻ Mundo resetado");
  });

  socket.on("resetPlayers", () => {
    if (!socket.isAdmin) return;

    for (const id in players) {
      players[id].x = 0;
      players[id].y = 1;
      players[id].z = 0;
    }

    io.emit("playersReset");
  });

  socket.on("removeBlock", (blockId) => {
    if (!socket.isAdmin) return;

    blocks = blocks.filter(b => b.id !== blockId);
    saveJSON(BLOCKS_FILE, blocks);

    io.emit("blockRemoved", blockId);
  });

  socket.on("disconnect", () => {
    delete players[socket.id];
    io.emit("playerLeft", socket.id);
    console.log("❌ Desconectado:", socket.id);
  });
});

// ================= PORTA =================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("🚀 Servidor online na porta", PORT);
  console.log("📊 Blocos:", blocks.length);
  console.log("💬 Mensagens:", messages.length);
});
