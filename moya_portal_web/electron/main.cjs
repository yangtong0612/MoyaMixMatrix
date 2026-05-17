const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const fsSync = require('node:fs');
const fs = require('node:fs/promises');
const { execFile, execFileSync } = require('node:child_process');
const { createHash, randomUUID } = require('node:crypto');
const { fileURLToPath, pathToFileURL } = require('node:url');
const { Readable } = require('node:stream');
const { TextDecoder } = require('node:util');
const { app, BrowserWindow, Menu, dialog, ipcMain, net, protocol, shell } = require('electron');
const Store = require('electron-store');
const bundledFfmpegPath = require('ffmpeg-static');
const bundledFfprobePath = require('ffprobe-static').path;
const ffmpegPath = resolveMediaToolPath('FFMPEG_BIN', [
  process.env.FFMPEG_BIN,
  'C:\\Users\\HUAWEI\\choco\\bin\\ffmpeg.exe',
  bundledFfmpegPath,
  'ffmpeg'
]);
const ffprobePath = resolveMediaToolPath('FFPROBE_BIN', [
  process.env.FFPROBE_BIN,
  'C:\\Users\\HUAWEI\\choco\\bin\\ffprobe.exe',
  bundledFfprobePath,
  'ffprobe'
]);

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'moya-media',
    privileges: {
      standard: true,
      secure: true,
      stream: true,
      supportFetchAPI: true,
      bypassCSP: true
    }
  }
]);

const store = new Store({ name: 'moya-matrix' });
const isDev = !app.isPackaged;
const apiBaseUrl = (process.env.MOYA_API_BASE_URL || 'http://localhost:8081/api').replace(/\/+$/, '');
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1180,
    minHeight: 760,
    title: 'moya矩阵',
    backgroundColor: '#0b0b0c',
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#151515',
      symbolColor: '#e5edf7',
      height: 34
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  const rendererUrl = isDev
    ? 'http://localhost:5174'
    : `file://${path.join(__dirname, '../dist/index.html')}`;

  mainWindow.loadURL(rendererUrl);

  if (isDev && process.env.ELECTRON_OPEN_DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  registerMediaProtocol();
  registerIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

function registerMediaProtocol() {
  protocol.handle('moya-media', async (request) => {
    const url = new URL(request.url);
    const filePath = url.searchParams.get('path');
    if (!filePath) return new Response('Missing media path', { status: 400 });
    if (/^https?:\/\//i.test(filePath)) return net.fetch(filePath);
    if (/^file:\/\//i.test(filePath)) return net.fetch(filePath);
    if (!fsSync.existsSync(filePath)) return new Response('Media file not found', { status: 404 });

    const stat = fsSync.statSync(filePath);
    const range = request.headers.get('range');
    const contentType = mediaContentType(filePath);
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (match) {
        const start = match[1] ? Number(match[1]) : 0;
        const end = match[2] ? Number(match[2]) : stat.size - 1;
        const safeStart = Math.max(0, Math.min(start, stat.size - 1));
        const safeEnd = Math.max(safeStart, Math.min(end, stat.size - 1));
        return new Response(Readable.toWeb(fsSync.createReadStream(filePath, { start: safeStart, end: safeEnd })), {
          status: 206,
          headers: {
            'Content-Type': contentType,
            'Content-Length': String(safeEnd - safeStart + 1),
            'Content-Range': `bytes ${safeStart}-${safeEnd}/${stat.size}`,
            'Accept-Ranges': 'bytes'
          }
        });
      }
    }

    return new Response(Readable.toWeb(fsSync.createReadStream(filePath)), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(stat.size),
        'Accept-Ranges': 'bytes'
      }
    });
  });
}

function mediaContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.mp4' || ext === '.m4v') return 'video/mp4';
  if (ext === '.mov') return 'video/quicktime';
  if (ext === '.webm') return 'video/webm';
  if (ext === '.mkv') return 'video/x-matroska';
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

function resolveMediaToolPath(envName, candidates) {
  for (const candidate of candidates.filter(Boolean)) {
    if (isExecutableUsable(candidate)) return candidate;
  }
  console.warn(`[moya] ${envName} is not available. Tried: ${candidates.filter(Boolean).join(', ')}`);
  return '';
}

function isExecutableUsable(command) {
  try {
    execFileSync(command, ['-version'], {
      stdio: 'ignore',
      windowsHide: true,
      timeout: 5000
    });
    return true;
  } catch {
    return false;
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function registerIpc() {
  ipcMain.handle('app:get-version', () => app.getVersion());
  ipcMain.handle('app:set-titlebar-theme', (_event, theme) => {
    if (!mainWindow || typeof mainWindow.setTitleBarOverlay !== 'function') return false;
    mainWindow.setTitleBarOverlay({
      color: theme === 'light' ? '#f8fafc' : '#151515',
      symbolColor: theme === 'light' ? '#17202e' : '#e5edf7',
      height: 34
    });
    mainWindow.setBackgroundColor(theme === 'light' ? '#f3f6fb' : '#0b0b0c');
    return true;
  });

  ipcMain.handle('store:get', (_event, key) => store.get(key));
  ipcMain.handle('store:set', (_event, key, value) => {
    store.set(key, value);
    return true;
  });

  ipcMain.handle('dialog:open-files', async (_event, options = {}) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      ...options
    });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle('dialog:open-folder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('file:exists', async (_event, filePath) => {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('file:reveal', async (_event, filePath) => {
    shell.showItemInFolder(filePath);
    return true;
  });

  ipcMain.handle('file:read-text', async (_event, filePath) => {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) throw new Error('Only files can be read');
    if (stat.size > 5 * 1024 * 1024) throw new Error('Text file is too large');
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.docx') return readDocxText(filePath);
    if (ext === '.doc') return readDocText(filePath);
    return decodeTextBuffer(await fs.readFile(filePath));
  });

  ipcMain.handle('editor:create-draft', async (_event, payload = {}) => {
    const drafts = store.get('editor.drafts', []);
    const now = new Date().toISOString();
    const draft = {
      id: randomUUID(),
      name: payload.name || '未命名剪辑',
      createdAt: now,
      updatedAt: now,
      tracks: [],
      materials: [],
      workflow: payload.workflow || 'materials',
      fissionWorkspace: payload.fissionWorkspace || null
    };
    store.set('editor.drafts', [draft, ...drafts]);
    return draft;
  });

  ipcMain.handle('editor:list-drafts', () => store.get('editor.drafts', []));

  ipcMain.handle('cloud:add-transfer-task', (_event, task) => {
    const tasks = store.get('cloud.transfers', []);
    const nextTask = {
      id: randomUUID(),
      status: 'queued',
      progress: 0,
      createdAt: new Date().toISOString(),
      ...task
    };
    store.set('cloud.transfers', [nextTask, ...tasks]);
    return nextTask;
  });

  ipcMain.handle('cloud:list-transfer-tasks', () => store.get('cloud.transfers', []));
  ipcMain.handle('cloud:inspect-drive-file', async (_event, filePath) => {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) throw new Error('Only files can be uploaded');
    return {
      name: path.basename(filePath),
      size: stat.size,
      localPath: filePath,
      contentType: contentTypeForFile(filePath),
      sha256: await hashFile(filePath)
    };
  });

  ipcMain.handle('cloud:upload-drive-file', async (event, filePath, options = {}) => {
    await putFileToSignedUrl(options.uploadUrl, filePath, {
      contentType: options.contentType || contentTypeForFile(filePath),
      size: (await fs.stat(filePath)).size,
      onProgress: (progress) => {
        event.sender.send('cloud:upload-drive-file-progress', {
          taskId: options.taskId,
          ...progress
        });
      }
    });
    return true;
  });

  ipcMain.handle('media:upload-to-oss', async (event, filePath, options = {}) => {
    try {
      const result = await uploadLocalFileToOss(filePath, {
        ...options,
        onProgress: (progress) => {
          event.sender.send('media:upload-to-oss-progress', {
            taskId: options.taskId,
            filePath,
            ...progress
          });
        }
      });
      event.sender.send('media:upload-to-oss-progress', {
        taskId: options.taskId,
        filePath,
        percent: 100,
        status: 'done',
        message: '上传完成'
      });
      return result;
    } catch (error) {
      event.sender.send('media:upload-to-oss-progress', {
        taskId: options.taskId,
        filePath,
        percent: 0,
        status: 'failed',
        message: error?.message || '上传失败'
      });
      throw error;
    }
  });

  ipcMain.handle('media:download-to-local', async (_event, source, options = {}) => {
    if (!source || typeof source !== 'string') throw new Error('缺少可下载的视频地址');
    const suggestedName = safeDownloadFileName(options.fileName || inferDownloadFileName(source));
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '保存视频到本地',
      defaultPath: path.join(app.getPath('downloads'), suggestedName),
      filters: [
        { name: '视频文件', extensions: ['mp4', 'mov', 'webm', 'mkv', 'avi'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });
    if (result.canceled || !result.filePath) return { canceled: true };

    const viralOverlay = normalizeViralOverlay(options.viralOverlay);
    if (viralOverlay) {
      const renderSource = await prepareRenderableSource(source);
      const renderTempDir = await fs.mkdtemp(path.join(app.getPath('temp'), 'moya-render-output-'));
      const renderOutputPath = path.join(renderTempDir, `rendered-${Date.now()}.mp4`);
      try {
        await renderViralVideo(renderSource.filePath, renderOutputPath, viralOverlay);
        const renderedStat = await fs.stat(renderOutputPath);
        if (!renderedStat.isFile() || renderedStat.size <= 0) {
          throw new Error('渲染输出为空，未生成带字幕视频');
        }
        await fs.copyFile(renderOutputPath, result.filePath);
      } finally {
        await fs.rm(renderTempDir, { recursive: true, force: true }).catch(() => undefined);
      }
      await renderSource.cleanup();
    } else if (/^https?:\/\//i.test(source)) {
      await downloadUrlToFile(source, result.filePath);
    } else if (/^file:\/\//i.test(source)) {
      await fs.copyFile(fileURLToPath(source), result.filePath);
    } else {
      await fs.copyFile(source, result.filePath);
    }

    const stat = await fs.stat(result.filePath);
    shell.showItemInFolder(result.filePath);
    return {
      canceled: false,
      localPath: result.filePath,
      name: path.basename(result.filePath),
      size: stat.size
    };
  });

  ipcMain.handle('media:read-as-data-url', async (_event, filePath) => {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) throw new Error('Only files can be read');
    const contentType = contentTypeForFile(filePath);
    if (!contentType.startsWith('image/')) {
      throw new Error('当前仅支持图片素材转为本地直传数据');
    }
    const data = await fs.readFile(filePath);
    return {
      dataUrl: `data:${contentType};base64,${data.toString('base64')}`,
      contentType,
      name: path.basename(filePath),
      size: stat.size,
      localPath: filePath
    };
  });
}

function downloadUrlToFile(sourceUrl, destinationPath, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      reject(new Error('下载重定向次数过多'));
      return;
    }
    const targetUrl = new URL(sourceUrl);
    const client = targetUrl.protocol === 'https:' ? https : http;
    const request = client.get(targetUrl, (response) => {
      const statusCode = response.statusCode || 0;
      if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
        response.resume();
        const nextUrl = new URL(response.headers.location, targetUrl).toString();
        downloadUrlToFile(nextUrl, destinationPath, redirectCount + 1).then(resolve, reject);
        return;
      }
      if (statusCode < 200 || statusCode >= 300) {
        response.resume();
        reject(new Error(`下载失败：HTTP ${statusCode}`));
        return;
      }
      const stream = fsSync.createWriteStream(destinationPath);
      response.pipe(stream);
      stream.on('finish', () => stream.close(resolve));
      stream.on('error', reject);
    });
    request.on('error', reject);
  });
}

async function prepareRenderableSource(source) {
  if (/^https?:\/\//i.test(source)) {
    const tempDir = await fs.mkdtemp(path.join(app.getPath('temp'), 'moya-render-'));
    const ext = path.extname(new URL(source).pathname) || '.mp4';
    const tempFile = path.join(tempDir, `source${ext}`);
    await downloadUrlToFile(source, tempFile);
    return {
      filePath: tempFile,
      cleanup: async () => fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
    };
  }
  if (/^file:\/\//i.test(source)) {
    return { filePath: fileURLToPath(source), cleanup: async () => undefined };
  }
  return { filePath: source, cleanup: async () => undefined };
}

async function renderViralVideo(sourcePath, outputPath, overlay) {
  if (!ffmpegPath) {
    throw new Error('未找到可用的 ffmpeg，无法渲染字幕和特效');
  }
  const tempDir = await fs.mkdtemp(path.join(app.getPath('temp'), 'moya-viral-'));
  const assPath = path.join(tempDir, 'viral-overlay.ass');
  try {
    const metadata = await probeVideo(sourcePath).catch(() => ({ width: 720, height: 1280, duration: 0 }));
    const assText = buildViralAss(overlay, metadata);
    await fs.writeFile(assPath, assText, 'utf8');
    console.log('[moya] rendering viral overlay', {
      sourcePath,
      outputPath,
      assPath,
      captions: Array.isArray(overlay.subtitleSegments) ? overlay.subtitleSegments.length : 0
    });
    await runProcess(ffmpegPath, [
      '-y',
      '-i', sourcePath,
      '-vf', `subtitles=filename=${quoteFfmpegFilterPath(assPath)}`,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '20',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '160k',
      '-movflags', '+faststart',
      outputPath
    ]);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function probeVideo(filePath) {
  return new Promise((resolve, reject) => {
    if (!ffprobePath) {
      reject(new Error('未找到可用的 ffprobe'));
      return;
    }
    execFile(ffprobePath, [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height:format=duration',
      '-of', 'json',
      filePath
    ], { windowsHide: true }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      try {
        const data = JSON.parse(stdout || '{}');
        const stream = data.streams?.[0] || {};
        resolve({
          width: Number(stream.width) || 720,
          height: Number(stream.height) || 1280,
          duration: Number(data.format?.duration) || 0
        });
      } catch (parseError) {
        reject(parseError);
      }
    });
  });
}

function buildViralAss(overlay, metadata) {
  const width = Math.max(1, Number(metadata.width) || 720);
  const height = Math.max(1, Number(metadata.height) || 1280);
  const duration = Math.max(0.1, Number(metadata.duration) || readOverlayDuration(overlay));
  const titlePosition = overlay.titlePosition || { x: 50, y: 18 };
  const captionPosition = overlay.captionPosition || { x: 50, y: 64 };
  const titleColor = assBackColor(overlay.templateKey === 'deal' ? '#111827' : overlay.templateKey === 'seed' ? '#f59e0b' : '#2563eb');
  const badgeColor = assBackColor(overlay.templateKey === 'deal' ? '#111827' : '#ef4444');
  const captionColor = assBackColor(overlay.templateKey === 'story' ? '#3b2b1f' : '#101010');
  const titleText = overlay.hook || overlay.templateName || overlay.name || '网感剪辑';
  const badgeText = overlay.templateName || templateNameForKey(overlay.templateKey);
  const captions = Array.isArray(overlay.subtitleSegments) && overlay.subtitleSegments.length
    ? overlay.subtitleSegments
    : [{ time: `00:00:00 - ${formatAssTime(duration)}`, text: overlay.name || '自动识别添加字幕' }];
  const lines = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Title,Microsoft YaHei,${Math.round(height * 0.038)},&H00FFFFFF,&H00FFFFFF,${titleColor},${titleColor},-1,0,0,0,100,100,0,0,3,2,0,5,24,24,24,1`,
    `Style: Badge,Microsoft YaHei,${Math.round(height * 0.025)},&H00FFFFFF,&H00FFFFFF,${badgeColor},${badgeColor},-1,0,0,0,100,100,0,0,3,1.4,0,5,18,18,18,1`,
    `Style: Caption,Microsoft YaHei,${Math.round(height * 0.024)},&H00FFFFFF,&H00FFFFFF,&H00000000,${captionColor},-1,0,0,0,100,100,0,0,3,1.4,0,5,24,24,24,1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    `Dialogue: 1,0:00:00.00,${formatAssTime(duration)},Title,,0,0,0,,{\\pos(${percentX(titlePosition.x, width)},${percentY(titlePosition.y, height)})}${escapeAssText(titleText)}`,
    `Dialogue: 2,0:00:00.00,${formatAssTime(duration)},Badge,,0,0,0,,{\\pos(${percentX(titlePosition.x, width)},${percentY(titlePosition.y + 7, height)})}${escapeAssText(badgeText)}`
  ];
  for (const caption of captions) {
    const range = parseCaptionRange(caption.time, duration);
    lines.push(`Dialogue: 3,${formatAssTime(range.start)},${formatAssTime(range.end)},Caption,,0,0,0,,{\\pos(${percentX(captionPosition.x, width)},${percentY(captionPosition.y, height)})}${escapeAssText(caption.text || '')}`);
  }
  return lines.join('\n');
}

function normalizeViralOverlay(overlay) {
  if (!overlay || typeof overlay !== 'object') return null;
  if (!Array.isArray(overlay.subtitleSegments) && !overlay.hook && !overlay.templateName) return null;
  return overlay;
}

function runProcess(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error((stderr || stdout || error.message || '视频渲染失败').toString().slice(-1200)));
        return;
      }
      resolve();
    });
  });
}

function parseCaptionRange(time, fallbackEnd) {
  const [startText, endText] = String(time || '').split('-');
  const start = parseTimestampSeconds(startText);
  const end = parseTimestampSeconds(endText);
  return {
    start: Math.max(0, start),
    end: Math.max(start + 0.1, end > start ? end : fallbackEnd)
  };
}

function parseTimestampSeconds(value = '') {
  const parts = String(value).trim().split(':').map(Number);
  if (parts.length === 3 && parts.every(Number.isFinite)) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2 && parts.every(Number.isFinite)) return parts[0] * 60 + parts[1];
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function readOverlayDuration(overlay) {
  const captions = Array.isArray(overlay.subtitleSegments) ? overlay.subtitleSegments : [];
  return captions.reduce((max, caption) => Math.max(max, parseCaptionRange(caption.time, max).end), 10);
}

function formatAssTime(value) {
  const safeValue = Math.max(0, Number(value) || 0);
  const hours = Math.floor(safeValue / 3600);
  const minutes = Math.floor((safeValue % 3600) / 60);
  const seconds = Math.floor(safeValue % 60);
  const centiseconds = Math.floor((safeValue % 1) * 100);
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
}

function escapeAssText(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\r?\n/g, '\\N');
}

function percentX(value, width) {
  return Math.round((Math.max(0, Math.min(100, Number(value) || 50)) / 100) * width);
}

function percentY(value, height) {
  return Math.round((Math.max(0, Math.min(100, Number(value) || 50)) / 100) * height);
}

function assBackColor(hex) {
  const normalized = String(hex || '#000000').replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return '&H00000000';
  const rr = normalized.slice(0, 2);
  const gg = normalized.slice(2, 4);
  const bb = normalized.slice(4, 6);
  return `&H00${bb}${gg}${rr}`;
}

function templateNameForKey(key) {
  if (key === 'seed') return '种草清单';
  if (key === 'deal') return '成交转化';
  if (key === 'story') return '故事包装';
  return '高级红·双语';
}

function quoteFfmpegFilterPath(filePath) {
  const normalized = filePath
    .replace(/\\/g, '/')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/,/g, '\\,');
  return `'${normalized}'`;
}

function inferDownloadFileName(source) {
  if (!/^https?:\/\//i.test(source)) return path.basename(source);
  try {
    const pathname = new URL(source).pathname;
    return path.basename(decodeURIComponent(pathname)) || 'moya-video.mp4';
  } catch {
    return 'moya-video.mp4';
  }
}

function safeDownloadFileName(fileName) {
  const ext = path.extname(fileName) || '.mp4';
  const base = path.basename(fileName, ext)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return `${base || 'moya-video'}${ext}`;
}

async function uploadLocalFileToOss(filePath, options = {}) {
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) throw new Error('Only files can be uploaded');
  const fileName = path.basename(filePath);
  const contentType = options.contentType || contentTypeForFile(filePath);
  const ticket = await createUploadTicket({
    fileName,
    contentType,
    size: stat.size,
    folder: options.folder || 'fission-media'
  });
  await putFileToSignedUrl(ticket.uploadUrl, filePath, {
    contentType: ticket.contentType || contentType,
    size: stat.size,
    onProgress: options.onProgress
  });
  return {
    ...ticket,
    name: fileName,
    size: stat.size,
    localPath: filePath
  };
}

async function createUploadTicket(payload) {
  const response = await fetch(`${apiBaseUrl}/storage/upload-ticket`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success) {
    throw new Error(body?.message || body?.error || `Create upload ticket failed: HTTP ${response.status}`);
  }
  return body.data;
}

function putFileToSignedUrl(uploadUrl, filePath, options) {
  return new Promise((resolve, reject) => {
    const targetUrl = new URL(uploadUrl);
    const client = targetUrl.protocol === 'https:' ? https : http;
    let uploaded = 0;
    const request = client.request(
      targetUrl,
      {
        method: 'PUT',
        headers: {
          'Content-Type': options.contentType,
          'Content-Length': options.size
        }
      },
      (response) => {
        let responseText = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          responseText += chunk;
        });
        response.on('end', () => {
          if (response.statusCode >= 200 && response.statusCode < 300) {
            resolve(true);
            return;
          }
          reject(new Error(`OSS upload failed: HTTP ${response.statusCode} ${responseText}`.trim()));
        });
      }
    );
    request.on('error', reject);
    request.setTimeout(120000, () => {
      request.destroy(new Error('OSS upload timeout, please check network or signed URL'));
    });
    const stream = fsSync.createReadStream(filePath);
    stream.on('data', (chunk) => {
      uploaded += chunk.length;
      if (typeof options.onProgress === 'function') {
        options.onProgress({
          percent: Math.min(95, Math.round((uploaded / Math.max(options.size, 1)) * 95)),
          status: 'uploading',
          message: '上传中'
        });
      }
    });
    stream.on('error', reject).pipe(request);
  });
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    fsSync.createReadStream(filePath)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')));
  });
}

function contentTypeForFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.mkv': 'video/x-matroska',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.aac': 'audio/aac',
    '.flac': 'audio/flac',
    '.m4a': 'audio/mp4',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp'
  };
  return types[ext] || 'application/octet-stream';
}

function decodeTextBuffer(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.toString('utf8', 3);
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.toString('utf16le', 2);
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(buffer.subarray(2));
  }
  const utf8Text = buffer.toString('utf8');
  const replacementCount = (utf8Text.match(/\uFFFD/g) || []).length;
  if (replacementCount === 0 || replacementCount / Math.max(utf8Text.length, 1) < 0.01) {
    return utf8Text;
  }
  try {
    return new TextDecoder('gb18030').decode(buffer);
  } catch {
    return utf8Text;
  }
}

function execPowerShell(script) {
  return new Promise((resolve, reject) => {
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(cleanPowerShellError(stderr || stdout || error.message)));
          return;
        }
        resolve(stdout);
      }
    );
  });
}

function cleanPowerShellError(message) {
  const text = String(message || '').trim();
  if (!text) return 'PowerShell read failed';
  return text
    .replace(/#< CLIXML[\s\S]*?<S S="Error">/g, '')
    .replace(/<\/S>[\s\S]*$/g, '')
    .replace(/_x000D__x000A_/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim() || 'PowerShell read failed';
}

async function readDocxText(filePath) {
  const safePath = filePath.replace(/'/g, "''");
  const script = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.Web
$stream = [System.IO.File]::Open('${safePath}', [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
$zip = New-Object System.IO.Compression.ZipArchive($stream, [System.IO.Compression.ZipArchiveMode]::Read, $false)
try {
  $entry = $zip.GetEntry('word/document.xml')
  if ($null -eq $entry) { $entry = $zip.GetEntry('word\\document.xml') }
  if ($null -eq $entry) { throw 'word/document.xml not found' }
  $reader = New-Object System.IO.StreamReader($entry.Open(), [System.Text.Encoding]::UTF8)
  try { $xml = $reader.ReadToEnd() } finally { $reader.Dispose() }
  $xml = $xml -replace '</w:p>', "\`n"
  $xml = $xml -replace '</w:tr>', "\`n"
  $text = [regex]::Replace($xml, '<[^>]+>', '')
  [System.Web.HttpUtility]::HtmlDecode($text)
} finally {
  $zip.Dispose()
  $stream.Dispose()
}
`;
  return execPowerShell(script);
}

async function readDocText(filePath) {
  const safePath = filePath.replace(/'/g, "''");
  const script = `
$ErrorActionPreference = 'Stop'
$word = New-Object -ComObject Word.Application
$word.Visible = $false
try {
  $doc = $word.Documents.Open('${safePath}', $false, $true)
  try { $doc.Content.Text } finally { $doc.Close($false) }
} finally {
  $word.Quit()
}
`;
  return execPowerShell(script);
}
