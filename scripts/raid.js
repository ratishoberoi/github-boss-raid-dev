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
const EXECUTIONERS_PATH = path.join(DATA_DIR, "executioners.json");
const LOOT_REGISTRY_PATH = path.join(DATA_DIR, "loot_registry.json");
const PLAYER_INVENTORY_PATH = path.join(DATA_DIR, "player_inventory.json");
const LEGENDARY_DROPS_PATH = path.join(DATA_DIR, "legendary_drops.json");
const LOCK_PATH = path.join(DATA_DIR, ".raid.lock");
const README_PATH = path.join(ROOT, "README.md");
const SVG_PATH = path.join(ASSETS_DIR, "boss-card.svg");
const BOSS_ASSET_DIR = path.join(ASSETS_DIR, "bosses");
const DEFEAT_ASSET_DIR = path.join(ASSETS_DIR, "defeats");

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
  fs.mkdirSync(DEFEAT_ASSET_DIR, { recursive: true });
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

function executionerBadgeForBoss(bossId, bossName) {
  const badges = {
    gpu_devourer: "GPU Slayer",
    hallucination_titan: "Titan Breaker",
    data_leak_hydra: "Hydra Hunter",
    gradient_vanisher: "Reality Anchor",
    overfitted_beast: "Beast Tamer",
    prompt_goblin: "Prompt Exorcist"
  };
  const id = slugify(bossId || bossName, DEFAULT_BOSS.boss_id);
  return badges[id] || `${singleLine(bossName, "Boss", 40).replace(/^The\s+/i, "")} Executioner`;
}

function defeatCardPathForExecution(execution) {
  const id = slugify(execution.boss_id || execution.boss_name, DEFAULT_BOSS.boss_id);
  const timestampSlug = singleLine(execution.timestamp, new Date(0).toISOString(), 40).replace(/[^0-9TZ]/g, "");
  const username = sanitizeUsername(execution.username);
  return `assets/defeats/${id}_${timestampSlug}_${username}.svg`;
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

function phaseProgressLine(boss) {
  const current = phaseNumberForBoss(boss);
  return [1, 2, 3, 4].map((phaseNumber) => {
    const label = phaseNumber === 4 ? "Phase 4" : `Phase ${phaseNumber}`;
    if (phaseNumber < current) return `✅ ${label}`;
    if (phaseNumber === current) return `🔥 ${label}`;
    return `⬜ ${label}`;
  }).join(" → ");
}

function phasesRemaining(boss) {
  return Math.max(0, 4 - phaseNumberForBoss(boss));
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

function normalizeExecutioners(rawExecutioners) {
  const rows = Array.isArray(rawExecutioners) ? rawExecutioners : [];
  return rows.filter(isObject).map((entry) => {
    const bossId = slugify(entry.boss_id || entry.boss_name, DEFAULT_BOSS.boss_id);
    const bossName = singleLine(entry.boss_name, DEFAULT_BOSS.boss_name, 64);
    const timestamp = validTimestamp(entry.timestamp);
    const normalized = {
      username: sanitizeUsername(entry.username),
      boss_id: bossId,
      boss_name: bossName,
      boss_title: singleLine(entry.boss_title, "Raid Entity", 80),
      final_damage: toInteger(entry.final_damage, 0, 0, 1000000000),
      timestamp,
      boss_phase: singleLine(entry.boss_phase, "Final Phase", 20),
      boss_image: singleLine(entry.boss_image, `assets/bosses/${bossId}_p4.svg`, 160),
      executioner_badge: singleLine(entry.executioner_badge, executionerBadgeForBoss(bossId, bossName), 80)
    };
    normalized.defeat_card = singleLine(entry.defeat_card, defeatCardPathForExecution(normalized), 180);
    return normalized;
  });
}

function normalizeState(state) {
  const bossRegistry = normalizeBossRegistry(state.bossRegistry);
  return {
    bossRegistry,
    boss: normalizeBoss(state.boss, bossRegistry),
    leaderboard: normalizeLeaderboard(state.leaderboard),
    attacks: normalizeAttacks(state.attacks),
    hallOfFame: normalizeHallOfFame(state.hallOfFame),
    executioners: normalizeExecutioners(state.executioners),
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
    executioners: readJson(EXECUTIONERS_PATH, []),
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
  writeJson(EXECUTIONERS_PATH, normalized.executioners);
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

function topExecutioners(executioners, limit = 10) {
  const byUser = new Map();
  for (const execution of executioners) {
    const username = sanitizeUsername(execution.username);
    const current = byUser.get(username) || {
      username,
      execution_count: 0,
      first_execution: execution.timestamp,
      latest_execution: execution.timestamp
    };
    current.execution_count += 1;
    if (Date.parse(execution.timestamp) < Date.parse(current.first_execution)) current.first_execution = execution.timestamp;
    if (Date.parse(execution.timestamp) > Date.parse(current.latest_execution)) current.latest_execution = execution.timestamp;
    byUser.set(username, current);
  }
  return [...byUser.values()].sort((a, b) => (
    b.execution_count - a.execution_count
    || Date.parse(b.latest_execution) - Date.parse(a.latest_execution)
    || a.username.localeCompare(b.username)
  )).slice(0, limit);
}

function spawnNextBoss(hallOfFameCount, bossRegistry = DEFAULT_BOSS_REGISTRY, defeatedBossId = null) {
  const registry = normalizeBossRegistry(bossRegistry);
  const defeatedIndex = registry.findIndex((boss) => boss.id === defeatedBossId);
  const index = defeatedIndex >= 0
    ? (defeatedIndex + 1) % registry.length
    : Math.max(0, hallOfFameCount) % registry.length;
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
    let execution = null;
    if (defeated) {
      const bossDefinition = bossById(state.bossRegistry, bossBefore.boss_id);
      const executionerBadge = executionerBadgeForBoss(bossBefore.boss_id, bossBefore.boss_name);
      execution = {
        username,
        boss_id: bossBefore.boss_id,
        boss_name: bossBefore.boss_name,
        boss_title: bossDefinition.title,
        final_damage: rolledDamage,
        timestamp,
        boss_phase: bossBefore.phase,
        boss_image: bossImagePathFor(bossBefore, 4),
        executioner_badge: executionerBadge
      };
      execution.defeat_card = defeatCardPathForExecution(execution);
      state.executioners.unshift(execution);

      defeatedBoss = {
        boss_id: bossBefore.boss_id,
        boss_name: bossBefore.boss_name,
        boss_image: bossImagePathFor(bossBefore, 4),
        killer: username,
        executioner_badge: executionerBadge,
        defeat_card: execution.defeat_card,
        final_damage: rolledDamage,
        applied_damage: appliedDamage,
        timestamp
      };
      state.hallOfFame.unshift(defeatedBoss);
      state.boss = spawnNextBoss(state.hallOfFame.length, state.bossRegistry, bossBefore.boss_id);
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
      execution,
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

  const bossImage = bossImagePathFor(boss);
  const phaseDescription = bossDefinition[phaseKeyForBoss(boss)];

  return `<p align="center">
  <img src="./${bossImage}" alt="${markdownCell(boss.boss_name)} raid encounter" width="960">
</p>

# ⚠ GLOBAL RAID ACTIVE

## ${markdownCell(boss.boss_name.toUpperCase())}

### ${markdownCell(bossDefinition.title)}

**HP ${boss.current_hp} / ${boss.max_hp} (${percent}%)**  
\`${progressBar(percent)}\`

**${markdownCell(boss.phase)} of 4**  
${markdownCell(phaseDescription)}

## [⚔ ATTACK THIS BOSS](${attackIssueUrl()})

Takes 10 seconds. Roll damage. Claim loot. Maybe land the killing blow.

## Live Raid Pulse

${renderLivePulse(safeState)}

## Phase Evolution

${renderPhaseEvolutionStrip(boss, bossDefinition)}

## Current Record Holders

${renderRecordHolders(safeState)}

## 👑 Latest Executioner

${renderLatestExecutioner(safeState.executioners)}

## Why Attack Now

${markdownCell(bossDefinition.lore)}

**Damage the boss. Roll loot. Push the next phase. Take the final blow.**

## Loot Signal

${renderLootTease(safeState)}

<details>
<summary>Recent Combat</summary>

## Last 10 Attacks

| Time | Attacker | Attack | Damage | Result |
| --- | --- | --- | ---: | --- |
${attackRows}

## Top 10 Attackers

| Rank | Attacker | Total Damage | Attacks |
| ---: | --- | ---: | ---: |
${leaderboardRows}

</details>

<details>
<summary>Loot Vault</summary>

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

</details>

<details>
<summary>Executioner Archives</summary>

## 👑 Executioner Hall

${renderExecutionerHall(safeState.executioners)}

## Top Executioners

${renderTopExecutioners(safeState.executioners)}

## Hall of Fame

${renderHallOfFame(safeState.hallOfFame)}

</details>

<details>
<summary>Raid Rules</summary>

## Attack Damage

| Attack | Damage |
| --- | ---: |
| Slash | 5-20 |
| Critical Strike | 0-100 |
| Lucky Attack | 1-500 |

## Drop Rates

${renderDropRates(safeState.lootRegistry, inventoryTotals(safeState.playerInventory))}

## Implementation

This raid runs entirely inside GitHub using the profile README, Issues, Actions, JSON state, and generated SVGs.

</details>

<!-- This README is generated by scripts/render_readme.js. -->
`;
}

function renderLivePulse(state) {
  const lastAttack = state.attacks[0];
  const latestLootAttack = state.attacks.find((attack) => attack.loot);
  const topRaider = state.leaderboard[0];
  const latestExecutioner = state.executioners[0];
  const latestKiller = state.hallOfFame[0];
  const executionSignal = latestExecutioner
    ? `${markdownUser(latestExecutioner.username)} (${markdownCell(latestExecutioner.executioner_badge)})`
    : latestKiller
      ? `${markdownUser(latestKiller.killer)} defeated ${markdownCell(latestKiller.boss_name)}`
      : "No boss has fallen yet.";

  return `**Last Attack:** ${lastAttack ? `${markdownUser(lastAttack.attacker)} hit for ${lastAttack.damage}` : "⚠ No one has attacked yet. Become the First Raider."}  
**Latest Loot:** ${latestLootAttack && latestLootAttack.loot ? `${markdownUser(latestLootAttack.attacker)} found ${markdownCell(latestLootAttack.loot.item)} (${markdownCell(latestLootAttack.loot.rarity)})` : "No relics discovered. The vault awaits."}  
**Top Raider:** ${topRaider ? `${markdownUser(topRaider.username)} with ${topRaider.total_damage} damage` : "⚠ No one has attacked yet. Become the First Raider."}  
**Boss Killer:** ${executionSignal}`;
}

function renderPhaseEvolutionStrip(boss, bossDefinition) {
  const current = phaseNumberForBoss(boss);
  const cells = [1, 2, 3, 4].map((phaseNumber) => {
    const status = phaseNumber < current ? "✅ CLEARED" : phaseNumber === current ? "🔥 CURRENT" : "⬜ LOCKED";
    const imagePath = bossImagePathFor(boss, phaseNumber);
    const width = phaseNumber === current ? 210 : 170;
    const imageStyle = phaseNumber > current ? ' style="opacity:0.42; filter:grayscale(1);"' : "";
    return `<td align="center" width="25%">
      <img src="./${imagePath}" alt="${markdownCell(boss.boss_name)} phase ${phaseNumber}" width="${width}"${imageStyle}>
      <br><strong>${status}</strong><br>
      <sub>Phase ${phaseNumber}</sub>
    </td>`;
  }).join("\n    ");
  return `<table>
  <tr>
    ${cells}
  </tr>
</table>

**${phaseProgressLine(boss)}**  
Current transformation: ${markdownCell(bossDefinition[phaseKeyForBoss(boss)])}  
Phases remaining: **${phasesRemaining(boss)}**`;
}

function renderRecordHolders(state) {
  const mostDamage = state.leaderboard[0];
  const mostLoot = topCollectors(state.playerInventory, 1)[0];
  const mostExecutions = topExecutioners(state.executioners, 1)[0];
  return `**Most Damage:** ${mostDamage ? `${markdownUser(mostDamage.username)} (${mostDamage.total_damage})` : "No raiders yet"}  
**Most Loot:** ${mostLoot ? `${markdownUser(mostLoot.username)} (${inventoryStatsForPlayer(mostLoot).totalItems})` : "No collectors yet"}  
**Most Executions:** ${mostExecutions ? `${markdownUser(mostExecutions.username)} (${mostExecutions.execution_count})` : "No executions yet"}`;
}

function renderLootTease(state) {
  const latestDropAttack = state.attacks.find((attack) => attack.loot);
  const totals = inventoryTotals(state.playerInventory);
  const topCollector = topCollectors(state.playerInventory, 1)[0];
  const legendaryCount = state.legendaryDrops.filter((drop) => drop.rarity === "Legendary").length;
  const mythicCount = state.legendaryDrops.filter((drop) => drop.rarity === "Mythic").length;
  return `**Latest Drop:** ${latestDropAttack && latestDropAttack.loot ? `${markdownUser(latestDropAttack.attacker)} found ${markdownCell(latestDropAttack.loot.item)} (${markdownCell(latestDropAttack.loot.rarity)})` : "No relics discovered. The vault awaits."}  
**Vault:** ${totals.totalItems} relics held by ${totals.uniqueCollectors} collectors  
**Rare History:** ${legendaryCount} Legendary / ${mythicCount} Mythic  
**Top Collector:** ${topCollector ? `${markdownUser(topCollector.username)} (${inventoryStatsForPlayer(topCollector).totalItems} relics)` : "No collectors yet"}`;
}

function renderDropRates(lootRegistry, totals) {
  const rarityRows = RARITIES.map((rarity) => (
    `| ${rarity} | ${lootRegistry.drop_rates[rarity]}% | ${totals.rarityTotals[rarity]} | ${lootRegistry.items[rarity].length} |`
  )).join("\n");
  return `| Rarity | Drop Rate | Owned | Registry Items |
| --- | ---: | ---: | ---: |
${rarityRows}`;
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

function renderLatestExecutioner(executioners) {
  if (!executioners.length) {
    return "No executioner yet. Land the final blow to claim the first crown.";
  }
  const execution = executioners[0];
  return `<p align="center">
  <img src="./${markdownCell(execution.defeat_card)}" alt="${markdownCell(execution.boss_name)} execution card" width="720">
</p>

| Boss Name | Executioner | Badge | Final Blow | Date |
| --- | --- | --- | ---: | --- |
| ${markdownCell(execution.boss_name)} | ${markdownUser(execution.username)} | ${markdownCell(execution.executioner_badge)} | ${execution.final_damage} | ${markdownCell(execution.timestamp)} |`;
}

function renderPhaseProgress(boss, bossDefinition) {
  const current = phaseNumberForBoss(boss);
  const rows = [1, 2, 3, 4].map((phaseNumber) => {
    const status = phaseNumber < current ? "✅ Completed" : phaseNumber === current ? "🔥 Current" : "⬜ Remaining";
    return `| ${status} | Phase ${phaseNumber} | ${markdownCell(bossDefinition[`phase_${phaseNumber}`])} |`;
  }).join("\n");
  return `**${phaseProgressLine(boss)}**

| Status | Phase | Transformation |
| --- | --- | --- |
${rows}

Phases remaining: **${phasesRemaining(boss)}**`;
}

function renderExecutionerHall(executioners) {
  if (!executioners.length) {
    return "| Boss | Executioner | Badge | Final Blow | Date |\n| --- | --- | --- | ---: | --- |\n| No executions yet | - | - | - | - |";
  }
  const rows = executioners.map((execution) => (
    `| ${markdownCell(execution.boss_name)} | ${markdownUser(execution.username)}<br>(${markdownCell(execution.executioner_badge)}) | ${markdownCell(execution.executioner_badge)} | ${execution.final_damage} | ${markdownCell(execution.timestamp)} |`
  )).join("\n");
  return `| Boss | Executioner | Badge | Final Blow | Date |
| --- | --- | --- | ---: | --- |
${rows}`;
}

function renderTopExecutioners(executioners) {
  const rows = topExecutioners(executioners, 10);
  if (!rows.length) {
    return "| Executioner | Execution Count | First Execution | Latest Execution |\n| --- | ---: | --- | --- |\n| No executions yet | 0 | - | - |";
  }
  return `| Executioner | Execution Count | First Execution | Latest Execution |
| --- | ---: | --- | --- |
${rows.map((row) => `| ${markdownUser(row.username)} | ${row.execution_count} | ${markdownCell(row.first_execution)} | ${markdownCell(row.latest_execution)} |`).join("\n")}`;
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

  function slashStorm(opacity = ".45") {
    return `<path class="flow" d="M72 122C210 58 360 164 490 112C650 48 776 80 906 166M54 414C208 334 360 450 518 382C662 320 772 344 916 270" stroke="${secondary}" stroke-opacity="${opacity}" stroke-width="${phaseNumber + 3}" stroke-linecap="round" stroke-dasharray="26 18" fill="none"/>
    <path class="shake" d="M190 72L246 154L198 230L276 304L218 426L288 510M742 58L694 146L760 238L690 314L744 430L686 512" stroke="${accent}" stroke-opacity="${corruption ? ".64" : ".28"}" stroke-width="${phaseNumber + 2}" fill="none"/>`;
  }

  function dragonSpines(startX, count, baseY, height) {
    return Array.from({ length: count }, (_, index) => {
      const x = startX + index * 58;
      const y = baseY - Math.sin(index * 0.9) * 28;
      const c = index % 2 ? secondary : primary;
      return `<path class="pulse" d="M${x} ${y}L${x + 28} ${y - height - phaseNumber * 10}L${x + 58} ${y}Z" fill="#070b12" stroke="${c}" stroke-width="${3 + phaseNumber * 0.6}"/>`;
    }).join("\n    ");
  }

  if (definition.id === "gpu_devourer") {
    const bodyStroke = final ? 13 : 8 + phaseNumber;
    const headScale = final ? 1 : 0;
    const spines = dragonSpines(220, final ? 11 : 7 + phaseNumber, 252 - phaseNumber * 7, 66);
    const wings = mutate
      ? `<path class="shake" d="M346 244C218 108 108 104 54 232C170 206 242 274 352 312Z" fill="#080b13" stroke="${secondary}" stroke-width="${6 + phaseNumber}" stroke-linejoin="round"/>
    <path class="shake" d="M604 230C730 86 864 82 922 210C796 196 728 272 608 304Z" fill="#080b13" stroke="${secondary}" stroke-width="${6 + phaseNumber}" stroke-linejoin="round"/>`
      : "";
    const reactorBreak = corruption
      ? `<path class="pulse" d="M390 282C438 222 526 220 574 286C540 352 426 354 390 282Z" fill="${primary}" fill-opacity=".62" stroke="${accent}" stroke-width="8"/>
    <path class="flow" d="M426 290C374 360 382 424 330 500M526 292C584 366 574 430 630 512" stroke="${primary}" stroke-width="${8 + phaseNumber}" stroke-linecap="round" stroke-dasharray="20 14" fill="none"/>`
      : `<path class="pulse" d="M410 286C452 246 516 246 558 288C516 318 454 318 410 286Z" fill="${accent}" fill-opacity=".42" stroke="${accent}" stroke-width="6"/>`;
    const furnaceMaw = final
      ? `<path class="pulse" d="M674 190C758 130 882 148 932 242C880 342 748 338 674 270Z" fill="#020408" stroke="${secondary}" stroke-width="12"/>
    <path d="M716 216C770 190 852 202 890 246C844 284 768 284 716 252Z" fill="${primary}" fill-opacity=".72" stroke="${accent}" stroke-width="7"/>
    <path d="M724 178L746 236L770 174L794 242L824 176L840 238L870 188M722 310L750 252L774 318L798 250L824 318L844 256L878 304" stroke="#f8fbff" stroke-width="5" stroke-linecap="round"/>`
      : `<path class="pulse" d="M690 186L766 160L850 206L774 226L842 260L736 256L690 224Z" fill="#070b12" stroke="${secondary}" stroke-width="${7 + phaseNumber}"/>
    <path d="M724 200L754 216L722 228M782 196L814 210L780 226" stroke="${accent}" stroke-width="6" stroke-linecap="round"/>`;
    return `<g>
    ${wings}
    <path d="M86 332C172 226 300 176 458 192C584 206 660 242 736 214C660 336 548 420 358 412C248 406 154 376 86 332Z" fill="#060a12" stroke="${primary}" stroke-width="${bodyStroke}" stroke-linejoin="round"/>
    <path d="M118 338C70 292 58 204 108 132C158 226 252 236 336 286C246 284 178 306 118 338Z" fill="#090f18" stroke="${secondary}" stroke-width="8"/>
    ${spines}
    ${furnaceMaw}
    ${reactorBreak}
    <path d="M246 382L156 506M354 404L314 526M590 398L662 528M688 350L836 486" stroke="${primary}" stroke-width="${final ? 24 : 14 + phaseNumber * 2}" stroke-linecap="round"/>
    <path d="M166 506L112 510M314 526L272 524M662 528L708 522M836 486L890 498" stroke="${secondary}" stroke-width="9" stroke-linecap="round"/>
    ${final ? `<path class="pulse" d="M110 92C282 34 662 28 910 118C790 126 704 174 670 246C522 154 302 160 110 92Z" fill="${primary}" fill-opacity=".13" stroke="${secondary}" stroke-width="7"/>` : ""}
    ${slashStorm(final ? ".82" : ".34")}
  </g>`;
  }

  if (definition.id === "data_leak_hydra") {
    const heads = [3, 5, 7, 9][phaseNumber - 1];
    const headNodes = Array.from({ length: heads }, (_, index) => {
      const x = 120 + index * (720 / Math.max(1, heads - 1));
      const y = 164 + (index % 3) * 38 - phaseNumber * 12;
      const c = index % 2 ? secondary : primary;
      const jaw = y + 42 + phaseNumber * 3;
      return `<path d="M480 370C${x + 42} 348 ${x - 58} 238 ${x} ${y}" stroke="${c}" stroke-width="${22 + phaseNumber * 2}" stroke-linecap="round" fill="none"/>
    <path class="pulse" d="M${x - 66} ${y + 20}C${x - 38} ${y - 44} ${x + 42} ${y - 52} ${x + 82} ${y + 8}C${x + 44} ${y + 72} ${x - 34} ${y + 76} ${x - 66} ${y + 20}Z" fill="#061012" stroke="${c}" stroke-width="6"/>
    <path d="M${x - 34} ${y + 14}L${x - 8} ${y}L${x - 16} ${y + 30}M${x + 30} ${y + 12}L${x + 56} ${y - 2}L${x + 48} ${y + 30}" stroke="${accent}" stroke-width="6" fill="none"/>
    <path d="M${x - 24} ${jaw}C${x + 8} ${jaw + 16} ${x + 46} ${jaw + 8} ${x + 72} ${jaw - 18}" stroke="${secondary}" stroke-width="5" fill="none"/>
    <path class="flow" d="M${x + 16} ${y + 78}C${x + 10} ${y + 130} ${x + 44} ${y + 156} ${x + 22} ${y + 216}" stroke="${accent}" stroke-opacity=".52" stroke-width="5" stroke-dasharray="14 12" fill="none"/>`;
    }).join("\n    ");
    return `<g>
    <path d="M176 386C258 282 390 250 480 314C586 244 736 286 822 398C676 496 330 500 176 386Z" fill="#050b10" stroke="${primary}" stroke-width="${9 + phaseNumber}"/>
    <path d="M264 426C386 342 574 342 704 430C590 506 388 506 264 426Z" fill="#020607" stroke="${secondary}" stroke-width="7"/>
    ${headNodes}
    <path class="flow" d="M112 462C292 382 446 510 606 426C704 374 806 404 914 458" stroke="${secondary}" stroke-opacity=".92" stroke-width="${7 + phaseNumber}" stroke-dasharray="${phaseNumber * 8 + 12} 12" fill="none"/>
    ${final ? `<path class="shake" d="M48 94C248 34 680 30 920 104C824 164 826 238 906 318C680 274 318 274 64 326C156 232 150 158 48 94Z" stroke="${secondary}" stroke-width="8" fill="${secondary}" fill-opacity=".12"/>` : ""}
    ${slashStorm(final ? ".74" : ".42")}
  </g>`;
  }

  if (definition.id === "gradient_vanisher") {
    const echoes = Array.from({ length: 4 + phaseNumber }, (_, index) => {
      const offset = (index - 2) * (24 + phaseNumber * 4);
      const opacity = Math.max(0.08, 0.44 - index * 0.045);
      return `<path class="drift" d="M${420 + offset} 56C292 150 280 374 ${438 + offset} 516C516 448 598 318 568 184C546 102 488 72 ${420 + offset} 56Z" fill="${index % 2 ? secondary : primary}" fill-opacity="${opacity}" stroke="${accent}" stroke-opacity="${opacity}" stroke-width="3"/>`;
    }).join("\n    ");
    const voidCuts = corruption
      ? `<path d="M392 164L504 206L434 278L556 330L452 394L540 476" stroke="#020409" stroke-width="${34 + phaseNumber * 6}" stroke-linecap="round" fill="none"/>
    <path class="flow" d="M170 120L812 462M848 94L128 474M314 36L642 520" stroke="${secondary}" stroke-width="${6 + phaseNumber}" stroke-dasharray="12 20"/>`
      : "";
    return `<g>
    ${echoes}
    <path class="pulse" d="M454 48C306 154 294 384 454 526C548 450 638 320 606 180C580 94 526 62 454 48Z" fill="#060914" fill-opacity="${final ? ".28" : ".82"}" stroke="${primary}" stroke-width="${8 + phaseNumber}"/>
    <path d="M350 218C428 138 552 144 628 236C546 202 430 204 350 218Z" fill="${secondary}" fill-opacity=".22" stroke="${secondary}" stroke-width="7"/>
    <path class="pulse" d="M424 250L466 224L452 282ZM538 254L586 228L558 288Z" fill="${accent}"/>
    <path d="M380 386C460 440 552 424 622 360" stroke="${primary}" stroke-width="9" fill="none"/>
    ${voidCuts}
    ${final ? `<path class="shake" d="M182 72C344 148 626 130 806 54C694 224 720 384 846 512C614 440 350 462 132 522C260 356 270 220 182 72Z" fill="${primary}" fill-opacity=".10" stroke="${accent}" stroke-width="7"/>` : ""}
  </g>`;
  }

  if (definition.id === "overfitted_beast") {
    const shards = Array.from({ length: 8 + phaseNumber * 4 }, (_, index) => {
      const x = 172 + (index % 8) * 86;
      const y = 132 + Math.floor(index / 8) * 90 + (index % 2) * 20;
      return `<path class="shake" d="M${x} ${y}L${x + 64} ${y - 22}L${x + 86} ${y + 42}L${x + 18} ${y + 64}Z" fill="#0a1018" stroke="${index % 2 ? secondary : primary}" stroke-width="4"/>
    <path d="M${x + 14} ${y + 20}C${x + 34} ${y + 6} ${x + 58} ${y + 8} ${x + 72} ${y + 28}" stroke="${accent}" stroke-width="3" fill="none"/>`;
    }).join("\n    ");
    return `<g>
    <path d="M126 388C182 230 306 112 484 118C674 126 824 246 884 412C692 526 318 530 126 388Z" fill="#070812" stroke="${secondary}" stroke-width="${11 + phaseNumber}"/>
    <path d="M318 186L244 42L438 128M642 190L720 42L522 128" fill="#070812" stroke="${primary}" stroke-width="9"/>
    <path d="M236 328L70 ${mutate ? 214 : 292}M730 330L914 ${mutate ? 210 : 296}M304 426L218 ${final ? 540 : 496}M676 426L778 ${final ? 540 : 496}" stroke="${primary}" stroke-width="${18 + phaseNumber * 4}" stroke-linecap="round"/>
    <path d="M70 214L34 242M914 210L946 236M218 540L172 534M778 540L824 532" stroke="${secondary}" stroke-width="10" stroke-linecap="round"/>
    <path class="pulse" d="M398 258L456 224L438 292ZM566 260L506 224L526 294Z" fill="${accent}"/>
    <path d="M386 356C448 424 552 422 628 354" stroke="${secondary}" stroke-width="11" fill="none"/>
    ${shards}
    ${final ? `<path class="flow" d="M86 448C282 548 692 550 888 442" stroke="${primary}" stroke-width="13" stroke-dasharray="28 12" fill="none"/>` : ""}
  </g>`;
  }

  if (definition.id === "prompt_goblin") {
    const sigils = Array.from({ length: phaseNumber + 4 }, (_, index) => {
      const x = 166 + index * 92;
      const y = 82 + (index % 2) * 56;
      return `<path class="shake" d="M${x} ${y}C${x + 46} ${y - 40} ${x + 74} ${y + 28} ${x + 22} ${y + 62}M${x + 2} ${y + 28}L${x + 72} ${y + 20}" stroke="${index % 2 ? secondary : primary}" stroke-width="5" fill="none"/>`;
    }).join("\n    ");
    const shadow = final ? `<path class="pulse" d="M228 62C404 10 698 44 820 196C696 170 628 270 638 428C514 326 392 330 276 428C314 284 308 164 228 62Z" fill="${secondary}" fill-opacity=".16" stroke="${secondary}" stroke-width="7"/>` : "";
    return `<g>
    ${shadow}
    ${sigils}
    <path d="M478 84C628 160 706 310 630 466C548 530 406 530 328 462C254 304 318 154 478 84Z" fill="#07101b" stroke="${primary}" stroke-width="${9 + phaseNumber}"/>
    <path d="M372 214L218 ${mutate ? 92 : 188}C286 286 290 366 194 474M584 214L746 ${mutate ? 92 : 188}C674 286 670 366 766 474" stroke="${secondary}" stroke-width="${14 + phaseNumber * 4}" stroke-linecap="round" fill="none"/>
    <path d="M400 200L294 48L468 146M556 200L666 48L490 146" fill="#07101b" stroke="${accent}" stroke-width="8"/>
    <path class="pulse" d="M410 280L466 246L446 316ZM548 280L492 246L512 316Z" fill="${accent}"/>
    <path d="M390 356Q480 ${final ? 446 : 394} 570 354" stroke="${secondary}" stroke-width="11" fill="none"/>
    <path d="M344 462L270 532M616 462L696 532" stroke="${primary}" stroke-width="${14 + phaseNumber * 2}" stroke-linecap="round"/>
    ${corruption ? `<path class="flow" d="M146 448C284 406 404 488 480 430C574 358 708 424 832 382" stroke="${accent}" stroke-width="7" stroke-dasharray="16 12" fill="none"/>` : ""}
  </g>`;
  }

  const faces = 1 + (mutate ? phaseNumber : 0);
  const faceNodes = Array.from({ length: faces }, (_, index) => {
    const angle = (Math.PI * 2 * index) / faces;
    const x = 480 + Math.cos(angle) * (mutate ? 156 : 0);
    const y = 214 + Math.sin(angle) * (mutate ? 82 : 0);
    return `<path class="pulse" d="M${x - 72} ${y + 8}C${x - 44} ${y - 74} ${x + 46} ${y - 76} ${x + 76} ${y + 4}C${x + 42} ${y + 88} ${x - 38} ${y + 88} ${x - 72} ${y + 8}Z" fill="#07101b" stroke="${index % 2 ? secondary : primary}" stroke-width="6"/>
    <path d="M${x - 34} ${y - 8}L${x - 6} ${y - 28}L${x - 16} ${y + 10}M${x + 30} ${y - 8}L${x + 58} ${y - 28}L${x + 48} ${y + 10}" stroke="${accent}" stroke-width="6" fill="none"/>`;
  }).join("\n    ");
  return `<g>
    <path d="M480 38C310 112 224 306 284 476C408 544 572 544 688 472C750 298 674 110 480 38Z" fill="#07101b" stroke="${primary}" stroke-width="${10 + phaseNumber}"/>
    <path d="M310 288L92 ${mutate ? 150 : 238}M650 288L872 ${mutate ? 150 : 238}M376 438L278 ${final ? 548 : 502}M590 438L698 ${final ? 548 : 502}" stroke="${secondary}" stroke-width="${16 + phaseNumber * 4}" stroke-linecap="round"/>
    ${faceNodes}
    <path class="spin" d="M188 314C300 78 660 76 774 314C660 542 300 546 188 314Z" stroke="${secondary}" stroke-width="${6 + phaseNumber}" fill="none" stroke-dasharray="22 18"/>
    <path class="flow" d="M116 118L850 498M884 116L90 500" stroke="${accent}" stroke-opacity="${corruption ? ".78" : ".32"}" stroke-width="${corruption ? 8 : 5}" stroke-dasharray="14 20"/>
    ${final ? `<path class="shake" d="M84 52C292 12 676 12 878 56C794 178 792 348 910 520C662 450 312 456 56 522C176 346 176 176 84 52Z" stroke="${secondary}" stroke-width="8" fill="${secondary}" fill-opacity=".10"/>` : ""}
  </g>`;
}

function renderBossPhaseSvg(definition, phaseNumber) {
  const colors = bossPalette(definition.id);
  const [primary, secondary, accent] = colors;
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
    <filter id="heavyGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="16" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <style>
      @keyframes pulse { 0%,100% { opacity: .55; } 50% { opacity: 1; } }
      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes shake { 0%,100% { transform: translate(0,0); } 20% { transform: translate(3px,-2px); } 40% { transform: translate(-3px,2px); } 60% { transform: translate(2px,3px); } 80% { transform: translate(-2px,-3px); } }
      @keyframes drift { 0%,100% { transform: translateX(0); } 50% { transform: translateX(16px); } }
      @keyframes sweep { 0% { transform: translateX(-960px); } 100% { transform: translateX(960px); } }
      @keyframes flow { to { stroke-dashoffset: -220; } }
      .pulse { animation: pulse ${Math.max(0.9, 2.4 - phaseNumber * 0.25)}s ease-in-out infinite; }
      .spin { transform-origin: 480px 270px; animation: spin ${Math.max(6, 14 - phaseNumber * 2)}s linear infinite; }
      .shake { animation: shake ${Math.max(0.7, 2.2 - phaseNumber * .28)}s steps(2,end) infinite; }
      .drift { animation: drift ${Math.max(2.2, 5.4 - phaseNumber * .45)}s ease-in-out infinite; }
      .sweep { animation: sweep ${Math.max(2.6, 6 - phaseNumber * .4)}s linear infinite; }
      .flow { animation: flow ${Math.max(2.2, 5.2 - phaseNumber * .5)}s linear infinite; }
    </style>
  </defs>
  <rect width="960" height="540" fill="url(#bg)"/>
  <rect width="960" height="540" fill="url(#core)"/>
  <rect width="960" height="540" fill="url(#scan)"/>
  <rect class="sweep" x="0" y="0" width="${120 + phaseNumber * 36}" height="540" fill="${primary}" fill-opacity=".045"/>
  <path d="M0 108H960M0 432H960M110 0V540M850 0V540" stroke="${primary}" stroke-opacity=".08"/>
  <path d="M22 24H202M758 24H938M22 516H202M758 516H938" stroke="${secondary}" stroke-opacity=".72" stroke-width="4"/>
  <path class="spin" d="M84 270C204 32 756 32 876 270C756 508 204 508 84 270Z" stroke="${secondary}" stroke-opacity=".18" stroke-width="${phaseNumber + 3}" stroke-dasharray="26 18" fill="none"/>
  <g filter="url(#heavyGlow)">
    ${figure}
  </g>
  <g filter="url(#glow)">
    <path d="M36 42H174L208 76H36Z" fill="#020713" fill-opacity=".82" stroke="${primary}" stroke-width="2"/>
    <text x="58" y="67" fill="${accent}" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="22" font-weight="900">PHASE ${phaseNumber}</text>
  </g>
</svg>
`;
}

function renderDefeatCard(execution) {
  return `<svg width="960" height="540" viewBox="0 0 960 540" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">Boss terminated: ${escapeHtml(execution.boss_name)}</title>
  <desc id="desc">${escapeHtml(execution.username)} earned ${escapeHtml(execution.executioner_badge)} with ${execution.final_damage} final damage.</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="960" y2="540" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#090704"/>
      <stop offset=".45" stop-color="#221404"/>
      <stop offset="1" stop-color="#050b14"/>
    </linearGradient>
    <linearGradient id="gold" x1="160" y1="0" x2="800" y2="540" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fff4a3"/>
      <stop offset=".35" stop-color="#ffbf2e"/>
      <stop offset=".72" stop-color="#ff2bd6"/>
      <stop offset="1" stop-color="#23f7dd"/>
    </linearGradient>
    <filter id="glow" x="-30%" y="-40%" width="160%" height="180%">
      <feGaussianBlur stdDeviation="9" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <pattern id="scan" width="8" height="8" patternUnits="userSpaceOnUse">
      <path d="M0 0H8" stroke="#ffbf2e" stroke-opacity=".1"/>
    </pattern>
    <style>
      @keyframes pulse { 0%,100% { opacity: .55; } 50% { opacity: 1; } }
      @keyframes sweep { 0% { transform: translateX(-960px); } 100% { transform: translateX(960px); } }
      @keyframes dash { to { stroke-dashoffset: -180; } }
      .pulse { animation: pulse 1.8s ease-in-out infinite; }
      .sweep { animation: sweep 4.6s linear infinite; }
      .dash { animation: dash 3.6s linear infinite; }
    </style>
  </defs>
  <rect width="960" height="540" rx="24" fill="url(#bg)"/>
  <rect width="960" height="540" fill="url(#scan)"/>
  <rect class="sweep" x="0" y="0" width="180" height="540" fill="#ffbf2e" fill-opacity=".065"/>
  <rect x="28" y="28" width="904" height="484" rx="18" stroke="url(#gold)" stroke-width="3"/>
  <rect x="52" y="52" width="856" height="436" rx="10" stroke="#ffbf2e" stroke-opacity=".45"/>
  <text x="80" y="106" fill="#ffbf2e" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="24" font-weight="900" letter-spacing="3">BOSS TERMINATED</text>
  <text x="80" y="170" fill="#f7fbff" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="48" font-weight="900">${escapeHtml(truncate(execution.boss_name, 24))}</text>
  <text x="80" y="220" fill="#23f7dd" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="24">${escapeHtml(execution.boss_title)}</text>
  <g filter="url(#glow)">
    <path class="pulse" d="M480 258L526 332L612 354L556 420L562 506L480 474L398 506L404 420L348 354L434 332Z" fill="url(#gold)" fill-opacity=".88"/>
    <circle cx="480" cy="388" r="74" fill="#020713" stroke="#ffbf2e" stroke-width="7"/>
    <text x="480" y="414" text-anchor="middle" fill="#ffbf2e" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="72" font-weight="900">👑</text>
  </g>
  <path class="dash" d="M78 260H882M78 456H882" stroke="#ffbf2e" stroke-width="5" stroke-dasharray="22 14"/>
  <text x="80" y="306" fill="#ffbf2e" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="20">EXECUTIONER</text>
  <text x="80" y="350" fill="#f7fbff" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="34" font-weight="900">@${escapeHtml(truncate(execution.username, 22))}</text>
  <text x="80" y="392" fill="#23f7dd" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="26">${escapeHtml(execution.executioner_badge)}</text>
  <text x="628" y="306" fill="#ffbf2e" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="20">FINAL DAMAGE</text>
  <text x="628" y="354" fill="#f7fbff" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="44" font-weight="900">${execution.final_damage}</text>
  <text x="628" y="404" fill="#c8d8ef" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="18">${escapeHtml(execution.timestamp)}</text>
</svg>
`;
}

function generateDefeatCards(executioners) {
  ensureDirs();
  for (const execution of normalizeExecutioners(executioners)) {
    const filePath = path.join(ROOT, execution.defeat_card);
    atomicWriteFile(filePath, renderDefeatCard(execution));
  }
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
  generateDefeatCards(safeState.executioners);
  atomicWriteFile(README_PATH, renderReadme(safeState));
  atomicWriteFile(SVG_PATH, renderSvg(safeState));
}

function formatAttackComment(result) {
  const attacker = markdownUser(result.attacker);
  const bossLine = result.defeated
    ? `${attacker} defeated **${markdownCell(result.defeatedBoss.boss_name)}** and became **${markdownCell(result.execution.executioner_badge)}**. A new boss has spawned: **${markdownCell(result.bossAfter.boss_name)}**.`
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

  const executionKeys = new Set();
  for (const execution of safeState.executioners) {
    const key = `${execution.boss_id}:${execution.timestamp}:${execution.username}`;
    if (executionKeys.has(key)) errors.push(`duplicate execution entry: ${key}`);
    executionKeys.add(key);
    if (!execution.executioner_badge) errors.push(`execution missing badge: ${key}`);
    if (!execution.boss_image) errors.push(`execution missing boss image: ${key}`);
    if (!execution.defeat_card) errors.push(`execution missing defeat card: ${key}`);
    if (!Number.isInteger(execution.final_damage) || execution.final_damage < 0) errors.push(`invalid execution final damage: ${key}`);
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
  renderDefeatCard,
  renderReadme,
  renderSvg,
  rollLoot,
  sanitizeUsername,
  validateStateInvariants
};
