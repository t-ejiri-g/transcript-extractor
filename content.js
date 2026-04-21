(function () {
  'use strict';

  function sendBackgroundMessage(message) {
    return new Promise(resolve => {
      chrome.runtime.sendMessage(message, response => {
        if (chrome.runtime.lastError) {
          console.warn('[TE] background message failed:', chrome.runtime.lastError.message);
          resolve(null);
          return;
        }
        resolve(response || null);
      });
    });
  }

  function saveTranscriptData(data) {
    return sendBackgroundMessage({ action: 'saveTranscriptData', data });
  }

  async function getTranscriptData() {
    const response = await sendBackgroundMessage({ action: 'getTranscriptData' });
    return response && response.data;
  }

  function clearTranscriptData() {
    return sendBackgroundMessage({ action: 'clearTranscriptData' });
  }

  // --- Teams transcript DOM scraper (with auto-scroll for virtualized list) ---
  async function scrapeTeamsTranscript() {
    // Use a Map keyed by sub-entry element ID for deduplication.
    // JS Maps preserve insertion order, so items added earlier (smaller scrollTop)
    // appear first — which matches the transcript's chronological order.
    const itemMap = new Map();

    // Track the last known good timestamp and speaker.
    // Fallback when the virtualized list doesn't render the header for a group.
    let lastTimestamp = '';
    let lastSpeaker = '';

    // Extract numeric suffix from element id (e.g. "listItem-585" → 585)
    function idNum(el) {
      const m = el && el.id && el.id.match(/(\d+)$/);
      return m ? parseInt(m[1], 10) : -1;
    }

    function collectVisible() {
      const entries = document.querySelectorAll('[id^="sub-entry-"]');
      for (const entry of entries) {
        if (itemMap.has(entry.id)) continue;
        const text = entry.textContent.trim();
        if (!text) continue;

        // Find the listItem container for this entry
        const listItem = entry.closest('[id^="listItem-"]');
        let tsNode = null, spNode = null;

        if (listItem) {
          // 1) Look inside this listItem first
          tsNode = listItem.querySelector('[id^="Header-timestamp-"]');
          spNode = listItem.querySelector('[class*="itemDisplayName"]');

          // 2) Walk backward through preceding listItem siblings,
          //    but only nearby ones (skip items far away in transcript order
          //    which the virtualized list keeps pinned, e.g. listItem-1).
          const myNum = idNum(listItem);
          let prev = listItem.previousElementSibling;
          while (prev && (!tsNode || !spNode)) {
            const prevNum = idNum(prev);
            // Stop if this sibling is far away in transcript order
            if (prevNum >= 0 && myNum - prevNum > 50) break;
            if (!tsNode) {
              tsNode = prev.querySelector('[id^="Header-timestamp-"]');
            }
            if (!spNode) {
              spNode = prev.querySelector('[class*="itemDisplayName"]');
            }
            prev = prev.previousElementSibling;
          }
        }

        const timestamp = tsNode ? tsNode.textContent.trim() : lastTimestamp;
        const speaker = spNode ? spNode.textContent.trim() : lastSpeaker;

        // Update last known good values
        if (tsNode) lastTimestamp = timestamp;
        if (spNode) lastSpeaker = speaker;

        itemMap.set(entry.id, { timestamp, speaker, text });
      }
    }

    // Find scrollable container
    const firstEntry = document.querySelector('[id^="sub-entry-"]');
    if (!firstEntry) return null;

    let container = firstEntry.parentElement;
    while (container && container !== document.body) {
      const { overflowY, overflow } = window.getComputedStyle(container);
      if (overflowY === 'auto' || overflowY === 'scroll' ||
          overflow === 'auto' || overflow === 'scroll') break;
      container = container.parentElement;
    }
    const scroller = (container && container !== document.body) ? container : null;
    console.log('[TE] scroller.clientHeight:', scroller ? scroller.clientHeight : 'N/A',
                '/ scrollHeight:', scroller ? scroller.scrollHeight : 'N/A');

    // Collect items currently visible before any scrolling
    collectVisible();
    console.log('[TE] initial collect:', itemMap.size, 'items');

    if (scroller && !scroller._scraping) {
      scroller._scraping = true;
      try {
        const pageSize = scroller.clientHeight || 300;
        let prevScrollTop = -1;
        let stuckCount = 0;
        let maxScrollTop = 0;  // track furthest position reached
        for (let i = 0; i < 1000; i++) {
          scroller.scrollTop += pageSize;
          scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
          await new Promise(r => setTimeout(r, 400));
          const currentScrollTop = scroller.scrollTop;

          // Detect virtualized list reset (scrollTop jumped backwards)
          if (currentScrollTop < maxScrollTop - pageSize) {
            console.log('[TE] step', i, '- scroll reset detected (scrollTop:', currentScrollTop,
                        '< maxScrollTop:', maxScrollTop, '), jumping ahead');
            scroller.scrollTop = maxScrollTop;
            scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
            await new Promise(r => setTimeout(r, 400));
            // Continue from where we left off — skip collecting on reset step
            prevScrollTop = scroller.scrollTop;
            if (scroller.scrollTop > maxScrollTop) maxScrollTop = scroller.scrollTop;
            continue;
          }

          if (currentScrollTop > maxScrollTop) maxScrollTop = currentScrollTop;
          collectVisible();
          console.log('[TE] step', i, '- scrollTop:', currentScrollTop, '/ collected:', itemMap.size);
          if (currentScrollTop === prevScrollTop) {
            stuckCount++;
            if (stuckCount >= 3) {
              console.log('[TE] scroll reached bottom at step', i);
              break;
            }
          } else {
            stuckCount = 0;
          }
          prevScrollTop = currentScrollTop;
        }
      } finally {
        scroller._scraping = false;
        console.log('[TE] done. Total collected:', itemMap.size);
      }
    }

    const results = Array.from(itemMap.values());
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
        saveTranscriptData(event.data);
      }
    }
  });

  // --- Iframe handler (Teams xplatIframe from sharepoint.com) ---
  // When download command arrives, scroll to load all virtual items, then scrape DOM.
  if (window !== window.top) {
    chrome.runtime.onMessage.addListener(function (message) {
      if (message.action !== 'download') return;
      const requestId = message.requestId;
      // Only act in the iframe that actually contains transcript items.
      // Other iframes (e.g. nav, sidebar) will have no sub-entry-* elements and should be skipped.
      if (!document.querySelector('[id^="sub-entry-"]') && !document.querySelector('[class*="itemDisplayName"]')) {
        console.log('[TE] iframe has no transcript content, skipping');
        return;
      }
      console.log('[TE] transcript iframe handling download command');
      scrapeTeamsTranscript().then(function (cues) {
        if (!cues) return;
        // DOM-scraped content overwrites any network capture
        saveTranscriptData(attachRequestId({
          format: 'dom',
          content: formatTranscript(cues)
        }, requestId));
      }).catch(function (err) {
        console.error('[TE] scrapeTeamsTranscript error:', err);
      });
    });
    return;
  }

  // --- Top-level frame: download handler ---
  chrome.runtime.onMessage.addListener(function (message) {
    if (message.action !== 'download') return;
    const requestId = message.requestId;

    // Only use pre-existing network-captured data (pb3/vtt) immediately.
    // 'dom' format is from a previous scrape — ignore it and wait for a fresh one.
    getTranscriptData().then(function (existing) {
      if (isImmediateTranscriptData(existing)) {
        triggerDownload(existing);
        clearTranscriptData();
        return;
      }

      // Stale DOM data may exist from an earlier scrape. Keep it in place and
      // only accept data produced for this download request.
      let attempts = 0;
      const poll = setInterval(function () {
        attempts++;
        getTranscriptData().then(function (transcriptData) {
          if (hasMatchingRequestId(transcriptData, requestId)) {
            clearInterval(poll);
            triggerDownload(transcriptData);
            clearTranscriptData();
          } else if (attempts > 240) {
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
      // 'dom' format: content is already formatted text
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
