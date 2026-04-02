(function () {
  'use strict';

  // --- Teams transcript DOM scraper (with auto-scroll for virtualized list) ---
  async function scrapeTeamsTranscript() {
    const results = [];
    let currentSpeaker = '';
    let currentTimestamp = '';

    // Find scrollable container to trigger virtual item loading
    const firstEntry = document.querySelector('[id^="sub-entry-"]');
    if (firstEntry) {
      let container = firstEntry.parentElement;
      while (container && container !== document.body) {
        const { overflowY, overflow } = window.getComputedStyle(container);
        if (overflowY === 'auto' || overflowY === 'scroll' ||
            overflow === 'auto' || overflow === 'scroll') break;
        container = container.parentElement;
      }
      const scroller = (container && container !== document.body) ? container : null;

      if (scroller) {
const pageSize = scroller.clientHeight || 300;
        let prevScrollTop = -1;
        for (let i = 0; i < 500; i++) {
          scroller.scrollTop += pageSize;
          await new Promise(r => setTimeout(r, 200));
          // Stop when scroll position no longer advances (reached physical bottom)
          if (scroller.scrollTop === prevScrollTop) break;
          prevScrollTop = scroller.scrollTop;
        }
      }
    }

    // Scrape the fully-loaded DOM
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
  window.addEventListener('message', function (event) {
    if (event.source !== window) return;
    // Safe: host_permissions only match HTTPS origins (Teams, Drive) — location.origin is never "null"
    if (event.origin !== location.origin) return;
    if (event.data && event.data.type === 'TRANSCRIPT_DATA') {
      // Skip unrecognized binary (format: 'unknown') — only save parseable formats
      if (event.data.format !== 'unknown') {
        chrome.storage.local.set({ transcriptData: event.data });
      }
    }
  });

  // --- Iframe handler (Teams xplatIframe from sharepoint.com) ---
  // When download command arrives, scroll to load all virtual items, then scrape DOM.
  if (window !== window.top) {
    chrome.runtime.onMessage.addListener(function (message) {
      if (message.action !== 'download') return;
      scrapeTeamsTranscript().then(function (cues) {
        if (!cues) return;
        // DOM-scraped content overwrites any binary network capture
        chrome.storage.local.set({
          transcriptData: { format: 'dom', content: formatTranscript(cues) }
        });
      });
    });
    return;
  }

  // --- Top-level frame: download handler ---
  chrome.runtime.onMessage.addListener(function (message) {
    if (message.action !== 'download') return;

    // Check for network-captured data first (e.g. Google Drive already loaded)
    chrome.storage.local.get(['transcriptData'], function (result) {
      if (result.transcriptData && result.transcriptData.content) {
        // Use existing data immediately (network intercept path)
        triggerDownload(result.transcriptData);
        chrome.storage.local.remove('transcriptData');
        return;
      }

      // No network data — poll for iframe DOM scrape result (Teams)
      let attempts = 0;
      const poll = setInterval(function () {
        attempts++;
        chrome.storage.local.get(['transcriptData'], function (r) {
          if (r.transcriptData && r.transcriptData.content) {
            clearInterval(poll);
            triggerDownload(r.transcriptData);
            chrome.storage.local.remove('transcriptData');
          } else if (attempts > 120) {
            clearInterval(poll);
            alert('トランスクリプトが見つかりません。先に録画ページを開いてください。');
          }
        });
      }, 500);
    });
  });

  function triggerDownload(data) {
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
  }
})();
