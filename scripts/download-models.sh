#!/usr/bin/env bash
# Chạy MỘT LẦN khi máy còn Internet: tải image Docker và model vào ./data
# Sau đó máy chủ có thể chạy hoàn toàn offline.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] && set -a && . ./.env && set +a

WHISPER_MODEL=${WHISPER_MODEL:-ggml-small.bin}
LLM_MODEL=${LLM_MODEL:-qwen2.5:3b}
PIPER_VOICE=${PIPER_VOICE:-vi_VN-vais1000-medium}

mkdir -p data/whisper data/piper data/ollama

echo "==> Build/pull image Docker"
docker compose pull whisper ollama
docker compose build xiaozhi piper

echo "==> Whisper model: $WHISPER_MODEL"
[ -f "data/whisper/$WHISPER_MODEL" ] || curl -L --fail -o "data/whisper/$WHISPER_MODEL" \
  "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/$WHISPER_MODEL"

echo "==> Piper voice: $PIPER_VOICE"
# vi_VN-vais1000-medium -> vi/vi_VN/vais1000/medium/
IFS=- read -r LOCALE NAME QUALITY <<< "$PIPER_VOICE"
VOICE_URL="https://huggingface.co/rhasspy/piper-voices/resolve/main/${LOCALE%%_*}/$LOCALE/$NAME/$QUALITY/$PIPER_VOICE"
for ext in onnx onnx.json; do
  [ -f "data/piper/$PIPER_VOICE.$ext" ] || curl -L --fail -o "data/piper/$PIPER_VOICE.$ext" "$VOICE_URL.$ext"
done

echo "==> Ollama model: $LLM_MODEL"
docker compose up -d ollama
until docker compose exec ollama ollama list >/dev/null 2>&1; do sleep 1; done
docker compose exec ollama ollama pull "$LLM_MODEL"

echo "Xong! Chạy: docker compose up -d"
