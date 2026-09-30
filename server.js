const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");
const BotManager = require("./bot/bot-manager");

process.on("uncaughtException", (err) => {
  console.error("Kritik Hata:", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public"), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith(".js")) res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    else if (filePath.endsWith(".css")) res.setHeader("Content-Type", "text/css; charset=utf-8");
  }
}));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

const botManager = new BotManager(io);

io.on("connection", (socket) => {
  console.log("Frontend baglandi:", socket.id);

  socket.emit("bots_list", botManager.getAllBotsData());

  socket.on("create_bots", (data) => { botManager.createBots(data); });
  socket.on("remove_bot", (id) => { botManager.removeBot(id); });
  socket.on("remove_all_bots", () => { botManager.removeAllBots(); });
  socket.on("bot_action", ({ id, action, data }) => { botManager.botAction(id, action, data); });
  socket.on("follow_player", ({ id, playerName, distance }) => { botManager.followPlayer(id, playerName, distance); });
  socket.on("follow_player_all", ({ playerName, distance }) => { botManager.followPlayerAll(playerName, distance); });
  socket.on("stop_follow", (id) => { botManager.stopFollow(id); });
  socket.on("stop_follow_all", () => { botManager.stopFollowAll(); });
  socket.on("send_chat", ({ id, message }) => { botManager.sendChat(id, message); });
  socket.on("send_chat_all", (message) => { botManager.sendChatAll(message); });

  socket.emit("farms_list", botManager.getAllFarms());

  socket.on("save_farm", (farmConfig) => {
    botManager.saveFarm(farmConfig);
    io.emit("farms_list", botManager.getAllFarms());
  });

  socket.on("load_farms", () => {
    socket.emit("farms_list", botManager.getAllFarms());
  });

  socket.on("delete_farm", (farmName) => {
    botManager.deleteFarm(farmName);
    io.emit("farms_list", botManager.getAllFarms());
  });

  socket.on("start_farm", ({ botId, farmName }) => {
    const farms = botManager.getAllFarms();
    const farmConfig = farms[farmName];
    if (farmConfig) botManager.startFarm(botId, farmConfig);
  });

  socket.on("stop_farm", ({ botId }) => { botManager.stopFarm(botId); });

  socket.on("reset_farm", (farmName) => {
    botManager.resetFarmProgress(farmName);
    io.emit("farms_list", botManager.getAllFarms());
  });

  socket.on("disconnect", () => {
    console.log("Frontend ayrildi:", socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`CactusFarm Bot sunucusu port ${PORT} uzerinde calisiyor`);
  console.log(`Dashboard: http://localhost:${PORT}`);
});
