import type { AliyunMixRequest, FissionFinishedVideo, FissionWorkspaceDraft, MoyaAudioAsset, MoyaMediaAsset, ProductVideoTask } from './fissionTypes'
import {
  MOYA_EDITOR_ACTIVE_FISSION_DRAFT_ID_KEY,
  MOYA_EDITOR_FISSION_DRAFT_LIBRARY_KEY,
  MOYA_EDITOR_FISSION_WORKSPACE_KEY,
  MOYA_FINISHED_VIDEOS_KEY,
  MOYA_PENDING_FISSION_DRAFT_KEY,
  MOYA_PRODUCT_VIDEO_TASKS_KEY,
  MOYA_WORKSPACE_DRAFT_KEY,
} from './fissionTypes'

type ApiRequest = {
  method?: string
  url: string
  data?: unknown
  headers?: Record<string, string>
}

type MoyaApiEnvelope<T> = {
  success?: boolean
  code?: string
  message?: string
  data?: T
}

type OpenFilesOptions = {
  title?: string
  filters?: Array<{ name: string; extensions: string[] }>
  properties?: string[]
}

type MediaProbe = {
  duration?: number
  width?: number
  height?: number
  hasVideo?: boolean
  hasAudio?: boolean
}

export async function getMoyaStore<T>(key: string, fallback: T): Promise<T> {
  if (window.surgicol?.store?.get) {
    const value = await window.surgicol.store.get<T>(key)
    return value ?? fallback
  }
  const raw = window.localStorage.getItem(key)
  return raw ? (JSON.parse(raw) as T) : fallback
}

export async function setMoyaStore(key: string, value: unknown) {
  if (window.surgicol?.store?.set) {
    await window.surgicol.store.set(key, value)
    return
  }
  window.localStorage.setItem(key, JSON.stringify(value))
}

function toMoyaEditorFissionDraft(draft: FissionWorkspaceDraft) {
  const groups = draft.groups.map((group, index) => {
    const sceneNo = Number(group.sceneNo) || index + 1
    const clips = group.clips.map((clip) => ({
      id: clip.id,
      name: clip.name,
      duration: formatDurationText(clip.duration || group.duration),
      coverTone: 'cool',
      path: clip.mediaUrl,
      localPath: clip.localPath,
      uploadStatus: clip.mediaUrl ? 'uploaded' : clip.localPath ? 'local' : undefined,
    }))
    const groupAudios = group.groupAudios.map((audio) => ({
      id: audio.id,
      name: audio.name,
      duration: formatDurationText(audio.duration || group.duration),
      volume: audio.volume ?? 1,
      usageType: audio.usageType === 'voiceover' ? 'voice' : audio.usageType,
      path: audio.mediaUrl,
      localPath: audio.localPath,
      uploadStatus: audio.mediaUrl ? 'uploaded' : audio.localPath ? 'local' : undefined,
      speechStart: audio.speechStart,
      speechEnd: audio.speechEnd,
      speechDuration: audio.speechDuration,
    }))

    return {
      id: group.id,
      sceneNo,
      title: group.title,
      displayTitle: group.title,
      sourceFormat: 'json',
      sourceDocumentTitle: draft.title,
      count: Math.max(1, clips.length),
      duration: formatDurationText(group.duration),
      script: group.script,
      voiceover: group.voiceover,
      clips,
      groupAudios,
    }
  })
  const selectedClipIdsByGroup = Object.fromEntries(groups.map((group) => [group.id, group.clips.map((clip) => clip.id)]))
  const bgmItems = draft.bgmItems.map((audio) => ({
    id: audio.id,
    name: audio.name,
    duration: formatDurationText(audio.duration),
    volume: audio.volume ?? 1,
    usageType: 'music',
    path: audio.mediaUrl,
    localPath: audio.localPath,
    uploadStatus: audio.mediaUrl ? 'uploaded' : audio.localPath ? 'local' : undefined,
  }))

  return {
    groups,
    audioItems: [
      ...groups.flatMap((group) => group.groupAudios),
      ...bgmItems,
    ],
    activeGroupId: groups[0]?.id,
    expandedIds: groups.map((group) => group.id),
    selectedClipIdsByGroup,
    comboMode: 'single',
    mixBatchCount: draft.settings.variantCount || 1,
    activeSettingsTab: 'group',
    soundSettings: {
      followAudioSpeed: true,
      retainOriginalAudio: true,
      ducking: true,
      fadeInOut: true,
      volume: 1,
      maskSubtitles: false,
    },
  }
}

function formatDurationText(value: number | string | undefined) {
  const duration = Number(value || 0)
  if (!Number.isFinite(duration) || duration <= 0) return '3.00s'
  return `${duration.toFixed(2)}s`
}

export async function savePendingFissionDraft(draft: FissionWorkspaceDraft) {
  const editorDraft = toMoyaEditorFissionDraft(draft)
  const storedDraft = {
    id: draft.id,
    name: draft.title,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    workflow: 'fission',
    snapshot: editorDraft,
  }
  await setMoyaStore(MOYA_PENDING_FISSION_DRAFT_KEY, draft)
  await setMoyaStore(MOYA_WORKSPACE_DRAFT_KEY, draft)
  await setMoyaStore(MOYA_EDITOR_FISSION_WORKSPACE_KEY, editorDraft)
  await setMoyaStore(MOYA_EDITOR_ACTIVE_FISSION_DRAFT_ID_KEY, draft.id)
  await setMoyaStore(MOYA_EDITOR_FISSION_DRAFT_LIBRARY_KEY, [storedDraft])
}

export async function loadWorkspaceDraft() {
  const current = await getMoyaStore<FissionWorkspaceDraft | null>(MOYA_WORKSPACE_DRAFT_KEY, null)
  if (current) return current
  return getMoyaStore<FissionWorkspaceDraft | null>(MOYA_PENDING_FISSION_DRAFT_KEY, null)
}

export async function saveWorkspaceDraft(draft: FissionWorkspaceDraft) {
  await setMoyaStore(MOYA_WORKSPACE_DRAFT_KEY, {
    ...draft,
    updatedAt: new Date().toISOString(),
  })
}

export async function listFinishedVideos() {
  return getMoyaStore<FissionFinishedVideo[]>(MOYA_FINISHED_VIDEOS_KEY, [])
}

export async function saveFinishedVideos(videos: FissionFinishedVideo[]) {
  await setMoyaStore(MOYA_FINISHED_VIDEOS_KEY, videos)
}

export async function listProductVideoTasks() {
  return getMoyaStore<ProductVideoTask[]>(MOYA_PRODUCT_VIDEO_TASKS_KEY, [])
}

export async function saveProductVideoTasks(tasks: ProductVideoTask[]) {
  await setMoyaStore(MOYA_PRODUCT_VIDEO_TASKS_KEY, tasks)
}

export async function requestProductVideo(groupId: string, draft: FissionWorkspaceDraft) {
  const group = draft.groups.find((item) => item.id === groupId)
  if (!group) throw new Error('镜头分组不存在')
  return requestMoyaApi<{ taskId?: string; status?: string; prompt?: string }>({
    method: 'POST',
    url: '/product-video/generate',
    data: {
      scenario: group.title || group.script,
      description: [group.script, group.voiceover].filter(Boolean).join('\n'),
      scriptEnabled: Boolean(group.voiceover),
      quality: 'standard',
      ratio: draft.settings.ratio,
      duration: String(Math.max(1, Math.round(group.duration || 5))),
      model: 'wanx2.1-t2v-plus',
    },
  })
}

export async function getProductVideoTaskStatus(taskId: string) {
  return requestMoyaApi<{
    taskId: string
    status: string
    videoUrl?: string
    finished?: boolean
    successful?: boolean
    message?: string
  }>({
    method: 'GET',
    url: `/product-video/tasks/${encodeURIComponent(taskId)}`,
  })
}

export async function submitAliyunMix(request: AliyunMixRequest) {
  return requestMoyaApi<{ jobId?: string; outputMediaUrl?: string }>({
    method: 'POST',
    url: '/fission/aliyun-mix/submit',
    data: request,
  })
}

export async function getOssConfig() {
  return requestMoyaApi<{
    enabled: boolean
    endpoint: string
    bucket: string
    rootPrefix: string
    outputPrefix: string
  }>({
    method: 'GET',
    url: '/storage/oss-config',
  })
}

export function buildAliyunMixRequest(draft: FissionWorkspaceDraft, variantIndex: number, bucket = 'moya-mix-matrix'): AliyunMixRequest {
  return {
    groups: draft.groups.map((group) => ({
      id: group.id,
      sceneNo: Number(group.sceneNo) || 0,
      title: group.title,
      duration: String(Math.max(0.1, group.duration || 0)),
      script: group.script,
      voiceover: group.voiceover,
      contentProfile: JSON.stringify(group.contentProfile),
      clips: group.clips.filter(hasMediaUrl).map(serializeVideoAsset),
      groupAudios: group.groupAudios.filter(hasMediaUrl).map(serializeAudioAsset),
    })).filter((group) => group.clips.length > 0),
    audioItems: draft.audioItems.filter(hasMediaUrl).map(serializeAudioAsset),
    bgmItems: draft.bgmItems.filter(hasMediaUrl).map(serializeAudioAsset),
    settings: {
      followAudioSpeed: true,
      retainOriginalAudio: true,
      ducking: true,
      fadeInOut: true,
      volume: 100,
      maskSubtitles: false,
      width: draft.settings.ratio === '16:9' ? 1280 : 720,
      height: draft.settings.ratio === '16:9' ? 720 : 1280,
      bitrate: 6000,
    },
    variantIndex,
    outputMediaUrl: buildOutputMediaUrl(draft, variantIndex, bucket),
  }
}

function serializeVideoAsset(asset: MoyaMediaAsset) {
  return {
    id: asset.id,
    name: asset.name,
    duration: String(Math.max(0.1, asset.duration || 0)),
    mediaUrl: asset.mediaUrl || '',
    matchKey: asset.matchKey,
  }
}

function serializeAudioAsset(asset: MoyaAudioAsset) {
  return {
    id: asset.id,
    name: asset.name,
    duration: String(Math.max(0.1, asset.duration || 0)),
    volume: Math.round((asset.volume ?? 1) * 100),
    mediaUrl: asset.mediaUrl || '',
    usageType: asset.usageType || 'voiceover',
    matchKey: asset.matchKey,
    speechStart: asset.speechStart,
    speechEnd: asset.speechEnd,
    speechDuration: asset.speechDuration,
  }
}

function hasMediaUrl(asset: MoyaMediaAsset) {
  return Boolean(asset.mediaUrl)
}

function buildOutputMediaUrl(draft: FissionWorkspaceDraft, variantIndex: number, bucket: string) {
  const prefix = draft.settings.outputPrefix.replace(/^\/+/, '').replace(/\/+$/, '') || 'moya-drive/fission/outputs'
  return `oss://${bucket}/${prefix}/${draft.id}-${String(variantIndex + 1).padStart(2, '0')}-${Date.now()}.mp4`
}

async function requestMoyaApi<T>(request: ApiRequest) {
  if (window.surgicol?.app?.requestApi) {
    const response = await window.surgicol.app.requestApi(request)
    return unwrapMoyaApiResponse<T>(response.status, response.data as MoyaApiEnvelope<T> | T | null)
  }
  const baseUrl = window.surgicol?.app?.apiBaseUrl || 'http://127.0.0.1:8081/api'
  const response = await fetch(new URL(request.url.replace(/^\/+/, ''), `${baseUrl}/`), {
    method: request.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(request.headers || {}),
    },
    body: request.data === undefined ? undefined : JSON.stringify(request.data),
  })
  const text = await response.text()
  const data = text ? JSON.parse(text) as MoyaApiEnvelope<T> | T : null
  return unwrapMoyaApiResponse<T>(response.status, data)
}

function unwrapMoyaApiResponse<T>(status: number, payload: MoyaApiEnvelope<T> | T | null): T {
  if (status >= 400) {
    const message = payload && typeof payload === 'object' && 'message' in payload ? payload.message : ''
    throw new Error(message || `Moya API 请求失败：${status}`)
  }
  if (payload && typeof payload === 'object' && 'success' in payload) {
    if (payload.success === false) throw new Error(payload.message || payload.code || 'Moya API 请求失败')
    return payload.data as T
  }
  return payload as T
}
