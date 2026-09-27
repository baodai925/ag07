// Lưu trữ đơn giản bằng file JSON (không cần cài database)
const fs = require('fs');
const path = require('path');

const EMPTY = { employees: [], records: [] };

function createStore(file) {
  let data = load();

  function load() {
    try {
      return { ...EMPTY, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
    } catch (err) {
      if (err.code === 'ENOENT') return structuredClone(EMPTY);
      throw err;
    }
  }

  // Ghi ra file tạm rồi đổi tên để tránh hỏng file khi đang ghi
  function save() {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, file);
  }

  return {
    get data() {
      return data;
    },
    save,
  };
}

module.exports = { createStore };
