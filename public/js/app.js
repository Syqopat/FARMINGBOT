const socket = io();

let bots = [];
let selectedBotId = null;
let targetMode = "selected";
let farms = {};
let editingFarmName = null;

socket.on("connect", () => {
  addLog("Dashboard bağlandı.", "success");
});

socket.on("disconnect", () => {
  addLog("Dashboard bağlantısı kesildi!", "error");
});

socket.on("bots_list", (data) => {
  bots = data;
  renderBotList();
  updateHeaderStatus();
  if (selectedBotId) {
    const bot = bots.find((b) => b.id === selectedBotId);
    if (bot) updateDetailPanel(bot);
    else clearDetailPanel();
  }
});

socket.on("bot_updated", (data) => {
  const idx = bots.findIndex((b) => b.id === data.id);
  if (idx >= 0) bots[idx] = data;
  else bots.push(data);
  renderBotList();
  updateHeaderStatus();
  if (selectedBotId === data.id) updateDetailPanel(data);
});

socket.on("bot_position", (data) => {
  const idx = bots.findIndex((b) => b.id === data.id);
  if (idx >= 0) {
    bots[idx].position = { x: data.x, y: data.y, z: data.z };
    bots[idx].health = data.health;
    bots[idx].food = data.food;
  }
  if (selectedBotId === data.id) {
    document.getElementById("statPos").textContent = `${data.x}, ${data.y}, ${data.z}`;
    updateHealthFood(data.health || 0, data.food || 0);
  }
  const posEl = document.querySelector(`[data-bot-pos="${data.id}"]`);
  if (posEl) posEl.textContent = `${data.x}, ${data.y}, ${data.z}`;
});

socket.on("bot_log", (data) => {
  addLogEntry(data.message);
});

socket.on("bot_chat", (data) => {
  const bot = bots.find((b) => b.id === data.id);
  const prefix = bot ? bot.username : "???";
  addLogEntry(`[${new Date().toLocaleTimeString("tr-TR")}] [${prefix}] <${data.username}> ${data.message}`, "chat");
});

socket.on("farms_list", (data) => {
  farms = data || {};
  renderFarmsList();
});

socket.on("farm_progress", (data) => {
  const el = document.getElementById(`farm-progress-${data.farmName}`);
  if (el) {
    const pct = data.totalInLayer > 0 ? Math.round((data.blockIndex / data.totalInLayer) * 100) : 0;
    el.style.width = `${pct}%`;
  }
  const txt = document.getElementById(`farm-progress-text-${data.farmName}`);
  if (txt) {
    txt.textContent = `Kat ${data.floor}/${data.totalFloors} \u2022 ${data.layer} \u2022 ${data.blockIndex}/${data.totalInLayer} \u2022 Toplam: ${data.totalBlocksPlaced}`;
  }
});

socket.on("farm_status", (data) => {
  if (farms[data.farmName]) {
    if (!farms[data.farmName].progress) farms[data.farmName].progress = {};
    farms[data.farmName].progress.status = data.status;
    renderFarmsList();
  }
});

function addBots() {
  const host = document.getElementById("inputHost").value.trim() || "localhost";
  const port = document.getElementById("inputPort").value.trim() || "25565";
  const version = document.getElementById("inputVersion").value.trim() || false;
  const baseName = document.getElementById("inputBaseName").value.trim() || "Bot";
  const count = parseInt(document.getElementById("inputBotCount").value) || 1;
  socket.emit("create_bots", { host, port, version, baseName, count });
  addLog(`${count} istemci ekleniyor: ${baseName}${count > 1 ? "1-" + count : ""}`, "warning");
}

function removeBot(id) {
  socket.emit("remove_bot", id);
  if (selectedBotId === id) {
    selectedBotId = null;
    clearDetailPanel();
  }
}

function removeAllBots() {
  socket.emit("remove_all_bots");
  selectedBotId = null;
  clearDetailPanel();
}

function disconnectSelectedBot() {
  if (!selectedBotId) return;
  socket.emit("bot_action", { id: selectedBotId, action: "disconnect" });
}

function reconnectBot() {
  if (!selectedBotId) return;
  const ip = document.getElementById("inputReconnectIp").value.trim();
  if (!ip) { addLog("IP adresi girin!", "error"); return; }
  socket.emit("bot_action", { id: selectedBotId, action: "reconnect", data: ip });
}

function followPlayer() {
  const playerName = document.getElementById("inputFollowPlayer").value.trim();
  const distance = parseInt(document.getElementById("inputFollowDist").value) || 3;
  if (!playerName) { addLog("Oyuncu adi girin!", "error"); return; }
  if (targetMode === "all") {
    socket.emit("follow_player_all", { playerName, distance });
    addLog(`Tum botlar "${playerName}" takip ediyor.`, "success");
  } else if (selectedBotId) {
    socket.emit("follow_player", { id: selectedBotId, playerName, distance });
  } else {
    addLog("Bir bot secin veya 'Tum Botlar' moduna gecin.", "error");
  }
}

function stopFollow() {
  if (targetMode === "all") {
    socket.emit("stop_follow_all");
    addLog("Tum botlarin takibi durduruldu.", "warning");
  } else if (selectedBotId) {
    socket.emit("stop_follow", selectedBotId);
  }
}

function sendChat() {
  const input = document.getElementById("inputChat");
  const message = input.value.trim();
  if (!message) return;
  if (targetMode === "all") {
    socket.emit("send_chat_all", message);
  } else if (selectedBotId) {
    socket.emit("send_chat", { id: selectedBotId, message });
  } else {
    addLog("Bir bot secin veya 'Tum Botlar' moduna gecin.", "error");
  }
  input.value = "";
}

function setTarget(mode) {
  targetMode = mode;
  document.getElementById("btnTargetSelected").classList.toggle("active", mode === "selected");
  document.getElementById("btnTargetAll").classList.toggle("active", mode === "all");
}

function selectBot(id) {
  selectedBotId = id;
  const bot = bots.find((b) => b.id === id);
  if (bot) updateDetailPanel(bot);
  document.querySelectorAll(".bot-item").forEach((el) => {
    el.classList.toggle("active", el.dataset.botId === id);
  });
}

function renderBotList() {
  const list = document.getElementById("botList");
  if (bots.length === 0) {
    list.innerHTML = '<div class="bot-list-empty">Henuz istemci eklenmedi.</div>';
    document.getElementById("botCountBadge").textContent = "0";
    return;
  }
  document.getElementById("botCountBadge").textContent = bots.length;
  list.innerHTML = bots.map((bot) => {
    const statusClass = bot.status === "online" ? "online" : bot.status === "connecting" ? "connecting" : bot.status === "error" ? "error" : "";
    const statusLabel = bot.status === "online" ? "Cevrimici" : bot.status === "connecting" ? "Baglaniyor" : bot.status === "error" ? "Hata" : "Cevrimdisi";
    const isSelected = bot.id === selectedBotId;
    const posText = bot.position ? `${bot.position.x}, ${bot.position.y}, ${bot.position.z}` : "\u2014";
    const followBadge = bot.followTarget ? `<span class="bot-follow-badge">\uD83C\uDFC3 ${bot.followTarget}</span>` : "";
    const farmBadge = bot.activeFarm ? `<span class="bot-follow-badge" style="border-color:rgba(96,165,250,0.2);color:var(--info);background:rgba(96,165,250,0.1)">\uD83C\uDF35 ${bot.activeFarm}</span>` : "";
    return `
      <div class="bot-item ${isSelected ? "active" : ""}" data-bot-id="${bot.id}" onclick="selectBot('${bot.id}')">
        <div class="bot-item-top">
          <div class="bot-item-info">
            <span class="bot-item-dot ${statusClass}"></span>
            <span class="bot-item-name">${bot.username}</span>
            ${followBadge}
            ${farmBadge}
          </div>
          <button class="bot-item-remove" onclick="event.stopPropagation(); removeBot('${bot.id}')" title="Kaldir">\u2715</button>
        </div>
        <div class="bot-item-bottom">
          <span class="bot-item-status">${statusLabel}</span>
          <span class="bot-item-pos" data-bot-pos="${bot.id}">${posText}</span>
        </div>
      </div>
    `;
  }).join("");
}

function updateDetailPanel(bot) {
  document.getElementById("detailEmpty").style.display = "none";
  document.getElementById("detailContent").style.display = "flex";
  document.getElementById("detailTitle").textContent = bot.username;
  document.getElementById("detailBotName").textContent = bot.username;
  document.getElementById("detailServer").textContent = `${bot.host}:${bot.port}`;

  const badge = document.getElementById("detailStatusBadge");
  badge.className = "bot-detail-status-badge";
  const statusMap = {
    online: { text: "Cevrimici", cls: "badge-online" },
    connecting: { text: "Baglaniyor", cls: "badge-connecting" },
    error: { text: "Hata", cls: "badge-error" },
    disconnected: { text: "Cevrimdisi", cls: "badge-offline" },
  };
  const s = statusMap[bot.status] || statusMap.disconnected;
  badge.textContent = s.text;
  badge.classList.add(s.cls);

  const actions = document.getElementById("detailActions");
  const reconnectBar = document.getElementById("reconnectBar");

  if (bot.status === "online" || bot.status === "connecting") {
    actions.innerHTML = `
      <button class="btn btn-sm btn-danger" onclick="disconnectSelectedBot()">\u23CF Cikar</button>
      <button class="btn btn-sm btn-danger" onclick="removeBot('${bot.id}')" style="margin-left:4px;">\u2715 Sil</button>
    `;
    reconnectBar.style.display = "none";
  } else {
    actions.innerHTML = `
      <button class="btn btn-sm btn-danger" onclick="removeBot('${bot.id}')">\u2715 Sistemden Sil</button>
    `;
    reconnectBar.style.display = "flex";
    document.getElementById("inputReconnectIp").value = `${bot.host}:${bot.port}`;
  }

  if (bot.position) {
    document.getElementById("statPos").textContent = `${bot.position.x}, ${bot.position.y}, ${bot.position.z}`;
  } else {
    document.getElementById("statPos").textContent = "- , - , -";
  }
  updateHealthFood(bot.health || 0, bot.food || 0);
}

function clearDetailPanel() {
  document.getElementById("detailEmpty").style.display = "flex";
  document.getElementById("detailContent").style.display = "none";
  document.getElementById("detailTitle").textContent = "Bot Detayi";
}

function updateHeaderStatus() {
  const onlineCount = bots.filter((b) => b.status === "online").length;
  const totalCount = bots.length;
  const dot = document.getElementById("statusDot");
  const text = document.getElementById("statusText");
  dot.className = "status-dot";
  if (onlineCount > 0) {
    dot.classList.add("online");
    text.textContent = `${onlineCount}/${totalCount} Aktif`;
  } else if (totalCount > 0) {
    dot.classList.add("connecting");
    text.textContent = `${totalCount} Bot`;
  } else {
    text.textContent = "0 Bot Aktif";
  }
}

function updateHealthFood(health, food) {
  const hp = Math.max(0, Math.min(20, health));
  const fd = Math.max(0, Math.min(20, food));
  document.getElementById("statHealthBar").style.width = `${(hp / 20) * 100}%`;
  document.getElementById("statHealth").textContent = `${Math.round(hp)}/20`;
  document.getElementById("statFoodBar").style.width = `${(fd / 20) * 100}%`;
  document.getElementById("statFood").textContent = `${Math.round(fd)}/20`;
}

function updateNamePreview() {
  const baseName = document.getElementById("inputBaseName").value.trim() || "Bot";
  const count = parseInt(document.getElementById("inputBotCount").value) || 1;
  if (count === 1) {
    document.getElementById("namePreviewList").textContent = baseName;
  } else {
    const items = [];
    const show = Math.min(count, 5);
    for (let i = 1; i <= show; i++) items.push(`${baseName}${i}`);
    if (count > 5) items.push(`...+${count - 5}`);
    document.getElementById("namePreviewList").textContent = items.join(", ");
  }
}

function openFarmModal(farmName) {
  editingFarmName = farmName || null;
  document.getElementById("farmModalOverlay").style.display = "flex";

  if (farmName && farms[farmName]) {
    const f = farms[farmName];
    document.getElementById("farmModalTitle").textContent = "Farm Duzenle";
    document.getElementById("farmName").value = f.name;
    document.getElementById("farmName").disabled = true;
    const setCoord = (id, pos) => {
      document.getElementById(id).value = pos ? `${pos.x} ${pos.y} ${pos.z}` : "";
    };
    setCoord("farmStart", f.startPos);
    setCoord("farmEnd", f.endPos);
    setCoord("farmStair", f.stairPos);
    document.getElementById("farmFloors").value = f.floors || 1;
    document.getElementById("farmDelay").value = f.delay || 500;
    document.getElementById("layerCommand").value = f.layerCommand || "";
    setCoord("chestNetherrack", f.chests?.netherrack);
    setCoord("chestSand", f.chests?.sand);
    setCoord("chestCactus", f.chests?.cactus);
    setCoord("chestTrash", f.chests?.trash);
    document.getElementById("layerNetherrack").checked = f.layers?.netherrack !== false;
    document.getElementById("layerSand").checked = f.layers?.sand !== false;
    document.getElementById("layerCactus").checked = f.layers?.cactus !== false;
  } else {
    document.getElementById("farmModalTitle").textContent = "Yeni Farm Olustur";
    document.getElementById("farmName").value = "";
    document.getElementById("farmName").disabled = false;
    document.getElementById("farmFloors").value = "1";
    document.getElementById("farmDelay").value = "500";
    document.getElementById("layerCommand").value = "";
    document.querySelectorAll(".modal-body input[type='text'], .modal-body input[type='number']").forEach((inp) => { 
        if(inp.id !== "farmFloors" && inp.id !== "farmDelay" && inp.id !== "layerCommand") inp.value = ""; 
    });
    document.getElementById("layerNetherrack").checked = true;
    document.getElementById("layerSand").checked = true;
    document.getElementById("layerCactus").checked = true;
  }
  updateLayerDeps();
}

function closeFarmModal() {
  document.getElementById("farmModalOverlay").style.display = "none";
  editingFarmName = null;
}

function saveFarm() {
  const name = document.getElementById("farmName").value.trim();
  if (!name) { addLog("Farm adi girin!", "error"); return; }

  const parseCoord = (id) => {
    const val = document.getElementById(id).value.trim();
    if (!val) return null;
    const parts = val.replace(/,/g, ' ').split(/\s+/).map(Number);
    return {
      x: isNaN(parts[0]) ? 0 : parts[0],
      y: isNaN(parts[1]) ? 0 : parts[1],
      z: isNaN(parts[2]) ? 0 : parts[2],
    };
  };

  const farmConfig = {
    name,
    startPos: parseCoord("farmStart"),
    endPos: parseCoord("farmEnd"),
    stairPos: parseCoord("farmStair"),
    floors: parseInt(document.getElementById("farmFloors").value) || 1,
    delay: parseInt(document.getElementById("farmDelay").value) || 500,
    layerCommand: document.getElementById("layerCommand").value.trim(),
    chests: {
      netherrack: parseCoord("chestNetherrack"),
      sand: parseCoord("chestSand"),
      cactus: parseCoord("chestCactus"),
      trash: parseCoord("chestTrash"),
    },
    layers: {
      netherrack: document.getElementById("layerNetherrack").checked,
      sand: document.getElementById("layerSand").checked,
      cactus: document.getElementById("layerCactus").checked,
    },
  };

  if (editingFarmName && farms[editingFarmName]?.progress) {
    farmConfig.progress = farms[editingFarmName].progress;
  }

  socket.emit("save_farm", farmConfig);
  closeFarmModal();
  addLog(`Farm "${name}" kaydedildi.`, "success");
}

function deleteFarm(farmName) {
  if (!confirm(`"${farmName}" farmini silmek istediginize emin misiniz?`)) return;
  socket.emit("delete_farm", farmName);
  addLog(`Farm "${farmName}" silindi.`, "warning");
}

function startFarm(farmName) {
  if (!selectedBotId) { addLog("Once bir bot secin!", "error"); return; }
  const bot = bots.find((b) => b.id === selectedBotId);
  if (!bot || bot.status !== "online") { addLog("Secili bot cevrimici degil!", "error"); return; }
  socket.emit("start_farm", { botId: selectedBotId, farmName });
  addLog(`Farm "${farmName}" baslatiliyor (Bot: ${bot.username})...`, "success");
}

function stopFarm(botId) {
  socket.emit("stop_farm", { botId: botId || selectedBotId });
  addLog("Farm durduruldu.", "warning");
}

function resetFarm(farmName) {
  if (!confirm(`"${farmName}" ilerlemesini sifirlamak istediginize emin misiniz?`)) return;
  socket.emit("reset_farm", farmName);
  addLog(`Farm "${farmName}" ilerlemesi sifirlandi.`, "warning");
}

function renderFarmsList() {
  const list = document.getElementById("farmList");
  const farmNames = Object.keys(farms);

  if (farmNames.length === 0) {
    list.innerHTML = '<div class="farm-list-empty">Henuz farm eklenmedi.</div>';
    return;
  }

  list.innerHTML = farmNames.map((name) => {
    const f = farms[name];
    const status = f.progress?.status || "idle";
    const statusClass = status === "building" ? "building" : status === "paused" ? "paused" : status === "completed" ? "completed" : status === "error" ? "error" : "";
    const statusLabel = status === "building" ? "Insa Ediliyor" : status === "paused" ? "Duraklatildi" : status === "completed" ? "Tamamlandi" : status === "error" ? "Hata" : "Hazir";

    const layerIcons = [];
    if (f.layers?.netherrack) layerIcons.push("\uD83E\uDDF1");
    if (f.layers?.sand) layerIcons.push("\uD83C\uDFD6\uFE0F");
    if (f.layers?.cactus) layerIcons.push("\uD83C\uDF35");

    const showProgress = status === "building" || status === "paused";
    const activeBot = bots.find((b) => b.activeFarm === name);
    const activeBotId = activeBot?.id;

    let actionButtons;
    if (status === "building" && activeBotId) {
      actionButtons = `<button class="farm-card-btn btn-stop" onclick="event.stopPropagation(); stopFarm('${activeBotId}')">\u23F8 Durdur</button>`;
    } else {
      actionButtons = `
        <button class="farm-card-btn btn-start" onclick="event.stopPropagation(); startFarm('${name}')">\u25B6 Baslat</button>
        <button class="farm-card-btn" onclick="event.stopPropagation(); openFarmModal('${name}')">\u270E</button>
        <button class="farm-card-btn btn-delete" onclick="event.stopPropagation(); deleteFarm('${name}')">\u2715</button>
      `;
    }

    return `
      <div class="farm-card">
        <div class="farm-card-top">
          <div class="farm-card-name">
            <span class="farm-status-dot ${statusClass}"></span>
            ${name}
          </div>
          <div class="farm-card-actions">${actionButtons}</div>
        </div>
        <div class="farm-card-info">
          <span>${layerIcons.join("")} ${f.floors || 1} kat</span>
          <span>${statusLabel}</span>
          ${f.progress?.totalBlocksPlaced ? `<span>${f.progress.totalBlocksPlaced} blok</span>` : ""}
        </div>
        ${showProgress ? `
          <div class="farm-progress-wrap"><div class="farm-progress-bar" id="farm-progress-${name}"></div></div>
          <div class="farm-progress-text" id="farm-progress-text-${name}">
            ${status === "paused" ? "Duraklatildi - Devam ettirmek icin Baslat'a basin" : "Insaat devam ediyor..."}
          </div>
        ` : ""}
        ${status === "paused" ? `
          <button class="farm-card-btn" onclick="event.stopPropagation(); resetFarm('${name}')" style="margin-top:4px;font-size:0.6rem;color:var(--warning);border-color:rgba(251,191,36,0.2);">\u21BA Ilerlemeyi Sifirla</button>
        ` : ""}
      </div>
    `;
  }).join("");
}

function updateLayerDeps() {
  const netherrack = document.getElementById("layerNetherrack");
  const sand = document.getElementById("layerSand");
  const cactus = document.getElementById("layerCactus");
  const info = document.getElementById("layerDepInfo");

  if (!netherrack.checked) {
    sand.checked = false;
    sand.disabled = true;
    cactus.checked = false;
    cactus.disabled = true;
    info.textContent = "Netherrack olmadan kum ve kaktus yerlestirilemez.";
    return;
  } else {
    sand.disabled = false;
  }

  if (!sand.checked) {
    cactus.checked = false;
    cactus.disabled = true;
    info.textContent = "Kum olmadan kaktus yerlestirilemez.";
    return;
  } else {
    cactus.disabled = false;
  }
  info.textContent = "";
}

function addLog(message, type) {
  addLogEntry(`[${new Date().toLocaleTimeString("tr-TR")}] ${message}`, type);
}

function addLogEntry(message, type) {
  const logBody = document.getElementById("logBody");
  const emptyMsg = logBody.querySelector(".log-empty");
  if (emptyMsg) emptyMsg.remove();

  const entry = document.createElement("div");
  entry.className = "log-entry";

  if (!type) {
    const lowerMsg = message.toLowerCase();
    if (lowerMsg.includes("hata") || lowerMsg.includes("error") || lowerMsg.includes("atildi")) type = "error";
    else if (lowerMsg.includes("baglanildi") || lowerMsg.includes("tamamlandi") || lowerMsg.includes("doguldu")) type = "success";
    else if (lowerMsg.includes("baglaniyor") || lowerMsg.includes("uyari") || lowerMsg.includes("ekleniyor") || lowerMsg.includes("yeniden")) type = "warning";
  }

  if (type) entry.classList.add(`log-${type}`);
  entry.textContent = message;
  logBody.appendChild(entry);
  logBody.scrollTop = logBody.scrollHeight;
  document.getElementById("logCount").textContent = `${logBody.querySelectorAll(".log-entry").length} satir`;
}

function clearLogs() {
  const logBody = document.getElementById("logBody");
  logBody.innerHTML = '<div class="log-empty">Log temizlendi.</div>';
  document.getElementById("logCount").textContent = "0 satir";
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("inputBaseName").addEventListener("input", updateNamePreview);
  document.getElementById("inputBotCount").addEventListener("input", updateNamePreview);
  updateNamePreview();
  document.getElementById("farmModalOverlay").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeFarmModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeFarmModal();
  });
});
