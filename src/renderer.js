'use strict';

const $ = (id) => document.getElementById(id);
const synth = window.speechSynthesis;
const state = {
  library: [], settings: { theme: 'dark', rate: 1, voiceURI: '' },
  activeId: null, activeView: 'library', voices: [], chunks: [], chapters: [],
  position: 0, chunkIndex: 0, utterance: null, isPlaying: false,
  pendingFile: null, pendingUrl: null, saveTimer: null, toastTimer: null,
  isSeeking: false
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

function splitIntoChunks(text, maxLength = 230) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxLength, text.length);
    if (end < text.length) {
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

function findChapters(text) {
  const chapters = [{ title: 'Bắt đầu truyện', start: 0 }];
  const lines = text.split(/\n/);
  let offset = 0;
  const pattern = /^\s*((chương|chapter|hồi|phần|quyển|tập)\s+[^\n]{1,90})\s*$/i;
  for (const line of lines) {
    const match = line.match(pattern);
    if (match && offset > 0) {
      chapters.push({ title: line.trim(), start: offset });
    }
    offset += line.length + 1;
  }
  return chapters.length > 1 ? chapters : [{ title: 'Toàn bộ truyện', start: 0 }];
}

function renderReadingContent(story) {
  const container = $('readingContent');
  container.replaceChildren();
  const parts = story.content.split(/\n\s*\n/);
  let offset = 0;
  parts.forEach(part => {
    const p = document.createElement('p');
    p.textContent = part;
    p.dataset.start = offset;
    container.append(p);
    offset += part.length + 2;
  });
  updateActiveParagraph();
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
  state.chunks = splitIntoChunks(story.content);
  state.chapters = findChapters(story.content);
  $('nowTitle').textContent = story.title;
  $('nowMeta').textContent = `${wordCount(story.content).toLocaleString('vi-VN')} từ · Đã lưu trên thiết bị`;
  $('readingTitle').textContent = story.title;
  $('miniTitle').textContent = story.title;
  $('playPause').textContent = '▶';
  $('miniPlay').textContent = '▶';
  renderReadingContent(story);
  renderChapters();
  updateProgress();
  renderLibrary();
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

function loadVoices() {
  state.voices = synth ? synth.getVoices() : [];
  const selects = [$('voiceSelect'), $('settingsVoice')];
  selects.forEach(select => {
    const current = state.settings.voiceURI;
    select.replaceChildren();
    const auto = document.createElement('option'); auto.value = ''; auto.textContent = 'Tự động chọn giọng phù hợp'; select.append(auto);
    const sorted = [...state.voices].sort((a, b) => {
      const av = /^vi([_-]|$)/i.test(a.lang) ? 0 : 1;
      const bv = /^vi([_-]|$)/i.test(b.lang) ? 0 : 1;
      return av - bv || a.name.localeCompare(b.name);
    });
    sorted.forEach(voice => {
      const option = document.createElement('option');
      option.value = voice.voiceURI;
      option.textContent = `${voice.name} (${voice.lang})${voice.default ? ' · Mặc định' : ''}`;
      select.append(option);
    });
    select.value = current;
  });
  const hasVi = state.voices.some(voice => /^vi([_-]|$)/i.test(voice.lang));
  $('voiceHelp').textContent = hasVi
    ? 'Đã tìm thấy giọng có mã ngôn ngữ tiếng Việt. Chọn giọng trong trình phát để nghe thử.'
    : 'Chưa phát hiện giọng tiếng Việt. Hãy cài gói giọng tiếng Việt trong Windows: Cài đặt → Thời gian & ngôn ngữ → Ngôn ngữ & khu vực → Tùy chọn ngôn ngữ → Văn bản thành giọng nói.';
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
  if (!state.voices.length) loadVoices();
  if (!state.voices.length) {
    toast('Windows chưa cung cấp giọng đọc. Hãy kiểm tra cài đặt giọng nói.');
    return;
  }
  synth.cancel();
  state.position = Math.max(0, Math.min(globalPosition, story.content.length));
  if (state.position >= story.content.length) state.position = 0;
  state.chunkIndex = state.chunks.findIndex(chunk => chunk.start + chunk.text.length > state.position);
  if (state.chunkIndex < 0) state.chunkIndex = 0;
  speakCurrentChunk();
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
    if (state.chunkIndex < state.chunks.length) speakCurrentChunk();
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
  if (synth) synth.cancel();
  state.utterance = null;
  setPlaying(false);
  if (save && activeStory()) updateProgress();
}

function togglePlayback() {
  if (!activeStory()) { toast('Hãy chọn một truyện trước.'); showView('library'); return; }
  if (state.isPlaying) {
    synth.pause(); setPlaying(false); updateProgress();
  } else if (synth.paused && state.utterance) {
    synth.resume(); setPlaying(true);
  } else {
    speakFrom(state.position);
  }
}

function seekTo(position) {
  if (!activeStory()) return;
  state.position = Math.max(0, Math.min(position, activeStory().content.length));
  if (state.isPlaying || state.utterance) {
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

function addStory(title, content, source) {
  const clean = String(content || '').trim();
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
  applyTheme();
  renderLibrary();
  loadVoices();
  if (synth) synth.addEventListener('voiceschanged', loadVoices);

  document.querySelectorAll('.nav-btn').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
  document.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => showView(button.dataset.go)));
  document.querySelectorAll('.source-tab').forEach(button => button.addEventListener('click', () => setSource(button.dataset.source)));
  $('themeToggle').addEventListener('click', () => {
    state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark'; applyTheme(); scheduleSave();
  });
  $('themeSelect').addEventListener('change', event => { state.settings.theme = event.target.value; applyTheme(); scheduleSave(); });
  $('searchInput').addEventListener('input', renderLibrary);
  $('chooseFile').addEventListener('click', async () => {
    try {
      const result = await window.audioAPI.openTextFile();
      if (!result) return;
      state.pendingFile = result;
      $('fileName').textContent = result.name;
      $('storyTitle').value = result.name;
      $('addStatus').textContent = `Đã đọc ${result.content.length.toLocaleString('vi-VN')} ký tự từ tệp.`;
    } catch (error) { toast(error.message); }
  });
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
  $('voiceSelect').addEventListener('change', event => {
    state.settings.voiceURI = event.target.value; $('settingsVoice').value = event.target.value; scheduleSave();
    if (state.isPlaying) speakFrom(state.position);
  });
  $('settingsVoice').addEventListener('change', event => {
    state.settings.voiceURI = event.target.value; $('voiceSelect').value = event.target.value; scheduleSave();
    if (state.isPlaying) speakFrom(state.position);
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
