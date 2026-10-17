// Giả lập thiết bị Xiaozhi để thử server mà không cần ESP32.
// Cách dùng: node scripts/test-client.js [ws-url] [input.wav] [output.wav]
//   MODE=auto để thử VAD phía server (mặc định manual: client tự báo dừng nghe)
//   input.wav: giọng nói WAV PCM 16-bit (bất kỳ tần số nào, sẽ tự đổi về 16 kHz)
//   output.wav: nơi lưu câu trả lời của trợ lý
const fs = require('fs');
const WebSocket = require('ws');
const { parseWav, resample, pcmToWav, concatPcm, OpusEncoder, OpusDecoder } = require('../xiaozhi/audio');

const [url = 'ws://localhost:3000/xiaozhi/v1/', input, output = 'reply.wav'] = process.argv.slice(2);
const token = process.env.AUTH_TOKEN || '';
const mode = process.env.MODE || 'manual';

function loadInput() {
  if (input) {
    const { pcm, sampleRate } = parseWav(fs.readFileSync(input));
    return resample(pcm, sampleRate, 16000);
  }
  // Không có file: tạo 1 giây âm thanh thử
  const pcm = new Int16Array(16000);
  for (let i = 0; i < pcm.length; i++) pcm[i] = Math.sin((2 * Math.PI * 440 * i) / 16000) * 8000;
  return pcm;
}

const ws = new WebSocket(url, {
  headers: {
    Authorization: `Bearer ${token}`,
    'Protocol-Version': '1',
    'Device-Id': 'test-client',
    'Client-Id': 'test-client',
  },
});

const received = [];
let decoder;
let outputRate;

ws.on('open', () => {
  ws.send(JSON.stringify({
    type: 'hello',
    version: 1,
    transport: 'websocket',
    audio_params: { format: 'opus', sample_rate: 16000, channels: 1, frame_duration: 60 },
  }));
});

ws.on('message', async (data, isBinary) => {
  if (isBinary) {
    received.push(decoder.decode(data));
    return;
  }
  const msg = JSON.parse(data.toString());
  console.log('<-', JSON.stringify(msg));

  if (msg.type === 'hello') {
    outputRate = msg.audio_params.sample_rate;
    decoder = new OpusDecoder(outputRate);
    ws.send(JSON.stringify({ type: 'listen', state: 'start', mode }));

    // Gửi giọng nói theo frame 60 ms rồi báo dừng nghe
    const encoder = new OpusEncoder(16000, 60);
    // Chế độ auto: thêm 1,5 giây im lặng để server tự phát hiện hết câu
    const speech = loadInput();
    const pcm = mode === 'auto' ? concatPcm([speech, new Int16Array(24000)]) : speech;
    for (const frame of encoder.encode(pcm)) {
      ws.send(frame);
      await new Promise((r) => setTimeout(r, 5));
    }
    if (mode !== 'auto') ws.send(JSON.stringify({ type: 'listen', state: 'stop' }));
  }

  if (msg.type === 'tts' && msg.state === 'stop') {
    fs.writeFileSync(output, pcmToWav(concatPcm(received), outputRate));
    console.log(`Đã lưu ${output} (${(concatPcm(received).length / outputRate).toFixed(1)} giây)`);
    ws.close();
  }
});

ws.on('error', (err) => {
  console.error('Lỗi:', err.message);
  process.exit(1);
});
