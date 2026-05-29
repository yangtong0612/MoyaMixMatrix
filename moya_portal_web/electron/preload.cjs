const { contextBridge, ipcRenderer, webUtils } = require('electron');

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
    getDroppedPath: (file) => {
      if (webUtils && typeof webUtils.getPathForFile === 'function') {
        return webUtils.getPathForFile(file);
      }
      return file && typeof file.path === 'string' ? file.path : '';
    },
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
    inspectLocalEntries: (paths) => invoke('cloud:inspect-local-entries', paths),
    inspectDriveFile: (filePath) => invoke('cloud:inspect-drive-file', filePath),
    uploadDriveFile: (filePath, options) => invoke('cloud:upload-drive-file', filePath, options),
    uploadDriveFilePart: (filePath, options) => invoke('cloud:upload-drive-file-part', filePath, options),
    onUploadDriveFileProgress: (callback) => {
      const listener = (_event, progress) => callback(progress);
      ipcRenderer.on('cloud:upload-drive-file-progress', listener);
      return () => ipcRenderer.removeListener('cloud:upload-drive-file-progress', listener);
    }
  },
  media: {
    uploadToOss: (filePath, options) => invoke('media:upload-to-oss', filePath, options),
    downloadToLocal: (source, options) => invoke('media:download-to-local', source, options),
    cacheRemoteFile: (source, options) => invoke('media:cache-remote-file', source, options),
    createThumbnail: (source, options) => invoke('media:create-thumbnail', source, options),
    readAsDataUrl: (filePath, options) => invoke('media:read-as-data-url', filePath, options),
    probeFile: (filePath) => invoke('media:probe-file', filePath),
    analyzeSpeech: (filePath) => invoke('media:analyze-speech', filePath),
    analyzeAudioContinuity: (filePath) => invoke('media:analyze-audio-continuity', filePath),
    renderFissionMix: (request) => invoke('media:render-fission-mix', request),
    onUploadToOssProgress: (callback) => {
      const listener = (_event, progress) => callback(progress);
      ipcRenderer.on('media:upload-to-oss-progress', listener);
      return () => ipcRenderer.removeListener('media:upload-to-oss-progress', listener);
    }
  }
});
