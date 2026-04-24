const {
  findTranscriptScroller,
  moveScrollerToTop,
  restoreScrollerPosition
} = require('../scroll');

function createScroller(scrollTop) {
  return {
    scrollTop,
    dispatchEvent: jest.fn()
  };
}

describe('transcript scroller helpers', () => {
  test('finds SharePoint transcript scroll containers marked as scrollable', () => {
    const scroller = createScroller(0);
    const firstEntry = {
      closest: jest.fn(selector => selector.includes('[data-is-scrollable="true"]') ? scroller : null)
    };

    expect(findTranscriptScroller(firstEntry)).toBe(scroller);
  });

  test('moves the scroller to the top before scraping', async () => {
    const scroller = createScroller(640);
    const wait = jest.fn(async () => {});

    const originalScrollTop = await moveScrollerToTop(scroller, wait);

    expect(originalScrollTop).toBe(640);
    expect(scroller.scrollTop).toBe(0);
    expect(scroller.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'scroll' })
    );
    expect(wait).toHaveBeenCalledTimes(1);
  });

  test('restores the original scroll position after scraping', async () => {
    const scroller = createScroller(0);
    const wait = jest.fn(async () => {});

    await restoreScrollerPosition(scroller, 640, wait);

    expect(scroller.scrollTop).toBe(640);
    expect(scroller.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'scroll' })
    );
    expect(wait).toHaveBeenCalledTimes(1);
  });
});
