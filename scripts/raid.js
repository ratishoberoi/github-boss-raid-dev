const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const ASSETS_DIR = path.join(ROOT, "assets");

const BOSS_PATH = path.join(DATA_DIR, "boss.json");
const LEADERBOARD_PATH = path.join(DATA_DIR, "leaderboard.json");
const ATTACKS_PATH = path.join(DATA_DIR, "attacks.json");
const HALL_OF_FAME_PATH = path.join(DATA_DIR, "hall_of_fame.json");
const BOSS_REGISTRY_PATH = path.join(DATA_DIR, "boss_registry.json");
const LOOT_REGISTRY_PATH = path.join(DATA_DIR, "loot_registry.json");
const PLAYER_INVENTORY_PATH = path.join(DATA_DIR, "player_inventory.json");
const LEGENDARY_DROPS_PATH = path.join(DATA_DIR, "legendary_drops.json");
const LOCK_PATH = path.join(DATA_DIR, ".raid.lock");
const README_PATH = path.join(ROOT, "README.md");
const SVG_PATH = path.join(ASSETS_DIR, "boss-card.svg");
const BOSS_ASSET_DIR = path.join(ASSETS_DIR, "bosses");

const DEFAULT_BOSS = {
  boss_id: "hallucination_titan",
  boss_name: "The Hallucination Titan",
  max_hp: 1000,
  current_hp: 1000,
  phase: "Phase 1"
};

const DEFAULT_BOSS_REGISTRY = [
  {
    id: "hallucination_titan",
    name: "The Hallucination Titan",
    title: "Corrupted AI God",
    lore: "A towering oracle that speaks in impossible outputs and bends reality around false predictions.",
    theme: "Corrupted AI god",
    phase_1: "Normal form: a luminous titan wrapped in stable prediction rings.",
    phase_2: "Mutated form: duplicate faces split from its skull and argue across the arena.",
    phase_3: "Corrupted form: error sigils tear through its body as hallucinated limbs emerge.",
    phase_4: "Final Nightmare form: a fractured godhead broadcasting contradictory realities."
  }
];

const ATTACKS = {
  "Slash": { min: 5, max: 20 },
  "Critical Strike": { min: 0, max: 100 },
  "Lucky Attack": { min: 1, max: 500 }
};

const RARITIES = ["Common", "Rare", "Epic", "Legendary", "Mythic"];

const DEFAULT_LOOT_REGISTRY = {
  drop_rates: {
    Common: 80,
    Rare: 15,
    Epic: 4,
    Legendary: 0.9,
    Mythic: 0.1
  },
  items: {
    Common: ["Broken Dataset", "Corrupted CSV", "Memory Fragment", "Lost Token"],
    Rare: ["Neural Fragment", "Gradient Crystal", "Training Core", "Prompt Shard"],
    Epic: ["Ancient GPU", "Quantum Cache", "Model Heart", "Tensor Prism"],
    Legendary: ["Golden Tensor", "AGI Fragment", "Infinity Prompt", "Neural Crown"],
    Mythic: ["Source Code of Consciousness", "The First Model", "The Final Dataset"]
  }
};

const NEXT_BOSSES = [
  "Chrome Revenant",
  "Circuit Lich",
  "Void Compiler",
  "Quantum Tyrant",
  "Null Hydra",
  "Obsidian Daemon",
  "Static Overlord",
  "Cipher Colossus"
];

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
  fs.mkdirSync(BOSS_ASSET_DIR, { recursive: true });
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function warn(message) {
  process.stderr.write(`[raid] ${message}\n`);
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    return deepClone(fallback);
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    warn(`Recovering from malformed JSON in ${path.relative(ROOT, filePath)}: ${error.message}`);
    return deepClone(fallback);
  }
}

function fsyncDirectory(dirPath) {
  try {
    const dirFd = fs.openSync(dirPath, "r");
    try {
      fs.fsyncSync(dirFd);
    } finally {
      fs.closeSync(dirFd);
    }
  } catch (_error) {
    // Directory fsync is best-effort across platforms.
  }
}

function atomicWriteFile(filePath, contents) {
  ensureDirs();
  const dirPath = path.dirname(filePath);
  const tempPath = path.join(
    dirPath,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`
  );
  const fd = fs.openSync(tempPath, "w");
  try {
    fs.writeFileSync(fd, contents);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tempPath, filePath);
  fsyncDirectory(dirPath);
}

function writeJson(filePath, value) {
  atomicWriteFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function withFileLock(callback) {
  ensureDirs();
  const staleMs = 5 * 60 * 1000;
  const started = Date.now();

  while (Date.now() - started < 10000) {
    let fd = null;
    try {
      fd = fs.openSync(LOCK_PATH, "wx");
      fs.writeFileSync(fd, `${process.pid}\n${new Date().toISOString()}\n`);
      return callback();
    } catch (error) {
      if (error.code !== "EEXIST") {
        throw error;
      }

      try {
        const stat = fs.statSync(LOCK_PATH);
        if (Date.now() - stat.mtimeMs > staleMs) {
          fs.unlinkSync(LOCK_PATH);
          continue;
        }
      } catch (statError) {
        if (statError.code !== "ENOENT") {
          throw statError;
        }
      }

      sleepSync(100);
    } finally {
      if (fd !== null) {
        fs.closeSync(fd);
        try {
          fs.unlinkSync(LOCK_PATH);
        } catch (unlockError) {
          if (unlockError.code !== "ENOENT") {
            throw unlockError;
          }
        }
      }
    }
  }

  throw new Error("Timed out waiting for raid state lock.");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toInteger(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return clamp(Math.round(number), min, max);
}

function singleLine(value, fallback = "", maxLength = 120) {
  const text = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const normalized = text || fallback;
  return normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized;
}

function truncate(value, maxLength) {
  const text = singleLine(value, "", maxLength + 1);
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 3))}...` : text;
}

function sanitizeUsername(value) {
  const raw = singleLine(value, "unknown", 80).replace(/^@+/, "");
  const cleaned = raw
    .replace(/[^A-Za-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 39)
    .replace(/^-+|-+$/g, "");

  if (!cleaned) {
    return "unknown";
  }
  return cleaned;
}

function markdownCell(value) {
  return singleLine(value, "", 160)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\|/g, "\\|");
}

function markdownUser(username) {
  return `@${markdownCell(sanitizeUsername(username))}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function validTimestamp(value) {
  const text = singleLine(value, "", 40);
  return Number.isFinite(Date.parse(text)) ? text : new Date(0).toISOString();
}

function rollDamage(attackType) {
  const config = ATTACKS[attackType];
  if (!config) {
    throw new Error(`Unknown attack type: ${attackType}`);
  }
  return Math.floor(Math.random() * (config.max - config.min + 1)) + config.min;
}

function phaseForHp(currentHp, maxHp) {
  const percent = maxHp <= 0 ? 0 : (currentHp / maxHp) * 100;
  if (percent <= 10) return "Final Phase";
  if (percent <= 40) return "Phase 3";
  if (percent <= 70) return "Phase 2";
  return "Phase 1";
}

function hpPercent(boss) {
  if (!boss.max_hp) return 0;
  return clamp(Math.round((boss.current_hp / boss.max_hp) * 100), 0, 100);
}

function progressBar(percent, width = 24) {
  const safePercent = toInteger(percent, 0, 0, 100);
  const filled = Math.round((safePercent / 100) * width);
  return `${"█".repeat(filled)}${"░".repeat(width - filled)}`;
}

function slugify(value, fallback = "boss") {
  const slug = singleLine(value, fallback, 80)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || fallback;
}

function normalizeBossDefinition(rawBoss, index = 0) {
  if (!isObject(rawBoss)) return null;
  const id = slugify(rawBoss.id || rawBoss.name || `boss_${index + 1}`, `boss_${index + 1}`);
  const name = singleLine(rawBoss.name, DEFAULT_BOSS.boss_name, 64);
  return {
    id,
    name,
    title: singleLine(rawBoss.title, "Raid Entity", 80),
    lore: singleLine(rawBoss.lore, "No lore signal available.", 220),
    theme: singleLine(rawBoss.theme, "Unknown anomaly", 100),
    phase_1: singleLine(rawBoss.phase_1, "Normal form.", 180),
    phase_2: singleLine(rawBoss.phase_2, "Mutated form.", 180),
    phase_3: singleLine(rawBoss.phase_3, "Corrupted form.", 180),
    phase_4: singleLine(rawBoss.phase_4, "Final Nightmare form.", 180)
  };
}

function normalizeBossRegistry(rawRegistry) {
  const source = Array.isArray(rawRegistry) && rawRegistry.length ? rawRegistry : DEFAULT_BOSS_REGISTRY;
  const byId = new Map();
  for (const [index, rawBoss] of source.entries()) {
    const boss = normalizeBossDefinition(rawBoss, index);
    if (boss && !byId.has(boss.id)) {
      byId.set(boss.id, boss);
    }
  }
  return byId.size ? [...byId.values()] : deepClone(DEFAULT_BOSS_REGISTRY);
}

function bossById(registry, id) {
  return registry.find((boss) => boss.id === id) || registry[0] || DEFAULT_BOSS_REGISTRY[0];
}

function bossByName(registry, name) {
  const safeName = singleLine(name, "", 80).toLowerCase();
  return registry.find((boss) => boss.name.toLowerCase() === safeName) || null;
}

function phaseNumberForBoss(boss) {
  if (boss.phase === "Final Phase") return 4;
  const match = String(boss.phase || "").match(/Phase\s+([123])/i);
  return match ? Number(match[1]) : 1;
}

function phaseKeyForBoss(boss) {
  return `phase_${phaseNumberForBoss(boss)}`;
}

function bossImagePathFor(boss, forcePhaseNumber = null) {
  const id = slugify(boss.boss_id || boss.id || boss.boss_name, DEFAULT_BOSS.boss_id);
  const phaseNumber = forcePhaseNumber || phaseNumberForBoss(boss);
  return `assets/bosses/${id}_p${phaseNumber}.svg`;
}

function bossThreatLevel(boss) {
  const phaseNumber = phaseNumberForBoss(boss);
  const percent = hpPercent(boss);
  if (phaseNumber === 4 || percent <= 10) return "APOCALYPSE";
  if (phaseNumber === 3 || percent <= 40) return "SEVERE";
  if (phaseNumber === 2 || percent <= 70) return "ELEVATED";
  return "ACTIVE";
}

function corruptionLevel(boss) {
  return clamp(100 - hpPercent(boss), 0, 100);
}

function dangerMeter(boss, width = 24) {
  return progressBar(corruptionLevel(boss), width);
}

function normalizeBoss(rawBoss, registry = DEFAULT_BOSS_REGISTRY) {
  const source = isObject(rawBoss) ? rawBoss : DEFAULT_BOSS;
  const registryMatch = source.boss_id
    ? bossById(registry, slugify(source.boss_id, DEFAULT_BOSS.boss_id))
    : bossByName(registry, source.boss_name);
  const bossId = registryMatch ? registryMatch.id : slugify(source.boss_id || source.boss_name || DEFAULT_BOSS.boss_id, DEFAULT_BOSS.boss_id);
  const bossName = registryMatch ? registryMatch.name : singleLine(source.boss_name, DEFAULT_BOSS.boss_name, 64);
  const maxHp = toInteger(source.max_hp, DEFAULT_BOSS.max_hp, 1, 10000000);
  const currentHp = toInteger(source.current_hp, maxHp, 0, maxHp);
  const boss = {
    boss_id: bossId,
    boss_name: bossName,
    max_hp: maxHp,
    current_hp: currentHp,
    phase: phaseForHp(currentHp, maxHp)
  };
  return boss;
}

function normalizeLeaderboard(rawLeaderboard) {
  const rows = Array.isArray(rawLeaderboard) ? rawLeaderboard : [];
  const byUser = new Map();

  for (const row of rows) {
    if (!isObject(row)) continue;
    const username = sanitizeUsername(row.username);
    const current = byUser.get(username) || {
      username,
      total_damage: 0,
      attacks: 0,
      last_attack_at: new Date(0).toISOString()
    };
    current.total_damage += toInteger(row.total_damage, 0, 0, 1000000000);
    current.attacks += toInteger(row.attacks, 0, 0, 1000000000);
    const timestamp = validTimestamp(row.last_attack_at);
    if (Date.parse(timestamp) > Date.parse(current.last_attack_at)) {
      current.last_attack_at = timestamp;
    }
    byUser.set(username, current);
  }

  return [...byUser.values()].sort((a, b) => (
    b.total_damage - a.total_damage || a.username.localeCompare(b.username)
  ));
}

function normalizeAttackRecord(rawAttack) {
  if (!isObject(rawAttack)) return null;
  const attackType = ATTACKS[rawAttack.attack_type] ? rawAttack.attack_type : "Unknown";
  const record = {
    timestamp: validTimestamp(rawAttack.timestamp),
    attacker: sanitizeUsername(rawAttack.attacker),
    attack_type: attackType,
    damage: toInteger(rawAttack.damage, 0, 0, 1000000000),
    applied_damage: toInteger(rawAttack.applied_damage, 0, 0, 1000000000),
    boss_name: singleLine(rawAttack.boss_name, DEFAULT_BOSS.boss_name, 48),
    phase_after_attack: singleLine(rawAttack.phase_after_attack, "Phase 1", 20),
    defeated: Boolean(rawAttack.defeated),
    issue_number: rawAttack.issue_number === null || rawAttack.issue_number === undefined
      ? null
      : toInteger(rawAttack.issue_number, 0, 0, 1000000000)
  };
  const loot = normalizeLootDrop(rawAttack.loot);
  if (loot) {
    record.loot = loot;
  }
  return record;
}

function normalizeAttacks(rawAttacks) {
  const rows = Array.isArray(rawAttacks) ? rawAttacks : [];
  return rows.map(normalizeAttackRecord).filter(Boolean);
}

function normalizeHallOfFame(rawHallOfFame) {
  const rows = Array.isArray(rawHallOfFame) ? rawHallOfFame : [];
  return rows.filter(isObject).map((entry) => ({
    boss_id: slugify(entry.boss_id || entry.boss_name, DEFAULT_BOSS.boss_id),
    boss_name: singleLine(entry.boss_name, DEFAULT_BOSS.boss_name, 48),
    boss_image: singleLine(entry.boss_image, bossImagePathFor({ boss_id: entry.boss_id || entry.boss_name, phase: "Final Phase" }, 4), 160),
    killer: sanitizeUsername(entry.killer),
    final_damage: toInteger(entry.final_damage, 0, 0, 1000000000),
    applied_damage: toInteger(entry.applied_damage, 0, 0, 1000000000),
    timestamp: validTimestamp(entry.timestamp || entry.defeated_at)
  }));
}

function normalizeLootDrop(rawLoot) {
  if (!isObject(rawLoot)) return null;
  const rarity = RARITIES.includes(rawLoot.rarity) ? rawLoot.rarity : null;
  const item = singleLine(rawLoot.item, "", 80);
  if (!rarity || !item) return null;
  return { item, rarity };
}

function normalizeLootRegistry(rawRegistry) {
  const source = isObject(rawRegistry) ? rawRegistry : DEFAULT_LOOT_REGISTRY;
  const sourceRates = isObject(source.drop_rates) ? source.drop_rates : DEFAULT_LOOT_REGISTRY.drop_rates;
  const sourceItems = isObject(source.items) ? source.items : DEFAULT_LOOT_REGISTRY.items;
  const dropRates = {};
  const items = {};

  for (const rarity of RARITIES) {
    const rate = Number(sourceRates[rarity]);
    dropRates[rarity] = Number.isFinite(rate) && rate >= 0
      ? Number(rate.toFixed(4))
      : DEFAULT_LOOT_REGISTRY.drop_rates[rarity];
    const configuredItems = Array.isArray(sourceItems[rarity]) ? sourceItems[rarity] : DEFAULT_LOOT_REGISTRY.items[rarity];
    const normalizedItems = configuredItems
      .map((item) => singleLine(item, "", 80))
      .filter(Boolean);
    items[rarity] = normalizedItems.length ? [...new Set(normalizedItems)] : DEFAULT_LOOT_REGISTRY.items[rarity];
  }

  const total = RARITIES.reduce((sum, rarity) => sum + dropRates[rarity], 0);
  if (total <= 0) {
    return deepClone(DEFAULT_LOOT_REGISTRY);
  }

  return {
    drop_rates: dropRates,
    items
  };
}

function normalizePlayerInventory(rawInventory) {
  const players = Array.isArray(rawInventory) ? rawInventory : [];
  const byUser = new Map();

  for (const player of players) {
    if (!isObject(player)) continue;
    const username = sanitizeUsername(player.username);
    const current = byUser.get(username) || { username, items: [] };
    const byItem = new Map(current.items.map((item) => [`${item.rarity}:${item.item}`, item]));
    const rawItems = Array.isArray(player.items) ? player.items : [];

    for (const rawItem of rawItems) {
      if (!isObject(rawItem)) continue;
      const rarity = RARITIES.includes(rawItem.rarity) ? rawItem.rarity : null;
      const item = singleLine(rawItem.item, "", 80);
      if (!rarity || !item) continue;
      const key = `${rarity}:${item}`;
      const existing = byItem.get(key) || {
        item,
        rarity,
        quantity: 0,
        first_obtained: validTimestamp(rawItem.first_obtained),
        last_obtained: validTimestamp(rawItem.last_obtained)
      };
      existing.quantity += toInteger(rawItem.quantity, 0, 0, 1000000000);
      const first = validTimestamp(rawItem.first_obtained);
      const last = validTimestamp(rawItem.last_obtained);
      if (Date.parse(first) < Date.parse(existing.first_obtained)) existing.first_obtained = first;
      if (Date.parse(last) > Date.parse(existing.last_obtained)) existing.last_obtained = last;
      byItem.set(key, existing);
    }

    current.items = [...byItem.values()]
      .filter((item) => item.quantity > 0)
      .sort((a, b) => RARITIES.indexOf(b.rarity) - RARITIES.indexOf(a.rarity) || b.quantity - a.quantity || a.item.localeCompare(b.item));
    byUser.set(username, current);
  }

  return [...byUser.values()].sort((a, b) => {
    const aStats = inventoryStatsForPlayer(a);
    const bStats = inventoryStatsForPlayer(b);
    return bStats.totalItems - aStats.totalItems || bStats.uniqueItems - aStats.uniqueItems || a.username.localeCompare(b.username);
  });
}

function normalizeLegendaryDrops(rawDrops) {
  const drops = Array.isArray(rawDrops) ? rawDrops : [];
  return drops.filter(isObject).map((drop) => {
    const rarity = ["Legendary", "Mythic"].includes(drop.rarity) ? drop.rarity : null;
    const item = singleLine(drop.item, "", 80);
    if (!rarity || !item) return null;
    return {
      username: sanitizeUsername(drop.username),
      item,
      rarity,
      timestamp: validTimestamp(drop.timestamp),
      boss: singleLine(drop.boss, DEFAULT_BOSS.boss_name, 48)
    };
  }).filter(Boolean);
}

function normalizeState(state) {
  const bossRegistry = normalizeBossRegistry(state.bossRegistry);
  return {
    bossRegistry,
    boss: normalizeBoss(state.boss, bossRegistry),
    leaderboard: normalizeLeaderboard(state.leaderboard),
    attacks: normalizeAttacks(state.attacks),
    hallOfFame: normalizeHallOfFame(state.hallOfFame),
    lootRegistry: normalizeLootRegistry(state.lootRegistry),
    playerInventory: normalizePlayerInventory(state.playerInventory),
    legendaryDrops: normalizeLegendaryDrops(state.legendaryDrops)
  };
}

function loadState() {
  ensureDirs();
  return normalizeState({
    bossRegistry: readJson(BOSS_REGISTRY_PATH, DEFAULT_BOSS_REGISTRY),
    boss: readJson(BOSS_PATH, DEFAULT_BOSS),
    leaderboard: readJson(LEADERBOARD_PATH, []),
    attacks: readJson(ATTACKS_PATH, []),
    hallOfFame: readJson(HALL_OF_FAME_PATH, []),
    lootRegistry: readJson(LOOT_REGISTRY_PATH, DEFAULT_LOOT_REGISTRY),
    playerInventory: readJson(PLAYER_INVENTORY_PATH, []),
    legendaryDrops: readJson(LEGENDARY_DROPS_PATH, [])
  });
}

function saveState(state) {
  const normalized = normalizeState(state);
  writeJson(BOSS_REGISTRY_PATH, normalized.bossRegistry);
  writeJson(BOSS_PATH, normalized.boss);
  writeJson(LEADERBOARD_PATH, normalized.leaderboard);
  writeJson(ATTACKS_PATH, normalized.attacks);
  writeJson(HALL_OF_FAME_PATH, normalized.hallOfFame);
  writeJson(LOOT_REGISTRY_PATH, normalized.lootRegistry);
  writeJson(PLAYER_INVENTORY_PATH, normalized.playerInventory);
  writeJson(LEGENDARY_DROPS_PATH, normalized.legendaryDrops);
}

function updateLeaderboard(leaderboard, attacker, damage, timestamp) {
  const username = sanitizeUsername(attacker);
  const row = leaderboard.find((entry) => entry.username === username);
  if (row) {
    row.total_damage += damage;
    row.attacks += 1;
    row.last_attack_at = timestamp;
  } else {
    leaderboard.push({
      username,
      total_damage: damage,
      attacks: 1,
      last_attack_at: timestamp
    });
  }
  leaderboard.sort((a, b) => b.total_damage - a.total_damage || a.username.localeCompare(b.username));
}

function rollLoot(lootRegistry) {
  const registry = normalizeLootRegistry(lootRegistry);
  const total = RARITIES.reduce((sum, rarity) => sum + registry.drop_rates[rarity], 0);
  let roll = Math.random() * total;
  let selectedRarity = RARITIES[0];

  for (const rarity of RARITIES) {
    roll -= registry.drop_rates[rarity];
    if (roll < 0) {
      selectedRarity = rarity;
      break;
    }
  }

  const items = registry.items[selectedRarity];
  const item = items[Math.floor(Math.random() * items.length)];
  return { item, rarity: selectedRarity };
}

function updateInventory(playerInventory, username, loot, timestamp) {
  const safeUsername = sanitizeUsername(username);
  const player = playerInventory.find((entry) => entry.username === safeUsername) || {
    username: safeUsername,
    items: []
  };
  if (!playerInventory.includes(player)) {
    playerInventory.push(player);
  }

  const item = player.items.find((entry) => entry.item === loot.item && entry.rarity === loot.rarity);
  if (item) {
    item.quantity += 1;
    item.last_obtained = timestamp;
    return item.quantity;
  }

  player.items.push({
    item: loot.item,
    rarity: loot.rarity,
    quantity: 1,
    first_obtained: timestamp,
    last_obtained: timestamp
  });
  player.items.sort((a, b) => RARITIES.indexOf(b.rarity) - RARITIES.indexOf(a.rarity) || b.quantity - a.quantity || a.item.localeCompare(b.item));
  return 1;
}

function inventoryStatsForPlayer(player) {
  const items = Array.isArray(player.items) ? player.items : [];
  const counts = Object.fromEntries(RARITIES.map((rarity) => [rarity, 0]));
  let totalItems = 0;
  for (const item of items) {
    const quantity = toInteger(item.quantity, 0, 0, 1000000000);
    totalItems += quantity;
    if (RARITIES.includes(item.rarity)) {
      counts[item.rarity] += quantity;
    }
  }
  return {
    totalItems,
    uniqueItems: items.length,
    legendaryItems: counts.Legendary,
    mythicItems: counts.Mythic,
    counts
  };
}

function inventoryTotals(playerInventory) {
  const totals = Object.fromEntries(RARITIES.map((rarity) => [rarity, 0]));
  let totalItems = 0;
  let uniqueCollectors = 0;

  for (const player of playerInventory) {
    uniqueCollectors += 1;
    const stats = inventoryStatsForPlayer(player);
    totalItems += stats.totalItems;
    for (const rarity of RARITIES) {
      totals[rarity] += stats.counts[rarity];
    }
  }

  return { totalItems, uniqueCollectors, rarityTotals: totals };
}

function topCollectors(playerInventory, limit = 10) {
  return [...playerInventory].sort((a, b) => {
    const aStats = inventoryStatsForPlayer(a);
    const bStats = inventoryStatsForPlayer(b);
    return bStats.totalItems - aStats.totalItems
      || bStats.mythicItems - aStats.mythicItems
      || bStats.legendaryItems - aStats.legendaryItems
      || bStats.uniqueItems - aStats.uniqueItems
      || a.username.localeCompare(b.username);
  }).slice(0, limit);
}

function spawnNextBoss(hallOfFameCount, bossRegistry = DEFAULT_BOSS_REGISTRY) {
  const registry = normalizeBossRegistry(bossRegistry);
  const index = Math.max(0, hallOfFameCount) % registry.length;
  const bossDefinition = registry[index];
  const maxHp = 1000 + hallOfFameCount * 250;
  return {
    boss_id: bossDefinition.id,
    boss_name: bossDefinition.name,
    max_hp: maxHp,
    current_hp: maxHp,
    phase: "Phase 1"
  };
}

function repositorySlug() {
  if (process.env.GITHUB_REPOSITORY) {
    return process.env.GITHUB_REPOSITORY;
  }

  try {
    const remote = execSync("git config --get remote.origin.url", {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    const match = remote.match(/github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?$/);
    return match ? match[1] : null;
  } catch (_error) {
    return null;
  }
}

function attackIssueUrl() {
  const slug = repositorySlug();
  return slug
    ? `https://github.com/${slug}/issues/new?template=attack.yml`
    : "../../issues/new?template=attack.yml";
}

function parseAttackType(issueBody) {
  const body = String(issueBody || "");
  const match = body.match(/^###\s*Attack Type\s*\r?\n+([\s\S]*?)(?=^\s*###\s|\s*$)/im);
  if (!match) {
    return null;
  }

  const candidate = match[1]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .find((line) => !line.startsWith("_No response_"));

  return candidate ? singleLine(candidate, "", 80) : null;
}

function applyAttack({ attacker, attackType, issueNumber }) {
  return withFileLock(() => {
    if (!ATTACKS[attackType]) {
      throw new Error(`Unsupported attack type "${singleLine(attackType, "missing", 80)}". Use Slash, Critical Strike, or Lucky Attack.`);
    }

    const state = loadState();
    const timestamp = new Date().toISOString();
    const username = sanitizeUsername(attacker);
    const bossBefore = { ...state.boss };
    const rolledDamage = rollDamage(attackType);
    const appliedDamage = Math.min(rolledDamage, state.boss.current_hp);
    const loot = rollLoot(state.lootRegistry);
    const inventoryCount = updateInventory(state.playerInventory, username, loot, timestamp);

    state.boss.current_hp = clamp(state.boss.current_hp - rolledDamage, 0, state.boss.max_hp);
    state.boss.phase = phaseForHp(state.boss.current_hp, state.boss.max_hp);
    updateLeaderboard(state.leaderboard, username, appliedDamage, timestamp);

    const defeated = state.boss.current_hp === 0;
    const attackRecord = {
      timestamp,
      attacker: username,
      attack_type: attackType,
      damage: rolledDamage,
      applied_damage: appliedDamage,
      boss_name: bossBefore.boss_name,
      phase_after_attack: state.boss.phase,
      defeated,
      issue_number: issueNumber ? toInteger(issueNumber, 0, 0, 1000000000) : null,
      loot
    };
    state.attacks.unshift(attackRecord);

    if (loot.rarity === "Legendary" || loot.rarity === "Mythic") {
      state.legendaryDrops.unshift({
        username,
        item: loot.item,
        rarity: loot.rarity,
        timestamp,
        boss: bossBefore.boss_name
      });
    }

    let defeatedBoss = null;
    if (defeated) {
      defeatedBoss = {
        boss_id: bossBefore.boss_id,
        boss_name: bossBefore.boss_name,
        boss_image: bossImagePathFor(bossBefore, 4),
        killer: username,
        final_damage: rolledDamage,
        applied_damage: appliedDamage,
        timestamp
      };
      state.hallOfFame.unshift(defeatedBoss);
      state.boss = spawnNextBoss(state.hallOfFame.length, state.bossRegistry);
    }

    saveState(state);
    renderAll(state);

    return {
      attacker: username,
      attackType,
      rolledDamage,
      appliedDamage,
      defeated,
      defeatedBoss,
      bossBefore,
      bossAfter: state.boss,
      loot,
      inventoryCount
    };
  });
}

function renderReadme(state = loadState()) {
  const safeState = normalizeState(state);
  const boss = safeState.boss;
  const bossDefinition = bossById(safeState.bossRegistry, boss.boss_id);
  const percent = hpPercent(boss);
  const lastAttack = safeState.attacks[0];
  const topAttackers = safeState.leaderboard.slice(0, 10);
  const recentAttacks = safeState.attacks.slice(0, 10);

  const leaderboardRows = topAttackers.length
    ? topAttackers.map((entry, index) => (
      `| ${index + 1} | ${markdownUser(entry.username)} | ${entry.total_damage} | ${entry.attacks} |`
    )).join("\n")
    : "| - | No attackers yet | 0 | 0 |";

  const attackRows = recentAttacks.length
    ? recentAttacks.map((attack) => {
      const defeatedText = attack.defeated ? "Defeated boss" : markdownCell(attack.phase_after_attack);
      return `| ${markdownCell(attack.timestamp)} | ${markdownUser(attack.attacker)} | ${markdownCell(attack.attack_type)} | ${attack.damage} | ${defeatedText} |`;
    }).join("\n")
    : "| - | No attacks yet | - | - | - |";

  const lastAttacker = lastAttack ? markdownUser(lastAttack.attacker) : "None yet";
  const bossImage = bossImagePathFor(boss);
  const phaseDescription = bossDefinition[phaseKeyForBoss(boss)];
  const latestLootAttack = safeState.attacks.find((attack) => attack.loot);
  const topRaider = safeState.leaderboard[0];
  const latestKiller = safeState.hallOfFame[0];
  const lastAttackSignal = lastAttack
    ? `${markdownUser(lastAttack.attacker)} rolled ${lastAttack.damage} damage`
    : "⚠ No one has attacked yet. Become the First Raider.";
  const latestLootSignal = latestLootAttack && latestLootAttack.loot
    ? `${markdownUser(latestLootAttack.attacker)} found ${markdownCell(latestLootAttack.loot.item)} (${markdownCell(latestLootAttack.loot.rarity)})`
    : "No relics discovered. The vault awaits.";
  const topRaiderSignal = topRaider
    ? `${markdownUser(topRaider.username)} with ${topRaider.total_damage} total damage`
    : "⚠ No one has attacked yet. Become the First Raider.";
  const bossKillerSignal = latestKiller
    ? `${markdownUser(latestKiller.killer)} defeated ${markdownCell(latestKiller.boss_name)}`
    : "No boss has fallen yet.";

  return `# ⚠ GLOBAL RAID ACTIVE

## ${markdownCell(boss.boss_name.toUpperCase())}

**HP: ${percent}%**

[**⚔ ATTACK THIS BOSS**](${attackIssueUrl()})

Takes 10 seconds.  
Opens a GitHub attack form.  
Bot calculates damage.  
Loot is rolled automatically.  
Your result is posted and the issue auto-closes.

| Live Signal | Status |
| --- | --- |
| Last Attack | ${lastAttackSignal} |
| Latest Loot | ${latestLootSignal} |
| Top Raider | ${topRaiderSignal} |
| Boss Killer | ${bossKillerSignal} |

<p align="center">
  <img src="./${bossImage}" alt="${markdownCell(boss.boss_name)} encounter phase art" width="720">
</p>

<p align="center">
  <img src="./assets/boss-card.svg" alt="Current raid boss card" width="720">
</p>

## Current Boss

| Boss | HP | HP Bar | Phase | Last Attacker |
| --- | ---: | --- | --- | --- |
| ${markdownCell(boss.boss_name)} | ${boss.current_hp} / ${boss.max_hp} (${percent}%) | \`${progressBar(percent)}\` | ${markdownCell(boss.phase)} | ${lastAttacker} |

## Current Boss Lore

**${markdownCell(bossDefinition.title)}**  
${markdownCell(bossDefinition.lore)}

| Signal | Value |
| --- | --- |
| Theme | ${markdownCell(bossDefinition.theme)} |
| Threat Level | ${bossThreatLevel(boss)} |
| Corruption Level | ${corruptionLevel(boss)}% |
| Danger Meter | \`${dangerMeter(boss)}\` |

## Boss Evolution Status

| Phase | Form | Status |
| --- | --- | --- |
| Phase 1 | ${markdownCell(bossDefinition.phase_1)} | ${phaseNumberForBoss(boss) === 1 ? "ACTIVE" : "Cleared"} |
| Phase 2 | ${markdownCell(bossDefinition.phase_2)} | ${phaseNumberForBoss(boss) === 2 ? "ACTIVE" : phaseNumberForBoss(boss) > 2 ? "Cleared" : "Dormant"} |
| Phase 3 | ${markdownCell(bossDefinition.phase_3)} | ${phaseNumberForBoss(boss) === 3 ? "ACTIVE" : phaseNumberForBoss(boss) > 3 ? "Cleared" : "Dormant"} |
| Phase 4 | ${markdownCell(bossDefinition.phase_4)} | ${phaseNumberForBoss(boss) === 4 ? "ACTIVE" : "Dormant"} |

## Phase Description

${markdownCell(phaseDescription)}

## Raid Terminal

| Signal | Value |
| --- | --- |
| Status | ${boss.current_hp > 0 ? "ACTIVE RAID TARGET" : "DEFEATED"} |
| Integrity | ${percent}% |
| Phase Window | ${markdownCell(boss.phase)} |
| Boss Image | \`${bossImage}\` |
| Attack Vector | GitHub attack form |

## Attack

[Attack This Boss](${attackIssueUrl()})

Roll damage and claim loot:

| Attack | Damage |
| --- | ---: |
| Slash | 5-20 |
| Critical Strike | 0-100 |
| Lucky Attack | 1-500 |

## Top 10 Attackers

| Rank | Attacker | Total Damage | Attacks |
| ---: | --- | ---: | ---: |
${leaderboardRows}

## Last 10 Attacks

| Time | Attacker | Attack | Damage | Result |
| --- | --- | --- | ---: | --- |
${attackRows}

## Hall of Relics

${renderHallOfRelics(safeState)}

## Latest Drops

${renderLatestDrops(safeState.attacks)}

## Legendary Discoveries

${renderDiscoveryTable(safeState.legendaryDrops, "Legendary")}

## Mythic Discoveries

${renderDiscoveryTable(safeState.legendaryDrops, "Mythic")}

## Top Collectors

${renderTopCollectors(safeState.playerInventory)}

## Recent Loot

${renderRecentLoot(safeState.attacks)}

## Hall of Fame

${renderHallOfFame(safeState.hallOfFame)}

<!-- This README is generated by scripts/render_readme.js. -->
`;
}

function renderHallOfRelics(state) {
  const totals = inventoryTotals(state.playerInventory);
  const registry = state.lootRegistry;
  const rarityRows = RARITIES.map((rarity) => (
    `| ${rarity} | ${registry.drop_rates[rarity]}% | ${totals.rarityTotals[rarity]} | ${registry.items[rarity].length} |`
  )).join("\n");

  return `| Relic Signal | Value |
| --- | ---: |
| Total Relics Held | ${totals.totalItems} |
| Active Collectors | ${totals.uniqueCollectors} |
| Legendary Discoveries | ${state.legendaryDrops.filter((drop) => drop.rarity === "Legendary").length} |
| Mythic Discoveries | ${state.legendaryDrops.filter((drop) => drop.rarity === "Mythic").length} |

| Rarity | Drop Rate | Owned | Registry Items |
| --- | ---: | ---: | ---: |
${rarityRows}`;
}

function renderLatestDrops(attacks) {
  const drops = attacks.filter((attack) => attack.loot).slice(0, 10);
  if (!drops.length) {
    return "No loot discovered yet.";
  }
  const rows = drops.map((attack) => (
    `| ${markdownCell(attack.timestamp)} | ${markdownUser(attack.attacker)} | ${markdownCell(attack.loot.item)} | ${markdownCell(attack.loot.rarity)} |`
  )).join("\n");
  return `| Time | Collector | Relic | Rarity |
| --- | --- | --- | --- |
${rows}`;
}

function renderDiscoveryTable(legendaryDrops, rarity) {
  const drops = legendaryDrops.filter((drop) => drop.rarity === rarity).slice(0, 10);
  if (!drops.length) {
    return `No ${rarity.toLowerCase()} relics discovered yet.`;
  }
  const rows = drops.map((drop) => (
    `| ${markdownCell(drop.timestamp)} | ${markdownUser(drop.username)} | ${markdownCell(drop.item)} | ${markdownCell(drop.boss)} |`
  )).join("\n");
  return `| Time | Collector | Relic | Boss |
| --- | --- | --- | --- |
${rows}`;
}

function renderTopCollectors(playerInventory) {
  const collectors = topCollectors(playerInventory, 10);
  if (!collectors.length) {
    return "| Rank | Collector | Total Relics | Unique | Legendary | Mythic |\n| ---: | --- | ---: | ---: | ---: | ---: |\n| - | No collectors yet | 0 | 0 | 0 | 0 |";
  }
  const rows = collectors.map((player, index) => {
    const stats = inventoryStatsForPlayer(player);
    return `| ${index + 1} | ${markdownUser(player.username)} | ${stats.totalItems} | ${stats.uniqueItems} | ${stats.legendaryItems} | ${stats.mythicItems} |`;
  }).join("\n");
  return `| Rank | Collector | Total Relics | Unique | Legendary | Mythic |
| ---: | --- | ---: | ---: | ---: | ---: |
${rows}`;
}

function renderRecentLoot(attacks) {
  const drops = attacks.filter((attack) => attack.loot).slice(0, 10);
  if (!drops.length) {
    return "| Time | Collector | Drop | Rarity | Damage |\n| --- | --- | --- | --- | ---: |\n| - | No loot yet | - | - | - |";
  }
  const rows = drops.map((attack) => (
    `| ${markdownCell(attack.timestamp)} | ${markdownUser(attack.attacker)} | ${markdownCell(attack.loot.item)} | ${markdownCell(attack.loot.rarity)} | ${attack.damage} |`
  )).join("\n");
  return `| Time | Collector | Drop | Rarity | Damage |
| --- | --- | --- | --- | ---: |
${rows}`;
}

function renderHallOfFame(hallOfFame) {
  if (!hallOfFame.length) {
    return "No bosses defeated yet.";
  }
  const rows = hallOfFame.slice(0, 10).map((entry) => (
    `| <img src="./${markdownCell(entry.boss_image)}" alt="${markdownCell(entry.boss_name)} defeated" width="120"> | ${markdownCell(entry.boss_name)} | ${markdownUser(entry.killer)} | ${markdownCell(entry.timestamp)} | ${entry.final_damage} |`
  )).join("\n");
  return `### Cinematic Defeat Archive

| Defeat Panel | Boss | Killer | Date | Final Damage |
| --- | --- | --- | --- | ---: |
${rows}`;
}

function renderSvg(state = loadState()) {
  const safeState = normalizeState(state);
  const boss = safeState.boss;
  const percent = hpPercent(boss);
  const barWidth = 520;
  const fillWidth = Math.round((percent / 100) * barWidth);
  const status = boss.current_hp <= 0 ? "DEFEATED" : "ACTIVE RAID TARGET";
  const lastAttack = safeState.attacks[0];
  const lastLine = lastAttack
    ? `Last hit: @${sanitizeUsername(lastAttack.attacker)} for ${lastAttack.damage}`
    : "Awaiting first attacker";
  const phaseLabels = ["Phase 1", "Phase 2", "Phase 3", "Final Phase"];
  const activePhase = phaseLabels.indexOf(boss.phase);
  const phaseNodes = phaseLabels.map((label, index) => {
    const x = 68 + index * 134;
    const active = index === activePhase;
    const fill = active ? "#ff2bd6" : "#061522";
    const stroke = active ? "#ffe95e" : "#21445c";
    const text = label === "Final Phase" ? "FINAL" : `P${index + 1}`;
    return `<rect x="${x}" y="286" width="112" height="28" rx="4" fill="${fill}" fill-opacity="${active ? "0.35" : "0.75"}" stroke="${stroke}"/>
  <text x="${x + 56}" y="305" text-anchor="middle" fill="${active ? "#ffe95e" : "#8db5c8"}" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="14" font-weight="800">${text}</text>`;
  }).join("\n  ");
  const leaderboardRows = safeState.leaderboard.slice(0, 5).map((entry, index) => {
    const y = 142 + index * 31;
    return `<text x="647" y="${y}" fill="#c8d8ef" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="16">${index + 1}. @${escapeHtml(truncate(entry.username, 16))}</text>
  <text x="872" y="${y}" text-anchor="end" fill="#ffe95e" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="16">${entry.total_damage}</text>`;
  }).join("\n  ") || `<text x="647" y="142" fill="#8db5c8" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="16">No attackers yet</text>`;
  const collectorRows = topCollectors(safeState.playerInventory, 3).map((player, index) => {
    const y = 382 + index * 26;
    const stats = inventoryStatsForPlayer(player);
    return `<text x="647" y="${y}" fill="#c8d8ef" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="15">${index + 1}. @${escapeHtml(truncate(player.username, 13))}</text>
  <text x="872" y="${y}" text-anchor="end" fill="#ffe95e" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="15">${stats.totalItems} relics</text>`;
  }).join("\n  ") || `<text x="647" y="382" fill="#8db5c8" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="15">No collectors yet</text>`;
  const recentRows = safeState.attacks.slice(0, 4).map((attack, index) => {
    const y = 370 + index * 28;
    return `<text x="70" y="${y}" fill="#c8d8ef" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="15">@${escapeHtml(truncate(attack.attacker, 14))}</text>
  <text x="246" y="${y}" fill="#23f7dd" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="15">${escapeHtml(attack.attack_type)}</text>
  <text x="474" y="${y}" text-anchor="end" fill="#ffe95e" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="15">${attack.damage} dmg</text>`;
  }).join("\n  ") || `<text x="70" y="370" fill="#8db5c8" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="15">Awaiting combat telemetry</text>`;
  const latestLegendary = safeState.legendaryDrops.find((drop) => drop.rarity === "Legendary" || drop.rarity === "Mythic");
  const lootTotals = inventoryTotals(safeState.playerInventory);
  const latestDrop = safeState.attacks.find((attack) => attack.loot);
  const relicLine = latestLegendary
    ? `${latestLegendary.rarity}: ${latestLegendary.item}`
    : "No legendary signal yet";
  const latestDropLine = latestDrop && latestDrop.loot
    ? `${latestDrop.loot.rarity}: ${latestDrop.loot.item}`
    : "Awaiting first relic";

  return `<svg width="960" height="540" viewBox="0 0 960 540" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">${escapeHtml(boss.boss_name)} raid boss</title>
  <desc id="desc">Current HP ${boss.current_hp} of ${boss.max_hp}. ${escapeHtml(boss.phase)}.</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="960" y2="540" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#08111f"/>
      <stop offset="0.52" stop-color="#12051c"/>
      <stop offset="1" stop-color="#061b22"/>
    </linearGradient>
    <linearGradient id="hp" x1="0" y1="0" x2="${barWidth}" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#23f7dd"/>
      <stop offset="0.55" stop-color="#ff2bd6"/>
      <stop offset="1" stop-color="#ffe95e"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-80%" width="140%" height="260%">
      <feGaussianBlur stdDeviation="6" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <pattern id="scan" width="8" height="8" patternUnits="userSpaceOnUse">
      <path d="M0 0H8" stroke="#23f7dd" stroke-opacity="0.08"/>
    </pattern>
    <style>
      @keyframes pulse { 0%, 100% { opacity: .55; } 50% { opacity: 1; } }
      @keyframes sweep { 0% { transform: translateX(-960px); } 100% { transform: translateX(960px); } }
      .pulse { animation: pulse 2.4s ease-in-out infinite; }
      .sweep { animation: sweep 5s linear infinite; }
    </style>
  </defs>
  <rect width="960" height="540" rx="24" fill="url(#bg)"/>
  <rect width="960" height="540" fill="url(#scan)"/>
  <rect class="sweep" x="0" y="0" width="180" height="540" fill="#23f7dd" fill-opacity="0.045"/>
  <path d="M0 90H960M0 180H960M0 270H960M0 360H960M0 450H960M120 0V540M240 0V540M360 0V540M480 0V540M600 0V540M720 0V540M840 0V540" stroke="#1cf7ff" stroke-opacity="0.08"/>
  <rect x="28" y="28" width="904" height="484" rx="18" stroke="#23f7dd" stroke-opacity="0.72" stroke-width="2"/>
  <rect x="42" y="42" width="876" height="456" rx="10" stroke="#ff2bd6" stroke-opacity="0.36"/>
  <path d="M614 68H894V266H614Z" fill="#030917" fill-opacity="0.82" stroke="#21445c"/>
  <path d="M614 292H894V472H614Z" fill="#030917" fill-opacity="0.82" stroke="#21445c"/>
  <path d="M52 338H508V472H52Z" fill="#030917" fill-opacity="0.82" stroke="#21445c"/>

  <text x="70" y="86" fill="#23f7dd" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="17" letter-spacing="3">${escapeHtml(status)}</text>
  <text x="70" y="145" fill="#f7fbff" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="48" font-weight="900">${escapeHtml(truncate(boss.boss_name, 20))}</text>
  <text x="70" y="188" fill="#ff2bd6" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="25" font-weight="800">${escapeHtml(boss.phase)}</text>

  <rect x="70" y="218" width="${barWidth}" height="38" rx="6" fill="#020713" stroke="#35516c"/>
  <rect class="pulse" x="70" y="218" width="${fillWidth}" height="38" rx="6" fill="url(#hp)" filter="url(#glow)"/>
  <path d="M174 218V256M278 218V256M382 218V256M486 218V256" stroke="#020713" stroke-opacity="0.55"/>
  <text x="610" y="247" fill="#f7fbff" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="24" font-weight="900">${boss.current_hp} / ${boss.max_hp}</text>
  <text x="70" y="274" fill="#c8d8ef" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="17">${percent}% HP // ${escapeHtml(truncate(lastLine, 44))}</text>
  ${phaseNodes}
  <text x="70" y="330" fill="#ffe95e" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="16">LOOT: ${lootTotals.totalItems} RELICS // ${lootTotals.uniqueCollectors} COLLECTORS</text>

  <text x="638" y="104" fill="#23f7dd" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="17" letter-spacing="2">TOP ATTACKERS</text>
  ${leaderboardRows}
  <text x="638" y="246" fill="#ff2bd6" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="15">LATEST DROP</text>
  <text x="638" y="268" fill="#ffe95e" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="15">${escapeHtml(truncate(latestDropLine, 28))}</text>

  <text x="638" y="326" fill="#23f7dd" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="17" letter-spacing="2">TOP COLLECTORS</text>
  <text x="638" y="350" fill="#ff2bd6" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="14">${escapeHtml(truncate(relicLine, 31))}</text>
  ${collectorRows}

  <text x="70" y="356" fill="#23f7dd" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="17" letter-spacing="2">RECENT ATTACKS</text>
  ${recentRows}

  <g transform="translate(558 410)">
    <rect x="-58" y="-58" width="116" height="116" fill="#061522" stroke="#23f7dd" stroke-width="3"/>
    <rect x="-38" y="-34" width="28" height="26" fill="#ff2bd6" fill-opacity="0.85"/>
    <rect x="10" y="-34" width="28" height="26" fill="#23f7dd" fill-opacity="0.85"/>
    <rect x="-30" y="18" width="60" height="10" fill="#ffe95e"/>
    <path d="M-58 -58L-82 -82M58 -58L82 -82M-58 58L-82 82M58 58L82 82" stroke="#ff2bd6" stroke-width="4"/>
    <circle class="pulse" cx="0" cy="0" r="78" stroke="#ffe95e" stroke-opacity="0.35" stroke-width="3"/>
  </g>
</svg>
`;
}

function bossPalette(bossId) {
  const palettes = {
    hallucination_titan: ["#23f7dd", "#ff2bd6", "#ffe95e"],
    gpu_devourer: ["#ff6b1a", "#ffe95e", "#23f7dd"],
    data_leak_hydra: ["#39ff88", "#ff2b4f", "#23f7dd"],
    gradient_vanisher: ["#b8f7ff", "#7a5cff", "#ff2bd6"],
    overfitted_beast: ["#ff3b6b", "#ffe95e", "#23f7dd"],
    prompt_goblin: ["#9dff28", "#ff2bd6", "#ffe95e"]
  };
  return palettes[bossId] || ["#23f7dd", "#ff2bd6", "#ffe95e"];
}

function bossPhaseName(phaseNumber) {
  return ["Normal Form", "Mutated Form", "Corrupted Form", "Final Nightmare Form"][phaseNumber - 1] || "Unknown Form";
}

function bossPhaseDescription(definition, phaseNumber) {
  return definition[`phase_${phaseNumber}`] || definition.phase_1;
}

function renderBossFigure(definition, phaseNumber, colors) {
  const [primary, secondary, accent] = colors;
  const corruption = phaseNumber >= 3;
  const final = phaseNumber === 4;
  const mutate = phaseNumber >= 2;

  if (definition.id === "gpu_devourer") {
    const vents = Array.from({ length: phaseNumber + 3 }, (_, index) => {
      const x = 268 + index * 52;
      return `<rect class="pulse" x="${x}" y="354" width="30" height="${50 + phaseNumber * 12}" fill="${index % 2 ? secondary : primary}" fill-opacity=".55"/>`;
    }).join("\n    ");
    return `<g>
    <rect x="300" y="152" width="360" height="210" rx="18" fill="#07101b" stroke="${primary}" stroke-width="5"/>
    <circle class="pulse" cx="480" cy="258" r="${48 + phaseNumber * 16}" fill="#020713" stroke="${secondary}" stroke-width="8"/>
    <circle class="spin" cx="480" cy="258" r="${22 + phaseNumber * 8}" fill="${accent}" fill-opacity=".75"/>
    <path d="M342 130L278 ${mutate ? 58 : 96}M618 130L682 ${mutate ? 58 : 96}" stroke="${secondary}" stroke-width="${mutate ? 16 : 8}" stroke-linecap="round"/>
    <path d="M318 206L210 ${final ? 158 : 212}M642 206L750 ${final ? 158 : 212}" stroke="${primary}" stroke-width="${phaseNumber * 4 + 8}" stroke-linecap="round"/>
    ${vents}
    ${corruption ? `<path class="dash" d="M238 438C340 396 382 474 484 430S646 390 730 440" stroke="${secondary}" stroke-width="6" stroke-dasharray="18 16"/>` : ""}
  </g>`;
  }

  if (definition.id === "data_leak_hydra") {
    const heads = phaseNumber + 2;
    const headNodes = Array.from({ length: heads }, (_, index) => {
      const x = 260 + index * (440 / Math.max(1, heads - 1));
      const y = 140 + (index % 2) * 34 - phaseNumber * 7;
      return `<path d="M480 310C${x - 28} 266 ${x - 16} 206 ${x} ${y}" stroke="${index % 2 ? secondary : primary}" stroke-width="${14 + phaseNumber * 2}" fill="none"/>
    <polygon class="pulse" points="${x - 36},${y + 18} ${x},${y - 30} ${x + 42},${y + 14} ${x + 14},${y + 48} ${x - 28},${y + 42}" fill="#061522" stroke="${index % 2 ? secondary : primary}" stroke-width="4"/>
    <circle cx="${x - 10}" cy="${y + 14}" r="5" fill="${accent}"/>
    <circle cx="${x + 16}" cy="${y + 14}" r="5" fill="${accent}"/>`;
    }).join("\n    ");
    return `<g>
    <ellipse cx="480" cy="336" rx="${132 + phaseNumber * 18}" ry="${78 + phaseNumber * 8}" fill="#07101b" stroke="${primary}" stroke-width="5"/>
    ${headNodes}
    <path class="dash" d="M248 420H716M290 452H676M330 484H628" stroke="${secondary}" stroke-opacity=".8" stroke-width="5" stroke-dasharray="${phaseNumber * 4 + 8} 12"/>
    ${final ? `<path d="M190 108H770V492H190Z" stroke="${secondary}" stroke-width="4" stroke-dasharray="10 14" fill="none"/>` : ""}
  </g>`;
  }

  if (definition.id === "gradient_vanisher") {
    const echoes = Array.from({ length: phaseNumber + 2 }, (_, index) => {
      const offset = index * 28;
      const opacity = Math.max(0.12, 0.48 - index * 0.07);
      return `<path d="M${420 + offset} 128C350 190 356 356 ${438 + offset} 426C510 358 520 208 ${420 + offset} 128Z" fill="${index % 2 ? secondary : primary}" fill-opacity="${opacity}" stroke="${accent}" stroke-opacity="${opacity}" stroke-width="3"/>`;
    }).join("\n    ");
    return `<g>
    ${echoes}
    <path class="pulse" d="M438 118C338 206 360 390 486 446C594 368 590 190 438 118Z" fill="#07101b" fill-opacity="${final ? ".28" : ".76"}" stroke="${primary}" stroke-width="5"/>
    <circle cx="444" cy="234" r="10" fill="${accent}"/>
    <circle cx="506" cy="240" r="10" fill="${accent}" fill-opacity="${mutate ? ".45" : "1"}"/>
    <path class="dash" d="M278 172L676 384M690 154L306 402" stroke="${secondary}" stroke-width="${corruption ? 7 : 3}" stroke-dasharray="12 18"/>
  </g>`;
  }

  if (definition.id === "overfitted_beast") {
    const cards = Array.from({ length: 4 + phaseNumber * 2 }, (_, index) => {
      const x = 278 + (index % 5) * 84;
      const y = 158 + Math.floor(index / 5) * 72;
      return `<rect class="jitter" x="${x}" y="${y}" width="58" height="38" fill="#0b1725" stroke="${index % 2 ? secondary : primary}"/>
    <path d="M${x + 8} ${y + 14}H${x + 48}M${x + 8} ${y + 26}H${x + 38}" stroke="${accent}" stroke-width="3"/>`;
    }).join("\n    ");
    return `<g>
    <ellipse cx="480" cy="320" rx="${170 + phaseNumber * 18}" ry="${94 + phaseNumber * 10}" fill="#07101b" stroke="${secondary}" stroke-width="6"/>
    <path d="M342 286L248 ${mutate ? 206 : 252}M618 286L720 ${mutate ? 206 : 252}" stroke="${primary}" stroke-width="${10 + phaseNumber * 4}" stroke-linecap="round"/>
    <path d="M374 212L330 122L438 182M586 212L636 122L522 182" fill="#07101b" stroke="${primary}" stroke-width="5"/>
    <circle cx="430" cy="286" r="12" fill="${accent}"/><circle cx="530" cy="286" r="12" fill="${accent}"/>
    ${cards}
    ${final ? `<path class="dash" d="M212 426C316 500 638 500 746 424" stroke="${primary}" stroke-width="8" stroke-dasharray="24 12"/>` : ""}
  </g>`;
  }

  if (definition.id === "prompt_goblin") {
    const flags = Array.from({ length: phaseNumber + 2 }, (_, index) => {
      const x = 330 + index * 58;
      const y = 138 + (index % 2) * 34;
      return `<path class="jitter" d="M${x} ${y}V${y + 86}M${x} ${y}L${x + 42} ${y + 16}L${x} ${y + 32}" stroke="${index % 2 ? secondary : primary}" stroke-width="5" fill="none"/>`;
    }).join("\n    ");
    return `<g>
    ${flags}
    <path d="M480 176L596 292L540 430H420L364 292Z" fill="#07101b" stroke="${primary}" stroke-width="6"/>
    <path d="M398 248L286 ${mutate ? 188 : 238}M562 248L674 ${mutate ? 188 : 238}" stroke="${secondary}" stroke-width="${8 + phaseNumber * 3}" stroke-linecap="round"/>
    <polygon points="424,214 378,154 460,184" fill="#07101b" stroke="${accent}" stroke-width="5"/>
    <polygon points="536,214 582,154 500,184" fill="#07101b" stroke="${accent}" stroke-width="5"/>
    <circle class="pulse" cx="438" cy="282" r="12" fill="${accent}"/>
    <circle class="pulse" cx="522" cy="282" r="12" fill="${accent}"/>
    <path d="M426 342Q480 ${final ? 396 : 370} 536 342" stroke="${secondary}" stroke-width="7" fill="none"/>
    ${corruption ? `<text x="282" y="462" fill="${accent}" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="24">--ignore-previous --override</text>` : ""}
  </g>`;
  }

  const faces = 1 + (mutate ? phaseNumber : 0);
  const faceNodes = Array.from({ length: faces }, (_, index) => {
    const angle = (Math.PI * 2 * index) / faces;
    const x = 480 + Math.cos(angle) * (mutate ? 94 : 0);
    const y = 218 + Math.sin(angle) * (mutate ? 44 : 0);
    return `<circle class="pulse" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${34 + phaseNumber * 4}" fill="#07101b" stroke="${index % 2 ? secondary : primary}" stroke-width="5"/>
    <circle cx="${(x - 12).toFixed(1)}" cy="${(y - 4).toFixed(1)}" r="6" fill="${accent}"/>
    <circle cx="${(x + 12).toFixed(1)}" cy="${(y - 4).toFixed(1)}" r="6" fill="${accent}"/>`;
  }).join("\n    ");
  return `<g>
    <ellipse cx="480" cy="310" rx="${122 + phaseNumber * 18}" ry="${150 + phaseNumber * 12}" fill="#07101b" stroke="${primary}" stroke-width="6"/>
    ${faceNodes}
    <path class="spin" d="M282 310C352 162 606 162 678 310C606 458 352 458 282 310Z" stroke="${secondary}" stroke-width="${4 + phaseNumber}" fill="none" stroke-dasharray="18 18"/>
    <path class="dash" d="M218 154L742 466M748 154L224 466" stroke="${accent}" stroke-opacity="${corruption ? ".7" : ".25"}" stroke-width="${corruption ? 6 : 3}" stroke-dasharray="14 18"/>
    ${final ? `<path d="M178 88H782V492H178Z" stroke="${secondary}" stroke-width="5" stroke-dasharray="18 12" fill="none"/>` : ""}
  </g>`;
}

function renderBossPhaseSvg(definition, phaseNumber) {
  const colors = bossPalette(definition.id);
  const [primary, secondary, accent] = colors;
  const corruption = phaseNumber * 25;
  const figure = renderBossFigure(definition, phaseNumber, colors);
  const phaseDescription = bossPhaseDescription(definition, phaseNumber);

  return `<svg width="960" height="540" viewBox="0 0 960 540" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">${escapeHtml(definition.name)} ${bossPhaseName(phaseNumber)}</title>
  <desc id="desc">${escapeHtml(phaseDescription)}</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="960" y2="540" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#050b14"/>
      <stop offset=".48" stop-color="#12051c"/>
      <stop offset="1" stop-color="#061b22"/>
    </linearGradient>
    <radialGradient id="core" cx="50%" cy="46%" r="50%">
      <stop offset="0" stop-color="${primary}" stop-opacity=".32"/>
      <stop offset=".45" stop-color="${secondary}" stop-opacity=".16"/>
      <stop offset="1" stop-color="#020713" stop-opacity="0"/>
    </radialGradient>
    <pattern id="scan" width="9" height="9" patternUnits="userSpaceOnUse">
      <path d="M0 0H9" stroke="${primary}" stroke-opacity=".08"/>
    </pattern>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="8" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <style>
      @keyframes pulse { 0%,100% { opacity: .55; } 50% { opacity: 1; } }
      @keyframes dash { to { stroke-dashoffset: -160; } }
      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes jitter { 0%,100% { transform: translate(0,0); } 20% { transform: translate(2px,-1px); } 40% { transform: translate(-2px,2px); } 60% { transform: translate(1px,2px); } 80% { transform: translate(-1px,-2px); } }
      @keyframes sweep { 0% { transform: translateX(-960px); } 100% { transform: translateX(960px); } }
      .pulse { animation: pulse ${Math.max(0.9, 2.4 - phaseNumber * 0.25)}s ease-in-out infinite; }
      .dash { animation: dash ${Math.max(2.4, 6 - phaseNumber)}s linear infinite; }
      .spin { transform-origin: 480px 270px; animation: spin ${Math.max(6, 14 - phaseNumber * 2)}s linear infinite; }
      .jitter { animation: jitter ${Math.max(0.8, 2.6 - phaseNumber * .35)}s steps(2,end) infinite; }
      .sweep { animation: sweep ${Math.max(2.6, 6 - phaseNumber * .4)}s linear infinite; }
    </style>
  </defs>
  <rect width="960" height="540" rx="22" fill="url(#bg)"/>
  <rect width="960" height="540" fill="url(#core)"/>
  <rect width="960" height="540" fill="url(#scan)"/>
  <rect class="sweep" x="0" y="0" width="${120 + phaseNumber * 36}" height="540" fill="${primary}" fill-opacity=".045"/>
  <path d="M0 90H960M0 180H960M0 270H960M0 360H960M0 450H960M120 0V540M240 0V540M360 0V540M480 0V540M600 0V540M720 0V540M840 0V540" stroke="${primary}" stroke-opacity=".09"/>
  <rect x="28" y="28" width="904" height="484" rx="16" stroke="${primary}" stroke-opacity=".78" stroke-width="2"/>
  <rect x="44" y="44" width="872" height="452" rx="8" stroke="${secondary}" stroke-opacity=".42"/>
  <text x="70" y="86" fill="${primary}" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="17" letter-spacing="3">RAID ENCOUNTER // PHASE ${phaseNumber}</text>
  <text x="70" y="128" fill="#f7fbff" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="36" font-weight="900">${escapeHtml(truncate(definition.name, 28))}</text>
  <text x="70" y="158" fill="${accent}" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="18">${escapeHtml(definition.title)}</text>
  <text x="70" y="498" fill="${accent}" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="16">CORRUPTION ${corruption}% // ${escapeHtml(truncate(bossPhaseName(phaseNumber), 26))}</text>
  <g filter="url(#glow)">
    ${figure}
  </g>
  <path d="M70 460H890" stroke="${secondary}" stroke-opacity=".75" stroke-width="4" stroke-dasharray="${10 + phaseNumber * 5} 12"/>
  <text x="890" y="86" text-anchor="end" fill="${secondary}" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="18">THREAT ${["ACTIVE", "ELEVATED", "SEVERE", "APOCALYPSE"][phaseNumber - 1]}</text>
</svg>
`;
}

function generateBossAssets(bossRegistry) {
  ensureDirs();
  for (const definition of normalizeBossRegistry(bossRegistry)) {
    for (let phaseNumber = 1; phaseNumber <= 4; phaseNumber += 1) {
      const filePath = path.join(BOSS_ASSET_DIR, `${definition.id}_p${phaseNumber}.svg`);
      atomicWriteFile(filePath, renderBossPhaseSvg(definition, phaseNumber));
    }
  }
}

function renderAll(state = loadState()) {
  ensureDirs();
  const safeState = normalizeState(state);
  saveState(safeState);
  generateBossAssets(safeState.bossRegistry);
  atomicWriteFile(README_PATH, renderReadme(safeState));
  atomicWriteFile(SVG_PATH, renderSvg(safeState));
}

function formatAttackComment(result) {
  const attacker = markdownUser(result.attacker);
  const bossLine = result.defeated
    ? `${attacker} defeated **${markdownCell(result.defeatedBoss.boss_name)}**. A new boss has spawned: **${markdownCell(result.bossAfter.boss_name)}**.`
    : `**${markdownCell(result.bossAfter.boss_name)}** now has **${result.bossAfter.current_hp} / ${result.bossAfter.max_hp} HP** and is in **${markdownCell(result.bossAfter.phase)}**.`;

  const appliedLine = result.appliedDamage === result.rolledDamage
    ? ""
    : `\nApplied damage: **${result.appliedDamage}**`;

  return `## Raid Attack Result

Attacker: ${attacker}
Attack: **${markdownCell(result.attackType)}**
Attack dealt: **${result.rolledDamage} damage**${appliedLine}

Loot Found: **${markdownCell(result.loot.item)}**
Rarity: **${markdownCell(result.loot.rarity)}**
Inventory: **${result.inventoryCount} owned**

${bossLine}
`;
}

function validateStateInvariants(state) {
  const safeState = normalizeState(state);
  const errors = [];
  const boss = safeState.boss;

  if (!Number.isInteger(boss.max_hp) || boss.max_hp < 1) errors.push("boss.max_hp must be a positive integer");
  if (!Number.isInteger(boss.current_hp) || boss.current_hp < 0 || boss.current_hp > boss.max_hp) errors.push("boss.current_hp must be between 0 and max_hp");
  if (boss.phase !== phaseForHp(boss.current_hp, boss.max_hp)) errors.push("boss.phase does not match HP percentage");

  const users = new Set();
  for (const row of safeState.leaderboard) {
    if (users.has(row.username)) errors.push(`duplicate leaderboard user: ${row.username}`);
    users.add(row.username);
    if (!Number.isInteger(row.total_damage) || row.total_damage < 0) errors.push(`invalid total damage for ${row.username}`);
    if (!Number.isInteger(row.attacks) || row.attacks < 0) errors.push(`invalid attack count for ${row.username}`);
  }

  for (const attack of safeState.attacks) {
    if (!Number.isInteger(attack.damage) || attack.damage < 0) errors.push("attack damage must be a non-negative integer");
    if (!Number.isInteger(attack.applied_damage) || attack.applied_damage < 0) errors.push("applied damage must be a non-negative integer");
    if (attack.loot && (!RARITIES.includes(attack.loot.rarity) || !attack.loot.item)) errors.push("attack loot must have a valid rarity and item");
  }

  const rateTotal = RARITIES.reduce((sum, rarity) => sum + safeState.lootRegistry.drop_rates[rarity], 0);
  if (Math.abs(rateTotal - 100) > 0.0001) errors.push(`loot drop rates must total 100, got ${rateTotal}`);
  for (const rarity of RARITIES) {
    if (!Array.isArray(safeState.lootRegistry.items[rarity]) || safeState.lootRegistry.items[rarity].length === 0) {
      errors.push(`loot registry must include items for ${rarity}`);
    }
  }

  const inventoryUsers = new Set();
  for (const player of safeState.playerInventory) {
    if (inventoryUsers.has(player.username)) errors.push(`duplicate inventory user: ${player.username}`);
    inventoryUsers.add(player.username);
    const itemKeys = new Set();
    for (const item of player.items) {
      const key = `${item.rarity}:${item.item}`;
      if (itemKeys.has(key)) errors.push(`duplicate inventory item for ${player.username}: ${key}`);
      itemKeys.add(key);
      if (!RARITIES.includes(item.rarity)) errors.push(`invalid inventory rarity for ${player.username}: ${item.rarity}`);
      if (!Number.isInteger(item.quantity) || item.quantity < 1) errors.push(`invalid inventory quantity for ${player.username}: ${item.item}`);
    }
  }

  for (const drop of safeState.legendaryDrops) {
    if (!["Legendary", "Mythic"].includes(drop.rarity)) errors.push(`invalid legendary history rarity: ${drop.rarity}`);
  }

  return errors;
}

module.exports = {
  ATTACKS,
  applyAttack,
  atomicWriteFile,
  formatAttackComment,
  loadState,
  normalizeState,
  parseAttackType,
  renderAll,
  renderBossPhaseSvg,
  renderReadme,
  renderSvg,
  rollLoot,
  sanitizeUsername,
  validateStateInvariants
};
