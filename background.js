function transcriptStorageKey(tabId) {
  return `transcriptData:${tabId}`;
}

async function saveTranscriptDataForTab(storage, tabId, data) {
  await storage.local.set({ [transcriptStorageKey(tabId)]: data });
}

async function getTranscriptDataForTab(storage, tabId) {
  const key = transcriptStorageKey(tabId);
  const result = await storage.local.get([key]);
  return result[key];
}

async function clearTranscriptDataForTab(storage, tabId) {
  await storage.local.remove(transcriptStorageKey(tabId));
}

function getSenderTabId(sender) {
  return sender && sender.tab && Number.isInteger(sender.tab.id) ? sender.tab.id : null;
}

function generateRequestId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function registerCommandHandler(chromeApi) {
  chromeApi.commands.onCommand.addListener(async function (command) {
    if (command !== 'extract-transcript') return;

    const [tab] = await chromeApi.tabs.query({ active: true, currentWindow: true });
    if (!tab || !Number.isInteger(tab.id)) return;

    chromeApi.tabs.sendMessage(tab.id, {
      action: 'download',
      requestId: generateRequestId()
    }).catch(() => {});
  });
}

function registerRuntimeHandler(chromeApi) {
  chromeApi.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    const tabId = getSenderTabId(sender);
    if (!message || !message.action || tabId == null) return false;

    if (message.action === 'saveTranscriptData') {
      saveTranscriptDataForTab(chromeApi.storage, tabId, message.data)
        .then(() => sendResponse({ ok: true }))
        .catch(error => sendResponse({ ok: false, error: String(error) }));
      return true;
    }

    if (message.action === 'getTranscriptData') {
      getTranscriptDataForTab(chromeApi.storage, tabId)
        .then(data => sendResponse({ ok: true, data }))
        .catch(error => sendResponse({ ok: false, error: String(error) }));
      return true;
    }

    if (message.action === 'clearTranscriptData') {
      clearTranscriptDataForTab(chromeApi.storage, tabId)
        .then(() => sendResponse({ ok: true }))
        .catch(error => sendResponse({ ok: false, error: String(error) }));
      return true;
    }

    return false;
  });
}

function registerTabCleanup(chromeApi) {
  if (!chromeApi.tabs.onRemoved) return;
  chromeApi.tabs.onRemoved.addListener(function (tabId) {
    clearTranscriptDataForTab(chromeApi.storage, tabId).catch(() => {});
  });
}

if (typeof chrome !== 'undefined' && chrome.commands && chrome.runtime && chrome.tabs && chrome.storage) {
  registerCommandHandler(chrome);
  registerRuntimeHandler(chrome);
  registerTabCleanup(chrome);
}

if (typeof module !== 'undefined') {
  module.exports = {
    transcriptStorageKey,
    saveTranscriptDataForTab,
    getTranscriptDataForTab,
    clearTranscriptDataForTab,
    getSenderTabId,
    generateRequestId,
    registerCommandHandler,
    registerRuntimeHandler,
    registerTabCleanup
  };
}
