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

  function guessFormat(url) {
    return url.includes('.vtt') ? 'vtt' : 'unknown';
  }

  function emit(url, content) {
    window.postMessage(
      { type: 'TRANSCRIPT_DATA', format: guessFormat(url), content },
      '*'
    );
  }

  // --- Intercept fetch ---
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
    if (isTranscriptUrl(url)) {
      response.clone().text().then(text => emit(url, text)).catch(() => {});
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
