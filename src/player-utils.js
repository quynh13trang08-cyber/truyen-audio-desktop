'use strict';

const PlayerUtils = (() => {
  function chapterIndexAt(chapters, position) {
    if (!Array.isArray(chapters) || !chapters.length) return 0;
    let index = 0;
    for (let i = 0; i < chapters.length; i++) {
      if (Number(chapters[i].start) <= Number(position)) index = i;
      else break;
    }
    return index;
  }

  function chapterRange(chapters, index, contentLength) {
    const safeIndex = Math.max(0, Math.min(Number(index) || 0, (chapters || []).length - 1));
    const chapter = chapters?.[safeIndex] || { title: 'Toàn bộ truyện', start: 0 };
    return {
      index: safeIndex,
      title: chapter.title || 'Chương hiện tại',
      start: Math.max(0, Number(chapter.start) || 0),
      end: Number(chapters?.[safeIndex + 1]?.start ?? contentLength) || 0
    };
  }

  function estimateCharacterOffset(seconds, rate = 1, charsPerSecond = 12.5) {
    const amount = Number(seconds) || 0;
    const speed = Math.max(0.1, Number(rate) || 1);
    return Math.round(amount * charsPerSecond * speed);
  }

  function estimateCloudPosition(segment, currentTime, deltaSeconds, playbackRate = 1) {
    const duration = Number(segment?.duration);
    const length = Number(segment?.length);
    if (!segment || !Number.isFinite(duration) || duration <= 0 || !Number.isFinite(length) || length < 0) {
      return Math.max(0, Number(segment?.start) || 0);
    }
    const rate = Math.max(0.1, Number(playbackRate) || 1);
    const targetTime = (Number(currentTime) || 0) + (Number(deltaSeconds) || 0) * rate;
    return Math.max(0, Math.round((Number(segment.start) || 0) + length * (targetTime / duration)));
  }

  function normalizeQueue(queue, library) {
    const ids = new Set((Array.isArray(library) ? library : []).map(story => story?.id));
    return (Array.isArray(queue) ? queue : []).filter(item => item && ids.has(item.storyId)
      && Number.isFinite(Number(item.chapterStart)) && typeof item.chapterTitle === 'string')
      .map(item => ({ storyId: item.storyId, chapterStart: Number(item.chapterStart), chapterTitle: item.chapterTitle }));
  }

  function queueKey(item) {
    return `${item.storyId}:${item.chapterStart}:${item.chapterTitle}`;
  }

  return { chapterIndexAt, chapterRange, estimateCharacterOffset, estimateCloudPosition, normalizeQueue, queueKey };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PlayerUtils;
