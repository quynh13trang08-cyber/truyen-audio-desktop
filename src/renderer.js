'use strict';

const $ = (id) => document.getElementById(id);
const synth = window.speechSynthesis;
const state = {
  library: [], settings: { theme: 'dark', rate: 1, voiceURI: '', engine: 'windows', googleVoice: 'vi-VN-Standard-A', autoNextChapter: true, replacementRules: [] },
  activeId: null, activeView: 'library', voices: [], chunks: [], chapters: [],
  position: 0, chunkIndex: 0, utterance: null, isPlaying: false,
  pendingFile: null, pendingUrl: null, saveTimer: null, toastTimer: null,
  isSeeking: false, cloudAudio: new Audio(), cloudSession: 0, cloudActive: false, cloudPending: false, chapterTimer: null, editorTarget: null, ruleEditIndex: null
};

const viewTitles = {
  library: ['THƯ VIỆN CỦA BẠN', 'Thư viện truyện'],
  add: ['THÊM NỘI DUNG MỚI', 'Thêm truyện'],
  listen: ['KHÔNG GIAN NGHE CỦA BẠN', 'Đang nghe'],
  settings: ['TÙY CHỈNH ỨNG DỤNG', 'Cài đặt']
};

function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

function wordCount(text) {
  return (String(text || '').trim().match(/\S+/g) || []).length;
}

function activeStory() {
  return state.library.find(item => item.id === state.activeId) || null;
}

function persistNow() {
  clearTimeout(state.saveTimer);
  return window.audioAPI.saveLibrary({ library: state.library, settings: state.settings })
    .catch(error => toast(`Không lưu được dữ liệu: ${error.message}`));
}

function scheduleSave() {
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => { persistNow(); }, 900);
}

function showView(view) {
  if (!viewTitles[view]) return;
  state.activeView = view;
  document.querySelectorAll('.view').forEach(node => node.classList.remove('active'));
  $(`view-${view}`).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(node => node.classList.toggle('active', node.dataset.view === view));
  $('topEyebrow').textContent = viewTitles[view][0];
  $('topTitle').textContent = viewTitles[view][1];
  if (view !== 'listen') exitFocusMode();
}

function applyTheme() {
  document.body.classList.toggle('light', state.settings.theme === 'light');
  $('themeSelect').value = state.settings.theme;
  $('themeToggle').textContent = state.settings.theme === 'dark' ? '☼ Giao diện' : '☾ Giao diện';
}

function renderLibrary() {
  const query = $('searchInput').value.trim().toLocaleLowerCase('vi');
  const filtered = state.library.filter(item => item.title.toLocaleLowerCase('vi').includes(query));
  $('statStories').textContent = state.library.length;
  $('statWords').textContent = state.library.reduce((sum, item) => sum + wordCount(item.content), 0).toLocaleString('vi-VN');
  if ($('appendTargetStory')) refreshAppendTargetOptions();
  $('statProgress').textContent = state.library.filter(item => (item.progress || 0) > 0).length;
  const grid = $('storyGrid');
  grid.replaceChildren();
  $('emptyLibrary').classList.toggle('visible', state.library.length === 0);
  if (!state.library.length) return;
  if (!filtered.length) {
    const msg = document.createElement('div');
    msg.className = 'empty-state visible';
    msg.innerHTML = '<h3>Không tìm thấy truyện</h3><p>Thử một từ khóa khác.</p>';
    grid.append(msg);
    return;
  }
  filtered.forEach(item => {
    const card = document.createElement('article');
    card.className = 'story-card';
    const icon = document.createElement('div'); icon.className = 'story-icon'; icon.textContent = '♫';
    const title = document.createElement('h3'); title.textContent = item.title;
    const meta = document.createElement('div'); meta.className = 'story-meta';
    meta.textContent = `${wordCount(item.content).toLocaleString('vi-VN')} từ · ${new Date(item.createdAt).toLocaleDateString('vi-VN')}`;
    const progress = document.createElement('div'); progress.className = 'story-progress';
    const fill = document.createElement('span');
    const percent = item.content.length ? Math.min(100, Math.round((item.progress || 0) / item.content.length * 100)) : 0;
    fill.style.width = `${percent}%`; progress.append(fill);
    const actions = document.createElement('div'); actions.className = 'story-actions';
    const listen = document.createElement('button'); listen.className = 'text-btn';
    listen.textContent = percent ? `▶ Tiếp tục · ${percent}%` : '▶ Nghe truyện';
    listen.addEventListener('click', () => openStory(item.id, true));
    const remove = document.createElement('button'); remove.className = 'delete-btn'; remove.textContent = 'Xóa';
    remove.addEventListener('click', () => deleteStory(item.id));
    actions.append(listen, remove);
    card.append(icon, title, meta, progress, actions);
    card.addEventListener('dblclick', () => openStory(item.id, true));
    grid.append(card);
  });
}

function splitIntoChunks(text, maxLength = 230, chapterBoundaries = []) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxLength, text.length);
    const nextBoundary = chapterBoundaries.find(boundary => boundary > start && boundary < end);
    if (nextBoundary !== undefined) end = nextBoundary;
    if (end < text.length && nextBoundary === undefined) {
      const windowText = text.slice(start, end);
      const sentenceEnd = Math.max(
        windowText.lastIndexOf('. '), windowText.lastIndexOf('! '), windowText.lastIndexOf('? '),
        windowText.lastIndexOf('。'), windowText.lastIndexOf('！'), windowText.lastIndexOf('？'),
        windowText.lastIndexOf('\n')
      );
      const spaceEnd = windowText.lastIndexOf(' ');
      const cut = sentenceEnd > 80 ? sentenceEnd + 1 : (spaceEnd > 80 ? spaceEnd + 1 : -1);
      if (cut > 0) end = start + cut;
    }
    if (end <= start) end = Math.min(start + maxLength, text.length);
    const chunkText = text.slice(start, end);
    if (chunkText.trim()) chunks.push({ start, text: chunkText });
    start = end;
  }
  return chunks;
}

function chapterBoundaries() {
  return state.chapters.slice(1).map(chapter => chapter.start);
}

function clearChapterTimer() {
  if (state.chapterTimer) clearTimeout(state.chapterTimer);
  state.chapterTimer = null;
}

function continueAfterChunk(callback) {
  const atChapterStart = state.settings.autoNextChapter !== false &&
    state.chapters.some(chapter => chapter.start > 0 && chapter.start === state.position);
  if (!atChapterStart) { callback(); return; }
  state.utterance = null;
  clearChapterTimer();
  state.chapterTimer = setTimeout(() => {
    state.chapterTimer = null;
    if (state.isPlaying) callback();
  }, 2000);
}

function findChapters(text) {
  const chapters = [];
  const lines = String(text || '').split(/\n/);
  let offset = 0;
  const pattern = /^\s*(?:#{1,6}\s*)?((chương|chapter|hồi|phần|quyển|tập)\s+[^\n]{1,100})\s*$/iu;
  for (const line of lines) {
    const match = line.match(pattern);
    if (match) chapters.push({ title: match[1].trim(), start: offset });
    offset += line.length + 1;
  }
  if (chapters.length) {
    if (chapters[0].start > 0) chapters.unshift({ title: 'Phần mở đầu', start: 0 });
    return chapters;
  }
  return [{ title: 'Toàn bộ truyện', start: 0 }];
}

function renderReadingContent(story) {
  const container = $('readingContent');
  container.replaceChildren();
  const paragraphPattern = /\S[\s\S]*?(?=\n\s*\n|$)/g;
  const matches = [...story.content.matchAll(paragraphPattern)];
  if (!matches.length && story.content.trim()) {
    const p = document.createElement('p');
    p.textContent = story.content;
    p.dataset.start = '0';
    p.dataset.length = String(story.content.length);
    container.append(p);
  } else {
    matches.forEach(match => {
      const part = match[0].trimEnd();
      const wrapper = document.createElement('div');
      wrapper.className = 'reading-paragraph';
      const p = document.createElement('p');
      p.textContent = part;
      p.dataset.start = String(match.index);
      p.dataset.length = String(part.length);
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'paragraph-edit';
      edit.textContent = 'Sửa đoạn';
      edit.title = 'Chỉnh sửa riêng đoạn văn này';
      edit.addEventListener('click', () => openTextEditor('paragraph', {
        start: Number(p.dataset.start), length: Number(p.dataset.length), text: p.textContent
      }));
      wrapper.append(p, edit);
      container.append(wrapper);
    });
  }
  updateActiveParagraph();
}

function pushEditHistory(story, action) {
  if (!Array.isArray(story.editHistory)) story.editHistory = [];
  story.editHistory.push({ content: story.content, progress: Number(story.progress) || 0, action, at: new Date().toISOString() });
  if (story.editHistory.length > 30) story.editHistory.splice(0, story.editHistory.length - 30);
  $('undoEdit').disabled = false;
}

function currentChapterBounds() {
  const story = activeStory();
  if (!story) return { start: 0, end: 0, title: '' };
  let index = 0;
  state.chapters.forEach((chapter, i) => { if (chapter.start <= state.position) index = i; });
  return {
    start: state.chapters[index]?.start || 0,
    end: state.chapters[index + 1]?.start ?? story.content.length,
    title: state.chapters[index]?.title || 'Chương hiện tại'
  };
}

function openTextEditor(mode, target = null) {
  const story = activeStory();
  if (!story) { toast('Hãy mở một truyện trước.'); return; }
  state.editorTarget = mode === 'paragraph' ? target : null;
  $('textEditorPane').hidden = mode === 'replace';
  $('replaceEditorPane').hidden = mode !== 'replace';
  $('saveEditorText').hidden = mode === 'replace';
  $('applyReplacement').hidden = mode !== 'replace';
  $('editorTitle').textContent = mode === 'paragraph' ? 'Sửa đoạn văn' : mode === 'replace' ? 'Tìm và thay thế' : 'Sửa toàn bộ truyện';
  if (mode === 'paragraph') {
    $('editorDescription').textContent = 'Chỉ thay đổi đoạn văn đang chọn; các phần khác được giữ nguyên.';
    $('editorText').value = target?.text || '';
  } else if (mode === 'full') {
    $('editorDescription').textContent = 'Bạn có thể chỉnh sửa trực tiếp toàn bộ nội dung. Bản trước khi sửa sẽ được lưu vào lịch sử.';
    $('editorText').value = story.content;
  } else {
    $('editorDescription').textContent = 'Tìm không phân biệt chữ hoa/chữ thường. Có thể áp dụng cho cả truyện hoặc chương đang chọn.';
    $('replaceFind').value = '';
    $('replaceWith').value = '';
    $('editorScope').value = 'story';
    updateReplacePreview();
  }
  const dialog = $('editorDialog');
  if (!dialog.open) dialog.showModal();
}

function closeTextEditor() {
  const dialog = $('editorDialog');
  if (dialog.open) dialog.close();
  state.editorTarget = null;
}

function applyContentChange(newContent, reason, preferredPosition = state.position) {
  const story = activeStory();
  if (!story) return;
  const wasPlaying = state.isPlaying;
  stopSpeech(false);
  story.content = String(newContent);
  state.position = Math.max(0, Math.min(preferredPosition, story.content.length));
  story.progress = state.position;
  state.chapters = findChapters(story.content);
  state.chunks = splitIntoChunks(story.content, 230, chapterBoundaries());
  $('nowMeta').textContent = `${wordCount(story.content).toLocaleString('vi-VN')} từ · Đã lưu trên thiết bị`;
  renderReadingContent(story);
  $('undoEdit').disabled = !Array.isArray(story.editHistory) || !story.editHistory.length;
  renderChapters();
  updateProgress();
  renderLibrary();
  updateReplacementPreview();
  persistNow();
  toast(reason);
  if (wasPlaying) speakFrom(state.position);
}

function saveTextEditor() {
  const story = activeStory();
  if (!story) return;
  const newText = $('editorText').value;
  if (!newText.trim()) { toast('Nội dung truyện không được để trống.'); return; }
  if (newText.length > 15 * 1024 * 1024) { toast('Nội dung quá lớn (giới hạn 15 MB).'); return; }
  const oldContent = story.content;
  const target = state.editorTarget;
  let nextContent;
  let nextPosition = state.position;
  if (target) {
    nextContent = oldContent.slice(0, target.start) + newText + oldContent.slice(target.start + target.length);
    const delta = newText.length - target.length;
    if (state.position > target.start + target.length) nextPosition += delta;
    else if (state.position >= target.start) nextPosition = target.start + Math.min(newText.length, state.position - target.start);
  } else {
    nextContent = newText;
    if (oldContent.length > 0) nextPosition = Math.round((state.position / oldContent.length) * newText.length);
  }
  if (nextContent === oldContent) { closeTextEditor(); toast('Nội dung không thay đổi.'); return; }
  pushEditHistory(story, target ? 'Sửa một đoạn văn' : 'Sửa toàn bộ truyện');
  closeTextEditor();
  applyContentChange(nextContent, 'Đã lưu nội dung chỉnh sửa.', nextPosition);
}

function countOccurrences(text, search) {
  if (!search) return 0;
  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (String(text).match(new RegExp(escaped, 'gi')) || []).length;
}

function updateReplacePreview() {
  const story = activeStory();
  const search = $('replaceFind').value;
  if (!story || !search) { $('replacePreview').textContent = 'Nhập nội dung cần tìm để xem trước số vị trí.'; return; }
  const bounds = $('editorScope').value === 'chapter' ? currentChapterBounds() : { start: 0, end: story.content.length, title: 'Toàn bộ truyện' };
  const count = countOccurrences(story.content.slice(bounds.start, bounds.end), search);
  $('replacePreview').textContent = `Tìm thấy ${count.toLocaleString('vi-VN')} vị trí trong ${bounds.title}.`;
}

function applyFindReplace() {
  const story = activeStory();
  const search = $('replaceFind').value;
  const replacement = $('replaceWith').value;
  if (!story || !search) { toast('Nhập từ hoặc cụm từ cần tìm.'); return; }
  const bounds = $('editorScope').value === 'chapter' ? currentChapterBounds() : { start: 0, end: story.content.length };
  const targetText = story.content.slice(bounds.start, bounds.end);
  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(escaped, 'gi');
  const count = (targetText.match(pattern) || []).length;
  if (!count) { toast('Không tìm thấy nội dung cần thay.'); return; }
  const changed = targetText.replace(pattern, () => replacement);
  const nextContent = story.content.slice(0, bounds.start) + changed + story.content.slice(bounds.end);
  pushEditHistory(story, `Thay ${count} vị trí: “${search}”`);
  const position = state.position <= bounds.start ? state.position : Math.min(state.position, nextContent.length);
  closeTextEditor();
  applyContentChange(nextContent, `Đã thay ${count.toLocaleString('vi-VN')} vị trí.`, position);
}

function undoStoryEdit() {
  const story = activeStory();
  if (!story || !Array.isArray(story.editHistory) || !story.editHistory.length) { toast('Không có chỉnh sửa để hoàn tác.'); return; }
  const snapshot = story.editHistory.pop();
  story.content = snapshot.content;
  state.position = Math.min(Number(snapshot.progress) || 0, story.content.length);
  state.chapters = findChapters(story.content);
  $('undoEdit').disabled = !story.editHistory.length;
  applyContentChange(story.content, `Đã hoàn tác: ${snapshot.action}.`, state.position);
}

function applyReplacementRules(content) {
  const rules = Array.isArray(state.settings.replacementRules) ? state.settings.replacementRules : [];
  let result = String(content || '');
  for (const rule of rules) {
    if (!rule || rule.enabled === false || !String(rule.from || '')) continue;
    const escaped = String(rule.from).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escaped, 'gi'), () => String(rule.to ?? ''));
  }
  return result;
}

function countRuleMatches(content) {
  let working = String(content || '');
  let total = 0;
  const rules = Array.isArray(state.settings.replacementRules) ? state.settings.replacementRules : [];
  for (const rule of rules) {
    if (!rule || rule.enabled === false || !String(rule.from || '')) continue;
    const escaped = String(rule.from).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(escaped, 'gi');
    const found = working.match(pattern) || [];
    total += found.length;
    working = working.replace(pattern, () => String(rule.to ?? ''));
  }
  return total;
}

function updateReplacementPreview() {
  const story = activeStory();
  if (!story) { $('replacementPreview').textContent = 'Mở một truyện để xem trước.'; return; }
  const count = countRuleMatches(story.content);
  $('replacementPreview').textContent = count
    ? `Sẽ thay khoảng ${count.toLocaleString('vi-VN')} vị trí trong truyện hiện tại.`
    : 'Không có vị trí nào cần thay trong truyện hiện tại.';
}

function applyRulesToCurrentStory() {
  const story = activeStory();
  if (!story) { toast('Hãy mở một truyện trước.'); return; }
  const count = countRuleMatches(story.content);
  if (!count) { toast('Không có quy tắc nào khớp với truyện hiện tại.'); return; }
  if (!confirm(`Áp dụng tất cả quy tắc đã lưu cho toàn bộ truyện?\nSố vị trí dự kiến: ${count.toLocaleString('vi-VN')}.`)) return;
  const nextContent = applyReplacementRules(story.content);
  if (nextContent === story.content) { toast('Nội dung không thay đổi.'); return; }
  pushEditHistory(story, `Áp dụng từ điển thay thế (${count} vị trí)`);
  applyContentChange(nextContent, `Đã áp dụng ${count.toLocaleString('vi-VN')} vị trí thay thế.`, state.position);
  updateReplacementPreview();
}

function renderReplacementRules() {
  const list = $('replacementRuleList');
  if (!list) return;
  list.replaceChildren();
  const rules = Array.isArray(state.settings.replacementRules) ? state.settings.replacementRules : [];
  if (!rules.length) {
    const empty = document.createElement('p'); empty.className = 'hint'; empty.textContent = 'Chưa có quy tắc thay thế.'; list.append(empty);
  } else {
    rules.forEach((rule, index) => {
      const row = document.createElement('div'); row.className = 'replacement-rule';
      const label = document.createElement('span'); label.textContent = `“${rule.from}” → “${rule.to}”`;
      const actions = document.createElement('div'); actions.className = 'replacement-rule-actions';
      const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'text-btn'; edit.textContent = 'Sửa';
      edit.addEventListener('click', () => {
        state.ruleEditIndex = index;
        $('replacementFrom').value = rule.from;
        $('replacementTo').value = rule.to;
        $('addReplacementRule').textContent = 'Lưu quy tắc';
        $('replacementFrom').focus();
      });
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'delete-btn'; remove.textContent = 'Xóa';
      remove.addEventListener('click', () => {
        state.settings.replacementRules.splice(index, 1);
        if (state.ruleEditIndex === index) {
          state.ruleEditIndex = null; $('replacementFrom').value = ''; $('replacementTo').value = ''; $('addReplacementRule').textContent = '＋ Thêm quy tắc';
        } else if (state.ruleEditIndex !== null && state.ruleEditIndex > index) state.ruleEditIndex--;
        renderReplacementRules(); scheduleSave();
      });
      actions.append(edit, remove); row.append(label, actions); list.append(row);
    });
  }
  updateReplacementPreview();
}

function updateActiveParagraph() {
  const paragraphs = [...$('readingContent').querySelectorAll('p')];
  if (!paragraphs.length) return;
  let active = paragraphs[0];
  for (const p of paragraphs) {
    if (Number(p.dataset.start) <= state.position) active = p;
    else break;
  }
  paragraphs.forEach(p => p.classList.toggle('current-reading', p === active && state.isPlaying));
  if (state.isPlaying && active) {
    const box = $('readingContent');
    const boxRect = box.getBoundingClientRect();
    const pRect = active.getBoundingClientRect();
    if (pRect.top < boxRect.top + 20 || pRect.bottom > boxRect.bottom - 20) {
      active.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }
}

function updateProgress() {
  const story = activeStory();
  if (!story) return;
  const total = story.content.length || 1;
  state.position = Math.max(0, Math.min(state.position, total));
  story.progress = state.position;
  $('progressSlider').value = String(Math.round(state.position / total * 1000));
  $('progressPercent').textContent = `${Math.round(state.position / total * 100)}%`;
  $('progressChars').textContent = `${state.position.toLocaleString('vi-VN')} / ${story.content.length.toLocaleString('vi-VN')} ký tự`;
  $('miniSub').textContent = `${Math.round(state.position / total * 100)}% · ${state.isPlaying ? 'Đang phát' : 'Tạm dừng'}`;
  updateActiveParagraph();
  scheduleSave();
}

function renderChapters() {
  const select = $('chapterSelect');
  select.replaceChildren();
  state.chapters.forEach((chapter, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = chapter.title;
    select.append(option);
  });
  let selected = 0;
  for (let i = 0; i < state.chapters.length; i++) {
    if (state.chapters[i].start <= state.position) selected = i;
  }
  select.value = String(selected);
}

function openStory(id, autoNavigate = false) {
  const story = state.library.find(item => item.id === id);
  if (!story) return;
  stopSpeech(false);
  state.activeId = id;
  state.position = Math.max(0, Math.min(story.progress || 0, story.content.length));
  state.chapters = findChapters(story.content);
  state.chunks = splitIntoChunks(story.content, 230, chapterBoundaries());
  $('nowTitle').textContent = story.title;
  $('nowMeta').textContent = `${wordCount(story.content).toLocaleString('vi-VN')} từ · Đã lưu trên thiết bị`;
  $('readingTitle').textContent = story.title;
  $('miniTitle').textContent = story.title;
  $('playPause').textContent = '▶';
  $('miniPlay').textContent = '▶';
  renderReadingContent(story);
  $('undoEdit').disabled = !Array.isArray(story.editHistory) || !story.editHistory.length;
  renderChapters();
  updateProgress();
  renderLibrary();
  updateReplacementPreview();
  if (autoNavigate) showView('listen');
}

function deleteStory(id) {
  const story = state.library.find(item => item.id === id);
  if (!story || !confirm(`Xóa truyện “${story.title}” khỏi thư viện?`)) return;
  if (state.activeId === id) {
    stopSpeech(false);
    state.activeId = null;
    state.position = 0;
    $('nowTitle').textContent = 'Chưa chọn truyện';
    $('readingTitle').textContent = 'Chưa chọn truyện';
    $('miniTitle').textContent = 'Chưa phát truyện';
    $('readingContent').innerHTML = '<div class="reading-placeholder"><span>♫</span><p>Nội dung truyện sẽ hiển thị tại đây.</p></div>';
  }
  state.library = state.library.filter(item => item.id !== id);
  persistNow(); renderLibrary(); toast('Đã xóa truyện.');
}

function selectedVoice() {
  const uri = state.settings.voiceURI || $('voiceSelect').value || $('settingsVoice').value;
  return state.voices.find(voice => voice.voiceURI === uri) || state.voices.find(voice => /^vi([_-]|$)/i.test(voice.lang)) || null;
}

const googleStandardVoices = [
  ['vi-VN-Standard-A', 'Nữ A · Google truyền thống'],
  ['vi-VN-Standard-B', 'Nam B · Google truyền thống'],
  ['vi-VN-Standard-C', 'Nữ C · Google truyền thống'],
  ['vi-VN-Standard-D', 'Nam D · Google truyền thống']
];
const googleAiVoices = [
  ['vi-VN-Chirp3-HD-Aoede', 'Aoede · Nữ'],
  ['vi-VN-Chirp3-HD-Achernar', 'Achernar · Nữ'],
  ['vi-VN-Chirp3-HD-Autonoe', 'Autonoe · Nữ'],
  ['vi-VN-Chirp3-HD-Callirrhoe', 'Callirrhoe · Nữ'],
  ['vi-VN-Chirp3-HD-Despina', 'Despina · Nữ'],
  ['vi-VN-Chirp3-HD-Erinome', 'Erinome · Nữ'],
  ['vi-VN-Chirp3-HD-Kore', 'Kore · Nữ'],
  ['vi-VN-Chirp3-HD-Leda', 'Leda · Nữ'],
  ['vi-VN-Chirp3-HD-Zephyr', 'Zephyr · Nữ'],
  ['vi-VN-Chirp3-HD-Achird', 'Achird · Nam'],
  ['vi-VN-Chirp3-HD-Charon', 'Charon · Nam'],
  ['vi-VN-Chirp3-HD-Fenrir', 'Fenrir · Nam'],
  ['vi-VN-Chirp3-HD-Orus', 'Orus · Nam'],
  ['vi-VN-Chirp3-HD-Puck', 'Puck · Nam']
];

function populateVoiceSelects() {
  const engine = state.settings.engine || 'windows';
  const selects = [$('voiceSelect'), $('settingsVoice')];
  let options = [];
  let selected = '';
  if (engine === 'google-standard') {
    options = googleStandardVoices;
    selected = state.settings.googleVoice || 'vi-VN-Standard-A';
  } else if (engine === 'google-ai') {
    options = googleAiVoices;
    selected = state.settings.googleVoice || 'vi-VN-Chirp3-HD-Aoede';
  } else {
    options = state.voices
      .slice()
      .sort((a, b) => (/^vi([_-]|$)/i.test(a.lang) ? 0 : 1) - (/^vi([_-]|$)/i.test(b.lang) ? 0 : 1) || a.name.localeCompare(b.name))
      .map(voice => [voice.voiceURI, `${voice.name} (${voice.lang})${voice.default ? ' · Mặc định' : ''}`]);
    selected = state.settings.voiceURI || '';
  }
  selects.forEach(select => {
    select.replaceChildren();
    const auto = document.createElement('option');
    auto.value = '';
    auto.textContent = engine === 'windows' ? 'Tự động chọn giọng phù hợp' : 'Tự động chọn giọng mặc định';
    select.append(auto);
    options.forEach(([value, label]) => {
      const option = document.createElement('option'); option.value = value; option.textContent = label; select.append(option);
    });
    select.value = selected;
  });
  $('engineSelect').value = engine;
  $('settingsEngine').value = engine;
  if (engine === 'windows') {
    const hasVi = state.voices.some(voice => /^vi([_-]|$)/i.test(voice.lang));
    $('voiceHelp').textContent = hasVi
      ? 'Đã tìm thấy giọng tiếng Việt trên Windows. Chế độ này hoạt động ngoại tuyến.'
      : 'Chưa phát hiện giọng tiếng Việt trong Windows. Có thể chuyển sang Google truyền thống hoặc Google AI.';
  } else if (engine === 'google-standard') {
    $('voiceHelp').textContent = 'Google truyền thống (Standard) cần Internet và tài khoản Google Cloud đã kết nối. Có thể chọn giọng nữ hoặc nam.';
  } else {
    $('voiceHelp').textContent = 'Google AI (Chirp 3 HD) có giọng tiếng Việt tự nhiên hơn, cần Internet và tài khoản Google Cloud đã kết nối.';
  }
}

function loadVoices() {
  state.voices = synth ? synth.getVoices() : [];
  populateVoiceSelects();
}

function setEngine(engine) {
  const next = ['windows', 'google-standard', 'google-ai'].includes(engine) ? engine : 'windows';
  const wasPlaying = state.isPlaying;
  const position = state.position;
  if (wasPlaying || state.utterance || state.cloudActive) stopSpeech(false);
  state.settings.engine = next;
  if (next === 'google-standard' && !String(state.settings.googleVoice || '').includes('Standard')) state.settings.googleVoice = 'vi-VN-Standard-A';
  if (next === 'google-ai' && !String(state.settings.googleVoice || '').includes('Chirp3-HD')) state.settings.googleVoice = 'vi-VN-Chirp3-HD-Aoede';
  populateVoiceSelects();
  scheduleSave();
  if (wasPlaying) speakFrom(position);
}

function setPlaying(playing) {
  state.isPlaying = playing;
  $('playPause').textContent = playing ? 'Ⅱ' : '▶';
  $('miniPlay').textContent = playing ? 'Ⅱ' : '▶';
  $('playPause').title = playing ? 'Tạm dừng' : 'Phát';
  const story = activeStory();
  if (story) $('miniSub').textContent = `${Math.round(state.position / Math.max(story.content.length, 1) * 100)}% · ${playing ? 'Đang phát' : 'Tạm dừng'}`;
  updateActiveParagraph();
}

function speakFrom(globalPosition) {
  const story = activeStory();
  if (!story || !story.content.trim()) { toast('Truyện chưa có nội dung để đọc.'); return; }
  const engine = state.settings.engine || 'windows';
  if (engine !== 'windows') {
    speakCloudFrom(globalPosition);
    return;
  }
  state.chunks = splitIntoChunks(story.content, 230, chapterBoundaries());
  if (!state.voices.length) loadVoices();
  if (!state.voices.length) {
    toast('Windows chưa cung cấp giọng đọc. Hãy kiểm tra cài đặt giọng nói hoặc chọn Google.');
    return;
  }
  synth.cancel();
  state.cloudSession++;
  state.cloudActive = false;
  state.cloudAudio.pause(); state.cloudAudio.removeAttribute('src'); state.cloudAudio.load();
  state.position = Math.max(0, Math.min(globalPosition, story.content.length));
  if (state.position >= story.content.length) state.position = 0;
  state.chunkIndex = state.chunks.findIndex(chunk => chunk.start + chunk.text.length > state.position);
  if (state.chunkIndex < 0) state.chunkIndex = 0;
  speakCurrentChunk();
}

async function speakCloudFrom(globalPosition) {
  const story = activeStory();
  if (!story) return;
  synth.cancel();
  state.cloudAudio.pause(); state.cloudAudio.removeAttribute('src'); state.cloudAudio.load();
  state.chunks = splitIntoChunks(story.content, 1000, chapterBoundaries());
  state.position = Math.max(0, Math.min(globalPosition, story.content.length));
  if (state.position >= story.content.length) state.position = 0;
  state.chunkIndex = state.chunks.findIndex(chunk => chunk.start + chunk.text.length > state.position);
  if (state.chunkIndex < 0) state.chunkIndex = 0;
  state.cloudActive = true; state.cloudPending = true;
  const session = ++state.cloudSession;
  await speakCloudCurrentChunk(session);
}

async function speakCloudCurrentChunk(session) {
  const story = activeStory();
  if (session !== state.cloudSession) return;
  if (!story || state.chunkIndex >= state.chunks.length) {
    state.cloudActive = false; setPlaying(false); state.position = story ? story.content.length : 0; updateProgress(); return;
  }
  const chunk = state.chunks[state.chunkIndex];
  const localOffset = Math.max(0, state.position - chunk.start);
  const text = chunk.text.slice(localOffset).trimStart();
  if (!text) { state.chunkIndex++; return speakCloudCurrentChunk(session); }
  setPlaying(true);
  state.cloudPending = true;
  try {
    const engine = state.settings.engine;
    const voice = state.settings.googleVoice || (engine === 'google-ai' ? 'vi-VN-Chirp3-HD-Aoede' : 'vi-VN-Standard-A');
    const result = await window.audioAPI.synthesizeSpeech({ text, engine, voice, rate: Number(state.settings.rate) || 1 });
    if (session !== state.cloudSession) return;
    state.cloudPending = false;
    const audio = state.cloudAudio;
    audio.pause();
    audio.src = `data:audio/mpeg;base64,${result.audioContent}`;
    audio.playbackRate = engine === 'google-ai' ? (Number(state.settings.rate) || 1) : 1;
    audio.ontimeupdate = () => {
      if (session !== state.cloudSession || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
      state.position = Math.min(story.content.length, chunk.start + localOffset + Math.round((audio.currentTime / audio.duration) * (text.length)));
      if (!state.isSeeking) updateProgress();
    };
    audio.onended = () => {
      if (session !== state.cloudSession) return;
      state.position = Math.min(story.content.length, chunk.start + chunk.text.length);
      state.chunkIndex++;
      updateProgress();
      if (state.chunkIndex < state.chunks.length) continueAfterChunk(() => speakCloudCurrentChunk(session));
      else { state.cloudActive = false; setPlaying(false); toast('Đã đọc hết truyện.'); }
    };
    audio.onerror = () => {
      if (session !== state.cloudSession) return;
      state.cloudActive = false; setPlaying(false); toast('Không phát được âm thanh Google trả về.');
    };
    await audio.play();
    if (session === state.cloudSession) setPlaying(true);
  } catch (error) {
    if (session !== state.cloudSession) return;
    state.cloudPending = false; state.cloudActive = false; setPlaying(false);
    toast(error.message || 'Không thể kết nối Google Text-to-Speech.');
  }
}

function speakCurrentChunk() {
  const story = activeStory();
  if (!story || state.chunkIndex >= state.chunks.length) {
    setPlaying(false); state.position = story ? story.content.length : 0; updateProgress(); return;
  }
  const chunk = state.chunks[state.chunkIndex];
  const localOffset = Math.max(0, state.position - chunk.start);
  const text = chunk.text.slice(localOffset).trimStart();
  if (!text) { state.chunkIndex++; speakCurrentChunk(); return; }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'vi-VN';
  utterance.rate = Number(state.settings.rate) || 1;
  const voice = selectedVoice();
  if (voice) { utterance.voice = voice; utterance.lang = voice.lang || 'vi-VN'; }
  state.utterance = utterance;
  utterance.onstart = () => setPlaying(true);
  utterance.onboundary = event => {
    if (typeof event.charIndex === 'number') {
      state.position = Math.min(story.content.length, chunk.start + localOffset + event.charIndex);
      if (!state.isSeeking) updateProgress();
    }
  };
  utterance.onend = () => {
    if (state.utterance !== utterance) return;
    state.position = Math.min(story.content.length, chunk.start + chunk.text.length);
    state.chunkIndex++;
    updateProgress();
    if (state.chunkIndex < state.chunks.length) continueAfterChunk(() => speakCurrentChunk());
    else { setPlaying(false); toast('Đã đọc hết truyện.'); }
  };
  utterance.onerror = event => {
    if (event.error !== 'canceled' && event.error !== 'interrupted') {
      setPlaying(false); toast(`Bộ đọc gặp lỗi: ${event.error || 'không xác định'}`);
    }
  };
  synth.speak(utterance);
  setPlaying(true);
}

function stopSpeech(save = true) {
  clearChapterTimer();
  if (synth) synth.cancel();
  state.cloudSession++; state.cloudActive = false; state.cloudPending = false;
  if (state.cloudAudio) { state.cloudAudio.pause(); state.cloudAudio.removeAttribute('src'); state.cloudAudio.load(); }
  state.utterance = null;
  setPlaying(false);
  if (save && activeStory()) updateProgress();
}

function togglePlayback() {
  if (!activeStory()) { toast('Hãy chọn một truyện trước.'); showView('library'); return; }
  if (state.isPlaying) {
    if (state.chapterTimer) {
      clearChapterTimer();
      state.utterance = null;
      if (state.settings.engine !== 'windows') {
        state.cloudSession++; state.cloudPending = false; state.cloudActive = false;
        state.cloudAudio.pause();
      } else synth.cancel();
    } else if (state.settings.engine !== 'windows') {
      state.cloudAudio.pause();
      if (state.cloudPending) { state.cloudSession++; state.cloudPending = false; state.cloudActive = false; }
    } else synth.pause();
    setPlaying(false); updateProgress();
  } else if (state.settings.engine !== 'windows' && state.cloudActive && state.cloudAudio.src) {
    state.cloudAudio.play().then(() => setPlaying(true)).catch(error => toast(error.message));
  } else if (state.settings.engine === 'windows' && synth.paused && state.utterance) {
    synth.resume(); setPlaying(true);
  } else {
    speakFrom(state.position);
  }
}

function seekTo(position) {
  if (!activeStory()) return;
  state.position = Math.max(0, Math.min(position, activeStory().content.length));
  if (state.isPlaying || state.utterance || state.cloudActive) {
    stopSpeech(false);
    speakFrom(state.position);
  } else {
    updateProgress();
    renderChapters();
  }
}

function skipApprox(seconds) {
  const story = activeStory();
  if (!story) return;
  // SpeechSynthesis không cung cấp timeline audio chuẩn; quy đổi gần đúng theo tốc độ đọc trung bình.
  const charsPerSecond = 12.5 * (Number(state.settings.rate) || 1);
  seekTo(state.position + Math.round(seconds * charsPerSecond));
}

function jumpChapter(delta) {
  if (!activeStory() || !state.chapters.length) return;
  let index = 0;
  state.chapters.forEach((chapter, i) => { if (chapter.start <= state.position) index = i; });
  const next = Math.max(0, Math.min(state.chapters.length - 1, index + delta));
  $('chapterSelect').value = String(next);
  seekTo(state.chapters[next].start);
}


function refreshAppendTargetOptions() {
  const select = $('appendTargetStory');
  const previous = select.value;
  select.replaceChildren();
  state.library.forEach(story => {
    const option = document.createElement('option');
    option.value = story.id;
    option.textContent = `${story.title} · ${ImportUtils.countChapters(story.content)} chương/phần`;
    select.append(option);
  });
  if (state.library.some(story => story.id === previous)) select.value = previous;
  else if (state.activeId && state.library.some(story => story.id === state.activeId)) select.value = state.activeId;
  else if (state.library.length) select.value = state.library[0].id;
}

function refreshFileImportOptions() {
  const options = $('fileImportOptions');
  const isFilePane = currentSource() === 'file';
  options.hidden = !state.pendingFile || !isFilePane;
  $('saveStory').disabled = false;
  const appendMode = $('fileImportMode').value === 'append';
  $('storyTitleGroup').hidden = appendMode && isFilePane;
  $('appendTargetWrap').hidden = !appendMode;
  $('duplicateModeWrap').hidden = !appendMode;
  $('saveStory').textContent = appendMode && isFilePane ? 'Bổ sung chương vào truyện' : 'Lưu vào thư viện';
  if (!appendMode || !state.pendingFile) {
    $('appendImportPreview').textContent = state.pendingFile
      ? `Đã chọn file “${state.pendingFile.name}”. Nội dung sẽ được dùng để tạo một truyện mới.`
      : 'Chọn file TXT để xem trước nội dung.';
    return;
  }

  refreshAppendTargetOptions();
  const target = state.library.find(story => story.id === $('appendTargetStory').value);
  if (!target) {
    $('appendImportPreview').textContent = 'Thư viện chưa có truyện. Hãy tạo truyện trước khi bổ sung chương.';
    $('saveStory').disabled = true;
    return;
  }
  $('saveStory').disabled = false;
  try {
    const incoming = applyReplacementRules(state.pendingFile.content.trim());
    const plan = ImportUtils.appendChapters(target.content, incoming, {
      duplicateMode: $('duplicateChapterMode').value,
      fallbackTitle: state.pendingFile.name
    });
    const lines = [
      `Truyện đích: ${target.title}`,
      `Số chương/phần trong file: ${plan.incomingCount}`,
      `Sẽ thêm mới: ${plan.addedCount}`,
      `Sẽ thay thế: ${plan.replacedCount}`,
      `Bỏ qua do trùng: ${plan.duplicateCount}`
    ];
    if (plan.sortedByChapterNumber) lines.push('Các chương được sắp xếp theo số chương.');
    plan.warnings.forEach(warning => lines.push(`Lưu ý: ${warning}`));
    $('appendImportPreview').textContent = lines.join('\n');
    $('saveStory').disabled = plan.addedCount + plan.replacedCount === 0;
  } catch (error) {
    $('appendImportPreview').textContent = error.message;
    $('saveStory').disabled = true;
  }
}

function appendFileToExistingStory() {
  if (!state.pendingFile) { toast('Hãy chọn file TXT trước.'); return false; }
  const target = state.library.find(story => story.id === $('appendTargetStory').value);
  if (!target) { toast('Hãy chọn truyện cần bổ sung.'); return false; }
  const incoming = applyReplacementRules(state.pendingFile.content.trim());
  let plan;
  try {
    plan = ImportUtils.appendChapters(target.content, incoming, {
      duplicateMode: $('duplicateChapterMode').value,
      fallbackTitle: state.pendingFile.name
    });
  } catch (error) { toast(error.message); return false; }
  if (plan.addedCount + plan.replacedCount === 0) {
    toast('Không có chương mới để bổ sung. Các chương trong file đều đã tồn tại hoặc bị bỏ qua.');
    return false;
  }
  if (plan.content.length > 15 * 1024 * 1024) {
    toast('Sau khi bổ sung, truyện vượt giới hạn 15 MB. Hãy chia file thành các phần nhỏ hơn.');
    return false;
  }

  const summary = `Bổ sung vào “${target.title}”\n\nThêm mới: ${plan.addedCount}\nThay thế: ${plan.replacedCount}\nBỏ qua do trùng: ${plan.duplicateCount}${plan.warnings.length ? `\n\n${plan.warnings.join('\n')}` : ''}\n\nTiếp tục?`;
  if (!confirm(summary)) return false;

  const oldContent = target.content;
  const oldProgress = Number(target.progress) || 0;
  const wasPlayingTarget = state.activeId === target.id && state.isPlaying;
  if (wasPlayingTarget) stopSpeech(false);
  if (!Array.isArray(target.editHistory)) target.editHistory = [];
  target.editHistory.push({ content: oldContent, progress: oldProgress, action: 'Trước khi bổ sung chương', at: new Date().toISOString() });
  if (target.editHistory.length > 30) target.editHistory.splice(0, target.editHistory.length - 30);
  target.content = plan.content;
  target.progress = Math.min(oldProgress, target.content.length);
  target.updatedAt = new Date().toISOString();

  if (state.activeId === target.id) {
    state.position = target.progress;
    state.chapters = findChapters(target.content);
    state.chunks = splitIntoChunks(target.content, 230, chapterBoundaries());
    $('nowMeta').textContent = `${wordCount(target.content).toLocaleString('vi-VN')} từ · Đã lưu trên thiết bị`;
    renderReadingContent(target);
    $('undoEdit').disabled = !target.editHistory.length;
    renderChapters();
    updateProgress();
    updateReplacementPreview();
    if (wasPlayingTarget) speakFrom(state.position);
  }

  state.pendingFile = null;
  $('fileName').textContent = 'Chưa chọn tệp truyện';
  $('fileImportOptions').hidden = true;
  $('fileImportMode').value = 'new';
  $('storyTitleGroup').hidden = false;
  $('storyTitle').value = '';
  $('saveStory').textContent = 'Lưu vào thư viện';
  $('saveStory').disabled = false;
  $('addStatus').textContent = `Đã bổ sung ${plan.addedCount} chương, thay ${plan.replacedCount} chương vào “${target.title}”.`;
  persistNow();
  renderLibrary();
  refreshAppendTargetOptions();
  toast(`Đã cập nhật “${target.title}”: thêm ${plan.addedCount}, thay ${plan.replacedCount}, bỏ qua ${plan.duplicateCount} chương.`);
  return true;
}

function addStory(title, content, source) {
  const clean = applyReplacementRules(String(content || '').trim());
  if (clean.length < 2) { toast('Nội dung truyện đang trống.'); return false; }
  if (clean.length > 15 * 1024 * 1024) { toast('Nội dung quá lớn (giới hạn 15 MB).'); return false; }
  const item = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    title: String(title || 'Truyện chưa đặt tên').trim().slice(0, 160),
    content: clean,
    source: source || 'paste',
    createdAt: new Date().toISOString(),
    progress: 0
  };
  state.library.unshift(item);
  state.pendingFile = null; state.pendingUrl = null;
  $('storyTitle').value = ''; $('pastedText').value = ''; $('storyUrl').value = '';
  $('fileName').textContent = 'Chưa chọn tệp truyện'; $('addStatus').textContent = 'Truyện đã được thêm vào thư viện.';
  $('fileImportOptions').hidden = true; $('fileImportMode').value = 'new'; $('storyTitleGroup').hidden = false; $('saveStory').textContent = 'Lưu vào thư viện'; $('saveStory').disabled = false;
  persistNow(); renderLibrary(); openStory(item.id, true);
  toast('Đã lưu truyện vào máy tính.');
  return true;
}

function currentSource() {
  return document.querySelector('.source-tab.active')?.dataset.source || 'file';
}

function setSource(source) {
  document.querySelectorAll('.source-tab').forEach(button => button.classList.toggle('active', button.dataset.source === source));
  document.querySelectorAll('.source-pane').forEach(pane => pane.classList.toggle('active', pane.id === `source-${source}`));
  if ($('fileImportOptions')) refreshFileImportOptions();
}

function exitFocusMode() {
  $('appShell').classList.remove('focus');
}

function enterFocusMode() {
  $('appShell').classList.add('focus');
}

async function init() {
  try {
    const saved = await window.audioAPI.loadLibrary();
    if (Array.isArray(saved.library)) state.library = saved.library.filter(item => item && typeof item.content === 'string' && typeof item.title === 'string');
    if (saved.settings && typeof saved.settings === 'object') state.settings = { ...state.settings, ...saved.settings };
  } catch (error) { toast(`Không tải được thư viện: ${error.message}`); }
  state.settings.rate = Math.min(2.5, Math.max(0.6, Number(state.settings.rate) || 1));
  if (!Array.isArray(state.settings.replacementRules)) state.settings.replacementRules = [];
  applyTheme();
  renderReplacementRules();
  $('autoNextChapter').checked = state.settings.autoNextChapter !== false;
  renderLibrary();
  loadVoices();
  if (synth) synth.addEventListener('voiceschanged', loadVoices);
  try { const status = await window.audioAPI.getTtsStatus(); $('googleKeyStatus').textContent = status.configured ? `Đã kết nối Google Cloud · Project: ${status.projectId}.` : 'Chưa kết nối Google Cloud.'; if (status.projectId) $('googleProjectId').value = status.projectId; } catch (error) { $('googleKeyStatus').textContent = error.message; }

  document.querySelectorAll('.nav-btn').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
  document.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => showView(button.dataset.go)));
  document.querySelectorAll('.source-tab').forEach(button => button.addEventListener('click', () => setSource(button.dataset.source)));
  $('themeToggle').addEventListener('click', () => {
    state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark'; applyTheme(); scheduleSave();
  });
  $('themeSelect').addEventListener('change', event => { state.settings.theme = event.target.value; applyTheme(); scheduleSave(); });
  $('autoNextChapter').addEventListener('change', event => { state.settings.autoNextChapter = event.target.checked; scheduleSave(); });

  $('editAllStory').addEventListener('click', () => openTextEditor('full'));
  $('openReplace').addEventListener('click', () => openTextEditor('replace'));
  $('undoEdit').addEventListener('click', undoStoryEdit);
  $('closeEditor').addEventListener('click', closeTextEditor);
  $('cancelEditor').addEventListener('click', closeTextEditor);
  $('saveEditorText').addEventListener('click', saveTextEditor);
  $('applyReplacement').addEventListener('click', applyFindReplace);
  $('replaceFind').addEventListener('input', updateReplacePreview);
  $('editorScope').addEventListener('change', updateReplacePreview);
  $('addReplacementRule').addEventListener('click', () => {
    const from = $('replacementFrom').value;
    const to = $('replacementTo').value;
    if (!from.trim()) { toast('Nhập từ/cụm từ cần thay.'); return; }
    if (state.ruleEditIndex !== null && state.settings.replacementRules[state.ruleEditIndex]) {
      state.settings.replacementRules[state.ruleEditIndex] = { ...state.settings.replacementRules[state.ruleEditIndex], from, to };
      state.ruleEditIndex = null;
      toast('Đã cập nhật quy tắc thay thế.');
    } else {
      state.settings.replacementRules.push({ id: `${Date.now()}-${Math.random().toString(16).slice(2, 7)}`, from, to, enabled: true });
      toast('Đã lưu quy tắc cho nội dung truyện mới được thêm.');
    }
    $('replacementFrom').value = ''; $('replacementTo').value = ''; $('addReplacementRule').textContent = '＋ Thêm quy tắc';
    renderReplacementRules(); scheduleSave();
  });
  $('applyRulesCurrentStory').addEventListener('click', applyRulesToCurrentStory);
  $('exportSelected').addEventListener('click', async () => {
    const wantZip = $('exportZipOption').checked;
    const wantTxt = $('exportTxtOption').checked;
    if (!wantZip && !wantTxt) { toast('Hãy chọn ít nhất một định dạng xuất.'); return; }
    $('exportSelected').disabled = true;
    $('backupStatus').textContent = 'Đang chuẩn bị dữ liệu xuất...';
    const completed = [];
    const canceled = [];
    try {
      await window.audioAPI.saveLibrary({ library: state.library, settings: state.settings });
      if (wantZip) {
        $('backupStatus').textContent = 'Chọn nơi lưu file ZIP...';
        const zipResult = await window.audioAPI.exportBackupZip();
        if (zipResult.canceled) canceled.push('ZIP');
        else completed.push(`ZIP: ${zipResult.stories} truyện, ${(zipResult.bytes / 1024 / 1024).toFixed(2)} MB`);
      }
      if (wantTxt) {
        $('backupStatus').textContent = 'Chọn thư mục lưu file TXT...';
        const txtResult = await window.audioAPI.exportTextFiles($('txtExportMode').value);
        if (txtResult.canceled) canceled.push('TXT');
        else completed.push(`TXT: ${txtResult.mode === 'combined' ? '1 file gộp' : `${txtResult.files} file riêng`} · ${txtResult.stories} truyện`);
      }
      const summary = [...completed, ...canceled.map(item => `${item}: đã hủy`)].join(' | ');
      $('backupStatus').textContent = summary || 'Chưa có định dạng nào được xuất.';
      if (completed.length) toast(`Đã xuất dữ liệu: ${completed.join(' · ')}`);
    } catch (error) {
      $('backupStatus').textContent = error.message;
      toast(error.message);
    } finally { $('exportSelected').disabled = false; }
  });

  $('searchInput').addEventListener('input', renderLibrary);
  $('chooseFile').addEventListener('click', async () => {
    try {
      const result = await window.audioAPI.openTextFile();
      if (!result) return;
      state.pendingFile = result;
      $('fileName').textContent = result.name;
      $('storyTitle').value = result.name;
      $('addStatus').textContent = `Đã đọc ${result.content.length.toLocaleString('vi-VN')} ký tự từ tệp.`;
      refreshFileImportOptions();
    } catch (error) { toast(error.message); }
  });
  $('fileImportMode').addEventListener('change', refreshFileImportOptions);
  $('appendTargetStory').addEventListener('change', refreshFileImportOptions);
  $('duplicateChapterMode').addEventListener('change', refreshFileImportOptions);

  $('fetchUrl').addEventListener('click', async () => {
    const url = $('storyUrl').value.trim();
    if (!url) { toast('Nhập địa chỉ website trước.'); return; }
    $('fetchUrl').disabled = true; $('fetchUrl').textContent = 'Đang tải...';
    try {
      const result = await window.audioAPI.importWebsite(url);
      if (!result.content || result.content.length < 80) throw new Error('Không tìm thấy đủ văn bản có thể đọc trên trang này.');
      state.pendingUrl = result;
      if (!$('storyTitle').value.trim()) $('storyTitle').value = result.title;
      $('addStatus').textContent = `Đã lấy ${result.content.length.toLocaleString('vi-VN')} ký tự. Nhấn “Lưu vào thư viện” để hoàn tất.`;
      toast('Đã lấy nội dung website.');
    } catch (error) { toast(error.message); }
    finally { $('fetchUrl').disabled = false; $('fetchUrl').textContent = 'Lấy nội dung'; }
  });
  $('saveStory').addEventListener('click', () => {
    const source = currentSource();
    if (source === 'file' && $('fileImportMode').value === 'append') {
      appendFileToExistingStory();
      return;
    }
    let content = '', title = $('storyTitle').value.trim(), origin = source;
    if (source === 'file') {
      if (!state.pendingFile) { toast('Hãy chọn tệp TXT trước.'); return; }
      content = state.pendingFile.content; title ||= state.pendingFile.name; origin = 'file';
    } else if (source === 'paste') {
      content = $('pastedText').value; origin = 'paste';
    } else {
      if (!state.pendingUrl) { toast('Hãy nhấn “Lấy nội dung” trước.'); return; }
      content = state.pendingUrl.content; title ||= state.pendingUrl.title; origin = 'url';
    }
    addStory(title, content, origin);
  });

  $('playPause').addEventListener('click', togglePlayback);
  $('miniPlay').addEventListener('click', togglePlayback);
  $('back10').addEventListener('click', () => skipApprox(-10));
  $('forward10').addEventListener('click', () => skipApprox(10));
  $('previousChapter').addEventListener('click', () => jumpChapter(-1));
  $('nextChapter').addEventListener('click', () => jumpChapter(1));
  $('chapterSelect').addEventListener('change', event => {
    const chapter = state.chapters[Number(event.target.value)]; if (chapter) seekTo(chapter.start);
  });
  $('progressSlider').addEventListener('input', event => {
    state.isSeeking = true;
    const story = activeStory(); if (!story) return;
    const pos = Math.round(Number(event.target.value) / 1000 * story.content.length);
    $('progressPercent').textContent = `${Math.round(pos / Math.max(story.content.length, 1) * 100)}%`;
  });
  $('progressSlider').addEventListener('change', event => {
    const story = activeStory(); state.isSeeking = false;
    if (story) seekTo(Math.round(Number(event.target.value) / 1000 * story.content.length));
  });
  $('rateSlider').addEventListener('input', event => {
    state.settings.rate = Number(event.target.value); $('rateValue').textContent = `${state.settings.rate.toFixed(1)}×`; scheduleSave();
    if (state.isPlaying) { const pos = state.position; speakFrom(pos); }
  });
  $('rateSlider').value = String(state.settings.rate);
  $('rateValue').textContent = `${Number(state.settings.rate).toFixed(1)}×`;
  const changeVoice = value => {
    if (state.settings.engine === 'windows') state.settings.voiceURI = value;
    else state.settings.googleVoice = value || (state.settings.engine === 'google-ai' ? 'vi-VN-Chirp3-HD-Aoede' : 'vi-VN-Standard-A');
    $('voiceSelect').value = value; $('settingsVoice').value = value; scheduleSave();
    if (state.isPlaying) speakFrom(state.position);
  };
  $('voiceSelect').addEventListener('change', event => changeVoice(event.target.value));
  $('settingsVoice').addEventListener('change', event => changeVoice(event.target.value));
  $('engineSelect').addEventListener('change', event => setEngine(event.target.value));
  $('settingsEngine').addEventListener('change', event => setEngine(event.target.value));

  $('connectGoogle').addEventListener('click', async () => {
    const clientId = $('googleClientId').value.trim();
    const projectId = $('googleProjectId').value.trim();
    if (!clientId || !projectId) { toast('Nhập OAuth Client ID và Project ID trước.'); return; }
    $('connectGoogle').disabled = true; $('googleKeyStatus').textContent = 'Đang mở trình duyệt để đăng nhập Google...';
    try {
      await window.audioAPI.connectGoogle({ clientId, projectId });
      $('googleKeyStatus').textContent = `Đã kết nối Google Cloud · Project: ${projectId}.`;
      toast('Đã kết nối tài khoản Google.');
    } catch (error) { $('googleKeyStatus').textContent = error.message; toast(error.message); }
    finally { $('connectGoogle').disabled = false; }
  });
  $('testGoogleKey').addEventListener('click', async () => {
    $('testGoogleKey').disabled = true; $('googleKeyStatus').textContent = 'Đang kiểm tra kết nối Google Cloud...';
    try {
      await window.audioAPI.testTtsKey();
      $('googleKeyStatus').textContent = 'Kết nối thành công. Google Cloud TTS đã sẵn sàng.';
      toast('Kết nối Google Cloud thành công.');
    } catch (error) { $('googleKeyStatus').textContent = error.message; toast(error.message); }
    finally { $('testGoogleKey').disabled = false; }
  });
  $('clearGoogleKey').addEventListener('click', async () => {
    try { await window.audioAPI.clearTtsKey(); $('googleKeyStatus').textContent = 'Đã ngắt kết nối Google và xóa thông tin xác thực khỏi máy này.'; toast('Đã ngắt kết nối Google.'); }
    catch (error) { toast(error.message); }
  });
  $('focusMode').addEventListener('click', enterFocusMode);
  $('exitFocus').addEventListener('click', exitFocusMode);
  $('backLibrary').addEventListener('click', () => showView('library'));
  $('clearLibrary').addEventListener('click', async () => {
    if (!state.library.length) { toast('Thư viện hiện đang trống.'); return; }
    if (!confirm('Xóa toàn bộ truyện và tiến độ đã lưu trên máy này? Thao tác này không thể hoàn tác.')) return;
    stopSpeech(false); state.library = []; state.activeId = null; state.position = 0;
    await persistNow(); renderLibrary();
    $('nowTitle').textContent = 'Chưa chọn truyện'; $('readingTitle').textContent = 'Chưa chọn truyện'; $('miniTitle').textContent = 'Chưa phát truyện';
    $('readingContent').innerHTML = '<div class="reading-placeholder"><span>♫</span><p>Nội dung truyện sẽ hiển thị tại đây.</p></div>';
    toast('Đã xóa thư viện.');
  });

  window.addEventListener('beforeunload', () => {
    if (activeStory()) activeStory().progress = state.position;
    try { window.audioAPI.saveLibrary({ library: state.library, settings: state.settings }); } catch {}
    if (synth) synth.cancel();
  });
  document.addEventListener('keydown', event => {
    if (event.code === 'Space' && !['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(document.activeElement.tagName)) {
      event.preventDefault(); togglePlayback();
    }
    if (event.key === 'Escape') exitFocusMode();
  });
  if (state.library.length) {
    const recent = state.library.find(item => item.progress > 0) || state.library[0];
    openStory(recent.id, false);
  }
}

init();
