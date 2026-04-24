function createScrollEvent() {
  if (typeof Event === 'function') {
    return new Event('scroll', { bubbles: true });
  }
  return { type: 'scroll', bubbles: true };
}

function dispatchScroll(scroller) {
  if (scroller && typeof scroller.dispatchEvent === 'function') {
    scroller.dispatchEvent(createScrollEvent());
  }
}

function findTranscriptScroller(firstEntry, getComputedStyleFn) {
  if (!firstEntry) return null;

  if (typeof firstEntry.closest === 'function') {
    const explicitScroller = firstEntry.closest('[data-is-scrollable="true"], [data-testid="scroll-to-target-targeted-focus-zone"], #scrollToTargetTargetedFocusZone');
    if (explicitScroller) return explicitScroller;
  }

  const getStyle = getComputedStyleFn || (typeof window !== 'undefined' ? window.getComputedStyle : null);
  if (typeof getStyle !== 'function') return null;

  const body = (firstEntry.ownerDocument && firstEntry.ownerDocument.body) ||
    (typeof document !== 'undefined' ? document.body : null);

  let container = firstEntry.parentElement;
  while (container && container !== body) {
    const { overflowY, overflow } = getStyle(container);
    if (overflowY === 'auto' || overflowY === 'scroll' ||
        overflow === 'auto' || overflow === 'scroll') return container;
    container = container.parentElement;
  }

  return null;
}

async function moveScrollerToTop(scroller, waitForScroll) {
  if (!scroller) return 0;
  const originalScrollTop = Number.isFinite(scroller.scrollTop) ? scroller.scrollTop : 0;
  if (originalScrollTop === 0) return originalScrollTop;

  scroller.scrollTop = 0;
  dispatchScroll(scroller);
  if (typeof waitForScroll === 'function') {
    await waitForScroll();
  }
  return originalScrollTop;
}

async function restoreScrollerPosition(scroller, scrollTop, waitForScroll) {
  if (!scroller || !Number.isFinite(scrollTop) || scroller.scrollTop === scrollTop) return;

  scroller.scrollTop = scrollTop;
  dispatchScroll(scroller);
  if (typeof waitForScroll === 'function') {
    await waitForScroll();
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    createScrollEvent,
    dispatchScroll,
    findTranscriptScroller,
    moveScrollerToTop,
    restoreScrollerPosition
  };
}
