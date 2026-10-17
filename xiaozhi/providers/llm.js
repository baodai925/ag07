// Gọi LLM qua API Chat Completions tương thích OpenAI (stream), trả về từng đoạn text
async function* chatStream(config, messages, signal) {
  const res = await fetch(`${config.url.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({ model: config.model, messages, stream: true }),
    signal,
  });
  if (!res.ok) throw new Error(`LLM lỗi ${res.status}: ${await res.text()}`);

  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') return;
      const delta = JSON.parse(payload).choices?.[0]?.delta?.content;
      if (delta) yield delta;
    }
  }
}

module.exports = { chatStream };
