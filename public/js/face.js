// Tiện ích dùng chung: tải mô hình, bật camera, nhận diện 1 khuôn mặt
/* global faceapi */
const Face = (() => {
  const detectorOptions = () => new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });

  // Ưu tiên GPU (WebGL); máy không có WebGL thì chạy CPU (chậm hơn)
  async function setupBackend() {
    for (const backend of ['webgl', 'cpu']) {
      try {
        if (await faceapi.tf.setBackend(backend)) break;
      } catch (err) {
        console.warn('Không dùng được backend', backend, err);
      }
    }
    await faceapi.tf.ready();
  }

  async function loadModels() {
    await setupBackend();
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
      faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
      faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
    ]);
  }

  async function startCamera(video) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Trình duyệt không hỗ trợ camera (cần HTTPS hoặc localhost)');
    }
    video.srcObject = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      audio: false,
    });
    await new Promise((resolve) => (video.readyState >= 1 ? resolve() : (video.onloadedmetadata = resolve)));
  }

  // Trả về { detection, descriptor, count } — count là số khuôn mặt trong khung hình
  async function detect(video) {
    const results = await faceapi
      .detectAllFaces(video, detectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptors();
    if (results.length === 0) return { count: 0 };
    // Chọn khuôn mặt lớn nhất (người đứng gần camera nhất)
    const main = results.reduce((a, b) => (a.detection.box.area > b.detection.box.area ? a : b));
    return { count: results.length, detection: main.detection, descriptor: Array.from(main.descriptor) };
  }

  function draw(canvas, video, detection, label, color = '#22c55e') {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!detection) return;
    const { x, y, width, height } = detection.box;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, width, height);
    if (label) {
      // Video đang lật gương bằng CSS nên lật chữ lại cho dễ đọc
      ctx.save();
      ctx.scale(-1, 1);
      ctx.font = 'bold 18px Arial';
      const textX = -(x + width);
      const textWidth = ctx.measureText(label).width + 12;
      ctx.fillStyle = color;
      ctx.fillRect(textX, y - 28, textWidth, 26);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, textX + 6, y - 9);
      ctx.restore();
    }
  }

  async function init(video, statusEl) {
    statusEl.textContent = 'Đang tải mô hình nhận diện…';
    await loadModels();
    statusEl.textContent = 'Đang bật camera…';
    await startCamera(video);
    statusEl.textContent = 'Sẵn sàng';
  }

  return { init, detect, draw };
})();
