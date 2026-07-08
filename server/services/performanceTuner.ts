import os from 'os';
import fs from 'fs';
import path from 'path';
import { getDatabase } from '../database';

export interface PerformancePreset {
  id: string;
  name: string;
  description: string;
  jvmFlags: string[];
  viewDistance: number;
  simulationDistance: number;
  cpuCores: number;
  ramGb: number;
}

export interface TuneResult {
  preset: PerformancePreset;
  autoFlags: string[];
  recommendedViewDistance: number;
  recommendedSimulationDistance: number;
  systemRamGb: number;
  systemCpuCores: number;
  totalFlags: string[];
}

const PRESETS: Record<string, Omit<PerformancePreset, 'cpuCores' | 'ramGb'>> = {
  aikars: {
    id: 'aikars',
    name: "Aikar's Flags (Recommended)",
    description: 'Optimized G1GC flags based on Aikar\'s community-tested Minecraft server tuning. Best balance of performance and stability.',
    jvmFlags: [
      '-XX:+UseG1GC',
      '-XX:+ParallelRefProcEnabled',
      '-XX:MaxGCPauseMillis=200',
      '-XX:+UnlockExperimentalVMOptions',
      '-XX:+DisableExplicitGC',
      '-XX:+AlwaysPreTouch',
      '-XX:G1NewSizePercent=30',
      '-XX:G1MaxNewSizePercent=40',
      '-XX:G1HeapRegionSize=8M',
      '-XX:G1ReservePercent=20',
      '-XX:G1HeapWastePercent=5',
      '-XX:G1MixedGCCountTarget=4',
      '-XX:InitiatingHeapOccupancyPercent=15',
      '-XX:G1MixedGCLiveThresholdPercent=90',
      '-XX:G1RSetUpdatingPauseTimePercent=5',
      '-XX:SurvivorRatio=32',
      '-XX:+PerfDisableSharedMem',
      '-XX:MaxTenuringThreshold=1',
      '-Dfile.encoding=UTF-8',
    ],
    viewDistance: 10,
    simulationDistance: 8,
  },
  aggressive: {
    id: 'aggressive',
    name: 'Aggressive (High-End PC)',
    description: 'Maximum performance tuning for systems with 16+ GB RAM and 8+ CPU cores. Prioritizes throughput over memory.',
    jvmFlags: [
      '-XX:+UseG1GC',
      '-XX:+ParallelRefProcEnabled',
      '-XX:MaxGCPauseMillis=100',
      '-XX:+UnlockExperimentalVMOptions',
      '-XX:+DisableExplicitGC',
      '-XX:+AlwaysPreTouch',
      '-XX:G1NewSizePercent=40',
      '-XX:G1MaxNewSizePercent=50',
      '-XX:G1HeapRegionSize=16M',
      '-XX:G1ReservePercent=15',
      '-XX:G1HeapWastePercent=3',
      '-XX:G1MixedGCCountTarget=8',
      '-XX:InitiatingHeapOccupancyPercent=10',
      '-XX:G1MixedGCLiveThresholdPercent=85',
      '-XX:G1RSetUpdatingPauseTimePercent=10',
      '-XX:SurvivorRatio=16',
      '-XX:+PerfDisableSharedMem',
      '-XX:MaxTenuringThreshold=1',
      '-XX:+UseStringDeduplication',
      '-XX:+OptimizeStringConcat',
      '-XX:+UseCompressedOops',
      '-Dfile.encoding=UTF-8',
    ],
    viewDistance: 12,
    simulationDistance: 10,
  },
  lowmemory: {
    id: 'lowmemory',
    name: 'Low Memory (<4GB)',
    description: 'Conservative tuning for systems with limited RAM. Minimizes memory overhead while maintaining stable TPS.',
    jvmFlags: [
      '-XX:+UseG1GC',
      '-XX:MaxGCPauseMillis=300',
      '-XX:+UnlockExperimentalVMOptions',
      '-XX:+DisableExplicitGC',
      '-XX:G1NewSizePercent=20',
      '-XX:G1MaxNewSizePercent=30',
      '-XX:G1HeapRegionSize=4M',
      '-XX:G1ReservePercent=25',
      '-XX:G1HeapWastePercent=10',
      '-XX:G1MixedGCCountTarget=4',
      '-XX:InitiatingHeapOccupancyPercent=20',
      '-XX:G1MixedGCLiveThresholdPercent=95',
      '-XX:SurvivorRatio=48',
      '-XX:MaxTenuringThreshold=2',
      '-XX:+UseCompressedOops',
      '-Dfile.encoding=UTF-8',
    ],
    viewDistance: 6,
    simulationDistance: 4,
  },
  vanilla: {
    id: 'vanilla',
    name: 'Vanilla (Minimal)',
    description: 'Minimal JVM flags. Best for debugging or when running with stock Minecraft launcher settings.',
    jvmFlags: [
      '-XX:+UseG1GC',
      '-XX:MaxGCPauseMillis=200',
      '-XX:+UnlockExperimentalVMOptions',
      '-XX:+DisableExplicitGC',
      '-Dfile.encoding=UTF-8',
    ],
    viewDistance: 10,
    simulationDistance: 8,
  },
};

export function getPresets(): Omit<PerformancePreset, 'cpuCores' | 'ramGb'>[] {
  return Object.values(PRESETS);
}

export function getPreset(id: string): PerformancePreset | null {
  const base = PRESETS[id];
  if (!base) return null;
  const cpuCores = os.cpus().length;
  const ramGb = Math.round(os.totalmem() / 1024 / 1024 / 1024);
  return { ...base, cpuCores, ramGb };
}

export function detectPreset(): string {
  const cpuCores = os.cpus().length;
  const ramGb = Math.round(os.totalmem() / 1024 / 1024 / 1024);
  if (ramGb <= 4 && cpuCores <= 4) return 'lowmemory';
  if (ramGb >= 16 && cpuCores >= 8) return 'aggressive';
  return 'aikars';
}

export function autoTune(overrideRamGb?: number): TuneResult {
  const cpuCores = os.cpus().length;
  const ramGb = overrideRamGb ?? Math.round(os.totalmem() / 1024 / 1024 / 1024);
  const presetId = detectPreset();
  const base = PRESETS[presetId];
  const preset: PerformancePreset = { ...base, cpuCores, ramGb };

  const minSuggested = Math.max(2, Math.min(ramGb - 1, ramGb));
  const allocatedGb = Math.min(ramGb, 32);
  const xms = `-Xms${Math.min(allocatedGb, Math.max(2, Math.round(allocatedGb * 0.5)))}G`;
  const xmx = `-Xmx${allocatedGb}G`;

  const javaFlags = [xms, xmx];

  const autoFlags = javaFlags;
  const recViewDist = Math.max(4, Math.min(16, Math.round(ramGb * 1.2)));
  const recSimDist = Math.max(3, Math.min(12, Math.round(ramGb * 0.8)));

  const totalFlags = [...autoFlags, ...preset.jvmFlags];

  return {
    preset,
    autoFlags,
    recommendedViewDistance: recViewDist,
    recommendedSimulationDistance: recSimDist,
    systemRamGb: ramGb,
    systemCpuCores: cpuCores,
    totalFlags,
  };
}

export function buildJvmArgs(config: { minRam?: string; maxRam?: string; jvmFlags?: string | null }): string[] {
  const flags: string[] = [];

  const minRam = config.minRam || '2G';
  const maxRam = config.maxRam || '8G';
  flags.push(`-Xms${minRam}`);
  flags.push(`-Xmx${maxRam}`);

  if (config.jvmFlags && config.jvmFlags.trim()) {
    const custom = config.jvmFlags
      .split(/\s+/)
      .map(f => f.trim())
      .filter(f => f && !f.startsWith('-Xms') && !f.startsWith('-Xmx'));
    flags.push(...custom);
  } else {
    const tune = autoTune();
    flags.push(...tune.preset.jvmFlags);
  }

  return flags;
}

export function generateYmlOptimizations(serverDir: string, softwareType: string, serverId: string): string[] {
  const generated: string[] = [];
  const db = getDatabase();
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId) as any;
  if (!server) return generated;

  const viewDist = server.simulationDistance || server.viewDistance || 8;
  const ramGb = parseInt(server.maxRam || '8');

  if (softwareType === 'paper' || softwareType === 'purpur' || softwareType === 'pufferfish' || softwareType === 'folia') {
    const paperYml = path.join(serverDir, 'paper.yml');
    if (!fs.existsSync(paperYml)) {
      const content = generatePaperYml(viewDist, ramGb);
      fs.writeFileSync(paperYml, content, 'utf-8');
      generated.push('paper.yml');
    }
  }

  if (softwareType === 'pufferfish') {
    const pufferYml = path.join(serverDir, 'pufferfish.yml');
    if (!fs.existsSync(pufferYml)) {
      const content = generatePufferfishYml(viewDist);
      fs.writeFileSync(pufferYml, content, 'utf-8');
      generated.push('pufferfish.yml');
    }
  }

  if (softwareType === 'purpur') {
    const purpurYml = path.join(serverDir, 'purpur.yml');
    if (!fs.existsSync(purpurYml)) {
      const content = generatePurpurYml();
      fs.writeFileSync(purpurYml, content, 'utf-8');
      generated.push('purpur.yml');
    }
  }

  const bukkitYml = path.join(serverDir, 'bukkit.yml');
  if (!fs.existsSync(bukkitYml)) {
    const content = generateBukkitYml(ramGb);
    fs.writeFileSync(bukkitYml, content, 'utf-8');
    generated.push('bukkit.yml');
  }

  const spigotYml = path.join(serverDir, 'spigot.yml');
  if (!fs.existsSync(spigotYml)) {
    const content = generateSpigotYml();
    fs.writeFileSync(spigotYml, content, 'utf-8');
    generated.push('spigot.yml');
  }

  return generated;
}

function generatePaperYml(viewDistance: number, ramGb: number): string {
  const maxAutoSave = Math.max(60, Math.min(600, Math.round(ramGb * 30)));
  return `# PaperMC Configuration — Auto-generated by MineControl OS
settings:
  velocity-support:
    enabled: false
  bungee-online-mode: true
  player-auto-save-rate: ${maxAutoSave}
  save-player-data: true
  baby-zombie-movement-speed: false
  limit-network-interval: true
  use-alternate-luck-formulae: true
  
chunks:
  auto-save-interval: ${maxAutoSave}
  max-chunk-sends-per-player: 8
  max-chunk-gens-per-tick: 100
  delay-chunk-unloads-by: 10s
  
world-settings:
  default:
    view-distance: ${viewDistance}
    simulation-distance: ${Math.max(3, Math.round(viewDistance * 0.75))}
    arrow-despawn-rate: 300
    trident-despawn-rate: 300
    entity-activation-range:
      animals: 16
      monsters: 24
      raiders: 48
      misc: 8
      water: 8
      villagers: 16
      flying-monsters: 48
    entity-activation-range-animals-update: 1
    entity-activation-range-monsters-update: 1
    entity-activation-range-raiders-update: 1
    entity-activation-range-misc-update: 1
    entity-activation-range-water-update: 1
    entity-activation-range-villagers-update: 1
    entity-activation-range-flying-monsters-update: 1
    hopper:
      cooldown: 8
      disable-move-event: false
    tick-next-tick-list-cap: 10000
    tick-next-tick-list-cap-ignores-redstone: true
    max-auto-save-chunks-per-tick: 6
    prevent-moving-into-unloaded-chunks: true
    max-entity-collisions: 1
    water-over-lava-flow-speed: 5
    game-mechanics:
      disable-chest-cat-detection: true
      disable-relative-projectile-velocity: false
    falling-blocks:
      max-fall-height: 64
    fishing-time-range:
      minimum-tick: 100
      maximum-tick: 900
    despawn-ranges:
      soft: 32
      hard: 128
    nerf-spawner-mobs: false
`;
}

function generatePufferfishYml(viewDistance: number): string {
  return `# Pufferfish Configuration — Auto-generated by MineControl OS
enable-async-mob-spawning: true
enable-suffocation-optimization: true
dab:
  enabled: true
  start-distance: 8
  max-distance: ${Math.max(16, viewDistance * 2)}
  max-tick-freq: 20
  activation-dist-mod: 7
  blacklisted-types: []
inactive-goal-selector-throttle: true
enable-pregen-removal: true
throttle-datasync: true
max-soft-desync-percent: 10
book-size-limit:
  max-book-page-size: 2560
  max-book-total-size-mb: 20
`;
}

function generatePurpurYml(): string {
  return `# Purpur Configuration — Auto-generated by MineControl OS
settings:
  blocks:
    barrel: false
    beacon: false
    blast-furnace: false
    brewing-stand: false
    chest: false
    dispenser: false
    dropper: false
    furnace: false
    hopper: false
    observer: false
    smoker: false
  allow-headless-pistons: false
  allow-permanent-block-break-exploits: false
  allow-trampling: false
  allow-water-placement-in-the-end: true
  fix-items-merging-through-walls: true
  infinite-fuel-patron-api: false
  flying-fall-damage: false
  game-mechanics:
    player:
      idle-timeout: 0
      spawn-invulnerable-ticks: 60
      max-elytra-height: 320
  mobs:
    disable-parrots-dismount-on-login: true
  server-mod-name: MineControl OS
  use-alternate-throwable-lore: true
`;
}

function generateBukkitYml(ramGb: number): string {
  const maxThreads = Math.max(2, Math.min(8, Math.round(os.cpus().length / 2)));
  return `# Bukkit Configuration — Auto-generated by MineControl OS
settings:
  allow-end: true
  warn-on-overload: true
  permissions-file: permissions.yml
  update-folder: update
  plugin-profiling: false
  connection-throttle: 4000
  query-plugins: true
  deprecated-verbose: default
  shutdown-message: Server closed
  minimum-api: none
  use-map-color-cache: true
  region-file-cache-size: ${Math.max(64, Math.min(512, ramGb * 64))}
  region-file-compression: 2
  chunks-per-tick: ${maxThreads * 2}
  clear-list: false
  bulk-ops: true
  filter-creative-items: true
  moved-wrongly-threshold: 0.0625
  moved-too-quickly-threshold: 0.0625
  item-despawn-rate: 6000
  remove-unused-entities: true
  entity-activation-range:
    animals: 16
    monsters: 24
    misc: 8
  spawn-limits:
    monsters: 70
    animals: 10
    water-animals: 5
    water-ambient: 20
    water-underground-creature: 5
    axolotls: 5
    ambient: 1
  chunk-gc:
    period-in-ticks: 600
    load-threshold: 0
  ticks-per:
    animal-spawns: 400
    monster-spawns: 1
    water-spawns: 1
    water-ambient-spawns: 1
    water-underground-creature-spawns: 1
    axolotl-spawns: 1
    ambient-spawns: 1
    autosave: ${Math.max(60, Math.min(600, Math.round(ramGb * 30)))}
  hopper-amount: 1
  hopper-check-frequency: 8
`;
}

function generateSpigotYml(): string {
  return `# Spigot Configuration — Auto-generated by MineControl OS
settings:
  debug: false
  save-user-cache-on-stop-only: false
  sample-count: 12
  bungeecord: false
  late-bind: false
  player-shuffle: 0
  user-cache-size: 1000
  moved-wrongly-threshold: 0.0625
  moved-too-quickly-multiplier: 10.0
  moved-too-quickly-threshold: 0.0625
  netty-threads: 4
  timeout-time: 60
  restart-on-crash: false
  restart-script: ./start.sh
  attribute:
    maxAbsorption: 2048
    maxHealth: 2048
    max-movement-speed: 1024
    maxAttackDamage: 2048
  log-villager-deaths: true
  log-named-deaths: true
messages:
  whitelist: You are not whitelisted on this server!
  unknown-command: Unknown command. Type "/help" for help.
  server-full: The server is full!
  outdated-client: Outdated client! Please use {0}
  outdated-server: Outdated server! I'm still on {0}
  restart: Server is restarting
advancements:
  disable-saving: false
  disabled:
    - minecraft:story/disabled
commands:
  tab-complete: 0
  send-namespaced: true
  log: true
  spam-exclusions:
    - /skill
  silent-commandblock-console: false
  replace-commands:
    - setblock
    - summon
    - testforblock
players:
  disable-saving: false
world-settings:
  default:
    verbose: false
    merge-radius:
      exp: 4.0
      item: 3.5
    mob-spawner-tick-rate: 1
    enable-zombie-pigmen-portal-spawns: true
    item-despawn-rate: 6000
    arrow-despawn-rate: 1200
    trident-despawn-rate: 1200
    wither-spawn-sound-radius: 0
    frog-despawn-rate: 1200
    view-distance: default
    simulation-distance: default
    thunder-chance: 100000
    weather-thunder-chance: 100000
    hanging-tick-frequency: 100
    zombie-aggressive-towards-villager: true
    nerf-spawner-mobs: false
    entity-activation-range:
      animals: 16
      monsters: 24
      raiders: 48
      misc: 8
      water: 8
      villagers: 16
      flying-monsters: 48
    entity-tracking-range:
      players: 48
      animals: 48
      monsters: 48
      misc: 32
      other: 64
    hunger:
      jump-walk-exhaustion: 0.05
      jump-sprint-exhaustion: 0.2
      combat-exhaustion: 0.1
      regen-exhaustion: 6.0
      swim-multiplier: 0.01
      sprint-multiplier: 0.1
      other-multiplier: 0.0
    max-tick-time:
      tile: 50
      entity: 50
    max-tnt-per-tick: 100
    growth:
      cactus-modifier: 100
      cane-modifier: 100
      melon-modifier: 100
      mushroom-modifier: 100
      pumpkin-modifier: 100
      sapling-modifier: 100
      beetroot-modifier: 100
      carrot-modifier: 100
      potato-modifier: 100
      wheat-modifier: 100
      netherwart-modifier: 100
      vine-modifier: 100
      cocoa-modifier: 100
      bamboo-modifier: 100
      sweetberry-modifier: 100
      kelp-modifier: 100
      twistingvines-modifier: 100
      weepingvines-modifier: 100
      cavevines-modifier: 100
    dragon-death-sound-radius: 0
    seed-village: default
    seed-desert: default
    seed-igloo: default
    seed-jungle: default
    seed-swamp: default
    seed-monument: default
    seed-ocean: default
    seed-outpost: default
    seed-endcity: default
    seed-buriedtreasure: default
    seed-mansion: default
    seed-fossil: default
    seed-portal: default
    seed-shipwreck: default
    seed-stronghold: default
    seed-mineshaft: default
    seed-ancientcity: default
    seed-deepdark: default
    seed-trailruins: default
    seed-trialchambers: default
    seed-pale-garden: default
    below-zero-generation-in-existing-chunks: true
    max-tnt: 100
    hive-debug: false
    ender-dragon-death-always-places-dragon-egg: false
    water-over-lava-flow-speed: 5
    use-async-lighting: true
`;
}
