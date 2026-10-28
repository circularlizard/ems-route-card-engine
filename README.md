# EMS Route Card & Local Terrain Engine (`ems-route-card-engine`)

A companion WordPress plugin for the Expedition Management System (EMS). It provides a zero-latency, offline-resilient GPX Route Card Builder, local Ordnance Survey (OS Terrain 50) binary elevation engine, and eDofE-compatible PDF export.

## Architecture & Requirements
See [`docs/RoutePlanner.md`](docs/RoutePlanner.md) for the full architectural specification, binary DEM format, geodesy calculations, and REST API contract.

## Key Capabilities
- **Local Binary Elevation Engine**: $O(1)$ random-access elevation lookups from headerless `int16_le` decimetre grids ($8\text{ MB}$ per $100\text{ km}$ OS Grid square).
- **Zero-Latency In-Browser Leg Editing**: Enrich track vertices once upon upload; split and merge legs, calculate bearings, and update Naismith timings instantaneously in the browser.
- **Mobile-First UX**: Responsive design transforming desktop 12-column route tables into touch-friendly accordion cards on smartphones.
- **Standalone Diagnostic Studio**: Runs and tests fully in isolation (`Tools → Route Card Engine`) with built-in DEM health checks, geodesy calculators, and route card sandboxes without requiring core EMS.
- **EMS Integration**: When core EMS is active, context (dates, rosters, supervisors) is pulled automatically, with multi-day journey stepper integration into the Participant Portal.

## Development Commands

```bash
# Install PHP dependencies
composer install

# Install JS dependencies
npm install

# Run unit tests
vendor/bin/phpunit
npm run test

# Run static analysis
vendor/bin/phpstan analyse --memory-limit=2G

# Build JS assets
npm run build

# Deploy to local WordPress environment
bash bin/deploy.sh

# Build release zip (bumps patch version)
bash bin/package.sh
```
