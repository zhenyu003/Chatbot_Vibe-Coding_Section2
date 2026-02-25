const API = process.env.REACT_APP_API_URL || '';

export async function downloadChannelData(url, maxVideos = 10, onProgress) {
  const res = await fetch(`${API}/api/youtube/channel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, maxVideos }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let lastData = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        if (obj.type === 'progress' && onProgress) {
          onProgress(obj.current, obj.total);
        }
        if (obj.type === 'complete') {
          lastData = obj.data;
        }
        if (obj.type === 'error') {
          throw new Error(obj.error);
        }
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }

  if (buffer.trim()) {
    try {
      const obj = JSON.parse(buffer);
      if (obj.type === 'complete') lastData = obj.data;
      if (obj.type === 'error') throw new Error(obj.error);
    } catch (e) {
      if (!(e instanceof SyntaxError)) throw e;
    }
  }

  if (!lastData) throw new Error('No data received');
  return lastData;
}
