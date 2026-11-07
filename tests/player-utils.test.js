const test = require('node:test');
const assert = require('node:assert/strict');
const PlayerUtils = require('../src/player-utils');

test('chapterIndexAt chooses the chapter whose start is at or before position', () => {
  const chapters = [{ title: 'Chương 1', start: 0 }, { title: 'Chương 2', start: 120 }, { title: 'Chương 3', start: 260 }];
  assert.equal(PlayerUtils.chapterIndexAt(chapters, 0), 0);
  assert.equal(PlayerUtils.chapterIndexAt(chapters, 119), 0);
  assert.equal(PlayerUtils.chapterIndexAt(chapters, 120), 1);
  assert.equal(PlayerUtils.chapterIndexAt(chapters, 999), 2);
});

test('chapterRange returns global bounds for selected chapter', () => {
  const chapters = [{ title: 'Chương 1', start: 0 }, { title: 'Chương 2', start: 120 }];
  assert.deepEqual(PlayerUtils.chapterRange(chapters, 1, 250), { index: 1, title: 'Chương 2', start: 120, end: 250 });
});

test('30-second skip uses current playback speed as an estimate', () => {
  assert.equal(PlayerUtils.estimateCharacterOffset(30, 1), 375);
  assert.equal(PlayerUtils.estimateCharacterOffset(30, 1.2), 450);
  assert.equal(PlayerUtils.estimateCharacterOffset(-10, 1), -125);
});

test('normalizeQueue removes entries for deleted stories and preserves valid order', () => {
  const library = [{ id: 'a' }, { id: 'b' }];
  const queue = [
    { storyId: 'b', chapterStart: 20, chapterTitle: 'Chương 2', extra: true },
    { storyId: 'missing', chapterStart: 30, chapterTitle: 'Chương X' },
    { storyId: 'a', chapterStart: 0, chapterTitle: 'Chương 1' }
  ];
  assert.deepEqual(PlayerUtils.normalizeQueue(queue, library), [
    { storyId: 'b', chapterStart: 20, chapterTitle: 'Chương 2' },
    { storyId: 'a', chapterStart: 0, chapterTitle: 'Chương 1' }
  ]);
});

test('queueKey distinguishes story/chapter entries', () => {
  assert.notEqual(
    PlayerUtils.queueKey({ storyId: 'a', chapterStart: 10, chapterTitle: 'Chương 1' }),
    PlayerUtils.queueKey({ storyId: 'a', chapterStart: 20, chapterTitle: 'Chương 2' })
  );
});


test('cloud seek accounts for playbackRate and can cross the current segment', () => {
  const segment = { start: 1000, length: 1000, duration: 100 };
  assert.equal(PlayerUtils.estimateCloudPosition(segment, 40, 30, 1), 1700);
  assert.equal(PlayerUtils.estimateCloudPosition(segment, 40, 30, 2), 2000);
  assert.equal(PlayerUtils.estimateCloudPosition(segment, 5, -10, 1), 950);
});

test('cloud seek handles invalid segment duration safely', () => {
  assert.equal(PlayerUtils.estimateCloudPosition({ start: 50, length: 200, duration: 0 }, 0, 10), 50);
});
