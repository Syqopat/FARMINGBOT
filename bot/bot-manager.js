const mineflayer = require("mineflayer");
const { pathfinder, Movements, goals } = require("mineflayer-pathfinder");
const { GoalFollow, GoalNear } = goals;
const CactusFarm = require("./cactus-farm");
const FarmStore = require("./farm-store");

const AntiDetect = {
  lookOffset() {
    return (Math.random() - 0.5) * 0.04;
  },
  jitter(baseMs) {
    const variance = Math.min(baseMs * 0.15, 150);
    return baseMs + (Math.random() - 0.5) * 2 * variance;
  },
  async delay(ms = 100) {
    return new Promise((r) => setTimeout(r, AntiDetect.jitter(ms)));
  },
};


class Bot {
  constructor(id, options, io, farmStore) {
    this.id = id;
    this.username = options.username;
    this.host = options.host || "localhost";
    this.port = parseInt(options.port) || 25565;
    this.version = options.version || false;
    this.io = io;
    this.bot = null;
    this.status = "connecting";
    this.followTarget = null;
    this._posInterval = null;
    this.autoReconnect = true;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.intentionalDisconnect = false;
    this.reconnectTimeout = null;
    this.activeFarm = null;
    this.farmStore = farmStore;
    this.init();
  }

  init() {
    try {
      const botOpts = {
        host: this.host,
        port: this.port,
        username: this.username,
        auth: "offline",
        checkTimeoutInterval: 60000,
      };
      if (this.version && this.version !== "false") {
        botOpts.version = this.version;
      }
      this.bot = mineflayer.createBot(botOpts);
      this.bot.loadPlugin(pathfinder);
      this.setupEvents();
    } catch (err) {
      this.status = "error";
      this.log(`Baglanti hatasi: ${err.message}`);
      this.emitUpdate();
    }
  }

  setupEvents() {
    this.bot.on("login", () => {
      this.status = "online";
      this.reconnectAttempts = 0;
      this.log("Sunucuya baglanildi!");
      this.emitUpdate();
    });

    this.bot.on("spawn", () => {
      this.log("Dunyada doguldu.");
      this.startPositionBroadcast();
      this.emitUpdate();
    });

    this.bot.on("chat", (username, message) => {
      if (username === this.bot.username) return;
      this.io.emit("bot_chat", { id: this.id, username, message });
    });

    this.bot.on("health", () => { this.emitUpdate(); });

    this.bot.on("kicked", (reason) => {
      this.status = "disconnected";
      let reasonStr = this._parseKickReason(reason);
      this.log(`Sunucudan atildi: ${reasonStr}`);
      this.cleanup();
      this.emitUpdate();
      if (!this.intentionalDisconnect) this.attemptReconnect();
    });

    this.bot.on("error", (err) => {
      this.status = "error";
      this.log(`Hata: ${err.message}`);
      this.cleanup();
      this.emitUpdate();
      if (!this.intentionalDisconnect) this.attemptReconnect();
    });

    this.bot.on("end", (reason) => {
      this.status = "disconnected";
      this.log(`Baglanti kesildi: ${reason || "bilinmeyen sebep"}`);
      this.cleanup();
      this.emitUpdate();
      if (!this.intentionalDisconnect) this.attemptReconnect();
    });

    this.bot.on("death", () => {
      this.log("Bot oldu!");
      this.emitUpdate();
    });
  }

  _parseKickReason(reason) {
    try {
      if (typeof reason === "string") {
        try { reason = JSON.parse(reason); } catch (e) {}
      }
      if (typeof reason === "object" && reason !== null) {
        let text = reason.text || "";
        if (reason.extra && Array.isArray(reason.extra)) {
          reason.extra.forEach((item) => { if (item.text) text += item.text; });
        }
        if (text) return text;
        if (reason.value?.text?.value) return reason.value.text.value;
        return JSON.stringify(reason);
      }
      return String(reason);
    } catch (e) {
      return String(reason);
    }
  }

  attemptReconnect() {
    if (!this.autoReconnect || this.intentionalDisconnect) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.log(`Maksimum yeniden baglanma denemesi (${this.maxReconnectAttempts}) asildi.`);
      return;
    }
    this.reconnectAttempts++;
    const delay = Math.min(5000 + this.reconnectAttempts * 5000, 45000);
    this.log(`${delay / 1000}s sonra yeniden baglaniliyor... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    this.reconnectTimeout = setTimeout(() => {
      if (this.intentionalDisconnect) return;
      this.status = "connecting";
      this.emitUpdate();
      this.init();
    }, delay);
  }

  reconnectTo(newHost) {
    let parsedHost = newHost || this.host;
    let parsedPort = this.port;
    if (parsedHost.includes(":")) {
      const parts = parsedHost.split(":");
      parsedHost = parts[0];
      parsedPort = parseInt(parts[1], 10);
    }
    this.host = parsedHost;
    this.port = parsedPort;
    this.intentionalDisconnect = false;
    this.autoReconnect = true;
    this.reconnectAttempts = 0;
    if (this.bot && (this.status === "online" || this.status === "connecting")) {
      try { this.bot.quit(); } catch (e) {}
    }
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.cleanup();
    this.status = "connecting";
    this.log(`${parsedHost}:${parsedPort} adresine baglaniliyor...`);
    this.emitUpdate();
    this.init();
  }

  startPositionBroadcast() {
    if (this._posInterval) clearInterval(this._posInterval);
    this._posInterval = setInterval(() => {
      if (!this.bot?.entity || this.status !== "online") return;
      this.io.emit("bot_position", {
        id: this.id,
        x: Math.round(this.bot.entity.position.x * 100) / 100,
        y: Math.round(this.bot.entity.position.y * 100) / 100,
        z: Math.round(this.bot.entity.position.z * 100) / 100,
        health: this.bot.health,
        food: this.bot.food,
      });
    }, 500);
  }

  followPlayer(playerName, distance) {
    if (!this.bot || this.status !== "online") {
      this.log("Bot cevrimdisi, takip baslatilamiyor.");
      return;
    }
    const player = this.bot.players[playerName];
    if (!player?.entity) {
      this.log(`Oyuncu "${playerName}" bulunamadi veya gorus alani disinda.`);
      return;
    }
    this.followTarget = playerName;
    this.log(`"${playerName}" takip ediliyor (mesafe: ${distance})...`);
    const mcData = require("minecraft-data")(this.bot.version);
    const movements = new Movements(this.bot, mcData);
    movements.canDig = false;
    this.bot.pathfinder.setMovements(movements);
    const goal = new GoalFollow(player.entity, distance);
    this.bot.pathfinder.setGoal(goal, true);
    this.emitUpdate();
  }

  stopFollow() {
    if (this.followTarget) {
      this.log(`"${this.followTarget}" takibi durduruldu.`);
      this.followTarget = null;
      if (this.bot?.pathfinder) this.bot.pathfinder.setGoal(null);
      this.emitUpdate();
    }
  }

  async startFarm(farmConfig) {
    if (!this.bot || this.status !== "online") {
      this.log("Bot cevrimdisi, farm baslatilamiyor.");
      return;
    }
    if (this.activeFarm) {
      this.log("Zaten aktif bir farm var. Once durdurun.");
      return;
    }
    try {
      this.activeFarm = new CactusFarm(this.bot, this, farmConfig, this.farmStore);
      this.log(`Farm "${farmConfig.name}" baslatildi.`);
      this.emitUpdate();
      await this.activeFarm.build();
    } catch (err) {
      if (err.message !== "BUILD_STOPPED") this.log(`Farm hatasi: ${err.message}`);
    } finally {
      this.activeFarm = null;
      this.emitUpdate();
    }
  }

  stopFarm() {
    if (this.activeFarm) {
      this.activeFarm.stop();
      this.log("Farm durduruldu. Ilerleme kaydedildi.");
      this.emitUpdate();
    }
  }

  getFarmStatus() {
    if (!this.activeFarm) return null;
    return { farmName: this.activeFarm.config.name, progress: this.activeFarm.config.progress };
  }

  sendChat(message) {
    if (this.bot && this.status === "online") {
      this.bot.chat(message);
      this.log(`[Sen]: ${message}`);
    }
  }

  log(message) {
    const entry = `[${new Date().toLocaleTimeString("tr-TR")}] [${this.username}] ${message}`;
    this.io.emit("bot_log", { id: this.id, message: entry });
  }

  emitUpdate() {
    this.io.emit("bot_updated", this.getPublicData());
  }

  getPublicData() {
    return {
      id: this.id,
      username: this.username,
      host: this.host,
      port: this.port,
      version: this.version,
      status: this.status,
      followTarget: this.followTarget,
      activeFarm: this.activeFarm ? this.activeFarm.config.name : null,
      position: this.bot?.entity?.position
        ? {
            x: Math.round(this.bot.entity.position.x * 100) / 100,
            y: Math.round(this.bot.entity.position.y * 100) / 100,
            z: Math.round(this.bot.entity.position.z * 100) / 100,
          }
        : null,
      health: this.bot?.health || 0,
      food: this.bot?.food || 0,
    };
  }

  cleanup() {
    this.stopFollow();
    if (this.activeFarm) {
      this.activeFarm.stop();
      this.activeFarm = null;
    }
    if (this._posInterval) {
      clearInterval(this._posInterval);
      this._posInterval = null;
    }
  }

  disconnect() {
    this.intentionalDisconnect = true;
    this.autoReconnect = false;
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.cleanup();
    if (this.bot) {
      try { this.bot.quit(); } catch (e) {}
      this.bot = null;
    }
    this.status = "disconnected";
    this.log("Baglanti kesildi.");
    this.emitUpdate();
  }
}


class BotManager {
  constructor(io) {
    this.io = io;
    this.bots = new Map();
    this.nextId = 1;
    this.farmStore = new FarmStore();
  }

  createBots(data) {
    const count = Math.min(parseInt(data.count) || 1, 20);
    const baseName = data.baseName || "Bot";
    const created = [];
    for (let i = 1; i <= count; i++) {
      const username = count === 1 ? baseName : `${baseName}${i}`;
      const id = `bot-${this.nextId++}`;
      const bot = new Bot(id, {
        host: data.host,
        port: data.port,
        version: data.version,
        username: username,
      }, this.io, this.farmStore);
      this.bots.set(id, bot);
      created.push(id);
    }
    this.emitBotsList();
    return created;
  }

  removeBot(id) {
    const bot = this.bots.get(id);
    if (bot) {
      bot.disconnect();
      this.bots.delete(id);
      this.emitBotsList();
    }
  }

  removeAllBots() {
    this.bots.forEach((bot) => bot.disconnect());
    this.bots.clear();
    this.emitBotsList();
  }

  botAction(id, action, data) {
    const bot = this.bots.get(id);
    if (!bot) return;
    switch (action) {
      case "disconnect": bot.disconnect(); this.emitBotsList(); break;
      case "reconnect": bot.reconnectTo(data); this.emitBotsList(); break;
      case "say": bot.sendChat(data); break;
    }
  }

  followPlayer(id, playerName, distance) {
    const bot = this.bots.get(id);
    if (bot) bot.followPlayer(playerName, distance);
  }

  followPlayerAll(playerName, distance) {
    this.bots.forEach((bot) => bot.followPlayer(playerName, distance));
  }

  stopFollow(id) {
    const bot = this.bots.get(id);
    if (bot) bot.stopFollow();
  }

  stopFollowAll() {
    this.bots.forEach((bot) => bot.stopFollow());
  }

  sendChat(id, message) {
    const bot = this.bots.get(id);
    if (bot) bot.sendChat(message);
  }

  sendChatAll(message) {
    this.bots.forEach((bot) => bot.sendChat(message));
  }

  startFarm(botId, farmConfig) {
    const bot = this.bots.get(botId);
    if (bot) bot.startFarm(farmConfig);
  }

  stopFarm(botId) {
    const bot = this.bots.get(botId);
    if (bot) bot.stopFarm();
  }

  getAllFarms() { return this.farmStore.getAllFarms(); }
  saveFarm(farmConfig) { return this.farmStore.saveFarm(farmConfig); }
  deleteFarm(farmName) { this.farmStore.deleteFarm(farmName); }
  resetFarmProgress(farmName) { this.farmStore.resetProgress(farmName); }

  getAllBotsData() {
    return Array.from(this.bots.values()).map((bot) => bot.getPublicData());
  }

  emitBotsList() {
    this.io.emit("bots_list", this.getAllBotsData());
  }
}

module.exports = BotManager;
