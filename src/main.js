const { app, BrowserWindow, ipcMain, dialog, net, safeStorage, shell } = require('electron');
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

let mainWindow;
let syncServer = null;
let syncPin = '';
let syncToken = '';
const SYNC_PORT = 38741;
const syncAttempts = new Map();

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


function isPrivateLanAddress(address) {
  const ip = String(address || '').replace(/^::ffff:/, '').toLowerCase();
  return /^127\./.test(ip) || /^10\./.test(ip) || /^192\.168\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    /^169\.254\./.test(ip) || ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80:');
}

function getLanAddresses() {
  const found = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const item of entries || []) {
      if (item.family === 'IPv4' && !item.internal && isPrivateLanAddress(item.address)) found.push(item.address);
    }
  }
  return [...new Set(found)];
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(body);
}

async function readLibraryForSync() {
  const raw = await fs.readFile(dataFile(), 'utf8');
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed?.library) ? parsed.library : [];
}

async function startSyncServer() {
  if (syncServer) return { running: true, port: SYNC_PORT, addresses: getLanAddresses(), pin: syncPin };
  // Lưu tiến độ/thư viện hiện tại trước khi mở API cho điện thoại.
  syncPin = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  syncToken = crypto.randomBytes(32).toString('hex');
  syncServer = http.createServer(async (req, res) => {
    const remote = req.socket.remoteAddress || '';
    if (!isPrivateLanAddress(remote)) return sendJson(res, 403, { error: 'Chỉ cho phép thiết bị trong mạng nội bộ.' });
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (req.method === 'POST' && pathname === '/pair') {
      const now = Date.now();
      const attempt = syncAttempts.get(remote) || { count: 0, blockedUntil: 0 };
      if (attempt.blockedUntil > now) return sendJson(res, 429, { error: 'Tạm khóa thử mã PIN. Hãy chờ 5 phút.' });
      let raw = '';
      try {
        for await (const chunk of req) {
          raw += chunk.toString('utf8');
          if (raw.length > 2048) { req.destroy(); return; }
        }
        const data = JSON.parse(raw || '{}');
        if (String(data.pin || '') !== syncPin) {
          attempt.count += 1;
          if (attempt.count >= 5) { attempt.count = 0; attempt.blockedUntil = now + 5 * 60 * 1000; }
          syncAttempts.set(remote, attempt);
          return sendJson(res, 401, { error: 'Mã PIN không đúng.' });
        }
        syncAttempts.delete(remote);
        return sendJson(res, 200, { token: syncToken, app: 'Truyen Audio Desktop', version: '1.3.0' });
      } catch {
        return sendJson(res, 400, { error: 'Yêu cầu ghép nối không hợp lệ.' });
      }
    }

    const auth = String(req.headers.authorization || '');
    if (!syncToken || auth !== `Bearer ${syncToken}`) return sendJson(res, 401, { error: 'Thiết bị chưa ghép nối hoặc phiên đã hết hạn.' });

    if (req.method === 'GET' && pathname === '/api/stories') {
      try {
        const library = await readLibraryForSync();
        const stories = library.filter(item => item && typeof item.id === 'string' && typeof item.title === 'string' && typeof item.content === 'string')
          .map(item => ({ id: item.id, title: item.title, source: item.source || '', createdAt: item.createdAt || '', progress: Number(item.progress) || 0, characters: item.content.length }));
        return sendJson(res, 200, { stories });
      } catch {
        return sendJson(res, 500, { error: 'Không đọc được thư viện trên máy tính.' });
      }
    }

    const match = pathname.match(/^\/api\/stories\/([A-Za-z0-9._~-]+)$/);
    if (req.method === 'GET' && match) {
      try {
        const id = decodeURIComponent(match[1]);
        const library = await readLibraryForSync();
        const story = library.find(item => item && item.id === id && typeof item.content === 'string');
        if (!story) return sendJson(res, 404, { error: 'Không tìm thấy truyện.' });
        const body = JSON.stringify({ id: story.id, title: story.title, content: story.content, source: story.source || '', createdAt: story.createdAt || '', progress: Number(story.progress) || 0 });
        if (Buffer.byteLength(body) > 20 * 1024 * 1024) return sendJson(res, 413, { error: 'Truyện vượt quá giới hạn tải 20 MB.' });
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        return res.end(body);
      } catch {
        return sendJson(res, 500, { error: 'Không tải được nội dung truyện.' });
      }
    }
    return sendJson(res, 404, { error: 'Không tìm thấy API.' });
  });

  try {
    await new Promise((resolve, reject) => {
      syncServer.once('error', reject);
      syncServer.listen(SYNC_PORT, '0.0.0.0', resolve);
    });
  } catch (error) {
    syncServer = null; syncPin = ''; syncToken = '';
    if (error.code === 'EADDRINUSE') throw new Error(`Cổng ${SYNC_PORT} đang được ứng dụng khác sử dụng. Hãy đóng ứng dụng đó rồi thử lại.`);
    throw new Error(`Không thể mở máy chủ Wi-Fi: ${error.message}`);
  }
  return { running: true, port: SYNC_PORT, addresses: getLanAddresses(), pin: syncPin };
}

async function stopSyncServer() {
  if (syncServer) {
    const server = syncServer;
    syncServer = null;
    await new Promise(resolve => server.close(() => resolve()));
  }
  syncPin = ''; syncToken = ''; syncAttempts.clear();
  return { running: false };
}

ipcMain.handle('sync:start', async () => startSyncServer());
ipcMain.handle('sync:stop', async () => stopSyncServer());
ipcMain.handle('sync:status', async () => ({ running: Boolean(syncServer), port: SYNC_PORT, addresses: getLanAddresses(), pin: syncPin }));

function decodeEntities(text) {
  const named = {
    '&nbsp;': ' ', '&amp;': '&', '&quot;': '"', '&#39;': "'", '&apos;': "'",
    '&lt;': '<', '&gt;': '>', '&hellip;': '…', '&ndash;': '–', '&mdash;': '—'
  };
  return text
    .replace(/&(?:nbsp|amp|quot|#39|apos|lt|gt|hellip|ndash|mdash);/gi, m => named[m.toLowerCase()] ?? m)
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Math.min(Number(n), 0x10ffff)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(Math.min(parseInt(n, 16), 0x10ffff)));
}

function htmlToText(html) {
  let cleaned = String(html)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|iframe|header|footer|nav|aside)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|hr)\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|article|section|h[1-6]|li|blockquote|tr)>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ');
  cleaned = decodeEntities(cleaned).replace(/[\t\r ]+/g, ' ').replace(/ *\n */g, '\n');
  return cleaned.split('\n').map(line => line.trim()).filter(Boolean).join('\n\n').trim();
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
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
    return { title: title ? decodeEntities(title.replace(/<[^>]+>/g, '')).trim() : url.hostname, content: htmlToText(html) };
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

app.on('before-quit', () => {
  if (syncServer) { try { syncServer.close(); } catch {} syncServer = null; }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
