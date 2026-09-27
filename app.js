const express = require('express');
const path = require('path');
const config = require('./src/config');
const { createStore } = require('./src/store');
const { createAttendanceService, toCsv } = require('./src/attendance');

function createApp(options = {}) {
  const cfg = { ...config, ...options };
  const service = createAttendanceService(createStore(cfg.dataFile), cfg);
  const app = express();

  app.set('view engine', 'pug');
  app.set('views', path.join(__dirname, 'views'));
  app.locals.workStart = cfg.workStart;
  app.locals.workEnd = cfg.workEnd;

  app.use(express.json({ limit: '1mb' }));
  app.use(express.static(path.join(__dirname, 'public')));

  // Thư viện nhận diện khuôn mặt + model, phục vụ trực tiếp từ node_modules (chạy offline)
  const faceApiDir = path.dirname(require.resolve('@vladmandic/face-api/package.json'));
  app.use('/vendor/face-api', express.static(path.join(faceApiDir, 'dist')));
  app.use('/models', express.static(path.join(faceApiDir, 'model')));

  // ===== Trang giao diện =====
  app.get('/', (req, res) => res.render('index', { page: 'home', summary: service.summary() }));
  app.get('/cham-cong', (req, res) => res.render('checkin', { page: 'checkin' }));
  app.get('/nhan-vien', (req, res) =>
    res.render('employees', { page: 'employees', employees: service.listEmployees() }),
  );
  app.get('/bao-cao', (req, res) => {
    const today = service.summary().date;
    const from = req.query.from || today;
    const to = req.query.to || today;
    res.render('report', { page: 'report', from, to, rows: service.report({ from, to }) });
  });

  // ===== API =====
  app.get('/api/employees', (req, res) => res.json(service.listEmployees()));

  app.post('/api/employees', (req, res) => {
    res.status(201).json(service.addEmployee(req.body || {}));
  });

  app.delete('/api/employees/:id', (req, res) => {
    if (!service.removeEmployee(req.params.id)) return res.status(404).json({ error: 'Không tìm thấy nhân viên' });
    res.status(204).end();
  });

  app.post('/api/attendance', (req, res) => {
    res.json(service.checkIn((req.body || {}).descriptor));
  });

  app.get('/api/attendance', (req, res) => {
    const rows = service.report({ from: req.query.from, to: req.query.to });
    if (req.query.format === 'csv') {
      res.type('text/csv; charset=utf-8');
      res.attachment(`cham-cong_${req.query.from || 'all'}_${req.query.to || 'all'}.csv`);
      return res.send(toCsv(rows));
    }
    res.json(rows);
  });

  app.get('/api/summary', (req, res) => res.json(service.summary()));

  // Lỗi nghiệp vụ trả về JSON có thông báo tiếng Việt
  app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Lỗi máy chủ' : err.message });
  });

  return app;
}

if (require.main === module) {
  createApp().listen(config.port, () => {
    console.log(`Server chạy tại http://localhost:${config.port}`);
  });
}

module.exports = { createApp };
