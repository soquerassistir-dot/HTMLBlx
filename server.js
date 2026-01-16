// ================= IMPORTS =================
const express = require("express");
const http = require("http");
const path = require("path");
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

// ================= CONEXÃO =================
io.on("connection", (socket) => {
  console.log("✅ Conectado:", socket.id);

  players[socket.id] = {
    id: socket.id,
    x: 0,
    y: 1,
    z: 0,
    rotation: 0,
    username: "Player",
    isAdmin: false
  };

  socket.emit("init", {
    id: socket.id,
    players,
    blocks,
    messages
  });

  socket.broadcast.emit("playerJoined", players[socket.id]);

  socket.on("update", (data) => {
    if (!players[socket.id]) return;
    Object.assign(players[socket.id], data);
    socket.broadcast.emit("playerMoved", { id: socket.id, ...data });
  });

  socket.on("sendMessage", ({ text }) => {
    if (typeof text !== "string") return;

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

  socket.on("placeBlock", (blockData) => {
    const block = {
      ...blockData,
      id: Date.now().toString(),
      playerId: socket.id
    };

    blocks.push(block);
    saveJSON(BLOCKS_FILE, blocks);
    io.emit("blockPlaced", block);
  });

  socket.on("adminAuth", (key) => {
    if (key !== ADMIN_KEY) return;

    players[socket.id].isAdmin = true;
    players[socket.id].username = "Admin";
    socket.isAdmin = true;

    socket.emit("adminAuthSuccess");
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
});
