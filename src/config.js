// Cấu hình hệ thống chấm công (có thể ghi đè bằng biến môi trường)
module.exports = {
  port: Number(process.env.PORT) || 3000,

  // File lưu dữ liệu nhân viên + chấm công
  dataFile: process.env.DATA_FILE || require('path').join(__dirname, '..', 'data', 'db.json'),

  // Múi giờ dùng để tính ngày công
  timeZone: process.env.TZ_ATTENDANCE || 'Asia/Ho_Chi_Minh',

  // Giờ vào ca / tan ca (HH:mm)
  workStart: process.env.WORK_START || '08:00',
  workEnd: process.env.WORK_END || '17:00',

  // Khoảng cách Euclid tối đa giữa 2 vector khuôn mặt để coi là cùng một người
  // (face-api.js khuyến nghị 0.6; để 0.5 cho chặt hơn)
  matchThreshold: Number(process.env.MATCH_THRESHOLD) || 0.5,

  // Sau khi đã chấm, bỏ qua các lần nhận diện lại trong khoảng này (giây)
  cooldownSeconds: Number(process.env.COOLDOWN_SECONDS) || 60,

  // Số mẫu khuôn mặt tối đa lưu cho mỗi nhân viên
  maxSamples: 10,
};
