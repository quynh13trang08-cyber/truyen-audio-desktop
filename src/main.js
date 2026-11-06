const { app, BrowserWindow, ipcMain, dialog, net } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
