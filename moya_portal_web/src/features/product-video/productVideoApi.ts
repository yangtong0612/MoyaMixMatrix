import { http } from '@/shared/api/http';
import type { MediaDataUrlResult, OssUploadResult } from '@/shared/types/electron';

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

export async function uploadProductVideoAsset(filePath: string, folder: string, taskId?: string) {
  ensureOssUploaderReady();
  return window.surgicol.media.uploadToOss(filePath, { folder, taskId }) as Promise<OssUploadResult>;
}

export async function readProductVideoAssetAsDataUrl(filePath: string) {
  const reader = window.surgicol?.media?.readAsDataUrl;
  if (typeof reader !== 'function') {
    throw new Error('本地图片读取能力未加载，请重启 Electron 应用后重新生成。');
  }
  return reader(filePath) as Promise<MediaDataUrlResult>;
}

export async function getProductVideoAssetAccessUrl(mediaUrl: string) {
  const response = await http.post<{ mediaUrl: string }, { data: { mediaUrl: string; expiresAt?: string } }>('/storage/access-url', { mediaUrl });
  return response.data.mediaUrl || mediaUrl;
}

export async function createProductVideoTask(request: ProductVideoGenerateRequest) {
  const response = await http.post<unknown, { data: ProductVideoGenerateResponse }>('/product-video/generate', request);
  return response.data;
}

export async function getProductVideoTaskStatus(taskId: string) {
  const response = await http.get<unknown, { data: ProductVideoTaskStatus }>(`/product-video/tasks/${encodeURIComponent(taskId)}`);
  return response.data;
}

function ensureOssUploaderReady() {
  const uploader = window.surgicol?.media?.uploadToOss;
  if (typeof uploader === 'function') return;
  throw new Error('OSS 直传能力未加载，请重启 Electron 应用后重新生成。');
}
