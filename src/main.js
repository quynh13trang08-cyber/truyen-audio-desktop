const { app, BrowserWindow, ipcMain, dialog, net, safeStorage, shell } = require('electron');
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');
const cheerio = require('cheerio');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: '#101722',
    title: 'Truyện Audio',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

function dataFile() {
  return path.join(app.getPath('userData'), 'library.json');
}

ipcMain.handle('library:load', async () => {
  try {
    const raw = await fs.readFile(dataFile(), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : { library: [], settings: {} };
  } catch {
    return { library: [], settings: {} };
  }
});

ipcMain.handle('library:save', async (_event, data) => {
  if (!data || typeof data !== 'object' || !Array.isArray(data.library)) {
    throw new Error('Dữ liệu thư viện không hợp lệ.');
  }
  // Giới hạn kích thước tránh ghi nhầm dữ liệu quá lớn vào hồ sơ ứng dụng.
  const serialized = JSON.stringify(data);
  if (serialized.length > 80 * 1024 * 1024) {
    throw new Error('Thư viện quá lớn (giới hạn 80 MB).');
  }
  const file = dataFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  await fs.writeFile(temp, serialized, 'utf8');
  await fs.rename(temp, file);
  return true;
});

ipcMain.handle('file:open-text', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Chọn tệp truyện',
    properties: ['openFile'],
    filters: [{ name: 'Tệp văn bản', extensions: ['txt', 'md', 'text'] }]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  const stat = await fs.stat(filePath);
  if (stat.size > 20 * 1024 * 1024) throw new Error('Tệp vượt quá giới hạn 20 MB.');
  const content = (await fs.readFile(filePath, 'utf8')).replace(/^\uFEFF/, '');
  return { name: path.basename(filePath).replace(/\.(txt|md|text)$/i, ''), content };
});



function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function toDosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  };
}

function makeZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const stamp = toDosDateTime();
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const source = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(String(entry.data), 'utf8');
    const compressed = zlib.deflateRawSync(source, { level: 6 });
    const crc = crc32(source);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(stamp.time, 10);
    local.writeUInt16LE(stamp.date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(source.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(stamp.time, 12);
    central.writeUInt16LE(stamp.date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(source.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + compressed.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

ipcMain.handle('backup:export-zip', async () => {
  const data = await (async () => {
    try { return JSON.parse(await fs.readFile(dataFile(), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return { library: [], settings: {} }; throw error; }
  })();
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Xuất bản sao lưu Truyện Audio',
    defaultPath: `TruyenAudio-Backup-${new Date().toISOString().slice(0, 10)}.zip`,
    filters: [{ name: 'Tệp ZIP', extensions: ['zip'] }]
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  const backup = {
    format: 'truyen-audio-backup', version: 1, exportedAt: new Date().toISOString(),
    library: Array.isArray(data.library) ? data.library : [],
    settings: data.settings && typeof data.settings === 'object' ? data.settings : {}
  };
  const zip = makeZip([{ name: 'backup.json', data: JSON.stringify(backup) }]);
  await fs.writeFile(result.filePath, zip);
  return { canceled: false, filePath: result.filePath, stories: backup.library.length, bytes: zip.length };
});

function ttsCredentialsFile() {
  return path.join(app.getPath('userData'), 'google-tts-credentials.enc');
}

function ttsCacheFile(text, engine, voice, rate) {
  const cacheKey = crypto.createHash('sha256').update(JSON.stringify([text, engine, voice, engine === 'google-standard' ? rate : 1])).digest('hex');
  return path.join(app.getPath('userData'), 'tts-cache', `${cacheKey}.mp3`);
}

async function readTtsCredentials() {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows chưa bật được bộ mã hóa an toàn để lưu thông tin Google.');
  try {
    const encrypted = await fs.readFile(ttsCredentialsFile());
    return JSON.parse(safeStorage.decryptString(encrypted));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error('Không đọc được thông tin Google đã lưu. Hãy kết nối lại tài khoản.');
  }
}

async function writeTtsCredentials(credentials) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Không thể mã hóa thông tin Google trên máy này.');
  const encrypted = safeStorage.encryptString(JSON.stringify(credentials));
  await fs.writeFile(ttsCredentialsFile(), encrypted, { mode: 0o600 });
}

async function connectGoogleAccount(clientId, projectId) {
  if (!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(clientId)) throw new Error('OAuth Client ID không đúng định dạng của Google.');
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)) throw new Error('Project ID không đúng định dạng.');

  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const oauthState = crypto.randomBytes(24).toString('hex');
  const server = http.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    access_type: 'offline',
    prompt: 'consent',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: oauthState
  }).toString();

  try {
    await shell.openExternal(authUrl.toString());
    const code = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Hết thời gian chờ đăng nhập Google.')), 180000);
      server.on('request', (req, res) => {
        const callback = new URL(req.url, redirectUri);
        if (callback.pathname !== '/oauth2callback') { res.writeHead(404).end(); return; }
        const oauthError = callback.searchParams.get('error');
        const authCode = callback.searchParams.get('code');
        const returnedState = callback.searchParams.get('state');
        res.writeHead(oauthError || !authCode ? 400 : 200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<h2>${oauthError || !authCode ? 'Không thể kết nối Google' : 'Đã kết nối Google'}</h2><p>Bạn có thể quay lại ứng dụng Truyện Audio.</p>`);
        clearTimeout(timer);
        if (oauthError || !authCode || returnedState !== oauthState) reject(new Error(`Google không cấp quyền hoặc xác thực không khớp: ${oauthError || 'state/code không hợp lệ'}`));
        else resolve(authCode);
      });
    });
    const tokenResponse = await net.fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, code, code_verifier: verifier, grant_type: 'authorization_code', redirect_uri: redirectUri }).toString()
    });
    const tokenData = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !tokenData.access_token) throw new Error(tokenData.error_description || tokenData.error || 'Không đổi được mã đăng nhập thành access token.');
    if (!tokenData.refresh_token) throw new Error('Google không cấp refresh token. Hãy thu hồi quyền ứng dụng trong tài khoản Google rồi kết nối lại.');
    await writeTtsCredentials({
      clientId, projectId, refreshToken: tokenData.refresh_token || '',
      accessToken: tokenData.access_token, expiresAt: Date.now() + (Number(tokenData.expires_in) || 3600) * 1000
    });
    return { connected: true };
  } finally {
    server.close();
  }
}

async function getGoogleAccessToken() {
  const credentials = await readTtsCredentials();
  if (!credentials?.refreshToken || !credentials?.clientId || !credentials?.projectId) {
    throw new Error('Chưa kết nối tài khoản Google. Mở Cài đặt → Giọng Google để kết nối.');
  }
  if (credentials.accessToken && credentials.expiresAt > Date.now() + 60000) return credentials.accessToken;
  const response = await net.fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: credentials.clientId, refresh_token: credentials.refreshToken, grant_type: 'refresh_token' }).toString()
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error(data.error_description || data.error || 'Phiên Google hết hạn. Hãy kết nối lại tài khoản.');
  credentials.accessToken = data.access_token;
  credentials.expiresAt = Date.now() + (Number(data.expires_in) || 3600) * 1000;
  await writeTtsCredentials(credentials);
  return credentials.accessToken;
}

async function googleSynthesize({ text, engine, voice, rate }) {
  const cleanText = String(text || '').trim();
  if (!cleanText) throw new Error('Không có nội dung để chuyển thành giọng nói.');
  if (cleanText.length > 4500) throw new Error('Đoạn văn quá dài. Hãy chia nhỏ nội dung trước khi gửi.');
  if (!['google-standard', 'google-ai'].includes(engine)) throw new Error('Chế độ giọng Google không hợp lệ.');
  const defaultVoice = engine === 'google-ai' ? 'vi-VN-Chirp3-HD-Aoede' : 'vi-VN-Standard-A';
  const selectedVoice = String(voice || defaultVoice);
  const validVoice = engine === 'google-ai'
    ? /^vi-VN-Chirp3-HD-[A-Za-z]+$/.test(selectedVoice)
    : /^vi-VN-(Standard|Wavenet|Neural2)-[A-D]$/.test(selectedVoice);
  if (!validVoice) throw new Error('Giọng đọc đã chọn không hợp lệ.');
  const cacheFile = ttsCacheFile(cleanText, engine, selectedVoice, rate);
  try { return (await fs.readFile(cacheFile)).toString('base64'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const credentials = await readTtsCredentials();
  const accessToken = await getGoogleAccessToken();
  const body = {
    input: { text: cleanText },
    voice: { languageCode: 'vi-VN', name: selectedVoice },
    audioConfig: { audioEncoding: 'MP3' }
  };
  if (engine === 'google-standard') body.audioConfig.speakingRate = Math.max(0.25, Math.min(4, Number(rate) || 1));
  const response = await net.fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}`, 'x-goog-user-project': credentials.projectId },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `Google Cloud trả về mã ${response.status}.`;
    if (response.status === 401 || response.status === 403) throw new Error(`Google từ chối quyền truy cập hoặc API chưa được bật: ${message}`);
    throw new Error(message);
  }
  if (!payload.audioContent) throw new Error('Google không trả về dữ liệu âm thanh.');
  await fs.mkdir(path.dirname(cacheFile), { recursive: true });
  await fs.writeFile(cacheFile, Buffer.from(payload.audioContent, 'base64'));
  return payload.audioContent;
}

ipcMain.handle('tts:status', async () => {
  const credentials = await readTtsCredentials();
  return { configured: Boolean(credentials?.refreshToken), projectId: credentials?.projectId || '' };
});
ipcMain.handle('tts:connect', async (_event, details) => {
  return connectGoogleAccount(String(details?.clientId || '').trim(), String(details?.projectId || '').trim());
});
ipcMain.handle('tts:clear-key', async () => {
  await fs.rm(ttsCredentialsFile(), { force: true });
  return { configured: false };
});
ipcMain.handle('tts:test-key', async () => {
  await googleSynthesize({ text: 'Xin chào, đây là giọng đọc thử của Truyện Audio.', engine: 'google-standard', voice: 'vi-VN-Standard-A', rate: 1 });
  return { success: true };
});
ipcMain.handle('tts:synthesize', async (_event, options) => {
  if (!options || typeof options !== 'object') throw new Error('Yêu cầu chuyển giọng không hợp lệ.');
  return { audioContent: await googleSynthesize(options) };
});


function extractChapterContent(html, pageUrl) {
  const $ = cheerio.load(html, { decodeEntities: true });
  const pageTitle = $('meta[property="og:title"]').attr('content') || $('title').first().text() || new URL(pageUrl).hostname;

  // Bỏ các thành phần chắc chắn không thuộc thân chương và những khối giao diện phổ biến.
  $('script,style,noscript,svg,iframe,header,footer,nav,aside,form,button,input,select,textarea,canvas,video,audio,source,figure,figcaption,[hidden],[aria-hidden="true"]').remove();
  const noisePattern = /(sidebar|side-bar|widget|comment|reply|related|recommend|suggest|advert|(^|[-_\s])ads?($|[-_\s])|banner|toolbar|breadcrumb|pagination|social|share|menu|navbar|navigation|footer|header|author-box|rating|catalog|ranking|chapter-list|list-chapter)/i;
  $('[id], [class]').each((_index, element) => {
    const marker = `${$(element).attr('id') || ''} ${$(element).attr('class') || ''}`;
    if (noisePattern.test(marker)) $(element).remove();
  });

  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const semanticPattern = /(chapter|reading|reader|story|novel|book|truyen|chuong|content|txt|text|entry|post|article|chapter-c|box-chap)/i;
  const candidates = [];
  $('article, main, [itemprop="articleBody"], [id], [class]').each((_index, element) => {
    const tag = String(element.tagName || '').toLowerCase();
    if (!tag || tag === 'body' || tag === 'html') return;
    const node = $(element);
    const marker = `${node.attr('id') || ''} ${node.attr('class') || ''} ${node.attr('itemprop') || ''}`;
    const text = node.text().replace(/\s+/g, ' ').trim();
    if (text.length < 100 || text.length > 2_000_000) return;
    const paragraphs = node.find('p').length;
    const linksText = node.find('a').toArray().reduce((sum, a) => sum + $(a).text().trim().length, 0);
    const linkRatio = linksText / Math.max(text.length, 1);
    const semantic = semanticPattern.test(marker) || tag === 'article' || (tag === 'main' && paragraphs >= 2) || node.attr('itemprop') === 'articleBody';
    if (!semantic || linkRatio > 0.30) return;
    const bodyRatio = text.length / Math.max(bodyText.length, 1);
    if (bodyRatio > 0.94 && tag !== 'article' && node.attr('itemprop') !== 'articleBody') return;
    const score = Math.log(text.length) * 8 + Math.min(paragraphs, 80) * 2.5 + (tag === 'article' ? 18 : 0) + (node.attr('itemprop') === 'articleBody' ? 32 : 0) + (/(chapter|reader|reading|truyen|chuong|txt|story)/i.test(marker) ? 24 : 0) - linkRatio * 100 - Math.max(0, bodyRatio - 0.75) * 90;
    candidates.push({ element, textLength: text.length, paragraphs, score, marker, tag });
  });

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best || best.textLength < 120 || (best.paragraphs < 2 && !/(chapter|reader|reading|truyen|chuong|txt|story)/i.test(best.marker))) {
    throw new Error('Không xác định chắc chắn được vùng nội dung chương truyện. App không lấy toàn bộ trang để tránh lẫn menu, quảng cáo hoặc nội dung bên cạnh.');
  }

  const content = $(best.element).clone();
  // Loại các tiêu đề trang/chương được nhúng trong vùng đọc; tên truyện/chương không phải nội dung cần đọc.
  content.find('h1,h2,h3,.chapter-title,.title-chapter,.book-title,.story-title,.entry-title').each((_index, heading) => {
    const headingText = $(heading).text().trim();
    if (_index < 3 || headingText.length < 180) $(heading).remove();
  });
  content.find('a').each((_index, link) => {
    const href = String($(link).attr('href') || '').trim();
    const linkText = $(link).text().trim();
    if (!linkText || /^(next|previous|prev|tiếp|trước|mục lục|danh sách chương)$/i.test(linkText) || /chapter|chuong/i.test(href)) $(link).remove();
  });

  let textHtml = content.html() || '';
  textHtml = textHtml
    .replace(/<(br|hr)\b[^>]*>/gi, '\n')
    .replace(/<\/(p|div|section|article|blockquote|li|h[1-6])\s*>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ');
  const decoded = cheerio.load(`<div>${textHtml}</div>`).text();
  const normalized = decoded
    .replace(/\u00a0/g, ' ')
    .replace(/[\t\r ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n\n')
    .trim();
  if (normalized.length < 100) throw new Error('Vùng nội dung tìm được quá ngắn; app đã từ chối lấy cả trang web.');
  return { title: String(pageTitle).replace(/\s+/g, ' ').trim().slice(0, 160), content: normalized };
}

function isPrivateHost(hostname) {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return h === 'localhost' || h.endsWith('.localhost') || h === '::1' ||
    /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) ||
    /^169\.254\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h);
}

ipcMain.handle('web:import', async (_event, rawUrl) => {
  function validatePublicUrl(value) {
    let parsed;
    try { parsed = new URL(String(value)); } catch { throw new Error('Đường dẫn website không hợp lệ.'); }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Chỉ hỗ trợ địa chỉ bắt đầu bằng http:// hoặc https://.');
    if (parsed.username || parsed.password) throw new Error('Không hỗ trợ URL có thông tin đăng nhập.');
    if (isPrivateHost(parsed.hostname)) throw new Error('Không thể đọc địa chỉ mạng nội bộ.');
    return parsed;
  }

  let url = validatePublicUrl(rawUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    let response;
    // Tự xử lý redirect để kiểm tra lại đích đến, tránh chuyển hướng sang mạng nội bộ.
    for (let redirects = 0; redirects <= 5; redirects++) {
      response = await net.fetch(url.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TruyenAudioDesktop/1.0)' }
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get('location');
      if (!location) throw new Error('Website chuyển hướng không hợp lệ.');
      if (redirects === 5) throw new Error('Website chuyển hướng quá nhiều lần.');
      url = validatePublicUrl(new URL(location, url).toString());
    }
    if (!response || !response.ok) throw new Error(`Website trả về mã ${response?.status || 'không xác định'}.`);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/') && !contentType.includes('application/xhtml')) {
      throw new Error('Trang này không trả về nội dung HTML/văn bản có thể đọc.');
    }
    const html = await response.text();
    if (html.length > 8 * 1024 * 1024) throw new Error('Trang quá lớn để nhập (giới hạn 8 MB).');
    const extracted = extractChapterContent(html, url.toString());
    return { ...extracted, sourceUrl: url.toString() };
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Đã hết thời gian chờ khi tải trang.');
    throw new Error(error.message || 'Không thể tải nội dung website.');
  } finally {
    clearTimeout(timeout);
  }
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
