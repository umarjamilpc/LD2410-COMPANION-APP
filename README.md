# LD2410B Human Presence Calibration Web App

A Dockerized web tool for calibrating LD2410B radar sensors in **ESPHome + Home Assistant**. Discover presence entities, run timed calibration sessions, compute gate thresholds, push values back to HA, and backup/restore profiles.

Repository: [github.com/umarjamilpc/LD2410-COMPANION-APP](https://github.com/umarjamilpc/LD2410-COMPANION-APP)

## Quick Start

### Option A — Docker Compose (build locally)

```bash
docker compose up --build
```

### Option B — Pre-built image (amd64 / arm64)

```bash
docker compose pull
docker compose up
```

Image: `ghcr.io/umarjamilpc/ld2410-companion-app:latest`

Open **http://localhost:8080**

No `.env` files. Configure Home Assistant URL and long-lived access token in the web UI. Settings persist in `./data/store.json` across restarts.

## Features

| Page | Description |
|------|-------------|
| **Setup** | HA URL + access token, connection test (remembered across restarts) |
| **Sensors** | Discover ESPHome LD2410 sensors, select one |
| **Dashboard** | Live sensor data (gates, thresholds, distances) |
| **Calibration** | Timed sessions (1–10 min) with live charts |
| **Results** | Gate thresholds, YAML preview, push to HA |
| **Backup** | Import/export JSON, current gates export, restore |

## LD2410 Engineering Mode

ESPHome LD2410 gate energy sensors (`g0 move energy`, `g0 still energy`, etc.) only report values when **Radar Engineering Mode** is enabled. The app auto-enables engineering mode during calibration and turns it off when done (configurable).

## Architecture

- **Backend**: Node.js + Express on port 8080
- **Frontend**: React (Vite), served as static files
- **Storage**: JSON in `./data/` (bind-mounted, survives Docker restarts)
- **Live updates**: WebSocket at `/ws` during calibration

## CI / Docker builds

GitHub Actions builds multi-architecture images on every push to `main`:

- `linux/amd64` (x64)
- `linux/arm64` (ARM64 / Raspberry Pi, Apple Silicon)

Published to GitHub Container Registry: `ghcr.io/umarjamilpc/ld2410-companion-app`

## Development (without Docker)

```bash
npm install
npm run build
npm start
```

## License

MIT
