# Roadmap

> **Current version:** v1.0.57 — Proxy-Protocol Mismatch Detection & Import Fixes
>
> This roadmap outlines planned development priorities. Timelines are approximate and subject to change.

---

## Short-term (v1.1.x)

### Stability & Import System
- [ ] Fresh install testing on clean Windows VM
- [ ] Import system edge cases: corrupt ZIPs, partial imports, duplicate detection
- [ ] Auto-backup verification: integrity check after each backup
- [ ] Player data enrichment: offline-mode UUID cross-reference with Mojang API

### GitHub Integration
- [ ] Feedback → GitHub Issue auto-creation with diagnostics as issue body
- [ ] Sync status back from GitHub (open/closed comments)
- [ ] Auto-label feedback by type (bug/feature/performance/crash)
- [ ] GitHub discussions link in feedback UI

### Documentation
- [ ] API reference: all 25+ route modules documented
- [ ] Architecture deep-dive: active server, events, Socket.IO topology
- [ ] Developer setup guide with debugging tips
- [ ] Deployment guide for headless/server mode

---

## Medium-term (v1.2.x)

### Docker Support
- [ ] Dockerfile for headless server operation
- [ ] docker-compose with optional web UI
- [ ] Volume mapping for persistent data

### Plugin/Mod Ecosystem
- [ ] Plugin auto-update checker (compare installed vs latest version)
- [ ] Mod dependency resolver (detect missing deps on install)
- [ ] Plugin config editor from within the app
- [ ] Bulk plugin/mod install from marketplace search results

### Performance & Scaling
- [ ] Server benchmarking: TPS graphing over time
- [ ] Memory usage optimizer for the backend process
- [ ] Lazy-load world NBT data (don't parse all on dashboard load)
- [ ] Database WAL mode checkpoint tuning

### Backup Enhancements
- [ ] Incremental backups (only changed files)
- [ ] Cloud backup targets: S3, Google Drive, OneDrive
- [ ] Backup scheduler with calendar view
- [ ] Restore preview: show what will be restored before committing

---

## Long-term (v2.0)

### Multi-Server Dashboard
- [ ] Run multiple servers simultaneously via separate processes
- [ ] Central dashboard showing all server statuses
- [ ] Cross-server chat (BungeeCord/Velocity without manual setup)
- [ ] Resource pooling: allocate RAM/CPU per server

### Web UI Mode
- [ ] Headless backend with browser-based management
- [ ] Mobile-responsive layout for phone/tablet management
- [ ] Multi-user with role-based access from web
- [ ] HTTPS + built-in authentication for remote access

### Marketplace
- [ ] One-click server templates (Skyblock, Survival, Creative, Minigames)
- [ ] World downloads marketplace
- [ ] Plugin/mod bundles per template
- [ ] Community ratings and reviews

### Internationalization
- [ ] i18n framework integration
- [ ] Locale files: Spanish, French, German, Japanese, Chinese
- [ ] RTL layout support for Arabic/Hebrew
- [ ] Community-contributed translations

### Advanced Analytics
- [ ] Player playtime tracking with daily/weekly/monthly reports
- [ ] Server resource graphs (CPU, RAM, TPS, player count)
- [ ] Chat analytics: most active users, word clouds, sentiment
- [ ] Economic analytics (if using economy plugins)

---

## Completed Milestones

| Version | Highlights |
|---------|------------|
| **v1.0.57** | Proxy-protocol detection, PaperMC v3 API, Import system fixes (7 bugs), production build |
| **v1.0.56** | Playit.gg port alignment fix |
| **v1.0.55** | Official + TLauncher compatibility verification |
| **v1.0.54** | Connection System Overhaul, 12-step Validator, server.properties sync |
| **v1.0.52** | Active Server architecture, Plugins/Mods/Worlds/Backup systems, Feedback center |
| **v1.0.51** | Architecture audit & critical fixes |
| **v1.0.50** | Bug fixes & polish |
| **v1.0.49** | Architecture audit, integration & production readiness |
| **v1.0.48** | Complete system integration & stability |
| **v1.0.47** | Repository organization & universal Java launcher compatibility |
| **v1.0.40–46** | Backend communication, state machine, data persistence, multiplayer connection |

---

> **Note:** This roadmap reflects the maintainer's vision. Community input is welcome via [GitHub Discussions](https://github.com/Harsha240105/Mine-Control/discussions) or in-app feedback.

---

<p align="center">
  <sub>Built by Harshavardhan H S</sub>
</p>
