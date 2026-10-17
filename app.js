const express = require('express');
const path = require('path');
const xiaozhi = require('./xiaozhi');
const app = express();

app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.render('index');
});

// OTA cho thiết bị Xiaozhi (ESP32)
app.use('/xiaozhi/ota', xiaozhi.otaRouter());

const server = app.listen(xiaozhi.config.port, () => {
  console.log(`Server chạy tại http://localhost:${xiaozhi.config.port}`);
  console.log(`Xiaozhi OTA:       http://<ip-may-chu>:${xiaozhi.config.port}/xiaozhi/ota/`);
  console.log(`Xiaozhi WebSocket: ws://<ip-may-chu>:${xiaozhi.config.port}${xiaozhi.config.wsPath}`);
});

xiaozhi.attachWebSocket(server);
