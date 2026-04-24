async function decodeBuffer(buffer) {
  const bytes = new Uint8Array(buffer);
  // If gzip magic bytes (1f 8b), decompress first
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    try {
      const ds = new DecompressionStream('gzip');
      const writer = ds.writable.getWriter();
      writer.write(bytes);
      writer.close();
      const chunks = [];
      const reader = ds.readable.getReader();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      const total = chunks.reduce((n, c) => n + c.length, 0);
      const merged = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) { merged.set(c, off); off += c.length; }
      return new TextDecoder().decode(merged);
    } catch (e) { /* fall through to plain decode */ }
  }
  return new TextDecoder().decode(bytes);
}

async function getXhrResponseContent(xhr) {
  const responseType = xhr.responseType || '';

  if (responseType === '' || responseType === 'text') {
    return xhr.responseText;
  }

  if (responseType === 'arraybuffer') {
    return xhr.response ? decodeBuffer(xhr.response) : null;
  }

  if (responseType === 'blob') {
    if (!xhr.response || typeof xhr.response.arrayBuffer !== 'function') return null;
    return decodeBuffer(await xhr.response.arrayBuffer());
  }

  if (responseType === 'json') {
    if (xhr.response == null) return null;
    return typeof xhr.response === 'string' ? xhr.response : JSON.stringify(xhr.response);
  }

  return null;
}

if (typeof module !== 'undefined') {
  module.exports = {
    decodeBuffer,
    getXhrResponseContent
  };
}
