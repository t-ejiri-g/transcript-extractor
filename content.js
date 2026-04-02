(function () {
  'use strict';

  let transcriptData = null;

  // Receive transcript data posted by injected.js (MAIN world)
  window.addEventListener('message', function (event) {
    if (event.source !== window) return;
    // Safe: host_permissions only match HTTPS origins (Teams, Drive) — location.origin is never "null"
    if (event.origin !== location.origin) return;
    if (event.data && event.data.type === 'TRANSCRIPT_DATA') {
      // Always overwrite with latest — the most recent response is the most complete
      transcriptData = event.data;
    }
  });

  // Receive download command from background.js
  chrome.runtime.onMessage.addListener(function (message) {
    if (message.action !== 'download') return;

    if (!transcriptData || !transcriptData.content) {
      alert('トランスクリプトが見つかりません。先に録画ページを開いてください。');
      return;
    }

    let text;
    if (transcriptData.format === 'vtt') {
      const cues = parseVTT(transcriptData.content);
      text = formatTranscript(cues);
    } else {
      // Fallback: save raw content as-is
      text = transcriptData.content;
    }

    const filename = generateFilename();
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
})();
