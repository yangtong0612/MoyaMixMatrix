import {
  isPresenterSelectionProfile,
  isPresenterVoiceLikeUsage,
  normalizePresenterSpeechWindow,
  parsePresenterDurationSeconds,
  presenterSpeechAlignmentPenalty
} from './fissionPresenterMixAlgorithm';
import {
  inferFissionMixAudioUsageType,
  resolveFissionMixVariantStyle,
  selectFissionMixVariantMedia,
  type FissionMixAudioSource,
  type FissionMixAudioUsageType,
  type FissionMixContentProfile,
  type FissionMixSelectionProfile,
  type FissionMixVariantStyle
} from './fissionMixMatcher';

export interface WaterfallMixClipLike {
  id: string;
  name: string;
  duration: string;
  path?: string;
  localPath?: string;
  sourceClipName?: string;
  sourceAudioName?: string;
  sourceCoverPath?: string;
  audioContinuity?: WaterfallClipAudioContinuityProfile;
}

export interface WaterfallClipAudioContinuityEdge {
  meanVolumeDb: number;
  peakVolumeDb: number;
  silenceRatio: number;
  activeRatio: number;
  leadingSilence: number;
  trailingSilence: number;
  duration: number;
}

export interface WaterfallClipAudioContinuityProfile {
  duration: number;
  hasAudio: boolean;
  analysisWindow: number;
  head: WaterfallClipAudioContinuityEdge;
  tail: WaterfallClipAudioContinuityEdge;
}

export interface WaterfallMixAudioLike {
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

export interface WaterfallMixGroupLike<
  TClip extends WaterfallMixClipLike = WaterfallMixClipLike,
  TAudio extends WaterfallMixAudioLike = WaterfallMixAudioLike
> {
  id: string;
  sceneNo: number;
  title: string;
  duration?: string;
  script: string;
  voiceover: string;
  clips: TClip[];
  groupAudios?: TAudio[];
}

export interface WaterfallMixSelection<
  TClip extends WaterfallMixClipLike = WaterfallMixClipLike,
  TAudio extends WaterfallMixAudioLike = WaterfallMixAudioLike
> {
  orderIndex: number;
  group: WaterfallMixGroupLike<TClip, TAudio>;
  clip?: TClip;
  audio?: TAudio;
  selectionProfile: FissionMixSelectionProfile;
  contentProfile: FissionMixContentProfile;
  audioUsageType?: FissionMixAudioUsageType;
  audioSource?: FissionMixAudioSource;
  voiceLocked: boolean;
  voiceProfileKey?: string;
  continuityLocked: boolean;
}

interface WaterfallAudioCandidate<TAudio extends WaterfallMixAudioLike> {
  audio: TAudio;
  source: 'group' | 'global';
  usageType: FissionMixAudioUsageType;
  originalIndex: number;
}

interface BaselineSelection<
  TClip extends WaterfallMixClipLike,
  TAudio extends WaterfallMixAudioLike
> {
  orderIndex: number;
  group: WaterfallMixGroupLike<TClip, TAudio>;
  clip?: TClip;
  audio?: TAudio;
  selectionProfile: FissionMixSelectionProfile;
  contentProfile: FissionMixContentProfile;
  audioUsageType?: FissionMixAudioUsageType;
  audioSource?: FissionMixAudioSource;
  voiceLocked: boolean;
}

interface WaterfallVariantStyleBias {
  baselineClipBonus: number;
  desiredIndexMax: number;
  desiredIndexPenalty: number;
  durationFitWeight: number;
  visualDiversityWeight: number;
  audioSafetyWeight: number;
  breathPenaltyWeight: number;
  compactRhythmWeight: number;
  beamWidth: number;
}

const VOICE_PROFILE_STOPWORDS = new Set([
  'scene', 'clip', 'audio', 'video', 'mix', 'group', 'voice', 'speech', 'dub', 'narration', 'narrat',
  'ai', 'tts', 'bgm', 'music', 'effect', 'sound', 'track',
  '音频', '视频', '素材', '片段', '镜头', '分镜', '混剪', '口播', '旁白', '配音', '解说', '讲解', '数字人', '虚拟人', '主播'
]);

const ACCENT_PATTERN_ENTRIES = [
  ['mandarin', /普通话|国语|mandarin/i],
  ['cantonese', /粤语|广东话|cantonese/i],
  ['english', /英语|英文|english/i],
  ['sichuan', /四川话|川话|sichuan/i],
  ['northeast', /东北话|东北|northeast/i],
  ['taiwanese', /台腔|台湾腔|taiwan/i],
  ['male', /男声|男播|男配|male/i],
  ['female', /女声|女播|女配|female/i],
  ['child', /童声|儿童|宝宝|child/i]
] as const;

const WATERFALL_CLIP_BEAM_WIDTH = 8;
const WATERFALL_EDGE_QUIET_RATIO = 0.72;
const WATERFALL_EDGE_RELAXED_QUIET_RATIO = 0.24;
const WATERFALL_MAX_EDGE_HANDLE_SECONDS = 0.14;
const WATERFALL_HOT_EDGE_THRESHOLD = 0.7;
const WATERFALL_BREATH_EDGE_MIN_SECONDS = 0.025;
const WATERFALL_BREATH_EDGE_MAX_SECONDS = 0.18;

function getWaterfallVariantStyleBias(style: FissionMixVariantStyle): WaterfallVariantStyleBias {
  switch (style) {
    case 'visual_diversity':
      return {
        baselineClipBonus: 8,
        desiredIndexMax: 17,
        desiredIndexPenalty: 6,
        durationFitWeight: 0,
        visualDiversityWeight: 1.55,
        audioSafetyWeight: 1,
        breathPenaltyWeight: 1,
        compactRhythmWeight: 0,
        beamWidth: 12
      };
    case 'audio_smooth':
      return {
        baselineClipBonus: 16,
        desiredIndexMax: 20,
        desiredIndexPenalty: 8,
        durationFitWeight: 0.15,
        visualDiversityWeight: 0.9,
        audioSafetyWeight: 1.35,
        breathPenaltyWeight: 1.5,
        compactRhythmWeight: 0,
        beamWidth: 8
      };
    case 'rhythm_compact':
      return {
        baselineClipBonus: 12,
        desiredIndexMax: 22,
        desiredIndexPenalty: 7,
        durationFitWeight: 0.25,
        visualDiversityWeight: 1.08,
        audioSafetyWeight: 1.05,
        breathPenaltyWeight: 1.08,
        compactRhythmWeight: 1,
        beamWidth: 9
      };
    case 'duration_fit':
      return {
        baselineClipBonus: 14,
        desiredIndexMax: 18,
        desiredIndexPenalty: 7,
        durationFitWeight: 0.75,
        visualDiversityWeight: 0.95,
        audioSafetyWeight: 1.08,
        breathPenaltyWeight: 1.12,
        compactRhythmWeight: 0,
        beamWidth: 8
      };
    case 'freshness':
      return {
        baselineClipBonus: 6,
        desiredIndexMax: 15,
        desiredIndexPenalty: 5,
        durationFitWeight: 0,
        visualDiversityWeight: 1.85,
        audioSafetyWeight: 0.95,
        breathPenaltyWeight: 1,
        compactRhythmWeight: 0,
        beamWidth: 14
      };
    case 'presenter_safe':
      return {
        baselineClipBonus: 18,
        desiredIndexMax: 18,
        desiredIndexPenalty: 8,
        durationFitWeight: 0.35,
        visualDiversityWeight: 1,
        audioSafetyWeight: 1.55,
        breathPenaltyWeight: 1.8,
        compactRhythmWeight: 0,
        beamWidth: 8
      };
    case 'balanced':
    default:
      return {
        baselineClipBonus: 18,
        desiredIndexMax: 20,
        desiredIndexPenalty: 8,
        durationFitWeight: 0,
        visualDiversityWeight: 1,
        audioSafetyWeight: 1,
        breathPenaltyWeight: 1,
        compactRhythmWeight: 0,
        beamWidth: WATERFALL_CLIP_BEAM_WIDTH
      };
  }
}

export function buildWaterfallMixSelections<
  TClip extends WaterfallMixClipLike,
  TAudio extends WaterfallMixAudioLike
>(input: {
  groups: WaterfallMixGroupLike<TClip, TAudio>[];
  globalAudios: TAudio[];
  variantIndex: number;
  variantStyle?: FissionMixVariantStyle;
}) {
  const variantStyle = input.variantStyle || resolveFissionMixVariantStyle(input.variantIndex);
  const orderedGroups = input.groups
    .map((group, originalIndex) => ({ group, originalIndex }))
    .sort((left, right) => compareGroupsBySceneOrder(left.group, left.originalIndex, right.group, right.originalIndex));
  const dedupedGlobalAudios = dedupeWaterfallAudios(input.globalAudios);
  const baselineSelections: Array<BaselineSelection<TClip, TAudio>> = orderedGroups.map(({ group }, orderIndex) => {
    const selection = selectFissionMixVariantMedia({
      group,
      clips: group.clips,
      groupAudios: group.groupAudios || [],
      globalAudios: dedupedGlobalAudios,
      variantIndex: input.variantIndex,
      groupIndex: orderIndex,
      variantStyle
    });
    return {
      orderIndex,
      group,
      clip: selection.clip as TClip | undefined,
      audio: selection.audio as TAudio | undefined,
      selectionProfile: selection.selectionProfile,
      contentProfile: selection.contentProfile,
      audioUsageType: selection.audioUsageType,
      audioSource: selection.audioSource,
      voiceLocked: selection.voiceLocked
    };
  });
  const selectedClips = selectWaterfallClipSequence(
    orderedGroups.map((item) => item.group),
    baselineSelections,
    input.variantIndex,
    variantStyle
  );

  let lockedVoiceProfileKey = resolvePreferredDigitalHumanVoiceProfileKey(baselineSelections, dedupedGlobalAudios);
  let previousDigitalHumanAudioDuration = 0;

  return baselineSelections.map((baseline) => {
    const clip = selectedClips[baseline.orderIndex] || baseline.clip || baseline.group.clips[0];
    const selectionProfile = baseline.selectionProfile;
    if (!isPresenterSelectionProfile(selectionProfile)) {
      return {
        ...baseline,
        clip,
        voiceProfileKey: baseline.audio ? extractVoiceProfileKey(baseline.audio) || undefined : undefined,
        continuityLocked: false
      } satisfies WaterfallMixSelection<TClip, TAudio>;
    }

    const orderedCandidates = orderWaterfallAudioCandidates(
      collectWaterfallAudioCandidates(baseline.group, dedupedGlobalAudios),
      baseline,
      clip,
      lockedVoiceProfileKey,
      previousDigitalHumanAudioDuration,
      variantStyle
    );
    const selectedCandidate = orderedCandidates[0];
    const selectedAudio = selectedCandidate?.audio || baseline.audio;
    const selectedUsageType = selectedCandidate?.usageType || baseline.audioUsageType;
    const selectedVoiceProfileKey = selectedAudio ? extractVoiceProfileKey(selectedAudio) : '';
    const continuityLocked = Boolean(
      selectionProfile === 'digital_human'
      && lockedVoiceProfileKey
      && selectedVoiceProfileKey
      && selectedVoiceProfileKey === lockedVoiceProfileKey
    );

    if (selectionProfile === 'digital_human') {
      if (!lockedVoiceProfileKey && selectedVoiceProfileKey) {
        lockedVoiceProfileKey = selectedVoiceProfileKey;
      }
      if (selectedVoiceProfileKey && selectedVoiceProfileKey === lockedVoiceProfileKey) {
        previousDigitalHumanAudioDuration = effectiveAudioDurationSeconds(selectedAudio);
      }
    }

    return {
      orderIndex: baseline.orderIndex,
      group: baseline.group,
      clip,
      audio: selectedAudio,
      selectionProfile,
      contentProfile: baseline.contentProfile,
      audioUsageType: selectedUsageType,
      audioSource: selectedCandidate ? resolveAudioSource(selectedCandidate) : baseline.audioSource,
      voiceLocked: Boolean(selectedAudio && isPresenterVoiceLikeUsage(selectedUsageType)),
      voiceProfileKey: selectedVoiceProfileKey || undefined,
      continuityLocked
    } satisfies WaterfallMixSelection<TClip, TAudio>;
  });
}

function selectWaterfallClipSequence<
  TClip extends WaterfallMixClipLike,
  TAudio extends WaterfallMixAudioLike
>(
  groups: Array<WaterfallMixGroupLike<TClip, TAudio>>,
  baselineSelections: Array<BaselineSelection<TClip, TAudio>>,
  variantIndex: number,
  variantStyle: FissionMixVariantStyle
) {
  const styleBias = getWaterfallVariantStyleBias(variantStyle);
  type BeamState = {
    score: number;
    clips: TClip[];
    lastClip?: TClip;
  };

  let beam: BeamState[] = [{ score: 0, clips: [] }];
  groups.forEach((group, orderIndex) => {
    const baseline = baselineSelections[orderIndex];
    const candidates = group.clips || [];
    if (candidates.length === 0) return;

    const desiredIndex = resolveWaterfallDesiredClipIndex(candidates, baseline.clip, variantIndex, orderIndex);
    const nextBeam: BeamState[] = [];
    candidates.forEach((clip, candidateIndex) => {
      const clipScore = scoreWaterfallClipCandidate(clip, candidateIndex, desiredIndex, baseline, variantStyle);
      beam.forEach((state) => {
        nextBeam.push({
          score: state.score
            + clipScore
            + scoreWaterfallClipHistoryDiversity(state.clips, clip, variantStyle)
            + (state.lastClip ? scoreWaterfallClipTransition(state.lastClip, clip, variantStyle) : 0),
          clips: [...state.clips, clip],
          lastClip: clip
        });
      });
    });

    beam = nextBeam
      .sort((left, right) => right.score - left.score)
      .slice(0, Math.max(1, styleBias.beamWidth));
  });

  return beam[0]?.clips || baselineSelections.map((selection) => selection.clip || selection.group.clips[0]).filter(Boolean) as TClip[];
}

function resolveWaterfallDesiredClipIndex<TClip extends WaterfallMixClipLike>(
  clips: TClip[],
  baselineClip: TClip | undefined,
  variantIndex: number,
  orderIndex: number
) {
  if (clips.length <= 1) return 0;
  const baselineIndex = baselineClip ? clips.findIndex((clip) => clip.id === baselineClip.id) : -1;
  if (baselineIndex >= 0) return baselineIndex;
  return positiveModulo(variantIndex + orderIndex, clips.length);
}

function scoreWaterfallClipCandidate<
  TClip extends WaterfallMixClipLike,
  TAudio extends WaterfallMixAudioLike
>(
  clip: TClip,
  candidateIndex: number,
  desiredIndex: number,
  baseline: BaselineSelection<TClip, TAudio>,
  variantStyle: FissionMixVariantStyle
) {
  const styleBias = getWaterfallVariantStyleBias(variantStyle);
  let score = 40;
  if (baseline.clip?.id === clip.id) score += styleBias.baselineClipBonus;

  const candidateDistance = circularDistance(candidateIndex, desiredIndex, Math.max(1, baseline.group.clips.length));
  score += Math.max(0, styleBias.desiredIndexMax - candidateDistance * styleBias.desiredIndexPenalty);

  const targetDuration = firstPositive(
    parsePresenterDurationSeconds(baseline.group.duration),
    parsePresenterDurationSeconds(baseline.clip?.duration)
  );
  const clipDuration = parsePresenterDurationSeconds(clip.duration);
  if (clipDuration > 0 && targetDuration > 0) {
    const durationScore = durationAlignmentScore(clipDuration, targetDuration, baseline.selectionProfile);
    score += durationScore + Math.round(durationScore * styleBias.durationFitWeight);
    if (styleBias.compactRhythmWeight > 0) {
      const overrun = clipDuration - targetDuration;
      if (overrun <= 0.12 && clipDuration >= targetDuration * 0.72) {
        score += Math.round(12 * styleBias.compactRhythmWeight);
      } else if (overrun > 0.7) {
        score -= Math.round(Math.min(14, overrun * 5) * styleBias.compactRhythmWeight);
      }
    }
  }

  const continuityProfile = extractClipAudioContinuityProfile(clip);
  if (continuityProfile?.hasAudio) {
    const headHandle = continuityEdgeHandleSeconds(continuityProfile.head, 'head');
    const tailHandle = continuityEdgeHandleSeconds(continuityProfile.tail, 'tail');
    const headHotness = continuityEdgeHotness(continuityProfile.head);
    const tailHotness = continuityEdgeHotness(continuityProfile.tail);
    const headBreathRisk = continuityEdgeBreathRisk(continuityProfile.head, 'head');
    const tailBreathRisk = continuityEdgeBreathRisk(continuityProfile.tail, 'tail');

    if (continuityProfile.head.leadingSilence >= 0.03) score += 4;
    if (continuityProfile.tail.trailingSilence >= 0.03) score += 4;
    if (isQuietContinuityEdge(continuityProfile.head) && isQuietContinuityEdge(continuityProfile.tail)) score += 6;

    score += Math.round((headHandle + tailHandle) * 44);

    if (headHandle >= 0.03 && tailHandle >= 0.03) {
      score += 8;
    } else if (headHandle < 0.012 && tailHandle < 0.012 && (headHotness + tailHotness) / 2 >= 0.78) {
      score -= 18;
    }

    if (headHotness <= 0.28 && tailHotness <= 0.28) {
      score += 10;
    } else if (Math.max(headHotness, tailHotness) >= 0.82 && Math.min(headHandle, tailHandle) < 0.012) {
      score -= 8;
    }

    if (continuityProfile.head.leadingSilence > 0.16) score -= 4;
    if (continuityProfile.tail.trailingSilence > 0.16) score -= 4;
    if (Math.max(headBreathRisk, tailBreathRisk) >= 0.62) {
      score -= Math.round(Math.max(headBreathRisk, tailBreathRisk) * 10);
    }
    if (styleBias.audioSafetyWeight > 1) {
      const safetyExtra = styleBias.audioSafetyWeight - 1;
      if (isQuietContinuityEdge(continuityProfile.head) && isQuietContinuityEdge(continuityProfile.tail)) {
        score += Math.round(8 * safetyExtra);
      }
      score += Math.round((headHandle + tailHandle) * 24 * safetyExtra);
      if (Math.max(headHotness, tailHotness) >= 0.82 && Math.min(headHandle, tailHandle) < 0.012) {
        score -= Math.round(12 * safetyExtra);
      }
    }
    if (styleBias.breathPenaltyWeight > 1) {
      const breathExtra = styleBias.breathPenaltyWeight - 1;
      const breathRisk = Math.max(headBreathRisk, tailBreathRisk);
      if (breathRisk >= 0.48) score -= Math.round(breathRisk * 18 * breathExtra);
    }
  }

  if (clip.sourceClipName || clip.sourceCoverPath) {
    score += 6;
  }

  score += sceneTokenAlignmentScore(clip.name, baseline.group.sceneNo, baseline.group.title, baseline.group.voiceover, baseline.clip?.name);
  return score;
}

function scoreWaterfallVisualTransitionDiversity<TClip extends WaterfallMixClipLike>(
  leftClip: TClip,
  rightClip: TClip,
  styleBias: WaterfallVariantStyleBias
) {
  const visualOverlap = waterfallClipOverlapRatio(leftClip, rightClip);
  const visualWeight = styleBias.visualDiversityWeight;
  let score = 0;

  if (waterfallClipIdentityKey(leftClip) && waterfallClipIdentityKey(leftClip) === waterfallClipIdentityKey(rightClip)) {
    score -= Math.round(78 * visualWeight);
  } else if (visualOverlap >= 0.82) {
    score -= Math.round(30 * visualWeight);
  } else if (visualOverlap >= 0.58) {
    score -= Math.round(14 * visualWeight);
  } else if (visualOverlap <= 0.16) {
    score += Math.round(6 * visualWeight);
  }

  if (visualWeight > 1 && visualOverlap <= 0.22) {
    score += Math.round(5 * (visualWeight - 1));
  }
  return score;
}

function scoreWaterfallClipTransition<TClip extends WaterfallMixClipLike>(
  leftClip: TClip,
  rightClip: TClip,
  variantStyle: FissionMixVariantStyle
) {
  const styleBias = getWaterfallVariantStyleBias(variantStyle);
  let score = scoreWaterfallVisualTransitionDiversity(leftClip, rightClip, styleBias);
  const leftProfile = extractClipAudioContinuityProfile(leftClip);
  const rightProfile = extractClipAudioContinuityProfile(rightClip);
  if (!leftProfile?.hasAudio || !rightProfile?.hasAudio) return score;

  const tail = leftProfile.tail;
  const head = rightProfile.head;
  const tailQuiet = isQuietContinuityEdge(tail);
  const headQuiet = isQuietContinuityEdge(head);
  const tailHotness = continuityEdgeHotness(tail);
  const headHotness = continuityEdgeHotness(head);
  const tailHandle = continuityEdgeHandleSeconds(tail, 'tail');
  const headHandle = continuityEdgeHandleSeconds(head, 'head');
  const tailBreathRisk = continuityEdgeBreathRisk(tail, 'tail');
  const headBreathRisk = continuityEdgeBreathRisk(head, 'head');
  const meanDiff = Math.abs(normalizeContinuityDb(tail.meanVolumeDb) - normalizeContinuityDb(head.meanVolumeDb));
  const peakDiff = Math.abs(normalizeContinuityDb(tail.peakVolumeDb) - normalizeContinuityDb(head.peakVolumeDb));
  const activeDiff = Math.abs(clampContinuityRatio(tail.activeRatio) - clampContinuityRatio(head.activeRatio));
  const combinedHandle = tailHandle + headHandle;
  const combinedBreathSilence = Math.max(0, tail.trailingSilence || 0) + Math.max(0, head.leadingSilence || 0);

  if (tailQuiet && headQuiet) {
    score += 36;
  } else if (tailQuiet && !headQuiet) {
    score += head.leadingSilence >= 0.03 ? 10 : -18;
  } else if (!tailQuiet && headQuiet) {
      score += tail.trailingSilence >= 0.03 ? 8 : -12;
  } else {
    if (meanDiff <= 2.5) score += 26;
    else if (meanDiff <= 4.5) score += 16;
    else if (meanDiff <= 7.5) score += 4;
    else score -= 14;

    if (peakDiff <= 3) score += 10;
    else if (peakDiff > 9) score -= 8;

    if (tail.trailingSilence < 0.015 && head.leadingSilence < 0.015) {
      score -= 18;
    }
  }

  if (combinedHandle >= 0.08) score += 14;
  else if (combinedHandle >= 0.04) score += 8;
  else if (combinedHandle < 0.012 && (tailHotness + headHotness) / 2 >= 0.7) score -= 12;

  const breathBoundaryRisk = Math.max(tailBreathRisk, headBreathRisk);
  if (breathBoundaryRisk >= 0.64 && combinedHandle < 0.18) {
    score -= Math.round(34 * breathBoundaryRisk);
  } else if (breathBoundaryRisk >= 0.48 && combinedHandle < 0.12) {
    score -= Math.round(18 * breathBoundaryRisk);
  }

  if (
    combinedBreathSilence >= WATERFALL_BREATH_EDGE_MIN_SECONDS * 1.6
    && combinedBreathSilence <= WATERFALL_BREATH_EDGE_MAX_SECONDS * 1.35
    && Math.max(tailHotness, headHotness) >= 0.42
    && !(tailQuiet && headQuiet)
  ) {
    score -= 12;
  }

  if (activeDiff <= 0.14) score += 12;
  else if (activeDiff <= 0.28) score += 5;
  else if (activeDiff >= 0.5) score -= 10;

  const hotBoundary = tailHotness >= WATERFALL_HOT_EDGE_THRESHOLD && headHotness >= WATERFALL_HOT_EDGE_THRESHOLD;
  if (hotBoundary && combinedHandle < 0.02) {
    score -= 30;
  } else if (hotBoundary) {
    score -= 10;
  }

  if (styleBias.audioSafetyWeight > 1) {
    const safetyExtra = styleBias.audioSafetyWeight - 1;
    if (tailQuiet && headQuiet) {
      score += Math.round(14 * safetyExtra);
    }
    if (combinedHandle >= 0.08) {
      score += Math.round(12 * safetyExtra);
    } else if (combinedHandle < 0.018 && Math.max(tailHotness, headHotness) >= 0.58) {
      score -= Math.round(18 * safetyExtra);
    }
    if (hotBoundary) score -= Math.round(16 * safetyExtra);
  }

  if (styleBias.breathPenaltyWeight > 1 && breathBoundaryRisk >= 0.42) {
    score -= Math.round(24 * breathBoundaryRisk * (styleBias.breathPenaltyWeight - 1));
  }

  if (Math.abs(tailHotness - headHotness) <= 0.18 && meanDiff <= 4.5) {
    score += 10;
  } else if (Math.abs(tailHotness - headHotness) >= 0.42 && combinedHandle < 0.04) {
    score -= 8;
  }

  const leftDuration = parsePresenterDurationSeconds(leftClip.duration);
  const rightDuration = parsePresenterDurationSeconds(rightClip.duration);
  const durationDiff = leftDuration > 0 && rightDuration > 0
    ? Math.abs(leftDuration - rightDuration)
    : 0;
  if (durationDiff > 0 && durationDiff <= 0.6) score += 6;
  else if (durationDiff >= 2.4) score -= 6;
  if (styleBias.compactRhythmWeight > 0 && durationDiff > 0) {
    if (durationDiff <= 0.35) score += Math.round(8 * styleBias.compactRhythmWeight);
    else if (durationDiff >= 1.4) score -= Math.round(8 * styleBias.compactRhythmWeight);
  }

  if (tail.trailingSilence >= 0.04) score += 8;
  if (head.leadingSilence >= 0.04) score += 8;
  return score;
}

function scoreWaterfallClipHistoryDiversity<TClip extends WaterfallMixClipLike>(
  previousClips: TClip[],
  candidate: TClip,
  variantStyle: FissionMixVariantStyle
) {
  if (previousClips.length === 0) return 0;
  const styleBias = getWaterfallVariantStyleBias(variantStyle);
  const recentClips = previousClips.slice(-3).reverse();
  const baseScore = recentClips.reduce((score, previousClip, historyIndex) => {
    const weight = historyIndex === 0 ? 1 : historyIndex === 1 ? 0.62 : 0.36;
    const sameIdentity = waterfallClipIdentityKey(previousClip)
      && waterfallClipIdentityKey(previousClip) === waterfallClipIdentityKey(candidate);
    if (sameIdentity) {
      return score - Math.round(68 * weight);
    }

    const overlap = waterfallClipOverlapRatio(previousClip, candidate);
    if (overlap >= 0.84) return score - Math.round(24 * weight);
    if (overlap >= 0.66) return score - Math.round(14 * weight);
    if (overlap <= 0.14) return score + Math.round(5 * weight);
    return score;
  }, 0);
  return Math.round(baseScore * styleBias.visualDiversityWeight);
}

function collectWaterfallAudioCandidates<
  TClip extends WaterfallMixClipLike,
  TAudio extends WaterfallMixAudioLike
>(group: WaterfallMixGroupLike<TClip, TAudio>, globalAudios: TAudio[]) {
  const seen = new Set<string>();
  const candidates: WaterfallAudioCandidate<TAudio>[] = [];

  const append = (audio: TAudio, source: 'group' | 'global', originalIndex: number) => {
    const key = audio.localPath || audio.path || audio.id;
    if (!key || seen.has(key)) return;
    seen.add(key);
    candidates.push({
      audio,
      source,
      usageType: inferFissionMixAudioUsageType(audio, source),
      originalIndex
    });
  };

  (group.groupAudios || []).forEach((audio, index) => append(audio, 'group', index));
  globalAudios.forEach((audio, index) => append(audio, 'global', index));
  return candidates;
}

function orderWaterfallAudioCandidates<
  TClip extends WaterfallMixClipLike,
  TAudio extends WaterfallMixAudioLike
>(
  candidates: WaterfallAudioCandidate<TAudio>[],
  baseline: BaselineSelection<TClip, TAudio>,
  clip: TClip | undefined,
  lockedVoiceProfileKey: string,
  previousDigitalHumanAudioDuration: number,
  variantStyle: FissionMixVariantStyle
) {
  const filtered = filterPresenterWaterfallCandidates(candidates, baseline.selectionProfile);
  return filtered
    .map((candidate) => ({
      candidate,
      score: scoreWaterfallPresenterAudioCandidate(
        candidate,
        baseline,
        clip,
        lockedVoiceProfileKey,
        previousDigitalHumanAudioDuration,
        variantStyle
      )
    }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (left.candidate.source !== right.candidate.source) return left.candidate.source === 'group' ? -1 : 1;
      return left.candidate.originalIndex - right.candidate.originalIndex;
    })
    .map((item) => item.candidate);
}

function filterPresenterWaterfallCandidates<TAudio extends WaterfallMixAudioLike>(
  candidates: WaterfallAudioCandidate<TAudio>[],
  selectionProfile: FissionMixSelectionProfile
) {
  if (!isPresenterSelectionProfile(selectionProfile)) return candidates;
  const voiceLikeCandidates = candidates.filter((candidate) => isPresenterVoiceLikeUsage(candidate.usageType));
  if (voiceLikeCandidates.length > 0) return voiceLikeCandidates;
  const unknownCandidates = candidates.filter((candidate) => candidate.usageType === 'unknown');
  if (unknownCandidates.length > 0) return unknownCandidates;
  return candidates;
}

function scoreWaterfallPresenterAudioCandidate<
  TClip extends WaterfallMixClipLike,
  TAudio extends WaterfallMixAudioLike
>(
  candidate: WaterfallAudioCandidate<TAudio>,
  baseline: BaselineSelection<TClip, TAudio>,
  clip: TClip | undefined,
  lockedVoiceProfileKey: string,
  previousDigitalHumanAudioDuration: number,
  variantStyle: FissionMixVariantStyle
) {
  const styleBias = getWaterfallVariantStyleBias(variantStyle);
  let score = presenterUsageBaseScore(candidate.usageType, baseline.selectionProfile);
  if (baseline.audio && baseline.audio.id === candidate.audio.id) score += 32;
  if (candidate.source === 'group') score += baseline.selectionProfile === 'human_presenter' ? 14 : 10;

  const preferredSceneDuration = firstPositive(
    parsePresenterDurationSeconds(clip?.duration),
    parsePresenterDurationSeconds(baseline.group.duration)
  );
  const estimatedVoiceoverDuration = estimateVoiceoverDurationSeconds(
    baseline.group.voiceover || baseline.group.script,
    preferredSceneDuration
  );
  const effectiveAudioDuration = effectiveAudioDurationSeconds(candidate.audio);
  const voiceProfileKey = extractVoiceProfileKey(candidate.audio);
  const speechWindow = normalizePresenterSpeechWindow(candidate.audio);
  const safetyExtra = Math.max(0, styleBias.audioSafetyWeight - 1);
  const sourceAudioAffinity = sourceAudioAffinityScore(clip, candidate.audio);
  if (sourceAudioAffinity > 0) {
    score += sourceAudioAffinity;
  } else if (clip?.sourceAudioName && isPresenterVoiceLikeUsage(candidate.usageType)) {
    score -= baseline.selectionProfile === 'digital_human' ? 28 : 18;
  }

  if (lockedVoiceProfileKey && voiceProfileKey) {
    if (voiceProfileKey === lockedVoiceProfileKey) {
      score += baseline.selectionProfile === 'digital_human' ? 68 : 24;
      score += Math.round((baseline.selectionProfile === 'digital_human' ? 24 : 12) * safetyExtra);
    } else {
      score -= baseline.selectionProfile === 'digital_human' ? 22 : 10;
      score -= Math.round((baseline.selectionProfile === 'digital_human' ? 16 : 8) * safetyExtra);
    }
  } else if (baseline.selectionProfile === 'digital_human' && voiceProfileKey) {
    score += 10;
  }

  if (previousDigitalHumanAudioDuration > 0 && effectiveAudioDuration > 0) {
    const diff = Math.abs(previousDigitalHumanAudioDuration - effectiveAudioDuration);
    if (diff <= 0.35) score += 18;
    else if (diff <= 0.85) score += 10;
    else if (diff > 2) score -= Math.min(12, Math.round(diff * 2));
    if (styleBias.durationFitWeight > 0) {
      score += Math.round(durationAlignmentScore(effectiveAudioDuration, previousDigitalHumanAudioDuration, baseline.selectionProfile) * styleBias.durationFitWeight * 0.35);
    }
  }

  if (preferredSceneDuration > 0 && effectiveAudioDuration > 0) {
    const durationScore = durationAlignmentScore(effectiveAudioDuration, preferredSceneDuration, baseline.selectionProfile);
    score += durationScore + Math.round(durationScore * styleBias.durationFitWeight);
    score += presenterSpeechAlignmentPenalty(
      preferredSceneDuration,
      candidate.audio,
      baseline.selectionProfile,
      candidate.usageType
    );
  }

  if (estimatedVoiceoverDuration > 0 && effectiveAudioDuration > 0) {
    const voiceoverDurationScore = durationAlignmentScore(effectiveAudioDuration, estimatedVoiceoverDuration, baseline.selectionProfile);
    score += voiceoverDurationScore + Math.round(voiceoverDurationScore * styleBias.durationFitWeight * 0.5);
  }

  if (styleBias.compactRhythmWeight > 0 && preferredSceneDuration > 0 && effectiveAudioDuration > 0) {
    const overrun = effectiveAudioDuration - preferredSceneDuration;
    if (overrun <= 0.12 && effectiveAudioDuration >= preferredSceneDuration * 0.72) {
      score += Math.round(8 * styleBias.compactRhythmWeight);
    } else if (overrun > 0.65) {
      score -= Math.round(Math.min(14, overrun * 5) * styleBias.compactRhythmWeight);
    }
  }

  if (safetyExtra > 0 && isPresenterVoiceLikeUsage(candidate.usageType)) {
    if (!speechWindow.hasSpeech || speechWindow.effectiveDuration <= 0.12) {
      score -= Math.round(18 * safetyExtra);
    } else {
      score += Math.round(8 * safetyExtra);
    }
    if (speechWindow.trimmedLeading > 0.55) score -= Math.round(8 * safetyExtra);
    if (speechWindow.trimmedTrailing > 0.55) score -= Math.round(8 * safetyExtra);
  }

  const clipStem = mediaStem(clip?.name);
  const audioStem = mediaStem(candidate.audio.name);
  if (clipStem && audioStem && clipStem === audioStem) score += 48;

  score += sceneTokenAlignmentScore(candidate.audio.name, baseline.group.sceneNo, baseline.group.title, baseline.group.voiceover, clip?.name);
  return score;
}

function sourceAudioAffinityScore<TClip extends WaterfallMixClipLike>(
  clip: TClip | undefined,
  audio: Pick<WaterfallMixAudioLike, 'name' | 'path' | 'localPath'>
) {
  const sourceName = mediaStem(clip?.sourceAudioName);
  if (!sourceName) return 0;

  const audioNames = [
    audio.name,
    audio.localPath,
    audio.path
  ].map((value) => mediaStem(value)).filter(Boolean);

  if (audioNames.some((name) => name === sourceName)) return 180;
  if (audioNames.some((name) => name.includes(sourceName) || sourceName.includes(name))) return 120;

  const sourceTokens = mediaTokens(sourceName).filter((token) => !VOICE_PROFILE_STOPWORDS.has(token));
  if (sourceTokens.length === 0) return 0;
  const audioTokens = new Set(
    mediaTokens(audioNames.join(' '))
      .filter((token) => !VOICE_PROFILE_STOPWORDS.has(token))
  );
  const matched = sourceTokens.filter((token) => audioTokens.has(token)).length;
  if (matched === 0) return 0;
  const ratio = matched / Math.max(sourceTokens.length, 1);
  if (ratio >= 0.75) return 84;
  if (ratio >= 0.45) return 42;
  return 18;
}

function presenterUsageBaseScore(usageType: FissionMixAudioUsageType, selectionProfile: FissionMixSelectionProfile) {
  if (selectionProfile === 'digital_human') {
    if (usageType === 'ai_voice') return 140;
    if (usageType === 'voice') return 126;
    if (usageType === 'unknown') return 78;
    if (usageType === 'music') return 12;
    return 6;
  }
  if (selectionProfile === 'human_presenter') {
    if (usageType === 'voice') return 132;
    if (usageType === 'ai_voice') return 124;
    if (usageType === 'unknown') return 82;
    if (usageType === 'music') return 18;
    return 10;
  }
  if (usageType === 'ai_voice') return 90;
  if (usageType === 'voice') return 82;
  if (usageType === 'unknown') return 58;
  if (usageType === 'music') return 40;
  return 24;
}

function durationAlignmentScore(audioDuration: number, targetDuration: number, selectionProfile: FissionMixSelectionProfile) {
  const diff = Math.abs(audioDuration - targetDuration);
  if (diff <= 0.2) return selectionProfile === 'digital_human' ? 34 : 22;
  if (diff <= 0.55) return selectionProfile === 'digital_human' ? 24 : 16;
  if (diff <= 1.15) return selectionProfile === 'digital_human' ? 14 : 10;
  if (diff <= 1.9) return 4;
  return -Math.min(selectionProfile === 'digital_human' ? 18 : 12, Math.round(diff * 4));
}

function sceneTokenAlignmentScore(
  audioName: string,
  sceneNo: number,
  groupTitle: string,
  voiceover: string,
  clipName?: string
) {
  const audioTokens = mediaTokens(audioName);
  const sceneToken = normalizeSceneToken(sceneNo);
  const titleTokens = mediaTokens(`${groupTitle} ${voiceover} ${clipName || ''}`);
  let score = 0;
  if (sceneToken && audioTokens.some((token) => token === sceneToken || token === sceneToken.replace(/^scene/, ''))) {
    score += 30;
  }
  const matchedTokens = titleTokens.filter((token) => audioTokens.includes(token) && !VOICE_PROFILE_STOPWORDS.has(token));
  score += Math.min(4, matchedTokens.length) * 6;
  return score;
}

function extractClipAudioContinuityProfile<TClip extends WaterfallMixClipLike>(clip?: TClip) {
  if (!clip || typeof clip !== 'object') return undefined;
  const profile = clip.audioContinuity;
  if (!profile || typeof profile !== 'object') return undefined;
  return profile;
}

function waterfallClipIdentityKey<TClip extends WaterfallMixClipLike>(clip?: TClip) {
  if (!clip) return '';
  const clipStem = mediaStem(clip.sourceClipName || clip.name);
  const coverStem = mediaStem(clip.sourceCoverPath);
  return [clipStem, coverStem].filter(Boolean).join('|');
}

function waterfallClipOverlapRatio<TClip extends WaterfallMixClipLike>(leftClip: TClip, rightClip: TClip) {
  const leftTokens = waterfallClipTokens(leftClip);
  const rightTokens = waterfallClipTokens(rightClip);
  if (leftTokens.length === 0 || rightTokens.length === 0) return 0;
  const matched = leftTokens.filter((token) => rightTokens.includes(token));
  return matched.length / Math.max(leftTokens.length, rightTokens.length, 1);
}

function waterfallClipTokens<TClip extends WaterfallMixClipLike>(clip?: TClip) {
  return mediaTokens([
    clip?.sourceClipName,
    clip?.sourceCoverPath,
    clip?.name
  ].filter(Boolean).join(' ')).filter((token) => !/^v\d+$/i.test(token));
}

function isQuietContinuityEdge(edge?: WaterfallClipAudioContinuityEdge) {
  if (!edge) return true;
  return edge.silenceRatio >= WATERFALL_EDGE_QUIET_RATIO
    || edge.activeRatio <= 0.22
    || normalizeContinuityDb(edge.meanVolumeDb) <= -40;
}

function continuityEdgeHandleSeconds(edge: WaterfallClipAudioContinuityEdge | undefined, side: 'head' | 'tail') {
  if (!edge) return 0;
  const silence = side === 'head' ? edge.leadingSilence : edge.trailingSilence;
  const quiet = isRelaxedQuietContinuityEdge(edge);
  if (!(silence > 0.008)) return 0;
  const softenedSilence = quiet ? silence : silence * 0.35;
  return clampContinuitySeconds(softenedSilence, 0, WATERFALL_MAX_EDGE_HANDLE_SECONDS);
}

function continuityEdgeHotness(edge?: WaterfallClipAudioContinuityEdge) {
  if (!edge) return 0;
  const active = clampContinuityRatio(edge.activeRatio);
  const meanEnergy = normalizeContinuityUnit(edge.meanVolumeDb, -44, -18);
  const peakEnergy = normalizeContinuityUnit(edge.peakVolumeDb, -24, -4);
  const silencePressure = clampContinuityRatio(1 - clampContinuityRatio(edge.silenceRatio));
  const handle = continuityEdgeHandleSeconds(edge, edge.leadingSilence >= edge.trailingSilence ? 'head' : 'tail');
  const handleRelief = clampContinuityRatio(handle / WATERFALL_MAX_EDGE_HANDLE_SECONDS);
  return clampContinuityRatio(
    active * 0.46
    + meanEnergy * 0.28
    + peakEnergy * 0.16
    + silencePressure * 0.1
    - handleRelief * 0.2
  );
}

function continuityEdgeBreathRisk(edge: WaterfallClipAudioContinuityEdge | undefined, side: 'head' | 'tail') {
  if (!edge) return 0;
  const silence = side === 'head' ? edge.leadingSilence : edge.trailingSilence;
  if (silence < WATERFALL_BREATH_EDGE_MIN_SECONDS || silence > WATERFALL_BREATH_EDGE_MAX_SECONDS) return 0;
  const center = (WATERFALL_BREATH_EDGE_MIN_SECONDS + WATERFALL_BREATH_EDGE_MAX_SECONDS) / 2;
  const halfRange = (WATERFALL_BREATH_EDGE_MAX_SECONDS - WATERFALL_BREATH_EDGE_MIN_SECONDS) / 2;
  const silenceBand = clampContinuityRatio(1 - Math.abs(silence - center) / Math.max(0.001, halfRange));
  const active = clampContinuityRatio(edge.activeRatio);
  const meanEnergy = normalizeContinuityUnit(edge.meanVolumeDb, -46, -22);
  const peakEnergy = normalizeContinuityUnit(edge.peakVolumeDb, -30, -8);
  const notFullyQuiet = isQuietContinuityEdge(edge) ? 0.42 : 1;
  return clampContinuityRatio(
    notFullyQuiet
    * (
      silenceBand * 0.38
      + active * 0.24
      + meanEnergy * 0.22
      + peakEnergy * 0.16
    )
  );
}

function isRelaxedQuietContinuityEdge(edge?: WaterfallClipAudioContinuityEdge) {
  if (!edge) return true;
  return edge.silenceRatio >= WATERFALL_EDGE_RELAXED_QUIET_RATIO
    || edge.activeRatio <= 0.56
    || normalizeContinuityDb(edge.meanVolumeDb) <= -28;
}

function normalizeContinuityDb(value: number) {
  if (!Number.isFinite(value)) return -72;
  return Math.max(-72, Math.min(0, value));
}

function normalizeContinuityUnit(value: number, quietDb: number, loudDb: number) {
  const normalized = normalizeContinuityDb(value);
  if (loudDb >= quietDb) {
    return clampContinuityRatio((normalized - quietDb) / Math.max(1, loudDb - quietDb));
  }
  return 0;
}

function clampContinuitySeconds(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function clampContinuityRatio(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function resolvePreferredDigitalHumanVoiceProfileKey<
  TClip extends WaterfallMixClipLike,
  TAudio extends WaterfallMixAudioLike
>(
  baselineSelections: Array<BaselineSelection<TClip, TAudio>>,
  globalAudios: TAudio[]
) {
  const profileCounts = new Map<string, { count: number; firstOrder: number }>();
  const pushProfile = (key: string, orderIndex: number) => {
    if (!key) return;
    const current = profileCounts.get(key);
    if (current) {
      current.count += 1;
      current.firstOrder = Math.min(current.firstOrder, orderIndex);
      return;
    }
    profileCounts.set(key, { count: 1, firstOrder: orderIndex });
  };

  baselineSelections.forEach((item) => {
    if (item.selectionProfile !== 'digital_human' || !item.audio || !isPresenterVoiceLikeUsage(item.audioUsageType)) return;
    pushProfile(extractVoiceProfileKey(item.audio), item.orderIndex);
  });

  if (profileCounts.size === 0) {
    baselineSelections.forEach((item) => {
      if (item.selectionProfile !== 'digital_human') return;
      const candidates = collectWaterfallAudioCandidates(item.group, globalAudios);
      candidates
        .filter((candidate) => isPresenterVoiceLikeUsage(candidate.usageType))
        .forEach((candidate) => pushProfile(extractVoiceProfileKey(candidate.audio), item.orderIndex));
    });
  }

  return [...profileCounts.entries()]
    .sort((left, right) => {
      if (right[1].count !== left[1].count) return right[1].count - left[1].count;
      return left[1].firstOrder - right[1].firstOrder;
    })[0]?.[0] || '';
}

function dedupeWaterfallAudios<TAudio extends WaterfallMixAudioLike>(audios: TAudio[]) {
  const seen = new Set<string>();
  return audios.filter((audio) => {
    const key = audio.localPath || audio.path || audio.id;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function resolveAudioSource<TAudio extends WaterfallMixAudioLike>(candidate: WaterfallAudioCandidate<TAudio>): FissionMixAudioSource {
  return candidate.usageType === 'ai_voice' ? 'ai' : candidate.source;
}

function effectiveAudioDurationSeconds(audio?: WaterfallMixAudioLike) {
  if (!audio) return 0;
  const speechWindow = normalizePresenterSpeechWindow(audio);
  return firstPositive(speechWindow.effectiveDuration, parsePresenterDurationSeconds(audio.duration));
}

function estimateVoiceoverDurationSeconds(text: string, fallbackDuration: number) {
  const normalized = String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/[，。！？、,.!?;；:“”"'（）()【】\[\]-]/g, ' ')
    .trim();
  if (!normalized) return fallbackDuration;
  const hanziCount = (normalized.match(/[\u4e00-\u9fa5]/g) || []).length;
  const latinWordCount = normalized
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.replace(/[^a-z0-9]/gi, ''))
    .filter(Boolean)
    .length;
  const estimated = hanziCount / 3.5 + latinWordCount / 2.6;
  if (!(estimated > 0)) return fallbackDuration;
  if (!(fallbackDuration > 0)) return estimated;
  return Math.max(Math.min(estimated, fallbackDuration * 1.35), Math.min(fallbackDuration, estimated));
}

function compareGroupsBySceneOrder<
  TClip extends WaterfallMixClipLike,
  TAudio extends WaterfallMixAudioLike
>(
  left: WaterfallMixGroupLike<TClip, TAudio>,
  leftOriginalIndex: number,
  right: WaterfallMixGroupLike<TClip, TAudio>,
  rightOriginalIndex: number
) {
  const leftSceneNo = Number(left.sceneNo);
  const rightSceneNo = Number(right.sceneNo);
  if (Number.isFinite(leftSceneNo) && Number.isFinite(rightSceneNo) && leftSceneNo !== rightSceneNo) {
    return leftSceneNo - rightSceneNo;
  }
  if (Number.isFinite(leftSceneNo) !== Number.isFinite(rightSceneNo)) {
    return Number.isFinite(leftSceneNo) ? -1 : 1;
  }
  return leftOriginalIndex - rightOriginalIndex;
}

function normalizeSceneToken(sceneNo: number) {
  return Number.isFinite(sceneNo) && sceneNo > 0 ? `scene${sceneNo}` : '';
}

function extractVoiceProfileKey(audio: Pick<WaterfallMixAudioLike, 'name' | 'path' | 'localPath'>) {
  const text = [audio.name, audio.localPath, audio.path].filter(Boolean).join(' ');
  const accentTokens = [...extractAccentTokens(text)].sort();
  if (accentTokens.length > 0) return accentTokens.join('|');
  const profileTokens = mediaTokens(text)
    .filter((token) => !VOICE_PROFILE_STOPWORDS.has(token))
    .filter((token) => !/^scene\d+$/i.test(token))
    .filter((token) => !/^v\d+$/i.test(token))
    .filter((token) => !/^\d+$/.test(token));
  return profileTokens.slice(0, 2).join('|');
}

function extractAccentTokens(value: string) {
  const tokens = new Set<string>();
  for (const [token, pattern] of ACCENT_PATTERN_ENTRIES) {
    if (pattern.test(value)) tokens.add(token);
  }
  return tokens;
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

function firstPositive(...values: number[]) {
  return values.find((value) => value > 0) || 0;
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
