const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('surgicol', {
  app: {
    getVersion: () => invoke('app:get-version'),
    setTitlebarTheme: (theme) => invoke('app:set-titlebar-theme', theme)
  },
  store: {
    get: (key) => invoke('store:get', key),
    set: (key, value) => invoke('store:set', key, value)
  },
  dialog: {
    openFiles: (options) => invoke('dialog:open-files', options),
    openFolder: () => invoke('dialog:open-folder')
  },
  file: {
    exists: (filePath) => invoke('file:exists', filePath),
    reveal: (filePath) => invoke('file:reveal', filePath),
    readText: (filePath) => invoke('file:read-text', filePath)
  },
  editor: {
    createDraft: (payload) => invoke('editor:create-draft', payload),
    listDrafts: () => invoke('editor:list-drafts')
  },
  cloud: {
    addTransferTask: (task) => invoke('cloud:add-transfer-task', task),
    listTransferTasks: () => invoke('cloud:list-transfer-tasks'),
    inspectDriveFile: (filePath) => invoke('cloud:inspect-drive-file', filePath),
    uploadDriveFile: (filePath, options) => invoke('cloud:upload-drive-file', filePath, options),
    onUploadDriveFileProgress: (callback) => {
      const listener = (_event, progress) => callback(progress);
      ipcRenderer.on('cloud:upload-drive-file-progress', listener);
      return () => ipcRenderer.removeListener('cloud:upload-drive-file-progress', listener);
    }
  },
  media: {
    uploadToOss: (filePath, options) => invoke('media:upload-to-oss', filePath, options),
    downloadToLocal: (source, options) => invoke('media:download-to-local', source, options),
    readAsDataUrl: (filePath) => invoke('media:read-as-data-url', filePath),
    onUploadToOssProgress: (callback) => {
      const listener = (_event, progress) => callback(progress);
      ipcRenderer.on('media:upload-to-oss-progress', listener);
      return () => ipcRenderer.removeListener('media:upload-to-oss-progress', listener);
    }
  }
});
