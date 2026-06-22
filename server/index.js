const http = require('http');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const apiRoutes = require('./routes/api');
const calibration = require('./calibration');
const storage = require('./storage');

const PORT = Number(process.env.PORT) || 8080;
const IS_PROD = process.env.NODE_ENV === 'production';
const app = express();
const server = http.createServer(app);

if (IS_PROD) {
  app.disable('x-powered-by');
}

if (process.env.TRUST_PROXY === '1') {
  app.set('trust proxy', 1);
}

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

if (IS_PROD) {
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });
} else {
  app.use(cors());
}

app.use(express.json({ limit: '2mb' }));

app.use('/api', apiRoutes);

const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist, { maxAge: IS_PROD ? '1d' : 0, index: false }));

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

function shutdown(signal) {
  console.log(`Received ${signal}, shutting down gracefully...`);
  server.close(() => {
    wss.close(() => process.exit(0));
  });
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

server.listen(PORT, '0.0.0.0', () => {
  const store = storage.readStore();
  console.log(`LD2410 Companion listening on http://0.0.0.0:${PORT} (${IS_PROD ? 'production' : 'development'})`);
  console.log(`Data directory: ${storage.DATA_DIR}`);
  if (!IS_PROD) {
    console.log(`Store: ${storage.STORE_PATH}`);
    if (store.ha_url) console.log(`Saved HA URL: ${store.ha_url}`);
    if (store.token) console.log('Saved access token: present');
  }
});
