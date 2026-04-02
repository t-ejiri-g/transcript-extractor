(function () {
  'use strict';

  // --- Teams transcript DOM scraper ---
  // Runs inside the xplatIframe (sharepoint.com) where the transcript panel lives.
  // Selectors based on observed DOM structure:
  //   speaker:   span[class*="itemDisplayName"]
  //   timestamp: span[id^="Header-timestamp-"]
  //   text:      div[id^="sub-entry-"]
  function scrapeTeamsTranscript() {
    const results = [];
    let currentSpeaker = '';
    let currentTimestamp = '';

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_ELEMENT,
      {
        acceptNode(node) {
          const id = node.id || '';
          const cls = typeof node.className === 'string' ? node.className : '';
          if (cls.includes('itemDisplayName')) return NodeFilter.FILTER_ACCEPT;
          if (id.startsWith('Header-timestamp-')) return NodeFilter.FILTER_ACCEPT;
          if (id.startsWith('sub-entry-')) return NodeFilter.FILTER_ACCEPT;
          return NodeFilter.FILTER_SKIP;
        }
      }
    );

    let node;
    while ((node = walker.nextNode())) {
      const id = node.id || '';
      const cls = typeof node.className === 'string' ? node.className : '';
      if (cls.includes('itemDisplayName')) {
        currentSpeaker = node.textContent.trim();
      } else if (id.startsWith('Header-timestamp-')) {
        currentTimestamp = node.textContent.trim();
      } else if (id.startsWith('sub-entry-')) {
        const text = node.textContent.trim();
        if (text) results.push({ timestamp: currentTimestamp, speaker: currentSpeaker, text });
      }
    }

    return results.length > 0 ? results : null;
  }

  // --- Receive transcript from injected.js (MAIN world, network intercept) ---
  // Runs in all frames (all_frames: true)
  window.addEventListener('message', function (event) {
    if (event.source !== window) return;
    // Safe: host_permissions only match HTTPS origins (Teams, Drive) — location.origin is never "null"
    if (event.origin !== location.origin) return;
    if (event.data && event.data.type === 'TRANSCRIPT_DATA') {
      // Always overwrite with latest — the most recent response is the most complete
      chrome.storage.local.set({ transcriptData: event.data });
    }
  });

  // --- Iframe handler (Teams xplatIframe from sharepoint.com) ---
  // When download command arrives, scrape DOM and write to storage.
  // The top-level frame reads from storage 150ms later.
  if (window !== window.top) {
    chrome.runtime.onMessage.addListener(function (message) {
      if (message.action !== 'download') return;
      const cues = scrapeTeamsTranscript();
      if (!cues) return;
      // DOM-scraped content overwrites any binary network capture
      chrome.storage.local.set({
        transcriptData: { format: 'dom', content: formatTranscript(cues) }
      });
    });
    return;
  }

  // --- Top-level frame: download handler ---
  // Wait 150ms so the iframe DOM scraper can write to storage first.
  chrome.runtime.onMessage.addListener(function (message) {
    if (message.action !== 'download') return;

    setTimeout(function () {
      chrome.storage.local.get(['transcriptData'], function (result) {
        const data = result.transcriptData;
        if (!data || !data.content) {
          alert('トランスクリプトが見つかりません。先に録画ページを開いてください。');
          return;
        }

        let text;
        if (data.format === 'vtt') {
          const cues = parseVTT(data.content);
          text = formatTranscript(cues);
        } else if (data.format === 'pb3') {
          const cues = parseGoogleCaption(data.content);
          text = cues ? formatTranscript(cues) : data.content;
        } else {
          // 'dom' format or unknown: content is already formatted text
          text = data.content;
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

        chrome.storage.local.remove('transcriptData');
      });
    }, 150);
  });
})();
