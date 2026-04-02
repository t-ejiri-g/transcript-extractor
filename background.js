chrome.commands.onCommand.addListener(async function (command) {
  if (command !== 'extract-transcript') return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  chrome.tabs.sendMessage(tab.id, { action: 'download' }).catch(() => {});
});
