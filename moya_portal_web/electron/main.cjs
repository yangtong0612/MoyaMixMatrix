const path = require('node:path');
const fs = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');
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

  ipcMain.handle('editor:create-draft', async (_event, payload = {}) => {
    const drafts = store.get('editor.drafts', []);
    const draft = {
      id: randomUUID(),
      name: payload.name || '未命名剪辑',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tracks: [],
      materials: []
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
}
