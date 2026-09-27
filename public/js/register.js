// Đăng ký khuôn mặt nhân viên + xoá nhân viên
(() => {
  const video = document.getElementById('video');
  const overlay = document.getElementById('overlay');
  const statusEl = document.getElementById('status');
  const form = document.getElementById('registerForm');
  const captureBtn = document.getElementById('captureBtn');
  const resetBtn = document.getElementById('resetBtn');
  const saveBtn = document.getElementById('saveBtn');
  const countEl = document.getElementById('sampleCount');
  const messageEl = document.getElementById('message');

  const TARGET = Number(document.getElementById('sampleTarget').textContent);
  let samples = [];

  function update() {
    countEl.textContent = samples.length;
    saveBtn.disabled = samples.length === 0;
    captureBtn.disabled = samples.length >= TARGET;
  }

  function message(text, type) {
    messageEl.textContent = text;
    messageEl.className = `message ${type || ''}`;
  }

  captureBtn.addEventListener('click', async () => {
    captureBtn.disabled = true;
    try {
      const face = await Face.detect(video);
      if (face.count !== 1) {
        message(face.count === 0 ? 'Không thấy khuôn mặt, thử lại' : 'Chỉ để 1 người trong khung hình', 'bad');
      } else {
        samples.push(face.descriptor);
        Face.draw(overlay, video, face.detection, `Mẫu ${samples.length}`);
        message(`Đã chụp mẫu ${samples.length}`, 'ok');
      }
    } catch (err) {
      message('Lỗi: ' + err.message, 'bad');
    }
    update();
  });

  resetBtn.addEventListener('click', () => {
    samples = [];
    Face.draw(overlay, video, null);
    message('');
    update();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(form));
    body.descriptors = samples;
    const res = await fetch('/api/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return message(data.error, 'bad');
    message(`Đã lưu ${data.name}`, 'ok');
    setTimeout(() => location.reload(), 800);
  });

  document.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm(`Xoá nhân viên ${btn.dataset.name}?`)) return;
      const res = await fetch(`/api/employees/${btn.dataset.delete}`, { method: 'DELETE' });
      if (res.ok) location.reload();
    });
  });

  Face.init(video, statusEl)
    .then(update)
    .catch((err) => {
      statusEl.textContent = 'Không khởi động được camera: ' + err.message;
    });
})();
