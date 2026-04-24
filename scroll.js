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
    moveScrollerToTop,
    restoreScrollerPosition
  };
}
