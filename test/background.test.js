function createStorage() {
  const values = {};
  return {
    values,
    local: {
      get: jest.fn(async keys => {
        if (Array.isArray(keys)) {
          return keys.reduce((result, key) => {
            result[key] = values[key];
            return result;
          }, {});
        }
        return { [keys]: values[keys] };
      }),
      set: jest.fn(async update => {
        Object.assign(values, update);
      }),
      remove: jest.fn(async keys => {
        for (const key of [].concat(keys)) {
          delete values[key];
        }
      })
    }
  };
}

function loadBackground() {
  jest.resetModules();
  global.chrome = {
    commands: { onCommand: { addListener: jest.fn() } },
    runtime: { onMessage: { addListener: jest.fn() } },
    tabs: {
      query: jest.fn(),
      sendMessage: jest.fn(),
      onRemoved: { addListener: jest.fn() }
    }
  };
  return require('../background');
}

afterEach(() => {
  delete global.chrome;
});

describe('tab-scoped transcript storage', () => {
  test('download command sends a unique request id to the active tab', async () => {
    const { registerCommandHandler } = loadBackground();
    let commandListener;
    const chromeApi = {
      commands: {
        onCommand: {
          addListener: jest.fn(fn => {
            commandListener = fn;
          })
        }
      },
      tabs: {
        query: jest.fn(async () => [{ id: 101 }]),
        sendMessage: jest.fn(async () => {})
      }
    };

    registerCommandHandler(chromeApi);

    await commandListener('extract-transcript');

    expect(chromeApi.tabs.sendMessage).toHaveBeenCalledWith(101, {
      action: 'download',
      requestId: expect.any(String)
    });
  });

  test('stores and reads transcript data by tab id', async () => {
    const {
      saveTranscriptDataForTab,
      getTranscriptDataForTab,
      transcriptStorageKey
    } = loadBackground();
    const storage = createStorage();

    await saveTranscriptDataForTab(storage, 101, { format: 'vtt', content: 'first tab' });
    await saveTranscriptDataForTab(storage, 202, { format: 'vtt', content: 'second tab' });

    expect(transcriptStorageKey(101)).toBe('transcriptData:101');
    expect(await getTranscriptDataForTab(storage, 101)).toEqual({
      format: 'vtt',
      content: 'first tab'
    });
    expect(await getTranscriptDataForTab(storage, 202)).toEqual({
      format: 'vtt',
      content: 'second tab'
    });
  });

  test('clears only the requested tab transcript data', async () => {
    const {
      saveTranscriptDataForTab,
      getTranscriptDataForTab,
      clearTranscriptDataForTab
    } = loadBackground();
    const storage = createStorage();

    await saveTranscriptDataForTab(storage, 101, { format: 'vtt', content: 'first tab' });
    await saveTranscriptDataForTab(storage, 202, { format: 'vtt', content: 'second tab' });

    await clearTranscriptDataForTab(storage, 101);

    expect(await getTranscriptDataForTab(storage, 101)).toBeUndefined();
    expect(await getTranscriptDataForTab(storage, 202)).toEqual({
      format: 'vtt',
      content: 'second tab'
    });
  });

  test('runtime messages are scoped to sender tab id', async () => {
    const { registerRuntimeHandler } = loadBackground();
    const storage = createStorage();
    let listener;
    const chromeApi = {
      storage,
      runtime: {
        onMessage: {
          addListener: jest.fn(fn => {
            listener = fn;
          })
        }
      }
    };
    const sendMessage = (message, tabId) => new Promise(resolve => {
      listener(message, { tab: { id: tabId } }, resolve);
    });

    registerRuntimeHandler(chromeApi);

    await sendMessage({ action: 'saveTranscriptData', data: { content: 'first tab' } }, 101);
    await sendMessage({ action: 'saveTranscriptData', data: { content: 'second tab' } }, 202);

    await expect(sendMessage({ action: 'getTranscriptData' }, 101)).resolves.toEqual({
      ok: true,
      data: { content: 'first tab' }
    });
    await expect(sendMessage({ action: 'getTranscriptData' }, 202)).resolves.toEqual({
      ok: true,
      data: { content: 'second tab' }
    });
  });
});
