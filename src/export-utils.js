function sanitizeFileBaseName(value) {
  let name = String(value || 'Truyen')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/[. ]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!name) name = 'Truyen';
  name = Array.from(name).slice(0, 120).join('').replace(/[. ]+$/g, '') || 'Truyen';
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(name)) name = `_${name}`;
  return name;
}

function formatStoryTxt(story) {
  const title = String(story && story.title || 'Truyện chưa đặt tên').trim() || 'Truyện chưa đặt tên';
  const content = String(story && story.content || '').replace(/\r\n?/g, '\n').replace(/^\n+|\n+$/g, '');
  const divider = '='.repeat(Math.min(60, Math.max(16, Array.from(title).length)));
  return `${title}\n${divider}\n\n${content}\n`;
}

function formatAllStoriesTxt(stories) {
  return (Array.isArray(stories) ? stories : [])
    .filter(story => story && typeof story.content === 'string')
    .map(formatStoryTxt)
    .join(`\n\n${'='.repeat(60)}\n\n`);
}

module.exports = { sanitizeFileBaseName, formatStoryTxt, formatAllStoriesTxt };
