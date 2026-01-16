const express = require("express");
const http = require("http");
const path = require("path");
const { loadJSON, saveJSON } = require("./server/utils/jsonStore");
const { Server } = require("socket.io");

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


  if (!fs.existsSync(file)) {
    // Se o arquivo não existe, cria com array vazio
    fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
    return fallback;
  }
  try {
    const data = fs.readFileSync(file, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.error(`Erro ao ler ${file}:`, error);
    return fallback;
  }
}


  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    console.log(`✅ ${file} salvo com ${data.length} itens`);
  } catch (error) {
    console.error(`❌ Erro ao salvar ${file}:`, error);
  }
}

// ================= ESTADO GLOBAL =================
let players = {};
let blocks = loadJSON(BLOCKS_FILE, []);
let messages = loadJSON(MESSAGES_FILE, []);

// ================= CONEXÃO =================
io.on("connection", (socket) => {
  console.log("✅ Conectado:", socket.id);

  // PLAYER NORMAL
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

  // Enviar dados iniciais para o jogador
  socket.emit("init", { 
    id: socket.id, 
    players, 
    blocks, 
    messages 
  });
  
  // Avisar outros jogadores
  socket.broadcast.emit("playerJoined", players[socket.id]);

  // MOVIMENTO
  socket.on("update", (data) => {
    if (!players[socket.id]) return;
    Object.assign(players[socket.id], data);
    socket.broadcast.emit("playerMoved", { id: socket.id, ...data });
  });

  // CHAT - SALVA NO ARQUIVO
  socket.on("sendMessage", ({ text }) => {
    const msg = {
      id: socket.id,
      username: players[socket.id]?.username || "Player",
      text: text,
      time: new Date().toLocaleTimeString()
    };
    
    messages.push(msg);
    
    // Limitar histórico a 100 mensagens
    if (messages.length > 100) messages.shift();
    
    // SALVAR NO ARQUIVO
    saveJSON(MESSAGES_FILE, messages);
    
    // Enviar para todos
    io.emit("receiveMessage", msg);
  });

  // MUDAR COR
  socket.on("updateColor", (data) => {
    if (!players[socket.id]) return;
    players[socket.id][data.part] = data.color;
    socket.broadcast.emit("playerColorChanged", {
      id: socket.id,
      part: data.part,
      color: data.color
    });
  });

  // MUDAR NOME
  socket.on("updateUsername", (username) => {
    if (!players[socket.id]) return;
    const oldName = players[socket.id].username;
    players[socket.id].username = username;
    io.emit("playerRenamed", {
      id: socket.id,
      oldName: oldName,
      username: username
    });
  });

  // ANIMAÇÃO
  socket.on("updateAnimation", (data) => {
    if (!players[socket.id]) return;
    players[socket.id].animation = data.animation;
    players[socket.id].walking = data.walking;
    players[socket.id].velocityY = data.velocityY;
    socket.broadcast.emit("playerAnimated", {
      id: socket.id,
      ...data
    });
  });

  // COLOCAR BLOCO - SALVA NO ARQUIVO
  socket.on("placeBlock", (blockData) => {
    const blockWithId = { 
      ...blockData, 
      id: Date.now().toString(),
      playerId: socket.id,
      timestamp: new Date().toISOString()
    };
    
    blocks.push(blockWithId);
    
    // SALVAR NO ARQUIVO
    saveJSON(BLOCKS_FILE, blocks);
    
    // Enviar para todos
    io.emit("blockPlaced", blockWithId);
    
    console.log(`🧱 Bloco colocado por ${socket.id}`, blockWithId);
  });

  // ================= ADMIN =================
  socket.on("adminAuth", (key) => {
    if (key !== ADMIN_KEY) {
      socket.emit("adminAuthFail");
      return;
    }

    players[socket.id] = {
      id: socket.id,
      x: 0,
      y: 1,
      z: 0,
      rotation: 0,
      username: "Admin",
      skinColor: 0xFFFFFF,
      torsoColor: 0xFFFFFF,
      legsColor: 0xFFFFFF,
      animation: "idle",
      walking: false,
      velocityY: 0,
      isAdmin: true
    };

    socket.isAdmin = true;
    socket.emit("adminAuthSuccess");
    io.emit("playerJoined", players[socket.id]);
    console.log("🔐 Admin autenticado:", socket.id);
  });

  socket.on("adminMove", (dir) => {
    if (!socket.isAdmin) return;
    if (!players[socket.id]) return;

    const p = players[socket.id];
    const speed = 0.3;

    if (dir === "up") p.z -= speed;
    if (dir === "down") p.z += speed;
    if (dir === "left") p.x -= speed;
    if (dir === "right") p.x += speed;

    io.emit("playerMoved", {
      id: socket.id,
      x: p.x,
      y: p.y,
      z: p.z,
      rotation: p.rotation
    });
  });

  socket.on("adminMessage", (text) => {
    if (!socket.isAdmin) return;
    io.emit("receiveMessage", {
      id: "ADMIN",
      username: "🌐 ADMIN",
      text: text,
      time: new Date().toLocaleTimeString()
    });
  });

  // RESETAR MUNDO - LIMPA OS ARQUIVOS
  socket.on("resetWorld", () => {
    if (!socket.isAdmin) return;
    
    blocks = [];
    messages = [];
    
    // SALVAR ARQUIVOS VAZIOS
    saveJSON(BLOCKS_FILE, blocks);
    saveJSON(MESSAGES_FILE, messages);
    
    io.emit("worldReset");
    console.log("♻ Mundo resetado por admin");
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

  // REMOVER BLOCO (opcional)
  socket.on("removeBlock", (blockId) => {
    if (!socket.isAdmin) return;
    
    blocks = blocks.filter(block => block.id !== blockId);
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
  console.log("📁 Blocos salvos em:", BLOCKS_FILE);
  console.log("💬 Mensagens salvas em:", MESSAGES_FILE);
  console.log(`📊 ${blocks.length} blocos carregados`);
  console.log(`💬 ${messages.length} mensagens carregadas`);
});

