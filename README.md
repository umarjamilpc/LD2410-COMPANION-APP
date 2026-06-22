# LD2410 Companion App

A Dockerized web app for calibrating **LD2410B** radar sensors running in **ESPHome + Home Assistant**. Discover sensors, run empty-room calibration sessions, compute gate thresholds, push values back to HA, fine-tune manually, and backup/restore profiles.

Repository: [github.com/umarjamilpc/LD2410-COMPANION-APP](https://github.com/umarjamilpc/LD2410-COMPANION-APP)

Pre-built image: `ghcr.io/umarjamilpc/ld2410-companion-app:latest` (amd64 + arm64)

---

## Quick start (Docker)

```bash
docker compose pull
docker compose up -d
```

Open **http://localhost:8080** (or your server IP on port 8080).

Settings, calibration history, backups, theme, and sidebar order are stored in the mounted `data/` folder and survive container restarts.

### Unraid example

```yaml
services:
  ld2410-calibrator:
    image: ghcr.io/umarjamilpc/ld2410-companion-app:latest
    container_name: LD2410-COMPANION-APP
    ports:
      - "8080:8080"
    environment:
      NODE_ENV: production
      PORT: "8080"
      DATA_DIR: /app/data
    volumes:
      - /mnt/user/appdata/LD2410-COMPANION-APP/data:/app/data
    restart: unless-stopped
```

### Health check

`GET /api/health` returns `{ "status": "ok", ... }` — useful for Docker health checks or reverse proxies.

---

## Home Assistant setup (URL + token)

**You do not need to enable a separate “API” in Home Assistant.** The REST API is available by default on your HA instance. This app talks to HA over HTTP using a **long-lived access token**.

### Create a long-lived access token

1. Open Home Assistant in your browser and sign in.
2. Click your **profile** (bottom-left) → **Security**.
3. Under **Long-Lived Access Tokens**, click **Create token**.
4. Give it a name (e.g. `LD2410 Companion`) and copy the token immediately — HA only shows it once.

### Connect in the app

1. Open **Home Assistant** in the sidebar.
2. Enter your HA URL, for example:
   - `http://homeassistant.local:8123`
   - `http://192.168.1.50:8123`
   - `https://your-ha.example.com` (if you use HTTPS)
3. Paste the long-lived access token.
4. Click **Test connection** — you should see your HA location name and version.

The token is saved in `data/store.json` on your host (not in git). Keep that folder private.

### Permissions

The token needs access to:

- Read entity states (sensors, switches)
- Call services (e.g. `switch.turn_on` for engineering mode, `number.set_value` for gate thresholds)

A normal user token is sufficient. Use a dedicated HA user if you want to limit scope.

### Troubleshooting connection

| Issue | What to try |
|-------|-------------|
| Connection refused | Check URL, port 8123, and that HA is reachable from the Docker host |
| 401 Unauthorized | Token expired or wrong — create a new token |
| Sensors not found | Confirm ESPHome LD2410 is integrated; open **Sensors** and refresh |
| Gate energy always 0 | Enable **Radar Engineering Mode** (app does this automatically during calibration) |

---

## How to use the app

Recommended workflow for a new room or sensor:

### 1. Home Assistant

Configure URL + token and verify connection.

### 2. Sensors

Refresh the list and pick your LD2410 **radar target** sensor for this session. The session sensor is remembered in the browser until you change it.

### 3. Calibration

- Leave the room **empty** (no people, pets, or moving fans).
- Set duration (1–10 minutes) and threshold buffers (points added above peak gate energy for still vs move).
- Start calibration — engineering mode is enabled automatically.
- When finished, thresholds are computed from peak samples and saved to history.

### 4. Thresholds

Review computed gate values, YAML preview, and **Apply to Home Assistant** when ready.

### 5. Manual Tweaking

Live comparison of gate energy vs current HA thresholds. Adjust values manually and apply; the app waits for HA to sync before refreshing.

### 6. Live Monitor

Real-time dashboard: presence, distances, per-gate energy and thresholds.

### 7. Backups

Export/import full JSON backups, export current gates, restore previous profiles.

### 8. Themes

Light/dark mode and accent colors — saved with your preferences.

### Sidebar menu order

Use the **▲** / **▼** buttons next to each menu item to reorder pages. Click **Reset order** to restore the default layout. Order is saved in `data/store.json`.

---

## Pages

| Page | Route | Purpose |
|------|-------|---------|
| **Home Assistant** | `/home-assistant` | HA URL, access token, connection test |
| **Sensors** | `/sensors` | Discover LD2410 sensors, select session sensor |
| **Live Monitor** | `/live-monitor` | Live gate energy, thresholds, presence |
| **Manual Tweaking** | `/manual-tweaking` | Compare and edit thresholds vs live energy |
| **Calibration** | `/calibration` | Empty-room timed calibration sessions |
| **Thresholds** | `/thresholds` | View/apply calibrated gate thresholds |
| **Backups** | `/backups` | Import, export, restore calibration data |
| **Themes** | `/themes` | Appearance preferences |

Old URLs (`/dashboard`, `/comparison`, `/results`, `/backup`) redirect automatically to the new routes.

---

## ESPHome example (ESP32-WROOM + LD2410B)

A ready-to-adapt ESPHome config is included for **ESP32-WROOM** boards with the LD2410 on **GPIO16 (TX)** and **GPIO17 (RX)**:

- [examples/esphome-esp32-wroom-ld2410.yaml](examples/esphome-esp32-wroom-ld2410.yaml) — full device config (gate thresholds, gate energy, engineering mode, zones)

### Setup

1. Copy `examples/esphome-esp32-wroom-ld2410.yaml` into your ESPHome config folder.
2. Replace the placeholder Wi‑Fi, OTA, API key, and fallback hotspot passwords in the file with your own values (search for `YOUR_WIFI_` and the quoted strings under `api`, `ota`, and `wifi.ap`).
3. Rename `name` / `friendly_name` if you like, then compile and flash with ESPHome.
4. Add the device to Home Assistant, then open **Sensors** in this app and select the **Radar Target** entity.

The example exposes everything the companion app needs: per-gate `move` / `still` thresholds and energy sensors, plus the **Radar Engineering Mode** switch. Zone occupancy template sensors are optional for Home Assistant automations.

---

## LD2410 engineering mode

ESPHome LD2410 **gate energy** sensors (`g0 move energy`, `g0 still energy`, etc.) only report when **Radar Engineering Mode** is on. The app enables engineering mode during calibration and can turn it off when done (configurable in calibration preferences).

---

## Data & security

| Path | Contents |
|------|----------|
| `data/store.json` | HA URL, token, preferences, calibration history |
| `data/backups/` | Timestamped JSON backup files |

- Run on a **trusted local network**; the UI has no built-in login.
- Restrict port 8080 with firewall or put behind a reverse proxy with auth if exposed beyond LAN.
- Set `TRUST_PROXY=1` if running behind nginx/Traefik so Express handles proxies correctly.

---

## Architecture

- **Backend**: Node.js + Express on port 8080
- **Frontend**: React (Vite), served as static files from the same container
- **Storage**: JSON in `./data/` (bind-mounted)
- **Live updates**: WebSocket at `/ws` during calibration

---

## Development (without Docker)

```bash
npm install
cd client && npm install && cd ..
npm run build
npm start
```

Dev server for frontend only: `cd client && npm run dev` (proxies API to port 8080).

---

## CI / Docker builds

The `Dockerfile` is built by GitHub Actions on push to `main` and published to:

`ghcr.io/umarjamilpc/ld2410-companion-app`

Platforms: `linux/amd64`, `linux/arm64`

---

## License

MIT
