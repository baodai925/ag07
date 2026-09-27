// Logic nghiệp vụ: nhận diện khuôn mặt + ghi nhận giờ vào/ra
const crypto = require('crypto');

const DESCRIPTOR_LENGTH = 128;

function isDescriptor(d) {
  return Array.isArray(d) && d.length === DESCRIPTOR_LENGTH && d.every(Number.isFinite);
}

function distance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}

// Tìm nhân viên có mẫu khuôn mặt gần nhất; trả null nếu vượt ngưỡng
function findBestMatch(employees, descriptor, threshold) {
  let best = null;
  for (const emp of employees) {
    for (const sample of emp.descriptors) {
      const d = distance(sample, descriptor);
      if (!best || d < best.distance) best = { employee: emp, distance: d };
    }
  }
  return best && best.distance <= threshold ? best : null;
}

// Trả về { date: 'YYYY-MM-DD', time: 'HH:mm:ss' } theo múi giờ cấu hình
function localParts(now, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now).map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}:${parts.second}`,
  };
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function createAttendanceService(store, config) {
  const { data } = store;

  function publicEmployee(emp) {
    return {
      id: emp.id,
      code: emp.code,
      name: emp.name,
      department: emp.department,
      samples: emp.descriptors.length,
      createdAt: emp.createdAt,
    };
  }

  function listEmployees() {
    return data.employees.map(publicEmployee);
  }

  function addEmployee({ code, name, department = '', descriptors }) {
    code = String(code || '').trim();
    name = String(name || '').trim();
    if (!code || !name) throw badRequest('Cần nhập mã và tên nhân viên');
    if (data.employees.some((e) => e.code.toLowerCase() === code.toLowerCase())) {
      throw badRequest(`Mã nhân viên "${code}" đã tồn tại`);
    }
    if (!Array.isArray(descriptors) || descriptors.length === 0 || !descriptors.every(isDescriptor)) {
      throw badRequest('Cần ít nhất 1 mẫu khuôn mặt hợp lệ');
    }

    // Không cho đăng ký 1 khuôn mặt cho 2 người khác nhau
    const dup = findBestMatch(data.employees, descriptors[0], config.matchThreshold);
    if (dup) throw badRequest(`Khuôn mặt này đã được đăng ký cho ${dup.employee.name} (${dup.employee.code})`);

    const emp = {
      id: crypto.randomUUID(),
      code,
      name,
      department: String(department).trim(),
      descriptors: descriptors.slice(0, config.maxSamples),
      createdAt: new Date().toISOString(),
    };
    data.employees.push(emp);
    store.save();
    return publicEmployee(emp);
  }

  function removeEmployee(id) {
    const idx = data.employees.findIndex((e) => e.id === id);
    if (idx === -1) return false;
    data.employees.splice(idx, 1);
    store.save();
    return true;
  }

  // Lần nhận diện đầu tiên trong ngày = giờ vào; các lần sau = cập nhật giờ ra
  function checkIn(descriptor, now = new Date()) {
    if (!isDescriptor(descriptor)) throw badRequest('Vector khuôn mặt không hợp lệ');

    const match = findBestMatch(data.employees, descriptor, config.matchThreshold);
    if (!match) return { status: 'unknown' };

    const emp = match.employee;
    const { date, time } = localParts(now, config.timeZone);
    const confidence = Math.max(0, 1 - match.distance);
    let record = data.records.find((r) => r.employeeId === emp.id && r.date === date);
    let status;

    if (!record) {
      record = { employeeId: emp.id, date, checkIn: time, checkOut: null, lastSeen: now.toISOString() };
      data.records.push(record);
      status = 'checked_in';
    } else if (now - new Date(record.lastSeen) < config.cooldownSeconds * 1000) {
      status = 'already';
    } else {
      record.checkOut = time;
      record.lastSeen = now.toISOString();
      status = 'checked_out';
    }
    if (status !== 'already') store.save();

    return {
      status,
      employee: publicEmployee(emp),
      confidence: Number(confidence.toFixed(3)),
      record: decorate(record),
    };
  }

  // Thêm thông tin đi muộn / về sớm / số giờ làm
  function decorate(record) {
    const inMin = toMinutes(record.checkIn);
    const outMin = record.checkOut ? toMinutes(record.checkOut) : null;
    return {
      date: record.date,
      checkIn: record.checkIn,
      checkOut: record.checkOut,
      late: inMin > toMinutes(config.workStart),
      earlyLeave: outMin !== null && outMin < toMinutes(config.workEnd),
      hours: outMin !== null ? Number(((outMin - inMin) / 60).toFixed(2)) : null,
    };
  }

  function report({ from, to } = {}) {
    const byId = new Map(data.employees.map((e) => [e.id, e]));
    return data.records
      .filter((r) => (!from || r.date >= from) && (!to || r.date <= to))
      .map((r) => {
        const emp = byId.get(r.employeeId);
        return {
          ...decorate(r),
          employeeId: r.employeeId,
          code: emp ? emp.code : '(đã xoá)',
          name: emp ? emp.name : '(đã xoá)',
          department: emp ? emp.department : '',
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date) || a.checkIn.localeCompare(b.checkIn));
  }

  function summary(now = new Date()) {
    const { date } = localParts(now, config.timeZone);
    const today = report({ from: date, to: date });
    return {
      date,
      totalEmployees: data.employees.length,
      present: today.length,
      late: today.filter((r) => r.late).length,
      absent: Math.max(0, data.employees.length - today.length),
      today,
    };
  }

  return { listEmployees, addEmployee, removeEmployee, checkIn, report, summary };
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function toCsv(rows) {
  const header = ['Ngày', 'Mã NV', 'Họ tên', 'Phòng ban', 'Giờ vào', 'Giờ ra', 'Số giờ', 'Đi muộn', 'Về sớm'];
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((r) =>
    [r.date, r.code, r.name, r.department, r.checkIn, r.checkOut, r.hours,
      r.late ? 'Có' : '', r.earlyLeave ? 'Có' : ''].map(esc).join(','),
  );
  // BOM để Excel đọc đúng tiếng Việt
  return '﻿' + [header.join(','), ...lines].join('\n');
}

module.exports = { createAttendanceService, findBestMatch, distance, localParts, toCsv };
