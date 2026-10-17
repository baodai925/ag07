const express = require('express');
const { WebSocketServer } = require('ws');
const config = require('./config');
const { Session } = require('./session');

// OTA: thiết bị gọi khi khởi động để lấy địa chỉ WebSocket và giờ hệ thống
function otaRouter() {
  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    res.type('text').send(`OTA OK. WebSocket: ${wsUrlFor(req)}`);
  });

  router.post('/', (req, res) => {
    const now = new Date();
    res.json({
      server_time: {
        timestamp: now.getTime(),
        timezone_offset: -now.getTimezoneOffset(),
      },
      // Trả lại đúng phiên bản thiết bị đang chạy để không kích hoạt cập nhật firmware
      firmware: {
        version: req.body?.application?.version || '0.0.0',
        url: '',
      },
      websocket: {
        url: wsUrlFor(req),
        token: config.authToken,
      },
    });
  });

  return router;
}

function wsUrlFor(req) {
  return config.publicWsUrl || `ws://${req.headers.host}${config.wsPath}`;
}

function attachWebSocket(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname.replace(/\/?$/, '/') !== config.wsPath) {
      socket.destroy();
      return;
    }
    if (config.authToken) {
      const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (auth !== config.authToken) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
    }
    wss.handleUpgrade(req, socket, head, (ws) => new Session(ws, req));
  });

  return wss;
}

module.exports = { otaRouter, attachWebSocket, config };
