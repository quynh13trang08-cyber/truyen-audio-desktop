'use strict';

(function attachImportUtils(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ImportUtils = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createImportUtils() {
  const HEADING_RE = /^\s*(?:#{1,6}\s*)?((?:chương|chapter|hồi|phần|quyển|tập)\s+[^\n]{1,100})\s*$/iu;
  const NUMBER_RE = /(?:chương|chapter|hồi|phần|quyển|tập)\s*(?:số\s*)?(\d+(?:[.,]\d+)?)/iu;

  function normalizeText(value) {
    return String(value ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  }

  function normalizeTitle(value) {
    return String(value ?? '')
      .normalize('NFC')
      .toLocaleLowerCase('vi')
      .replace(/^#+\s*/, '')
      .replace(/[\s:：.\-–—]+$/u, '')
      .replace(/\s+/gu, ' ')
      .trim();
  }

  function normalizeBody(value) {
    return normalizeText(value)
      .split('\n')
      .slice(1)
      .join('\n')
      .replace(/\s+/gu, ' ')
      .trim()
      .normalize('NFC')
      .toLocaleLowerCase('vi');
  }

  function chapterNumber(title) {
    const match = String(title ?? '').match(NUMBER_RE);
    if (!match) return null;
    const value = Number(match[1].replace(',', '.'));
    return Number.isFinite(value) ? value : null;
  }

  function parseChapterSections(value) {
    const text = normalizeText(value);
    const headings = [];
    let offset = 0;
    for (const line of text.split('\n')) {
      const match = line.match(HEADING_RE);
      if (match) headings.push({ start: offset, title: match[1].trim() });
      offset += line.length + 1;
    }
    if (!headings.length) return { text, prefix: text.trim(), blocks: [], hasHeadings: false };

    const prefix = text.slice(0, headings[0].start).replace(/[\n\s]+$/u, '');
    const blocks = headings.map((heading, index) => {
      const end = headings[index + 1]?.start ?? text.length;
      const blockText = text.slice(heading.start, end).trim();
      return {
        title: heading.title,
        key: normalizeTitle(heading.title),
        order: chapterNumber(heading.title),
        text: blockText
      };
    }).filter(block => block.text);
    return { text, prefix, blocks, hasHeadings: blocks.length > 0 };
  }

  function appendChapters(existingValue, incomingValue, options = {}) {
    const existingText = normalizeText(existingValue).trim();
    const incomingText = normalizeText(incomingValue).trim();
    const mode = options.duplicateMode === 'replace' ? 'replace' : 'skip';
    const fallbackTitle = String(options.fallbackTitle || 'Nội dung bổ sung').trim();
    if (!incomingText) throw new Error('File TXT không có nội dung để bổ sung.');
    if (!existingText) throw new Error('Truyện đích hiện không có nội dung.');

    const current = parseChapterSections(existingText);
    const imported = parseChapterSections(incomingText);
    const prefix = current.hasHeadings ? current.prefix : current.text;
    let blocks = current.hasHeadings ? current.blocks.slice() : [];
    let addedCount = 0;
    let replacedCount = 0;
    let exactDuplicateCount = 0;
    let skippedConflictCount = 0;
    const warnings = [];

    const incomingBlocks = imported.hasHeadings
      ? imported.blocks.map((block, index) => {
          if (index !== 0 || !imported.prefix) return block;
          const lines = block.text.split('\n');
          return { ...block, text: [lines[0], imported.prefix, lines.slice(1).join('\n')].filter(Boolean).join('\n') };
        })
      : [{ title: fallbackTitle, key: null, order: null, text: incomingText, unheaded: true }];

    if (!imported.hasHeadings) {
      warnings.push('Không nhận diện được tiêu đề chương trong file. Nội dung sẽ được nối nguyên khối; app không thể tự kiểm tra chương trùng.');
    }
    if (!current.hasHeadings) {
      warnings.push('Truyện đích chưa có tiêu đề chương nhận diện được; nội dung cũ được giữ nguyên ở đầu và không thể đối chiếu trùng với các chương cũ.');
    }

    for (const incoming of incomingBlocks) {
      if (!incoming.key) {
        blocks.push(incoming);
        addedCount++;
        continue;
      }
      const existingIndex = blocks.findIndex(block => block.key === incoming.key);
      if (existingIndex < 0) {
        blocks.push(incoming);
        addedCount++;
        continue;
      }
      const existingBlock = blocks[existingIndex];
      if (normalizeBody(existingBlock.text) === normalizeBody(incoming.text)) {
        exactDuplicateCount++;
      } else if (mode === 'replace') {
        blocks[existingIndex] = incoming;
        replacedCount++;
      } else {
        skippedConflictCount++;
      }
    }

    const allNumbered = blocks.length > 1 && blocks.every(block => Number.isFinite(block.order));
    if (allNumbered) {
      blocks = blocks.map((block, index) => ({ ...block, _originalIndex: index }))
        .sort((a, b) => a.order - b.order || a._originalIndex - b._originalIndex)
        .map(({ _originalIndex, ...block }) => block);
    }

    const rebuilt = [];
    if (prefix) rebuilt.push(prefix);
    blocks.forEach(block => rebuilt.push(block.text.trim()));
    const content = rebuilt.filter(Boolean).join('\n\n');

    return {
      content,
      incomingCount: incomingBlocks.length,
      addedCount,
      replacedCount,
      exactDuplicateCount,
      skippedConflictCount,
      duplicateCount: exactDuplicateCount + skippedConflictCount,
      warnings,
      sortedByChapterNumber: allNumbered
    };
  }

  function countChapters(value) {
    const parsed = parseChapterSections(value);
    return parsed.hasHeadings ? parsed.blocks.length : (parsed.text ? 1 : 0);
  }

  return { normalizeText, normalizeTitle, parseChapterSections, appendChapters, countChapters };
});
