const { parseWav } = require('../audio');

// Tổng hợp giọng nói: văn bản -> { pcm, sampleRate }
async function synthesize(config, text, signal) {
  let body;
  if (config.type === 'piper') {
    // piper.http_server: POST /synthesize {"text": "..."}
    body = { text };
    if (config.voice) body.voice = config.voice;
  } else if (config.type === 'openai') {
    // API tương thích OpenAI: POST /v1/audio/speech
    body = { model: config.model, voice: config.voice || 'alloy', input: text, response_format: 'wav' };
  } else {
    throw new Error(`TTS_TYPE không hỗ trợ: ${config.type}`);
  }

  const res = await fetch(config.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`TTS lỗi ${res.status}: ${await res.text()}`);
  return parseWav(Buffer.from(await res.arrayBuffer()));
}

module.exports = { synthesize };
