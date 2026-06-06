import type { OpenDialogOptions } from 'electron';
import type {
  Collaborator,
  FolderCollaborator,
  MaterialLibraryExternalAsset,
  MaterialLibraryImportProgress,
  MaterialLibraryImportResult,
  MaterialLibrarySnapshot
} from '@/features/materials/types';

export interface TransferTask {
  id: string;
  name: string;
  type: 'upload' | 'download';
  status: 'queued' | 'running' | 'paused' | 'done' | 'failed';
  progress: number;
  createdAt: string;
  localPath?: string;
  remotePath?: string;
}

export interface EditorDraft {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  tracks: unknown[];
  materials: unknown[];
  fissionWorkspace?: unknown;
  workflow?: string;
}

export interface OssUploadResult {
  uploadUrl: string;
  bucket: string;
  objectKey: string;
  mediaUrl: string;
  contentType: string;
  expiresAt: string;
  name: string;
  size: number;
  localPath: string;
}

export interface OssUploadProgress {
  taskId?: string;
  filePath: string;
  percent: number;
  status: 'uploading' | 'done' | 'failed';
  message?: string;
}

export interface MediaDataUrlResult {
  dataUrl: string;
  contentType: string;
  name: string;
  size: number;
  originalSize?: number;
  localPath: string;
}

export interface MediaDataUrlOptions {
  maxDimension?: number;
  quality?: number;
}

export interface MediaDownloadResult {
  canceled: boolean;
  localPath?: string;
  name?: string;
  size?: number;
}

export interface MediaCacheResult {
  cached: boolean;
  localPath: string;
  name: string;
  size: number;
}

export interface MediaProbeResult {
  duration: number;
  width: number;
  height: number;
  hasVideo: boolean;
  hasAudio: boolean;
}

export interface MediaSplitSegmentRequest {
  start: number;
  end?: number;
  duration?: number;
  label?: string;
}

export interface MediaSplitSegmentResult {
  id: string;
  label: string;
  start: number;
  end: number;
  duration: number;
  localPath: string;
  name: string;
  size: number;
}

export interface MediaSplitResult {
  source: string;
  duration: number;
  outputDir: string;
  segments: MediaSplitSegmentResult[];
}

export interface MediaCropRectRequest {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MediaCropResult {
  source: string;
  duration: number;
  width: number;
  height: number;
  localPath: string;
  name: string;
  size: number;
  crop: MediaCropRectRequest;
}

export interface MediaSpeechAnalysisResult {
  duration: number;
  speechStart: number;
  speechEnd: number;
  speechDuration: number;
  trimmedLeading: number;
  trimmedTrailing: number;
  hasSpeech: boolean;
}

export interface MediaAudioContinuityEdge {
  meanVolumeDb: number;
  peakVolumeDb: number;
  silenceRatio: number;
  activeRatio: number;
  leadingSilence: number;
  trailingSilence: number;
  duration: number;
}

export interface MediaAudioContinuityResult {
  duration: number;
  hasAudio: boolean;
  analysisWindow: number;
  head: MediaAudioContinuityEdge;
  tail: MediaAudioContinuityEdge;
}

export interface LocalFissionMixScene {
  id: string;
  groupId: string;
  groupName: string;
  sceneNo: number;
  clipName: string;
  audioName?: string;
  videoSource: string;
  audioSource?: string;
  videoIn: number;
  videoOut: number;
  audioIn: number;
  audioOut: number;
  sceneDuration: number;
  audioDuration: number;
  audioGain: number;
  videoAudioGain: number;
  width: number;
  height: number;
  bitrate: number;
  fps: number;
  fadeInOut: boolean;
  maskSubtitles: boolean;
  voiceLocked: boolean;
  contentProfile: 'standard' | 'human_presenter' | 'digital_human';
  audioSelectionSource?: 'group' | 'global' | 'ai';
  audioUsageType?: 'ai_voice' | 'voice' | 'music' | 'effect' | 'unknown';
  transitionMode?: 'default' | 'waterfall';
  leadingTrim?: number;
  trailingTrim?: number;
  audioFadeInDuration?: number;
  audioFadeOutDuration?: number;
}

export interface LocalFissionMixBackgroundTrack {
  id: string;
  name: string;
  source: string;
  duration: number;
  gain: number;
  fadeInOut: boolean;
}

export interface LocalFissionMixNarrationSegment {
  id: string;
  sceneId: string;
  groupId: string;
  groupName: string;
  name: string;
  source: string;
  audioIn: number;
  audioOut: number;
  timelineIn: number;
  timelineOut: number;
  gain: number;
  fadeInDuration: number;
  fadeOutDuration: number;
  usageType?: 'ai_voice' | 'voice' | 'music' | 'effect' | 'unknown';
}

export interface LocalFissionMixRequest {
  name?: string;
  scenes: LocalFissionMixScene[];
  bgmTracks?: LocalFissionMixBackgroundTrack[];
  narrationSegments?: LocalFissionMixNarrationSegment[];
}

export interface LocalFissionMixResult {
  localPath: string;
  duration: number;
  width: number;
  height: number;
  sceneCount: number;
  name: string;
}

export interface DriveFileInfo {
  name: string;
  size: number;
  localPath: string;
  contentType: string;
  sha256: string;
}

export interface LocalUploadFileEntry {
  localPath: string;
  name: string;
  size: number;
  contentType: string;
  relativeDir: string;
  relativePath: string;
}

export interface LocalUploadFolderEntry {
  localPath: string;
  name: string;
  relativePath: string;
}

export interface LocalUploadErrorEntry {
  localPath: string;
  message: string;
}

export interface LocalUploadPlan {
  files: LocalUploadFileEntry[];
  folders: LocalUploadFolderEntry[];
  errors: LocalUploadErrorEntry[];
  totalFiles: number;
  totalBytes: number;
}

export interface DriveUploadOptions {
  taskId: string;
  uploadUrl: string;
  bucket?: string;
  objectKey?: string;
  contentType?: string;
}

export interface DriveUploadPartOptions {
  taskId: string;
  uploadUrl: string;
  chunkIndex: number;
  partNumber: number;
  start: number;
  end: number;
  contentType?: string;
}

export interface DriveUploadPartResult {
  etag: string;
  partNumber: number;
  chunkIndex: number;
  sizeBytes: number;
}

export interface DriveUploadProgress {
  taskId: string;
  chunkIndex?: number;
  percent: number;
  status: 'uploading' | 'done' | 'failed';
  message?: string;
}

export interface ApiBridgeRequest {
  url?: string;
  method?: string;
  headers?: Record<string, unknown>;
  data?: unknown;
  timeout?: number;
}

export interface ApiBridgeResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: unknown;
}

export interface MaterialLibraryBridgeResult {
  ok: boolean;
  state?: MaterialLibrarySnapshot;
  assets?: unknown[];
  folders?: unknown[];
  exported?: { count: number; directory: string };
  canceled?: boolean;
  error?: string;
}

export interface ViralDirectorBridgeResult {
  ok: boolean;
  scripts?: unknown[];
  scriptPackage?: unknown;
  taskId?: string;
  error?: string;
}

export interface ViralDirectorWindowAPI {
  listViralDirectorScripts(): Promise<ViralDirectorBridgeResult>;
  generateViralDirectorFromProduct(payload: { prompt: string; revisionInstruction?: string }): Promise<ViralDirectorBridgeResult>;
  startViralDirectorProductStream(payload: { prompt: string; revisionInstruction?: string; taskId?: string }): Promise<ViralDirectorBridgeResult>;
  cancelViralDirectorStream(payload: { taskId: string }): Promise<{ ok: boolean; error?: string }>;
  onViralDirectorStreamEvent(callback: (message: unknown) => void): () => void;
  analyzeViralDirectorFromVideoLink(payload: { url: string; revisionInstruction?: string }): Promise<ViralDirectorBridgeResult>;
  analyzeViralDirectorFromUpload(payload: { fileName: string; mimeType?: string; bytes: number[] | Uint8Array }): Promise<ViralDirectorBridgeResult>;
  saveViralDirectorScript(payload: { scriptPackage: unknown }): Promise<ViralDirectorBridgeResult>;
  deleteViralDirectorScript(payload: { scriptId: string }): Promise<ViralDirectorBridgeResult>;
}

declare global {
  interface Window {
    surgicol: {
      app: {
        apiBaseUrl: string;
        requestApi(request: ApiBridgeRequest): Promise<ApiBridgeResponse>;
        getVersion(): Promise<string>;
        setTitlebarTheme(theme: 'dark' | 'light'): Promise<boolean>;
      };
      store: {
        get<T = unknown>(key: string): Promise<T>;
        set(key: string, value: unknown): Promise<boolean>;
      };
      dialog: {
        openFiles(options?: OpenDialogOptions): Promise<string[]>;
        openFolder(): Promise<string | null>;
      };
      file: {
        exists(filePath: string): Promise<boolean>;
        getDroppedPath(file: globalThis.File): string;
        reveal(filePath: string): Promise<boolean>;
        readText(filePath: string): Promise<string>;
      };
      editor: {
        createDraft(payload?: { name?: string }): Promise<EditorDraft>;
        listDrafts(): Promise<EditorDraft[]>;
      };
      cloud: {
        addTransferTask(task: Partial<TransferTask>): Promise<TransferTask>;
        listTransferTasks(): Promise<TransferTask[]>;
        inspectLocalEntries(paths: string[]): Promise<LocalUploadPlan>;
        inspectDriveFile(filePath: string): Promise<DriveFileInfo>;
        uploadDriveFile(filePath: string, options: DriveUploadOptions): Promise<boolean>;
        uploadDriveFilePart(filePath: string, options: DriveUploadPartOptions): Promise<DriveUploadPartResult>;
        onUploadDriveFileProgress(callback: (progress: DriveUploadProgress) => void): () => void;
      };
      materialLibrary: {
        list(): Promise<MaterialLibraryBridgeResult>;
        createFolder(payload: { name: string; parentId: string | null }): Promise<MaterialLibraryBridgeResult>;
        renameFolder(payload: { id: string; name: string }): Promise<MaterialLibraryBridgeResult>;
        deleteFolder(payload: { id: string }): Promise<MaterialLibraryBridgeResult>;
        restoreFolder(payload: { id: string }): Promise<MaterialLibraryBridgeResult>;
        moveFolder(payload: { id: string; parentId: string | null }): Promise<MaterialLibraryBridgeResult>;
        moveAssets(payload: { assetIds: string[]; folderId: string }): Promise<MaterialLibraryBridgeResult>;
        renameAsset(payload: { id: string; name: string }): Promise<MaterialLibraryBridgeResult>;
        deleteAssets(payload: { assetIds: string[] }): Promise<MaterialLibraryBridgeResult>;
        restoreAssets(payload: { assetIds: string[] }): Promise<MaterialLibraryBridgeResult>;
        revealAsset(payload: { id: string }): Promise<MaterialLibraryBridgeResult>;
        exportAssets(payload: { assetIds: string[] }): Promise<MaterialLibraryBridgeResult>;
        exportFolder(payload: { id: string }): Promise<MaterialLibraryBridgeResult>;
        toggleAssetFavorite(payload: { id: string; favorite: boolean }): Promise<MaterialLibraryBridgeResult>;
        importLocalEntries(payload: { folderId: string; mode: 'file' | 'folder'; taskId?: string }): Promise<MaterialLibraryImportResult>;
        updateCollaborator(payload: { phone: string; role: Collaborator['role']; enabled: boolean }): Promise<MaterialLibraryBridgeResult>;
        updateFolderCollaborators(payload: { folderId: string; collaborators: FolderCollaborator[] }): Promise<MaterialLibraryBridgeResult>;
        syncExternalAssets(payload: { assets: MaterialLibraryExternalAsset[] }): Promise<MaterialLibraryBridgeResult>;
        onImportProgress(callback: (progress: MaterialLibraryImportProgress) => void): () => void;
      };
      media: {
        uploadToOss(filePath: string, options?: { folder?: string; contentType?: string; taskId?: string }): Promise<OssUploadResult>;
        downloadToLocal(source: string, options?: { fileName?: string; viralOverlay?: unknown }): Promise<MediaDownloadResult>;
        cacheRemoteFile(source: string, options?: { folder?: string; cacheKey?: string; fileName?: string }): Promise<MediaCacheResult>;
        createThumbnail(source: string, options?: { width?: number; height?: number; time?: number; cacheKey?: string }): Promise<MediaCacheResult>;
        readAsDataUrl(filePath: string, options?: MediaDataUrlOptions): Promise<MediaDataUrlResult>;
        probeFile(filePath: string): Promise<MediaProbeResult>;
        splitVideo(source: string, options?: { fileName?: string; folder?: string; segments?: MediaSplitSegmentRequest[] }): Promise<MediaSplitResult>;
        cropVideo(source: string, options?: { fileName?: string; folder?: string; crop?: MediaCropRectRequest }): Promise<MediaCropResult>;
        analyzeSpeech(filePath: string): Promise<MediaSpeechAnalysisResult>;
        analyzeAudioContinuity(filePath: string): Promise<MediaAudioContinuityResult>;
        renderFissionMix(request: LocalFissionMixRequest): Promise<LocalFissionMixResult>;
        onUploadToOssProgress(callback: (progress: OssUploadProgress) => void): () => void;
      };
    };
    windowAPI?: ViralDirectorWindowAPI;
  }
}

export {};
