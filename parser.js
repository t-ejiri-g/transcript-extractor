function isTranscriptUrl(url) {
  if (typeof url !== 'string') return false;
  return (
    url.includes('.vtt') ||
    url.includes('/transcript') ||
    url.includes('timedtext') ||
    url.includes('subtitles')
  );
}

function parseVTT(rawText) {
  const lines = rawText.replace(/\r\n/g, '\n').split('\n');
  const results = [];
  let i = 0;

  // Skip past WEBVTT header and any initial non-cue lines
  while (i < lines.length && !lines[i].includes('-->')) {
    i++;
  }

  while (i < lines.length) {
    const line = lines[i].trim();
    if (line.includes('-->')) {
      // Extract start timestamp only, strip milliseconds
      const startRaw = line.split('-->')[0].trim();
      const timestamp = startRaw.replace(/\.\d+$/, '');
      i++;

      // Collect cue text lines until blank line or end
      const cueLines = [];
      while (i < lines.length && lines[i].trim() !== '') {
        cueLines.push(lines[i].trim());
        i++;
      }

      const rawCue = cueLines.join(' ');
      const speakerMatch = rawCue.match(/<v\s+([^>]+)>/);
      const speaker = speakerMatch ? speakerMatch[1].trim() : null;
      const text = rawCue.replace(/<[^>]+>/g, '').trim();

      if (text) {
        results.push({ timestamp, speaker, text });
      }
    } else {
      i++;
    }
  }

  return results;
}

function formatTranscript(cues) {
  return cues
    .map(({ timestamp, speaker, text }) =>
      speaker ? `${timestamp} ${speaker}: ${text}` : `${timestamp}: ${text}`
    )
    .join('\n');
}

function sanitizeFilenamePart(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, ' __filename_separator__ ')
    .replace(/\s+/g, ' ')
    .replace(/\s*__filename_separator__\s*/g, ' - ')
    .replace(/(?: - )+/g, ' - ')
    .replace(/^[ .-]+|[ .-]+$/g, '')
    .slice(0, 120)
    .replace(/[ .-]+$/g, '');
}

function generateFilename(meetingTitle) {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const prefix = sanitizeFilenamePart(meetingTitle) || 'transcript';
  return `${prefix}_${date}_${time}.txt`;
}

function getElementAttribute(element, name) {
  if (!element) return '';
  if (typeof element.getAttribute === 'function') {
    return element.getAttribute(name) || '';
  }
  return element[name] || '';
}

function isVisibleElement(element) {
  if (!element || typeof element.getClientRects !== 'function') return true;
  return element.getClientRects().length > 0;
}

function selectMeetingTitleFromElements(elements) {
  const candidates = Array.from(elements || [])
    .map((element, index) => {
      const title = getElementAttribute(element, 'title').trim();
      const text = (element.textContent || '').trim();
      if (!title || (text && text !== title)) return null;
      return {
        title,
        index,
        score: (isVisibleElement(element) ? 1000 : 0) + Math.min(title.length, 200)
      };
    })
    .filter(Boolean);

  candidates.sort((a, b) => b.score - a.score || a.index - b.index);
  return candidates.length > 0 ? candidates[0].title : '';
}

function extractMeetingTitle(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return '';
  return selectMeetingTitleFromElements(root.querySelectorAll('span[dir="auto"][title]'));
}

// Parse Google Drive caption format (wireMagic: "pb3")
function parseGoogleCaption(jsonText) {
  try {
    const data = JSON.parse(jsonText);
    if (data.wireMagic !== 'pb3') return null;
    const pad = n => String(n).padStart(2, '0');
    return (data.events || [])
      .filter(ev => ev.segs && ev.tStartMs != null)
      .map(ev => {
        const ms = ev.tStartMs;
        const timestamp = `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor((ms % 3600000) / 60000))}:${pad(Math.floor((ms % 60000) / 1000))}`;
        const text = (ev.segs || []).map(seg => seg.utf8 || '').join('').trim();
        return text ? { timestamp, speaker: null, text } : null;
      })
      .filter(Boolean);
  } catch (e) {
    return null;
  }
}

// Export for Node.js tests; no-op in browser (global scope)
if (typeof module !== 'undefined') {
  module.exports = {
    isTranscriptUrl,
    parseVTT,
    formatTranscript,
    sanitizeFilenamePart,
    generateFilename,
    selectMeetingTitleFromElements,
    extractMeetingTitle,
    parseGoogleCaption
  };
}
