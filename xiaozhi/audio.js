const OpusScript = require('opusscript');

// Tạo file WAV (PCM 16-bit mono) từ Int16Array
function pcmToWav(pcm, sampleRate) {
  const dataSize = pcm.length * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  Buffer.from(pcm.buffer, pcm.byteOffset, dataSize).copy(buf, 44);
  return buf;
}

// Đọc WAV PCM 16-bit, trả về { pcm: Int16Array (mono), sampleRate }
function parseWav(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Dữ liệu TTS không phải WAV');
  }
  let offset = 12;
  let fmt = null;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    let size = buf.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (id === 'fmt ') {
      fmt = {
        format: buf.readUInt16LE(start),
        channels: buf.readUInt16LE(start + 2),
        sampleRate: buf.readUInt32LE(start + 4),
        bits: buf.readUInt16LE(start + 14),
      };
    } else if (id === 'data') {
      if (!fmt) throw new Error('WAV thiếu chunk fmt');
      if (fmt.format !== 1 || fmt.bits !== 16) throw new Error('Chỉ hỗ trợ WAV PCM 16-bit');
      // WAV dạng stream có thể ghi size = 0 hoặc 0xFFFFFFFF
      if (size === 0 || start + size > buf.length) size = buf.length - start;
      const samples = Math.floor(size / 2 / fmt.channels);
      const pcm = new Int16Array(samples);
      for (let i = 0; i < samples; i++) {
        pcm[i] = buf.readInt16LE(start + i * 2 * fmt.channels); // lấy kênh đầu
      }
      return { pcm, sampleRate: fmt.sampleRate };
    }
    offset = start + size + (size % 2);
  }
  throw new Error('WAV thiếu chunk data');
}

// Đổi tần số lấy mẫu bằng nội suy tuyến tính
function resample(pcm, fromRate, toRate) {
  if (fromRate === toRate) return pcm;
  const outLen = Math.floor((pcm.length * toRate) / fromRate);
  const out = new Int16Array(outLen);
  const ratio = fromRate / toRate;
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const a = pcm[idx] ?? 0;
    const b = pcm[idx + 1] ?? a;
    out[i] = Math.round(a + (b - a) * frac);
  }
  return out;
}

function rms(pcm) {
  if (pcm.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < pcm.length; i++) sum += pcm[i] * pcm[i];
  return Math.sqrt(sum / pcm.length);
}

function concatPcm(chunks) {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Int16Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

class OpusDecoder {
  constructor(sampleRate) {
    this.decoder = new OpusScript(sampleRate, 1, OpusScript.Application.VOIP);
  }

  decode(packet) {
    const out = this.decoder.decode(packet);
    return new Int16Array(out.buffer.slice(out.byteOffset, out.byteOffset + out.length));
  }

  close() {
    this.decoder.delete();
  }
}

class OpusEncoder {
  constructor(sampleRate, frameDuration) {
    this.encoder = new OpusScript(sampleRate, 1, OpusScript.Application.AUDIO);
    this.frameSize = (sampleRate * frameDuration) / 1000;
  }

  // Chia PCM thành các frame cố định và mã hoá Opus
  encode(pcm) {
    const frames = [];
    for (let i = 0; i < pcm.length; i += this.frameSize) {
      const frame = new Int16Array(this.frameSize); // frame cuối được đệm 0
      frame.set(pcm.subarray(i, i + this.frameSize));
      frames.push(Buffer.from(this.encoder.encode(Buffer.from(frame.buffer), this.frameSize)));
    }
    return frames;
  }

  close() {
    this.encoder.delete();
  }
}

module.exports = { pcmToWav, parseWav, resample, rms, concatPcm, OpusDecoder, OpusEncoder };
