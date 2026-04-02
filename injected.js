(function () {
  'use strict';

  function isTranscriptUrl(url) {
    if (typeof url !== 'string') return false;
    return (
      url.includes('.vtt') ||
      url.includes('/transcript') ||
      url.includes('timedtext') ||
      url.includes('subtitles')
    );
  }

  function guessFormat(url, content) {
    if (url.includes('.vtt') || content.trimStart().startsWith('WEBVTT')) {
      return 'vtt';
    }
    try {
      const parsed = JSON.parse(content);
      if (parsed.wireMagic === 'pb3') return 'pb3';
    } catch (e) {}
    return 'unknown';
  }

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

  function emit(url, content) {
    window.postMessage(
      { type: 'TRANSCRIPT_DATA', format: guessFormat(url, content), content },
      location.origin  // Safe: host_permissions only match HTTPS origins (Teams, Drive)
    );
  }

  // --- Intercept fetch ---
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
    if (isTranscriptUrl(url)) {
      response.clone().arrayBuffer().then(async buf => {
        const content = await decodeBuffer(buf);
        emit(url, content);
      }).catch(() => {});
    }
    return response;
  };

  // --- Intercept XHR ---
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._transcriptUrl = String(url);
    this._transcriptListenerAdded = false;
    return originalOpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    if (isTranscriptUrl(this._transcriptUrl || '') && !this._transcriptListenerAdded) {
      this._transcriptListenerAdded = true;
      this.addEventListener('load', function () {
        emit(this._transcriptUrl, this.responseText);
      });
    }
    return originalSend.apply(this, args);
  };
})();
