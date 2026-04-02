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

function generateFilename() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  return `transcript_${date}_${time}.txt`;
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
  module.exports = { isTranscriptUrl, parseVTT, formatTranscript, generateFilename, parseGoogleCaption };
}
