# Requirements & Architecture Specification: DofE Route Card & Terrain Engine

**Project:** DofE Route Card Builder & Local Terrain Engine (`ems-route-card-engine`)  
**Companion To:** Expedition Management System (`expedition-management-system`)  
**Target Platform:** WordPress (PHP 8.1+, REST API, Modern Vanilla JS / Reactive UI)  
**Primary Goal:** Replace the disjointed OS Maps $\rightarrow$ eDofE route card workflow with an intuitive, mobile-friendly, zero-latency, offline-resilient GPX Route Card Builder integrated directly into the Expedition Management System (EMS) Participant Portal and Leader Validation dashboard.

---

## 1. Executive Summary & System Boundaries

Explorers preparing for a DofE expedition must plot routes in a mapping tool (typically OS Maps), export `.gpx` files, and produce formal Route Cards calculating leg distances, height climbed, and Naismith timings alongside navigation descriptions, magnetic bearings, and escape routes. eDofE’s native route card tool is notoriously difficult to use, particularly on mobile phones where young people predominantly access the system.

To keep the core **Expedition Management System (`expedition-management-system`)** lightweight, fast to back up, and easy to maintain in Git, this solution is architected as a **decoupled companion plugin (`ems-route-card-engine`)**:

1. **The Route Card & Terrain Engine (`ems-route-card-engine`):** Owns the static OS Terrain 50 binary elevation dataset, WGS84-to-OSGB36 coordinate mathematics, raw map conversion tooling, GPX parsing & densification, Naismith calculation logic, mobile-first Route Card Builder UI, standalone testing harness, and PDF generation.
2. **The Core EMS (`expedition-management-system`):** Owns Expedition setup, Teams/Groups, Participant Portal authentication, Team Member rosters, and Leader notifications/approvals.
3. **Decoupled Operation:** The companion plugin can run and be fully tested **with or without core EMS installed**. When EMS is present, context and rosters are pulled via WordPress filters; when absent, the engine falls back gracefully to a standalone testing and administration studio.

---

## 2. Functional Requirements

### 2.1. Participant Portal Experience (Explorers)

* **FR-P1: Pre-Populated Expedition Context:** When an Explorer opens the Route Card Builder inside the Participant Portal for their assigned expedition, the system automatically populates:
  * Expedition Name, Level (Bronze / Silver / Gold), and Mode of Travel (Walking).
  * Team Name, Team Members' Names, and Group Emergency Contact details.
  * Number of Expedition Days and actual Calendar Dates for each day.
  * Supervisor / Assessor Name and Contact Details.

* **FR-P2: Multi-Day Journey Stepper:**
  * Automatically calculates total expedition duration based on the expedition level and calendar dates (e.g. Bronze = 2 days, Silver = 3 days, Gold = 4 days, or $\text{DateDiff} + 1$).
  * Displays a responsive multi-day stepper tab bar: `[ Day 1: Sat 15 May ]`, `[ Day 2: Sun 16 May ]`, `[ Summary & Submit ]`.
  * Each day operates as its own sub-card, tracking independent status (`Not Started`, `Draft`, `Valid`).

* **FR-P3: Multi-Day GPX Upload & Storage:**
  * Explorers upload or replace one `.gpx` file per expedition day.
  * Raw GPX files are safely archived to `wp-content/uploads/ems-routes/{expedition_id}/{team_id}/day-{day}.gpx`.

* **FR-P4: Permissive GPX Parsing & Smart Leg Detection:**
  * Supports `<trk><trkseg><trkpt>` (standard OS Maps export) and `<rte><rtept>` fallbacks.
  * Automatically extracts named `<wpt>` tags as initial **Active Checkpoints (Leg Boundaries)**.
  * Retains un-named `<wpt>` tags (OS Maps intermediate shaping points) as **Suggested Split Points** so users can promote them to full legs with a single click.

* **FR-P5: Automatic OS Grid Reference Calculation:**
  * Calculates exact 6-figure (`NT 249 398`) and 8-figure (`NT 2491 3984`) OS National Grid references mathematically from WGS84 `lat`/`lon`.
  * Ignores manually typed grid references inside `<wpt><name>` to eliminate human transcription typos, while preserving descriptive text from `<wpt><desc>` to pre-fill the Checkpoint Description.

* **FR-P6: Interactive Leg Splitting & Merging (Zero Server Latency):**
  * Explorers can split a long leg or merge two short legs directly in the browser UI without re-exporting from OS Maps.
  * Distance, cumulative ascent, magnetic/grid bearing, Naismith leg time, and ETAs recalculate instantaneously in the browser from the pre-enriched track array.

* **FR-P7: Tunnel / Bridge / Flat Override:**
  * Allows Explorers to toggle a "Tunnel / Viaduct (Flat)" override on any leg (e.g., Neidpath Tunnel) so surface DEM hills above tunnels do not add phantom climbing time.

* **FR-P8: Automated DofE Coaching Warnings ("Pre-Flight Checks"):**
  * Displays helpful, non-blocking coaching banners before submission if any single leg exceeds $3.0\text{ km}$ or $60\text{ minutes}$ walking time without a checkpoint, missing bearings, navigation descriptions, or escape routes.

* **FR-P9: Collaborative Team Editing with Concurrency Protection:**
  * Any member of the assigned Expedition Team can view, edit, and save drafts of their team's route cards.
  * Employs optimistic locking (`updated_at` timestamp check) to warn participants if a teammate saved changes concurrently.

* **FR-P10: Mobile-First Responsive Editing & Offline Resiliency:**
  * **Adaptive Layout:** Displays a 12-column table on desktop ($> 1024\text{ px}$); automatically transforms into **Vertical Accordion Leg Cards** on mobile ($< 768\text{ px}$).
  * **Mobile Drawer:** Map and elevation profiles tuck into a swipeable bottom sheet / drawer to preserve vertical screen space for text input.
  * **Local Draft Buffering:** Form edits auto-save to browser `localStorage` to survive app-switching, incoming calls, or intermittent connectivity in rural areas.

* **FR-P11: Gated Submission:**
  * The final **"Submit Route Card for Leader Review"** button is only enabled when all required expedition days have routes uploaded and pass pre-flight checks.

---

### 2.2. Expedition Leader & Assessor Experience

* **FR-L1: Route Card Validation Queue:** Leaders see an overview matrix of all teams in an expedition and the status of each day's route card (`Not Started`, `Draft`, `Submitted for Review`, `Changes Requested`, `Approved`).
* **FR-L2: Per-Leg & Per-Day Review Comments:** Leaders can inspect the interactive map and elevation profile alongside the route card, flag specific legs with feedback, and click **Request Changes** or **Approve**.
* **FR-L3: Version Locking & Dual-Mode PDF Generation:**
  * **Draft / In-Review:** PDFs are generated and streamed **on-demand** for review.
  * **Approved:** When marked `Approved`, the route card is locked against participant edits. A canonical, print-ready landscape PDF matching the official DofE layout is compiled once, stored permanently, and linked to `ems_route_card_file_id`.

---

## 3. System Architecture & Data Pipeline

### 3.1. High-Level Component Diagram

```
+-------------------------------------------------------------------------+
|                   EXPEDITION MANAGEMENT SYSTEM (EMS)                    |
|  - Expeditions & Dates     - Teams & Participant Rosters                |
|  - Participant Portal UI   - Leader Dashboard & Email Notifications     |
+-----------------------------------+-------------------------------------+
                                    |
                     WordPress Actions / Filters & REST API
                                    |
+-----------------------------------v-------------------------------------+
|                 ROUTE CARD & TERRAIN ENGINE PLUGIN                      |
|                                                                         |
|  +-------------------------+   +-------------------------------------+  |
|  | GPX & Geodesy Service   |   | Local OS Terrain 50 Binary Reader   |  |
|  | - XML Track Extractor   |   | - O(1) fseek() + fread(2)           |  |
|  | - Helmert WGS84->OSGB36 |   | - Cell-level RAM Memoization        |  |
|  | - 25m Segment Densifier |   | - Bilinear Interpolation            |  |
|  +------------+------------+   +------------------+------------------+  |
|               |                                   |                     |
|               +-----------------+-----------------+                     |
|                                 |                                       |
|                                 v                                       |
|  +-------------------------------------------------------------------+  |
|  | Responsive Route Card Studio (Desktop Table / Mobile Accordion)  |  |
|  | - Enriched Track Array (Every vertex has OS Grid Ref, Dist, Ele)  |  |
|  | - Zero-Latency JS Leg Splitter & Naismith Calculator              |  |
|  | - Pre-Flight Coaching Checks & Multi-Day Stepper                  |  |
|  +------------------------------+------------------------------------+  |
|                                 |                                       |
|               +-----------------+-----------------+                     |
|               |                                   |                     |
|               v                                   v                     |
|  +-------------------------+   +-------------------------------------+  |
|  | Database Route Storage  |   | PDF Generation Engine (Dompdf)      |  |
|  | wp_dofe_route_cards     |   | - On-Demand Streaming (Drafts)      |  |
|  | (Enriched JSON Payload) |   | - Persistent Artifact (Approved)    |  |
|  +-------------------------+   +-------------------------------------+  |
+-------------------------------------------------------------------------+
       |                                           |
       v                                           v
Filesystem Storage (wp-content/)        Filesystem Storage (wp-content/)
uploads/ems-routes/{exp_id}/{team_id}/   dofe-dem-data/ (Static Binary DEM)
├── day-1.gpx                            ├── NT.bin (7.63 MB)
└── day-1-approved.pdf                   └── NN.bin (7.63 MB)
```

---

### 3.2. Local Binary DEM Specification (`OS Terrain 50`)

* **Storage Path:** Configured via `DOFE_DEM_DATA_DIR` constant (defaults to `wp-content/dofe-dem-data/`), kept outside the plugin folder to survive plugin updates.
* **File Format:** One headerless binary file per 100km OS Grid Square (`NT.bin`, `NN.bin`, etc.).
* **Dimensions:** $2000 \times 2000$ grid points ($50\text{ m}$ spacing), Row-Major from South-West `(0,0)` to North-East `(1999,1999)`.
* **Encoding:** Signed 16-bit integer, Little-Endian (`int16_le`), storing elevation in **decimetres** ($\text{metres} \times 10$).
* **Exact File Size:** $8,000,000\text{ bytes}$ ($7.63\text{ MiB}$) per square.
* **Lookup Formula:**

$$\text{col} = \lfloor E \div 50 \rfloor, \quad \text{row} = \lfloor N \div 50 \rfloor$$

$$\text{Byte Offset} = (\text{row} \times 2000 + \text{col}) \times 2$$

Elevation lookup uses PHP `fseek( $handle, $offset, SEEK_SET )` followed by `fread( $handle, 2 )` and signed unpack `unpack('s', $bytes)[1] / 10.0`.

---

### 3.3. Raw Map Data to Binary DEM Conversion Utility

Ordnance Survey publishes OS Terrain 50 as free OpenData in ASCII Grid format (`.asc`). Each $100\text{ km}$ square consists of 100 individual $10\text{ km} \times 10\text{ km}$ tile files (`NT00.asc` through `NT99.asc`, $200 \times 200$ points each).

The companion plugin includes a standalone CLI converter (`bin/build-terrain-tile.php` or `tools/convert_terrain50.py`):

```bash
php bin/build-terrain-tile.php --input=/path/to/raw/NT/ --square=NT --output=wp-content/dofe-dem-data/NT.bin
```

#### Processing Pipeline:
1. **Matrix Allocation:** Allocates a $2000 \times 2000$ buffer initialized to `0`.
2. **ASCII Grid Ingestion:** Iterates through each `.asc` tile, extracts elevation lines, multiplies metres by 10 to obtain decimetres, and clamps to signed 16-bit integers ($-32,768$ to $+32,767$).
3. **Square Mapping:** Places each $200 \times 200$ tile into its correct quadrant within the $2000 \times 2000$ square based on its two-digit tile coordinate (`00` $\to$ SW, `99` $\to$ NE).
4. **Binary Packing:** Writes row-major binary directly to disk (`8,000,000 bytes`).
5. **Coverage:** Compiling just 4 tiles (`NT.bin`, `NN.bin`, `NS.bin`, `NY.bin` $\approx 30.5\text{ MB}$ total) covers all standard DofE expedition areas across the Scottish Borders, Central Belt, and Southern Highlands.

---

### 3.4. Storage & Persistence Architecture

1. **GPX Archive:** `wp-content/uploads/ems-routes/{expedition_id}/{team_id}/day-{day}.gpx`. Kept as the source of truth for audits or track re-generation.
2. **Database Record (`wp_dofe_route_cards`):** Stores enriched vertex streams and leg metadata as JSON. Once enriched, the UI renders and splits legs from this record; the DEM binary files are **not** re-queried on subsequent edits.
3. **PDF Artifacts:**
   * **During draft / review:** Streamed on-demand via Dompdf with `Cache-Control: private, no-store`.
   * **Upon leader approval:** Generated once, saved to `wp-content/uploads/ems-routes/{expedition_id}/{team_id}/route-card-day-{day}-approved.pdf`, and attached to the route card row and team CPT meta.

---

## 4. Standalone Operation & Testing Architecture (EMS-Independent)

To allow the Route Card Engine to be developed, benchmarked, and tested in isolation without `expedition-management-system`, the plugin implements a **Provider Pattern**:

```
+--------------------------------------------------------------+
|             Context Resolution Inside Route Plugin           |
+--------------------------------------------------------------+
                               │
               apply_filters('ems_get_route_card_context')
                               │
            ┌──────────────────┴──────────────────┐
     (EMS Active)                           (EMS Inactive)
            │                                     │
            ▼                                     ▼
 ┌──────────────────────┐             ┌─────────────────────────┐
 │ Pull context from    │             │ Standalone Provider:    │
 │ EMS CPTs, Rosters &  │             │ - Free-text Header Form │
 │ DB Tables            │             │ - Local Test Harness    │
 └──────────────────────┘             └─────────────────────────┘
```

### 4.1. The Standalone Provider
* If `apply_filters('ems_get_route_card_context', ...)` returns `null`, the plugin switches to **Standalone Mode**.
* Header fields (Expedition Name, Level, Dates, Supervisor, Team Members) become freely editable inputs on the page rather than locked read-only fields.

### 4.2. Built-in Admin Test Bench (`Tools → Route Card Engine`)
In standalone local WordPress environments, the plugin registers a dedicated diagnostic page:
1. **DEM Health Check:** Scans `DOFE_DEM_DATA_DIR`, verifies tile byte sizes ($8,000,000\text{ bytes}$), and tests elevation against known OS benchmarks (Arthur's Seat: $251\text{ m} \pm 2\text{ m}$; Ben Nevis: $1345\text{ m}$).
2. **Geodesy Calculator:** Paste any `lat, lon` or OS Grid Reference $\to$ outputs Easting/Northing, 6-figure and 8-figure grid references, and DEM elevation.
3. **Route Card Studio:** Drag-and-drop any GPX file to test full leg splitting, Naismith timings, pre-flight warnings, and PDF generation with zero EMS dependencies.

### 4.3. Self-Contained Database Schema
The companion plugin installs its own database table via `dbDelta()` on activation:

```sql
CREATE TABLE {$wpdb->prefix}dofe_route_cards (
    id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
    expedition_id BIGINT(20) UNSIGNED NOT NULL DEFAULT 0,
    team_id BIGINT(20) UNSIGNED NOT NULL DEFAULT 0,
    day_number INT(11) NOT NULL DEFAULT 1,
    route_title VARCHAR(255) NOT NULL DEFAULT '',
    header_data LONGTEXT NULL,
    route_data LONGTEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    approved_by BIGINT(20) UNSIGNED NULL,
    approved_at DATETIME NULL,
    pdf_file_path VARCHAR(255) NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    KEY exp_team_day (expedition_id, team_id, day_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 4.4. Standalone Permissions & REST API Auth
REST endpoints verify EMS capabilities if EMS is active (`ems_user_can_edit_route_card`), falling back to `current_user_can('edit_posts')` or `manage_options` in standalone mode.

### 4.5. Zero-WordPress Computational Core
All mathematical, binary file, and parsing logic is written as pure PHP classes (`OS_Terrain_Binary_Reader`, `OSGB36_Converter`, `GPX_Enrichment_Service`, `Naismith_Calculator`) tested via pure host PHPUnit without requiring WordPress or a database.

---

## 5. Mobile-First UX Specification

Young people predominantly access portal tools via mobile phones. eDofE fails because it renders desktop-scale tables with microscopic cells. The EMS Route Card Builder uses an adaptive component hierarchy:

```
+─────────────────────────────────────────────────────────────+
| Desktop (> 1024px)             Mobile (< 768px)             |
|                                                             |
| Full 12-column DofE Table      Vertical Leg Accordion Cards |
|                                ┌──────────────────────────┐ |
|                                │ Leg 1: Start -> CP 1     │ |
|                                │ 1.8 km | 32 mins | OK ✓  │ |
|                                ├──────────────────────────┤ |
|                                │ [Expanded Card Form]     │ |
|                                │ Grid Ref: NT 249 398     │ |
|                                │ Bearings: Grid 142° M140°│ |
|                                │ Description: [...]       │ |
|                                │ Escape Route: [...]      │ |
|                                │ [Split Leg] [Merge Down] │ |
|                                └──────────────────────────┘ |
|                                ┌──────────────────────────┐ |
|                                │ Leg 2: CP 1 -> Glenrath  │ |
|                                └──────────────────────────┘ |
+─────────────────────────────────────────────────────────────+
```

1. **Card Accordion View ($< 768\text{ px}$):**
   * Collapsed state shows a high-level journey timeline: Checkpoint name, distance, ascent, and calculated time.
   * Expanding a leg reveals comfortable, thumb-friendly form controls for descriptions and escape routes.
2. **Drawer-Based Map & Elevation Profile:**
   * Bottom sheet / toggle drawer (`[ Route Legs ]` $\leftrightarrow$ `[ Map & Elevation ]`) ensures text editing and map viewing do not compete for cramped vertical mobile screen real estate.
3. **One-Tap Actions:**
   * Large touch targets for "Split Here" and "Tunnel Override".
   * Bearings and grid references require zero manual typing.
4. **Draft Auto-Save to `localStorage`:**
   * Form inputs are buffered locally in `localStorage` so unsaved work survives app-switching (e.g. checking WhatsApp or OS Maps) or dropped rural cellular connections.

---

## 6. Integration Contract with Core EMS

When core EMS is present, communication flows via WordPress filter/action hooks:

```php
// 1. Pulling expedition & team context from EMS
$context = apply_filters( 'ems_get_route_card_context', null, $expedition_id, $team_id, get_current_user_id() );

// 2. Notifying EMS when a team submits their route card
do_action( 'ems_route_card_submitted', $route_card_id, $expedition_id, $team_id, $day_number );

// 3. Notifying EMS when a leader approves or requests changes
do_action( 'ems_route_card_reviewed', $route_card_id, $status, $feedback );
```

---

## 7. REST API Endpoints (`ems-route/v1`)

| Method | Endpoint | Purpose | Access Control |
|---|---|---|---|
| `POST` | `/ems-route/v1/upload-gpx` | Uploads `.gpx`, executes DEM lookup & OSGB36 conversion, archives raw GPX to uploads, returns enriched track array. | Participant / Leader / `edit_posts` |
| `GET` | `/ems-route/v1/card/{exp_id}/{team_id}/{day}` | Fetches saved route card state, enriched geometry, multi-day context, and leader review comments. | Team Member / Leader / `edit_posts` |
| `POST` | `/ems-route/v1/card/{id}/save` | Saves draft leg boundaries, descriptions, bearings, escape routes, rest times, and optimistic lock timestamp. | Team Member / Leader / `edit_posts` |
| `POST` | `/ems-route/v1/card/{id}/submit` | Runs pre-flight checks, verifies all expedition days are complete, and transitions status to `submitted`. | Team Member / `edit_posts` |
| `POST` | `/ems-route/v1/card/{id}/review` | Saves per-leg leader feedback and transitions status to `changes_requested` or `approved`. | Leader / `manage_options` |
| `GET` | `/ems-route/v1/card/{id}/pdf` | Streams on-demand PDF during review, or streams approved static PDF artifact. | Team Member / Leader / `edit_posts` |
| `GET` | `/ems-route/v1/standalone/health` | Diagnostic endpoint reporting on DEM binary file availability and elevation benchmark lookups. | Admin / `manage_options` |
