const test = require('node:test');
const assert = require('node:assert/strict');
const { parseChapterSections, appendChapters, countChapters } = require('../src/import-utils');

test('recognizes a chapter heading at the beginning of a TXT file', () => {
  const parsed = parseChapterSections('Chương 1: Mở đầu\nNội dung một.\n\nChương 2: Tiếp theo\nNội dung hai.');
  assert.equal(parsed.hasHeadings, true);
  assert.equal(parsed.blocks.length, 2);
  assert.equal(parsed.blocks[0].title, 'Chương 1: Mở đầu');
  assert.equal(countChapters(parsed.text), 2);
});

test('appends new chapters and keeps previous chapters in order', () => {
  const existing = 'Chương 1: Một\nNội dung 1.\n\nChương 2: Hai\nNội dung 2.';
  const incoming = 'Chương 3: Ba\nNội dung 3.\n\nChương 4: Bốn\nNội dung 4.';
  const result = appendChapters(existing, incoming);
  assert.equal(result.addedCount, 2);
  assert.equal(result.replacedCount, 0);
  assert.ok(result.content.indexOf('Chương 2: Hai') < result.content.indexOf('Chương 3: Ba'));
  assert.ok(result.content.indexOf('Chương 3: Ba') < result.content.indexOf('Chương 4: Bốn'));
});

test('skips exact duplicate chapters and conflicting chapters by default', () => {
  const existing = 'Chương 5: Phần năm\nNội dung cũ.';
  const incoming = 'Chương 5: Phần năm\nNội dung cũ.\n\nChương 6: Phần sáu\nNội dung khác.';
  const result = appendChapters(existing, incoming);
  assert.equal(result.exactDuplicateCount, 1);
  assert.equal(result.addedCount, 1);
  assert.equal(result.content.match(/Chương 5:/g).length, 1);
});

test('can replace a same-title chapter when requested', () => {
  const result = appendChapters('Chương 5: Phần năm\nNội dung cũ.', 'Chương 5: Phần năm\nNội dung mới.', { duplicateMode: 'replace' });
  assert.equal(result.replacedCount, 1);
  assert.match(result.content, /Nội dung mới/);
  assert.doesNotMatch(result.content, /Nội dung cũ/);
});

test('sorts all numerically numbered chapters by chapter number', () => {
  const result = appendChapters('Chương 2: Hai\nB\n\nChương 1: Một\nA', 'Chương 3: Ba\nC');
  assert.ok(result.content.indexOf('Chương 1: Một') < result.content.indexOf('Chương 2: Hai'));
  assert.ok(result.content.indexOf('Chương 2: Hai') < result.content.indexOf('Chương 3: Ba'));
  assert.equal(result.sortedByChapterNumber, true);
});

test('appends TXT without recognized headings as one raw content block and warns', () => {
  const result = appendChapters('Nội dung truyện cũ.', 'Đây là đoạn nội dung mới.', { fallbackTitle: 'Phần bổ sung' });
  assert.equal(result.addedCount, 1);
  assert.equal(result.warnings.length, 2);
  assert.match(result.content, /Nội dung truyện cũ\.\n\nĐây là đoạn nội dung mới\./);
});

test('keeps leading metadata text from the imported file', () => {
  const result = appendChapters('Chương 10: Mười\nĐã có.', 'Tên truyện: Ví dụ\nTác giả: A\n\nChương 11: Mười một\nNội dung mới.');
  assert.match(result.content, /Chương 11: Mười một\nTên truyện: Ví dụ\nTác giả: A/);
  assert.match(result.content, /Nội dung mới/);
});
