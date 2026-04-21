const {
  attachRequestId,
  hasMatchingRequestId,
  isImmediateTranscriptData
} = require('../session');

describe('transcript request sessions', () => {
  test('attaches the current request id to scraped transcript data', () => {
    expect(attachRequestId({ format: 'dom', content: 'fresh' }, 'request-1')).toEqual({
      format: 'dom',
      content: 'fresh',
      requestId: 'request-1'
    });
  });

  test('accepts only transcript data from the current DOM scrape request', () => {
    expect(hasMatchingRequestId({
      format: 'dom',
      content: 'old',
      requestId: 'request-1'
    }, 'request-2')).toBe(false);

    expect(hasMatchingRequestId({
      format: 'dom',
      content: 'fresh',
      requestId: 'request-2'
    }, 'request-2')).toBe(true);
  });

  test('uses pre-captured network transcript data immediately', () => {
    expect(isImmediateTranscriptData({ format: 'vtt', content: 'WEBVTT' })).toBe(true);
    expect(isImmediateTranscriptData({ format: 'pb3', content: '{"wireMagic":"pb3"}' })).toBe(true);
    expect(isImmediateTranscriptData({ format: 'dom', content: 'stale scrape' })).toBe(false);
  });
});
