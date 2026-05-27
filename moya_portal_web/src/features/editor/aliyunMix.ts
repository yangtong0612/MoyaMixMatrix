import { http } from '@/shared/api/http';
import {
  buildFissionMixMatchKey,
  inferFissionMixAudioUsageType,
  inferFissionMixContentProfile,
  selectFissionMixVariantMedia,
  type FissionMixAudioSource,
  type FissionMixAudioUsageType,
  type FissionMixContentProfile,
  type FissionMixSelectionProfile
} from './fissionMixMatcher';
import { buildWaterfallMixSelections } from './fissionWaterfallComposer';

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
  usageType?: AliyunMixAudioUsageType;
  speechStart?: number;
  speechEnd?: number;
  speechDuration?: number;
}

export type AliyunMixContentProfile = FissionMixContentProfile;
export type AliyunMixAudioUsageType = FissionMixAudioUsageType;
export type AliyunMixAudioSource = FissionMixAudioSource;
export type AliyunMixSelectionProfile = FissionMixSelectionProfile;

export interface AliyunMixSettings {
  followAudioSpeed: boolean;
  retainOriginalAudio: boolean;
  ducking: boolean;
  fadeInOut: boolean;
  volume: number;
  compositionMode?: 'segments' | 'waterfall';
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
    contentProfile: AliyunMixContentProfile;
    clips: Array<{
      id: string;
      name: string;
      duration: string;
      mediaUrl: string;
      matchKey: string;
    }>;
    groupAudios: Array<{
      id: string;
      name: string;
      duration: string;
      volume: number;
      mediaUrl: string;
      usageType: AliyunMixAudioUsageType;
      matchKey: string;
      speechStart?: number;
      speechEnd?: number;
      speechDuration?: number;
    }>;
  }>;
  bgmItems: Array<{
    id: string;
    name: string;
    duration: string;
    volume: number;
    mediaUrl: string;
    usageType: AliyunMixAudioUsageType;
    matchKey: string;
    speechStart?: number;
    speechEnd?: number;
    speechDuration?: number;
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

export interface ViralSubtitleSegment {
  start: number;
  end: number;
  text: string;
}

export interface ViralSubtitleJob {
  jobId: string;
  status: string;
  finished: boolean;
  successful: boolean;
  segments: ViralSubtitleSegment[];
  text: string;
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

interface MixClipLike {
  id: string;
  name: string;
  duration: string;
}

interface MixAudioLike {
  id: string;
  name: string;
  duration: string;
  volume: number;
  usageType?: AliyunMixAudioUsageType;
  speechStart?: number;
  speechEnd?: number;
  speechDuration?: number;
}

interface MixGroupLike<TClip extends MixClipLike = MixClipLike, TAudio extends MixAudioLike = MixAudioLike> {
  title: string;
  script: string;
  voiceover: string;
  clips: TClip[];
  groupAudios?: TAudio[];
}

interface MixAudioCandidate<TAudio extends MixAudioLike> {
  audio: TAudio;
  source: 'group' | 'global';
  usageType: AliyunMixAudioUsageType;
  originalIndex: number;
}

const DIGITAL_HUMAN_KEYWORDS = /数字人|虚拟人|口播|主播|出镜|讲解|主持|人像|口型|嘴型|唇同步|真人讲解|digital\s*human|avatar|spokesperson|presenter|host/i;
const AI_AUDIO_KEYWORDS = /(?:^|[\s_-])(ai|tts)(?:$|[\s_-])|数字人|ai配音|智能配音|voiceover|speech|synthetic/i;
const VOICE_AUDIO_KEYWORDS = /配音|旁白|口播|讲解|解说|人声|主播|台词|narrat|voice|speech|dub/i;
const MUSIC_AUDIO_KEYWORDS = /bgm|伴奏|纯音乐|音乐|music|beat|loop|song|melody|instrumental/i;
const EFFECT_AUDIO_KEYWORDS = /音效|效果|sfx|fx|effect/i;
const GENERIC_MATCH_TOKENS = new Set(['scene', 'clip', 'audio', 'video', 'mix', 'group', 'voice', 'music', 'bgm', '音频', '视频', '素材', '片段', '镜头', '分镜', '混剪']);

export function inferAliyunMixContentProfile(group: Pick<AliyunMixShotGroup, 'title' | 'script' | 'voiceover' | 'clips'>): AliyunMixContentProfile {
  return inferFissionMixContentProfile(group);
}

export function inferAliyunMixAudioUsageType(
  audio: Pick<AliyunMixAudioItem, 'name' | 'path' | 'usageType'>,
  context: 'group' | 'global' = 'global'
): AliyunMixAudioUsageType {
  return inferFissionMixAudioUsageType(audio, context);
}

export function buildAliyunMixMatchKey(value?: string) {
  return buildFissionMixMatchKey(value);
}

export function selectAliyunMixVariantMedia<TClip extends MixClipLike, TAudio extends MixAudioLike>(input: {
  group: MixGroupLike<TClip, TAudio>;
  clips?: TClip[];
  groupAudios?: TAudio[];
  globalAudios?: TAudio[];
  variantIndex: number;
  groupIndex?: number;
}) {
  return selectFissionMixVariantMedia(input);
}

export function buildAliyunMixRequest(input: {
  groups: AliyunMixShotGroup[];
  audioItems: AliyunMixAudioItem[];
  settings: AliyunMixSettings;
  outputMediaUrl: string;
  variantIndex?: number;
  compositionMode?: 'segments' | 'waterfall';
  dryRun?: boolean;
}): AliyunMixRequest {
  const uploadedGlobalAudios = dedupeAudios(input.audioItems).filter(isUsableCloudMedia);
  const eligibleSourceGroups = input.groups.filter((group) => group.clips.some(isUsableCloudMedia));

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
    throw new Error('当前没有已上传完成的视频分镜，不能提交阿里云混剪。');
  }

  const variantIndex = input.variantIndex || 0;
  const compositionMode = input.compositionMode || input.settings.compositionMode || 'segments';
  const waterfallSelections = compositionMode === 'waterfall'
    ? buildWaterfallMixSelections({
      groups: eligibleSourceGroups.map((group) => ({
        ...group,
        clips: group.clips.filter(isUsableCloudMedia),
        groupAudios: (group.groupAudios || []).filter(isUsableCloudMedia)
      })),
      globalAudios: [],
      variantIndex
    })
    : null;
  const groups = (waterfallSelections || eligibleSourceGroups.map((group, groupIndex) => {
    const uploadedGroupClips = group.clips.filter(isUsableCloudMedia);
    const uploadedGroupAudios = (group.groupAudios || []).filter(isUsableCloudMedia);
    const selection = selectAliyunMixVariantMedia({
      group,
      clips: uploadedGroupClips,
      groupAudios: uploadedGroupAudios,
      globalAudios: [],
      variantIndex,
      groupIndex
    });
    return {
      orderIndex: groupIndex,
      group,
      clip: selection.clip || uploadedGroupClips[0],
      audio: selection.audio,
      selectionProfile: selection.selectionProfile,
      contentProfile: selection.contentProfile,
      audioUsageType: selection.audioUsageType,
      audioSource: selection.audioSource,
      voiceLocked: selection.voiceLocked,
      voiceProfileKey: '',
      continuityLocked: false
    };
  })).map((item) => {
    const selectedClip = item.clip;
    const selectedAudio = item.audio;
    return {
      id: item.group.id,
      sceneNo: item.group.sceneNo,
      title: item.group.title,
      duration: item.group.duration || '',
      script: item.group.script,
      voiceover: item.group.voiceover,
      contentProfile: item.contentProfile,
      clips: selectedClip ? [{
        id: selectedClip.id,
        name: selectedClip.name,
        duration: selectedClip.duration,
        mediaUrl: selectedClip.path || '',
        matchKey: buildAliyunMixMatchKey(selectedClip.name)
      }] : [],
      groupAudios: selectedAudio ? [{
        id: selectedAudio.id,
        name: selectedAudio.name,
        duration: selectedAudio.duration,
        volume: selectedAudio.volume,
        mediaUrl: selectedAudio.path || '',
        usageType: item.audioUsageType || inferAliyunMixAudioUsageType(selectedAudio, item.audioSource === 'group' ? 'group' : 'global'),
        matchKey: buildAliyunMixMatchKey(selectedAudio.name),
        speechStart: selectedAudio.speechStart,
        speechEnd: selectedAudio.speechEnd,
        speechDuration: selectedAudio.speechDuration
      }] : []
    };
  });

  return {
    groups,
    bgmItems: buildVariantBgmItems(uploadedGlobalAudios, variantIndex),
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
    variantIndex,
    outputMediaUrl: input.outputMediaUrl,
    dryRun: input.dryRun
  };
}

function buildVariantBgmItems(audios: AliyunMixAudioItem[], variantIndex: number) {
  if (audios.length === 0) return [];
  const selected = audios[Math.max(0, variantIndex) % audios.length];
  return [{
    id: selected.id,
    name: selected.name,
    duration: selected.duration,
    volume: selected.volume,
    mediaUrl: selected.path || '',
    usageType: inferAliyunMixAudioUsageType(selected, 'global'),
    matchKey: buildAliyunMixMatchKey(selected.name),
    speechStart: selected.speechStart,
    speechEnd: selected.speechEnd,
    speechDuration: selected.speechDuration
  }];
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

function pickAudioCandidate<TClip extends MixClipLike, TAudio extends MixAudioLike>(input: {
  contentProfile: AliyunMixContentProfile;
  group: MixGroupLike<TClip, TAudio>;
  clip?: TClip;
  groupCandidates: MixAudioCandidate<TAudio>[];
  globalCandidates: MixAudioCandidate<TAudio>[];
  cursor: number;
  clipCount: number;
}) {
  const pools = buildAudioPriorityPools(input.contentProfile, input.groupCandidates, input.globalCandidates);
  for (const pool of pools) {
    if (pool.length === 0) continue;
    const desiredIndex = alignedPoolIndex(input.cursor, pool.length, Math.max(1, input.clipCount, pool.length));
    return pool
      .map((candidate, poolIndex) => ({ candidate, poolIndex }))
      .sort((left, right) => {
      const scoreDiff = scoreAudioCandidate(right.candidate, input.clip, input.group, input.contentProfile) - scoreAudioCandidate(left.candidate, input.clip, input.group, input.contentProfile);
      if (scoreDiff !== 0) return scoreDiff;
      const desiredDistance = circularDistance(left.poolIndex, desiredIndex, pool.length) - circularDistance(right.poolIndex, desiredIndex, pool.length);
      if (desiredDistance !== 0) return desiredDistance;
      if (left.candidate.source !== right.candidate.source) return left.candidate.source === 'group' ? -1 : 1;
      return left.candidate.originalIndex - right.candidate.originalIndex;
    })[0]?.candidate;
  }
  return undefined;
}

function buildAudioPriorityPools<TAudio extends MixAudioLike>(
  contentProfile: AliyunMixContentProfile,
  groupCandidates: MixAudioCandidate<TAudio>[],
  globalCandidates: MixAudioCandidate<TAudio>[]
) {
  const groupAi = groupCandidates.filter((candidate) => candidate.usageType === 'ai_voice');
  const globalAi = globalCandidates.filter((candidate) => candidate.usageType === 'ai_voice');
  const groupVoice = groupCandidates.filter((candidate) => candidate.usageType === 'voice');
  const globalVoice = globalCandidates.filter((candidate) => candidate.usageType === 'voice');
  const groupUnknown = groupCandidates.filter((candidate) => candidate.usageType === 'unknown');
  const globalUnknown = globalCandidates.filter((candidate) => candidate.usageType === 'unknown');
  const groupMusicLike = groupCandidates.filter((candidate) => candidate.usageType === 'music' || candidate.usageType === 'effect');
  const globalMusicLike = globalCandidates.filter((candidate) => candidate.usageType === 'music' || candidate.usageType === 'effect');

  if (contentProfile === 'digital_human') {
    return [
      [...groupAi, ...globalAi],
      [...groupVoice, ...globalVoice],
      [...groupUnknown, ...globalUnknown],
      [...groupMusicLike, ...globalMusicLike]
    ];
  }

  return [
    [...groupAi, ...groupVoice, ...groupUnknown, ...groupMusicLike],
    [...globalAi, ...globalVoice, ...globalUnknown],
    [...globalMusicLike]
  ];
}

function scoreAudioCandidate<TClip extends MixClipLike, TAudio extends MixAudioLike>(
  candidate: MixAudioCandidate<TAudio>,
  clip: TClip | undefined,
  group: MixGroupLike<TClip, TAudio>,
  contentProfile: AliyunMixContentProfile
) {
  let score = audioUsageBaseScore(candidate.usageType, contentProfile);
  if (candidate.source === 'group') score += 8;

  const audioTokens = mediaTokens(candidate.audio.name);
  const clipTokens = mediaTokens(clip?.name);
  const groupTokens = mediaTokens([group.title, group.script, group.voiceover].join(' '));
  const filteredAudioTokens = audioTokens.filter((token) => !GENERIC_MATCH_TOKENS.has(token));
  const filteredClipTokens = clipTokens.filter((token) => !GENERIC_MATCH_TOKENS.has(token));
  const filteredGroupTokens = groupTokens.filter((token) => !GENERIC_MATCH_TOKENS.has(token));

  if (mediaStem(candidate.audio.name) && mediaStem(candidate.audio.name) === mediaStem(clip?.name)) {
    score += 80;
  }

  score += intersectTokens(filteredAudioTokens, filteredClipTokens) * 16;
  score += intersectTokens(filteredAudioTokens, filteredGroupTokens) * 4;

  const audioSceneToken = firstTokenMatching(audioTokens, /^scene\d+$/i);
  const clipSceneToken = firstTokenMatching(clipTokens, /^scene\d+$/i);
  if (audioSceneToken && clipSceneToken && audioSceneToken === clipSceneToken) score += 34;

  const audioVersionToken = firstTokenMatching(audioTokens, /^v\d+$/i);
  const clipVersionToken = firstTokenMatching(clipTokens, /^v\d+$/i);
  if (audioVersionToken && clipVersionToken && audioVersionToken === clipVersionToken) score += 24;

  const audioDuration = parseDurationSeconds(candidate.audio.duration);
  const clipDuration = parseDurationSeconds(clip?.duration);
  if (audioDuration > 0 && clipDuration > 0) {
    const diff = Math.abs(audioDuration - clipDuration);
    if (diff <= 0.35) score += 18;
    else if (diff <= 1.2) score += 10;
    else if (diff <= 2.4) score += 4;
  }

  return score;
}

function audioUsageBaseScore(usageType: AliyunMixAudioUsageType, contentProfile: AliyunMixContentProfile) {
  if (contentProfile === 'digital_human') {
    if (usageType === 'ai_voice') return 120;
    if (usageType === 'voice') return 96;
    if (usageType === 'unknown') return 64;
    if (usageType === 'music') return 18;
    return 10;
  }
  if (usageType === 'ai_voice') return 90;
  if (usageType === 'voice') return 82;
  if (usageType === 'unknown') return 58;
  if (usageType === 'music') return 40;
  return 24;
}

function alignedPoolIndex(variantIndex: number, size: number, anchorSize: number) {
  if (size <= 1) return 0;
  const safeAnchor = Math.max(1, anchorSize);
  const normalized = (positiveModulo(variantIndex, safeAnchor) + 0.5) / safeAnchor;
  return Math.min(size - 1, Math.floor(normalized * size));
}

function positiveModulo(value: number, divisor: number) {
  if (divisor <= 0) return 0;
  return ((value % divisor) + divisor) % divisor;
}

function circularDistance(index: number, desiredIndex: number, size: number) {
  if (size <= 1) return 0;
  const direct = Math.abs(index - desiredIndex);
  return Math.min(direct, size - direct);
}

function intersectTokens(left: string[], right: string[]) {
  if (left.length === 0 || right.length === 0) return 0;
  const rightSet = new Set(right);
  return left.filter((token) => rightSet.has(token)).length;
}

function firstTokenMatching(tokens: string[], pattern: RegExp) {
  return tokens.find((token) => pattern.test(token));
}

function mediaStem(value?: string) {
  if (!value) return '';
  const fileName = value.split(/[\\/]/).pop() || value;
  return fileName.replace(/\.[^.]+$/, '').trim().toLowerCase();
}

function mediaTokens(value?: string) {
  const stem = mediaStem(value);
  if (!stem) return [];
  const rawTokens = stem
    .replace(/([a-zA-Z\u4e00-\u9fa5])(\d)/g, '$1 $2')
    .replace(/(\d)([a-zA-Z\u4e00-\u9fa5])/g, '$1 $2')
    .split(/[^a-zA-Z0-9\u4e00-\u9fa5]+/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(rawTokens));
}

function parseDurationSeconds(value?: string) {
  if (!value) return 0;
  const trimmed = value.trim();
  const rangeIndex = Math.max(trimmed.indexOf('-'), trimmed.indexOf('~'));
  if (rangeIndex > 0) return parseDurationSeconds(trimmed.slice(0, rangeIndex));
  const clock = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (clock) {
    const hours = clock[3] ? Number(clock[1]) : 0;
    const minutes = clock[3] ? Number(clock[2]) : Number(clock[1]);
    const seconds = Number(clock[3] || clock[2]);
    return hours * 3600 + minutes * 60 + seconds;
  }
  return Number(trimmed.replace(/[^\d.]/g, '')) || 0;
}

function resolveAudioSource<TAudio extends MixAudioLike>(candidate: MixAudioCandidate<TAudio>): AliyunMixAudioSource {
  return candidate.usageType === 'ai_voice' ? 'ai' : candidate.source;
}

export async function submitAliyunMix(request: AliyunMixRequest) {
  const response = await http.post<unknown, { data: AliyunMixResponse }>('/fission/aliyun-mix/submit', request);
  return response.data;
}

export async function getAliyunMixJobStatus(jobId: string) {
  const response = await http.get<unknown, { data: AliyunMixJobStatus }>(`/fission/aliyun-mix/jobs/${encodeURIComponent(jobId)}`);
  return response.data;
}

export async function submitViralSubtitleRecognition(input: { mediaUrl: string; title?: string; duration?: string; startTime?: string }) {
  const response = await http.post<typeof input, { data: ViralSubtitleJob }>('/viral/subtitles/recognize', input);
  return response.data;
}

export async function getViralSubtitleJob(jobId: string) {
  const response = await http.get<unknown, { data: ViralSubtitleJob }>(`/viral/subtitles/jobs/${encodeURIComponent(jobId)}`);
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

function isUsableCloudMedia(media?: { path?: string; uploadStatus?: string }) {
  if (!isCloudMediaUrl(media?.path)) return false;
  return media?.uploadStatus !== 'uploading' && media?.uploadStatus !== 'failed' && media?.uploadStatus !== 'local';
}
