import { http } from '@/shared/api/http';

export interface AliyunMixShotGroup {
  id: string;
  sceneNo: number;
  title: string;
  duration: string;
  script: string;
  voiceover: string;
  clips: Array<{
    id: string;
    name: string;
    duration: string;
    path?: string;
    uploadStatus?: string;
  }>;
  groupAudios?: AliyunMixAudioItem[];
}

export interface AliyunMixAudioItem {
  id: string;
  name: string;
  duration: string;
  volume: number;
  path?: string;
  uploadStatus?: string;
}

export interface AliyunMixSettings {
  followAudioSpeed: boolean;
  retainOriginalAudio: boolean;
  ducking: boolean;
  fadeInOut: boolean;
  volume: number;
  width?: number;
  height?: number;
  bitrate?: number;
}

export interface AliyunMixRequest {
  groups: Array<{
    id: string;
    sceneNo: number;
    title: string;
    duration: string;
    script: string;
    voiceover: string;
    clips: Array<{
      id: string;
      name: string;
      duration: string;
      mediaUrl: string;
    }>;
    groupAudios: Array<{
      id: string;
      name: string;
      duration: string;
      volume: number;
      mediaUrl: string;
    }>;
  }>;
  audioItems: Array<{
    id: string;
    name: string;
    duration: string;
    volume: number;
    mediaUrl: string;
  }>;
  settings: Required<Pick<AliyunMixSettings, 'followAudioSpeed' | 'retainOriginalAudio' | 'ducking' | 'fadeInOut' | 'volume'>> & {
    width: number;
    height: number;
    bitrate: number;
  };
  variantIndex: number;
  outputMediaUrl: string;
  dryRun?: boolean;
}

export interface AliyunMixResponse {
  jobId?: string;
  outputMediaUrl: string;
  timeline: unknown;
  outputMediaConfig: unknown;
  submitted: boolean;
}

export interface AliyunMixJobStatus {
  jobId: string;
  status: string;
  code?: string;
  message?: string;
  mediaUrl?: string;
  duration?: number;
  createTime?: string;
  completeTime?: string;
  finished: boolean;
  successful: boolean;
  raw?: unknown;
}

export interface AliyunStorageConfig {
  enabled: boolean;
  endpoint: string;
  bucket: string;
  rootPrefix: string;
  outputPrefix: string;
}

export interface StorageAccessUrlResult {
  mediaUrl: string;
  expiresAt?: string;
}

interface OssUploadTicketProbe {
  uploadUrl: string;
}

export function buildAliyunMixRequest(input: {
  groups: AliyunMixShotGroup[];
  audioItems: AliyunMixAudioItem[];
  settings: AliyunMixSettings;
  outputMediaUrl: string;
  variantIndex?: number;
  dryRun?: boolean;
}): AliyunMixRequest {
  const uploadedGlobalAudios = dedupeAudios(input.audioItems).filter((audio) => isCloudMediaUrl(audio.path));
  const eligibleSourceGroups = input.groups.filter((group) =>
    group.clips.some((clip) => isCloudMediaUrl(clip.path)) &&
    ((group.groupAudios || []).some((audio) => isCloudMediaUrl(audio.path)) || uploadedGlobalAudios.length > 0)
  );

  if (eligibleSourceGroups.length === 0) {
    const uploadingItems = input.groups.flatMap((group) => [
      ...group.clips
        .filter((clip) => clip.uploadStatus === 'uploading')
        .map((clip) => `${group.title}:${clip.name}`),
      ...(group.groupAudios || [])
        .filter((audio) => audio.uploadStatus === 'uploading')
        .map((audio) => `${group.title}:${audio.name}`)
    ]);
    if (uploadingItems.length > 0) {
      throw new Error(`视频或组内音频还在上传中，请上传完成后再混剪：${uploadingItems.slice(0, 6).join('、')}`);
    }
    throw new Error('当前没有同时具备“已上传视频 + 已上传组内音频”的分镜，不能提交阿里云混剪。');
  }

  const groups = eligibleSourceGroups.map((group) => {
    const uploadedGroupClips = group.clips.filter((clip) => isCloudMediaUrl(clip.path));
    const uploadedGroupAudios = (group.groupAudios || []).filter((audio) => isCloudMediaUrl(audio.path));
    return {
      id: group.id,
      sceneNo: group.sceneNo,
      title: group.title,
      duration: group.duration,
      script: group.script,
      voiceover: group.voiceover,
      clips: uploadedGroupClips
        .map((clip) => ({
          id: clip.id,
          name: clip.name,
          duration: clip.duration,
          mediaUrl: clip.path || ''
        })),
      groupAudios: uploadedGroupAudios
        .map((audio) => ({
          id: audio.id,
          name: audio.name,
          duration: audio.duration,
          volume: audio.volume,
          mediaUrl: audio.path || ''
      }))
    };
  });

  return {
    groups,
    audioItems: uploadedGlobalAudios.map((audio) => ({
      id: audio.id,
      name: audio.name,
      duration: audio.duration,
      volume: audio.volume,
      mediaUrl: audio.path || ''
    })),
    settings: {
      followAudioSpeed: input.settings.followAudioSpeed,
      retainOriginalAudio: input.settings.retainOriginalAudio,
      ducking: input.settings.ducking,
      fadeInOut: input.settings.fadeInOut,
      volume: input.settings.volume,
      width: input.settings.width || 720,
      height: input.settings.height || 1280,
      bitrate: input.settings.bitrate || 6000
    },
    variantIndex: input.variantIndex || 0,
    outputMediaUrl: input.outputMediaUrl,
    dryRun: input.dryRun
  };
}

function dedupeAudios(audios: AliyunMixAudioItem[]) {
  const seen = new Set<string>();
  return audios.filter((audio) => {
    const key = audio.path || audio.id;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function submitAliyunMix(request: AliyunMixRequest) {
  const response = await http.post<unknown, { data: AliyunMixResponse }>('/fission/aliyun-mix/submit', request);
  return response.data;
}

export async function getAliyunMixJobStatus(jobId: string) {
  const response = await http.get<unknown, { data: AliyunMixJobStatus }>(`/fission/aliyun-mix/jobs/${encodeURIComponent(jobId)}`);
  return response.data;
}

export async function getAliyunStorageConfig() {
  const response = await http.get<unknown, { data: AliyunStorageConfig }>('/storage/oss-config');
  return response.data;
}

export async function getProtectedMediaAccessUrl(mediaUrl: string) {
  const response = await http.post<{ mediaUrl: string }, { data: StorageAccessUrlResult }>('/storage/access-url', { mediaUrl });
  return response.data;
}

export async function createAliyunOutputMediaUrl(
  config: AliyunStorageConfig,
  variantIndex = 0,
  fallbackMediaUrls: string[] = []
) {
  if (!config.enabled) {
    throw new Error('OSS 未启用，无法生成阿里云混剪输出地址');
  }
  if (!config.bucket) {
    throw new Error('OSS bucket 未配置，无法生成阿里云混剪输出地址');
  }
  const outputPrefix = trimSlashes(config.outputPrefix || `${config.rootPrefix || 'moya-drive'}/fission/outputs`);
  const host = await resolveOssHost(config, fallbackMediaUrls);
  return `https://${host}/${outputPrefix}/mix-${formatTimestamp(new Date())}-${String(variantIndex + 1).padStart(2, '0')}-${crypto.randomUUID().slice(0, 8)}.mp4`;
}

function trimSlashes(value: string) {
  return value.replace(/^\/+/, '').replace(/\/+$/, '');
}

function normalizeOssHost(endpoint: string, bucket: string) {
  const normalizedEndpoint = endpoint.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  if (normalizedEndpoint.startsWith(`${bucket}.`)) return normalizedEndpoint;
  return `${bucket}.${normalizedEndpoint}`;
}

async function resolveOssHost(config: AliyunStorageConfig, fallbackMediaUrls: string[]) {
  if (config.endpoint) {
    return normalizeOssHost(config.endpoint, config.bucket);
  }
  const ticketHost = await inferOssHostFromUploadTicket(config.bucket);
  if (ticketHost) return ticketHost;
  const inferredHost = inferOssHostFromMediaUrls(fallbackMediaUrls, config.bucket);
  if (inferredHost) return inferredHost;
  throw new Error('OSS endpoint 未配置，且无法从已上传素材推断输出域名');
}

async function inferOssHostFromUploadTicket(bucket: string) {
  try {
    const response = await http.post<
      { fileName: string; contentType: string; folder: string; size: number },
      { data: OssUploadTicketProbe }
    >('/storage/upload-ticket', {
      fileName: 'endpoint-probe.txt',
      contentType: 'text/plain',
      folder: 'fission/probe',
      size: 1
    });
    const uploadUrl = response.data?.uploadUrl;
    if (!uploadUrl || !/^https?:\/\//i.test(uploadUrl)) return '';
    const host = new URL(uploadUrl).host;
    if (!host) return '';
    if (host.startsWith(`${bucket}.`)) return host;
    if (/aliyuncs\.com$/i.test(host)) return `${bucket}.${host.replace(/^[^.]+\./, '')}`;
    return host;
  } catch {
    return '';
  }
}

function inferOssHostFromMediaUrls(mediaUrls: string[], bucket: string) {
  for (const mediaUrl of mediaUrls) {
    if (!/^https?:\/\//i.test(mediaUrl)) continue;
    try {
      const host = new URL(mediaUrl).host;
      if (!host) continue;
      if (host.startsWith(`${bucket}.`)) return host;
      if (/aliyuncs\.com$/i.test(host)) return `${bucket}.${host.replace(/^[^.]+\./, '')}`;
      return host;
    } catch {
      // ignore malformed media urls and keep trying the rest
    }
  }
  return '';
}

function formatTimestamp(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('');
}

function isCloudMediaUrl(path?: string) {
  return Boolean(path && /^(https?:\/\/|oss:\/\/)/i.test(path));
}
