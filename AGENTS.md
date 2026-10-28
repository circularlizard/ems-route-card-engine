# Route Card Engine Agent Coding Context

Context and architecture guidelines for the `ems-route-card-engine` plugin.

---

## 1. Project Overview

A WordPress plugin (`ems-route-card-engine`) providing route planning, OS Terrain 50 elevation analysis, Naismith/Langmuir rule timing calculation, and PDF route card generation for DofE expeditions. Operates in two modes:
1. **Integrated Mode**: Loaded alongside `ems-plugin` (Expedition Management System), binding to EMS expeditions, teams, and participants.
2. **Standalone Mode**: Operates fully independently with its own admin studio, test bench, and custom tables (`wp_dofe_route_cards`).

---

## 2. Directory & Workspace Layout

Under `/Users/davidstrachan/Projects/EMS/`:
- `wordpress-env/` — Shared local WordPress Docker environment (`docker-compose.yml`, `wordpress/` core files, database volume, uploads).
- `ems-route-card-engine/` — This plugin.
- `expedition-management-system/` — Core EMS plugin (`ems-plugin`).
- `login-with-google/` — OAuth plugin (`oauth-login`).

DEM elevation data lives in `wordpress-env/wordpress/wp-content/dofe-dem-data/`.

---

## 3. Build & Deploy

| Script | Purpose |
|---|---|
| `bash bin/deploy.sh` | Build JS, install prod deps, sync to `../wordpress-env/wordpress/wp-content/plugins/ems-route-card-engine/`, activate via WP-CLI |
| `bash bin/package.sh` | Build JS, package plugin zip to `dist/` |

---

## 4. Running Tests

```bash
# PHPUnit
vendor/bin/phpunit

# Vitest
npm run test

# PHPStan
vendor/bin/phpstan analyse
```

---

## 5. Architectural Principles

- **Zero-WP Pure PHP Core**: Elevation lookups, DEM reading, and Naismith calculation logic are decoupled from WordPress APIs to allow 100% fast, dependency-free unit testing.
- **Provider Pattern**: Host-application data bindings (teams, expeditions) are injected via adapters; defaults to standalone provider if EMS is inactive.
- **Elevation Binary Tiles**: OS Terrain 50 data is pre-compiled into lightweight 10km raw binary grid files (`.bin`, 80KB each) and cached in memory per tile.
