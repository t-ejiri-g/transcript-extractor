const {
  decodeBuffer,
  getXhrResponseContent
} = require('../injected-helpers');

describe('decodeBuffer', () => {
  test('decodes plain ArrayBuffer as text', async () => {
    const buffer = new TextEncoder().encode('WEBVTT\nhello').buffer;

    await expect(decodeBuffer(buffer)).resolves.toBe('WEBVTT\nhello');
  });
});

describe('getXhrResponseContent', () => {
  test('uses responseText for text responses', async () => {
    await expect(getXhrResponseContent({
      responseType: '',
      responseText: 'WEBVTT\ntext'
    })).resolves.toBe('WEBVTT\ntext');
  });

  test('decodes arraybuffer responses', async () => {
    await expect(getXhrResponseContent({
      responseType: 'arraybuffer',
      response: new TextEncoder().encode('WEBVTT\narraybuffer').buffer
    })).resolves.toBe('WEBVTT\narraybuffer');
  });

  test('decodes blob responses', async () => {
    await expect(getXhrResponseContent({
      responseType: 'blob',
      response: new Blob(['WEBVTT\nblob'])
    })).resolves.toBe('WEBVTT\nblob');
  });

  test('stringifies json responses', async () => {
    await expect(getXhrResponseContent({
      responseType: 'json',
      response: { wireMagic: 'pb3', events: [] }
    })).resolves.toBe('{"wireMagic":"pb3","events":[]}');
  });

  test('returns null for unsupported response types', async () => {
    await expect(getXhrResponseContent({
      responseType: 'document',
      response: {}
    })).resolves.toBeNull();
  });
});
