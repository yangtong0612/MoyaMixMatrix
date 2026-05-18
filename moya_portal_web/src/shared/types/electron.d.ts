import type { OpenDialogOptions } from 'electron';

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

declare global {
  interface Window {
    surgicol: {
      app: {
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
      media: {
        uploadToOss(filePath: string, options?: { folder?: string; contentType?: string }): Promise<OssUploadResult>;
      };
    };
  }
}

export {};
