const path = require('path');

// Đọc file .env (nếu có) ở thư mục gốc dự án
try {
  process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch {
  // không có .env thì dùng biến môi trường / giá trị mặc định
}

const env = (name, fallback) => process.env[name] ?? fallback;
const num = (name, fallback) => Number(env(name, fallback));

module.exports = {
  port: num('PORT', 3000),
  // Địa chỉ WebSocket trả về cho thiết bị qua OTA, ví dụ ws://192.168.1.10:3000/xiaozhi/v1/
  // Để trống thì tự suy ra từ Host header của request OTA
  publicWsUrl: env('PUBLIC_WS_URL', ''),
  wsPath: '/xiaozhi/v1/',
  // Token xác thực thiết bị (Authorization: Bearer <token>); để trống = không kiểm tra
  authToken: env('AUTH_TOKEN', ''),

  asr: {
    type: env('ASR_TYPE', 'whispercpp'), // whispercpp | openai
    url: env('ASR_URL', 'http://localhost:8080'),
    model: env('ASR_MODEL', 'whisper-1'), // chỉ dùng với type=openai
    language: env('ASR_LANGUAGE', 'vi'),
  },

  llm: {
    // API tương thích OpenAI: Ollama, llama.cpp server, LM Studio, vLLM...
    url: env('LLM_URL', 'http://localhost:11434/v1'),
    apiKey: env('LLM_API_KEY', 'ollama'),
    model: env('LLM_MODEL', 'qwen2.5:3b'),
    maxHistory: num('LLM_MAX_HISTORY', 10),
    systemPrompt: env(
      'LLM_SYSTEM_PROMPT',
      'Bạn là Tiểu Trí, trợ lý giọng nói thân thiện. Luôn trả lời bằng tiếng Việt, ' +
        'ngắn gọn 1-3 câu, giọng văn nói tự nhiên. Không dùng markdown, danh sách, ký hiệu hay emoji.'
    ),
  },

  tts: {
    type: env('TTS_TYPE', 'piper'), // piper | openai
    url: env('TTS_URL', 'http://localhost:5000/synthesize'),
    model: env('TTS_MODEL', 'tts-1'), // chỉ dùng với type=openai
    voice: env('TTS_VOICE', ''),
  },

  audio: {
    inputSampleRate: 16000,
    outputSampleRate: num('OUTPUT_SAMPLE_RATE', 24000),
    frameDuration: 60,
    // VAD năng lượng: ngưỡng RMS và thời gian im lặng để kết thúc câu (chế độ auto)
    vadThreshold: num('VAD_THRESHOLD', 500),
    vadSilenceMs: num('VAD_SILENCE_MS', 800),
    minSpeechMs: num('MIN_SPEECH_MS', 300),
    maxSpeechMs: num('MAX_SPEECH_MS', 15000),
  },
};
