# MineControl OS v1.0.17 — Software Requirements Specification & Product Requirements Document

---

## 1. Product Vision

### Why MineControl OS Exists
Setting up and managing a Minecraft server is unnecessarily complex. Owners must juggle jar downloads, port forwarding, plugin hunting, configuration files, Java arguments, world management, and backup strategies — often across a dozen different websites and tools. MineControl OS replaces this fragmented workflow with a single desktop application that automates everything.

### Problems It Solves
- **Discovery hell**: No more searching for "best PaperMC version" or "compatible plugins" — the app curates and validates everything.
- **Configuration fatigue**: Every server property, JVM flag, and world setting is exposed through a clean GUI, not a text file.
- **Maintenance burden**: Updates, backups, restarts, and monitoring happen automatically.
- **Skill barrier**: Beginners get a guided wizard; experts get full control without ever touching a terminal.
- **Multi-server chaos**: Run a creative world, a survival world, and a minigame server from one install — each isolated, each with its own config.

### Target Users
| Persona | Need |
|---------|------|
| Absolute beginner | "I just want to play Minecraft with my friends right now" |
| Small SMP owner (3–15 players) | "I want a reliable server that doesn't require constant babysitting" |
| Content creator (streamer/YouTuber) | "I need quick resets, world templates, and clean restarts between sessions" |
| Large community owner (50+ players) | "I need permissions, plugins, performance tuning, and zero downtime" |
| Plugin/mod developer | "I need a fast test environment I can reset in seconds" |
| Hosting provider | "I want to offer MineControl OS as a managed service to my clients" |

### Future Vision
- **Cloud-managed mode**: Connect to a headless MineControl OS agent running on a VPS or dedicated server.
- **Team collaboration**: Multiple users can manage the same server with role-based access from different machines.
- **Marketplace**: A community-driven plugin, world, and template store with ratings and one-click install.
- **AI assistant**: Automated lag detection, crash analysis, and performance recommendations.

---

## 2. User Personas

### Persona 1: Alex (Beginner)
- **Age**: 14
- **Goal**: Play Minecraft with 3 friends after school
- **Pain**: Doesn't know what "Java" is. Has tried port forwarding and given up.
- **Needs**: One-click setup, cracked mode support, clear instructions for friends to connect.

### Persona 2: Jamie (SMP Owner)
- **Age**: 22
- **Goal**: Run a stable 10-player survival server for 6+ months
- **Pain**: Servers crash overnight, backups are unreliable, updating is scary.
- **Needs**: Scheduled restarts, automated backups, one-click Paper updates, Dynmap.

### Persona 3: Riley (Content Creator)
- **Age**: 27
- **Goal**: Record a 12-episode SMP series with unique worlds each season
- **Pain**: Manually resetting worlds, reinstalling plugins, changing MOTDs.
- **Needs**: World templates, server duplication, quick MOTD/seed changes, live map for viewers.

### Persona 4: Morgan (Community Owner)
- **Age**: 35
- **Goal**: Run a 100-player server with ranks, events, and zero lag
- **Pain**: Permissions management is a nightmare, plugin conflicts cause crashes, no visibility into performance.
- **Needs**: Role-based permissions GUI, plugin dependency resolution, real-time TPS/MSPT charts, audit logs.

---

## 3. Application Flow

```
┌─────────────────────────────────────────────────────────┐
│                    Launch App                           │
└────────────────────┬────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────────┐
│                   Welcome Screen                        │
│  [Quick Start] [Open Existing] [Tutorial] [Settings]   │
└────────────────────┬────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────────┐
│                      Login                              │
│   (first-time: create owner account)                    │
└────────────────────┬────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────────┐
│                  Server Library                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                │
│  │Server 1  │ │Server 2  │ │[+ Create]│                │
│  │🟢 Online │ │🔴 Offline│ │          │                │
│  │Paper 1.21│ │Vanilla   │ │          │                │
│  │  3/20    │ │  0/4     │ │          │                │
│  └──────────┘ └──────────┘ └──────────┘                │
└────────────────────┬────────────────────────────────────┘
                     ▼ (click server card)
┌─────────────────────────────────────────────────────────┐
│                   Server Dashboard                      │
│  ┌─────────┬─────────┬──────────┬──────────┐           │
│  │  CPU    │  RAM    │   TPS    │  PLAYERS │           │
│  │  23%    │ 2.1/4GB │  19.98   │   3/20   │           │
│  ├─────────┴─────────┴──────────┴──────────┤           │
│  │          Charts & Activity Feed          │           │
│  └──────────────────────────────────────────┘           │
│  [Start/Stop/Restart] [Console] [Players] [Worlds]     │
└────────────────────┬────────────────────────────────────┘
                     ▼ (sidebar navigation)
  ┌───┬──────────────────────────────────────┐
  │ ← │  Console │ Players │ Worlds │ Backups │
  │ S │  Plugins │ Map │ Settings │ More...   │
  │ i │                                      │
  │ d │      ┌──────────────────────┐        │
  │ e │      │    Page Content      │        │
  │ b │      │    (Outlet)          │        │
  │ a │      └──────────────────────┘        │
  │ r └──────────────────────────────────────┘
  └──────────────────────────────────────────┘
                     ▼ (multi-server)
┌─────────────────────────────────────────────────────────┐
│                 Server Creation Wizard                  │
│  Step 1/9: Name & Location                              │
│  Step 2/9: Software (Paper/Purpur/Vanilla/Forge...)    │
│  Step 3/9: Minecraft Version                            │
│  Step 4/9: World Settings (seed, gamemode, difficulty)  │
│  Step 5/9: Java & RAM Allocation                        │
│  Step 6/9: Recommended Plugins                          │
│  Step 7/9: Network (Local/LAN/Internet/Tunnel)          │
│  Step 8/9: Review & Confirm                             │
│  Step 9/9: Creating... Done!                            │
└────────────────────┬────────────────────────────────────┘
                     ▼
            (back to Server Library)
```

---

## 4. Complete UI/UX Design

### Design System

**Color Palette:**
- Background: `#0a0a0f` (deep space)
- Surface: `#13131a` (card backgrounds)
- Surface-elevated: `#1a1a24` (hovered cards)
- Borders: `#2a2a3a` (subtle dividers)
- Primary (Minecraft green): `#3b8c4a` → hover `#4aa85a`
- Accent (cyan): `#22d3ee` → for TPS, success states
- Warning: `#f59e0b`
- Danger: `#ef4444`
- Text primary: `#e8e8ed`
- Text secondary: `#8a8a9a`
- Text muted: `#5a5a6a`

**Typography:**
- UI: Inter (sans-serif), 4 sizes — xs(12px), sm(13px), base(14px), lg(16px)
- Data/monospace: JetBrains Mono for ports, IPs, versions, console
- Headings: Inter semibold at 18px–28px

**Spacing Grid:** 4px base unit. Cards use 16px padding. Section gaps use 24px.

**Corner Radius:** 8px for cards, 6px for buttons, 4px for inputs.

**Depth:** Cards cast subtle shadow (`0 1px 3px rgba(0,0,0,.3)`) on surface, elevated on hover (`0 4px 12px rgba(0,0,0,.5)`).

**Animations:**
- Page transitions: 200ms fade + 10px slide-up
- Card hover: 150ms scale(1.02) + border highlight
- Sidebar collapse: 250ms cubic-bezier width transition
- Modal/dialog: 200ms scale(0.95→1) + backdrop blur
- Toast: 300ms slide-in from top-right

### Global Components

**Sidebar (always visible):**
- Collapsible (icon-only at 60px, expanded at 220px)
- Sections: Server selector dropdown, primary nav items, secondary nav items, user avatar
- Server selector shows current server name + status dot + RAM usage mini-bar
- Active nav item: left border accent + subtle background tint

**Top Bar:**
- Current page title (dynamic)
- Server status indicator (green/yellow/gray dot + text)
- Quick actions: Start/Stop/Restart buttons
- Search bar (global file/player/setting search)
- Update pill (if update available)
- Notification bell with badge count
- Settings gear icon

**Status Dot System:**
- Green (#22c55e) + pulse animation = running
- Yellow (#eab308) + pulse = starting
- Red (#ef4444) = stopped/crashed
- Gray (#6b7280) = offline

**Empty States:**
Every list page shows a custom illustration + heading + description + CTA button.

**Loading States:**
Skeleton shimmer placeholders matching card shape. Never show raw spinners alone.

### Page-by-Page Design

#### Server Library (Home)
- Full-bleed hero area when first server created ("Your Server Library is Empty")
- Each server card: 280px wide, fixed aspect ratio
  - Top: status dot + server name + dropdown menu (⋮)
  - Middle: software badge, version, player count ("3/20")
  - Bottom: mini RAM bar + storage size + last played
  - Footer: Start/Stop button (large, prominent)
- Cards draggable for reorder (persisted to backend)
- Grid: responsive (1→2→3→4 columns)

#### Dashboard
- 4 large stat cards at top (CPU, RAM, TPS, Players) with micro-chart sparklines
- Connection info bar (localhost, LAN, public IP, tunnel — each copyable)
- Chart row: CPU+RAM area chart (30min), TPS line chart (30min)
- Activity feed: recent events (player join/leave, backup, start/stop)
- Quick action buttons: Console, Players, Backup Now

#### Console
- Terminal emulator styling: dark background, green monospace text
- Scroll-back buffer: 10,000 lines
- Log level color coding stays
- Command input at bottom with command history (↑/↓ arrows)
- Filter bar: level pills + search input
- Side panel: recent commands, common commands reference

#### Players
- Data table with sortable columns (username, role, status, playtime, last login)
- Inline actions: role dropdown, mute/kick/ban buttons
- Selection: checkboxes for bulk operations
- Player detail slide-over panel: full profile, stats, history, notes
- Whitelist/Banned tabs persist

#### Plugins
- Split view: left panel (installed plugins), right panel (marketplace/browser)
- Plugin cards show: name, version, author, enabled/disabled toggle, config button
- Version update badge if newer available
- Dependency tree visualization for conflict detection
- Bulk enable/disable/update

#### Worlds
- Grid cards with world thumbnail (2D bird's-eye if map render available)
- Size, seed, gamemode, difficulty, last backup age
- Actions: Clone, Optimize, Backup, Download, Delete, Preview Map

#### File Manager
- Sidebar: directory tree
- Main panel: file list with columns (name, size, modified, type)
- Top toolbar: Upload, New Folder, Refresh, Search
- Right-click context menu for all file operations
- Built-in editor for `.json`, `.yml`, `.properties`, `.txt`, `.js`, `.py` with syntax highlighting
- Drag-and-drop from OS file explorer

#### Settings
- Left nav: categories (General, Server, Java, Network, Security, Scheduled Tasks, About)
- Search across settings
- Every field has a help tooltip (ℹ icon)
- Unsaved changes warning when navigating away

---

## 5. Server Library

### Purpose
Central hub for managing multiple Minecraft servers from a single window. Replaces the current `/servers` page.

### UI
- **Default view**: Card grid (responsive 1–4 columns)
- **Alternate view**: Table list (toggle via button)
- **Sort by**: Name, status, last played, RAM usage
- **Filter by**: Status (online/offline/all), software type

### Each Card
| Element | Detail |
|---------|--------|
| Status dot | Green/yellow/gray/red |
| Server name | Editable inline (click to rename) |
| Software badge | Colored pill: Paper=purple, Vanilla=orange, Forge=blue, etc. |
| Version | e.g., "1.21.1" |
| Player count | "3/20" with mini bar |
| RAM usage | Mini bar: used/max GB |
| Storage | Total world size |
| Last played | Relative: "2h ago", "Yesterday" |
| Quick actions | Start/Stop button, dropdown (⋮) for: Duplicate, Backup, Export, Open Folder, Settings, Delete |

### Context Menu (Right-click card)
Same as dropdown: Duplicate, Backup, Export, Open Folder, Settings, Delete.

### Backend Logic
- `GET /api/servers` → list all servers with derived stats (RAM from config, storage from `du`, players from DB)
- `POST /api/servers` → create, auto-select if first
- `DELETE /api/servers/:id` → confirm dialog, optionally remove files
- `POST /api/servers/:id/duplicate` → copy directory + new DB row with renamed slug

### Acceptance
- Cards render within 500ms for 10 servers
- Status updates poll every 3s
- Create server navigates to wizard within 200ms

---

## 6. Server Creation Wizard

### Purpose
A 9-step guided flow that builds a complete server configuration without requiring technical knowledge.

### Steps

| Step | Screen | Fields |
|------|--------|--------|
| 1 | **Name** | Server name, optional description, data directory (auto-filled) |
| 2 | **Software** | 12 software options with badges + descriptions + "recommended for..." labels |
| 3 | **Version** | Search/filter version list from PaperMC API + Mojang manifest; "Latest Release" default |
| 4 | **World** | Seed (optional), gamemode, difficulty, world type (default/amplified/large biomes), PvP |
| 5 | **Java** | Java path auto-detect, min/max RAM slider with visual scale (1–32 GB), system RAM indicator |
| 6 | **Plugins** | Recommended plugins based on software choice, each with toggle + description |
| 7 | **Network** | Local only, LAN, Internet (port forwarding guide), Playit.gg tunnel (recommended for beginners) |
| 8 | **Summary** | Full configuration review with edit links per section |
| 9 | **Create** | Progress indicator: "Creating server...", "Downloading Paper 1.21.1...", "Generating world...", "Done!" |

### UI Details
- Fixed top progress bar with step labels (collapses to dots on narrow)
- "Back" and "Next" buttons always visible
- Step 2 (Software): show only versions available for chosen software after selection
- Step 6 (Plugins): pre-filter by compatibility with chosen software + version
- Step 8: each section is collapsible with edit pencil icon

### Backend
- Wizard is entirely client-built until "Create" is clicked
- `POST /api/servers` with full payload
- Server downloads jar + generates config asynchronously
- WebSocket event: `server:creating` with progress updates

---

## 7. Minecraft Version Manager

### Purpose
Single source of truth for all supported Minecraft server software versions. Never hardcode — fetch dynamically from official APIs.

### Supported Software
| Software | Source API | Notes |
|----------|-----------|-------|
| Vanilla | `launchermeta.mojang.com` | All versions ever released |
| Paper | `api.papermc.io/v2/projects/paper` | Latest builds per version |
| Purpur | `api.purpurmc.org/v2/purpur` | |
| Fabric | `meta.fabricmc.net/v2/versions` | Loader + installer |
| Forge | `files.minecraftforge.net/net/minecraftforge/forge` | Promoted + recommended |
| NeoForge | `api.neoforged.net/api/v1/versions` | |
| Quilt | `meta.quiltmc.org/v3/versions` | |
| Folia | `api.papermc.io/v2/projects/folia` | Paper's fork for large servers |
| Spigot | `hub.spigotmc.org/versions` | Requires BuildTools (warn: slow) |
| Bukkit | same as Spigot | |
| Velocity | `api.papermc.io/v2/projects/velocity` | Proxy |
| Waterfall | `api.papermc.io/v2/projects/waterfall` | Proxy (legacy) |
| Mohist | GitHub releases | Forge+Bukkit hybrid |
| Magma | GitHub releases | Forge+Bukkit hybrid (1.18+) |

### Features
- **Search**: fuzzy filter over all available versions
- **Favorites**: star versions for quick access
- **Compatibility check**: warn if selected plugin/mod doesn't support chosen version
- **Rollback**: keep previous jar, switch back with one click
- **Auto-update**: optional setting to update Paper to latest build on restart
- **Download progress**: WebSocket event with bytes/percentage

### Backend
- Cache API responses in DB with TTL (Paper: 5min, Mojang: 1h)
- Jar storage: `servers/<slug>/<software>-<version>.jar`
- Version metadata stored in `servers.version` + `servers.version_source`

---

## 8. Marketplace

### Purpose
Curated one-click installation for plugins, mods, modpacks, worlds, datapacks, resource packs, shaders, and server templates.

### Sources (Trusted Only)
| Source | Content | Auth Required |
|--------|---------|--------------|
| PaperMC Hangar | Plugins | No (public) |
| Modrinth | Plugins, Mods, Modpacks | No |
| SpigotMC | Plugins | No (public resources) |
| BuiltByBit | Premium plugins | Future |
| CurseForge | Mods, Modpacks | API key (future) |
| Planet Minecraft | Worlds, Resource Packs, Skins | No |

### Install Flow
1. Browse/search marketplace
2. Filter by source, category, game version, software
3. Click "Install" → dependency check → confirm dialog with version selection
4. Download progress shown in real-time
5. Post-install: show config button, restart prompt

### Template System
Pre-built server templates (one-click apply):
- "Vanilla Survival" — Paper, 3 plugins, standard config
- "Modded Adventure" — Forge, 20 mods, pre-generated map
- "Minigame Hub" — Purpur, minigame plugins, multiple worlds
- "Creative Plot" — Paper, WorldEdit, plots world
- "Empty Paper" — minimal config for advanced users

### Backend
- `GET /api/marketplace/search?q=&source=&category=&version=`
- `POST /api/marketplace/install` → download + verify + register
- `GET /api/marketplace/templates` → list available templates
- `POST /api/servers/:id/apply-template` → apply template config

---

## 9. Plugin Manager

### Purpose
Full lifecycle management for server plugins.

### Features
| Action | Implementation |
|--------|---------------|
| **Install** | Download from marketplace or custom URL → save to `plugins/` → register in DB |
| **Update** | Check marketplace for newer version → download → replace `.jar` → prompt restart |
| **Enable/Disable** | Rename `.jar` ↔ `.jar.disabled` (Minecraft skips `.disabled`) |
| **Delete** | Remove `.jar` + DB record. Confirm dialog. Optionally keep config files. |
| **Reload** | Send `/plugman reload <name>` or `/reload confirm` |
| **Config** | Open plugin config file in File Manager's built-in editor |
| **Compatibility** | Check plugin's `plugin.yml` `api-version` against server version |
| **Dependencies** | Parse `depend` + `softdepend` from `plugin.yml`. Show tree. Warn on missing. |
| **Conflicts** | Flag plugins with same main class or identical functionality |

### UI
- Split panel: left = installed plugins (list), right = details
- Installed plugin card: icon, name, version, source badge, enable/disable toggle, author, description
- Version pill: green if up-to-date, yellow if update available, red if incompatible
- Dependency tree: expandable accordion showing what depends on what
- Bulk actions: multi-select with Shift+click, batch enable/disable/update/delete

### Backend
- Plugin metadata cached from `plugin.yml` inside each `.jar`
- `GET /api/plugins` → scan `plugins/` dir + DB
- `GET /api/plugins/:name/config` → read plugin config file
- `PUT /api/plugins/:name/config` → write plugin config file
- `POST /api/plugins/check-updates` → batch check marketplace for newer versions

---

## 10. File Manager

### Purpose
Full file system access to the server directory without leaving the app.

### UI Layout
```
┌────────────────────────────────────────────────────────┐
│ Toolbar: [Upload▼] [New Folder] [Refresh] [Search...]  │
├──────────┬─────────────────────────────────────────────┤
│ Sidebar  │ Main Panel                                  │
│ (tree)   │ ┌─────┬──────────┬──────┬────────┬────────┐ │
│ /        │ │ ☐   │ Name     │ Size │ Type   │ Modified│ │
│ ├─ world │ │ ☑   │ world/   │ 2.3G │ folder │ 2h ago  │ │
│ ├─ plugins│ │ ☐   │ plugins/ │ 45M  │ folder │ 1d ago  │ │
│ │ ├─ ... │ │ ☐   │ server...│ 18M  │ .jar   │ 3d ago  │ │
│ ├─ logs  │ │ ☐   │ server...│ 2.4K │ .prop  │ 3d ago  │ │
│ └─ config│ │ ☐   │ ops.json  │ 112B │ .json  │ 3d ago  │ │
│          │ └─────┴──────────┴──────┴────────┴────────┘ │
├──────────┴─────────────────────────────────────────────┤
│ Status bar: 14 items | 2.4 GB used                     │
└────────────────────────────────────────────────────────┘
```

### Features
- **Breadcrumb navigation** above the file list
- **Selection**: checkbox per file, Shift-select range, Ctrl+click multi
- **Drag & drop** from OS → uploads files to current directory
- **Context menu** (right-click): Download, Rename, Delete, Move, Copy, ZIP, Extract, Edit, Open in Explorer
- **Built-in editor**: Monaco (VS Code) for `.json`, `.yml`, `.yaml`, `.properties`, `.toml`, `.txt`, `.js`, `.ts`, `.py`, `.sh`, `.css`, `.html`, `.md`, `.xml`, `.log`
  - Syntax highlighting
  - Find & replace
  - Line numbers
  - Unsaved changes indicator
  - Ctrl+S saves to server

### Security
- Cannot navigate above the server's root directory
- Hidden files (`.`) visible with toggle
- Write operations logged to audit log

### Backend
- `GET /api/files?path=` → list directory
- `GET /api/files/content?path=` → read file (text, max 1MB)
- `PUT /api/files/content` → write file
- `POST /api/files/upload` → multipart upload
- `GET /api/files/download?path=` → file download
- `POST /api/files/move` → rename/move
- `DELETE /api/files?path=` → delete
- `POST /api/files/zip` → create archive
- `POST /api/files/extract` → extract archive

---

## 11. Dashboard

### Purpose
At-a-glance health and performance monitoring for the active server.

### Layout (top to bottom)

#### Row 1 — Hero Stats (4 large cards)
| CPU | RAM | TPS | Players |
|-----|-----|-----|---------|
| 23% | 2.1/4 GB | 19.98 | 3/20 |
| [sparkline 30min] | [sparkline 30min] | [sparkline 30min] | [sparkline 30min] |

Each card: big number, unit, micro chart (SVG path). Color-coded thresholds.

#### Row 2 — Connection Bar
```
┌─────────────────────────────────────────────────────────┐
│ 🌐 localhost:25565  │  📡 192.168.1.5:25565  │  ...     │
│ [Copy]               │  [Copy]               │  [Copy]  │
└─────────────────────────────────────────────────────────┘
```

#### Row 3 — Charts
| CPU + RAM (Area chart) | TPS + Players (Line chart) |
|------------------------|----------------------------|
| 30-minute window | 30-minute window |
| Y-axis: %, GB | Y-axis: TPS (left), count (right) |

#### Row 4 — System Info
| Metric | Value |
|--------|-------|
| Java Heap | 1.2/4 GB |
| Entities | 342 |
| Chunks | 128 |
| MSPT | 18.4ms |
| Disk Usage | 12.4/240 GB |
| Uptime | 2d 14h 32m |
| Public IP | 203.0.113.5 |
| Server Version | Paper 1.21.1 (build #142) |

#### Row 5 — Activity Feed (scrollable)
```
[12:34] 🟢 Player "Alex" joined the game
[12:30] 📦 Auto-backup completed (142 MB)
[12:00] 🔄 Server restarted (scheduled)
[11:45] 🔴 Player "Notch" left the game
```

### Socket Events
- `stats:update` — every 2s: CPU, RAM, TPS, players, MSPT, entities, chunks
- `server:event` — player join/leave, backup, restart, crash

### Backend
- `GET /api/server/status` — combined response
- `GET /api/server/stats/history?minutes=30` — for charts
- Stats stored in `system_stats` table every 2s, pruned after 24h

---

## 12. Player Management

### Purpose
Full player lifecycle management with roles, permissions, and moderation tools.

### Player List (Table)
Columns: Avatar, Username, UUID (truncated), Role, Status (Online/Offline/Banned), Playtime, Last Login, Actions
- Sortable by any column
- Search by username/UUID
- Filter by status/role
- Bulk select with checkbox

### Player Detail (Slide-over Panel)
| Section | Content |
|---------|---------|
| Profile | Avatar, name, UUID, role dropdown, join date |
| Status | Online/offline, current IP, muted indicator, ban info |
| Stats | Playtime, last login, first join |
| Permissions | Inherited via role, individual overrides (future) |
| History | Login/logout events, kicks, bans, mutes, chat logs |
| Notes | Editable textarea (visible to operators only) |
| Inventory | Read-only view (via NBT parse, future) |
| Location | Current world + coordinates (via `/data get entity`) |

### Actions
| Action | API | Notes |
|--------|-----|-------|
| Kick | `POST /api/players/:id/kick` | Sends `/kick` command |
| Mute | `POST /api/players/:id/mute` | DB flag + chat filter |
| Temp Ban | `POST /api/players/:id/ban` | With duration + reason |
| Perm Ban | `POST /api/players/:id/ban` | No duration = permanent |
| Unban | `POST /api/players/:id/unban` | Removes from ban list |
| Whitelist Add | `POST /api/players/whitelist` | DB + `/whitelist add` |
| Whitelist Remove | `DELETE /api/players/whitelist/:name` | DB + `/whitelist remove` |
| Change Role | `PUT /api/players/:id` | Updates DB only (visual) |

### Ban Duration Presets
1 hour, 6 hours, 12 hours, 24 hours, 3 days, 7 days, 30 days, Permanent

### Backend
- `banned_players` table stores all active bans with expiry
- Expired bans auto-cleared on player list fetch
- Ban expiry checked via cron every minute

---

## 13. World Manager

### Purpose
Visual world management with create, clone, optimize, import/export, and preview capabilities.

### World List (Cards)
Each card: World name, size, seed, gamemode, difficulty, number of regions, last backup age, thumbnail preview (if map available), playtime on world.

### Actions
| Action | Implementation |
|--------|---------------|
| **Create** | Form: name, seed, gamemode, difficulty, world type |
| **Clone** | Full copy to new name |
| **Delete** | Remove world directory + DB record |
| **Import** | Upload `.zip` or `.mca` files → extract to `worlds/` |
| **Export** | Download as `.zip` |
| **Optimize** | Run paper's `minecraft:optimize` or run region-file optimizer |
| **Repair** | Scan for corrupted chunks, attempt repair |
| **Preview** | Open in embedded live map |
| **Backup** | Trigger immediate backup of this world only |

### Seed Management
- Store seed from `level.dat`
- Display seed on card
- "Regenerate with new seed" — deletes world files and regenerates

---

## 14. Live Map

### Purpose
Embedded world map with player tracking, claims display, and waypoints.

### Supported Map Plugins
| Plugin | Default Port | Detection |
|--------|-------------|-----------|
| BlueMap | 8100 | Check `plugins/BlueMap/` |
| Dynmap | 8123 | Check `plugins/dynmap/` |
| SquareMap | 8080 | Check `plugins/squaremap/` |
| Pl3xMap | 8080 | Check `plugins/Pl3xMap/` |

### Features
- Auto-detect installed map plugin and its config port
- Embedded iframe in full-height panel
- Player dots overlaid (requires WebSocket bridge or API)
- Claims boundaries (if GriefPrevention/WorldGuard + claims DB)
- Tagged builds from `build_tags` table as markers
- "Open in Browser" button

---

## 15. Scheduler

### Purpose
Cron-based task scheduler for automated server maintenance.

### Default Tasks
| Task | Default Schedule | Description |
|------|-----------------|-------------|
| Auto-restart | Daily at 04:00 | Graceful restart during low usage |
| Auto-backup | Every 6 hours | Full backup (worlds + config) |
| Broadcast | Every 2 hours | "Server will restart at 4 AM" |
| Plugin updates | Weekly (Sunday 03:00) | Check + update marketplace plugins |
| Version updates | Weekly (Sunday 03:30) | Check PaperMC for new builds |
| World optimize | Weekly (Sunday 04:00) | Run region-file optimization |

### Custom Tasks
| Type | Config |
|------|--------|
| Restart | Schedule, warning broadcast message |
| Backup | Schedule, name pattern, encryption toggle |
| Command | Schedule, command text |
| Broadcast | Schedule, message, repeat count |
| Plugin update | Schedule, specific plugins or all |
| World optimize | Schedule, target worlds |

### UI
- Table of scheduled tasks with toggle, next run, last run, last status
- "Add Task" button opens a form: type selection → type-specific fields → cron preview in plain English
- Task history: last 50 runs with output and status

### Backend
- `node-cron` for scheduling
- `scheduled_tasks` DB table
- Task execution logged to `audit_log`
- Failed tasks retry up to 3 times

---

## 16. Networking

### Purpose
Connection diagnostics and network configuration.

### Connection Types
| Type | Address | Requirements |
|------|---------|-------------|
| Local | `localhost:25565` | Nothing — same machine |
| LAN | `192.168.x.x:25565` | Same network |
| Internet | `public.ip:25565` | Port forwarding + firewall |
| Playit.gg | `xxx.playit.gg` | Playit.gg account + tunnel setup |
| Tunnel (custom) | Custom | Ngrok, Cloudflare Tunnel, etc. |

### Diagnostics
- **Port check**: does `netstat` show the port listening?
- **Firewall check**: is there a Windows firewall rule for Java?
- **Port forwarding**: external port scan via canyouseeme.org API?
- **CGNAT detection**: is public IP in `100.64.0.0/10` range?
- **DNS resolution**: does the tunnel address resolve?
- **Latency**: ping to localhost, LAN gateway, public IP

### Playit.gg Integration
- Step-by-step setup guide with screenshots
- One-click download of Playit.gg agent (Windows binary)
- Auto-launch Playit.gg alongside server
- Parse tunnel address from Playit.gg output

### HTTPS/SSL (Future)
- Built-in reverse proxy (Caddy/nginx)
- Let's Encrypt auto-cert
- Web dashboard accessible via `https://mc.example.com`

---

## 17. REST API

### Purpose
Fully documented REST API for external tools, scripts, and future headless mode.

### Base URL
`http://localhost:3001/api` (local) or `https://your-server.com/api` (remote)

### Authentication
Bearer token from `POST /api/auth/login`. Token expires in 24h.

### Endpoints

#### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/login` | Login, get token |
| POST | `/auth/logout` | Invalidate session |
| GET | `/auth/me` | Current user info |
| POST | `/auth/change-password` | Change password |

#### Servers
| Method | Path | Description |
|--------|------|-------------|
| GET | `/servers` | List all servers |
| GET | `/servers/:id` | Get server details |
| POST | `/servers` | Create server |
| PUT | `/servers/:id` | Update server config |
| DELETE | `/servers/:id` | Delete server |
| POST | `/servers/:id/select` | Set active server |
| POST | `/servers/:id/duplicate` | Duplicate server |
| POST | `/servers/:id/start` | Start server |
| POST | `/servers/:id/stop` | Stop server |
| POST | `/servers/:id/restart` | Restart server |

#### Server
| Method | Path | Description |
|--------|------|-------------|
| GET | `/server/status` | Current status + metrics |
| GET | `/server/stats/history` | Time-series stats |
| GET | `/server/config` | Server configuration |
| PUT | `/server/config` | Update configuration |
| GET | `/server/properties` | server.properties |
| PUT | `/server/properties` | Update properties |
| POST | `/server/command` | Send console command |
| GET | `/server/logs` | Console logs |
| POST | `/server/version` | Change version |
| GET | `/server/versions` | Available versions |

#### Players
| Method | Path | Description |
|--------|------|-------------|
| GET | `/players` | List players |
| GET | `/players/:id` | Player details |
| PUT | `/players/:id` | Update player (role, notes) |
| DELETE | `/players/:id` | Remove player |
| POST | `/players/:id/kick` | Kick player |
| POST | `/players/:id/ban` | Ban player |
| POST | `/players/:id/unban` | Unban player |
| POST | `/players/:id/mute` | Mute player |
| POST | `/players/:id/unmute` | Unmute player |
| GET | `/players/whitelist` | List whitelist |
| POST | `/players/whitelist` | Add to whitelist |
| DELETE | `/players/whitelist/:name` | Remove from whitelist |
| GET | `/players/banned` | List banned players |
| GET | `/players/chat` | Chat log |

#### Plugins
| Method | Path | Description |
|--------|------|-------------|
| GET | `/plugins` | List installed plugins |
| POST | `/plugins/install` | Install plugin |
| POST | `/plugins/:name/toggle` | Enable/disable |
| DELETE | `/plugins/:name` | Remove plugin |
| GET | `/plugins/:name/config` | Get plugin config |
| PUT | `/plugins/:name/config` | Update plugin config |

#### Worlds
| Method | Path | Description |
|--------|------|-------------|
| GET | `/worlds` | List worlds |
| POST | `/worlds` | Create world |
| DELETE | `/worlds/:name` | Delete world |
| POST | `/worlds/:name/clone` | Clone world |
| GET | `/worlds/:name/download` | Download world zip |
| POST | `/worlds/upload` | Upload world zip |

#### Backups
| Method | Path | Description |
|--------|------|-------------|
| GET | `/backups` | List backups |
| POST | `/backups/create` | Create backup |
| POST | `/backups/restore/:id` | Restore backup |
| DELETE | `/backups/:id` | Delete backup |

#### Files
| Method | Path | Description |
|--------|------|-------------|
| GET | `/files` | List directory |
| GET | `/files/content` | Read file |
| PUT | `/files/content` | Write file |
| POST | `/files/upload` | Upload file |
| GET | `/files/download` | Download file |
| POST | `/files/move` | Move/rename |
| DELETE | `/files` | Delete file |
| POST | `/files/zip` | Create archive |
| POST | `/files/extract` | Extract archive |

#### Marketplace
| Method | Path | Description |
|--------|------|-------------|
| GET | `/marketplace/search` | Search marketplace |
| GET | `/marketplace/item/:id` | Item details |
| POST | `/marketplace/install` | Install item |
| GET | `/marketplace/templates` | List templates |
| POST | `/marketplace/templates/:id/apply` | Apply template |

#### Scheduler
| Method | Path | Description |
|--------|------|-------------|
| GET | `/scheduler/tasks` | List scheduled tasks |
| POST | `/scheduler/tasks` | Create task |
| PUT | `/scheduler/tasks/:id` | Update task |
| DELETE | `/scheduler/tasks/:id` | Delete task |
| POST | `/scheduler/tasks/:id/toggle` | Enable/disable |

#### System
| Method | Path | Description |
|--------|------|-------------|
| GET | `/system/info` | System info (OS, RAM, disk, Java) |
| GET | `/system/health` | Health check |
| GET | `/system/logs` | Application logs |

---

## 18. WebSocket Architecture

### Namespace: `/ws`

### Server → Client Events
| Event | Payload | Description |
|-------|---------|-------------|
| `server:status` | `{ running, starting, uptime }` | Server lifecycle state |
| `server:started` | `{}` | Server finished loading |
| `server:stopped` | `{ code }` | Server exited |
| `server:output` | `{ line }` | Console output line |
| `server:error` | `{ message }` | Server error |
| `stats:update` | `{ cpu, ram, tps, msp, players, entities, chunks }` | Every 2s |
| `player:join` | `{ username, uuid }` | Player joined game |
| `player:leave` | `{ username, uuid }` | Player left game |
| `player:chat` | `{ username, message }` | Chat message |
| `update:progress` | `{ percent }` | Version download progress |
| `backup:start` | `{ backupId }` | Backup started |
| `backup:complete` | `{ backupId, size }` | Backup finished |
| `notification` | `{ type, title, message }` | In-app notification |

### Client → Server Events
| Event | Payload | Description |
|-------|---------|-------------|
| `subscribe:server` | `{ serverId }` | Subscribe to specific server events |
| `unsubscribe:server` | `{ serverId }` | Unsubscribe |

### Connection
- Reconnect automatically with exponential backoff (1s, 2s, 4s, 8s, 15s max)
- Auth via query param: `ws://localhost:3001/ws?token=xxx`
- Heartbeat every 15s, timeout after 30s

---

## 19. Database Design

### Entity-Relationship Diagram (Text)

```
users ──┐
         ├── sessions
         │
         ├── audit_log
         │
         ├── github_issues
         
servers ──┬── server_config (key-value extras)
          ├── worlds
          ├── plugins
          ├── system_stats
          ├── chat_log
          ├── players ──┬── banned_players
          │              ├── whitelist
          │              └── player_history (future)
          ├── backups
          ├── claims
          ├── build_tags
          └── scheduled_tasks
          
roles (standalone, referenced by players)
```

### Tables (existing + new for v1.0.17)

#### Existing (keep as-is)
`users`, `players`, `roles`, `whitelist`, `banned_players`, `server_config`, `backups`, `worlds`, `plugins`, `system_stats`, `sessions`, `chat_log`, `audit_log`, `claims`, `build_tags`, `github_issues`, `servers`

#### New Tables

**scheduled_tasks**
```sql
CREATE TABLE scheduled_tasks (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,  -- 'restart', 'backup', 'command', 'broadcast', 'plugin_update', 'version_update', 'world_optimize'
  cron_expression TEXT NOT NULL,
  config TEXT NOT NULL DEFAULT '{}',  -- JSON: { message, command, target_plugins, target_worlds, ... }
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  last_status TEXT,  -- 'success', 'failed', 'running'
  last_output TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
);
```

**marketplace_cache**
```sql
CREATE TABLE marketplace_cache (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,  -- 'hangar', 'modrinth', 'spigot', 'curseforge'
  item_type TEXT NOT NULL,  -- 'plugin', 'mod', 'modpack', 'world', 'datapack', 'resourcepack', 'shader'
  item_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  author TEXT,
  version TEXT,
  game_versions TEXT NOT NULL DEFAULT '[]',  -- JSON array
  download_url TEXT,
  icon_url TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',  -- JSON
  cached_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source, item_id)
);
```

**activity_log** (high-volume, pruned after 7 days)
```sql
CREATE TABLE activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id TEXT NOT NULL,
  event_type TEXT NOT NULL,  -- 'player_join', 'player_leave', 'backup', 'restart', 'crash', 'version_change', 'plugin_install', 'command'
  payload TEXT NOT NULL DEFAULT '{}',  -- JSON
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
);
CREATE INDEX idx_activity_server_time ON activity_log(server_id, created_at DESC);
```

### Migration Strategy
- Version-tracked migration files in `server/migrations/`
- `schema_version` table tracks applied migrations
- Migrations run on app startup
- Rollback supported via `DOWN` migration

---

## 20. Electron Architecture

### Process Model
```
┌─────────────────────────────────────────────────┐
│              Main Process (main.ts)              │
│  • Window management                            │
│  • Auto-updater                                 │
│  • System tray                                  │
│  • Native menus                                 │
│  • IPC handlers                                 │
│  • Spawn backend server                         │
└────────────────────┬────────────────────────────┘
                     │ IPC (contextBridge)
                     ▼
┌─────────────────────────────────────────────────┐
│           Renderer Process (React)               │
│  • All UI components                             │
│  • React Router                                  │
│  • State management                              │
│  • Socket.IO client                              │
└─────────────────────────────────────────────────┘
                     ▲
                     │ HTTP + WS
                     ▼
┌─────────────────────────────────────────────────┐
│          Backend Server (Express)                │
│  • API routes                                   │
│  • Minecraft process management                 │
│  • File system operations                       │
│  • SQLite database                              │
│  • WebSocket server                             │
└─────────────────────────────────────────────────┘
```

### IPC Channels (electronAPI on window)
```typescript
interface ElectronAPI {
  // File system
  selectDirectory: () => Promise<string | null>;
  selectFile: (filters?: FileFilter[]) => Promise<string | null>;
  
  // Paths
  getAppPath: () => Promise<string>;
  getDataPath: () => Promise<string>;
  
  // Auto-updater
  checkForUpdates: () => void;
  downloadUpdate: () => void;
  installUpdate: () => void;
  
  // Events
  onUpdateChecking: (cb: () => void) => void;
  onUpdateAvailable: (cb: (version: string) => void) => void;
  onUpdateNotAvailable: (cb: () => void) => void;
  onUpdateProgress: (cb: (percent: number) => void) => void;
  onUpdateDownloaded: (cb: () => void) => void;
  onUpdateError: (cb: (message: string) => void) => void;
  onNavigate: (cb: (path: string) => void) => void;
  onServerAction: (cb: (action: string) => void) => void;
  
  // Cleanup
  removeAllListeners: (channel: string) => void;
}
```

### Auto-Updater
- Provider: GitHub releases
- Check on startup (5s delay) + Check for Updates in Help menu + Ctrl+U
- `autoUpdater.autoDownload = false` (user clicks Download)
- Download progress → IPC → renderer progress bar
- `quitAndInstall()` on user confirmation

### Security
- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- All Node.js access via preload.ts + contextBridge
- Content Security Policy header

### Packaging
- NSIS installer (Windows)
- DMG (macOS)
- AppImage + .deb (Linux)
- Code signing (Windows: signtool, macOS: notarize)

---

## 21. Security

### Authentication
- Bcrypt (10 rounds) for password hashing
- JWT with 24h expiry
- Session stored in `sessions` table with IP + user agent
- Rate limit login: 5 attempts per minute per IP

### Authorization
- Role-based: Owner (*), Admin (most), Moderator (some), Member (read-only), Guest (none)
- `requirePermission()` middleware checks role's `permissions` JSON array
- Owner role is immutable

### Input Validation
- All API inputs validated with express-validator or zod
- File paths sanitized to prevent directory traversal (`..` blocked)
- File upload size limits (configurable, default 100MB)

### File Security
- Sandboxed server directories — cannot access files outside server root
- `.env` files excluded from file manager view
- Backup encryption uses AES-256-CBC with PBKDF2

### Audit Logging
- All config changes logged: who, what, when, IP
- Console commands logged
- File operations logged
- Login/logout logged
- Audit log viewable by Admin+ users

### Network Security
- Backend binds to `127.0.0.1:3001` only (not exposed to network)
- CORS restricted to Electron renderer
- Helmet middleware enabled
- Rate limiting on all API routes (100 req/min default)

---

## 22. GitHub Integration

### Purpose
In-app bug reporting and feature requests, stored locally with optional GitHub sync.

### Bug Report Form
| Field | Type | Required |
|-------|------|----------|
| Title | Text | Yes |
| Description | Textarea | Yes |
| Server Logs | Auto-attach from recent logs | No |
| System Info | Auto-attach (OS, Java, RAM, app version) | No |
| Images | File upload (up to 25MB each, 5 max) | No |
| Videos | File upload (up to 100MB each, 2 max) | No |

### Feature Request Form
| Field | Type | Required |
|-------|------|----------|
| Title | Text | Yes |
| Description | Textarea | Yes |

### Status Tracking
| Status | Meaning |
|--------|---------|
| Open | Submitted, not yet reviewed |
| Under Review | Developer is looking at it |
| Accepted | Planned for implementation |
| In Progress | Being worked on |
| Completed | Implemented and released |
| Delayed | Postponed to later version |
| Closed | Won't implement / duplicate |

### Future GitHub Sync
- `POST /api/github/sync` → create GitHub issue via API
- Receive status updates from GitHub webhook
- Link local issue to GitHub issue URL

---

## 23. Auto Update

### Flow
1. App starts → main process waits 5s → `autoUpdater.checkForUpdates()`
2. GitHub release `latest.yml` fetched → version compared
3. If newer → renderer shows "Update vX.Y.Z available" banner
4. User clicks Download → `.exe` downloaded in background with progress
5. Download complete → "Restart & Update" button appears
6. User clicks → `autoUpdater.quitAndInstall()`

### User-Initiated
- Help → Check for Updates
- Ctrl+U

### Rollback
- Previous installer kept in `%LOCALAPPDATA%/MineControl OS/previous/`
- If new version fails, auto-restore previous version (detect via crash count)
- Manual: Settings → About → "Rollback to vX.Y.Z"

### Release Notes
- Fetch release body from GitHub API
- Display in update dialog
- Markdown rendered to HTML

---

## 24. Notifications

### Types
| Type | Icon | Color | Example |
|------|------|-------|---------|
| Info | ℹ️ | Blue | "Backup completed" |
| Success | ✅ | Green | "Server started" |
| Warning | ⚠️ | Yellow | "Update available" |
| Error | ❌ | Red | "Server crashed" |
| Player Join | 🟢 | Green | "Alex joined" |
| Player Leave | 🔴 | Red | "Alex left" |

### Delivery
| Channel | When | User Action |
|---------|------|-------------|
| Toast (top-right) | Immediate, auto-dismiss 5s | Click to dismiss |
| Notification center (bell) | Persistent until read | Click to read |
| Desktop notification | App minimized | Click to focus app |
| Sound | Important events (crash, backup done) | Toggle in settings |

### Notification Center
- Bell icon in top bar with unread count badge
- Dropdown shows last 50 notifications
- Filter by category
- "Mark all read" button
- "Clear all" button
- Each notification: icon, title, message (2-line clamp), time ago, unread dot

### Backend
- `notifications` DB table
- `GET /api/notifications` → fetch
- `POST /api/notifications/:id/read` → mark read
- `POST /api/notifications/read-all` → mark all read
- `DELETE /api/notifications/:id` → delete single
- `DELETE /api/notifications` → clear all

---

## 25. AI Assistant (Future)

### Vision
An intelligent assistant that proactively monitors server health and provides recommendations.

### Planned Capabilities
| Capability | Logic |
|------------|-------|
| **Lag detection** | If TPS < 18 for > 30s → "High TPS detected. Consider reducing view-distance or entity count." |
| **RAM recommendation** | If max RAM > system RAM/2 → "You're allocating more than half your system RAM. This may cause OS swapping." |
| **Plugin conflict detection** | If two plugins register same listener → flag conflict |
| **Update recommendations** | If plugin is 2+ versions behind → "Plugin XYZ has 3 updates available." |
| **Crash analysis** | Parse crash-reports folder → "Server crashed due to java.lang.OutOfMemoryError. Consider increasing max RAM." |
| **Health report** | Weekly summary: uptime, crashes, player count, backup status, update status |
| **Security scan** | Check for known vulnerable plugin versions (via database) |

### UI
- Chat-like assistant panel (toggle from sidebar)
- Notification-style cards for urgent recommendations
- Weekly report delivered as notification

---

## 26. Folder Structure

```
MineControl-OS/
├── package.json
├── electron-builder.yml
├── tsconfig.json
├── tsconfig.server.json
├── tsconfig.electron.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
│
├── electron/
│   ├── main.ts              # Main process
│   ├── preload.ts            # Context bridge
│   └── tsconfig.json
│
├── server/
│   ├── index.ts              # Express entry
│   ├── database.ts           # SQLite setup + schema
│   ├── paths.ts              # Path resolution
│   ├── routes/
│   │   ├── auth.ts
│   │   ├── server.ts         # Status, config, version, commands
│   │   ├── servers.ts        # Multi-server CRUD
│   │   ├── players.ts
│   │   ├── plugins.ts
│   │   ├── worlds.ts
│   │   ├── backup.ts
│   │   ├── files.ts          # File manager
│   │   ├── marketplace.ts    # Plugin/marketplace search
│   │   ├── scheduler.ts
│   │   ├── claims.ts
│   │   ├── builds.ts
│   │   ├── github.ts
│   │   └── system.ts         # System info, health
│   ├── services/
│   │   ├── minecraftServer.ts # Java process manager
│   │   ├── backup.ts         # Backup/restore service
│   │   ├── scheduler.ts      # Cron task runner
│   │   ├── marketplace.ts    # Marketplace API client
│   │   ├── versionManager.ts # Software version fetchers
│   │   └── ai.ts             # AI assistant (future)
│   ├── middleware/
│   │   └── auth.ts           # JWT + permissions + audit + rate limit
│   └── migrations/           # SQL migration files
│       ├── 001_initial.sql
│       └── 002_scheduler.sql
│
├── src/
│   ├── main.tsx              # React entry
│   ├── App.tsx               # Router setup
│   ├── index.css             # Tailwind imports
│   ├── lib/
│   │   ├── api.ts            # HTTP client
│   │   ├── socket.ts         # WebSocket client
│   │   └── utils.ts          # Formatting helpers
│   ├── hooks/
│   │   ├── useAuth.tsx
│   │   ├── useSocket.ts
│   │   ├── useNotifications.ts
│   │   └── useServerStatus.ts
│   ├── components/
│   │   ├── Layout.tsx        # Sidebar + top bar
│   │   ├── UpdateBanner.tsx
│   │   ├── NotificationPanel.tsx
│   │   ├── Sidebar.tsx       # Extracted sidebar
│   │   ├── ServerStatusDot.tsx
│   │   ├── StatCard.tsx
│   │   ├── Sparkline.tsx
│   │   ├── DataTable.tsx
│   │   ├── FileTree.tsx
│   │   ├── MonacoEditor.tsx  # File editor
│   │   ├── ConfirmDialog.tsx
│   │   ├── SearchInput.tsx
│   │   └── ModelViewer/      # 3D Steve viewer
│   ├── pages/
│   │   ├── Login.tsx
│   │   ├── Welcome.tsx
│   │   ├── ServerLibrary.tsx # Home (was Servers)
│   │   ├── Wizard.tsx
│   │   ├── Dashboard.tsx
│   │   ├── Console.tsx
│   │   ├── Players.tsx
│   │   ├── Plugins.tsx
│   │   ├── Worlds.tsx
│   │   ├── Backups.tsx
│   │   ├── FileManager.tsx   # New
│   │   ├── Connection.tsx
│   │   ├── MapView.tsx
│   │   ├── Diagnostics.tsx
│   │   ├── Scheduler.tsx     # New
│   │   ├── Settings.tsx
│   │   ├── Guide.tsx
│   │   └── GitHub.tsx
│   └── types/
│       └── index.ts          # Shared TypeScript types
│
├── scripts/
│   └── build.js              # Build helpers
│
├── docs/
│   ├── API.md                # REST API documentation
│   └── DEVELOPMENT.md        # Developer setup guide
│
└── tests/
    ├── unit/
    ├── integration/
    └── e2e/
```

---

## 27. Development Roadmap

### v1.0.17 (Current — ~4 weeks)
- **File Manager** — Full directory tree, upload/download, context menu, Monaco editor
- **Scheduler** — Cron-based task creation and management
- **Marketplace (v1)** — Plugin search from Hangar + Modrinth, one-click install
- **Multi-server duplication** — Duplicate server with all config
- **Dashboard charts** — Real-time charts with Recharts
- **Server Library redesign** — Card grid, inline actions, drag reorder
- **Activity feed** — Real-time server events
- **Notifications overhaul** — Categories, filters, desktop notifications
- **Scheduled auto-backup** — Cron-based backup scheduling
- **Plugin update checks** — Batch check marketplace for newer versions

### v1.1 (~4 weeks)
- **Marketplace (v2)** — Mods, modpacks, worlds, datapacks, resource packs
- **Server templates** — One-click apply pre-built configurations
- **World optimize** — Region file optimization
- **World preview** — Embedded map viewer in world cards
- **Player detail slide-over** — Full player profile, stats, history, notes
- **Bulk player actions** — Multi-select kick/ban/mute
- **Scheduled plugin updates** — Auto-update plugins on schedule
- **Plugin dependency resolution** — Visual dependency tree
- **Configuration profiles** — Save/load server config presets

### v1.2 (~6 weeks)
- **AI Assistant (beta)** — Lag detection, crash analysis, RAM recommendations
- **Export/Import server** — Full server export as portable package
- **Live map integration** — Auto-detect and embed Dynmap/BlueMap
- **SSL/HTTPS reverse proxy** — Built-in Caddy with auto Let's Encrypt
- **REST API documentation** — Auto-generated OpenAPI/Swagger docs
- **Plugin config editor** — Monaco-based YAML/JSON editor for plugin configs
- **Version rollback** — Keep previous server jar, one-click rollback
- **Startup optimization** — Lazy-load routes, code splitting, faster cold start

### v2.0 (Long-term)
- **Headless mode** — CLI-only mode for VPS/dedicated servers
- **Cloud dashboard** — Web-based remote management UI
- **Team management** — Multiple users with role-based access
- **Plugin/mod development toolkit** — Built-in IDE for developing plugins
- **Advanced permissions editor** — Visual permission node tree
- **Performance profiler** — Detailed MSPT breakdown by plugin
- **Backup to cloud** — S3/Google Drive/Dropbox backup targets
- **Mobile companion app** — Start/stop/monitor from phone

---

## 28. Acceptance Criteria

### File Manager
- [ ] Can navigate directory tree
- [ ] Can upload files via drag-and-drop and button
- [ ] Can download individual files and zipped folders
- [ ] Can rename, delete, move files and folders
- [ ] Can create new folders
- [ ] Can edit text files with syntax highlighting
- [ ] Search filters file list in real-time
- [ ] Cannot navigate above server root

### Scheduler
- [ ] Can create tasks with cron expression
- [ ] Human-readable next run time displayed
- [ ] Tasks run at scheduled time
- [ ] Failure logged and retried up to 3 times
- [ ] Can enable/disable tasks
- [ ] Can delete tasks
- [ ] Last run status visible in UI

### Marketplace
- [ ] Can search across Hangar and Modrinth
- [ ] Results filtered by game version and software
- [ ] One-click install downloads and registers plugin
- [ ] Progress shown during download
- [ ] Installed plugins appear in plugin manager
- [ ] Source attribution shown (name, author, link)

### Dashboard
- [ ] CPU, RAM, TPS, Players update every 2s
- [ ] Charts show 30-minute rolling window
- [ ] Activity feed shows last 50 events
- [ ] Connection info copyable with one click
- [ ] Status dot matches server state

### Performance
- [ ] Application cold start < 3s
- [ ] Server start < 5s (after jar downloaded)
- [ ] UI stays responsive at 60fps during server operation
- [ ] Memory: app < 200MB idle, < 500MB with dashboard+map
- [ ] API response < 100ms for cached data, < 500ms for dynamic

---

## 29. Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| App cold start (Electron) | < 3 seconds | From double-click to window visible |
| App warm start | < 1.5 seconds | From tray to window |
| Server start (jar already downloaded) | < 5 seconds | Click Start → "Done!" appears |
| Server jar download (100MB) | < 30 seconds | On 100Mbps connection |
| Dashboard chart render | < 200ms | From WebSocket event to chart update |
| File list (1000 files) | < 500ms | From click to rendered table |
| File editor open (100KB file) | < 300ms | From double-click to Monaco loaded |
| Marketplace search | < 1.5 seconds | From search keypress to results |
| Backup (1GB world) | < 30 seconds | From click to zip complete |
| WebSocket reconnect | < 1 second | Detection + reconnect |
| Log scroll (10,000 lines) | 60fps | No jank during scroll |
| Notification badge update | < 50ms | From server event to badge increment |

---

## 30. Final Review

### Architecture Strengths
- **Single-process backend** simplifies deployment (no separate server needed)
- **SQLite** keeps setup zero-config while being fast enough for 10+ servers
- **Electron** provides native file system access, tray, and auto-updates
- **Plugin-based design** for marketplace sources makes adding new sources trivial
- **WebSocket-first** real-time architecture ensures low-latency updates

### Identified Gaps
1. **Testing** — No test framework currently configured. Vitest + Playwright recommended.
2. **State management** — Currently relies on React state + localStorage. Consider Zustand or Jotai for complex state.
3. **Error boundaries** — React error boundaries should wrap each page to prevent full app crash.
4. **Logging** — Winston or pino for structured server-side logging with log levels.
5. **Graceful shutdown** — App needs to stop Minecraft server before quitting (currently incomplete).
6. **Internationalization** — No i18n. Consider for v1.1.
7. **Keyboard shortcuts** — Minimal coverage. Should add global shortcuts for common actions.
8. **Theme persistence** — Dark/light mode preference not persisted.

### Technology Recommendations
| Area | Current | Recommended |
|------|---------|-------------|
| State management | React context | Zustand (lightweight, works outside React tree) |
| File editor | Custom | Monaco Editor (@monaco-editor/react) |
| Charts | Recharts | Same (good for React) |
| Form validation | Manual | Zod for schema validation |
| Testing | None | Vitest (unit) + Playwright (e2e) |
| Logging | console.log | Winston (server) |
| Bundle analysis | None | vite-bundle-analyzer |
| CSS | Tailwind | Same |
| Icons | Lucide | Same |
| HTTP client | fetch | Same (keep it simple) |

### Recommended Modern Practices
- **OpenAPI/Swagger** for API documentation (auto-generated from Zod schemas)
- **Turborepo** if the project grows beyond a single package
- **Docker** for build reproducibility and optional headless deployment
- **Sentry** for crash reporting in production
- **Semantic Release** for automated versioning and changelog generation

### Final Architecture Verdict
The current architecture is **sound and well-structured** for a desktop Minecraft server manager. The main investment areas for v1.0.17 should be:
1. File Manager (highest user value)
2. Scheduler (reduces maintenance burden)
3. Marketplace (replaces manual plugin hunting)
4. Dashboard polish (first impression matters)
5. Performance (sub-second interactions everywhere)

The existing Electron + Express + SQLite + React stack is the right choice for this product category. No framework migration is needed.
