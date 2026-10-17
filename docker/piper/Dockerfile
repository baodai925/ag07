FROM python:3.11-slim

RUN pip install --no-cache-dir "piper-tts[http]==1.8.0"

ENV PIPER_VOICE=vi_VN-vais1000-medium
WORKDIR /data
EXPOSE 5000

CMD python -m piper.http_server --host 0.0.0.0 --port 5000 --data-dir /data -m /data/${PIPER_VOICE}.onnx
