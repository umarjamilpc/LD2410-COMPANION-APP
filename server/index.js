const http = require('http');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const apiRoutes = require('./routes/api');
const calibration = require('./calibration');
const storage = require('./storage');

const PORT = Number(process.env.PORT) || 8080;
const app = express();
const server = http.createServer(app);

const wss = new WebSocketServer({ server, path: '/ws' });
app.set('wss', wss);

wss.on('connection', (ws) => {
  const session = calibration.getActiveSession();
  ws.send(
    JSON.stringify({
      type: 'connected',
      session: session ? session.getStatus() : { status: 'idle' },
    })
  );
});

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.use('/api', apiRoutes);

const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/ws')) return next();
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) next(err);
  });
});

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

server.listen(PORT, '0.0.0.0', () => {
  const store = storage.readStore();
  console.log(`LD2410 Calibrator listening on http://0.0.0.0:${PORT}`);
  console.log(`Data directory: ${storage.DATA_DIR}`);
  console.log(`Store: ${storage.STORE_PATH}`);
  if (store.ha_url) {
    console.log(`Saved HA URL: ${store.ha_url}`);
  }
  if (store.token) {
    console.log('Saved access token: present');
  }
  if (store.selected_sensor) {
    console.log(`Selected sensor: ${store.selected_sensor}`);
  }
});
