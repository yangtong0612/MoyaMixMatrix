const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const fsSync = require('node:fs');
const fs = require('node:fs/promises');
const { execFile, execFileSync } = require('node:child_process');
const { createHash, randomUUID } = require('node:crypto');
const { fileURLToPath, pathToFileURL } = require('node:url');
const { TextDecoder } = require('node:util');
const { app, BrowserWindow, Menu, dialog, ipcMain, nativeImage, net, protocol, shell } = require('electron');
const Store = require('electron-store');
const bundledFfmpegPath = optionalRequire('ffmpeg-static') || '';
const installedFfmpegPath = optionalRequire('@ffmpeg-installer/ffmpeg')?.path || '';
const bundledFfprobePath = optionalRequire('ffprobe-static')?.path || '';
const ffmpegExecutableName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
const ffprobeExecutableName = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';
const ffmpegPath = resolveMediaToolPath('FFMPEG_BIN', [
  process.env.FFMPEG_BIN,
  resolvePackagedMediaToolPath(ffmpegExecutableName),
  installedFfmpegPath,
  bundledFfmpegPath,
  'ffmpeg'
]);
const ffprobePath = resolveMediaToolPath('FFPROBE_BIN', [
  process.env.FFPROBE_BIN,
  resolvePackagedMediaToolPath(ffprobeExecutableName),
  bundledFfprobePath,
  'ffprobe'
]);
const nodePath = resolveMediaToolPath('NODE_BIN', [
  process.env.NODE_BIN,
  'C:\\Program Files\\nodejs\\node.exe',
  'node'
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

let mainWindow = null;
let rendererRetryTimer = null;
let storeWriteQueue = Promise.resolve();
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

const store = new Store({ name: 'moya-matrix' });
const isDev = !app.isPackaged;
const devRendererUrl = process.env.MOYA_RENDERER_URL || 'http://127.0.0.1:5174';
const prodRendererPath = path.join(__dirname, '../dist/index.html');
const prodRendererUrl = pathToFileURL(prodRendererPath).toString();
const apiBaseUrl = (process.env.MOYA_API_BASE_URL || 'http://127.0.0.1:8081/api').replace(/\/+$/, '');
const ossUploadTimeoutMs = Number(process.env.MOYA_OSS_UPLOAD_TIMEOUT_MS || 10 * 60 * 1000);
const appIconPath = path.join(__dirname, 'assets', process.platform === 'win32' ? 'app-icon.ico' : 'app-icon.png');

function resolveSubtitleFontsDir() {
  const candidates = [
    process.env.MOYA_SUBTITLE_FONTS_DIR,
    path.join(__dirname, '../public/fonts/subtitle'),
    path.join(__dirname, '../dist/fonts/subtitle'),
    process.resourcesPath ? path.join(process.resourcesPath, 'fonts/subtitle') : undefined
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      if (
        fsSync.existsSync(candidate) &&
        fsSync.existsSync(path.join(candidate, 'SourceHanSansSC-Regular.otf')) &&
        fsSync.existsSync(path.join(candidate, 'SourceHanSansSC-Heavy.otf')) &&
        fsSync.existsSync(path.join(candidate, 'SmileySans-Oblique.otf')) &&
        fsSync.existsSync(path.join(candidate, 'ResourceHanRoundedCN-Regular.ttf')) &&
        fsSync.existsSync(path.join(candidate, 'ResourceHanRoundedCN-Bold.ttf')) &&
        fsSync.existsSync(path.join(candidate, 'SourceHanSerifSC-Bold.otf')) &&
        fsSync.existsSync(path.join(candidate, 'LXGWWenKai-Regular.ttf'))
      ) {
        return candidate;
      }
    } catch {
      // Ignore inaccessible candidates and keep the default system font fallback.
    }
  }
  return '';
}

function createWindow() {
  let activeRendererUrl = isDev ? devRendererUrl : prodRendererUrl;
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1180,
    minHeight: 760,
    title: 'moya矩阵',
    icon: appIconPath,
    backgroundColor: '#0b0b0c',
    show: false,
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

  const loadRendererUrl = (nextUrl) => {
    activeRendererUrl = nextUrl;
    return mainWindow.loadURL(nextUrl);
  };

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow?.isDestroyed()) {
      mainWindow.show();
    }
  });
  mainWindow.webContents.on('did-finish-load', () => {
    const currentUrl = mainWindow?.webContents.getURL() || '';
    if (!isFallbackPageUrl(currentUrl)) {
      clearRendererRetry();
    }
    if (!mainWindow?.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  });
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || isFallbackPageUrl(validatedURL)) return;
    const detail = `${errorDescription || 'Unknown renderer error'} (${errorCode})`;
    console.error('Renderer failed to load:', detail, validatedURL || activeRendererUrl);
    if (maybeLoadBundledRendererFallback(mainWindow, activeRendererUrl, detail, loadRendererUrl)) {
      return;
    }
    if (isDev) {
      scheduleRendererRetry(mainWindow, activeRendererUrl, detail, loadRendererUrl);
      return;
    }
    showRendererFailurePage(mainWindow, {
      heading: '界面加载失败',
      body: '打包后的前端资源没有成功打开，请重新执行 npm run build 后再启动 Electron。',
      detail
    });
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    const detail = `${details.reason}${details.exitCode ? ` (${details.exitCode})` : ''}`;
    console.error('Renderer process exited:', detail);
    showRendererFailurePage(mainWindow, {
      heading: '界面进程已退出',
      body: '渲染进程意外退出，建议重新启动应用。如果问题重复出现，请检查最近的前端改动。',
      detail
    });
  });
  void loadRendererUrl(activeRendererUrl).catch((error) => {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('Renderer load threw before navigation completed:', detail);
    if (maybeLoadBundledRendererFallback(mainWindow, activeRendererUrl, detail, loadRendererUrl)) {
      return;
    }
    if (isDev) {
      scheduleRendererRetry(mainWindow, activeRendererUrl, detail, loadRendererUrl);
      return;
    }
    showRendererFailurePage(mainWindow, {
      heading: '界面加载失败',
      body: 'Electron 未能打开前端资源，请确认 dist 已构建完成。',
      detail
    });
  });
  attachDebugContextMenu(mainWindow);

  if (isDev && process.env.ELECTRON_OPEN_DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    clearRendererRetry();
    mainWindow = null;
  });
}

function clearRendererRetry() {
  if (rendererRetryTimer) {
    clearTimeout(rendererRetryTimer);
    rendererRetryTimer = null;
  }
}

function scheduleRendererRetry(window, rendererUrl, detail, loadRendererUrl = (nextUrl) => window.loadURL(nextUrl)) {
  clearRendererRetry();
  showRendererFailurePage(window, {
    heading: '正在连接开发界面',
    body: 'Electron 已启动，但前端开发服务器暂时不可用。通常是 Vite 还没启动完成，或当前渲染代码编译失败。',
    detail: `目标地址：${rendererUrl}\n原因：${detail}\nElectron 会自动重试，请稍候片刻。`
  });
  rendererRetryTimer = setTimeout(() => {
    rendererRetryTimer = null;
    if (!window || window.isDestroyed()) return;
    void loadRendererUrl(rendererUrl).catch((error) => {
      console.error('Renderer retry failed:', error);
    });
  }, 1500);
}

function maybeLoadBundledRendererFallback(window, rendererUrl, detail, loadRendererUrl) {
  if (!isDev || rendererUrl === prodRendererUrl) return false;
  if (process.env.MOYA_REQUIRE_DEV_SERVER === '1') return false;
  if (!fsSync.existsSync(prodRendererPath)) return false;
  if (!/(ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ERR_CONNECTION_ABORTED|ERR_TIMED_OUT|ERR_CONNECTION_TIMED_OUT|ERR_ADDRESS_UNREACHABLE|ERR_INTERNET_DISCONNECTED)/i.test(detail)) {
    return false;
  }
  clearRendererRetry();
  showRendererFailurePage(window, {
    heading: '开发服务不可用，正在切换内置界面',
    body: '127.0.0.1:5174 当前没有响应，Electron 将先打开最近一次构建的界面，避免停留在连接页。',
    detail: `开发地址：${rendererUrl}\n原因：${detail}\n回退地址：${prodRendererUrl}`
  });
  setTimeout(() => {
    if (!window || window.isDestroyed()) return;
    void loadRendererUrl(prodRendererUrl).catch((error) => {
      console.error('Bundled renderer fallback failed:', error);
    });
  }, 180);
  return true;
}

function showRendererFailurePage(window, { heading, body, detail }) {
  if (!window || window.isDestroyed()) return;
  const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>moya矩阵</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background:
          radial-gradient(circle at top, rgba(100, 140, 255, 0.18), transparent 34%),
          linear-gradient(180deg, #101116 0%, #0b0c10 100%);
        color: #eef3ff;
      }
      main {
        width: min(680px, calc(100vw - 48px));
        padding: 28px 30px;
        border-radius: 24px;
        background: rgba(17, 18, 24, 0.92);
        border: 1px solid rgba(255, 255, 255, 0.08);
        box-shadow: 0 28px 70px rgba(0, 0, 0, 0.45);
      }
      h1 {
        margin: 0 0 12px;
        font-size: 30px;
      }
      p {
        margin: 0;
        color: #c6cee0;
        line-height: 1.7;
        font-size: 15px;
      }
      pre {
        margin: 18px 0 0;
        padding: 14px 16px;
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.08);
        color: #9fb2d8;
        white-space: pre-wrap;
        word-break: break-word;
        font-size: 13px;
        line-height: 1.6;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(heading)}</h1>
      <p>${escapeHtml(body)}</p>
      <pre>${escapeHtml(detail)}</pre>
    </main>
  </body>
</html>`;
  void window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch((error) => {
    console.error('Failed to show renderer fallback page:', error);
  });
  if (!window.isVisible()) {
    window.show();
  }
}

function isFallbackPageUrl(url = '') {
  return typeof url === 'string' && url.startsWith('data:text/html');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function attachDebugContextMenu(window) {
  window.webContents.on('context-menu', (_event, params) => {
    const hasSelection = Boolean(params.selectionText && params.selectionText.trim());
    const menu = Menu.buildFromTemplate([
      {
        label: '检查此处元素',
        click: () => {
          window.webContents.inspectElement(params.x, params.y);
          if (!window.webContents.isDevToolsOpened()) {
            window.webContents.openDevTools({ mode: 'detach' });
          }
        }
      },
      {
        label: window.webContents.isDevToolsOpened() ? '关闭开发者工具' : '打开开发者工具',
        click: () => {
          if (window.webContents.isDevToolsOpened()) {
            window.webContents.closeDevTools();
            return;
          }
          window.webContents.openDevTools({ mode: 'detach' });
        }
      },
      { type: 'separator' },
      { label: '刷新页面', role: 'reload' },
      { label: '强制刷新', role: 'forceReload' },
      { type: 'separator' },
      { label: '复制', role: 'copy', enabled: hasSelection },
      { label: '粘贴', role: 'paste', enabled: params.isEditable },
      { label: '全选', role: 'selectAll' }
    ]);
    menu.popup({ window });
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
    if (/^https?:\/\//i.test(filePath)) {
      const headers = new Headers();
      const range = request.headers.get('range');
      const accept = request.headers.get('accept');
      if (range) headers.set('range', range);
      if (accept) headers.set('accept', accept);
      return net.fetch(filePath, {
        method: request.method || 'GET',
        headers
      });
    }
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
        return new Response(createSafeFileWebStream(filePath, { start: safeStart, end: safeEnd }), {
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

    return new Response(createSafeFileWebStream(filePath), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(stat.size),
        'Accept-Ranges': 'bytes'
      }
    });
  });
}

function createSafeFileWebStream(filePath, options = {}) {
  let nodeStream;
  let settled = false;
  return new ReadableStream({
    start(controller) {
      nodeStream = fsSync.createReadStream(filePath, options);
      nodeStream.on('data', (chunk) => {
        if (settled) return;
        try {
          controller.enqueue(new Uint8Array(chunk));
        } catch {
          settled = true;
          nodeStream.destroy();
        }
      });
      nodeStream.once('end', () => {
        if (settled) return;
        settled = true;
        try {
          controller.close();
        } catch {
          // The browser may cancel media range requests after enough bytes are read.
        }
      });
      nodeStream.once('error', (error) => {
        if (settled) return;
        settled = true;
        try {
          controller.error(error);
        } catch {
          // Ignore late stream errors after the response has already been closed.
        }
      });
    },
    cancel() {
      if (settled) return;
      settled = true;
      if (nodeStream) nodeStream.destroy();
    }
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

function resolvePackagedMediaToolPath(fileName) {
  return process.resourcesPath ? path.join(process.resourcesPath, 'bin', fileName) : '';
}

function optionalRequire(moduleName) {
  try {
    return require(moduleName);
  } catch {
    return null;
  }
}

function isExecutableUsable(command) {
  for (const versionArg of ['-version', '--version']) {
    try {
      execFileSync(command, [versionArg], {
        stdio: 'ignore',
        windowsHide: true,
        timeout: 5000
      });
      return true;
    } catch {
      // Try the next common version flag. Node uses --version; ffmpeg uses -version.
    }
  }
  return false;
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function setStoredValue(key, value) {
  return enqueueStoreWrite(() => store.set(key, value));
}

function updateStoredValue(key, updater) {
  return enqueueStoreWrite(() => {
    const current = store.get(key);
    const next = updater(current);
    store.set(key, next);
    return next;
  });
}

function enqueueStoreWrite(action) {
  const nextWrite = storeWriteQueue.then(
    () => retryStoreWrite(action),
    () => retryStoreWrite(action)
  );
  storeWriteQueue = nextWrite.catch(() => undefined);
  return nextWrite;
}

async function retryStoreWrite(action) {
  let lastError;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      return action();
    } catch (error) {
      lastError = error;
      if (!isRetryableStoreWriteError(error) || attempt === 5) break;
      await delay(80 + attempt * 80);
    }
  }
  throw lastError;
}

function isRetryableStoreWriteError(error) {
  return error?.code === 'EPERM' || error?.code === 'EBUSY' || error?.code === 'EACCES';
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function registerIpc() {
  ipcMain.handle('app:get-version', () => app.getVersion());
  ipcMain.handle('app:request-api', (_event, request = {}) => requestBackendApi(request));
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
  ipcMain.handle('store:set', async (_event, key, value) => {
    await setStoredValue(key, value);
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
    await updateStoredValue('editor.drafts', (drafts = []) => [draft, ...drafts]);
    return draft;
  });

  ipcMain.handle('editor:list-drafts', () => store.get('editor.drafts', []));

  ipcMain.handle('cloud:add-transfer-task', async (_event, task) => {
    const nextTask = {
      id: randomUUID(),
      status: 'queued',
      progress: 0,
      createdAt: new Date().toISOString(),
      ...task
    };
    await updateStoredValue('cloud.transfers', (tasks = []) => [nextTask, ...tasks]);
    return nextTask;
  });

  ipcMain.handle('cloud:list-transfer-tasks', () => store.get('cloud.transfers', []));
  ipcMain.handle('cloud:inspect-local-entries', async (_event, paths = []) => inspectLocalEntries(paths));
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

  ipcMain.handle('cloud:upload-drive-file-part', async (event, filePath, options = {}) => {
    const start = Number(options.start || 0);
    const end = Number(options.end || 0);
    const size = end - start + 1;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || size <= 0) {
      throw new Error('Invalid upload part range');
    }
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) throw new Error('Only files can be uploaded');
    if (end >= stat.size) throw new Error('Upload part range exceeds file size');
    return putFilePartToSignedUrl(options.uploadUrl, filePath, {
      taskId: options.taskId,
      chunkIndex: options.chunkIndex,
      partNumber: options.partNumber,
      contentType: options.contentType || contentTypeForFile(filePath),
      start,
      end,
      size,
      onProgress: (progress) => {
        event.sender.send('cloud:upload-drive-file-progress', {
          taskId: options.taskId,
          chunkIndex: options.chunkIndex,
          ...progress
        });
      }
    });
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

  ipcMain.handle('media:cache-remote-file', async (_event, source, options = {}) => {
    if (!source || typeof source !== 'string') throw new Error('缺少可缓存的视频地址');
    return cacheMediaSourceLocally(source, options);
  });

  ipcMain.handle('media:create-thumbnail', async (_event, source, options = {}) => {
    if (!source || typeof source !== 'string') throw new Error('缺少可生成封面的媒体地址');
    return createMediaThumbnail(source, options);
  });

  ipcMain.handle('media:read-as-data-url', async (_event, filePath, options = {}) => {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) throw new Error('Only files can be read');
    const contentType = contentTypeForFile(filePath);
    if (!contentType.startsWith('image/')) {
      throw new Error('当前仅支持图片素材转为本地直传数据');
    }
    const optimized = readOptimizedImageData(filePath, options);
    if (optimized) {
      return {
        dataUrl: `data:${optimized.contentType};base64,${optimized.data.toString('base64')}`,
        contentType: optimized.contentType,
        name: path.basename(filePath),
        size: optimized.data.length,
        originalSize: stat.size,
        localPath: filePath
      };
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
  ipcMain.handle('media:probe-file', async (_event, filePath) => probeMedia(filePath));
  ipcMain.handle('media:split-video', async (_event, source, options = {}) => splitVideoSource(source, options));
  ipcMain.handle('media:crop-video', async (_event, source, options = {}) => cropVideoSource(source, options));
  ipcMain.handle('media:analyze-speech', async (_event, filePath) => analyzeSpeechWindow(filePath));
  ipcMain.handle('media:analyze-audio-continuity', async (_event, filePath) => analyzeAudioContinuity(filePath));
  ipcMain.handle('media:render-fission-mix', async (_event, request = {}) => renderFissionMix(request));
}

function readOptimizedImageData(filePath, options = {}) {
  const image = nativeImage.createFromPath(filePath);
  if (!image || image.isEmpty()) return null;
  const size = image.getSize();
  const maxDimension = Math.max(320, Number(options.maxDimension) || 960);
  const quality = Math.max(45, Math.min(92, Number(options.quality) || 72));
  const scale = Math.min(1, maxDimension / Math.max(size.width || 1, size.height || 1));
  const resized = scale < 1
    ? image.resize({
        width: Math.max(1, Math.round(size.width * scale)),
        height: Math.max(1, Math.round(size.height * scale)),
        quality: 'good'
      })
    : image;
  return {
    data: resized.toJPEG(quality),
    contentType: 'image/jpeg'
  };
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

async function cacheMediaSourceLocally(source, options = {}) {
  const cacheDir = path.join(app.getPath('userData'), 'media-cache', options.folder || 'general');
  await fs.mkdir(cacheDir, { recursive: true });
  const fileName = buildMediaCacheFileName(source, options);
  const destinationPath = path.join(cacheDir, fileName);
  if (fsSync.existsSync(destinationPath)) {
    const existingStat = await fs.stat(destinationPath).catch(() => null);
    if (existingStat?.isFile() && existingStat.size > 0) {
      return {
        cached: true,
        localPath: destinationPath,
        name: fileName,
        size: existingStat.size
      };
    }
  }
  if (/^https?:\/\//i.test(source)) {
    const tempPath = `${destinationPath}.part`;
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    await downloadUrlToFile(source, tempPath);
    await fs.rename(tempPath, destinationPath).catch(async () => {
      await fs.copyFile(tempPath, destinationPath);
      await fs.rm(tempPath, { force: true }).catch(() => undefined);
    });
  } else if (/^file:\/\//i.test(source)) {
    await fs.copyFile(fileURLToPath(source), destinationPath);
  } else {
    await fs.copyFile(source, destinationPath);
  }
  const stat = await fs.stat(destinationPath);
  return {
    cached: true,
    localPath: destinationPath,
    name: fileName,
    size: stat.size
  };
}

function buildMediaCacheFileName(source, options = {}) {
  const fallbackName = safeDownloadFileName(options.fileName || inferDownloadFileName(source));
  const ext = path.extname(fallbackName) || '.mp4';
  const baseName = path.basename(fallbackName, ext)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48) || 'moya-media';
  const cacheKey = String(options.cacheKey || inferMediaCacheKey(source))
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, '-')
    .trim()
    .slice(0, 32) || randomUUID().slice(0, 8);
  return `${baseName}-${cacheKey}${ext}`;
}

function inferMediaCacheKey(source) {
  if (!/^https?:\/\//i.test(source)) {
    return createHash('sha1').update(source).digest('hex').slice(0, 12);
  }
  try {
    const targetUrl = new URL(source);
    return createHash('sha1').update(`${targetUrl.origin}${targetUrl.pathname}`).digest('hex').slice(0, 12);
  } catch {
    return createHash('sha1').update(source).digest('hex').slice(0, 12);
  }
}

async function createMediaThumbnail(source, options = {}) {
  if (!ffmpegPath) {
    throw new Error('未找到可用的 ffmpeg，无法生成视频封面');
  }

  const normalizedSource = decodeMediaProtocolSource(source);
  const width = Math.max(48, Math.min(320, Math.round(Number(options.width) || 96)));
  const height = Math.max(72, Math.min(480, Math.round(Number(options.height) || 170)));
  const time = Math.max(0, Math.min(30, Number(options.time) || 0.8));
  const cacheKey = createHash('sha1')
    .update(`${normalizedSource}|${width}x${height}|${time}`)
    .digest('hex')
    .slice(0, 24);
  const cacheDir = path.join(app.getPath('userData'), 'media-cache', 'thumbnails');
  const outputPath = path.join(cacheDir, `${cacheKey}.jpg`);
  await fs.mkdir(cacheDir, { recursive: true });

  const existing = await fs.stat(outputPath).catch(() => null);
  if (existing?.isFile() && existing.size > 0 && !isLikelyDarkThumbnail(outputPath)) {
    return {
      cached: true,
      localPath: outputPath,
      name: path.basename(outputPath),
      size: existing.size
    };
  }

  const prepared = await prepareRenderableSource(normalizedSource);
  try {
    const candidateTimes = Array.from(new Set([time, 1.2, 2.0, 0.45, 0].map((value) => Math.max(0, Math.min(30, Number(value) || 0)))));
    let rendered = false;
    let lastError = null;
    for (const candidateTime of candidateTimes) {
      try {
        await renderMediaThumbnail(prepared.filePath, outputPath, { width, height, time: candidateTime });
        rendered = true;
        if (!isLikelyDarkThumbnail(outputPath)) break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!rendered && lastError) throw lastError;
  } finally {
    await prepared.cleanup?.();
  }

  const stat = await fs.stat(outputPath);
  return {
    cached: true,
    localPath: outputPath,
    name: path.basename(outputPath),
    size: stat.size
  };
}

function isLikelyDarkThumbnail(filePath) {
  try {
    const image = nativeImage.createFromPath(filePath);
    if (!image || image.isEmpty()) return false;
    const sample = image.resize({ width: 18, height: 18, quality: 'good' }).toBitmap();
    if (!sample || sample.length < 4) return false;
    let total = 0;
    let brightPixels = 0;
    let pixels = 0;
    for (let index = 0; index < sample.length; index += 4) {
      const b = sample[index] || 0;
      const g = sample[index + 1] || 0;
      const r = sample[index + 2] || 0;
      const luminance = (r * 0.2126) + (g * 0.7152) + (b * 0.0722);
      total += luminance;
      if (luminance > 45) brightPixels += 1;
      pixels += 1;
    }
    const average = total / Math.max(1, pixels);
    const brightRatio = brightPixels / Math.max(1, pixels);
    return average < 24 && brightRatio < 0.025;
  } catch {
    return false;
  }
}

async function renderMediaThumbnail(inputPath, outputPath, options) {
  const args = [
    '-y',
    '-ss', String(options.time),
    '-i', inputPath,
    '-frames:v', '1',
    '-vf', `scale=${options.width}:${options.height}:force_original_aspect_ratio=increase,crop=${options.width}:${options.height}`,
    '-q:v', '4',
    outputPath
  ];
  try {
    await runProcess(ffmpegPath, args, { timeout: 30000 });
  } catch (error) {
    await runProcess(ffmpegPath, [
      '-y',
      '-i', inputPath,
      '-frames:v', '1',
      '-vf', `scale=${options.width}:${options.height}:force_original_aspect_ratio=increase,crop=${options.width}:${options.height}`,
      '-q:v', '4',
      outputPath
    ], { timeout: 30000 });
  }
  const stat = await fs.stat(outputPath).catch(() => null);
  if (!stat?.isFile() || stat.size <= 0) {
    throw new Error('视频封面生成失败');
  }
}

function decodeMediaProtocolSource(source) {
  if (/^moya-media:\/\//i.test(source)) {
    try {
      const targetUrl = new URL(source);
      return targetUrl.searchParams.get('path') || source;
    } catch {
      return source;
    }
  }
  if (/^file:\/\//i.test(source)) {
    return fileURLToPath(source);
  }
  return source;
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

async function splitVideoSource(source, options = {}) {
  if (!source || typeof source !== 'string') throw new Error('缺少可分割的视频来源');
  if (!ffmpegPath) throw new Error('未找到可用的 ffmpeg，无法分割视频');

  const normalizedSource = decodeMediaProtocolSource(source);
  const prepared = await prepareRenderableSource(normalizedSource);
  try {
    const metadata = await probeMedia(prepared.filePath).catch(() => ({ duration: 0 }));
    const sourceDuration = Math.max(0, Number(metadata.duration) || 0);
    const segments = normalizeVideoSplitSegments(options.segments, sourceDuration);
    if (!segments.length) throw new Error('请先设置至少一个有效分割片段');

    const outputDir = path.join(app.getPath('userData'), 'media-cache', options.folder || 'material-segments');
    await fs.mkdir(outputDir, { recursive: true });
    const baseName = buildSplitOutputBaseName(options.fileName || inferDownloadFileName(normalizedSource));
    const runId = createHash('sha1')
      .update(`${normalizedSource}|${Date.now()}|${Math.random()}`)
      .digest('hex')
      .slice(0, 8);

    const results = [];
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      const segmentNo = String(index + 1).padStart(2, '0');
      const outputPath = path.join(outputDir, `${baseName}-${runId}-${segmentNo}.mp4`);
      await cutVideoSegment(prepared.filePath, outputPath, segment.start, segment.duration);
      const stat = await fs.stat(outputPath);
      results.push({
        id: `${runId}-${segmentNo}`,
        label: segment.label || `片段 ${index + 1}`,
        start: segment.start,
        end: segment.end,
        duration: segment.duration,
        localPath: outputPath,
        name: path.basename(outputPath),
        size: stat.size
      });
    }

    return {
      source: normalizedSource,
      duration: sourceDuration,
      outputDir,
      segments: results
    };
  } finally {
    await prepared.cleanup?.();
  }
}

function normalizeVideoSplitSegments(rawSegments, sourceDuration) {
  const maxEnd = sourceDuration > 0 ? sourceDuration : Number.MAX_SAFE_INTEGER;
  return (Array.isArray(rawSegments) ? rawSegments : [])
    .map((segment, index) => {
      const start = clampSeconds(Number(segment?.start) || 0, 0, maxEnd);
      const explicitEnd = Number(segment?.end);
      const explicitDuration = Number(segment?.duration);
      const end = Number.isFinite(explicitEnd) && explicitEnd > start
        ? clampSeconds(explicitEnd, start, maxEnd)
        : clampSeconds(start + (Number.isFinite(explicitDuration) && explicitDuration > 0 ? explicitDuration : 0), start, maxEnd);
      return {
        start,
        end,
        duration: Math.max(0, end - start),
        label: typeof segment?.label === 'string' && segment.label.trim() ? segment.label.trim() : `片段 ${index + 1}`
      };
    })
    .filter((segment) => segment.duration >= 0.25);
}

async function cutVideoSegment(inputPath, outputPath, start, duration) {
  await fs.rm(outputPath, { force: true }).catch(() => undefined);
  const copyArgs = [
    '-y',
    '-ss', formatFfmpegSeconds(start),
    '-i', inputPath,
    '-t', formatFfmpegSeconds(duration),
    '-map', '0',
    '-c', 'copy',
    '-avoid_negative_ts', 'make_zero',
    outputPath
  ];

  try {
    await runProcess(ffmpegPath, copyArgs, { timeout: 180000 });
    await assertNonEmptyFile(outputPath);
    return;
  } catch (error) {
    await fs.rm(outputPath, { force: true }).catch(() => undefined);
  }

  await runProcess(ffmpegPath, [
    '-y',
    '-ss', formatFfmpegSeconds(start),
    '-i', inputPath,
    '-t', formatFfmpegSeconds(duration),
    '-map', '0',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '22',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    outputPath
  ], { timeout: 180000 });
  await assertNonEmptyFile(outputPath);
}

async function assertNonEmptyFile(filePath) {
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile() || stat.size <= 0) throw new Error('视频片段输出为空');
}

function buildSplitOutputBaseName(fileName) {
  const safeName = safeDownloadFileName(fileName || `material-${Date.now()}.mp4`);
  return path.basename(safeName, path.extname(safeName))
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 64) || 'material';
}

async function cropVideoSource(source, options = {}) {
  if (!source || typeof source !== 'string') throw new Error('缺少可裁剪的视频来源');
  if (!ffmpegPath) throw new Error('未找到可用的 ffmpeg，无法裁剪视频');

  const normalizedSource = decodeMediaProtocolSource(source);
  const prepared = await prepareRenderableSource(normalizedSource);
  try {
    const metadata = await probeMedia(prepared.filePath).catch(() => null);
    if (!metadata?.width || !metadata?.height) throw new Error('无法读取视频尺寸，不能裁剪');
    const crop = normalizeVideoCropRect(options.crop, metadata);
    const outputDir = path.join(app.getPath('userData'), 'media-cache', options.folder || 'material-crops');
    await fs.mkdir(outputDir, { recursive: true });
    const baseName = buildSplitOutputBaseName(options.fileName || inferDownloadFileName(normalizedSource));
    const runId = createHash('sha1')
      .update(`${normalizedSource}|crop|${Date.now()}|${Math.random()}`)
      .digest('hex')
      .slice(0, 8);
    const outputPath = path.join(outputDir, `${baseName}-crop-${runId}.mp4`);

    await runProcess(ffmpegPath, [
      '-y',
      '-i', prepared.filePath,
      '-map', '0:v:0',
      '-map', '0:a?',
      '-vf', `crop=${crop.pixelWidth}:${crop.pixelHeight}:${crop.pixelX}:${crop.pixelY}`,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '22',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      outputPath
    ], { timeout: 180000 });
    await assertNonEmptyFile(outputPath);
    const stat = await fs.stat(outputPath);
    return {
      source: normalizedSource,
      duration: Number(metadata.duration) || 0,
      width: crop.pixelWidth,
      height: crop.pixelHeight,
      localPath: outputPath,
      name: path.basename(outputPath),
      size: stat.size,
      crop: crop.normalized
    };
  } finally {
    await prepared.cleanup?.();
  }
}

function normalizeVideoCropRect(rawCrop, metadata) {
  const sourceWidth = Math.max(2, Math.round(Number(metadata.width) || 0));
  const sourceHeight = Math.max(2, Math.round(Number(metadata.height) || 0));
  const normalized = {
    x: clampNumber(Number(rawCrop?.x) || 0, 0, 1),
    y: clampNumber(Number(rawCrop?.y) || 0, 0, 1),
    width: clampNumber(Number(rawCrop?.width) || 1, 0.02, 1),
    height: clampNumber(Number(rawCrop?.height) || 1, 0.02, 1)
  };
  normalized.width = Math.min(normalized.width, 1 - normalized.x);
  normalized.height = Math.min(normalized.height, 1 - normalized.y);
  let pixelX = evenFloor(normalized.x * sourceWidth);
  let pixelY = evenFloor(normalized.y * sourceHeight);
  let pixelWidth = evenFloor(normalized.width * sourceWidth);
  let pixelHeight = evenFloor(normalized.height * sourceHeight);
  pixelWidth = Math.max(2, Math.min(pixelWidth, sourceWidth - pixelX));
  pixelHeight = Math.max(2, Math.min(pixelHeight, sourceHeight - pixelY));
  if (pixelX + pixelWidth > sourceWidth) pixelX = evenFloor(sourceWidth - pixelWidth);
  if (pixelY + pixelHeight > sourceHeight) pixelY = evenFloor(sourceHeight - pixelHeight);
  return {
    pixelX,
    pixelY,
    pixelWidth: evenFloor(pixelWidth),
    pixelHeight: evenFloor(pixelHeight),
    normalized: {
      x: pixelX / sourceWidth,
      y: pixelY / sourceHeight,
      width: pixelWidth / sourceWidth,
      height: pixelHeight / sourceHeight
    }
  };
}

function evenFloor(value) {
  return Math.max(0, Math.floor((Number(value) || 0) / 2) * 2);
}

async function renderViralVideo(sourcePath, outputPath, overlay) {
  if (!ffmpegPath) {
    throw new Error('未找到可用的 ffmpeg，无法渲染字幕和特效');
  }
  try {
    await renderViralVideoWithPupCaps(sourcePath, outputPath, overlay);
    return;
  } catch (error) {
    console.warn('[moya] PupCaps render failed, falling back to ASS subtitles:', error?.message || error);
  }
  const tempDir = await fs.mkdtemp(path.join(app.getPath('temp'), 'moya-viral-'));
  const assPath = path.join(tempDir, 'viral-overlay.ass');
  try {
    const metadata = await probeVideo(sourcePath).catch(() => ({ width: 720, height: 1280, duration: 0 }));
    const renderCanvas = buildViralRenderCanvas(metadata, overlay);
    const assText = buildViralAss(overlay, renderCanvas);
    await fs.writeFile(assPath, assText, 'utf8');
    console.log('[moya] rendering viral overlay', {
      sourcePath,
      outputPath,
      assPath,
      canvas: `${renderCanvas.width}x${renderCanvas.height}`,
      fit: overlay.previewVideoFit || 'cover',
      titleStyle: overlay.titleTextStyle,
      captionStyle: overlay.captionTextStyle,
      titlePosition: overlay.titlePosition,
      captionPosition: overlay.captionPosition,
      captions: Array.isArray(overlay.subtitleSegments) ? overlay.subtitleSegments.length : 0
    });
    const videoZoomRanges = readOverlayVideoZoomRanges(overlay.videoZoomRanges);
    if (videoZoomRanges.length) {
      const baseFilter = buildViralSegmentedVideoFilter('[0:v]', renderCanvas, overlay, renderCanvas.duration, 'base');
      const filterComplex = `${baseFilter};[base]${buildAssSubtitleFilter(assPath)}[v]`;
      await runProcess(ffmpegPath, [
        '-y',
        '-i', sourcePath,
        '-filter_complex', filterComplex,
        '-map', '[v]',
        '-map', '0:a?',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '20',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '160k',
        '-movflags', '+faststart',
        outputPath
      ]);
      return;
    }
    const videoFilter = `${buildViralVideoCanvasFilter(renderCanvas, overlay)},${buildAssSubtitleFilter(assPath)}`;
    await runProcess(ffmpegPath, [
      '-y',
      '-i', sourcePath,
      '-vf', videoFilter,
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

async function renderFissionMix(request = {}) {
  if (!ffmpegPath) {
    throw new Error('未找到可用的 ffmpeg，无法执行本地混剪');
  }
  const normalizedRequest = normalizeFissionMixRenderRequest(request);
  if (normalizedRequest.scenes.length === 0) {
    throw new Error('没有可渲染的分镜混剪场景');
  }

  const outputDir = path.join(app.getPath('userData'), 'renders', 'fission-mix');
  await fs.mkdir(outputDir, { recursive: true });
  const tempDir = await fs.mkdtemp(path.join(app.getPath('temp'), 'moya-fission-mix-'));
  const outputPath = path.join(outputDir, buildFissionMixOutputName(normalizedRequest.name));
  const stitchedPath = path.join(tempDir, 'stitched.mp4');
  const narratedPath = path.join(tempDir, 'stitched-narration.mp4');
  const sourceCache = new Map();

  try {
    const sceneFiles = [];
    for (let index = 0; index < normalizedRequest.scenes.length; index += 1) {
      const scene = normalizedRequest.scenes[index];
      const scenePath = path.join(tempDir, `scene-${String(index + 1).padStart(3, '0')}.mp4`);
      await renderFissionMixScene(scene, scenePath, sourceCache);
      sceneFiles.push(scenePath);
    }

    if (sceneFiles.length === 1) {
      await finalizeFissionMixSceneFile(sceneFiles[0], stitchedPath);
    } else {
      const concatListPath = path.join(tempDir, 'concat.txt');
      const concatList = sceneFiles.map((filePath) => `file '${quoteConcatDemuxerPath(filePath)}'`).join('\n');
      await fs.writeFile(concatListPath, `${concatList}\n`, 'utf8');
      // Each scene is encoded independently. Re-encoding the final audio once avoids
      // AAC padding/cut-point artifacts that are more noticeable in waterfall stitching.
      await runProcess(ffmpegPath, [
        '-y',
        '-f', 'concat',
        '-safe', '0',
        '-i', concatListPath,
        '-c:v', 'copy',
        '-af', 'aresample=async=1:first_pts=0',
        '-c:a', 'aac',
        '-b:a', '160k',
        '-ar', '48000',
        '-ac', '2',
        '-movflags', '+faststart',
        stitchedPath
      ], { timeout: 180000 });
    }

    const baseAudioPath = normalizedRequest.narrationSegments.length > 0
      ? narratedPath
      : stitchedPath;

    if (normalizedRequest.narrationSegments.length > 0) {
      await renderFissionMixNarrationAudio(stitchedPath, narratedPath, normalizedRequest, sourceCache);
    }

    if (normalizedRequest.bgmTracks.length > 0) {
      await renderFissionMixBackgroundAudio(baseAudioPath, outputPath, normalizedRequest, sourceCache);
    } else {
      await fs.copyFile(baseAudioPath, outputPath);
    }

    const metadata = await probeMedia(outputPath).catch(() => null);
    return {
      localPath: outputPath,
      duration: Number(metadata?.duration) || normalizedRequest.scenes.reduce((total, scene) => total + scene.sceneDuration, 0),
      width: normalizedRequest.scenes[0]?.width || 720,
      height: normalizedRequest.scenes[0]?.height || 1280,
      sceneCount: normalizedRequest.scenes.length,
      name: path.basename(outputPath)
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

const FISSION_SUBTITLE_MASK_CROP_RATIO = 0.86;

async function renderFissionMixScene(scene, outputPath, sourceCache) {
  const videoSource = await prepareFissionMixSource(scene.videoSource, {
    folder: 'fission/render-inputs',
    fileName: `${scene.clipName || scene.id}.mp4`
  }, sourceCache);
  if (!videoSource.localPath) {
    throw new Error(`分镜 ${scene.groupName || scene.id} 缺少可用的视频素材`);
  }

  const fallbackVideoDuration = Math.max(scene.sceneDuration, scene.videoOut, 0.2);
  const videoDuration = Math.max(0, Number(videoSource.metadata?.duration) || 0, fallbackVideoDuration);
  const videoIn = clampSeconds(Number(scene.videoIn) || 0, 0, Math.max(0, videoDuration - 0.02));
  const videoOut = clampSeconds(
    Number(scene.videoOut) || (videoIn + scene.sceneDuration),
    Math.min(videoDuration, videoIn + 0.02),
    videoDuration
  );
  const sceneDuration = Math.max(0.12, Math.min(Number(scene.sceneDuration) || (videoOut - videoIn), videoOut - videoIn || Number(scene.sceneDuration) || 0.12));
  const fps = positiveNumberOr(scene.fps, 30);
  const width = positiveNumberOr(scene.width, 720);
  const height = positiveNumberOr(scene.height, 1280);

  let externalAudioSource = null;
  if (scene.audioSource) {
    externalAudioSource = await prepareFissionMixSource(scene.audioSource, {
      folder: 'fission/render-audios',
      fileName: `${scene.audioName || scene.id}.mp3`
    }, sourceCache);
  }

  const videoHasAudio = Boolean(videoSource.metadata?.hasAudio);
  const externalHasAudio = Boolean(externalAudioSource?.metadata?.hasAudio);
  const externalAudioDuration = Math.max(0, Number(scene.audioOut) - Number(scene.audioIn));
  const includeVideoAudio = videoHasAudio && Number(scene.videoAudioGain) > 0.0001;
  const includeExternalAudio = externalHasAudio && externalAudioDuration > 0.02 && Number(scene.audioGain) > 0.0001;

  const args = ['-y', '-i', videoSource.localPath];
  let externalAudioInputIndex = -1;
  if (includeExternalAudio && externalAudioSource?.localPath) {
    args.push('-i', externalAudioSource.localPath);
    externalAudioInputIndex = 1;
  }
  const silenceInputIndex = includeExternalAudio ? 2 : 1;
  args.push(
    '-f', 'lavfi',
    '-t', formatFfmpegSeconds(sceneDuration),
    '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000'
  );

  const subtitleMaskFilter = scene.maskSubtitles
    ? `,crop=iw:trunc(ih*${FISSION_SUBTITLE_MASK_CROP_RATIO.toFixed(4)}/2)*2:0:0`
    : '';
  const filters = [
    `[0:v]trim=start=${formatFfmpegSeconds(videoIn)}:end=${formatFfmpegSeconds(videoOut)},setpts=PTS-STARTPTS${subtitleMaskFilter},scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=${fps},format=yuv420p[v]`,
    `[${silenceInputIndex}:a]atrim=duration=${formatFfmpegSeconds(sceneDuration)},asetpts=PTS-STARTPTS[sil]`
  ];
  const audioMixLabels = ['[sil]'];

  if (includeVideoAudio) {
    const videoAudioFade = scene.fadeInOut
      ? buildFissionSceneAudioEdgeFadeFilter(
        sceneDuration,
        scene.transitionMode === 'waterfall' ? 'waterfall-video' : 'scene-video',
        {
          fadeInDuration: scene.audioFadeInDuration,
          fadeOutDuration: scene.audioFadeOutDuration
        }
      )
      : '';
    filters.push(
      `[0:a]atrim=start=${formatFfmpegSeconds(videoIn)}:end=${formatFfmpegSeconds(videoOut)},asetpts=PTS-STARTPTS,volume=${formatFfmpegGain(scene.videoAudioGain)}${videoAudioFade}[va]`
    );
    audioMixLabels.push('[va]');
  }

  if (includeExternalAudio && externalAudioInputIndex >= 0) {
    const audioIn = clampSeconds(Number(scene.audioIn) || 0, 0, Math.max(0, Number(externalAudioSource?.metadata?.duration) || Number(scene.audioOut) || 0));
    const audioOut = clampSeconds(
      Number(scene.audioOut) || (audioIn + externalAudioDuration),
      Math.min(Number(externalAudioSource?.metadata?.duration) || (audioIn + 0.02), audioIn + 0.02),
      Math.max(Number(externalAudioSource?.metadata?.duration) || 0, audioIn + externalAudioDuration)
    );
    const clippedExternalAudioDuration = Math.max(0.02, audioOut - audioIn);
    let externalAudioFilter = `[${externalAudioInputIndex}:a]atrim=start=${formatFfmpegSeconds(audioIn)}:end=${formatFfmpegSeconds(audioOut)},asetpts=PTS-STARTPTS,volume=${formatFfmpegGain(scene.audioGain)}`;
    if (scene.fadeInOut) {
      externalAudioFilter += buildFissionSceneAudioEdgeFadeFilter(
        clippedExternalAudioDuration,
        isFissionVoiceLikeAudioUsage(scene.audioUsageType) || scene.voiceLocked ? 'voice' : 'scene-external',
        {
          fadeInDuration: scene.audioFadeInDuration,
          fadeOutDuration: scene.audioFadeOutDuration
        }
      );
    }
    externalAudioFilter += '[ea]';
    filters.push(externalAudioFilter);
    audioMixLabels.push('[ea]');
  }

  filters.push(
    `${audioMixLabels.join('')}amix=inputs=${audioMixLabels.length}:duration=longest:dropout_transition=0,atrim=duration=${formatFfmpegSeconds(sceneDuration)},aresample=async=1:first_pts=0[a]`
  );

  args.push(
    '-filter_complex', filters.join(';'),
    '-map', '[v]',
    '-map', '[a]',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '20',
    '-pix_fmt', 'yuv420p',
    '-r', String(fps),
    '-c:a', 'alac',
    '-ar', '48000',
    '-ac', '2',
    '-movflags', '+faststart',
    outputPath
  );

  await runProcess(ffmpegPath, args, { timeout: 180000 });
}

async function renderFissionMixBackgroundAudio(inputPath, outputPath, request, sourceCache) {
  const targetDuration = Math.max(
    0.12,
    Number((await probeMedia(inputPath).catch(() => null))?.duration) || 0,
    request.scenes.reduce((total, scene) => total + (Number(scene.sceneDuration) || 0), 0)
  );
  const baseMetadata = await probeMedia(inputPath).catch(() => null);
  const usableTracks = [];

  for (const track of request.bgmTracks) {
    const prepared = await prepareFissionMixSource(track.source, {
      folder: 'fission/render-bgm',
      fileName: `${track.name || track.id}.mp3`
    }, sourceCache);
    if (!prepared.localPath || !prepared.metadata?.hasAudio) continue;
    usableTracks.push({
      ...track,
      source: prepared.localPath,
      duration: Math.max(0.02, Number(track.duration) || Number(prepared.metadata?.duration) || 0)
    });
  }

  if (usableTracks.length === 0) {
    await fs.copyFile(inputPath, outputPath);
    return;
  }

  const args = ['-y', '-i', inputPath];
  const filters = [];
  const audioMixLabels = [];
  let inputIndex = 1;

  if (baseMetadata?.hasAudio) {
    filters.push(`[0:a]atrim=duration=${formatFfmpegSeconds(targetDuration)},asetpts=PTS-STARTPTS[base]`);
    audioMixLabels.push('[base]');
  } else {
    args.push(
      '-f', 'lavfi',
      '-t', formatFfmpegSeconds(targetDuration),
      '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000'
    );
    filters.push(`[1:a]atrim=duration=${formatFfmpegSeconds(targetDuration)},asetpts=PTS-STARTPTS[base]`);
    audioMixLabels.push('[base]');
    inputIndex = 2;
  }

  usableTracks.forEach((track, trackIndex) => {
    args.push('-stream_loop', '-1', '-i', track.source);
    let filter = `[${inputIndex + trackIndex}:a]atrim=duration=${formatFfmpegSeconds(targetDuration)},asetpts=PTS-STARTPTS,volume=${formatFfmpegGain(track.gain)}`;
    if (track.fadeInOut) {
      const fadeDuration = Math.min(0.6, Math.max(0.12, targetDuration / 10));
      const fadeOutStart = Math.max(0, targetDuration - fadeDuration);
      filter += `,afade=t=in:st=0:d=${formatFfmpegSeconds(fadeDuration)},afade=t=out:st=${formatFfmpegSeconds(fadeOutStart)}:d=${formatFfmpegSeconds(fadeDuration)}`;
    }
    filter += `[bgm${trackIndex}]`;
    filters.push(filter);
    audioMixLabels.push(`[bgm${trackIndex}]`);
  });

  filters.push(
    `${audioMixLabels.join('')}amix=inputs=${audioMixLabels.length}:duration=longest:dropout_transition=0,atrim=duration=${formatFfmpegSeconds(targetDuration)},aresample=async=1:first_pts=0[a]`
  );

  args.push(
    '-filter_complex', filters.join(';'),
    '-map', '0:v',
    '-map', '[a]',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '160k',
    '-ar', '48000',
    '-ac', '2',
    '-movflags', '+faststart',
    outputPath
  );

  await runProcess(ffmpegPath, args, { timeout: 180000 });
}

async function prepareFissionMixSource(source, options = {}, sourceCache = new Map()) {
  const cacheKey = `${options.folder || 'general'}:${source}`;
  if (sourceCache.has(cacheKey)) {
    return sourceCache.get(cacheKey);
  }

  let localPath = source;
  if (/^https?:\/\//i.test(source)) {
    const cachedMedia = await cacheMediaSourceLocally(source, {
      folder: options.folder || 'general',
      fileName: options.fileName || inferDownloadFileName(source)
    });
    localPath = cachedMedia.localPath;
  } else if (/^file:\/\//i.test(source)) {
    localPath = fileURLToPath(source);
  }

  if (!localPath || !fsSync.existsSync(localPath)) {
    throw new Error(`本地混剪素材不存在：${source}`);
  }

  const prepared = {
    localPath,
    metadata: await probeMedia(localPath).catch(() => null)
  };
  sourceCache.set(cacheKey, prepared);
  return prepared;
}

function normalizeFissionMixRenderRequest(request = {}) {
  const rawScenes = Array.isArray(request.scenes) ? request.scenes : [];
  const rawBgmTracks = Array.isArray(request.bgmTracks) ? request.bgmTracks : [];
  const rawNarrationSegments = Array.isArray(request.narrationSegments) ? request.narrationSegments : [];
  const scenes = rawScenes
    .map((scene, index) => normalizeFissionMixScene(scene, index))
    .filter(Boolean);
  const bgmTracks = rawBgmTracks
    .map((track, index) => normalizeFissionMixBackgroundTrack(track, index))
    .filter(Boolean);
  const narrationSegments = rawNarrationSegments
    .map((segment, index) => normalizeFissionMixNarrationSegment(segment, index))
    .filter(Boolean);
  return {
    name: safeDownloadFileName(`${String(request.name || 'fission-mix').replace(/\.[^.]+$/, '')}-${Date.now()}.mp4`),
    scenes,
    bgmTracks,
    narrationSegments
  };
}

function normalizeFissionMixScene(scene, index) {
  if (!scene || typeof scene !== 'object') return null;
  if (!scene.videoSource || typeof scene.videoSource !== 'string') return null;
  const sceneDuration = Math.max(0.12, Number(scene.sceneDuration) || 0);
  return {
    id: String(scene.id || `scene-${index + 1}`),
    groupId: String(scene.groupId || `group-${index + 1}`),
    groupName: String(scene.groupName || `分镜 ${index + 1}`),
    sceneNo: positiveNumberOr(scene.sceneNo, index + 1),
    clipName: String(scene.clipName || `clip-${index + 1}`),
    audioName: scene.audioName ? String(scene.audioName) : undefined,
    videoSource: scene.videoSource,
    audioSource: typeof scene.audioSource === 'string' && scene.audioSource ? scene.audioSource : undefined,
    videoIn: Math.max(0, Number(scene.videoIn) || 0),
    videoOut: Math.max(Number(scene.videoIn) || 0, Number(scene.videoOut) || ((Number(scene.videoIn) || 0) + sceneDuration)),
    audioIn: Math.max(0, Number(scene.audioIn) || 0),
    audioOut: Math.max(Number(scene.audioIn) || 0, Number(scene.audioOut) || ((Number(scene.audioIn) || 0) + Math.max(0, Number(scene.audioDuration) || 0))),
    sceneDuration,
    audioDuration: Math.max(0, Number(scene.audioDuration) || 0),
    audioGain: clampNumber(Number(scene.audioGain), 0, 2),
    videoAudioGain: clampNumber(Number(scene.videoAudioGain), 0, 2),
    width: positiveNumberOr(scene.width, 720),
    height: positiveNumberOr(scene.height, 1280),
    bitrate: positiveNumberOr(scene.bitrate, 6000),
    fps: positiveNumberOr(scene.fps, 30),
    fadeInOut: Boolean(scene.fadeInOut),
    maskSubtitles: Boolean(scene.maskSubtitles),
    voiceLocked: Boolean(scene.voiceLocked),
    contentProfile: typeof scene.contentProfile === 'string' ? scene.contentProfile : 'standard',
    audioSelectionSource: typeof scene.audioSelectionSource === 'string' ? scene.audioSelectionSource : undefined,
    audioUsageType: typeof scene.audioUsageType === 'string' ? scene.audioUsageType : undefined,
    transitionMode: scene.transitionMode === 'waterfall' ? 'waterfall' : 'default',
    leadingTrim: Math.max(0, Number(scene.leadingTrim) || 0),
    trailingTrim: Math.max(0, Number(scene.trailingTrim) || 0),
    audioFadeInDuration: Math.max(0, Number(scene.audioFadeInDuration) || 0),
    audioFadeOutDuration: Math.max(0, Number(scene.audioFadeOutDuration) || 0)
  };
}

function normalizeFissionMixBackgroundTrack(track, index) {
  if (!track || typeof track !== 'object') return null;
  if (!track.source || typeof track.source !== 'string') return null;
  return {
    id: String(track.id || `bgm-${index + 1}`),
    name: String(track.name || `BGM ${index + 1}`),
    source: track.source,
    duration: Math.max(0.02, Number(track.duration) || 0),
    gain: clampNumber(Number(track.gain), 0, 2),
    fadeInOut: Boolean(track.fadeInOut)
  };
}

function normalizeFissionMixNarrationSegment(segment, index) {
  if (!segment || typeof segment !== 'object') return null;
  if (!segment.source || typeof segment.source !== 'string') return null;
  const audioIn = Math.max(0, Number(segment.audioIn) || 0);
  const audioOut = Math.max(audioIn, Number(segment.audioOut) || audioIn);
  const timelineIn = Math.max(0, Number(segment.timelineIn) || 0);
  const timelineOut = Math.max(timelineIn, Number(segment.timelineOut) || timelineIn + Math.max(0, audioOut - audioIn));
  return {
    id: String(segment.id || `narration-${index + 1}`),
    sceneId: String(segment.sceneId || `scene-${index + 1}`),
    groupId: String(segment.groupId || `group-${index + 1}`),
    groupName: String(segment.groupName || `分镜 ${index + 1}`),
    name: String(segment.name || `旁白 ${index + 1}`),
    source: segment.source,
    audioIn,
    audioOut,
    timelineIn,
    timelineOut,
    gain: clampNumber(Number(segment.gain), 0, 2),
    fadeInDuration: Math.max(0, Number(segment.fadeInDuration) || 0),
    fadeOutDuration: Math.max(0, Number(segment.fadeOutDuration) || 0),
    usageType: typeof segment.usageType === 'string' ? segment.usageType : undefined
  };
}

function buildFissionMixOutputName(name) {
  return safeDownloadFileName(name || `fission-mix-${Date.now()}.mp4`);
}

function quoteConcatDemuxerPath(filePath) {
  return String(filePath || '').replace(/\\/g, '/').replace(/'/g, "'\\''");
}

function formatFfmpegSeconds(value) {
  const numeric = Math.max(0, Number(value) || 0);
  return numeric.toFixed(4);
}

function formatFfmpegGain(value) {
  const numeric = clampNumber(Number(value), 0, 2);
  return numeric.toFixed(4);
}

async function finalizeFissionMixSceneFile(inputPath, outputPath) {
  await runProcess(ffmpegPath, [
    '-y',
    '-i', inputPath,
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '160k',
    '-ar', '48000',
    '-ac', '2',
    '-movflags', '+faststart',
    outputPath
  ], { timeout: 180000 });
}

async function renderFissionMixNarrationAudio(inputPath, outputPath, request, sourceCache) {
  const targetDuration = Math.max(
    0.12,
    Number((await probeMedia(inputPath).catch(() => null))?.duration) || 0,
    request.scenes.reduce((total, scene) => total + (Number(scene.sceneDuration) || 0), 0)
  );
  const baseMetadata = await probeMedia(inputPath).catch(() => null);
  const usableSegments = [];

  for (const segment of request.narrationSegments || []) {
    const prepared = await prepareFissionMixSource(segment.source, {
      folder: 'fission/render-narration',
      fileName: `${segment.name || segment.id}.mp3`
    }, sourceCache);
    if (!prepared.localPath || !prepared.metadata?.hasAudio) continue;
    usableSegments.push({
      ...segment,
      source: prepared.localPath,
      sourceDuration: Math.max(0.02, Number(prepared.metadata?.duration) || 0)
    });
  }

  if (usableSegments.length === 0) {
    await fs.copyFile(inputPath, outputPath);
    return;
  }

  const args = ['-y', '-i', inputPath];
  const filters = [];
  const audioMixLabels = [];
  let baseInputIndex = 1;

  if (baseMetadata?.hasAudio) {
    filters.push(`[0:a]atrim=duration=${formatFfmpegSeconds(targetDuration)},asetpts=PTS-STARTPTS[base]`);
    audioMixLabels.push('[base]');
  } else {
    args.push(
      '-f', 'lavfi',
      '-t', formatFfmpegSeconds(targetDuration),
      '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000'
    );
    filters.push(`[1:a]atrim=duration=${formatFfmpegSeconds(targetDuration)},asetpts=PTS-STARTPTS[base]`);
    audioMixLabels.push('[base]');
    baseInputIndex = 2;
  }

  usableSegments.forEach((segment, segmentIndex) => {
    args.push('-i', segment.source);
    const inputIndex = baseInputIndex + segmentIndex;
    const segmentDuration = Math.max(0.02, Math.min(segment.audioOut - segment.audioIn, segment.sourceDuration));
    const delayMs = Math.max(0, Math.round(segment.timelineIn * 1000));
    let filter = `[${inputIndex}:a]atrim=start=${formatFfmpegSeconds(segment.audioIn)}:end=${formatFfmpegSeconds(segment.audioIn + segmentDuration)},asetpts=PTS-STARTPTS,volume=${formatFfmpegGain(segment.gain)}`;
    filter += buildFissionSceneAudioEdgeFadeFilter(
      segmentDuration,
      isFissionVoiceLikeAudioUsage(segment.usageType) ? 'waterfall-voice' : 'scene-external',
      {
        fadeInDuration: segment.fadeInDuration,
        fadeOutDuration: segment.fadeOutDuration
      }
    );
    filter += `,adelay=${delayMs}|${delayMs}[nar${segmentIndex}]`;
    filters.push(filter);
    audioMixLabels.push(`[nar${segmentIndex}]`);
  });

  filters.push(
    `${audioMixLabels.join('')}amix=inputs=${audioMixLabels.length}:duration=longest:dropout_transition=0,atrim=duration=${formatFfmpegSeconds(targetDuration)},aresample=async=1:first_pts=0[a]`
  );

  args.push(
    '-filter_complex', filters.join(';'),
    '-map', '0:v',
    '-map', '[a]',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '160k',
    '-ar', '48000',
    '-ac', '2',
    '-movflags', '+faststart',
    outputPath
  );

  await runProcess(ffmpegPath, args, { timeout: 180000 });
}

function isFissionVoiceLikeAudioUsage(usageType) {
  return usageType === 'voice' || usageType === 'ai_voice';
}

function buildFissionSceneAudioEdgeFadeFilter(duration, profile = 'scene-video', options = {}) {
  const clipDuration = Math.max(0, Number(duration) || 0);
  if (clipDuration < 0.08) return '';

  let fadeDuration = 0;
  if (profile === 'voice') {
    fadeDuration = Math.min(0.035, Math.max(0.014, clipDuration / 80));
  } else if (profile === 'waterfall-voice') {
    fadeDuration = Math.min(0.018, Math.max(0.008, clipDuration / 160));
  } else if (profile === 'waterfall-video') {
    fadeDuration = Math.min(0.09, Math.max(0.024, clipDuration / 28));
  } else if (profile === 'scene-video') {
    fadeDuration = Math.min(0.07, Math.max(0.02, clipDuration / 36));
  } else {
    fadeDuration = Math.min(0.22, Math.max(0.06, clipDuration / 12));
  }

  const maxSafeFade = Math.max(0, clipDuration / 2 - 0.006);
  const safeFadeInDuration = Math.min(
    Math.max(0, Number(options.fadeInDuration) || fadeDuration),
    maxSafeFade
  );
  const safeFadeOutDuration = Math.min(
    Math.max(0, Number(options.fadeOutDuration) || fadeDuration),
    maxSafeFade
  );
  let filter = '';
  if (safeFadeInDuration > 0.01) {
    filter += `,afade=t=in:st=0:d=${formatFfmpegSeconds(safeFadeInDuration)}`;
  }
  if (safeFadeOutDuration > 0.01) {
    const fadeOutStart = Math.max(0, clipDuration - safeFadeOutDuration);
    filter += `,afade=t=out:st=${formatFfmpegSeconds(fadeOutStart)}:d=${formatFfmpegSeconds(safeFadeOutDuration)}`;
  }
  return filter;
}

function positiveNumberOr(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

async function renderViralVideoWithPupCaps(sourcePath, outputPath, overlay) {
  if (!nodePath) {
    throw new Error('未找到可用的 node，无法运行 PupCaps');
  }
  const pupcapsCliPath = findPupCapsCliPath();
  if (!pupcapsCliPath) {
    throw new Error('未找到 PupCaps CLI，请确认已安装 pupcaps 依赖');
  }
  const tempDir = await fs.mkdtemp(path.join(app.getPath('temp'), 'moya-pupcaps-'));
  const srtPath = path.join(tempDir, 'viral-captions.srt');
  const cssPath = path.join(tempDir, 'viral-captions.css');
  const movPath = path.join(tempDir, 'viral-captions.mov');
  const titleAssPath = path.join(tempDir, 'viral-title.ass');
  try {
    const metadata = await probeVideo(sourcePath).catch(() => ({ width: 720, height: 1280, duration: 0 }));
    const renderCanvas = buildViralRenderCanvas(metadata, overlay);
    await fs.writeFile(srtPath, buildPupCapsSrt(overlay, renderCanvas), 'utf8');
    await fs.writeFile(cssPath, buildPupCapsCss(overlay, renderCanvas), 'utf8');
    await fs.writeFile(titleAssPath, buildViralTitleAss(overlay, renderCanvas), 'utf8');
    await runProcess(nodePath, [
      pupcapsCliPath,
      srtPath,
      '--output', movPath,
      '--style', cssPath,
      '--width', String(renderCanvas.width),
      '--height', String(renderCanvas.height),
      '--fps', '30'
    ], { timeout: 120000 });
    const movStat = await fs.stat(movPath);
    if (!movStat.isFile() || movStat.size <= 0) {
      throw new Error('PupCaps 未生成有效字幕层');
    }
    const videoZoomRanges = readOverlayVideoZoomRanges(overlay.videoZoomRanges);
    const baseFilter = videoZoomRanges.length
      ? buildViralSegmentedVideoFilter('[0:v]', renderCanvas, overlay, renderCanvas.duration, 'base')
      : `[0:v]${buildViralVideoCanvasFilter(renderCanvas, overlay)}[base]`;
    const filterComplex = `${baseFilter};[base][1:v]overlay=0:0,${buildAssSubtitleFilter(titleAssPath)}[v]`;
    await runProcess(ffmpegPath, [
      '-y',
      '-i', sourcePath,
      '-i', movPath,
      '-filter_complex', filterComplex,
      '-map', '[v]',
      '-map', '0:a?',
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
  return probeMedia(filePath).then((metadata) => ({
    width: metadata.width || 720,
    height: metadata.height || 1280,
    duration: metadata.duration || 0
  }));
}

function probeMedia(filePath) {
  return new Promise((resolve, reject) => {
    if (!ffprobePath) {
      reject(new Error('未找到可用的 ffprobe'));
      return;
    }
    execFile(ffprobePath, [
      '-v', 'error',
      '-show_entries', 'stream=codec_type,width,height,duration:format=duration',
      '-of', 'json',
      filePath
    ], { windowsHide: true }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      try {
        const data = JSON.parse(stdout || '{}');
        const streams = Array.isArray(data.streams) ? data.streams : [];
        const videoStream = streams.find((stream) => stream?.codec_type === 'video') || streams[0] || {};
        const audioStream = streams.find((stream) => stream?.codec_type === 'audio');
        const streamDuration = Number(videoStream.duration) || Number(audioStream?.duration) || 0;
        resolve({
          width: Number(videoStream.width) || 0,
          height: Number(videoStream.height) || 0,
          duration: Number(data.format?.duration) || streamDuration || 0,
          hasVideo: Boolean(videoStream && videoStream.codec_type === 'video'),
          hasAudio: Boolean(audioStream)
        });
      } catch (parseError) {
        reject(parseError);
      }
    });
  });
}

async function requestBackendApi(request = {}) {
  const method = String(request.method || 'GET').toUpperCase();
  const targetUrl = resolveBackendApiUrl(request.url);
  const headers = normalizeApiRequestHeaders(request.headers);
  let body = request.data;
  if (body !== undefined && body !== null && typeof body === 'object' && !(body instanceof ArrayBuffer)) {
    body = JSON.stringify(body);
    if (!hasHeader(headers, 'content-type')) {
      headers['Content-Type'] = 'application/json';
    }
  }
  const controller = new AbortController();
  const timeoutMs = Math.max(1000, Number(request.timeout) || 30000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(targetUrl, {
      method,
      headers,
      body: method === 'GET' || method === 'HEAD' ? undefined : body,
      signal: controller.signal
    });
    const responseText = await response.text();
    return {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      data: parseApiResponseBody(responseText, response.headers.get('content-type') || '')
    };
  } catch (error) {
    const detail = error?.name === 'AbortError'
      ? `请求超时（${Math.round(timeoutMs / 1000)}s）`
      : (error?.message || String(error));
    throw new Error(`无法连接后端服务：${apiBaseUrl}。请确认 moya_portal_banked 已启动。${detail ? ` (${detail})` : ''}`);
  } finally {
    clearTimeout(timeout);
  }
}

function resolveBackendApiUrl(rawUrl = '') {
  const apiRoot = new URL(`${apiBaseUrl}/`);
  const value = String(rawUrl || '').trim();
  if (/^https?:\/\//i.test(value)) {
    const target = new URL(value);
    const rootPath = apiRoot.pathname.replace(/\/+$/, '');
    if (target.origin !== apiRoot.origin || !target.pathname.startsWith(`${rootPath}/`)) {
      throw new Error('仅允许请求当前后端 API');
    }
    return target.toString();
  }
  const path = value.replace(/^\/+/, '').replace(/^api\/+/, '');
  return new URL(path, apiRoot).toString();
}

function normalizeApiRequestHeaders(headers = {}) {
  return Object.entries(headers || {}).reduce((nextHeaders, [key, value]) => {
    if (value === undefined || value === null) return nextHeaders;
    nextHeaders[key] = Array.isArray(value) ? value.join(', ') : String(value);
    return nextHeaders;
  }, {});
}

function hasHeader(headers, name) {
  const normalizedName = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === normalizedName);
}

function parseApiResponseBody(text, contentType) {
  if (!text) return null;
  if (!/json/i.test(contentType)) return text;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function analyzeSpeechWindow(filePath) {
  const metadata = await probeMedia(filePath).catch(() => ({ duration: 0 }));
  const duration = Math.max(0, Number(metadata.duration) || 0);
  if (!(duration > 0)) {
    return {
      duration: 0,
      speechStart: 0,
      speechEnd: 0,
      speechDuration: 0,
      trimmedLeading: 0,
      trimmedTrailing: 0,
      hasSpeech: false
    };
  }
  if (!ffmpegPath) {
    return buildSpeechWindowFallback(duration);
  }

  const analysisLog = await new Promise((resolve) => {
    execFile(ffmpegPath, [
      '-hide_banner',
      '-i', filePath,
      '-af', 'silencedetect=noise=-34dB:d=0.18',
      '-f', 'null',
      process.platform === 'win32' ? 'NUL' : '/dev/null'
    ], { windowsHide: true, timeout: 30_000, maxBuffer: 10 * 1024 * 1024 }, (_error, stdout, stderr) => {
      resolve(`${stdout || ''}\n${stderr || ''}`);
    });
  });
  return buildSpeechWindowFromSilenceLog(String(analysisLog || ''), duration);
}

async function analyzeAudioContinuity(filePath) {
  const metadata = await probeMedia(filePath).catch(() => ({ duration: 0, hasAudio: false }));
  const duration = Math.max(0, Number(metadata.duration) || 0);
  const hasAudio = Boolean(metadata.hasAudio);
  if (!(duration > 0) || !hasAudio) {
    return buildAudioContinuityFallback(duration, hasAudio);
  }
  if (!ffmpegPath) {
    return buildAudioContinuityFallback(duration, true);
  }

  const analysisWindow = clampSeconds(
    duration <= 0.36 ? duration / 2 : 0.22,
    0.08,
    Math.max(0.08, Math.min(0.32, duration / 2))
  );
  const safeWindow = Math.max(0.08, Math.min(analysisWindow, duration));
  const head = await analyzeAudioContinuityEdge(filePath, 0, safeWindow).catch(() => buildAudioContinuityEdgeFallback(safeWindow));
  const tailStart = Math.max(0, duration - safeWindow);
  const tail = await analyzeAudioContinuityEdge(filePath, tailStart, safeWindow).catch(() => buildAudioContinuityEdgeFallback(safeWindow));
  return {
    duration,
    hasAudio: true,
    analysisWindow: safeWindow,
    head,
    tail
  };
}

function buildSpeechWindowFallback(duration) {
  return {
    duration,
    speechStart: 0,
    speechEnd: duration,
    speechDuration: duration,
    trimmedLeading: 0,
    trimmedTrailing: 0,
    hasSpeech: duration >= 0.45
  };
}

function buildSpeechWindowFromSilenceLog(log, duration) {
  const windows = extractSilenceWindows(log);
  if (windows.length === 0) return buildSpeechWindowFallback(duration);

  const firstWindow = windows[0];
  const lastWindow = windows[windows.length - 1];
  const leadingSilenceDuration = Math.max(0, firstWindow.end - firstWindow.start);
  const trailingSilenceDuration = Math.max(0, duration - lastWindow.start);
  const speechStart = firstWindow.start <= 0.05 && leadingSilenceDuration >= 0.18
    ? clampSeconds(firstWindow.end, 0, duration)
    : 0;
  const hasTrailingSilence = (
    lastWindow.openEnded && trailingSilenceDuration >= 0.24
  ) || (
    lastWindow.end >= duration - 0.06 && trailingSilenceDuration >= 0.24
  );
  const speechEnd = hasTrailingSilence
    ? clampSeconds(lastWindow.start, speechStart, duration)
    : duration;
  const effectiveDuration = Math.max(0, speechEnd - speechStart);
  if (effectiveDuration < 0.45) {
    return buildSpeechWindowFallback(duration);
  }
  return {
    duration,
    speechStart,
    speechEnd,
    speechDuration: effectiveDuration,
    trimmedLeading: speechStart,
    trimmedTrailing: Math.max(0, duration - speechEnd),
    hasSpeech: true
  };
}

function extractSilenceWindows(log) {
  const starts = [];
  const ends = [];
  const startPattern = /silence_start:\s*([0-9.]+)/g;
  const endPattern = /silence_end:\s*([0-9.]+)\s*\|\s*silence_duration:\s*([0-9.]+)/g;
  for (const match of log.matchAll(startPattern)) {
    starts.push(Number(match[1]));
  }
  for (const match of log.matchAll(endPattern)) {
    ends.push({
      end: Number(match[1]),
      duration: Number(match[2])
    });
  }

  const windows = [];
  let endCursor = 0;
  for (let index = 0; index < starts.length; index += 1) {
    const start = Number.isFinite(starts[index]) ? starts[index] : 0;
    while (endCursor < ends.length && (!Number.isFinite(ends[endCursor].end) || ends[endCursor].end < start)) {
      endCursor += 1;
    }
    const nextEnd = endCursor < ends.length ? ends[endCursor] : null;
    const end = nextEnd ? nextEnd.end : start;
    windows.push({
      start,
      end: Math.max(start, end),
      openEnded: !nextEnd
    });
    if (nextEnd) endCursor += 1;
  }
  return windows.filter((window) => Number.isFinite(window.start) && Number.isFinite(window.end));
}

async function analyzeAudioContinuityEdge(filePath, start, duration) {
  const edgeDuration = Math.max(0.04, Number(duration) || 0);
  if (!ffmpegPath) return buildAudioContinuityEdgeFallback(edgeDuration);
  const analysisLog = await new Promise((resolve) => {
    execFile(ffmpegPath, [
      '-hide_banner',
      '-i', filePath,
      '-vn',
      '-af', `atrim=start=${formatFfmpegSeconds(start)}:end=${formatFfmpegSeconds(start + edgeDuration)},asetpts=PTS-STARTPTS,silencedetect=noise=-38dB:d=0.03,volumedetect`,
      '-f', 'null',
      process.platform === 'win32' ? 'NUL' : '/dev/null'
    ], { windowsHide: true, timeout: 30_000, maxBuffer: 10 * 1024 * 1024 }, (_error, stdout, stderr) => {
      resolve(`${stdout || ''}\n${stderr || ''}`);
    });
  });
  return buildAudioContinuityEdgeFromLog(String(analysisLog || ''), edgeDuration);
}

function buildAudioContinuityFallback(duration, hasAudio) {
  const safeDuration = Math.max(0, Number(duration) || 0);
  const analysisWindow = clampSeconds(
    safeDuration <= 0.36 ? safeDuration / 2 : 0.22,
    0.08,
    Math.max(0.08, Math.min(0.32, safeDuration / 2 || 0.08))
  );
  return {
    duration: safeDuration,
    hasAudio: Boolean(hasAudio),
    analysisWindow,
    head: buildAudioContinuityEdgeFallback(analysisWindow),
    tail: buildAudioContinuityEdgeFallback(analysisWindow)
  };
}

function buildAudioContinuityEdgeFallback(duration) {
  const safeDuration = Math.max(0.04, Number(duration) || 0.04);
  return {
    meanVolumeDb: -24,
    peakVolumeDb: -8,
    silenceRatio: 0.18,
    activeRatio: 0.82,
    leadingSilence: 0,
    trailingSilence: 0,
    duration: safeDuration
  };
}

function buildAudioContinuityEdgeFromLog(log, duration) {
  const safeDuration = Math.max(0.04, Number(duration) || 0.04);
  const silenceWindows = extractSilenceWindows(log);
  let silenceTotal = 0;
  let leadingSilence = 0;
  let trailingSilence = 0;

  silenceWindows.forEach((window, index) => {
    const start = clampSeconds(window.start, 0, safeDuration);
    const end = clampSeconds(window.end, start, safeDuration);
    const length = Math.max(0, end - start);
    silenceTotal += length;
    if (index === 0 && start <= 0.02) {
      leadingSilence = Math.max(leadingSilence, length);
    }
    if (index === silenceWindows.length - 1 && end >= safeDuration - 0.02) {
      trailingSilence = Math.max(trailingSilence, length);
    }
  });

  const silenceRatio = clampNumber(silenceTotal / safeDuration, 0, 1);
  return {
    meanVolumeDb: parseVolumeDetectDb(log, 'mean_volume', -60),
    peakVolumeDb: parseVolumeDetectDb(log, 'max_volume', -30),
    silenceRatio,
    activeRatio: clampNumber(1 - silenceRatio, 0, 1),
    leadingSilence: clampSeconds(leadingSilence, 0, safeDuration),
    trailingSilence: clampSeconds(trailingSilence, 0, safeDuration),
    duration: safeDuration
  };
}

function parseVolumeDetectDb(log, label, fallback) {
  const pattern = new RegExp(`${label}:\\s*(-?[0-9.]+)\\s*dB`, 'i');
  const match = pattern.exec(log);
  const numeric = Number(match?.[1]);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clampSeconds(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function findPupCapsCliPath() {
  const candidates = [
    process.env.PUPCAPS_BIN,
    path.join(__dirname, 'pupcaps-runner.cjs'),
    path.join(app.getAppPath(), 'electron', 'pupcaps-runner.cjs'),
    path.join(process.cwd(), 'electron', 'pupcaps-runner.cjs')
  ].filter(Boolean);
  return candidates.find((candidate) => fsSync.existsSync(candidate)) || '';
}

function buildPupCapsSrt(overlay, metadata) {
  const duration = Math.max(0.1, Number(metadata.duration) || readOverlayDuration(overlay));
  const captions = Array.isArray(overlay.subtitleSegments) && overlay.subtitleSegments.length
    ? overlay.subtitleSegments
    : [{ time: `00:00:00 - ${formatAssTime(duration)}`, text: overlay.name || '自动识别添加字幕' }];
  const isBilingual = isOverlayBilingual(overlay, captions);
  return captions.map((caption, index) => {
    const range = parseCaptionRange(caption.time, duration);
    const keywords = buildOverlayKeywords(overlay.keywords || '', caption.text || '');
    const captionText = markPupCapsKeywords(buildOverlayCaptionText(caption, isBilingual), keywords);
    return [
      String(index + 1),
      `${formatSrtTime(range.start)} --> ${formatSrtTime(range.end)}`,
      captionText
    ].join('\n');
  }).join('\n\n') + '\n';
}

function readOverlayCaptionTemplateStyle(overlay) {
  const style = overlay?.captionTemplate?.style;
  if (!style || typeof style !== 'object') return null;
  return {
    fontFamily: String(style.fontFamily || '"Microsoft YaHei", "PingFang SC", Arial, sans-serif'),
    textColor: String(style.textColor || '#ffffff'),
    keywordColor: String(style.keywordColor || '#facc15'),
    strokeColor: String(style.strokeColor || '#111827'),
    background: String(style.background || 'transparent'),
    shadow: String(style.shadow || '0 8px 20px rgb(0 0 0 / 32%)'),
    align: String(style.align || 'bottom-center')
  };
}

function cssCaptionTemplateTextShadow(style) {
  const stroke = style?.strokeColor || '#111827';
  const shadow = style?.shadow && style.shadow !== 'none' ? `, ${style.shadow}` : '';
  return [
    `-1px -1px 0 ${stroke}`,
    `1px -1px 0 ${stroke}`,
    `-1px 1px 0 ${stroke}`,
    `1px 1px 0 ${stroke}`
  ].join(', ') + shadow;
}

function buildSubtitleFontFaceCss() {
  const fontsDir = resolveSubtitleFontsDir();
  if (!fontsDir) return '';
  const regularUrl = pathToFileURL(path.join(fontsDir, 'SourceHanSansSC-Regular.otf')).toString();
  const heavyUrl = pathToFileURL(path.join(fontsDir, 'SourceHanSansSC-Heavy.otf')).toString();
  const smileyUrl = pathToFileURL(path.join(fontsDir, 'SmileySans-Oblique.otf')).toString();
  const roundedRegularUrl = pathToFileURL(path.join(fontsDir, 'ResourceHanRoundedCN-Regular.ttf')).toString();
  const roundedBoldUrl = pathToFileURL(path.join(fontsDir, 'ResourceHanRoundedCN-Bold.ttf')).toString();
  const serifUrl = pathToFileURL(path.join(fontsDir, 'SourceHanSerifSC-Bold.otf')).toString();
  const wenkaiUrl = pathToFileURL(path.join(fontsDir, 'LXGWWenKai-Regular.ttf')).toString();
  return `
@font-face {
  font-family: "Moya Source Han Sans SC";
  src: url("${regularUrl}") format("opentype");
  font-weight: 400;
  font-style: normal;
}

@font-face {
  font-family: "Moya Source Han Sans SC Heavy";
  src: url("${heavyUrl}") format("opentype");
  font-weight: 800;
  font-style: normal;
}

@font-face {
  font-family: "Moya Smiley Sans";
  src: url("${smileyUrl}") format("opentype");
  font-weight: 800;
  font-style: normal;
}

@font-face {
  font-family: "Moya Resource Han Rounded CN";
  src: url("${roundedRegularUrl}") format("truetype");
  font-weight: 400;
  font-style: normal;
}

@font-face {
  font-family: "Moya Resource Han Rounded CN";
  src: url("${roundedBoldUrl}") format("truetype");
  font-weight: 800;
  font-style: normal;
}

@font-face {
  font-family: "Moya Source Han Serif SC";
  src: url("${serifUrl}") format("opentype");
  font-weight: 800;
  font-style: normal;
}

@font-face {
  font-family: "Moya LXGW WenKai";
  src: url("${wenkaiUrl}") format("truetype");
  font-weight: 400;
  font-style: normal;
}
`.trim();
}

function resolvePupCapsFontFamily(fontFamily) {
  const value = String(fontFamily || '');
  if (/Moya Smiley Sans|Smiley Sans Oblique|SmileySans-Oblique|得意黑/i.test(value)) {
    return '"Moya Smiley Sans", "Smiley Sans Oblique", "Smiley Sans", "Microsoft YaHei", sans-serif';
  }
  if (/Moya Resource Han Rounded CN|Resource Han Rounded CN|Resource-Han-Rounded-CN|清爽圆体/i.test(value)) {
    return '"Moya Resource Han Rounded CN", "Resource Han Rounded CN", "Microsoft YaHei", sans-serif';
  }
  if (/Moya Source Han Serif SC|Source Han Serif SC|SourceHanSerifSC|电影字幕/i.test(value)) {
    return '"Moya Source Han Serif SC", "Source Han Serif SC", "SimSun", serif';
  }
  if (/Moya LXGW WenKai|LXGW WenKai|LXGWWenKai|霞鹜文楷/i.test(value)) {
    return '"Moya LXGW WenKai", "LXGW WenKai", "KaiTi", "Microsoft YaHei", cursive';
  }
  if (/Moya Source Han Sans SC Heavy|Source Han Sans SC Heavy|SourceHanSansSC-Heavy/i.test(value)) {
    return '"Moya Source Han Sans SC Heavy", "Source Han Sans SC Heavy", "Source Han Sans SC", "Microsoft YaHei", sans-serif';
  }
  if (/Moya Source Han Sans SC|Source Han Sans SC|SourceHanSansSC/i.test(value)) {
    return '"Moya Source Han Sans SC", "Source Han Sans SC", "Microsoft YaHei", sans-serif';
  }
  return '"Microsoft YaHei", "PingFang SC", Arial, sans-serif';
}

function resolveAssFontName(fontFamily) {
  const value = String(fontFamily || '');
  if (/Moya Smiley Sans|Smiley Sans Oblique|SmileySans-Oblique|得意黑/i.test(value)) {
    return 'Smiley Sans Oblique';
  }
  if (/Moya Resource Han Rounded CN|Resource Han Rounded CN|Resource-Han-Rounded-CN|清爽圆体/i.test(value)) {
    return 'Resource Han Rounded CN';
  }
  if (/Moya Source Han Serif SC|Source Han Serif SC|SourceHanSerifSC|电影字幕/i.test(value)) {
    return 'Source Han Serif SC';
  }
  if (/Moya LXGW WenKai|LXGW WenKai|LXGWWenKai|霞鹜文楷/i.test(value)) {
    return 'LXGW WenKai';
  }
  if (/Moya Source Han Sans SC Heavy|Source Han Sans SC Heavy|SourceHanSansSC-Heavy/i.test(value)) {
    return 'Source Han Sans SC Heavy';
  }
  if (/Moya Source Han Sans SC|Source Han Sans SC|SourceHanSansSC/i.test(value)) {
    return 'Source Han Sans SC';
  }
  return 'Microsoft YaHei';
}

function buildPupCapsCss(overlay, metadata) {
  const width = Math.max(1, Number(metadata.width) || 720);
  const height = Math.max(1, Number(metadata.height) || 1280);
  const captionPosition = overlay.captionPosition || { x: 50, y: 64 };
  const captionStyle = readOverlayTextStyle(overlay.captionTextStyle, { fontSize: Math.round(height * 0.024) }, width);
  const theme = viralRenderTheme(overlay);
  const captionTemplateStyle = readOverlayCaptionTemplateStyle(overlay);
  const captionTextShadow = captionTemplateStyle ? cssCaptionTemplateTextShadow(captionTemplateStyle) : '0 2px 6px rgb(0 0 0 / 38%)';
  const captionBackground = captionTemplateStyle ? captionTemplateStyle.background : theme.captionBackground;
  const captionBorder = captionTemplateStyle ? '0' : '1px solid rgb(255 255 255 / 12%)';
  const captionBoxShadow = captionTemplateStyle ? 'none' : '0 12px 28px rgb(0 0 0 / 18%)';
  const captionTextAlign = captionTemplateStyle?.align?.includes('left') ? 'left' : 'center';
  const captionLeft = Math.max(0, Math.round((Math.max(0, Math.min(100, Number(captionPosition.x) || 50)) / 100) * width));
  const captionFontFamily = captionTemplateStyle
    ? resolvePupCapsFontFamily(captionTemplateStyle.fontFamily)
    : resolvePupCapsFontFamily(captionStyle.fontFamily);
  const captionEntrance = normalizeCaptionEntrance(overlay.captionEntrance);
  const captionAnimation = pupCapsCaptionEntranceAnimation(captionEntrance);
  const wordAnimation = pupCapsWordEntranceAnimation(captionEntrance);
  const highlightedWordAnimation = captionEntrance === 'karaoke'
    ? wordAnimation
    : 'moyaKeywordJump 760ms cubic-bezier(0.2, 0.82, 0.18, 1) infinite';
  const top = Math.max(0, Math.round((Math.max(0, Math.min(100, Number(captionPosition.y) || 64)) / 100) * height - captionStyle.height / 2));
  const fontSize = Math.max(16, captionStyle.fontSize);
  const maxWidth = Math.max(180, Math.min(width - 48, captionStyle.width));
  return `
${buildSubtitleFontFaceCss()}
#video {
  display: block;
  width: ${width}px;
  height: ${height}px;
  font-family: ${captionFontFamily};
}

.captions {
  position: absolute;
  left: ${captionLeft}px;
  top: ${top}px;
  width: ${maxWidth}px;
  margin: 0;
  transform: translateX(-50%);
  text-align: ${captionTextAlign};
}

.caption {
  display: inline-block;
  box-sizing: border-box;
  max-width: ${maxWidth}px;
  padding: 8px 10px;
  border: ${captionBorder};
  border-radius: 6px;
  background: ${captionBackground};
  box-shadow: ${captionBoxShadow};
  animation: ${captionAnimation};
  will-change: transform, filter, opacity;
}

.word {
  display: inline-block;
  margin: 0 1px;
  padding: 1px 2px;
  border-radius: 3px;
  color: ${captionTemplateStyle?.textColor || theme.captionColor};
  font-family: ${captionFontFamily};
  font-size: ${fontSize}px;
  font-weight: 800;
  line-height: 1.28;
  text-shadow: ${captionTextShadow};
  animation: ${wordAnimation};
  will-change: transform, filter, opacity;
}

.word.highlighted {
  background: ${captionTemplateStyle ? 'transparent' : theme.keywordBackground};
  color: ${captionTemplateStyle?.keywordColor || theme.keywordColor};
  text-shadow: ${captionTemplateStyle ? captionTextShadow : 'none'};
  animation: ${highlightedWordAnimation};
  box-shadow: ${captionTemplateStyle ? 'none' : `0 0 12px ${theme.glowColor}`};
}

${buildPupCapsKaraokeWordDelayCss(captionEntrance)}

@keyframes moyaKeywordJump {
  0%, 100% { transform: translateY(0) scale(1); }
  38% { transform: translateY(-3px) scale(1.08); }
  58% { transform: translateY(1px) scale(0.98); }
}

@keyframes moyaCaptionBlurReveal {
  0% { opacity: 0; filter: blur(10px); transform: translateY(10px); }
  54% { opacity: 0.72; filter: blur(4px); transform: translateY(-1px); }
  100% { opacity: 1; filter: blur(0); transform: translateY(0); }
}

@keyframes moyaCaptionFadeIn {
  0% { opacity: 0; }
  100% { opacity: 1; }
}

@keyframes moyaCaptionRiseIn {
  0% { opacity: 0; transform: translateY(14px); }
  64% { opacity: 0.86; transform: translateY(-2px); }
  100% { opacity: 1; transform: translateY(0); }
}

@keyframes moyaCaptionPopIn {
  0% { opacity: 0; transform: scale(0.76); }
  58% { opacity: 1; transform: scale(1.12); }
  100% { opacity: 1; transform: scale(1); }
}

@keyframes moyaCaptionKaraokeHighlight {
  0% { opacity: 0.42; filter: brightness(0.82); transform: translateY(2px); }
  42% { opacity: 1; filter: brightness(1.32); transform: translateY(-3px) scale(1.06); }
  100% { opacity: 1; filter: brightness(1); transform: translateY(0) scale(1); }
}
`.trim();
}

function pupCapsCaptionEntranceAnimation(entrance) {
  switch (normalizeCaptionEntrance(entrance)) {
    case 'blur-reveal':
      return 'moyaCaptionBlurReveal 560ms cubic-bezier(0.2, 0.82, 0.18, 1) both';
    case 'fade':
      return 'moyaCaptionFadeIn 420ms ease-out both';
    case 'rise':
      return 'moyaCaptionRiseIn 520ms cubic-bezier(0.2, 0.82, 0.18, 1) both';
    case 'pop':
      return 'moyaCaptionPopIn 520ms cubic-bezier(0.18, 0.9, 0.22, 1.2) both';
    default:
      return 'none';
  }
}

function pupCapsWordEntranceAnimation(entrance) {
  return normalizeCaptionEntrance(entrance) === 'karaoke'
    ? 'moyaCaptionKaraokeHighlight 900ms cubic-bezier(0.2, 0.82, 0.18, 1) both'
    : 'none';
}

function buildPupCapsKaraokeWordDelayCss(entrance) {
  if (normalizeCaptionEntrance(entrance) !== 'karaoke') return '';
  return Array.from({ length: 32 }, (_, index) => {
    const child = index + 1;
    return `.word:nth-child(${child}) { animation-delay: ${index * 42}ms; }`;
  }).join('\n');
}

function buildViralTitleAss(overlay, metadata) {
  const width = Math.max(1, Number(metadata.width) || 720);
  const height = Math.max(1, Number(metadata.height) || 1280);
  const duration = Math.max(0.1, Number(metadata.duration) || readOverlayDuration(overlay));
  const titlePosition = overlay.titlePosition || { x: 50, y: 18 };
  const titleStyle = readOverlayTextStyle(overlay.titleTextStyle, { fontSize: Math.round(height * 0.038) }, width);
  const titleFontName = resolveAssFontName(titleStyle.fontFamily);
  const theme = viralRenderTheme(overlay);
  const titleText = overlay.hook || overlay.templateName || overlay.name || '网感剪辑';
  const titleEnd = formatAssTime(readOverlayTitleEnd(overlay, duration));
  const titlePoint = overlayCenterPoint(titlePosition, width, height);
  const lines = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Title,${titleFontName},${titleStyle.fontSize},${assPrimaryColor(theme.titleColor)},&H00FFFFFF,${assBackColor(theme.titleBackground)},${assBackColor(theme.titleBackground)},-1,0,0,0,100,100,0,0,3,2,0,5,24,24,24,1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'
  ];
  if (!readOverlayCaptionTemplateStyle(overlay)) {
    lines.push(`Dialogue: 1,0:00:00.00,${titleEnd},Title,,0,0,0,,{\\an5\\pos(${titlePoint.x},${titlePoint.y})}${escapeAssText(wrapAssText(titleText, titleStyle))}`);
  }
  return lines.join('\n');
}

function buildViralAss(overlay, metadata) {
  const width = Math.max(1, Number(metadata.width) || 720);
  const height = Math.max(1, Number(metadata.height) || 1280);
  const duration = Math.max(0.1, Number(metadata.duration) || readOverlayDuration(overlay));
  const subtitleTemplateOverlay = isSubtitleTemplateOverlayKey(overlay.templateKey);
  const overlayTheme = readOverlayTheme(overlay);
  const titlePosition = overlay.titlePosition || { x: 50, y: 18 };
  const captionPosition = overlay.captionPosition || { x: 50, y: 64 };
  const titleStyle = readOverlayTextStyle(overlay.titleTextStyle, { fontSize: Math.round(height * 0.038) }, width);
  const captionStyle = readOverlayTextStyle(overlay.captionTextStyle, { fontSize: Math.round(height * 0.024) }, width);
  const translationStyle = { ...captionStyle, fontSize: Math.max(10, Math.round(captionStyle.fontSize * 0.56)) };
  const titleFontName = resolveAssFontName(titleStyle.fontFamily);
  const captionFontName = resolveAssFontName(captionStyle.fontFamily);
  const palette = viralAssPalette(overlay);
  const captionTemplateStyle = readOverlayCaptionTemplateStyle(overlay);
  const captionPrimaryHex = captionTemplateStyle
    ? firstCssHexColor(captionTemplateStyle.textColor, '#ffffff')
    : subtitleTemplateOverlay ? readOverlayCaptionPrimaryColor(overlay) : '#ffffff';
  const titlePrimaryHex = captionTemplateStyle
    ? firstCssHexColor(captionTemplateStyle.textColor, '#ffffff')
    : subtitleTemplateOverlay ? overlayTheme.titleColor : '#ffffff';
  const titlePrimaryColor = assPrimaryColor(titlePrimaryHex);
  const captionPrimaryColor = assPrimaryColor(captionPrimaryHex);
  const titleColor = assBackColor(palette.title || overlayTheme.titleStroke || '#000000', palette.titleOutlineAlpha || palette.outlineAlpha || '00');
  const captionBackColor = assBackColor(palette.captionBackground || '#000000', palette.captionBackAlpha || '70');
  const captionOutlineColor = assBackColor(palette.captionOutline || overlayTheme.captionShadow || overlayTheme.titleStroke || '#000000', palette.captionOutlineAlpha || palette.outlineAlpha || '00');
  const captionBorderStyle = palette.captionBackAlpha === 'FF' ? 1 : 3;
  const captionOutlineWidth = Number.isFinite(Number(palette.captionOutlineWidth)) ? Number(palette.captionOutlineWidth) : 1.4;
  const titleBorderStyle = palette.captionBackAlpha === 'FF' ? 1 : 3;
  const titleOutlineWidth = Number.isFinite(Number(palette.titleOutlineWidth)) ? Number(palette.titleOutlineWidth) : 2;
  const titleText = overlay.hook || overlay.templateName || overlay.name || '网感剪辑';
  const captions = Array.isArray(overlay.subtitleSegments) && overlay.subtitleSegments.length
    ? overlay.subtitleSegments
    : [{ time: `00:00:00 - ${formatAssTime(duration)}`, text: overlay.name || '自动识别添加字幕' }];
  const keywords = buildOverlayKeywords(overlay.keywords || '', captions[0]?.text || '');
  const isBilingual = isOverlayBilingual(overlay, captions);
  const titleEnd = formatAssTime(readOverlayTitleEnd(overlay, duration));
  const titlePoint = overlayCenterPoint(titlePosition, width, height);
  const captionPoint = overlayCenterPoint(captionPosition, width, height);
  const captionAssPrefix = buildCaptionAssPrefix(overlay, captionPoint);
  const lines = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Title,${titleFontName},${titleStyle.fontSize},${titlePrimaryColor},&H00FFFFFF,${titleColor},${titleColor},-1,0,0,0,100,100,0,0,${titleBorderStyle},${titleOutlineWidth},0,5,24,24,24,1`,
    `Style: Caption,${captionFontName},${captionStyle.fontSize},${captionPrimaryColor},&H00FFFFFF,${captionOutlineColor},${captionBackColor},-1,0,0,0,100,100,0,0,${captionBorderStyle},${captionOutlineWidth},0,5,24,24,24,1`,
    `Style: CaptionTranslation,${captionFontName},${translationStyle.fontSize},${captionPrimaryColor},&H00FFFFFF,${captionOutlineColor},${captionBackColor},-1,1,0,0,100,100,0,0,${captionBorderStyle},${Math.max(1, captionOutlineWidth * 0.78)},0,5,24,24,24,1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'
  ];
  if (!readOverlayCaptionTemplateStyle(overlay)) {
    lines.push(`Dialogue: 1,0:00:00.00,${titleEnd},Title,,0,0,0,,{\\an5\\pos(${titlePoint.x},${titlePoint.y})}${escapeAssText(wrapAssText(titleText, titleStyle))}`);
  }
  for (const caption of captions) {
    const range = parseCaptionRange(caption.time, duration);
    const startTime = formatAssTime(range.start);
    const endTime = formatAssTime(range.end);
    if (isBilingual && String(caption.translation || '').trim()) {
      const primaryPoint = { ...captionPoint, y: Math.round(captionPoint.y - captionStyle.fontSize * 0.34) };
      const translationPoint = { ...captionPoint, y: Math.round(captionPoint.y + captionStyle.fontSize * 0.5) };
      lines.push(`Dialogue: 3,${startTime},${endTime},Caption,,0,0,0,,${buildCaptionAssPrefix(overlay, primaryPoint)}${highlightAssKeywords(wrapAssText(caption.text || '', captionStyle), keywords, palette.keyword, captionPrimaryHex)}`);
      lines.push(`Dialogue: 3,${startTime},${endTime},CaptionTranslation,,0,0,0,,${buildCaptionAssPrefix(overlay, translationPoint)}${escapeAssText(wrapAssText(caption.translation || '', translationStyle))}`);
    } else {
      const captionText = buildOverlayCaptionText(caption, isBilingual);
      lines.push(`Dialogue: 3,${startTime},${endTime},Caption,,0,0,0,,${captionAssPrefix}${highlightAssKeywords(wrapAssText(captionText, captionStyle), keywords, palette.keyword, captionPrimaryHex)}`);
    }
  }
  return lines.join('\n');
}

function buildCaptionAssPrefix(overlay, captionPoint) {
  const basePosition = `\\an5\\pos(${captionPoint.x},${captionPoint.y})`;
  switch (normalizeCaptionEntrance(overlay.captionEntrance)) {
    case 'blur-reveal':
      return `{\\fad(180,0)\\blur8\\t(0,560,\\blur0)${basePosition}}`;
    case 'fade':
      return `{\\fad(260,0)${basePosition}}`;
    case 'rise':
      return `{\\an5\\move(${captionPoint.x},${captionPoint.y + 14},${captionPoint.x},${captionPoint.y},0,520)\\fad(120,0)}`;
    case 'pop':
      return `{\\fad(90,0)\\fscx76\\fscy76\\t(0,320,\\fscx112\\fscy112)\\t(320,520,\\fscx100\\fscy100)${basePosition}}`;
    case 'karaoke':
      return `{\\fad(80,0)\\t(0,280,\\fscx106\\fscy106)\\t(280,700,\\fscx100\\fscy100)${basePosition}}`;
    default:
      return `{${basePosition}}`;
  }
}

function readOverlayTitleEnd(overlay, duration) {
  if (overlay?.titleDuration === 'full') return duration;
  const explicit = Number(overlay?.titleDuration);
  if (Number.isFinite(explicit) && explicit > 0) return Math.min(duration, explicit);
  return duration;
}

function isOverlayBilingual(overlay, captions = []) {
  if (typeof overlay?.isBilingual === 'boolean') return overlay.isBilingual;
  return captions.some((caption) => String(caption?.translation || '').trim());
}

function buildOverlayCaptionText(caption, isBilingual) {
  const primary = String(caption?.text || '').trim();
  const translation = String(caption?.translation || '').trim();
  if (!isBilingual || !translation) return primary;
  return `${primary}\n${translation}`;
}

function normalizeCaptionEntrance(value) {
  return ['blur-reveal', 'fade', 'rise', 'pop', 'karaoke'].includes(String(value || '')) ? String(value) : 'none';
}

function buildViralRenderCanvas(metadata, overlay) {
  const duration = Math.max(0.1, Number(metadata.duration) || readOverlayDuration(overlay));
  return {
    width: 720,
    height: 1280,
    duration
  };
}

function buildViralVideoCanvasFilter(canvas, overlay) {
  const width = Math.max(1, Number(canvas.width) || 720);
  const height = Math.max(1, Number(canvas.height) || 1280);
  return buildViralBaseVideoCanvasFilter(width, height, overlay);
}

function buildViralBaseVideoCanvasFilter(width, height, overlay) {
  const fit = overlay.previewVideoFit || 'cover';
  if (fit === 'fill') return `scale=${width}:${height}`;
  if (fit === 'contain') {
    return `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`;
  }
  return `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
}

function readOverlayVideoZoomRanges(ranges) {
  if (!Array.isArray(ranges)) return [];
  return ranges
    .map((range) => {
      const start = Number(range?.start);
      const end = Number(range?.end);
      const scale = Number(range?.scale);
      return {
        start: Number.isFinite(start) ? Math.max(0, start) : 0,
        end: Number.isFinite(end) ? Math.max(0, end) : 0,
        scale: clampNumber(Number.isFinite(scale) ? scale : 1.2, 1, 1.3)
      };
    })
    .filter((range) => range.end > range.start && range.scale > 1.001)
    .sort((left, right) => left.start - right.start || left.end - right.end)
    .slice(0, 12);
}

function buildViralSegmentedVideoFilter(inputLabel, canvas, overlay, duration, outputName) {
  const width = Math.max(1, Number(canvas.width) || 720);
  const height = Math.max(1, Number(canvas.height) || 1280);
  const safeDuration = Math.max(0.1, Number(duration) || Number(canvas.duration) || readOverlayDuration(overlay));
  const segments = buildVideoZoomSegments(safeDuration, readOverlayVideoZoomRanges(overlay.videoZoomRanges));
  const baseCanvasFilter = buildViralBaseVideoCanvasFilter(width, height, overlay);
  if (segments.length <= 1) {
    const scale = segments[0]?.scale || 1;
    const zoomFilter = scale > 1.001 ? `,${buildStaticVideoZoomFilter(width, height, scale)}` : '';
    return `${inputLabel}trim=start=0:end=${formatFfmpegSeconds(safeDuration)},setpts=PTS-STARTPTS,${baseCanvasFilter}${zoomFilter}[${outputName}]`;
  }

  const inputLabels = segments.map((_, index) => `[vzsrc${index}]`);
  const chains = [`${inputLabel}split=${segments.length}${inputLabels.join('')}`];
  segments.forEach((segment, index) => {
    const zoomFilter = segment.scale > 1.001 ? `,${buildStaticVideoZoomFilter(width, height, segment.scale)}` : '';
    chains.push(
      `${inputLabels[index]}trim=start=${formatFfmpegSeconds(segment.start)}:end=${formatFfmpegSeconds(segment.end)},setpts=PTS-STARTPTS,${baseCanvasFilter}${zoomFilter}[vzseg${index}]`
    );
  });
  const concatInputs = segments.map((_, index) => `[vzseg${index}]`).join('');
  chains.push(`${concatInputs}concat=n=${segments.length}:v=1:a=0[${outputName}]`);
  return chains.join(';');
}

function buildVideoZoomSegments(duration, ranges) {
  const safeDuration = Math.max(0.1, Number(duration) || 0.1);
  const segments = [];
  let cursor = 0;
  for (const range of ranges) {
    const start = Math.max(0, Math.min(safeDuration, Number(range.start) || 0));
    const end = Math.max(0, Math.min(safeDuration, Number(range.end) || 0));
    if (end <= cursor || end <= start) continue;
    if (start > cursor) {
      segments.push({ start: cursor, end: start, scale: 1 });
    }
    segments.push({ start: Math.max(start, cursor), end, scale: range.scale });
    cursor = end;
  }
  if (cursor < safeDuration) {
    segments.push({ start: cursor, end: safeDuration, scale: 1 });
  }
  return segments.filter((segment) => segment.end - segment.start > 0.01);
}

function buildStaticVideoZoomFilter(width, height, scale) {
  const zoomWidth = Math.max(width, evenFloor(width * scale));
  const zoomHeight = Math.max(height, evenFloor(height * scale));
  return `scale=${zoomWidth}:${zoomHeight},crop=${width}:${height}:(iw-${width})/2:(ih-${height})/2`;
}

function normalizeViralOverlay(overlay) {
  if (!overlay || typeof overlay !== 'object') return null;
  if (!Array.isArray(overlay.subtitleSegments) && !overlay.hook && !overlay.templateName) return null;
  return {
    ...overlay,
    videoZoomRanges: readOverlayVideoZoomRanges(overlay.videoZoomRanges)
  };
}

function readOverlayTextStyle(style, fallback, canvasWidth = 720) {
  const fontSize = Number(style?.fontSize);
  const width = Number(style?.width);
  const height = Number(style?.height);
  const scale = Math.max(1, canvasWidth / 360);
  return {
    fontSize: Number.isFinite(fontSize) ? Math.max(10, Math.round(fontSize * scale)) : fallback.fontSize,
    width: Number.isFinite(width) ? Math.max(80, Math.round(width * scale)) : Math.round(canvasWidth * 0.82),
    height: Number.isFinite(height) ? Math.max(24, Math.round(height * scale)) : 80,
    fontFamily: typeof style?.fontFamily === 'string' ? style.fontFamily : ''
  };
}

function overlayCenterToTopLeft(position, style, canvasWidth, canvasHeight) {
  const centerX = percentX(position?.x, canvasWidth);
  const centerY = percentY(position?.y, canvasHeight);
  const boxWidth = Math.max(1, Number(style?.width) || canvasWidth * 0.82);
  const boxHeight = Math.max(1, Number(style?.height) || Number(style?.fontSize) * 2.4 || 80);
  return {
    x: Math.round(Math.max(0, Math.min(canvasWidth - 1, centerX - boxWidth / 2))),
    y: Math.round(Math.max(0, Math.min(canvasHeight - 1, centerY - boxHeight / 2)))
  };
}

function overlayCenterPoint(position, canvasWidth, canvasHeight) {
  return {
    x: Math.round(percentX(position?.x, canvasWidth)),
    y: Math.round(percentY(position?.y, canvasHeight))
  };
}

function wrapAssText(text, style) {
  const lines = String(text || '').split(/\r?\n/);
  const maxChars = Math.max(4, Math.floor((Number(style.width) || 320) / Math.max(8, (Number(style.fontSize) || 24) * 0.62)));
  return lines.flatMap((line) => wrapAssLine(line, maxChars)).join('\n');
}

function wrapAssLine(line, maxChars) {
  const value = String(line || '');
  if (value.length <= maxChars) return [value];
  const chunks = [];
  let current = '';
  for (const char of value) {
    const charWidth = /[ -~]/.test(char) ? 0.55 : 1;
    const currentWidth = visualTextLength(current);
    if (current && currentWidth + charWidth > maxChars) {
      chunks.push(current);
      current = char;
    } else {
      current += char;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function visualTextLength(text) {
  return Array.from(String(text || '')).reduce((sum, char) => sum + (/[ -~]/.test(char) ? 0.55 : 1), 0);
}

function readOverlayTheme(overlay) {
  const theme = overlay?.theme && typeof overlay.theme === 'object' ? overlay.theme : {};
  const titleColor = normalizeHexColor(theme.titleColor, '#ffffff');
  const titleStroke = normalizeHexColor(theme.titleStroke, '#111111');
  return {
    titleColor,
    titleStroke,
    captionColor: normalizeHexColor(theme.captionColor, titleColor),
    captionShadow: normalizeHexColor(theme.captionShadow, titleStroke),
    keywordBackground: normalizeHexColor(theme.keywordBackground, titleStroke),
    keywordColor: normalizeHexColor(theme.keywordColor, titleColor),
    accent: normalizeHexColor(theme.accent, '#1f77ff')
  };
}

function readOverlayCaptionPrimaryColor(overlay) {
  const theme = readOverlayTheme(overlay);
  return isSubtitleTemplateOverlayKey(overlay?.templateKey) ? theme.titleColor : theme.captionColor;
}

function normalizeHexColor(value, fallback) {
  const normalized = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized : fallback;
}

function viralAssPalette(overlay) {
  const captionTemplateStyle = readOverlayCaptionTemplateStyle(overlay);
  if (captionTemplateStyle) {
    return {
      title: firstCssHexColor(captionTemplateStyle.strokeColor, '#111827'),
      keyword: firstCssHexColor(captionTemplateStyle.keywordColor, '#facc15'),
      caption: firstCssHexColor(captionTemplateStyle.textColor, '#ffffff'),
      captionOutline: firstCssHexColor(captionTemplateStyle.strokeColor, '#111827'),
      captionBackground: '#000000',
      captionBackAlpha: 'FF',
      titleOutlineAlpha: '00',
      captionOutlineAlpha: '00',
      titleOutlineWidth: 2,
      captionOutlineWidth: 1.4
    };
  }
  const name = String(overlay.templateName || '');
  if (isSubtitleTemplateOverlayKey(overlay.templateKey)) {
    const theme = readOverlayTheme(overlay);
    return {
      title: theme.titleStroke,
      keyword: readOverlayCaptionPrimaryColor(overlay),
      captionOutline: theme.captionShadow,
      captionBackground: '#000000',
      captionBackAlpha: 'FF',
      titleOutlineAlpha: '00',
      captionOutlineAlpha: '00',
      titleOutlineWidth: 2.4,
      captionOutlineWidth: 1.4
    };
  }
  if (/高级红/.test(name)) return { title: '#8a1230', keyword: '#8a1230' };
  if (/黄白|白金|轻奢|黄色|百搭黄/.test(name)) return { title: '#fff7d6', keyword: '#facc15' };
  if (/经典蓝/.test(name)) return { title: '#1d4ed8', keyword: '#2563eb' };
  if (/科技/.test(name)) return { title: '#0f172a', keyword: '#67e8f9' };
  if (/转化|成交/.test(name) || overlay.templateKey === 'deal') return { title: '#111827', keyword: '#dc2626' };
  if (overlay.templateKey === 'seed') return { title: '#f59e0b', keyword: '#f9a8d4' };
  if (overlay.templateKey === 'story') return { title: '#0f172a', keyword: '#a855f7' };
  return { title: '#2563eb', keyword: '#2563eb' };
}

function viralRenderTheme(overlay) {
  const captionTemplateStyle = readOverlayCaptionTemplateStyle(overlay);
  if (captionTemplateStyle) {
    return {
      titleBackground: firstCssHexColor(captionTemplateStyle.strokeColor, '#111827'),
      titleColor: firstCssHexColor(captionTemplateStyle.textColor, '#ffffff'),
      captionBackground: captionTemplateStyle.background,
      captionColor: captionTemplateStyle.textColor,
      keywordBackground: 'transparent',
      keywordColor: captionTemplateStyle.keywordColor,
      glowColor: 'transparent'
    };
  }
  const name = String(overlay.templateName || '');
  const key = overlay.templateKey;
  if (isSubtitleTemplateOverlayKey(key)) {
    const theme = readOverlayTheme(overlay);
    const captionColor = readOverlayCaptionPrimaryColor(overlay);
    return {
      titleBackground: theme.titleStroke,
      titleColor: theme.titleColor,
      captionBackground: 'transparent',
      captionColor,
      keywordBackground: 'transparent',
      keywordColor: captionColor,
      glowColor: `${theme.titleColor}99`
    };
  }
  if (/爆点|高级红/.test(name) || key === 'street') {
    return {
      titleBackground: '#8a1230',
      titleColor: '#ffffff',
      captionBackground: 'rgb(0 0 0 / 58%)',
      captionColor: '#ffffff',
      keywordBackground: '#b0123c',
      keywordColor: '#ffffff',
      glowColor: 'rgb(176 18 60 / 78%)'
    };
  }
  if (key === 'seed') {
    return {
      titleBackground: '#f59e0b',
      titleColor: '#ffffff',
      captionBackground: 'rgb(255 255 255 / 88%)',
      captionColor: '#17202e',
      keywordBackground: '#f9a8d4',
      keywordColor: '#831843',
      glowColor: 'rgb(244 114 182 / 78%)'
    };
  }
  if (key === 'deal' || /成交|转化/.test(name)) {
    return {
      titleBackground: '#111827',
      titleColor: '#facc15',
      captionBackground: 'rgb(17 24 39 / 82%)',
      captionColor: '#facc15',
      keywordBackground: '#dc2626',
      keywordColor: '#ffffff',
      glowColor: 'rgb(250 204 21 / 82%)'
    };
  }
  if (key === 'story') {
    return {
      titleBackground: '#0f172a',
      titleColor: '#ffffff',
      captionBackground: 'rgb(15 23 42 / 76%)',
      captionColor: '#ffffff',
      keywordBackground: '#a855f7',
      keywordColor: '#ffffff',
      glowColor: 'rgb(168 85 247 / 78%)'
    };
  }
  if (key === 'list' || key === 'local') {
    return {
      titleBackground: '#0f766e',
      titleColor: '#ffffff',
      captionBackground: 'rgb(13 148 136 / 62%)',
      captionColor: '#ffffff',
      keywordBackground: '#14b8a6',
      keywordColor: '#ffffff',
      glowColor: 'rgb(45 212 191 / 82%)'
    };
  }
  if (key === 'expert') {
    return {
      titleBackground: '#1e293b',
      titleColor: '#ffffff',
      captionBackground: 'rgb(30 41 59 / 78%)',
      captionColor: '#ffffff',
      keywordBackground: '#64748b',
      keywordColor: '#ffffff',
      glowColor: 'rgb(148 163 184 / 72%)'
    };
  }
  if (key === 'compare') {
    return {
      titleBackground: '#7c3aed',
      titleColor: '#ffffff',
      captionBackground: 'rgb(124 58 237 / 64%)',
      captionColor: '#ffffff',
      keywordBackground: '#7c3aed',
      keywordColor: '#ffffff',
      glowColor: 'rgb(167 139 250 / 82%)'
    };
  }
  if (key === 'urgency') {
    return {
      titleBackground: '#dc2626',
      titleColor: '#ffffff',
      captionBackground: 'rgb(24 24 27 / 78%)',
      captionColor: '#fde68a',
      keywordBackground: '#facc15',
      keywordColor: '#111827',
      glowColor: 'rgb(250 204 21 / 82%)'
    };
  }
  return {
    titleBackground: '#db2777',
    titleColor: '#ffffff',
    captionBackground: 'rgb(17 24 39 / 70%)',
    captionColor: '#ffffff',
    keywordBackground: '#db2777',
    keywordColor: '#ffffff',
    glowColor: 'rgb(244 114 182 / 82%)'
  };
}

function isSubtitleTemplateOverlayKey(key) {
  return [
    'premium-red-bilingual',
    'luxury-white-bilingual',
    'classic-blue-bilingual',
    'yellow-flash',
    'simple-yellow-white',
    'translucent-dark',
    'basic-white-gold',
    'eye-catching-green'
  ].includes(String(key || ''));
}

function buildOverlayKeywords(keywords, captionText) {
  const explicit = String(keywords || '').split(/[,，、\s]+/).map((item) => item.trim()).filter((item) => item.length >= 2);
  const inferred = String(captionText || '').match(/[\u4e00-\u9fa5]{2,}|[A-Za-z0-9]{2,}/g) || [];
  const sourceKeywords = explicit.length ? explicit : inferred;
  return [...new Set(sourceKeywords)].sort((left, right) => right.length - left.length).slice(0, 8);
}

function markPupCapsKeywords(text, keywords) {
  const safeKeywords = Array.isArray(keywords)
    ? keywords.map((item) => String(item || '').trim()).filter((item) => item.length >= 2)
    : [];
  if (safeKeywords.length === 0) return String(text || '');
  const matcher = new RegExp(`(${safeKeywords.map(escapeRegExp).join('|')})`, 'gi');
  return String(text || '').split(matcher).filter(Boolean).map((part) => {
    const isKeyword = safeKeywords.some((keyword) => keyword.toLowerCase() === part.toLowerCase());
    return isKeyword ? `[${part}]` : part;
  }).join('');
}

function buildOverlayBilingualCaption(text, keywords = []) {
  const value = String(text || '');
  if (/数字人|虚拟人|AI/.test(value)) return 'Make digital avatars feel clear and engaging.';
  if (/入门|新手|小白/.test(value)) return 'Start simple and make the first step easy.';
  if (/节奏|内容/.test(value)) return 'Find the rhythm and make the message clear.';
  if (/文案|模板|字幕/.test(value)) return 'Use scripts, captions and templates to finish faster.';
  if (/配音|完成|创作/.test(value)) return 'Tune the voice and finish the video.';
  if (/普通人|快速|起来/.test(value)) return 'Make the process easier for everyday creators.';
  return keywords.length ? 'Highlight the key message and make it memorable.' : 'Make the message clear and memorable.';
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { windowsHide: true, timeout: options.timeout || 0, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
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

function highlightAssKeywords(text, keywords, keywordHex, baseHex = '#ffffff') {
  const safeKeywords = Array.isArray(keywords)
    ? keywords.map((item) => String(item || '').trim()).filter((item) => item.length >= 2)
    : [];
  if (safeKeywords.length === 0) return escapeAssText(text);
  const matcher = new RegExp(`(${safeKeywords.map(escapeRegExp).join('|')})`, 'gi');
  const keywordColor = assInlineColor(keywordHex || '#8a1230');
  const baseColor = assInlineColor(baseHex);
  return String(text || '').split(matcher).filter(Boolean).map((part) => {
    const isKeyword = safeKeywords.some((keyword) => keyword.toLowerCase() === part.toLowerCase());
    const escaped = escapeAssText(part);
    return isKeyword ? `{\\c${keywordColor}}${escaped}{\\c${baseColor}}` : escaped;
  }).join('');
}

function assInlineColor(hex) {
  const normalized = String(hex || '#ffffff').replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return '&HFFFFFF&';
  const rr = normalized.slice(0, 2);
  const gg = normalized.slice(2, 4);
  const bb = normalized.slice(4, 6);
  return `&H${bb}${gg}${rr}&`;
}

function firstCssHexColor(value, fallback = '#ffffff') {
  const match = String(value || '').match(/#[0-9a-f]{6}\b/i);
  return match ? match[0] : fallback;
}

function assPrimaryColor(hex) {
  const normalized = String(hex || '#ffffff').replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return '&H00FFFFFF';
  const rr = normalized.slice(0, 2);
  const gg = normalized.slice(2, 4);
  const bb = normalized.slice(4, 6);
  return `&H00${bb}${gg}${rr}`;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function percentX(value, width) {
  return Math.round((Math.max(0, Math.min(100, Number(value) || 50)) / 100) * width);
}

function percentY(value, height) {
  return Math.round((Math.max(0, Math.min(100, Number(value) || 50)) / 100) * height);
}

function assBackColor(hex, alpha = '00') {
  const normalized = String(hex || '#000000').replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return '&H00000000';
  const rr = normalized.slice(0, 2);
  const gg = normalized.slice(2, 4);
  const bb = normalized.slice(4, 6);
  const aa = /^[0-9a-f]{2}$/i.test(String(alpha)) ? String(alpha) : '00';
  return `&H${aa}${bb}${gg}${rr}`;
}

function formatSrtTime(value) {
  const safeValue = Math.max(0, Number(value) || 0);
  const hours = Math.floor(safeValue / 3600);
  const minutes = Math.floor((safeValue % 3600) / 60);
  const seconds = Math.floor(safeValue % 60);
  const milliseconds = Math.floor((safeValue % 1) * 1000);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
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

function buildAssSubtitleFilter(assPath) {
  const args = [`filename=${quoteFfmpegFilterPath(assPath)}`];
  const fontsDir = resolveSubtitleFontsDir();
  if (fontsDir) {
    args.push(`fontsdir=${quoteFfmpegFilterPath(fontsDir)}`);
  }
  return `subtitles=${args.join(':')}`;
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
  let response;
  try {
    response = await fetch(`${apiBaseUrl}/storage/upload-ticket`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    throw new Error(`无法连接后端上传服务：${apiBaseUrl}/storage/upload-ticket。请确认后端已启动且 OSS 配置可用。${error?.message ? ` (${error.message})` : ''}`);
  }
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
    const timeoutMs = Math.max(30000, Number(options.timeoutMs) || ossUploadTimeoutMs);
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
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`OSS upload timed out after ${Math.round(timeoutMs / 1000)}s`));
    });
    request.on('error', reject);
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

function putFilePartToSignedUrl(uploadUrl, filePath, options) {
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
            resolve({
              etag: String(response.headers.etag || '').replace(/"/g, ''),
              partNumber: options.partNumber,
              chunkIndex: options.chunkIndex,
              sizeBytes: options.size
            });
            return;
          }
          reject(new Error(`OSS part upload failed: HTTP ${response.statusCode} ${responseText}`.trim()));
        });
      }
    );
    request.setTimeout(ossUploadTimeoutMs, () => {
      request.destroy(new Error('OSS part upload timed out'));
    });
    request.on('error', reject);
    const stream = fsSync.createReadStream(filePath, { start: options.start, end: options.end });
    stream.on('data', (chunk) => {
      uploaded += chunk.length;
      if (typeof options.onProgress === 'function') {
        options.onProgress({
          percent: Math.min(100, Math.round((uploaded / Math.max(options.size, 1)) * 100)),
          status: 'uploading',
          message: '分片上传中'
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

async function inspectLocalEntries(inputPaths) {
  const roots = Array.isArray(inputPaths)
    ? [...new Set(inputPaths.filter((item) => typeof item === 'string' && item.trim()))]
    : [];
  const files = [];
  const folders = [];
  const errors = [];

  for (const localPath of roots) {
    try {
      const stat = await fs.lstat(localPath);
      if (stat.isSymbolicLink()) {
        errors.push({ localPath, message: '不支持上传快捷方式或符号链接' });
        continue;
      }
      if (stat.isFile()) {
        files.push(localFileEntry(localPath, ''));
        continue;
      }
      if (stat.isDirectory()) {
        const rootName = path.basename(localPath);
        folders.push({ localPath, name: rootName, relativePath: normalizeRelativePath(rootName) });
        await collectDirectoryEntries(localPath, rootName, files, folders, errors);
        continue;
      }
      errors.push({ localPath, message: '不支持的本地项目类型' });
    } catch (error) {
      errors.push({ localPath, message: error instanceof Error ? error.message : '读取本地项目失败' });
    }
  }

  return {
    files,
    folders,
    errors,
    totalFiles: files.length,
    totalBytes: files.reduce((sum, item) => sum + item.size, 0)
  };
}

async function collectDirectoryEntries(directoryPath, relativePath, files, folders, errors) {
  let entries = [];
  try {
    entries = await fs.readdir(directoryPath, { withFileTypes: true });
  } catch (error) {
    errors.push({ localPath: directoryPath, message: error instanceof Error ? error.message : '读取文件夹失败' });
    return;
  }

  entries.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  for (const entry of entries) {
    const localPath = path.join(directoryPath, entry.name);
    const childRelativePath = normalizeRelativePath(path.join(relativePath, entry.name));
    try {
      if (entry.isSymbolicLink()) {
        errors.push({ localPath, message: '不支持上传快捷方式或符号链接' });
        continue;
      }
      if (entry.isDirectory()) {
        folders.push({ localPath, name: entry.name, relativePath: childRelativePath });
        await collectDirectoryEntries(localPath, childRelativePath, files, folders, errors);
        continue;
      }
      if (entry.isFile()) {
        files.push(localFileEntry(localPath, normalizeRelativePath(relativePath)));
      }
    } catch (error) {
      errors.push({ localPath, message: error instanceof Error ? error.message : '读取本地项目失败' });
    }
  }
}

function localFileEntry(localPath, relativeDir) {
  const stat = fsSync.statSync(localPath);
  return {
    localPath,
    name: path.basename(localPath),
    size: stat.size,
    contentType: contentTypeForFile(localPath),
    relativeDir: normalizeRelativePath(relativeDir),
    relativePath: normalizeRelativePath(path.join(relativeDir || '', path.basename(localPath)))
  };
}

function normalizeRelativePath(value) {
  return String(value || '').split(path.sep).filter(Boolean).join('/');
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
