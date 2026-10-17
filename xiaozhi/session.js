const crypto = require('crypto');
const config = require('./config');
const { rms, concatPcm, resample, OpusDecoder, OpusEncoder } = require('./audio');
const { transcribe } = require('./providers/asr');
const { chatStream } = require('./providers/llm');
const { synthesize } = require('./providers/tts');

const FRAME_MS = config.audio.frameDuration;
// Gửi trước vài frame để thiết bị có bộ đệm, sau đó gửi theo tốc độ phát thực
const PREBUFFER_MS = FRAME_MS * 5;
// Cắt câu tại dấu câu để TTS từng câu trong lúc LLM vẫn đang sinh
const SENTENCE_END = /[.!?;:。！？；\n]/;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Bỏ ký hiệu markdown và emoji trước khi đọc
function cleanForSpeech(text) {
  return text
    .replace(/[*#`_~>|]/g, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,!?;:])/g, '$1')
    .trim();
}

class Session {
  constructor(ws, req) {
    this.ws = ws;
    this.id = crypto.randomUUID();
    this.deviceId = req.headers['device-id'] || 'unknown';
    this.protocolVersion = Number(req.headers['protocol-version'] || 1);
    this.history = [];
    this.state = 'idle'; // idle | listening | processing | speaking
    this.listenMode = 'auto';
    this.turn = null; // AbortController của lượt trả lời hiện tại
    this.decoder = new OpusDecoder(config.audio.inputSampleRate);
    this.encoder = new OpusEncoder(config.audio.outputSampleRate, FRAME_MS);
    this.resetListening();

    ws.on('message', (data, isBinary) => {
      if (isBinary) this.onAudio(data);
      else this.onText(data.toString());
    });
    ws.on('close', () => this.close());
    ws.on('error', (err) => this.log('Lỗi WebSocket:', err.message));
    this.log(`Kết nối mới (protocol v${this.protocolVersion})`);
  }

  log(...args) {
    console.log(`[xiaozhi ${this.deviceId}]`, ...args);
  }

  sendJson(msg) {
    if (this.ws.readyState !== this.ws.OPEN) return;
    this.ws.send(JSON.stringify({ session_id: this.id, ...msg }));
  }

  sendAudio(opus) {
    if (this.ws.readyState !== this.ws.OPEN) return;
    this.ws.send(this.packAudio(opus));
  }

  // Đóng gói frame Opus theo phiên bản giao thức nhị phân
  packAudio(opus) {
    if (this.protocolVersion === 2) {
      const header = Buffer.alloc(16);
      header.writeUInt16BE(2, 0);
      header.writeUInt16BE(0, 2); // type 0 = audio
      header.writeUInt32BE(0, 4);
      header.writeUInt32BE(Date.now() >>> 0, 8);
      header.writeUInt32BE(opus.length, 12);
      return Buffer.concat([header, opus]);
    }
    if (this.protocolVersion === 3) {
      const header = Buffer.alloc(4);
      header.writeUInt8(0, 0);
      header.writeUInt8(0, 1);
      header.writeUInt16BE(opus.length, 2);
      return Buffer.concat([header, opus]);
    }
    return opus;
  }

  unpackAudio(data) {
    if (this.protocolVersion === 2) return data.subarray(16, 16 + data.readUInt32BE(12));
    if (this.protocolVersion === 3) return data.subarray(4, 4 + data.readUInt16BE(2));
    return data;
  }

  onText(raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return this.log('JSON không hợp lệ:', raw);
    }

    switch (msg.type) {
      case 'hello':
        this.sendJson({
          type: 'hello',
          transport: 'websocket',
          audio_params: {
            format: 'opus',
            sample_rate: config.audio.outputSampleRate,
            channels: 1,
            frame_duration: FRAME_MS,
          },
        });
        break;
      case 'listen':
        this.onListen(msg);
        break;
      case 'abort':
        this.abortTurn();
        break;
      default:
        // mcp, iot... chưa xử lý
        break;
    }
  }

  onListen(msg) {
    if (msg.state === 'start') {
      // Người dùng nói chen ngang khi thiết bị đang phát -> dừng lượt cũ
      this.abortTurn();
      this.listenMode = msg.mode || 'auto';
      this.resetListening();
      this.state = 'listening';
    } else if (msg.state === 'stop') {
      if (this.state === 'listening') this.finishListening();
    } else if (msg.state === 'detect') {
      this.log('Wake word:', msg.text);
    }
  }

  resetListening() {
    this.chunks = [];
    this.speechMs = 0;
    this.silenceMs = 0;
  }

  onAudio(data) {
    if (this.state !== 'listening') return;
    let pcm;
    try {
      pcm = this.decoder.decode(this.unpackAudio(data));
    } catch (err) {
      return this.log('Không giải mã được Opus:', err.message);
    }
    const ms = (pcm.length * 1000) / config.audio.inputSampleRate;
    const isSpeech = rms(pcm) >= config.audio.vadThreshold;

    // Chưa có tiếng nói thì chỉ giữ lại một chút âm thanh phía trước
    if (this.speechMs === 0 && !isSpeech) {
      this.chunks.push(pcm);
      if (this.chunks.length > 5) this.chunks.shift();
      return;
    }

    this.chunks.push(pcm);
    if (isSpeech) {
      this.speechMs += ms;
      this.silenceMs = 0;
    } else {
      this.silenceMs += ms;
    }

    const totalMs = this.speechMs + this.silenceMs;
    if (this.listenMode !== 'manual' && this.silenceMs >= config.audio.vadSilenceMs) {
      this.finishListening();
    } else if (totalMs >= config.audio.maxSpeechMs) {
      this.finishListening();
    }
  }

  async finishListening() {
    const pcm = concatPcm(this.chunks);
    const speechMs = this.speechMs;
    this.resetListening();

    if (speechMs < config.audio.minSpeechMs) return; // tiếng ồn, tiếp tục nghe
    this.state = 'processing';

    let text = '';
    try {
      text = await transcribe(config.asr, pcm, config.audio.inputSampleRate);
    } catch (err) {
      this.log(err.message);
    }
    if (this.state !== 'processing') return; // đã bị huỷ trong lúc nhận dạng
    if (!text) {
      this.state = 'listening';
      return;
    }

    this.log('Người dùng:', text);
    this.sendJson({ type: 'stt', text });
    await this.reply(text);
  }

  async reply(userText) {
    const turn = new AbortController();
    this.turn = turn;
    this.state = 'speaking';
    this.playClock = 0;

    const messages = [
      { role: 'system', content: config.llm.systemPrompt },
      ...this.history,
      { role: 'user', content: userText },
    ];

    this.sendJson({ type: 'tts', state: 'start' });
    this.sendJson({ type: 'llm', text: '😊', emotion: 'happy' });

    // Mỗi câu được gửi TTS ngay khi LLM sinh xong để giảm độ trễ
    const sentences = [];
    const queueSentence = (raw) => {
      const text = cleanForSpeech(raw);
      if (!text) return;
      const audio = synthesize(config.tts, text, turn.signal);
      audio.catch(() => {}); // lỗi được xử lý khi phát
      sentences.push({ text, audio });
    };

    let fullReply = '';
    const producer = (async () => {
      let buffer = '';
      for await (const delta of chatStream(config.llm, messages, turn.signal)) {
        fullReply += delta;
        buffer += delta;
        let match;
        while ((match = SENTENCE_END.exec(buffer))) {
          queueSentence(buffer.slice(0, match.index + 1));
          buffer = buffer.slice(match.index + 1);
        }
      }
      queueSentence(buffer);
    })();

    let producerDone = false;
    let producerError = null;
    producer
      .catch((err) => (producerError = err))
      .finally(() => (producerDone = true));

    try {
      let index = 0;
      while (!turn.signal.aborted) {
        if (index < sentences.length) {
          await this.playSentence(sentences[index++], turn.signal);
        } else if (producerDone) {
          break;
        } else {
          await sleep(20);
        }
      }
      if (producerError && !turn.signal.aborted) throw producerError;
      // Chờ thiết bị phát hết âm thanh đã gửi
      const remaining = this.playClock - Date.now();
      if (remaining > 0 && !turn.signal.aborted) await sleep(remaining);
    } catch (err) {
      if (!turn.signal.aborted) this.log(err.message);
    }

    if (this.turn !== turn) return; // lượt mới đã bắt đầu
    this.turn = null;
    if (fullReply.trim()) {
      this.log('Trợ lý:', fullReply.trim());
      this.history.push({ role: 'user', content: userText }, { role: 'assistant', content: fullReply.trim() });
      this.history = this.history.slice(-config.llm.maxHistory * 2);
    }
    this.state = 'idle';
    this.sendJson({ type: 'tts', state: 'stop' });
  }

  async playSentence(sentence, signal) {
    let speech;
    try {
      speech = await sentence.audio;
    } catch (err) {
      if (!signal.aborted) this.log(err.message);
      return;
    }
    if (signal.aborted) return;

    const pcm = resample(speech.pcm, speech.sampleRate, config.audio.outputSampleRate);
    const frames = this.encoder.encode(pcm);
    this.sendJson({ type: 'tts', state: 'sentence_start', text: sentence.text });

    for (const frame of frames) {
      if (signal.aborted) return;
      const now = Date.now();
      if (this.playClock < now) this.playClock = now;
      const wait = this.playClock - now - PREBUFFER_MS;
      if (wait > 0) await sleep(wait);
      if (signal.aborted) return;
      this.sendAudio(frame);
      this.playClock += FRAME_MS;
    }
    this.sendJson({ type: 'tts', state: 'sentence_end', text: sentence.text });
  }

  abortTurn() {
    if (this.turn) {
      this.turn.abort();
      this.turn = null;
      this.sendJson({ type: 'tts', state: 'stop' });
    }
    if (this.state !== 'listening') this.state = 'idle';
  }

  close() {
    this.abortTurn();
    this.state = 'closed';
    this.decoder.close();
    this.encoder.close();
    this.log('Ngắt kết nối');
  }
}

module.exports = { Session, cleanForSpeech };
