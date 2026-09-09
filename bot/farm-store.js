const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const FARMS_FILE = path.join(DATA_DIR, "farms.json");

class FarmStore {
  constructor() {
    this.ensureDataDir();
  }

  ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(FARMS_FILE)) fs.writeFileSync(FARMS_FILE, JSON.stringify({ farms: {} }, null, 2));
  }

  _load() {
    try {
      return JSON.parse(fs.readFileSync(FARMS_FILE, "utf8"));
    } catch (e) {
      return { farms: {} };
    }
  }

  _save(data) {
    fs.writeFileSync(FARMS_FILE, JSON.stringify(data, null, 2));
  }

  getAllFarms() {
    return this._load().farms;
  }

  getFarm(name) {
    return this._load().farms[name] || null;
  }

  saveFarm(farmConfig) {
    const data = this._load();
    if (!farmConfig.progress) {
      farmConfig.progress = {
        status: "idle",
        currentFloor: 0,
        currentLayer: "netherrack",
        currentBlockIndex: 0,
        totalBlocksPlaced: 0,
      };
    }
    data.farms[farmConfig.name] = farmConfig;
    this._save(data);
    return farmConfig;
  }

  deleteFarm(name) {
    const data = this._load();
    delete data.farms[name];
    this._save(data);
  }

  updateProgress(farmName, progress) {
    const data = this._load();
    if (data.farms[farmName]) {
      data.farms[farmName].progress = { ...data.farms[farmName].progress, ...progress };
      this._save(data);
    }
  }

  resetProgress(farmName) {
    this.updateProgress(farmName, {
      status: "idle",
      currentFloor: 0,
      currentLayer: "netherrack",
      currentBlockIndex: 0,
      totalBlocksPlaced: 0,
    });
  }
}

module.exports = FarmStore;
