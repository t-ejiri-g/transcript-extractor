const {
  parseVTT,
  formatTranscript,
  generateFilename,
  isTranscriptUrl,
  selectMeetingTitleFromElements,
  extractMeetingTitle,
  parseTranscriptAriaLabel,
  hasTranscriptContent
} = require('../parser');

describe('isTranscriptUrl', () => {
  test('matches .vtt extension', () => {
    expect(isTranscriptUrl('https://example.com/meeting.vtt')).toBe(true);
  });

  test('matches /transcript in path', () => {
    expect(isTranscriptUrl('https://api.teams.microsoft.com/v1/transcript/abc')).toBe(true);
  });

  test('matches timedtext (Google Drive)', () => {
    expect(isTranscriptUrl('https://docs.google.com/timedtext?id=abc')).toBe(true);
  });

  test('matches subtitles in URL', () => {
    expect(isTranscriptUrl('https://example.com/subtitles/en.json')).toBe(true);
  });

  test('does not match unrelated URL', () => {
    expect(isTranscriptUrl('https://drive.google.com/file/d/abc/view')).toBe(false);
  });

  test('returns false for non-string input', () => {
    expect(isTranscriptUrl(null)).toBe(false);
    expect(isTranscriptUrl(undefined)).toBe(false);
  });
});

describe('parseVTT', () => {
  test('parses cue with speaker tag', () => {
    const vtt = `WEBVTT

00:01:23.000 --> 00:01:27.000
<v 田中>こんにちは

`;
    const result = parseVTT(vtt);
    expect(result).toEqual([
      { timestamp: '00:01:23', speaker: '田中', text: 'こんにちは' }
    ]);
  });

  test('parses cue without speaker tag', () => {
    const vtt = `WEBVTT

00:00:05.000 --> 00:00:08.000
Hello world

`;
    const result = parseVTT(vtt);
    expect(result).toEqual([
      { timestamp: '00:00:05', speaker: null, text: 'Hello world' }
    ]);
  });

  test('strips milliseconds from timestamp', () => {
    const vtt = `WEBVTT

00:59:59.999 --> 01:00:01.000
Text

`;
    const result = parseVTT(vtt);
    expect(result[0].timestamp).toBe('00:59:59');
  });

  test('strips HTML tags from cue text', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:02.000
<v Alice><b>Hello</b> <i>world</i>

`;
    const result = parseVTT(vtt);
    expect(result[0].text).toBe('Hello world');
    expect(result[0].speaker).toBe('Alice');
  });

  test('parses multiple cues', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:02.000
<v Alice>First

00:00:03.000 --> 00:00:04.000
<v Bob>Second

`;
    const result = parseVTT(vtt);
    expect(result).toHaveLength(2);
    expect(result[0].speaker).toBe('Alice');
    expect(result[1].speaker).toBe('Bob');
  });

  test('ignores empty input', () => {
    expect(parseVTT('')).toEqual([]);
    expect(parseVTT('WEBVTT\n\n')).toEqual([]);
  });

  test('handles CRLF line endings', () => {
    const vtt = "WEBVTT\r\n\r\n00:00:01.000 --> 00:00:02.000\r\n<v Alice>Hello\r\n\r\n";
    const result = parseVTT(vtt);
    expect(result).toEqual([{ timestamp: '00:00:01', speaker: 'Alice', text: 'Hello' }]);
  });
});

describe('formatTranscript', () => {
  test('formats cue with speaker', () => {
    const cues = [{ timestamp: '00:01:23', speaker: '田中', text: 'こんにちは' }];
    expect(formatTranscript(cues)).toBe('00:01:23 田中: こんにちは');
  });

  test('formats cue without speaker', () => {
    const cues = [{ timestamp: '00:00:05', speaker: null, text: 'Hello' }];
    expect(formatTranscript(cues)).toBe('00:00:05: Hello');
  });

  test('joins multiple lines with newline', () => {
    const cues = [
      { timestamp: '00:00:01', speaker: 'A', text: 'First' },
      { timestamp: '00:00:02', speaker: 'B', text: 'Second' }
    ];
    expect(formatTranscript(cues)).toBe('00:00:01 A: First\n00:00:02 B: Second');
  });
});

describe('generateFilename', () => {
  test('returns filename with expected format', () => {
    const filename = generateFilename();
    expect(filename).toMatch(/^transcript_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.txt$/);
  });

  test('prefixes the timestamp with a sanitized meeting title', () => {
    const filename = generateFilename('【MTG】PAIM：KR1-1 成立定義書の「問いの立て方と論点設計」について');
    expect(filename).toMatch(/^【MTG】PAIM：KR1-1 成立定義書の「問いの立て方と論点設計」について_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.txt$/);
  });

  test('removes characters that are unsafe in downloaded filenames', () => {
    const filename = generateFilename('Weekly / Project: Plan * Review?');
    expect(filename).toMatch(/^Weekly - Project - Plan - Review_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.txt$/);
  });
});

describe('selectMeetingTitleFromElements', () => {
  function span({ title, text = title, rects = [{}] }) {
    return {
      textContent: text,
      getAttribute: name => (name === 'title' ? title : null),
      getClientRects: () => rects
    };
  }

  test('extracts the title from a matching Teams title span', () => {
    const title = '【MTG】PAIM：KR1-1 成立定義書の「問いの立て方と論点設計」について';
    expect(selectMeetingTitleFromElements([span({ title })])).toBe(title);
  });

  test('ignores tooltip-only title attributes whose text does not match', () => {
    expect(selectMeetingTitleFromElements([
      span({ title: 'Open in new window', text: 'Open' }),
      span({ title: 'Team Weekly', text: 'Team Weekly' })
    ])).toBe('Team Weekly');
  });

  test('prefers a visible matching element when hidden candidates appear first', () => {
    expect(selectMeetingTitleFromElements([
      span({ title: 'Hidden stale title', rects: [] }),
      span({ title: 'Visible meeting title' })
    ])).toBe('Visible meeting title');
  });
});

describe('extractMeetingTitle', () => {
  test('extracts the SharePoint document title text', () => {
    const root = {
      querySelectorAll: selector => {
        if (selector === 'span[data-unique-id="DocumentTitleContent"]') {
          return [{ textContent: '【MTG】PAIM：KR1-1 成立定義書の「問いの立て方と論点設計」について-20260424_123019-会議の録音' }];
        }
        return [];
      }
    };

    expect(extractMeetingTitle(root)).toBe('【MTG】PAIM：KR1-1 成立定義書の「問いの立て方と論点設計」について-20260424_123019-会議の録音');
  });
});

describe('parseTranscriptAriaLabel', () => {
  test('extracts speaker and timestamp from SharePoint transcript aria label', () => {
    expect(parseTranscriptAriaLabel('江尻 登志王民 0 分間 4 秒間')).toEqual({
      speaker: '江尻 登志王民',
      timestamp: '0:04'
    });
  });

  test('handles hour duration labels', () => {
    expect(parseTranscriptAriaLabel('竹下 貴之 1 時間 2 分間 3 秒間')).toEqual({
      speaker: '竹下 貴之',
      timestamp: '1:02:03'
    });
  });
});

describe('hasTranscriptContent', () => {
  test('detects SharePoint transcript entries', () => {
    const root = {
      querySelector: selector => selector === '[id^="sub-entry-"]' ? {} : null
    };

    expect(hasTranscriptContent(root)).toBe(true);
  });
});
