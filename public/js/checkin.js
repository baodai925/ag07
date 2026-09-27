// Màn hình kiosk chấm công: quét liên tục, gửi vector khuôn mặt lên server
(() => {
  const video = document.getElementById('video');
  const overlay = document.getElementById('overlay');
  const statusEl = document.getElementById('status');
  const resultEl = document.getElementById('result');
  const logEl = document.getElementById('log');
  const clockEl = document.getElementById('clock');

  const SCAN_INTERVAL = 600; // ms giữa 2 lần quét
  const PAUSE_AFTER_RESULT = 3000; // dừng một chút sau khi đã chấm để tránh gửi liên tục
  const MIN_FACE_WIDTH = 120; // px — yêu cầu đứng đủ gần camera

  const MESSAGES = {
    checked_in: (r) => `Xin chào ${r.employee.name}! Giờ vào: ${r.record.checkIn}${r.record.late ? ' (đi muộn)' : ''}`,
    checked_out: (r) => `Tạm biệt ${r.employee.name}! Giờ ra: ${r.record.checkOut}`,
    already: (r) => `${r.employee.name} vừa chấm công rồi`,
    unknown: () => 'Không nhận ra khuôn mặt — vui lòng đăng ký',
  };

  setInterval(() => {
    clockEl.textContent = new Date().toLocaleTimeString('vi-VN');
  }, 1000);

  function showResult(res) {
    const cls = { checked_in: 'ok', checked_out: 'ok', already: 'info', unknown: 'bad' }[res.status];
    resultEl.className = `result ${cls}`;
    resultEl.innerHTML = '';
    const p = document.createElement('p');
    p.textContent = MESSAGES[res.status](res);
    resultEl.appendChild(p);

    if (res.status === 'checked_in' || res.status === 'checked_out') {
      const li = document.createElement('li');
      const time = res.status === 'checked_in' ? res.record.checkIn : res.record.checkOut;
      li.textContent = `${time} · ${res.employee.name} · ${res.status === 'checked_in' ? 'Vào' : 'Ra'}`;
      logEl.prepend(li);
      while (logEl.children.length > 10) logEl.lastChild.remove();
    }
  }

  async function scan() {
    let delay = SCAN_INTERVAL;
    try {
      const face = await Face.detect(video);
      if (face.count === 0) {
        Face.draw(overlay, video, null);
        statusEl.textContent = 'Không thấy khuôn mặt';
      } else if (face.count > 1) {
        Face.draw(overlay, video, face.detection, 'Mỗi lần 1 người', '#f59e0b');
        statusEl.textContent = 'Có nhiều khuôn mặt — mỗi lần chỉ 1 người';
      } else if (face.detection.box.width < MIN_FACE_WIDTH) {
        Face.draw(overlay, video, face.detection, 'Lại gần hơn', '#f59e0b');
        statusEl.textContent = 'Vui lòng lại gần camera hơn';
      } else {
        statusEl.textContent = 'Đang nhận diện…';
        const res = await fetch('/api/attendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ descriptor: face.descriptor }),
        }).then((r) => r.json());

        const label = res.employee ? res.employee.name : 'Không xác định';
        Face.draw(overlay, video, face.detection, label, res.employee ? '#22c55e' : '#ef4444');
        showResult(res);
        statusEl.textContent = 'Sẵn sàng';
        delay = PAUSE_AFTER_RESULT;
      }
    } catch (err) {
      console.error(err);
      statusEl.textContent = 'Lỗi: ' + err.message;
    }
    setTimeout(scan, delay);
  }

  Face.init(video, statusEl)
    .then(scan)
    .catch((err) => {
      statusEl.textContent = 'Không khởi động được camera: ' + err.message;
    });
})();
