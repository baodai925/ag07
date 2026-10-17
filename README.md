# Xiaozhi AI Local — server offline

Server AI chạy trên máy của bạn cho loa/robot **Xiaozhi (ESP32)**, không cần Internet và không gọi dịch vụ đám mây.

```
ESP32 Xiaozhi ──WebSocket (Opus)──► Node.js server (app.js, cổng 3000)
                                       ├─ ASR: whisper.cpp   (giọng nói → chữ)
                                       ├─ LLM: Ollama        (trả lời)
                                       └─ TTS: Piper         (chữ → giọng nói)
```

- Hỗ trợ giao thức WebSocket của firmware xiaozhi-esp32 (hello, listen auto/manual/realtime, abort, stt/llm/tts, binary protocol v1/v2/v3).
- Có endpoint OTA `/xiaozhi/ota/` để thiết bị tự lấy địa chỉ WebSocket.
- VAD phía server cho chế độ `auto`; LLM trả lời dạng stream, đọc TTS từng câu để giảm độ trễ.
- Mặc định là tiếng Việt: Whisper `vi`, giọng Piper `vi_VN-vais1000-medium`, model `qwen2.5:3b`.

## Cấu trúc

| Đường dẫn | Nội dung |
|---|---|
| `app.js` | Web Express + gắn OTA và WebSocket Xiaozhi |
| `xiaozhi/session.js` | Xử lý một kết nối thiết bị: nghe → ASR → LLM → TTS → gửi Opus |
| `xiaozhi/audio.js` | Opus encode/decode, WAV, resample, RMS |
| `xiaozhi/providers/` | Gọi ASR / LLM / TTS qua HTTP |
| `xiaozhi/config.js` | Cấu hình từ biến môi trường / `.env` |
| `docker-compose.yml` | Chạy đủ 4 dịch vụ |
| `scripts/download-models.sh` | Tải image và model (chạy khi còn mạng) |
| `scripts/export-images.sh` | Đóng gói image để chép sang máy offline |
| `scripts/test-client.js` | Giả lập thiết bị để thử không cần ESP32 |

## Cài đặt

### 1. Khi máy còn Internet: tải mọi thứ một lần

```bash
cp .env.example .env          # sửa model/giọng nếu muốn
./scripts/download-models.sh  # ~3–4 GB: whisper small, qwen2.5:3b, giọng Piper
```

Nếu máy chủ **hoàn toàn không có mạng**, chạy bước trên ở một máy khác, sau đó:

```bash
./scripts/export-images.sh    # tạo xiaozhi-images.tar
# chép cả thư mục dự án (kèm ./data và xiaozhi-images.tar) sang máy chủ, rồi trên máy chủ:
docker load -i xiaozhi-images.tar
```

### 2. Chạy

```bash
docker compose up -d
docker compose logs -f xiaozhi
```

Kiểm tra: mở `http://<ip-may-chu>:3000/xiaozhi/ota/`, sẽ thấy địa chỉ WebSocket.

### 3. Thử không cần ESP32

```bash
npm install
node scripts/test-client.js ws://localhost:3000/xiaozhi/v1/ cau-hoi.wav tra-loi.wav
MODE=auto node scripts/test-client.js   # thử VAD phía server
```

`cau-hoi.wav` là file ghi âm WAV PCM 16-bit; câu trả lời được lưu vào `tra-loi.wav`.

### 4. Kết nối thiết bị Xiaozhi

Trong firmware [xiaozhi-esp32](https://github.com/78/xiaozhi-esp32), đặt địa chỉ OTA về server của bạn:

- Khi build: `idf.py menuconfig` → *Xiaozhi Assistant* → **OTA URL** = `http://<ip-may-chu>:3000/xiaozhi/ota/`
- Hoặc với firmware có trang cấu hình Wi-Fi: mục *Advanced* → OTA URL.

Khi khởi động, thiết bị gọi OTA, nhận `ws://<ip-may-chu>:3000/xiaozhi/v1/` rồi kết nối. Nếu thiết bị nhận sai IP (ví dụ đi qua reverse proxy), đặt `PUBLIC_WS_URL` trong `.env`.

## Chạy không dùng Docker

Tự chạy 3 dịch vụ rồi trỏ địa chỉ trong `.env`:

```bash
whisper-server --host 0.0.0.0 --port 8080 -m ggml-small.bin          # whisper.cpp
ollama serve && ollama pull qwen2.5:3b                               # Ollama
python -m piper.http_server --port 5000 -m vi_VN-vais1000-medium.onnx # pip install "piper-tts[http]"
npm install && npm run serve
```

## Tuỳ chỉnh

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `LLM_MODEL` | `qwen2.5:3b` | Model Ollama. Máy mạnh/GPU: `qwen2.5:7b`, `gemma3:4b`... |
| `LLM_URL` | `http://localhost:11434/v1` | Bất kỳ API tương thích OpenAI (llama.cpp server, LM Studio, vLLM) |
| `LLM_SYSTEM_PROMPT` | Tiểu Trí, tiếng Việt | Tính cách trợ lý |
| `WHISPER_MODEL` | `ggml-small.bin` | `ggml-base.bin` nhanh hơn, `ggml-medium.bin` chính xác hơn |
| `ASR_TYPE` | `whispercpp` | `openai` để dùng speaches / LocalAI (`/v1/audio/transcriptions`) |
| `TTS_TYPE` | `piper` | `openai` để dùng server `/v1/audio/speech` trả WAV |
| `PIPER_VOICE` | `vi_VN-vais1000-medium` | Tên giọng trong [piper-voices](https://huggingface.co/rhasspy/piper-voices) |
| `AUTH_TOKEN` | trống | Bắt thiết bị gửi `Authorization: Bearer <token>` |
| `VAD_THRESHOLD` | `500` | Ngưỡng âm lượng coi là tiếng nói; tăng nếu phòng ồn |
| `VAD_SILENCE_MS` | `800` | Im lặng bao lâu thì coi là nói xong |

Cấu hình gợi ý: CPU 4 nhân + 8 GB RAM chạy được `qwen2.5:3b` + `ggml-small`; có GPU NVIDIA thì bật phần `deploy` của dịch vụ `ollama` trong `docker-compose.yml`.

## Giới hạn hiện tại

- Chưa hỗ trợ MQTT/UDP, MCP/IoT điều khiển thiết bị, và màn hình kích hoạt (activation code).
- VAD dựa trên năng lượng âm thanh, đơn giản; môi trường ồn cần chỉnh `VAD_THRESHOLD` hoặc dùng chế độ nhấn-giữ (manual).
