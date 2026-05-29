import {
  isPresenterVoiceLikeUsage,
  normalizePresenterSpeechWindow,
  parsePresenterDurationSeconds
} from './fissionPresenterMixAlgorithm';
import type { FissionMixAudioSource, FissionMixAudioUsageType, FissionMixSelectionProfile } from './fissionMixMatcher';
import { resolveFissionMixVariantStyle, selectFissionMixVariantMedia } from './fissionMixMatcher';
import {
  buildWaterfallMixSelections,
  type WaterfallClipAudioContinuityEdge,
  type WaterfallClipAudioContinuityProfile
} from './fissionWaterfallComposer';

export interface LocalFissionMixClipLike {
  id: string;
  name: string;
  duration: string;
  path?: string;
  localPath?: string;
  audioContinuity?: WaterfallClipAudioContinuityProfile;
}

export interface LocalFissionMixAudioLike {
  id: string;
  name: string;
  duration: string;
  volume: number;
  path?: string;
  localPath?: string;
  usageType?: FissionMixAudioUsageType;
  speechStart?: number;
  speechEnd?: number;
  speechDuration?: number;
}

export interface LocalFissionMixGroupLike<
  TClip extends LocalFissionMixClipLike = LocalFissionMixClipLike,
  TAudio extends LocalFissionMixAudioLike = LocalFissionMixAudioLike
> {
  id: string;
  sceneNo: number;
  title: string;
  duration: string;
  script: string;
  voiceover: string;
  clips: TClip[];
  groupAudios?: TAudio[];
}

export interface LocalFissionMixSettings {
  followAudioSpeed: boolean;
  retainOriginalAudio: boolean;
  ducking: boolean;
  fadeInOut: boolean;
  volume: number;
  maskSubtitles: boolean;
  compositionMode?: 'segments' | 'waterfall';
  width?: number;
  height?: number;
  bitrate?: number;
  fps?: number;
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
  contentProfile: FissionMixSelectionProfile;
  audioSelectionSource?: FissionMixAudioSource;
  audioUsageType?: FissionMixAudioUsageType;
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
  usageType?: FissionMixAudioUsageType;
}

export interface LocalFissionMixGroupDetail {
  groupId: string;
  groupName: string;
  clipName?: string;
  audioName?: string;
  audioSource?: FissionMixAudioSource;
  contentProfile?: FissionMixSelectionProfile;
  coverPath?: string;
}

export interface LocalFissionMixVariantPlan {
  scenes: LocalFissionMixScene[];
  bgmTracks: LocalFissionMixBackgroundTrack[];
  narrationSegments: LocalFissionMixNarrationSegment[];
  details: LocalFissionMixGroupDetail[];
  durationSeconds: number;
  audioNames: string;
  bgmName?: string;
  coverPath?: string;
}

type ResolvedClip<TClip extends LocalFissionMixClipLike> = TClip & {
  renderSource: string;
};

type ResolvedAudio<TAudio extends LocalFissionMixAudioLike> = TAudio & {
  renderSource: string;
};

interface ResolvedGroup<
  TClip extends LocalFissionMixClipLike,
  TAudio extends LocalFissionMixAudioLike
> {
  group: LocalFissionMixGroupLike<TClip, TAudio>;
  clips: ResolvedClip<TClip>[];
  audios: ResolvedAudio<TAudio>[];
}

const DEFAULT_SCENE_DURATION = 3;
const DEFAULT_WIDTH = 720;
const DEFAULT_HEIGHT = 1280;
const DEFAULT_BITRATE = 6000;
const DEFAULT_FPS = 30;
const WATERFALL_MIN_SCENE_DURATION = 0.72;
const WATERFALL_MAX_EDGE_TRIM = 0.14;
const WATERFALL_NARRATION_PREROLL_SECONDS = 0.09;
const WATERFALL_NARRATION_POSTROLL_SECONDS = 0.14;
const WATERFALL_NARRATION_MAX_CROSSFADE_SECONDS = 0.018;
const WATERFALL_NARRATION_MIN_BOUNDARY_GAP_SECONDS = 0.06;
const WATERFALL_NARRATION_EDGE_TRIM_LIMIT_SECONDS = 0.045;

export async function buildLocalFissionMixPlan<
  TClip extends LocalFissionMixClipLike,
  TAudio extends LocalFissionMixAudioLike
>(input: {
  groups: LocalFissionMixGroupLike<TClip, TAudio>[];
  audioItems: TAudio[];
  settings: LocalFissionMixSettings;
  variantIndex: number;
  resolveClipSource: (clip: TClip) => Promise<string | undefined> | string | undefined;
  resolveAudioSource: (audio: TAudio) => Promise<string | undefined> | string | undefined;
}): Promise<LocalFissionMixVariantPlan> {
  const resolvedGlobalAudios = await resolveAudios(dedupeAudioItems(input.audioItems), input.resolveAudioSource);
  const resolvedGroups = (await Promise.all(input.groups.map(async (group) => {
    const clips = await resolveClips(group.clips, input.resolveClipSource);
    const audios = await resolveAudios(group.groupAudios || [], input.resolveAudioSource);
    return {
      group,
      clips,
      audios
    } satisfies ResolvedGroup<TClip, TAudio>;
  }))).filter((item) => item.clips.length > 0);

  if (resolvedGroups.length === 0) {
    throw new Error('当前没有可混剪的分镜视频，请先检查分镜素材是否都可用。');
  }

  const variantStyle = resolveFissionMixVariantStyle(input.variantIndex);
  const groupSelections = input.settings.compositionMode === 'waterfall'
    ? buildWaterfallMixSelections({
      groups: resolvedGroups.map((item) => ({
        ...item.group,
        clips: item.clips,
        groupAudios: item.audios
      })),
      globalAudios: [],
      variantIndex: input.variantIndex,
      variantStyle
    })
    : resolvedGroups.map(({ group, clips, audios }, groupIndex) => {
      const selection = selectFissionMixVariantMedia({
        group,
        clips,
        groupAudios: audios,
        globalAudios: [],
        variantIndex: input.variantIndex,
        groupIndex,
        variantStyle
      });
      return {
        orderIndex: groupIndex,
        group,
        clip: selection.clip as ResolvedClip<TClip> | undefined,
        audio: selection.audio as ResolvedAudio<TAudio> | undefined,
        selectionProfile: selection.selectionProfile,
        contentProfile: selection.contentProfile,
        audioUsageType: selection.audioUsageType,
        audioSource: selection.audioSource,
        voiceLocked: selection.voiceLocked,
        voiceProfileKey: '',
        continuityLocked: false
      };
    });

  const details: LocalFissionMixGroupDetail[] = [];
  const scenes: LocalFissionMixScene[] = [];
  const narrationSegments: LocalFissionMixNarrationSegment[] = [];
  const sceneBoundaryProfiles: Array<{
    continuity?: WaterfallClipAudioContinuityProfile;
    usesEmbeddedAudio: boolean;
    usesNarrationAudio: boolean;
  }> = [];
  let durationSeconds = 0;
  let coverPath: string | undefined;

  groupSelections.forEach((selection, groupIndex) => {
    const group = selection.group as LocalFissionMixGroupLike<TClip, TAudio>;
    const clip = (selection.clip || group.clips[0]) as ResolvedClip<TClip> | undefined;
    if (!clip?.renderSource) return;
    const sceneStart = durationSeconds;
    const audio = selection.audio as ResolvedAudio<TAudio> | undefined;
    const speechWindow = audio ? normalizePresenterSpeechWindow(audio) : normalizePresenterSpeechWindow(null);
    const videoDuration = firstPositive(parseDurationSeconds(clip.duration), parseDurationSeconds(group.duration), DEFAULT_SCENE_DURATION);
    let audioDuration = audio
      ? firstPositive(speechWindow.effectiveDuration, parseDurationSeconds(audio.duration), videoDuration)
      : 0;
    const usesWaterfallNarrationAudio = Boolean(
      input.settings.compositionMode === 'waterfall'
      && audio
      && isWaterfallNarrationUsage(selection.audioUsageType)
      && audioDuration > 0
    );
    const narrationWindow = usesWaterfallNarrationAudio
      ? buildWaterfallNarrationAudioWindow(speechWindow, videoDuration, audioDuration)
      : null;
    if (narrationWindow) {
      audioDuration = narrationWindow.duration;
    }
    const lockSceneToAudio = Boolean(selection.voiceLocked && audioDuration > 0);
    let sceneDuration = (input.settings.followAudioSpeed || lockSceneToAudio) && audioDuration > 0
      ? Math.min(videoDuration, audioDuration)
      : videoDuration;
    if (usesWaterfallNarrationAudio) {
      sceneDuration = Math.min(videoDuration, Math.max(0.24, audioDuration));
    }
    let audioClipDuration = audio ? Math.min(sceneDuration, audioDuration) : 0;
    let videoIn = lockSceneToAudio
      ? clampSeconds(speechWindow.speechStart, 0, Math.max(0, videoDuration - sceneDuration))
      : 0;
    let videoOut = clampSeconds(videoIn + sceneDuration, videoIn, videoDuration);
    let audioIn = audio
      ? (
        lockSceneToAudio || usesWaterfallNarrationAudio
          ? clampSeconds(narrationWindow?.start ?? speechWindow.speechStart, 0, Math.max(0, speechWindow.rawDuration - audioClipDuration))
          : 0
      )
      : 0;
    let audioOut = audio
      ? (
        lockSceneToAudio || usesWaterfallNarrationAudio
          ? clampSeconds(narrationWindow?.end ?? audioIn + audioClipDuration, audioIn, speechWindow.rawDuration)
          : audioClipDuration
      )
      : 0;
    const videoAudioGain = determineVideoAudioGain(
      input.settings,
      Boolean(audio),
      lockSceneToAudio,
      selection.audioUsageType
    );
    const normalizedAudioGain = usesWaterfallNarrationAudio
      ? 0
      : audio
        ? normalizedVolume(audio.volume, input.settings.volume) / 100
        : 0;
    const sceneAudioSource = usesWaterfallNarrationAudio ? undefined : audio?.renderSource;
    const usesWaterfallEmbeddedAudio = Boolean(
      input.settings.compositionMode === 'waterfall'
      && !audio
      && !lockSceneToAudio
      && videoAudioGain > 0.0001
    );
    const boundaryProfile = usesWaterfallEmbeddedAudio
      ? buildWaterfallSceneBoundaryProfile(clip.audioContinuity, videoDuration)
      : usesWaterfallNarrationAudio
        ? buildWaterfallNarrationBoundaryProfile(sceneDuration, audioDuration)
        : buildDefaultSceneBoundaryProfile();
    let appliedLeadingTrim = boundaryProfile.leadingTrim;
    let appliedTrailingTrim = boundaryProfile.trailingTrim;

    if (usesWaterfallEmbeddedAudio) {
      const trimmedWindow = applyWaterfallBoundaryTrims(videoDuration, boundaryProfile.leadingTrim, boundaryProfile.trailingTrim);
      videoIn = trimmedWindow.videoIn;
      videoOut = trimmedWindow.videoOut;
      sceneDuration = trimmedWindow.sceneDuration;
      appliedLeadingTrim = trimmedWindow.videoIn;
      appliedTrailingTrim = Math.max(0, videoDuration - trimmedWindow.videoOut);
      audioClipDuration = audio ? Math.min(sceneDuration, audioDuration) : 0;
      if (audio && (lockSceneToAudio || usesWaterfallNarrationAudio)) {
        audioIn = clampSeconds(narrationWindow?.start ?? speechWindow.speechStart, 0, Math.max(0, speechWindow.rawDuration - audioClipDuration));
        audioOut = clampSeconds(narrationWindow?.end ?? audioIn + audioClipDuration, audioIn, speechWindow.rawDuration);
      }
    }

    scenes.push({
      id: `scene-${group.sceneNo || groupIndex + 1}-${clip.id}`,
      groupId: group.id,
      groupName: group.title,
      sceneNo: group.sceneNo,
      clipName: clip.name,
      audioName: audio?.name,
      videoSource: clip.renderSource,
      audioSource: sceneAudioSource,
      videoIn,
      videoOut,
      audioIn,
      audioOut,
      sceneDuration,
      audioDuration: audioClipDuration,
      audioGain: normalizedAudioGain,
      videoAudioGain,
      width: positiveOr(input.settings.width, DEFAULT_WIDTH),
      height: positiveOr(input.settings.height, DEFAULT_HEIGHT),
      bitrate: positiveOr(input.settings.bitrate, DEFAULT_BITRATE),
      fps: positiveOr(input.settings.fps, DEFAULT_FPS),
      fadeInOut: input.settings.fadeInOut,
      maskSubtitles: input.settings.maskSubtitles,
      voiceLocked: lockSceneToAudio,
      contentProfile: selection.selectionProfile,
      audioSelectionSource: selection.audioSource,
      audioUsageType: selection.audioUsageType,
      transitionMode: input.settings.compositionMode === 'waterfall' ? 'waterfall' : 'default',
      leadingTrim: appliedLeadingTrim,
      trailingTrim: appliedTrailingTrim,
      audioFadeInDuration: boundaryProfile.fadeInDuration,
      audioFadeOutDuration: boundaryProfile.fadeOutDuration
    });
    if (usesWaterfallNarrationAudio && audio?.renderSource && audioClipDuration > 0.02) {
      narrationSegments.push({
        id: `narration-${group.id}-${clip.id}-${groupIndex}`,
        sceneId: `scene-${group.sceneNo || groupIndex + 1}-${clip.id}`,
        groupId: group.id,
        groupName: group.title,
        name: audio.name,
        source: audio.renderSource,
        audioIn,
        audioOut,
        timelineIn: sceneStart,
        timelineOut: sceneStart + audioClipDuration,
        gain: normalizedVolume(audio.volume, input.settings.volume) / 100,
        fadeInDuration: boundaryProfile.fadeInDuration,
        fadeOutDuration: boundaryProfile.fadeOutDuration,
        usageType: selection.audioUsageType
      });
    }
    sceneBoundaryProfiles.push({
      continuity: clip.audioContinuity,
      usesEmbeddedAudio: usesWaterfallEmbeddedAudio,
      usesNarrationAudio: usesWaterfallNarrationAudio
    });
    details.push({
      groupId: group.id,
      groupName: group.title,
      clipName: clip.name,
      audioName: audio?.name,
      audioSource: selection.audioSource,
      contentProfile: selection.selectionProfile,
      coverPath: clip.localPath || clip.path
    });
    coverPath ||= clip.localPath || clip.path;
    durationSeconds += sceneDuration;
  });

  if (scenes.length === 0) {
    throw new Error('当前分镜没有生成出可渲染的本地混剪方案，请检查视频和音频路径是否可访问。');
  }

  applyWaterfallBoundaryPairing(scenes, sceneBoundaryProfiles);
  applyWaterfallNarrationSegmentPairing(narrationSegments);

  const selectedBgm = selectVariantBackgroundAudio(resolvedGlobalAudios, input.variantIndex);

  return {
    scenes,
    bgmTracks: selectedBgm ? [{
      id: selectedBgm.id,
      name: selectedBgm.name,
      source: selectedBgm.renderSource,
      duration: firstPositive(parseDurationSeconds(selectedBgm.duration), DEFAULT_SCENE_DURATION),
      gain: normalizedVolume(selectedBgm.volume, input.settings.volume) / 100,
      fadeInOut: input.settings.fadeInOut
    }] : [],
    narrationSegments,
    details,
    durationSeconds,
    audioNames: Array.from(new Set(details.map((detail) => detail.audioName).filter((name): name is string => Boolean(name)))).slice(0, 4).join(' / '),
    bgmName: selectedBgm?.name,
    coverPath
  };
}

export function estimateLocalFissionMixDuration(plan: Pick<LocalFissionMixVariantPlan, 'durationSeconds'>) {
  return Math.max(0, Number(plan.durationSeconds) || 0);
}

function determineVideoAudioGain(
  settings: LocalFissionMixSettings,
  hasExternalAudio: boolean,
  voiceLocked: boolean,
  audioUsageType?: FissionMixAudioUsageType
) {
  if (!settings.retainOriginalAudio || voiceLocked) return 0;
  if (settings.compositionMode === 'waterfall' && hasExternalAudio) {
    if (isWaterfallNarrationUsage(audioUsageType)) return 0;
    if (settings.ducking) return 0.08;
    return 0.18;
  }
  if (settings.ducking && hasExternalAudio) return 0.2;
  return 1;
}

async function resolveClips<TClip extends LocalFissionMixClipLike>(
  clips: TClip[],
  resolver: (clip: TClip) => Promise<string | undefined> | string | undefined
) {
  const resolved: Array<ResolvedClip<TClip> | null> = await Promise.all(clips.map(async (clip) => {
    const renderSource = await resolver(clip);
    if (!renderSource) return null;
    return {
      ...clip,
      renderSource
    };
  }));
  return resolved.filter((clip): clip is ResolvedClip<TClip> => Boolean(clip));
}

async function resolveAudios<TAudio extends LocalFissionMixAudioLike>(
  audios: TAudio[],
  resolver: (audio: TAudio) => Promise<string | undefined> | string | undefined
) {
  const resolved: Array<ResolvedAudio<TAudio> | null> = await Promise.all(audios.map(async (audio) => {
    const renderSource = await resolver(audio);
    if (!renderSource) return null;
    return {
      ...audio,
      renderSource
    };
  }));
  return resolved.filter((audio): audio is ResolvedAudio<TAudio> => Boolean(audio));
}

function dedupeAudioItems<TAudio extends LocalFissionMixAudioLike>(audios: TAudio[]) {
  const seen = new Set<string>();
  return audios.filter((audio) => {
    const key = audio.localPath || audio.path || audio.id;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function selectVariantBackgroundAudio<TAudio extends LocalFissionMixAudioLike>(audios: ResolvedAudio<TAudio>[], variantIndex: number) {
  if (audios.length === 0) return undefined;
  return audios[Math.max(0, variantIndex) % audios.length];
}

function parseDurationSeconds(value?: string) {
  return parsePresenterDurationSeconds(value);
}

function normalizedVolume(itemVolume?: number, settingsVolume?: number) {
  const base = positiveOr(settingsVolume, 100);
  const item = positiveOr(itemVolume, 100);
  return Math.max(0, Math.min(100, Math.round(base * item / 100)));
}

function firstPositive(...values: number[]) {
  return values.find((value) => value > 0) || 0;
}

function positiveOr(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function clampSeconds(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function buildDefaultSceneBoundaryProfile() {
  return {
    leadingTrim: 0,
    trailingTrim: 0,
    fadeInDuration: 0,
    fadeOutDuration: 0
  };
}

function buildWaterfallNarrationAudioWindow(
  speechWindow: ReturnType<typeof normalizePresenterSpeechWindow>,
  videoDuration: number,
  fallbackDuration: number
) {
  const rawDuration = firstPositive(speechWindow.rawDuration, fallbackDuration, videoDuration);
  if (!(rawDuration > 0)) return null;

  const speechStart = speechWindow.hasSpeech ? speechWindow.speechStart : 0;
  const speechEnd = speechWindow.hasSpeech
    ? speechWindow.speechEnd
    : firstPositive(speechWindow.effectiveDuration, fallbackDuration, rawDuration);
  const safeSpeechStart = clampSeconds(speechStart, 0, rawDuration);
  const safeSpeechEnd = clampSeconds(speechEnd, safeSpeechStart + 0.02, rawDuration);
  const preroll = Math.min(WATERFALL_NARRATION_PREROLL_SECONDS, safeSpeechStart);
  const postroll = Math.min(WATERFALL_NARRATION_POSTROLL_SECONDS, Math.max(0, rawDuration - safeSpeechEnd));
  let start = clampSeconds(safeSpeechStart - preroll, 0, rawDuration);
  let end = clampSeconds(safeSpeechEnd + postroll, start + 0.02, rawDuration);
  const maxWindowDuration = firstPositive(videoDuration, fallbackDuration, rawDuration);

  if (maxWindowDuration > 0 && end - start > maxWindowDuration) {
    let overflow = end - start - maxWindowDuration;
    const postTrim = Math.min(postroll, overflow);
    end -= postTrim;
    overflow -= postTrim;
    if (overflow > 0) {
      start += Math.min(preroll, overflow);
    }
  }

  return {
    start,
    end,
    duration: Math.max(0.02, end - start)
  };
}

function buildWaterfallNarrationBoundaryProfile(sceneDuration: number, audioDuration: number) {
  const targetDuration = firstPositive(audioDuration, sceneDuration, DEFAULT_SCENE_DURATION);
  const fadeDuration = clampSeconds(
    Math.min(0.018, Math.max(0.01, targetDuration / 160)),
    0.008,
    0.018
  );
  return {
    leadingTrim: 0,
    trailingTrim: 0,
    fadeInDuration: fadeDuration,
    fadeOutDuration: fadeDuration
  };
}

function buildWaterfallSceneBoundaryProfile(
  continuity: WaterfallClipAudioContinuityProfile | undefined,
  clipDuration: number
) {
  if (!continuity?.hasAudio) {
    return {
      leadingTrim: 0,
      trailingTrim: 0,
      fadeInDuration: Math.min(0.035, Math.max(0.016, clipDuration / 90)),
      fadeOutDuration: Math.min(0.035, Math.max(0.016, clipDuration / 90))
    };
  }
  const leadingTrim = computeWaterfallBoundaryTrim(continuity.head, 'head');
  const trailingTrim = computeWaterfallBoundaryTrim(continuity.tail, 'tail');
  return {
    leadingTrim,
    trailingTrim,
    fadeInDuration: computeWaterfallBoundaryFadeDuration(continuity.head, 'head', clipDuration, leadingTrim),
    fadeOutDuration: computeWaterfallBoundaryFadeDuration(continuity.tail, 'tail', clipDuration, trailingTrim)
  };
}

function computeWaterfallBoundaryTrim(
  edge: WaterfallClipAudioContinuityEdge | undefined,
  side: 'head' | 'tail'
) {
  if (!edge) return 0;
  const rawSilence = Math.max(0, side === 'head' ? Number(edge.leadingSilence) || 0 : Number(edge.trailingSilence) || 0);
  if (!(rawSilence > 0.012)) return 0;

  const quietEnough = edge.silenceRatio >= 0.18 || edge.activeRatio <= 0.62 || normalizeContinuityDb(edge.meanVolumeDb) <= -28;
  const hotEdge = edge.activeRatio >= 0.82 && normalizeContinuityDb(edge.meanVolumeDb) >= -22;
  let trim = quietEnough ? rawSilence * 0.82 : rawSilence * 0.28;
  if (hotEdge) trim *= 0.55;
  if (rawSilence > 0.1) trim = Math.max(trim, rawSilence - 0.018);
  return clampSeconds(trim, 0, WATERFALL_MAX_EDGE_TRIM);
}

function computeWaterfallBoundaryFadeDuration(
  edge: WaterfallClipAudioContinuityEdge | undefined,
  side: 'head' | 'tail',
  clipDuration: number,
  trimSeconds: number
) {
  const silence = edge
    ? Math.max(0, side === 'head' ? Number(edge.leadingSilence) || 0 : Number(edge.trailingSilence) || 0)
    : 0;
  const meanVolume = normalizeContinuityDb(edge?.meanVolumeDb ?? -36);
  const activeRatio = clampRatio(edge?.activeRatio ?? 0.36);
  const hotness = clampRatio(
    activeRatio * 0.55
    + normalizeContinuityUnit(meanVolume, -42, -18) * 0.3
    + normalizeContinuityUnit(edge?.peakVolumeDb ?? -20, -24, -5) * 0.15
  );
  const base = 0.018 + hotness * 0.045;
  const trimBonus = Math.min(0.02, trimSeconds * 0.45);
  const silenceBonus = Math.min(0.018, silence * 0.18);
  return clampSeconds(base + trimBonus + silenceBonus, 0.014, Math.min(0.11, Math.max(0.022, clipDuration / 4)));
}

function applyWaterfallBoundaryTrims(videoDuration: number, leadingTrim: number, trailingTrim: number) {
  const maxTotalTrim = Math.max(0, Math.min(
    WATERFALL_MAX_EDGE_TRIM * 1.6,
    videoDuration - WATERFALL_MIN_SCENE_DURATION
  ));
  let safeLeadingTrim = clampSeconds(leadingTrim, 0, WATERFALL_MAX_EDGE_TRIM);
  let safeTrailingTrim = clampSeconds(trailingTrim, 0, WATERFALL_MAX_EDGE_TRIM);
  const requestedTotal = safeLeadingTrim + safeTrailingTrim;
  if (requestedTotal > maxTotalTrim && requestedTotal > 0) {
    const scale = maxTotalTrim / requestedTotal;
    safeLeadingTrim *= scale;
    safeTrailingTrim *= scale;
  }
  const videoIn = clampSeconds(safeLeadingTrim, 0, Math.max(0, videoDuration - 0.12));
  const videoOut = clampSeconds(videoDuration - safeTrailingTrim, videoIn + 0.12, videoDuration);
  return {
    videoIn,
    videoOut,
    sceneDuration: Math.max(0.12, videoOut - videoIn)
  };
}

function applyWaterfallBoundaryPairing(
  scenes: LocalFissionMixScene[],
  boundaries: Array<{
    continuity?: WaterfallClipAudioContinuityProfile;
    usesEmbeddedAudio: boolean;
    usesNarrationAudio: boolean;
  }>
) {
  for (let index = 1; index < scenes.length; index += 1) {
    const leftMeta = boundaries[index - 1];
    const rightMeta = boundaries[index];
    const leftScene = scenes[index - 1];
    const rightScene = scenes[index];

    if (leftMeta?.usesNarrationAudio && rightMeta?.usesNarrationAudio && isWaterfallNarrationScene(leftScene) && isWaterfallNarrationScene(rightScene)) {
      const pairFade = clampSeconds(
        0.022 + Math.min(0.01, Math.abs((leftScene.audioDuration || 0) - (rightScene.audioDuration || 0)) * 0.006),
        0.018,
        WATERFALL_NARRATION_MAX_CROSSFADE_SECONDS
      );
      leftScene.audioFadeOutDuration = Math.max(
        leftScene.audioFadeOutDuration || 0,
        Math.min(pairFade, Math.max(0.024, leftScene.audioDuration / 4 || leftScene.sceneDuration / 5))
      );
      rightScene.audioFadeInDuration = Math.max(
        rightScene.audioFadeInDuration || 0,
        Math.min(pairFade, Math.max(0.024, rightScene.audioDuration / 4 || rightScene.sceneDuration / 5))
      );
      continue;
    }

    if (!leftMeta?.usesEmbeddedAudio || !rightMeta?.usesEmbeddedAudio) continue;

    const leftTail = leftMeta.continuity?.tail;
    const rightHead = rightMeta.continuity?.head;
    const pairHotness = Math.max(
      computeBoundaryEdgeHotness(leftTail, 'tail'),
      computeBoundaryEdgeHotness(rightHead, 'head')
    );
    const handle = boundaryHandleSeconds(leftTail, 'tail') + boundaryHandleSeconds(rightHead, 'head');
    const meanDiff = Math.abs(normalizeContinuityDb(leftTail?.meanVolumeDb ?? -36) - normalizeContinuityDb(rightHead?.meanVolumeDb ?? -36));
    const activeDiff = Math.abs(clampRatio(leftTail?.activeRatio ?? 0.5) - clampRatio(rightHead?.activeRatio ?? 0.5));
    const pairFade = clampSeconds(
      0.022
      + pairHotness * 0.05
      + Math.min(0.018, handle * 0.2)
      + Math.min(0.014, activeDiff * 0.03)
      + (meanDiff > 5.5 ? 0.01 : 0),
      0.018,
      0.11
    );

    scenes[index - 1].audioFadeOutDuration = Math.max(
      scenes[index - 1].audioFadeOutDuration || 0,
      Math.min(pairFade, Math.max(0.016, scenes[index - 1].sceneDuration / 3))
    );
    scenes[index].audioFadeInDuration = Math.max(
      scenes[index].audioFadeInDuration || 0,
      Math.min(pairFade, Math.max(0.016, scenes[index].sceneDuration / 3))
    );
  }
}

function boundaryHandleSeconds(edge: WaterfallClipAudioContinuityEdge | undefined, side: 'head' | 'tail') {
  if (!edge) return 0;
  const silence = side === 'head' ? edge.leadingSilence : edge.trailingSilence;
  return clampSeconds(Number(silence) || 0, 0, WATERFALL_MAX_EDGE_TRIM);
}

function computeBoundaryEdgeHotness(edge: WaterfallClipAudioContinuityEdge | undefined, side: 'head' | 'tail') {
  if (!edge) return 0;
  const handle = boundaryHandleSeconds(edge, side);
  return clampRatio(
    clampRatio(edge.activeRatio) * 0.48
    + normalizeContinuityUnit(edge.meanVolumeDb, -42, -18) * 0.28
    + normalizeContinuityUnit(edge.peakVolumeDb, -24, -5) * 0.14
    + clampRatio(1 - clampRatio(edge.silenceRatio)) * 0.1
    - clampRatio(handle / WATERFALL_MAX_EDGE_TRIM) * 0.18
  );
}

function normalizeContinuityDb(value: number) {
  if (!Number.isFinite(value)) return -72;
  return Math.max(-72, Math.min(0, value));
}

function normalizeContinuityUnit(value: number, quietDb: number, loudDb: number) {
  const normalized = normalizeContinuityDb(value);
  return clampRatio((normalized - quietDb) / Math.max(1, loudDb - quietDb));
}

function clampRatio(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function isWaterfallNarrationUsage(usageType?: FissionMixAudioUsageType) {
  return isPresenterVoiceLikeUsage(usageType);
}

function isWaterfallNarrationScene(scene: LocalFissionMixScene) {
  return scene.transitionMode === 'waterfall'
    && isWaterfallNarrationUsage(scene.audioUsageType)
    && (scene.videoAudioGain || 0) <= 0.08;
}

function applyWaterfallNarrationSegmentPairing(segments: LocalFissionMixNarrationSegment[]) {
  for (let index = 1; index < segments.length; index += 1) {
    const previous = segments[index - 1];
    const current = segments[index];
    applyWaterfallNarrationBoundaryGap(previous, current);
    const softFade = clampSeconds(
      Math.min(
        previous.fadeOutDuration || 0.018,
        current.fadeInDuration || 0.018,
        WATERFALL_NARRATION_MAX_CROSSFADE_SECONDS,
        Math.max(0.004, (previous.timelineOut - previous.timelineIn) / 9),
        Math.max(0.004, (current.timelineOut - current.timelineIn) / 9)
      ),
      0,
      WATERFALL_NARRATION_MAX_CROSSFADE_SECONDS
    );
    if (softFade <= 0.004) continue;
    if (current.timelineIn < previous.timelineOut) {
      const overlap = previous.timelineOut - current.timelineIn;
      current.timelineIn = previous.timelineOut;
      current.timelineOut = Math.max(current.timelineIn + 0.02, current.timelineOut + overlap);
    }
    previous.fadeOutDuration = Math.max(previous.fadeOutDuration || 0, softFade);
    current.fadeInDuration = Math.max(current.fadeInDuration || 0, softFade);
  }
}

function applyWaterfallNarrationBoundaryGap(
  previous: LocalFissionMixNarrationSegment,
  current: LocalFissionMixNarrationSegment
) {
  let missingGap = WATERFALL_NARRATION_MIN_BOUNDARY_GAP_SECONDS - (current.timelineIn - previous.timelineOut);
  if (!(missingGap > 0.004)) return;

  const previousDuration = Math.max(0, previous.audioOut - previous.audioIn);
  const previousTrim = clampSeconds(
    Math.min(missingGap / 2, WATERFALL_NARRATION_EDGE_TRIM_LIMIT_SECONDS),
    0,
    Math.max(0, previousDuration - 0.02)
  );
  if (previousTrim > 0.004) {
    previous.audioOut = clampSeconds(previous.audioOut - previousTrim, previous.audioIn + 0.02, previous.audioOut);
    previous.timelineOut = previous.timelineIn + Math.max(0.02, previous.audioOut - previous.audioIn);
    missingGap -= previousTrim;
  }

  const currentDuration = Math.max(0, current.audioOut - current.audioIn);
  const currentTrim = clampSeconds(
    Math.min(missingGap, WATERFALL_NARRATION_EDGE_TRIM_LIMIT_SECONDS),
    0,
    Math.max(0, currentDuration - 0.02)
  );
  if (currentTrim > 0.004) {
    current.audioIn = clampSeconds(current.audioIn + currentTrim, current.audioIn, current.audioOut - 0.02);
    current.timelineIn += currentTrim;
    current.timelineOut = current.timelineIn + Math.max(0.02, current.audioOut - current.audioIn);
  }
}
