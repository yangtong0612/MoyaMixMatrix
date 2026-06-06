const { contextBridge, ipcRenderer, webUtils } = require('electron');

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);
const apiBaseUrl = (process.env.MOYA_API_BASE_URL || 'http://127.0.0.1:8081/api').replace(/\/+$/, '');

contextBridge.exposeInMainWorld('surgicol', {
  app: {
    apiBaseUrl,
    requestApi: (request) => invoke('app:request-api', request),
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
  materialLibrary: {
    list: () => invoke('material-library:list'),
    createFolder: (payload) => invoke('material-library:create-folder', payload),
    renameFolder: (payload) => invoke('material-library:rename-folder', payload),
    deleteFolder: (payload) => invoke('material-library:delete-folder', payload),
    restoreFolder: (payload) => invoke('material-library:restore-folder', payload),
    moveFolder: (payload) => invoke('material-library:move-folder', payload),
    moveAssets: (payload) => invoke('material-library:move-assets', payload),
    renameAsset: (payload) => invoke('material-library:rename-asset', payload),
    deleteAssets: (payload) => invoke('material-library:delete-assets', payload),
    restoreAssets: (payload) => invoke('material-library:restore-assets', payload),
    revealAsset: (payload) => invoke('material-library:reveal-asset', payload),
    exportAssets: (payload) => invoke('material-library:export-assets', payload),
    exportFolder: (payload) => invoke('material-library:export-folder', payload),
    toggleAssetFavorite: (payload) => invoke('material-library:toggle-asset-favorite', payload),
    importLocalEntries: (payload) => invoke('material-library:import-local-entries', payload),
    updateCollaborator: (payload) => invoke('material-library:update-collaborator', payload),
    updateFolderCollaborators: (payload) => invoke('material-library:update-folder-collaborators', payload),
    syncExternalAssets: (payload) => invoke('material-library:sync-external-assets', payload),
    onImportProgress: (callback) => {
      const listener = (_event, progress) => callback(progress);
      ipcRenderer.on('material-library:import-progress', listener);
      return () => ipcRenderer.removeListener('material-library:import-progress', listener);
    }
  },
  media: {
    uploadToOss: (filePath, options) => invoke('media:upload-to-oss', filePath, options),
    downloadToLocal: (source, options) => invoke('media:download-to-local', source, options),
    cacheRemoteFile: (source, options) => invoke('media:cache-remote-file', source, options),
    createThumbnail: (source, options) => invoke('media:create-thumbnail', source, options),
    readAsDataUrl: (filePath, options) => invoke('media:read-as-data-url', filePath, options),
    probeFile: (filePath) => invoke('media:probe-file', filePath),
    splitVideo: (source, options) => invoke('media:split-video', source, options),
    cropVideo: (source, options) => invoke('media:crop-video', source, options),
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

contextBridge.exposeInMainWorld('windowAPI', {
  listViralDirectorScripts: () => invoke('viral-director:list'),
  generateViralDirectorFromProduct: (payload) => invoke('viral-director:generate-product', payload),
  startViralDirectorProductStream: (payload) => Promise.resolve({
    ok: false,
    taskId: payload?.taskId,
    error: '当前后端暂未启用流式生成，已切换为普通生成'
  }),
  cancelViralDirectorStream: () => Promise.resolve({ ok: true }),
  onViralDirectorStreamEvent: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on('viral-director:stream-event', listener);
    return () => ipcRenderer.removeListener('viral-director:stream-event', listener);
  },
  analyzeViralDirectorFromVideoLink: (payload) => invoke('viral-director:analyze-video-link', payload),
  analyzeViralDirectorFromUpload: (payload) => invoke('viral-director:analyze-upload', payload),
  saveViralDirectorScript: (payload) => invoke('viral-director:save-script', payload),
  deleteViralDirectorScript: (payload) => invoke('viral-director:delete-script', payload)
});
