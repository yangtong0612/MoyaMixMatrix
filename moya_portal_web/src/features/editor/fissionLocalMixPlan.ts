import {
  normalizePresenterSpeechWindow,
  parsePresenterDurationSeconds
} from './fissionPresenterMixAlgorithm';
import type { FissionMixAudioSource, FissionMixAudioUsageType, FissionMixSelectionProfile } from './fissionMixMatcher';
import { selectFissionMixVariantMedia } from './fissionMixMatcher';
import { buildWaterfallMixSelections } from './fissionWaterfallComposer';

export interface LocalFissionMixClipLike {
  id: string;
  name: string;
  duration: string;
  path?: string;
  localPath?: string;
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
  voiceLocked: boolean;
  contentProfile: FissionMixSelectionProfile;
  audioSelectionSource?: FissionMixAudioSource;
  audioUsageType?: FissionMixAudioUsageType;
}

export interface LocalFissionMixBackgroundTrack {
  id: string;
  name: string;
  source: string;
  duration: number;
  gain: number;
  fadeInOut: boolean;
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

  const groupSelections = input.settings.compositionMode === 'waterfall'
    ? buildWaterfallMixSelections({
      groups: resolvedGroups.map((item) => ({
        ...item.group,
        clips: item.clips,
        groupAudios: item.audios
      })),
      globalAudios: [],
      variantIndex: input.variantIndex
    })
    : resolvedGroups.map(({ group, clips, audios }, groupIndex) => {
      const selection = selectFissionMixVariantMedia({
        group,
        clips,
        groupAudios: audios,
        globalAudios: [],
        variantIndex: input.variantIndex,
        groupIndex
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
  let durationSeconds = 0;
  let coverPath: string | undefined;

  groupSelections.forEach((selection, groupIndex) => {
    const group = selection.group as LocalFissionMixGroupLike<TClip, TAudio>;
    const clip = (selection.clip || group.clips[0]) as ResolvedClip<TClip> | undefined;
    if (!clip?.renderSource) return;
    const audio = selection.audio as ResolvedAudio<TAudio> | undefined;
    const speechWindow = audio ? normalizePresenterSpeechWindow(audio) : normalizePresenterSpeechWindow(null);
    const videoDuration = firstPositive(parseDurationSeconds(clip.duration), parseDurationSeconds(group.duration), DEFAULT_SCENE_DURATION);
    const audioDuration = audio
      ? firstPositive(speechWindow.effectiveDuration, parseDurationSeconds(audio.duration), videoDuration)
      : 0;
    const lockSceneToAudio = Boolean(selection.voiceLocked && audioDuration > 0);
    const sceneDuration = (input.settings.followAudioSpeed || lockSceneToAudio) && audioDuration > 0
      ? Math.min(videoDuration, audioDuration)
      : videoDuration;
    const audioClipDuration = audio ? Math.min(sceneDuration, audioDuration) : 0;
    const videoIn = lockSceneToAudio
      ? clampSeconds(speechWindow.speechStart, 0, Math.max(0, videoDuration - sceneDuration))
      : 0;
    const videoOut = clampSeconds(videoIn + sceneDuration, videoIn, videoDuration);
    const audioIn = audio
      ? (
        lockSceneToAudio
          ? clampSeconds(speechWindow.speechStart, 0, Math.max(0, speechWindow.rawDuration - audioClipDuration))
          : 0
      )
      : 0;
    const audioOut = audio
      ? (
        lockSceneToAudio
          ? clampSeconds(audioIn + audioClipDuration, audioIn, speechWindow.rawDuration)
          : audioClipDuration
      )
      : 0;
    const videoAudioGain = determineVideoAudioGain(input.settings, Boolean(audio), lockSceneToAudio);
    const normalizedAudioGain = audio ? normalizedVolume(audio.volume, input.settings.volume) / 100 : 0;

    scenes.push({
      id: `scene-${group.sceneNo || groupIndex + 1}-${clip.id}`,
      groupId: group.id,
      groupName: group.title,
      sceneNo: group.sceneNo,
      clipName: clip.name,
      audioName: audio?.name,
      videoSource: clip.renderSource,
      audioSource: audio?.renderSource,
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
      voiceLocked: lockSceneToAudio,
      contentProfile: selection.selectionProfile,
      audioSelectionSource: selection.audioSource,
      audioUsageType: selection.audioUsageType
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

function determineVideoAudioGain(settings: LocalFissionMixSettings, hasExternalAudio: boolean, voiceLocked: boolean) {
  if (!settings.retainOriginalAudio || voiceLocked) return 0;
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
