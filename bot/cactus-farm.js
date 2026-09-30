const Vec3 = require("vec3").Vec3;
const { Movements, goals } = require("mineflayer-pathfinder");
const { GoalNear, GoalBlock } = goals;

class CactusFarm {
  constructor(bot, manager, config, farmStore) {
    this.bot = bot;
    this.manager = manager;
    this.config = config;
    this.farmStore = farmStore;
    this.stopped = false;
    this.minX = Math.min(config.startPos.x, config.endPos.x);
    this.maxX = Math.max(config.startPos.x, config.endPos.x);
    this.minZ = Math.min(config.startPos.z, config.endPos.z);
    this.maxZ = Math.max(config.startPos.z, config.endPos.z);
    this.baseY = config.startPos.y;
    this.width = this.maxX - this.minX + 1;
    this.length = this.maxZ - this.minZ + 1;
    this.totalBlocksPlaced = config.progress?.totalBlocksPlaced || 0;
    this._perimeterPath = null;
    this.refillThreshold = 64;
  }

  getFloorBaseY(floorIndex) {
    return this.baseY + floorIndex * 4;
  }

  getFramePositions(floorIndex) {
    const y = this.getFloorBaseY(floorIndex);
    const positions = [];
    for (let x = this.minX; x <= this.maxX; x++) {
      positions.push(new Vec3(x, y, this.minZ));
      positions.push(new Vec3(x, y, this.maxZ));
    }
    for (let z = this.minZ + 1; z < this.maxZ; z++) {
      positions.push(new Vec3(this.minX, y, z));
      positions.push(new Vec3(this.maxX, y, z));
    }
    return this.sortPerimeterLoop(positions);
  }

  sortPerimeterLoop(positions) {
    if (positions.length === 0) return positions;
    const stair = this.config.stairPos;
    let startIdx = 0;
    let minDist = Infinity;
    for (let i = 0; i < positions.length; i++) {
      let d = positions[i].distanceSquared(new Vec3(stair.x, positions[i].y, stair.z));
      if (d < minDist) { minDist = d; startIdx = i; }
    }
    let result = [];
    let current = positions.splice(startIdx, 1)[0];
    result.push(current);

    while(positions.length > 0) {
      let nextIdx = 0;
      let nextDist = Infinity;
      for (let i = 0; i < positions.length; i++) {
        let d = current.distanceSquared(positions[i]);
        if (d < nextDist) { nextDist = d; nextIdx = i; }
      }
      current = positions.splice(nextIdx, 1)[0];
      result.push(current);
    }
    return result;
  }

  getNetherrackPositions(floorIndex) {
    const y = this.getFloorBaseY(floorIndex);
    const positions = [];
    for (let x = this.minX; x <= this.maxX; x++) {
      for (let z = this.minZ; z <= this.maxZ; z++) {
        positions.push(new Vec3(x, y, z));
      }
    }
    return this.sortOptimizedSnake(positions, this.config.stairPos);
  }

  getSandPositions(floorIndex) {
    const y = this.getFloorBaseY(floorIndex) + 1;
    const positions = [];
    for (let x = this.minX; x <= this.maxX; x++) {
      for (let z = this.minZ; z <= this.maxZ; z++) {
        if ((x + z) % 2 === 0) positions.push(new Vec3(x, y, z));
      }
    }
    return this.sortOptimizedSnake(positions, this.config.stairPos);
  }

  getCactusPositions(floorIndex) {
    const y = this.getFloorBaseY(floorIndex) + 2;
    const positions = [];
    for (let x = this.minX; x <= this.maxX; x++) {
      for (let z = this.minZ; z <= this.maxZ; z++) {
        if ((x + z) % 2 === 0) positions.push(new Vec3(x, y, z));
      }
    }
    return this.sortOptimizedSnake(positions, this.config.stairPos);
  }

  sortOptimizedSnake(positions, stairPos) {
    if (positions.length === 0) return [];
    const corners = [
      new Vec3(this.minX, 0, this.minZ),
      new Vec3(this.maxX, 0, this.minZ),
      new Vec3(this.minX, 0, this.maxZ),
      new Vec3(this.maxX, 0, this.maxZ)
    ];
    let farthest = corners[0];
    let maxD = 0;
    for (let c of corners) {
      let d = Math.abs(c.x - stairPos.x) + Math.abs(c.z - stairPos.z);
      if (d > maxD) {
        maxD = d;
        farthest = c;
      }
    }
    const deltaX = Math.abs(farthest.x - stairPos.x);
    const deltaZ = Math.abs(farthest.z - stairPos.z);
    const primaryAxis = deltaZ > deltaX ? "z" : "x";
    const secondaryAxis = primaryAxis === "z" ? "x" : "z";

    let grouped = {};
    for (let p of positions) {
      let key = p[primaryAxis];
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(p);
    }

    let keys = Object.keys(grouped).map(Number);
    keys.sort((a, b) => {
      let distA = Math.abs(a - farthest[primaryAxis]);
      let distB = Math.abs(b - farthest[primaryAxis]);
      return distA - distB;
    });

    let sorted = [];
    let reverseSecondary = false;
    for (let k of keys) {
      let group = grouped[k];
      group.sort((a, b) => {
        let distA = Math.abs(a[secondaryAxis] - farthest[secondaryAxis]);
        let distB = Math.abs(b[secondaryAxis] - farthest[secondaryAxis]);
        return reverseSecondary ? distB - distA : distA - distB;
      });
      sorted.push(...group);
      reverseSecondary = !reverseSecondary;
    }
    return sorted;
  }

  sortFloorWithFrame(positions, stairPos) {
      const frameBlocks = [];
      const interiorBlocks = [];

      for (const p of positions) {
          if (p.x === this.minX || p.x === this.maxX || p.z === this.minZ || p.z === this.maxZ) {
              frameBlocks.push(p);
          } else {
              interiorBlocks.push(p);
          }
      }

      const sortedFrame = [];
      let current = null;
      let minDist = Infinity;

      for (const p of frameBlocks) {
          const d = Math.abs(p.x - stairPos.x) + Math.abs(p.z - stairPos.z);
          if (d < minDist) {
              minDist = d;
              current = p;
          }
      }

      if (current) {
          sortedFrame.push(current);
          let remaining = frameBlocks.filter(p => !p.equals(current));

          while (remaining.length > 0) {
              let next = null;
              let bestD = Infinity;
              let nextIdx = -1;

              for (let i = 0; i < remaining.length; i++) {
                  const p2 = remaining[i];
                  const dist = Math.abs(p2.x - current.x) + Math.abs(p2.z - current.z);
                  if (dist < bestD) {
                      bestD = dist;
                      next = p2;
                      nextIdx = i;
                  }
              }

              if (!next) break;

              sortedFrame.push(next);
              remaining.splice(nextIdx, 1);
              current = next;
          }
      }

      const sortedInterior = this.sortOptimizedSnake(interiorBlocks, stairPos);
      return [...sortedFrame, ...sortedInterior];
  }

  sortCactusRibbon(positions, stairPos) {
      if (positions.length === 0) return [];

      let zs = [...new Set(positions.map(p => p.z))].sort((a,b) => a-b);
      const distZ0 = Math.abs(zs[0] - stairPos.z);
      const distZ1 = Math.abs(zs[zs.length - 1] - stairPos.z);

      if (distZ1 > distZ0) {
          zs.reverse();
      }

      const sorted = [];
      for (let i = 0; i < zs.length; i += 3) {
          const groupZs = zs.slice(i, i + 3);
          let xs = [...new Set(positions.map(p => p.x))].sort((a,b) => a-b);

          const ribbonIndex = Math.floor(i / 3);
          if (ribbonIndex % 2 !== 0) {
              xs.reverse();
          }

          for (const x of xs) {
              for (const z of groupZs) {
                  const p = positions.find(pos => pos.x === x && pos.z === z);
                  if (p) sorted.push(p);
              }
          }
      }
      return sorted;
  }

  sortCactusVertical(positions, stairPos) {
      if (positions.length === 0) return [];

      const corners = [
          { x: this.minX, z: this.minZ },
          { x: this.maxX, z: this.minZ },
          { x: this.minX, z: this.maxZ },
          { x: this.maxX, z: this.maxZ }
      ];
      let farthest = corners[0];
      let maxD = 0;
      for (const c of corners) {
          const d = Math.abs(c.x - stairPos.x) + Math.abs(c.z - stairPos.z);
          if (d > maxD) { maxD = d; farthest = c; }
      }

      const dxFar = Math.abs(farthest.x - stairPos.x);
      const dzFar = Math.abs(farthest.z - stairPos.z);
      const verticalAxis = dxFar >= dzFar ? "x" : "z";
      const horizontalAxis = verticalAxis === "x" ? "z" : "x";

      const columns = {};
      for (const p of positions) {
          const key = p[horizontalAxis];
          if (!columns[key]) columns[key] = [];
          columns[key].push(p);
      }

      const hKeys = Object.keys(columns).map(Number);
      hKeys.sort((a, b) => {
          return Math.abs(a - farthest[horizontalAxis]) - Math.abs(b - farthest[horizontalAxis]);
      });

      const sorted = [];
      for (const key of hKeys) {
          const col = columns[key];
          col.sort((a, b) => {
              return Math.abs(a[verticalAxis] - farthest[verticalAxis]) - Math.abs(b[verticalAxis] - farthest[verticalAxis]);
          });
          sorted.push(...col);
      }

      return sorted;
  }

  getNeededItemsForFloor(floorIndex) {
    const layers = this.config.layers;
    const needed = new Set();
    if (layers.netherrack) needed.add("netherrack");
    if (layers.sand) needed.add("sand");
    if (layers.cactus) needed.add("cactus");
    return needed;
  }

  async dumpTrashToChest() {
    const trashChestCoord = this.config.chests?.trash;
    if (!trashChestCoord) return;

    const neededItems = this.getNeededItemsForFloor(0);
    const essentialItems = new Set([...neededItems, "diamond_pickaxe", "iron_pickaxe", "stone_pickaxe", "wooden_pickaxe", "netherite_pickaxe"]);

    const trashItems = this.bot.inventory.items().filter(item => !essentialItems.has(item.name));
    if (trashItems.length === 0) return;

    this.manager.log(`   Gereksiz esyalar cop sandigina birakiliyor (${trashItems.length} slot)...`);
    const trashPos = new Vec3(trashChestCoord.x, trashChestCoord.y, trashChestCoord.z);

    try {
      await this.navigateBasic(trashPos, 2, false);
      await this.sleep(300);
      const chestBlock = this.bot.blockAt(trashPos);
      if (!chestBlock) {
        this.manager.log(`   [UYARI] Cop sandigi bulunamadi!`);
        return;
      }

      const container = await this.bot.openContainer(chestBlock);
      await this.sleep(200);

      for (const item of trashItems) {
        try {
          await container.deposit(item.type, item.metadata, item.count);
          this.manager.log(`   Birakilan: ${item.name} x${item.count}`);
          await this.sleep(150);
        } catch (e) {
          this.manager.log(`   [UYARI] Cop sandigi dolu, birakilamayan: ${item.name}`);
          break;
        }
      }
      container.close();
      this.manager.log(`   Cop sandigi islemi tamamlandi.`);
    } catch (err) {
      this.manager.log(`   [UYARI] Cop sandigi hatasi: ${err.message}`);
    }
  }

  async build() {
    this.stopped = false;
    const cfg = this.config;
    const progress = cfg.progress || {};
    this.manager.log(`Farm "${cfg.name}" insaati basliyor...`);
    this.updateFarmStatus("building");
    const startFloor = progress.status === "building" ? progress.currentFloor || 0 : 0;
    try {
      for (let floor = startFloor; floor < cfg.floors; floor++) {
        if (this.stopped) break;
        this.manager.log(`\n=== KAT ${floor + 1}/${cfg.floors} ===`);

        await this.dumpTrashToChest();
        if (this.stopped) break;

        await this.climbToFloor(floor);
        if (this.stopped) break;

        await this.buildFloor(floor);
        if (this.stopped) break;
        if (floor < cfg.floors - 1) {
          this.manager.log(`Merdiven insaa ediliyor...`);
          await this.buildStaircase(floor, floor + 1);
          if (this.stopped) break;
        }
      }
      if (!this.stopped) {
        this.manager.log(`Farm "${cfg.name}" tamamlandi! Toplam ${this.totalBlocksPlaced} blok.`);
        this.updateFarmStatus("completed");
      } else {
        this.manager.log(`Farm "${cfg.name}" durduruldu.`);
        this.updateFarmStatus("paused");
      }
    } catch (err) {
      if (err.message === "BUILD_STOPPED") {
        this.manager.log(`Farm "${cfg.name}" durduruldu.`);
        this.updateFarmStatus("paused");
      } else {
        this.manager.log(`Farm hatasi: ${err.message}`);
        this.updateFarmStatus("error");
        throw err;
      }
    }
  }

  async buildFloor(floorIndex) {
    const layers = this.config.layers;
    const progress = this.config.progress || {};

    const layerNames = [];
    if (layers.netherrack) layerNames.push("netherrack");
    if (layers.sand) layerNames.push("sand");
    if (layers.cactus) layerNames.push("cactus");

    let startIdx = 0;
    if (progress.status === "building" && progress.currentFloor === floorIndex) {
        startIdx = layerNames.indexOf(progress.currentLayer);
        if (startIdx === -1) startIdx = 0;
    }

    for (let i = startIdx; i < layerNames.length; i++) {
        if (this.stopped) throw new Error("BUILD_STOPPED");
        const currentLayer = layerNames[i];

        if (currentLayer === "netherrack") {
            this.manager.log(`   NETHERRACK katmani basliyor (cerceve + ic)...`);
            let floorPos = this.getNetherrackPositions(floorIndex);
            floorPos = this.sortFloorWithFrame(floorPos, this.config.stairPos);
            await this.buildLayer(floorPos, "netherrack", floorIndex, "netherrack");
        }
        else if (currentLayer === "sand") {
            this.manager.log(`   SAND katmani basliyor...`);
            let floorPos = this.getSandPositions(floorIndex);
            floorPos = this.sortCactusVertical(floorPos, this.config.stairPos);
            await this.buildLayer(floorPos, "sand", floorIndex, "sand");
        }
        else if (currentLayer === "cactus") {
            this.manager.log(`   CACTUS katmani basliyor...`);
            let floorPos = this.getCactusPositions(floorIndex);
            floorPos = this.sortCactusVertical(floorPos, this.config.stairPos);
            await this.buildLayer(floorPos, "cactus", floorIndex, "cactus");
        }
    }
  }

  async buildLayer(positions, blockType, floorIndex, layerName) {
    const progress = this.config.progress || {};
    let startIndex = 0;
    if (progress.status === "building" && progress.currentFloor === floorIndex && progress.currentLayer === layerName) {
      startIndex = progress.currentBlockIndex || 0;
    }

    const floorY = this.getFloorBaseY(floorIndex);
    const isSandOrCactus = layerName === "sand" || layerName === "cactus";

    let i = startIndex;
    let retryCount = 0;
    while (i < positions.length) {
      if (this.stopped) {
        this.saveProgress(floorIndex, layerName, i);
        throw new Error("BUILD_STOPPED");
      }

      while (i < positions.length) {
        let existing = this.bot.blockAt(positions[i]);
        if (existing && existing.name !== "air" && existing.name !== "void_air" && existing.name !== "cave_air") {
          this.totalBlocksPlaced++;
          i++;
        } else {
          break;
        }
      }
      if (i >= positions.length) break;

      let chunkSize = layerName === "cactus" ? 3 : 7;
      let targetIndex = Math.min(i + Math.floor(chunkSize / 2), positions.length - 1);
      let targetPos = positions[targetIndex];
      let neededCount = positions.length - i;

      await this.checkAndRefill(blockType, neededCount, floorIndex);

      if (isSandOrCactus) {
          await this.navigateToAdjacent(targetPos, floorY);
      } else {
          await this.navigateToStance(targetPos);
      }

      let placedCount = 0;
      while (i < positions.length && placedCount < chunkSize) {
        if (this.stopped) throw new Error("BUILD_STOPPED");

        let currentPos = positions[i];
        let currExisting = this.bot.blockAt(currentPos);
        if (currExisting && currExisting.name !== "air" && currExisting.name !== "void_air" && currExisting.name !== "cave_air") {
           this.totalBlocksPlaced++;
           i++;
           continue;
        }

        if (this.isBotStandingAt(currentPos)) {
            await this.moveAwayFrom(currentPos, floorIndex);
        }

        const eyePos = this.bot.entity.position.offset(0, this.bot.entity.height, 0);
        const blockCenter = currentPos.offset(0.5, 0.5, 0.5);
        if (eyePos.distanceTo(blockCenter) > 4.5) {
            if (placedCount === 0) {
                retryCount++;
                if (retryCount > 3) {
                    this.manager.log(`   Kritik: Ulasilamiyor (${currentPos.x},${currentPos.y},${currentPos.z}), atliyorum.`);
                    i++;
                    retryCount = 0;
                    await this.sleep(100);
                    continue;
                }
                if (isSandOrCactus) {
                    await this.navigateToAdjacent(currentPos, floorY);
                } else {
                    await this.navigateToStance(currentPos);
                }
                continue; // Ayni blogu tekrar dene
            }
            break;
        }

        const equipped = await this.equipBlock(blockType);
        if (!equipped) {
            this.manager.log(`[HATA] Envanterde ${blockType} kalmadi! Lutfen sandiklari kontrol edip tekrar baslatin.`);
            this.stop();
            throw new Error("BUILD_STOPPED");
        }

        try {
            await this.placeBlock(currentPos, blockType);
            this.totalBlocksPlaced++;
            retryCount = 0;
        } catch (err) {
            if (err.message === "BUILD_STOPPED") throw err;
            if (placedCount === 0) {
                retryCount++;
                if (retryCount > 3) {
                    this.manager.log(`   Blok yerlestirilemedi (${currentPos.x},${currentPos.y},${currentPos.z}), atliyorum.`);
                    i++;
                    retryCount = 0;
                    await this.sleep(100);
                    continue;
                }
                if (isSandOrCactus) {
                    await this.navigateToAdjacent(currentPos, floorY);
                } else {
                    await this.navigateToStance(currentPos);
                }
                continue; // Ayni blogu tekrar dene
            }
            break;
        }

        this.emitProgress(floorIndex, layerName, i, positions.length);
        if (i % 10 === 0) this.saveProgress(floorIndex, layerName, i);

        await this.sleep(this.config.delay || 150);
        i++;
        placedCount++;
      }
    }

    this.manager.log(`   ${layerName.toUpperCase()} kontrol (Verification) ediliyor...`);
    let missing = [];
    for (let pos of positions) {
        let b = this.bot.blockAt(pos);
        if (!b || b.name !== blockType) {
            missing.push(pos);
        }
    }

    if (missing.length > 0) {
        this.manager.log(`   Eksik/hatali ${missing.length} blok bulundu! Tamamlaniyor...`);
        for (let pos of missing) {
            if (this.stopped) throw new Error("BUILD_STOPPED");

            await this.checkAndRefill(blockType, missing.length, floorIndex);

            if (this.isBotStandingAt(pos)) {
                await this.moveAwayFrom(pos, floorIndex);
            }

            if (isSandOrCactus) {
                await this.navigateToAdjacent(pos, floorY);
            } else {
                await this.navigateToStance(pos);
            }

            const equipped = await this.equipBlock(blockType);
            if (!equipped) {
                this.manager.log(`[HATA] Envanterde ${blockType} yok.`);
                this.stop();
                throw new Error("BUILD_STOPPED");
            }

            try {
                await this.placeBlock(pos, blockType);
                this.totalBlocksPlaced++;
            } catch(e) {}
            await this.sleep(this.config.delay || 150);
        }
        this.manager.log(`   Eksikler tamamlandi.`);
    } else {
        this.manager.log(`   ${layerName.toUpperCase()} kusursuz!`);
    }

    if (this.config.layerCommand) {
        this.manager.log(`   Katman sonu komutu calistiriliyor: ${this.config.layerCommand}`);
        this.bot.chat(this.config.layerCommand);
        await this.sleep(1000);
    }

    this.saveProgress(floorIndex, this.getNextLayerName(layerName, false) || layerName, 0);
  }

  getNextLayerName(currentLayer, hasFrame) {
    const order = [];
    if (hasFrame) order.push("frame");
    order.push("netherrack", "sand", "cactus");
    const idx = order.indexOf(currentLayer);
    return idx < order.length - 1 ? order[idx + 1] : null;
  }

  generatePerimeterPath() {
    if (this._perimeterPath) return this._perimeterPath;
    const path = [];
    const ox1 = this.minX - 1;
    const ox2 = this.maxX + 1;
    const oz1 = this.minZ - 1;
    const oz2 = this.maxZ + 1;
    for (let x = ox2; x > ox1; x--) path.push({ x, z: oz2 });
    for (let z = oz2; z > oz1; z--) path.push({ x: ox1, z });
    for (let x = ox1; x < ox2; x++) path.push({ x, z: oz1 });
    for (let z = oz1; z < oz2; z++) path.push({ x: ox2, z });
    const stair = this.config.stairPos;
    let minDist = Infinity;
    let startIdx = 0;
    for (let i = 0; i < path.length; i++) {
      const dx = path[i].x - stair.x;
      const dz = path[i].z - stair.z;
      const dist = dx * dx + dz * dz;
      if (dist < minDist) { minDist = dist; startIdx = i; }
    }
    this._perimeterPath = [...path.slice(startIdx), ...path.slice(0, startIdx)];
    return this._perimeterPath;
  }

  getStaircaseSteps(fromFloor, toFloor) {
    const perim = this.generatePerimeterPath();
    const startStepGlobal = fromFloor * 4;
    const stepsNeeded = 4;
    const steps = [];
    for (let s = 0; s < stepsNeeded; s++) {
      const globalStep = startStepGlobal + s;
      const y = this.baseY + globalStep;
      const idx1 = globalStep % perim.length;
      const idx2 = (globalStep + 1) % perim.length;
      steps.push({
        blocks: [
          new Vec3(perim[idx1].x, y, perim[idx1].z),
          new Vec3(perim[idx2].x, y, perim[idx2].z),
        ],
        y,
      });
    }
    return steps;
  }

  async buildStaircase(fromFloor, toFloor) {
    const steps = this.getStaircaseSteps(fromFloor, toFloor);
    for (const step of steps) {
      if (this.stopped) throw new Error("BUILD_STOPPED");
      for (const blockPos of step.blocks) {
        try {
          const existing = this.bot.blockAt(blockPos);
          if (existing && existing.name !== "air" && existing.name !== "void_air") continue;

          await this.checkAndRefill("netherrack");
          await this.navigateBasic(blockPos, 3, false);
          const equipped = await this.equipBlock("netherrack");
          if (!equipped) throw new Error(`Netherrack yok.`);
          await this.placeBlock(blockPos, "netherrack");
          this.totalBlocksPlaced++;
        } catch (err) {
          if (err.message === "BUILD_STOPPED") throw err;
        }
        await this.sleep(this.config.delay || 150);
      }
    }
  }

  async climbStaircase(toFloor) {
    const steps = this.getStaircaseSteps(toFloor - 1, toFloor);
    if (steps.length === 0) return;
    const lastStep = steps[steps.length - 1];
    const targetPos = lastStep.blocks[lastStep.blocks.length - 1];
    await this.navigatePrecise(targetPos.offset(0, 1, 0));
  }

  async climbToFloor(targetFloor) {
      if (targetFloor === 0) {
          const start = new Vec3(this.config.stairPos.x, this.baseY + 1, this.config.stairPos.z);
          await this.navigatePrecise(start);
          return;
      }

      this.manager.log(`   Merdivenler kullanilarak Kat ${targetFloor + 1}'e cikiliyor...`);
      for (let f = 0; f < targetFloor; f++) {
          const steps = this.getStaircaseSteps(f, f + 1);
          for (const step of steps) {
              const pos = step.blocks[1];
              await this.navigatePrecise(pos.offset(0, 1, 0));
          }
      }
  }

  countInventoryItem(blockType) {
    return this.bot.inventory.items()
      .filter((item) => item.name === blockType)
      .reduce((sum, item) => sum + item.count, 0);
  }

  async checkAndRefill(blockType, neededCount = 64 * 35, floorIndex = null) {
    const count = this.countInventoryItem(blockType);
    if (count >= Math.min(neededCount, this.refillThreshold)) return;

    const botYBefore = this.bot.entity.position.y;

    if (blockType === "sand" || blockType === "cactus") {
      await this.refillHalfAndHalfExact(neededCount);
    } else {
      const targetAmount = Math.min(neededCount, 64 * 35);
      await this.refillFromChest(blockType, targetAmount);
    }

    if (floorIndex !== null) {
      const floorY = this.getFloorBaseY(floorIndex);
      const botYAfter = this.bot.entity.position.y;
      if (Math.abs(botYAfter - (floorY + 1)) > 2) {
        await this.returnToFloorViaStair(floorIndex);
      }
    }
  }

  async dumpExcessItem(blockType, keepAmount) {
    const chestCoord = this.config.chests?.[blockType];
    if (!chestCoord) return;
    const chestPos = new Vec3(chestCoord.x, chestCoord.y, chestCoord.z);

    let currentCount = this.countInventoryItem(blockType);
    if (currentCount <= keepAmount) return;

    try {
      await this.navigateBasic(chestPos, 2, false);
      await this.sleep(300);
      const chestBlock = this.bot.blockAt(chestPos);
      if (!chestBlock) return;

      const container = await this.bot.openContainer(chestBlock);
      await this.sleep(200);

      let toDump = currentCount - keepAmount;
      const botItems = this.bot.inventory.items().filter(i => i.name === blockType);

      for (const item of botItems) {
        if (toDump <= 0) break;
        const take = Math.min(item.count, toDump);
        try {
          await container.deposit(item.type, item.metadata, take);
          toDump -= take;
          await this.sleep(150);
        } catch (e) {
          break;
        }
      }
      container.close();
    } catch (err) {}
  }

  async refillHalfAndHalfExact(neededCount) {
    let netherrackCount = this.countInventoryItem("netherrack");
    if (netherrackCount > 64) {
      await this.dumpExcessItem("netherrack", 64);
      let remaining = this.countInventoryItem("netherrack");
      if (remaining > 64) {
          this.manager.log(`   Netherrack sandigi dolu! Fazlaliklar yere atiliyor...`);
          await this.tossExcessItem("netherrack", 64);
      }
    }
    const targetAmount = Math.min(neededCount, 64 * 17);
    await this.refillFromChest("sand", targetAmount);
    await this.refillFromChest("cactus", targetAmount);
  }

  async refillFromChest(blockType, maxAmount) {
    const chestCoord = this.config.chests?.[blockType];
    if (!chestCoord) return;

    let currentCount = this.countInventoryItem(blockType);
    if (currentCount >= maxAmount) return;

    const chestPos = new Vec3(chestCoord.x, chestCoord.y, chestCoord.z);
    try {
      await this.navigateBasic(chestPos, 2, false);
      await this.sleep(300);
      const chestBlock = this.bot.blockAt(chestPos);
      if (!chestBlock) return;

      const container = await this.bot.openContainer(chestBlock);
      await this.sleep(200);

      const chestItems = container.containerItems ? container.containerItems() : container.items();
      const targetItems = chestItems.filter((item) => item.name === blockType);

      if (targetItems.length === 0) {
        container.close();
        return;
      }

      let remaining = maxAmount - currentCount;
      for (const item of targetItems) {
        if (remaining <= 0) break;
        const take = Math.min(item.count, remaining);
        try {
          await container.withdraw(item.type, item.metadata, take);
          remaining -= take;
          await this.sleep(150);
        } catch (e) {}
      }
      container.close();
    } catch (err) {}
  }

  setupPathfinder(avoidCactus = false, avoidSand = false) {
    const mcData = require("minecraft-data")(this.bot.version);
    const movements = new Movements(this.bot, mcData);
    movements.canDig = false;
    movements.canPlace = false;
    movements.maxDropDown = 1;
    if (avoidCactus && mcData.blocksByName.cactus) {
        movements.blocksToAvoid.add(mcData.blocksByName.cactus.id);
    }
    if (avoidSand && mcData.blocksByName.sand) {
        movements.blocksToAvoid.add(mcData.blocksByName.sand.id);
    }
    this.bot.pathfinder.setMovements(movements);
  }

  waitForGoal(timeoutMs = 6000) {
    return new Promise((resolve) => {
      let resolved = false;
      const cleanup = () => {
        if (resolved) return;
        resolved = true;
        this.bot.removeListener("goal_reached", onGoal);
        this.bot.removeListener("path_update", onPath);
        clearTimeout(timeout);
      };
      const timeout = setTimeout(() => {
        this.bot.pathfinder.setGoal(null);
        cleanup();
        resolve("timeout");
      }, timeoutMs);
      const onGoal = () => {
        cleanup();
        resolve("reached");
      };
      const onPath = (results) => {
        if (results.status === "noPath") {
          cleanup();
          resolve("noPath");
        }
      };
      this.bot.once("goal_reached", onGoal);
      this.bot.on("path_update", onPath);
    });
  }

  async navigatePrecise(pos, avoidSand = false) {
      const botPos = this.bot.entity.position;
      if (botPos.distanceTo(pos) <= 0.8) return;

      try {
          this.setupPathfinder(true, avoidSand);
          this.bot.setControlState('sprint', true);
          this.bot.pathfinder.setGoal(new GoalNear(pos.x, pos.y, pos.z, 2));
          let res = await this.waitForGoal(4000);

          if (res === "noPath") {
              await this.breakCactusInWay(pos);
          }

          this.setupPathfinder(false, avoidSand);
          this.bot.pathfinder.setGoal(new GoalNear(pos.x, pos.y, pos.z, 0.5));
          await this.waitForGoal(2000);

          this.bot.setControlState('sprint', false);
      } catch (e) {
          this.bot.setControlState('sprint', false);
      }
  }

  async breakCactusInWay(targetPos) {
      const botPos = this.bot.entity.position;
      if (botPos.distanceTo(targetPos) > 8) return;

      const blocks = this.bot.findBlocks({
          matching: this.bot.registry.blocksByName.cactus?.id,
          maxDistance: 4,
          count: 3
      });

      for (let p of blocks) {
          const b = this.bot.blockAt(p);
          if (b) {
              this.manager.log(`   [Yol Acma] Kaktus kiriliyor: ${p.x},${p.y},${p.z}`);
              const pickaxe = this.bot.inventory.items().find(i => i.name.includes("pickaxe"));
              if (pickaxe) {
                  try { await this.bot.equip(pickaxe, "hand"); } catch(e){}
              }
              try { await this.bot.dig(b, true); } catch(e){}
          }
      }
  }

  async navigateBasic(pos, range = 2, avoidCactus = true, avoidSand = false) {
    const botPos = this.bot.entity.position;
    if (botPos.distanceTo(pos) <= range) return;
    try {
      this.setupPathfinder(avoidCactus, avoidSand);
      this.bot.setControlState('sprint', true);
      const goal = new GoalNear(pos.x, pos.y, pos.z, range);
      this.bot.pathfinder.setGoal(goal);
      await this.waitForGoal(6000);
      this.bot.setControlState('sprint', false);
    } catch (e) {
      this.bot.setControlState('sprint', false);
    }
  }

  async tossExcessItem(blockType, keepAmount) {
    const stairPos = this.config.stairPos;
    const tossPos = new Vec3(stairPos.x, this.baseY + 1, stairPos.z);
    await this.navigateBasic(tossPos, 2, false);
    await this.sleep(200);

    let items = this.bot.inventory.items().filter(i => i.name === blockType);
    let currentCount = items.reduce((s, i) => s + i.count, 0);
    let toDrop = currentCount - keepAmount;
    for (const item of items) {
        if (toDrop <= 0) break;
        const dropAmount = Math.min(item.count, toDrop);
        try {
            await this.bot.toss(item.type, item.metadata, dropAmount);
            toDrop -= dropAmount;
            await this.sleep(100);
        } catch(e) {}
    }
  }

  async navigateToAdjacent(targetPos, floorY) {
      const dirs = [
          new Vec3(1, 0, 0), new Vec3(-1, 0, 0),
          new Vec3(0, 0, 1), new Vec3(0, 0, -1)
      ];

      const botPos = this.bot.entity.position;
      let candidates = [];

      for (const d of dirs) {
          const adjX = targetPos.x + d.x;
          const adjZ = targetPos.z + d.z;

          if (adjX < this.minX - 1 || adjX > this.maxX + 1 ||
              adjZ < this.minZ - 1 || adjZ > this.maxZ + 1) continue;

          const isEmptySquare = (adjX + adjZ) % 2 !== 0;

          const cactusBlock = this.bot.blockAt(new Vec3(adjX, floorY + 2, adjZ));
          if (cactusBlock && cactusBlock.name === "cactus") continue;

          const sandBlock = this.bot.blockAt(new Vec3(adjX, floorY + 1, adjZ));
          const hasSand = sandBlock && sandBlock.name !== "air" && sandBlock.name !== "void_air" && sandBlock.name !== "cave_air";

          const groundBlock = this.bot.blockAt(new Vec3(adjX, floorY, adjZ));
          const hasGround = groundBlock && groundBlock.name !== "air" && groundBlock.name !== "void_air" && groundBlock.name !== "cave_air";

          if (!hasGround && !hasSand) continue;

          let standY;
          if (hasSand) {
              standY = floorY + 2; // Kumun ustunde dur
          } else {
              standY = floorY + 1; // Netherrack ustunde dur
          }

          const standPos = new Vec3(adjX, standY, adjZ);
          const dist = botPos.distanceTo(standPos);

          candidates.push({
              pos: standPos,
              dist: dist,
              isEmptySquare: isEmptySquare,
              hasSand: hasSand
          });
      }

      candidates.sort((a, b) => {
          if (a.isEmptySquare && !b.isEmptySquare) return -1;
          if (!a.isEmptySquare && b.isEmptySquare) return 1;
          if (!a.hasSand && b.hasSand) return -1;
          if (a.hasSand && !b.hasSand) return 1;
          return a.dist - b.dist;
      });

      if (candidates.length > 0) {
          await this.navigatePrecise(candidates[0].pos, true);
      } else {
          for (const d of dirs) {
              const fbPos = new Vec3(targetPos.x + d.x, floorY + 1, targetPos.z + d.z);
              await this.navigatePrecise(fbPos, true);
              return;
          }
      }
  }

  async navigateToStance(targetPos) {
    const dirs = [new Vec3(1,0,0), new Vec3(-1,0,0), new Vec3(0,0,1), new Vec3(0,0,-1)];
    let standPos = null;
    for (const d of dirs) {
        const adj = targetPos.plus(d);
        const b = this.bot.blockAt(adj);
        if (b && b.name !== "air" && b.name !== "void_air" && b.name !== "cave_air") {
            standPos = adj;
            break;
        }
    }

    let goal;
    if (standPos) {
        goal = new GoalNear(standPos.x, standPos.y + 1, standPos.z, 0.5);
    } else {
        const below = targetPos.offset(0, -1, 0);
        const b = this.bot.blockAt(below);
        if (b && b.name !== "air" && b.name !== "void_air" && b.name !== "cave_air") {
           goal = new GoalNear(below.x, below.y + 1, below.z, 0.5);
        } else {
           goal = new GoalNear(targetPos.x, targetPos.y, targetPos.z, 2);
        }
    }

    try {
      this.setupPathfinder(false);
      this.bot.setControlState('sprint', true);
      this.bot.pathfinder.setGoal(goal);
      await this.waitForGoal(5000);
      this.bot.setControlState('sprint', false);
    } catch (e) {
      this.bot.setControlState('sprint', false);
    }
  }

  async equipBlock(blockType) {
    const item = this.bot.inventory.items().find((i) => i.name === blockType);
    if (item) {
      try {
        await this.bot.equip(item, "hand");
        return true;
      } catch (e) {
        return false;
      }
    } else {
      return false;
    }
  }

  async placeBlock(pos, blockType = null) {
    const refPos = pos.offset(0, -1, 0);
    const refBlock = this.bot.blockAt(refPos);
    if (refBlock && refBlock.name !== "air" && refBlock.name !== "void_air" && refBlock.name !== "cave_air") {
      try {
        await this.bot.lookAt(pos.offset(0.5, 0, 0.5));
        await this.sleep(50);
        await this.bot.placeBlock(refBlock, new Vec3(0, 1, 0));
        return;
      } catch (e) {}
    }
    if (blockType === "cactus") {
      throw new Error("Referans blok bulunamadi (kaktus alttan yerlestirilmeli)");
    }
    const sides = [new Vec3(1, 0, 0), new Vec3(-1, 0, 0), new Vec3(0, 0, 1), new Vec3(0, 0, -1)];
    for (const side of sides) {
      const sidePos = pos.plus(side);
      const sideBlock = this.bot.blockAt(sidePos);
      if (sideBlock && sideBlock.name !== "air" && sideBlock.name !== "void_air" && sideBlock.name !== "cave_air") {
        try {
          await this.bot.placeBlock(sideBlock, new Vec3(-side.x, -side.y, -side.z));
          return;
        } catch (e) { continue; }
      }
    }
    throw new Error("Referans blok bulunamadi");
  }

  isBotStandingAt(pos) {
    const bp = this.bot.entity.position;
    return Math.abs(bp.x - (pos.x + 0.5)) < 0.8
        && Math.abs(bp.z - (pos.z + 0.5)) < 0.8
        && Math.abs(bp.y - pos.y) < 1.8;
  }

  async moveAwayFrom(pos, floorIndex) {
    const floorY = this.getFloorBaseY(floorIndex);
    const dirs = [
        new Vec3(1, 0, 0), new Vec3(-1, 0, 0),
        new Vec3(0, 0, 1), new Vec3(0, 0, -1)
    ];
    for (const d of dirs) {
        const adjX = pos.x + d.x;
        const adjZ = pos.z + d.z;
        if ((adjX + adjZ) % 2 !== 0) {
            const groundBlock = this.bot.blockAt(new Vec3(adjX, floorY, adjZ));
            if (groundBlock && groundBlock.name !== "air" && groundBlock.name !== "void_air") {
                await this.navigatePrecise(new Vec3(adjX, floorY + 1, adjZ), true);
                return;
            }
        }
    }
    const d = dirs[0];
    await this.navigatePrecise(new Vec3(pos.x + d.x, floorY + 1, pos.z + d.z), true);
  }

  async returnToFloorViaStair(floorIndex) {
    this.manager.log(`   Merdiven noktasindan Kat ${floorIndex + 1}'e giriliyor...`);
    await this.climbToFloor(floorIndex);
  }

  saveProgress(floor, layer, blockIndex) {
    const progress = {
      status: this.stopped ? "paused" : "building",
      currentFloor: floor,
      currentLayer: layer,
      currentBlockIndex: blockIndex,
      totalBlocksPlaced: this.totalBlocksPlaced,
    };
    this.config.progress = progress;
    if (this.farmStore) this.farmStore.updateProgress(this.config.name, progress);
  }

  updateFarmStatus(status) {
    if (this.config.progress) this.config.progress.status = status;
    if (this.farmStore) this.farmStore.updateProgress(this.config.name, { status });
    this.manager.io.emit("farm_status", { farmName: this.config.name, status });
  }

  emitProgress(floor, layer, blockIndex, totalInLayer) {
    this.manager.io.emit("farm_progress", {
      farmName: this.config.name,
      floor: floor + 1,
      totalFloors: this.config.floors,
      layer,
      blockIndex,
      totalInLayer,
      totalBlocksPlaced: this.totalBlocksPlaced,
    });
  }

  stop() { this.stopped = true; }
  sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
}

module.exports = CactusFarm;
