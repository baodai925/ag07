const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createStore } = require('../src/store');
const { createAttendanceService, localParts, toCsv } = require('../src/attendance');
const { createApp } = require('../app');

const config = {
  timeZone: 'Asia/Ho_Chi_Minh',
  workStart: '08:00',
  workEnd: '17:00',
  matchThreshold: 0.5,
  cooldownSeconds: 60,
  maxSamples: 10,
};

// Vector khuôn mặt giả: mỗi "người" là một vector gần như trực giao với người khác
const face = (seed, noise = 0) => Array.from({ length: 128 }, (_, i) => (i % 8 === seed ? 0.5 : 0) + noise);
// 2026-09-28 01:30 UTC = 08:30 giờ Việt Nam
const at = (hhmm) => new Date(`2026-09-28T${hhmm}:00+07:00`);

let file;
let service;

beforeEach(() => {
  file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'camvision-')), 'db.json');
  service = createAttendanceService(createStore(file), config);
});

test('localParts dùng múi giờ cấu hình', () => {
  assert.deepStrictEqual(localParts(new Date('2026-09-27T20:15:00Z'), 'Asia/Ho_Chi_Minh'), {
    date: '2026-09-28',
    time: '03:15:00',
  });
});

test('đăng ký nhân viên và chặn mã trùng / khuôn mặt trùng', () => {
  const emp = service.addEmployee({ code: 'NV001', name: 'An', descriptors: [face(0)] });
  assert.strictEqual(emp.samples, 1);
  assert.throws(() => service.addEmployee({ code: 'nv001', name: 'B', descriptors: [face(1)] }), /đã tồn tại/);
  assert.throws(() => service.addEmployee({ code: 'NV002', name: 'B', descriptors: [face(0, 0.01)] }), /đã được đăng ký/);
  assert.throws(() => service.addEmployee({ code: 'NV003', name: 'C', descriptors: [[1, 2]] }), /mẫu khuôn mặt/);
});

test('chấm vào, bỏ qua trong thời gian chờ, rồi chấm ra', () => {
  service.addEmployee({ code: 'NV001', name: 'An', descriptors: [face(0)] });

  const first = service.checkIn(face(0, 0.01), at('08:30'));
  assert.strictEqual(first.status, 'checked_in');
  assert.strictEqual(first.record.checkIn, '08:30:00');
  assert.strictEqual(first.record.late, true);

  assert.strictEqual(service.checkIn(face(0), at('08:30')).status, 'already');

  const out = service.checkIn(face(0), at('16:30'));
  assert.strictEqual(out.status, 'checked_out');
  assert.strictEqual(out.record.checkOut, '16:30:00');
  assert.strictEqual(out.record.earlyLeave, true);
  assert.strictEqual(out.record.hours, 8);
});

test('khuôn mặt lạ trả về unknown', () => {
  service.addEmployee({ code: 'NV001', name: 'An', descriptors: [face(0)] });
  assert.strictEqual(service.checkIn(face(3), at('07:55')).status, 'unknown');
});

test('dữ liệu được lưu xuống file và đọc lại', () => {
  service.addEmployee({ code: 'NV001', name: 'An', descriptors: [face(0)] });
  service.checkIn(face(0), at('07:50'));
  const reloaded = createAttendanceService(createStore(file), config);
  const rows = reloaded.report({ from: '2026-09-28', to: '2026-09-28' });
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].late, false);
});

test('xuất CSV có BOM và escape dấu phẩy', () => {
  const csv = toCsv([{ date: '2026-09-28', code: 'NV1', name: 'Trần, B', department: '', checkIn: '08:00:00', checkOut: null, hours: null, late: false, earlyLeave: false }]);
  assert.ok(csv.startsWith('﻿'));
  assert.match(csv, /"Trần, B"/);
});

test('API: đăng ký, chấm công, render các trang', async () => {
  const app = createApp({ dataFile: file });
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (url, body) =>
    fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  try {
    let res = await post('/api/employees', { code: 'NV001', name: 'An', descriptors: [face(0)] });
    assert.strictEqual(res.status, 201);

    res = await post('/api/employees', { code: 'NV001', name: 'An', descriptors: [face(0)] });
    assert.strictEqual(res.status, 400);
    assert.match((await res.json()).error, /đã tồn tại/);

    res = await post('/api/attendance', { descriptor: face(0) });
    assert.strictEqual((await res.json()).status, 'checked_in');

    res = await post('/api/attendance', { descriptor: 'xxx' });
    assert.strictEqual(res.status, 400);

    for (const page of ['/', '/cham-cong', '/nhan-vien', '/bao-cao']) {
      res = await fetch(base + page);
      assert.strictEqual(res.status, 200, page);
    }
    res = await fetch(base + '/models/face_recognition_model-weights_manifest.json');
    assert.strictEqual(res.status, 200);

    res = await fetch(base + '/api/attendance?format=csv');
    assert.match(res.headers.get('content-type'), /text\/csv/);
  } finally {
    server.close();
  }
});
