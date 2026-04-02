const { parseVTT, formatTranscript, generateFilename, isTranscriptUrl } = require('../parser');

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
});
