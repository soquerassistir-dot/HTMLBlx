// ================= IMPORTS =================
const express = require("express");
const http = require("http");
const path = require("path");
const rateLimit = require("express-rate-limit");
const { Server } = require("socket.io");

const { loadJSON, saveJSON } = require("./server/utils/jsonStore");

// ================= CONFIG =================
const ADMIN_KEY = process.env.ADMIN_KEY || "68@nisRY";
const PORT = process.env.PORT || 3000;

const BLOCKS_FILE = "./world_blocks.json";
const MESSAGES_FILE = "./world_messages.json";

// ================= APP =================
const app = express();
const server = http.createServer(app);

// ================= SEGURANÇA (HTTP) =================
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false
  })
);

app.disable("x-powered-by");

// ================= ROTAS =================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.use(express.static(__dirname));

// ================= SOCKET =================
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// ================= ESTADO =================
let players = {};
let blocks = loadJSON(BLOCKS_FILE, []);
let messages = loadJSON(MESSAGES_FILE, []);

// ================= SOCKET EVENTS =================
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
    skinColor: 0xffff00,
    torsoColor: 0x0000ff,
    legsColor: 0x00ff00,
    animation: "idle",
    walking: false,
    velocityY: 0,
    isAdmin: false
  };

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
    if (typeof text !== "string" || text.length > 200) return;

    const msg = {
      id: socket.id,
      username: players[socket.id]?.username || "Player",
      text,
      time: new Date().toLocaleTimeString()
    };

    messages.push(msg);
    if (messages.length > 100) messages.shift();

    saveJSON(MESSAGES_FILE, messages);
    io.emit("receiveMessage", msg);
  });

  // ================= BLOCO =================
  socket.on("placeBlock", (blockData) => {
    if (!blockData || typeof blockData !== "object") return;

    const block = {
      ...blockData,
      id: Date.now().toString(),
      playerId: socket.id,
      timestamp: Date.now()
    };

    blocks.push(block);
    saveJSON(BLOCKS_FILE, blocks);
    io.emit("blockPlaced", block);
  });

  // ================= CORES =================
  socket.on("updateColor", ({ part, color }) => {
    if (!players[socket.id]) return;
    if (!["skinColor", "torsoColor", "legsColor"].includes(part)) return;

    players[socket.id][part] = color;
    socket.broadcast.emit("playerColorChanged", {
      id: socket.id,
      part,
      color
    });
  });

  // ================= NOME =================
  socket.on("updateUsername", (username) => {
    if (typeof username !== "string" || username.length > 20) return;

    const oldName = players[socket.id].username;
    players[socket.id].username = username;

    io.emit("playerRenamed", {
      id: socket.id,
      oldName,
      username
    });
  });

  // ================= ADMIN =================
  socket.on("adminAuth", (key) => {
    if (key !== ADMIN_KEY) {
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

    blocks = [];
    messages = [];

    saveJSON(BLOCKS_FILE, blocks);
    saveJSON(MESSAGES_FILE, messages);

    io.emit("worldReset");
  });

  socket.on("disconnect", () => {
    delete players[socket.id];
    io.emit("playerLeft", socket.id);
    console.log("❌ Saiu:", socket.id);
  });
});

// ================= START =================
server.listen(PORT, () => {
  console.log("🚀 Servidor online na porta", PORT);
  console.log(`📦 Blocos: ${blocks.length}`);
  console.log(`💬 Mensagens: ${messages.length}`);
});
