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

const store = new Store({ name: 'moya-matrix' });
const isDev = !app.isPackaged;
const devRendererUrl = process.env.MOYA_RENDERER_URL || 'http://127.0.0.1:5174';
const prodRendererPath = path.join(__dirname, '../dist/index.html');
const prodRendererUrl = pathToFileURL(prodRendererPath).toString();
const apiBaseUrl = (process.env.MOYA_API_BASE_URL || 'http://127.0.0.1:8081/api').replace(/\/+$/, '');
const ossUploadTimeoutMs = Number(process.env.MOYA_OSS_UPLOAD_TIMEOUT_MS || 10 * 60 * 1000);
let mainWindow = null;
let rendererRetryTimer = null;
const appIconPath = path.join(__dirname, 'assets', process.platform === 'win32' ? 'app-icon.ico' : 'app-icon.png');

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
    const videoFilter = `${buildViralVideoCanvasFilter(renderCanvas, overlay)},subtitles=filename=${quoteFfmpegFilterPath(assPath)}`;
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
    const baseFilter = buildViralVideoCanvasFilter(renderCanvas, overlay);
    const filterComplex = `[0:v]${baseFilter}[base];[base][1:v]overlay=0:0,subtitles=filename=${quoteFfmpegFilterPath(titleAssPath)}[v]`;
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
  return captions.map((caption, index) => {
    const range = parseCaptionRange(caption.time, duration);
    const keywords = buildOverlayKeywords(overlay.keywords || '', caption.text || '');
    const captionText = markPupCapsKeywords(caption.text || '', keywords);
    return [
      String(index + 1),
      `${formatSrtTime(range.start)} --> ${formatSrtTime(range.end)}`,
      captionText
    ].join('\n');
  }).join('\n\n') + '\n';
}

function buildPupCapsCss(overlay, metadata) {
  const width = Math.max(1, Number(metadata.width) || 720);
  const height = Math.max(1, Number(metadata.height) || 1280);
  const captionPosition = overlay.captionPosition || { x: 50, y: 64 };
  const captionStyle = readOverlayTextStyle(overlay.captionTextStyle, { fontSize: Math.round(height * 0.024) }, width);
  const theme = viralRenderTheme(overlay);
  const top = Math.max(0, Math.round((Math.max(0, Math.min(100, Number(captionPosition.y) || 64)) / 100) * height - captionStyle.height / 2));
  const fontSize = Math.max(16, captionStyle.fontSize);
  const maxWidth = Math.max(180, Math.min(width - 48, captionStyle.width));
  return `
#video {
  display: block;
  width: ${width}px;
  height: ${height}px;
  font-family: "Microsoft YaHei", "PingFang SC", Arial, sans-serif;
}

.captions {
  position: absolute;
  left: 50%;
  top: ${top}px;
  width: ${maxWidth}px;
  margin: 0;
  transform: translateX(-50%);
  text-align: left;
}

.caption {
  display: inline-block;
  box-sizing: border-box;
  max-width: ${maxWidth}px;
  padding: 8px 10px;
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 6px;
  background: ${theme.captionBackground};
  box-shadow: 0 12px 28px rgb(0 0 0 / 18%);
}

.word {
  display: inline-block;
  margin: 0 1px;
  padding: 1px 2px;
  border-radius: 3px;
  color: ${theme.captionColor};
  font-size: ${fontSize}px;
  font-weight: 800;
  line-height: 1.28;
  text-shadow: 0 2px 6px rgb(0 0 0 / 38%);
}

.word.highlighted {
  background: ${theme.keywordBackground};
  color: ${theme.keywordColor};
  text-shadow: none;
  animation: moyaKeywordJump 760ms cubic-bezier(0.2, 0.82, 0.18, 1) infinite;
  box-shadow: 0 0 12px ${theme.glowColor};
}

@keyframes moyaKeywordJump {
  0%, 100% { transform: translateY(0) scale(1); }
  38% { transform: translateY(-3px) scale(1.08); }
  58% { transform: translateY(1px) scale(0.98); }
}
`.trim();
}

function buildViralTitleAss(overlay, metadata) {
  const width = Math.max(1, Number(metadata.width) || 720);
  const height = Math.max(1, Number(metadata.height) || 1280);
  const duration = Math.max(0.1, Number(metadata.duration) || readOverlayDuration(overlay));
  const titlePosition = overlay.titlePosition || { x: 50, y: 18 };
  const titleStyle = readOverlayTextStyle(overlay.titleTextStyle, { fontSize: Math.round(height * 0.038) }, width);
  const theme = viralRenderTheme(overlay);
  const titleText = overlay.hook || overlay.templateName || overlay.name || '网感剪辑';
  const titleEnd = formatAssTime(Math.min(duration, Math.max(1.2, Math.min(3, duration * 0.28))));
  const titlePoint = overlayCenterToTopLeft(titlePosition, titleStyle, width, height);
  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Title,Microsoft YaHei,${titleStyle.fontSize},${assPrimaryColor(theme.titleColor)},&H00FFFFFF,${assBackColor(theme.titleBackground)},${assBackColor(theme.titleBackground)},-1,0,0,0,100,100,0,0,3,2,0,7,24,24,24,1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    `Dialogue: 1,0:00:00.00,${titleEnd},Title,,0,0,0,,{\\an7\\pos(${titlePoint.x},${titlePoint.y})}${escapeAssText(wrapAssText(titleText, titleStyle))}`
  ].join('\n');
}

function buildViralAss(overlay, metadata) {
  const width = Math.max(1, Number(metadata.width) || 720);
  const height = Math.max(1, Number(metadata.height) || 1280);
  const duration = Math.max(0.1, Number(metadata.duration) || readOverlayDuration(overlay));
  const titlePosition = overlay.titlePosition || { x: 50, y: 18 };
  const captionPosition = overlay.captionPosition || { x: 50, y: 64 };
  const titleStyle = readOverlayTextStyle(overlay.titleTextStyle, { fontSize: Math.round(height * 0.038) }, width);
  const captionStyle = readOverlayTextStyle(overlay.captionTextStyle, { fontSize: Math.round(height * 0.024) }, width);
  const palette = viralAssPalette(overlay);
  const titleColor = assBackColor(palette.title);
  const captionColor = assBackColor('#000000', '70');
  const titleText = overlay.hook || overlay.templateName || overlay.name || '网感剪辑';
  const captions = Array.isArray(overlay.subtitleSegments) && overlay.subtitleSegments.length
    ? overlay.subtitleSegments
    : [{ time: `00:00:00 - ${formatAssTime(duration)}`, text: overlay.name || '自动识别添加字幕' }];
  const keywords = buildOverlayKeywords(overlay.keywords || '', captions[0]?.text || '');
  const isBilingual = /双语/.test(String(overlay.templateName || ''));
  const titleEnd = formatAssTime(Math.min(duration, Math.max(1.2, Math.min(3, duration * 0.28))));
  const titlePoint = overlayCenterToTopLeft(titlePosition, titleStyle, width, height);
  const captionPoint = overlayCenterToTopLeft(captionPosition, captionStyle, width, height);
  const lines = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Title,Microsoft YaHei,${titleStyle.fontSize},&H00FFFFFF,&H00FFFFFF,${titleColor},${titleColor},-1,0,0,0,100,100,0,0,3,2,0,7,24,24,24,1`,
    `Style: Caption,Microsoft YaHei,${captionStyle.fontSize},&H00FFFFFF,&H00FFFFFF,&H00000000,${captionColor},-1,0,0,0,100,100,0,0,3,1.4,0,7,24,24,24,1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    `Dialogue: 1,0:00:00.00,${titleEnd},Title,,0,0,0,,{\\an7\\pos(${titlePoint.x},${titlePoint.y})}${escapeAssText(wrapAssText(titleText, titleStyle))}`
  ];
  for (const caption of captions) {
    const range = parseCaptionRange(caption.time, duration);
    const translation = String(caption.translation || '').trim() || buildOverlayBilingualCaption(caption.text || '', keywords);
    const captionText = isBilingual
      ? `${caption.text || ''}\n${translation}`
      : caption.text || '';
    lines.push(`Dialogue: 3,${formatAssTime(range.start)},${formatAssTime(range.end)},Caption,,0,0,0,,{\\an7\\pos(${captionPoint.x},${captionPoint.y})}${highlightAssKeywords(wrapAssText(captionText, captionStyle), keywords, palette.keyword)}`);
  }
  return lines.join('\n');
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
  const fit = overlay.previewVideoFit || 'cover';
  if (fit === 'fill') return `scale=${width}:${height}`;
  if (fit === 'contain') {
    return `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`;
  }
  return `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
}

function normalizeViralOverlay(overlay) {
  if (!overlay || typeof overlay !== 'object') return null;
  if (!Array.isArray(overlay.subtitleSegments) && !overlay.hook && !overlay.templateName) return null;
  return overlay;
}

function readOverlayTextStyle(style, fallback, canvasWidth = 720) {
  const fontSize = Number(style?.fontSize);
  const width = Number(style?.width);
  const height = Number(style?.height);
  const scale = Math.max(1, canvasWidth / 360);
  return {
    fontSize: Number.isFinite(fontSize) ? Math.max(10, Math.round(fontSize * scale)) : fallback.fontSize,
    width: Number.isFinite(width) ? Math.max(80, Math.round(width * scale)) : Math.round(canvasWidth * 0.82),
    height: Number.isFinite(height) ? Math.max(24, Math.round(height * scale)) : 80
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

function viralAssPalette(overlay) {
  const name = String(overlay.templateName || '');
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
  const name = String(overlay.templateName || '');
  const key = overlay.templateKey;
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

function highlightAssKeywords(text, keywords, keywordHex) {
  const safeKeywords = Array.isArray(keywords)
    ? keywords.map((item) => String(item || '').trim()).filter((item) => item.length >= 2)
    : [];
  if (safeKeywords.length === 0) return escapeAssText(text);
  const matcher = new RegExp(`(${safeKeywords.map(escapeRegExp).join('|')})`, 'gi');
  const keywordColor = assInlineColor(keywordHex || '#8a1230');
  const baseColor = assInlineColor('#ffffff');
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
    request.setTimeout(ossUploadTimeoutMs, () => {
      request.destroy(new Error('OSS upload timed out'));
    });
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
