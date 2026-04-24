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
      // If URL has isformatjson=true (Teams SharePoint CDN), re-fetch without it
      // to get plain VTT text instead of the binary JSON format
      if (url.includes('isformatjson=true')) {
        const vttUrl = url.replace(/([?&])isformatjson=true&?/, '$1').replace(/[?&]$/, '');
        originalFetch(vttUrl)
          .then(r => r.text())
          .then(text => { if (text) emit(vttUrl, text); })
          .catch(() => {});
      } else {
        response.clone().arrayBuffer().then(async buf => {
          const content = await decodeBuffer(buf);
          emit(url, content);
        }).catch(() => {});
      }
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
        getXhrResponseContent(this)
          .then(content => { if (content) emit(this._transcriptUrl, content); })
          .catch(() => {});
      });
    }
    return originalSend.apply(this, args);
  };
})();
