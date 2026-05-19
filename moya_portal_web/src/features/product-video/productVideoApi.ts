import { http } from '@/shared/api/http';
import type { MediaDataUrlOptions, MediaDataUrlResult, OssUploadResult } from '@/shared/types/electron';

export interface ProductVideoGenerateRequest {
  scenario: string;
  description: string;
  imageUrls: string[];
  referenceVideoUrl?: string;
  scriptEnabled: boolean;
  avatarMode: string;
  avatarSource: string;
  avatarId?: string;
  avatarName?: string;
  avatarImageUrl?: string;
  avatarPrompt?: string;
  avatarReferenceImages?: string[];
  identityLock?: boolean;
  quality: string;
  ratio: string;
  duration: string;
  model: string;
}

export interface ProductVideoGenerateResponse {
  taskId: string;
  provider: string;
  model: string;
  status: string;
  prompt: string;
}

export interface ProductVideoTaskStatus {
  taskId: string;
  status: string;
  videoUrl?: string;
  finished: boolean;
  successful: boolean;
  message?: string;
  raw?: unknown;
}

export interface ProductVideoConfigStatus {
  enabled: boolean;
  hasApiKey: boolean;
  configured: boolean;
  model: string;
  message: string;
}

export async function uploadProductVideoAsset(filePath: string, folder: string, taskId?: string) {
  ensureOssUploaderReady();
  return window.surgicol.media.uploadToOss(filePath, { folder, taskId }) as Promise<OssUploadResult>;
}

export async function readProductVideoAssetAsDataUrl(filePath: string, options: MediaDataUrlOptions = { maxDimension: 960, quality: 72 }) {
  const reader = window.surgicol?.media?.readAsDataUrl;
  if (typeof reader !== 'function') {
    throw new Error('本地图片读取能力未加载，请重启 Electron 应用后重新生成。');
  }
  return reader(filePath, options) as Promise<MediaDataUrlResult>;
}

export async function getProductVideoAssetAccessUrl(mediaUrl: string) {
  const response = await http.post<{ mediaUrl: string }, { data: { mediaUrl: string; expiresAt?: string } }>(
    '/storage/access-url',
    { mediaUrl },
    { timeout: 60000 }
  );
  return response.data.mediaUrl || mediaUrl;
}

export async function createProductVideoTask(request: ProductVideoGenerateRequest) {
  const response = await http.post<unknown, { data: ProductVideoGenerateResponse }>(
    '/product-video/generate',
    request,
    { timeout: 300000 }
  );
  return response.data;
}

export async function getProductVideoConfigStatus() {
  const response = await http.get<unknown, { data: ProductVideoConfigStatus }>('/product-video/config/status', { timeout: 60000 });
  return response.data;
}

export async function getProductVideoTaskStatus(taskId: string) {
  const response = await http.get<unknown, { data: ProductVideoTaskStatus }>(
    `/product-video/tasks/${encodeURIComponent(taskId)}`,
    { timeout: 60000 }
  );
  return response.data;
}

function ensureOssUploaderReady() {
  const uploader = window.surgicol?.media?.uploadToOss;
  if (typeof uploader === 'function') return;
  throw new Error('OSS 直传能力未加载，请重启 Electron 应用后重新生成。');
}
