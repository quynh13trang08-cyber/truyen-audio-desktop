const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeFileBaseName, formatStoryTxt, formatAllStoriesTxt } = require('../src/export-utils');

test('TXT preserves edited Vietnamese text and chapter order', () => {
  const story = {
    title: 'Truyện thử',
    content: 'Chương 1: Mở đầu\r\n\r\nNội dung đã sửa.\r\n\r\nChương 2: Tiếp theo\r\nĐoạn cuối.'
  };
  const output = formatStoryTxt(story);
  assert.match(output, /Nội dung đã sửa\./);
  assert.ok(output.indexOf('Chương 1: Mở đầu') < output.indexOf('Chương 2: Tiếp theo'));
  assert.ok(!output.includes('\r'));
});

test('file names are safe on Windows', () => {
  assert.equal(sanitizeFileBaseName('Truyện: Ánh trăng/đêm'), 'Truyện_ Ánh trăng_đêm');
  assert.equal(sanitizeFileBaseName('CON'), '_CON');
  assert.equal(sanitizeFileBaseName('   '), 'Truyen');
});

test('combined TXT keeps stories in library order', () => {
  const output = formatAllStoriesTxt([
    { title: 'Truyện A', content: 'Nội dung A' },
    { title: 'Truyện B', content: 'Nội dung B' }
  ]);
  assert.ok(output.indexOf('Truyện A') < output.indexOf('Truyện B'));
  assert.ok(output.includes('Nội dung A'));
  assert.ok(output.includes('Nội dung B'));
});
