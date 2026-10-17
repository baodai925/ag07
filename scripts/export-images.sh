#!/usr/bin/env bash
# Đóng gói image Docker để chép sang máy chủ không có Internet.
# Trên máy offline: docker load -i xiaozhi-images.tar
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose pull whisper ollama
docker compose build
docker save -o xiaozhi-images.tar $(docker compose config --images)
echo "Đã tạo xiaozhi-images.tar — chép cùng thư mục dự án (kèm ./data) sang máy offline."
