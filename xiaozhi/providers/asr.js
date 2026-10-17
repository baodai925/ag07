const { pcmToWav } = require('../audio');

// Nhận dạng giọng nói: PCM 16 kHz -> văn bản
async function transcribe(config, pcm, sampleRate) {
  const form = new FormData();
  form.append('file', new Blob([pcmToWav(pcm, sampleRate)], { type: 'audio/wav' }), 'audio.wav');
  form.append('response_format', 'json');
  if (config.language) form.append('language', config.language);

  let url;
  if (config.type === 'whispercpp') {
    // whisper.cpp server: POST /inference
    url = `${config.url.replace(/\/$/, '')}/inference`;
    form.append('temperature', '0');
  } else if (config.type === 'openai') {
    // API tương thích OpenAI (speaches, LocalAI...): POST /v1/audio/transcriptions
    url = `${config.url.replace(/\/$/, '')}/v1/audio/transcriptions`;
    form.append('model', config.model);
  } else {
    throw new Error(`ASR_TYPE không hỗ trợ: ${config.type}`);
  }

  const res = await fetch(url, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`ASR lỗi ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.text || '').trim();
}

module.exports = { transcribe };
