import type { ScriptPackage } from '../pages/viralDirectorModel'

export const MOYA_PENDING_FISSION_DRAFT_KEY = 'moya:fission:pending-draft'
export const MOYA_WORKSPACE_DRAFT_KEY = 'moya:fission:workspace-draft'
export const MOYA_FINISHED_VIDEOS_KEY = 'moya:fission:finished-videos'
export const MOYA_PRODUCT_VIDEO_TASKS_KEY = 'moya:fission:product-video-tasks'
export const MOYA_EDITOR_FISSION_WORKSPACE_KEY = 'editor:fission-workspace-draft'
export const MOYA_EDITOR_FISSION_DRAFT_LIBRARY_KEY = 'editor:fission-draft-library'
export const MOYA_EDITOR_ACTIVE_FISSION_DRAFT_ID_KEY = 'editor:fission-active-draft-id'

export type MoyaMediaAsset = {
  id: string
  name: string
  duration: number
  mediaUrl?: string
  localPath?: string
  matchKey?: string
}

export type MoyaAudioAsset = MoyaMediaAsset & {
  volume?: number
  usageType?: 'voiceover' | 'bgm' | 'effect'
  speechStart?: number
  speechEnd?: number
  speechDuration?: number
}

export type FissionShotGroup = {
  id: string
  sceneNo: string
  title: string
  duration: number
  script: string
  voiceover: string
  contentProfile: {
    shotType: string
    subject: string
    goal: string
    onscreenText: string
  }
  clips: MoyaMediaAsset[]
  groupAudios: MoyaAudioAsset[]
}

export type FissionWorkspaceDraft = {
  id: string
  title: string
  sourceScriptId?: string
  updatedAt: string
  groups: FissionShotGroup[]
  audioItems: MoyaAudioAsset[]
  bgmItems: MoyaAudioAsset[]
  settings: {
    ratio: '9:16' | '16:9' | '1:1'
    variantCount: number
    outputPrefix: string
  }
}

export type FissionFinishedVideo = {
  id: string
  title: string
  createdAt: string
  sourceDraftId: string
  outputPath?: string
  outputMediaUrl?: string
  jobId?: string
  status: 'local' | 'submitted' | 'finished' | 'failed'
}

export type ProductVideoTask = {
  taskId: string
  groupId: string
  groupTitle: string
  createdAt: string
  status: string
  videoUrl?: string
  prompt?: string
  finished?: boolean
  successful?: boolean
  message?: string
}

export type FissionCombinationVariant = {
  index: number
  title: string
  clips: Array<MoyaMediaAsset & { groupId: string; groupTitle: string; duration: number }>
}

export type AliyunMixRequest = {
  groups: unknown[]
  audioItems?: unknown[]
  bgmItems?: unknown[]
  settings?: Record<string, unknown>
  variantIndex: number
  outputMediaUrl: string
  dryRun?: boolean
}

export function buildFissionDraftFromScriptPackage(scriptPackage: ScriptPackage): FissionWorkspaceDraft {
  const groups = scriptPackage.directorScript.segments.map((segment, index): FissionShotGroup => {
    const clips = segment.assetRefs
      .filter((asset) => asset.assetType === 'video')
      .map((asset): MoyaMediaAsset => ({
        id: asset.assetId,
        name: asset.name,
        duration: segment.durationSec,
        mediaUrl: asset.url,
        matchKey: segment.segmentId,
      }))
    const groupAudios = segment.assetRefs
      .filter((asset) => asset.assetType === 'audio')
      .map((asset): MoyaAudioAsset => ({
        id: asset.assetId,
        name: asset.name,
        duration: segment.durationSec,
        mediaUrl: asset.url,
        matchKey: segment.segmentId,
        usageType: 'voiceover',
        volume: 1,
      }))

    return {
      id: segment.segmentId,
      sceneNo: String(index + 1).padStart(2, '0'),
      title: segment.segmentTitle || segment.groupLabel || `镜头 ${index + 1}`,
      duration: segment.durationSec,
      script: segment.visualDescription,
      voiceover: segment.voiceoverText,
      contentProfile: {
        shotType: segment.shotType,
        subject: segment.subject,
        goal: segment.goal,
        onscreenText: segment.onscreenText,
      },
      clips,
      groupAudios,
    }
  })

  return {
    id: `fission_${scriptPackage.directorScript.scriptId}_${Date.now()}`,
    title: scriptPackage.directorScript.title,
    sourceScriptId: scriptPackage.directorScript.scriptId,
    updatedAt: new Date().toISOString(),
    groups,
    audioItems: groups.flatMap((group) => group.groupAudios),
    bgmItems: [],
    settings: {
      ratio: '9:16',
      variantCount: 1,
      outputPrefix: 'moya-drive/fission/outputs',
    },
  }
}

export function buildCombinationVariants(draft: FissionWorkspaceDraft, limit = 12): FissionCombinationVariant[] {
  const groupsWithClips = draft.groups.filter((group) => group.clips.length > 0)
  if (!groupsWithClips.length) return []

  const variants: FissionCombinationVariant[] = []
  const cursor = new Array(groupsWithClips.length).fill(0)
  const counts = groupsWithClips.map((group) => group.clips.length)
  const total = counts.reduce((value, count) => value * Math.max(1, count), 1)
  const max = Math.min(limit, total)

  for (let variantIndex = 0; variantIndex < max; variantIndex += 1) {
    const clips = groupsWithClips.map((group, groupIndex) => ({
      ...group.clips[cursor[groupIndex]],
      groupId: group.id,
      groupTitle: group.title,
      duration: group.duration,
    }))
    variants.push({
      index: variantIndex,
      title: `组合 ${String(variantIndex + 1).padStart(2, '0')}`,
      clips,
    })

    for (let index = cursor.length - 1; index >= 0; index -= 1) {
      cursor[index] += 1
      if (cursor[index] < counts[index]) break
      cursor[index] = 0
    }
  }

  return variants
}
