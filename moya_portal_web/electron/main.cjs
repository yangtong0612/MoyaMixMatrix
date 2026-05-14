const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const fsSync = require('node:fs');
const fs = require('node:fs/promises');
const { execFile } = require('node:child_process');
const { createHash, randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { TextDecoder } = require('node:util');
const { app, BrowserWindow, Menu, dialog, ipcMain, net, protocol, shell } = require('electron');
const Store = require('electron-store');

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
    return net.fetch(pathToFileURL(filePath).toString());
  });
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

  ipcMain.handle('media:upload-to-oss', async (_event, filePath, options = {}) => {
    return uploadLocalFileToOss(filePath, options);
  });
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
    size: stat.size
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
