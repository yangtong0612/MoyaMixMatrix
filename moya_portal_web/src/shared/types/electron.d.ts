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
      };
      media: {
        uploadToOss(filePath: string, options?: { folder?: string; contentType?: string }): Promise<OssUploadResult>;
      };
    };
  }
}

export {};
