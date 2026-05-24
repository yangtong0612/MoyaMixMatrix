export type FissionMixContentProfile = 'standard' | 'digital_human';
export type FissionMixSelectionProfile = 'standard' | 'human_presenter' | 'digital_human';
export type FissionMixAudioUsageType = 'ai_voice' | 'voice' | 'music' | 'effect' | 'unknown';
export type FissionMixAudioSource = 'group' | 'global' | 'ai';

interface MixClipLike {
  id: string;
  name: string;
  duration: string;
  path?: string;
}

interface MixAudioLike {
  id: string;
  name: string;
  duration: string;
  volume: number;
  path?: string;
}

interface MixGroupLike<TClip extends MixClipLike = MixClipLike, TAudio extends MixAudioLike = MixAudioLike> {
  title: string;
  script: string;
  voiceover: string;
  duration?: string;
  clips: TClip[];
  groupAudios?: TAudio[];
}

interface MixAudioCandidate<TAudio extends MixAudioLike> {
  audio: TAudio;
  source: 'group' | 'global';
  usageType: FissionMixAudioUsageType;
  originalIndex: number;
}

const DIGITAL_HUMAN_KEYWORDS = /数字人|虚拟人|digital\s*human|avatar|metahuman|虚拟主播|虚拟讲解|ai主播/i;
const HUMAN_PRESENCE_KEYWORDS = /真人|人物|人像|出镜|露脸|口播|讲解|解说|主持|主播|采访|试用|体验|模特|达人|博主|上脸|自拍|vlog|presenter|host|speaker|talking\s*head|onscreen|person/i;
const AI_AUDIO_KEYWORDS = /(?:^|[\s_-])(ai|tts)(?:$|[\s_-])|数字人|ai配音|智能配音|voiceover|speech|synthetic/i;
const VOICE_AUDIO_KEYWORDS = /配音|旁白|口播|讲解|解说|人声|主播|台词|narrat|voice|speech|dub/i;
const MUSIC_AUDIO_KEYWORDS = /bgm|伴奏|纯音乐|音乐|music|beat|loop|song|melody|instrumental/i;
const EFFECT_AUDIO_KEYWORDS = /音效|效果|sfx|fx|effect/i;
const GENERIC_MATCH_TOKENS = new Set(['scene', 'clip', 'audio', 'video', 'mix', 'group', 'voice', 'music', 'bgm', '音频', '视频', '素材', '片段', '镜头', '分镜', '混剪']);
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

export function inferFissionMixSelectionProfile(group: Pick<MixGroupLike, 'title' | 'script' | 'voiceover' | 'clips'>): FissionMixSelectionProfile {
  const text = [group.title, group.script, group.voiceover, ...group.clips.map((clip) => clip.name)].filter(Boolean).join(' ');
  if (DIGITAL_HUMAN_KEYWORDS.test(text)) return 'digital_human';
  if (HUMAN_PRESENCE_KEYWORDS.test(text)) return 'human_presenter';
  return 'standard';
}

export function inferFissionMixContentProfile(group: Pick<MixGroupLike, 'title' | 'script' | 'voiceover' | 'clips'>): FissionMixContentProfile {
  return inferFissionMixSelectionProfile(group) === 'digital_human' ? 'digital_human' : 'standard';
}

export function inferFissionMixAudioUsageType(
  audio: Pick<MixAudioLike, 'name' | 'path'>,
  context: 'group' | 'global' = 'global'
): FissionMixAudioUsageType {
  const text = [audio.name, audio.path].filter(Boolean).join(' ');
  if (AI_AUDIO_KEYWORDS.test(text)) return 'ai_voice';
  if (VOICE_AUDIO_KEYWORDS.test(text)) return 'voice';
  if (MUSIC_AUDIO_KEYWORDS.test(text)) return 'music';
  if (EFFECT_AUDIO_KEYWORDS.test(text)) return 'effect';
  return context === 'group' ? 'voice' : 'unknown';
}

export function buildFissionMixMatchKey(value?: string) {
  return Array.from(new Set(mediaTokens(value))).join(' ');
}

export function selectFissionMixVariantMedia<TClip extends MixClipLike, TAudio extends MixAudioLike>(input: {
  group: MixGroupLike<TClip, TAudio>;
  clips?: TClip[];
  groupAudios?: TAudio[];
  globalAudios?: TAudio[];
  variantIndex: number;
  groupIndex?: number;
}) {
  const clips = input.clips || input.group.clips || [];
  const groupAudios = input.groupAudios || input.group.groupAudios || [];
  const globalAudios = input.globalAudios || [];
  const selectionProfile = inferFissionMixSelectionProfile(input.group);
  const contentProfile: FissionMixContentProfile = selectionProfile === 'standard' ? 'standard' : 'digital_human';
  const cursor = Math.max(0, input.variantIndex + (input.groupIndex || 0));

  const groupCandidates = groupAudios.map((audio, originalIndex) => ({
    audio,
    source: 'group' as const,
    usageType: inferFissionMixAudioUsageType(audio, 'group'),
    originalIndex
  }));
  const globalCandidates = globalAudios.map((audio, originalIndex) => ({
    audio,
    source: 'global' as const,
    usageType: inferFissionMixAudioUsageType(audio, 'global'),
    originalIndex
  }));
  const allCandidates = [...groupCandidates, ...globalCandidates];
  const anchorSize = Math.max(1, clips.length, allCandidates.length);

  const clip = clips.length > 0
    ? clips[
      selectionProfile === 'standard'
        ? positiveModulo(cursor, clips.length)
        : alignedPoolIndex(cursor, clips.length, anchorSize)
    ]
    : undefined;

  const audioCandidate = pickAudioCandidate({
    selectionProfile,
    group: input.group,
    clip,
    groupCandidates,
    globalCandidates,
    cursor,
    clipCount: clips.length
  });

  return {
    selectionProfile,
    contentProfile,
    clip,
    audio: audioCandidate?.audio,
    audioUsageType: audioCandidate?.usageType,
    audioSource: audioCandidate ? resolveAudioSource(audioCandidate) : undefined,
    audioPoolSource: audioCandidate?.source,
    voiceLocked: Boolean(audioCandidate && selectionProfile !== 'standard' && isVoiceLikeUsage(audioCandidate.usageType))
  };
}

function pickAudioCandidate<TClip extends MixClipLike, TAudio extends MixAudioLike>(input: {
  selectionProfile: FissionMixSelectionProfile;
  group: MixGroupLike<TClip, TAudio>;
  clip?: TClip;
  groupCandidates: MixAudioCandidate<TAudio>[];
  globalCandidates: MixAudioCandidate<TAudio>[];
  cursor: number;
  clipCount: number;
}) {
  const pools = buildAudioPriorityPools(input.selectionProfile, input.groupCandidates, input.globalCandidates);
  for (const pool of pools) {
    if (pool.length === 0) continue;
    const desiredIndex = alignedPoolIndex(input.cursor, pool.length, Math.max(1, input.clipCount, pool.length));
    return pool
      .map((candidate, poolIndex) => ({ candidate, poolIndex }))
      .sort((left, right) => {
        const scoreDiff = scoreAudioCandidate(right.candidate, input.clip, input.group, input.selectionProfile)
          - scoreAudioCandidate(left.candidate, input.clip, input.group, input.selectionProfile);
        if (scoreDiff !== 0) return scoreDiff;
        const desiredDistance = circularDistance(left.poolIndex, desiredIndex, pool.length)
          - circularDistance(right.poolIndex, desiredIndex, pool.length);
        if (desiredDistance !== 0) return desiredDistance;
        if (left.candidate.source !== right.candidate.source) return left.candidate.source === 'group' ? -1 : 1;
        return left.candidate.originalIndex - right.candidate.originalIndex;
      })[0]?.candidate;
  }
  return undefined;
}

function buildAudioPriorityPools<TAudio extends MixAudioLike>(
  selectionProfile: FissionMixSelectionProfile,
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

  if (selectionProfile === 'digital_human') {
    return [
      [...groupAi, ...globalAi],
      [...groupVoice, ...globalVoice],
      [...groupUnknown, ...globalUnknown],
      [...groupMusicLike, ...globalMusicLike]
    ];
  }

  if (selectionProfile === 'human_presenter') {
    return [
      [...groupAi, ...groupVoice, ...globalAi, ...globalVoice],
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
  selectionProfile: FissionMixSelectionProfile
) {
  const voiceLike = isVoiceLikeUsage(candidate.usageType);
  let score = audioUsageBaseScore(candidate.usageType, selectionProfile);
  if (candidate.source === 'group') score += selectionProfile === 'human_presenter' ? 12 : 8;
  if (selectionProfile !== 'standard') score += voiceLike ? 22 : -28;

  const audioTokens = mediaTokens(candidate.audio.name);
  const clipTokens = mediaTokens(clip?.name);
  const groupTokens = mediaTokens([group.title, group.script, group.voiceover].join(' '));
  const filteredAudioTokens = audioTokens.filter((token) => !GENERIC_MATCH_TOKENS.has(token));
  const filteredClipTokens = clipTokens.filter((token) => !GENERIC_MATCH_TOKENS.has(token));
  const filteredGroupTokens = groupTokens.filter((token) => !GENERIC_MATCH_TOKENS.has(token));

  if (mediaStem(candidate.audio.name) && mediaStem(candidate.audio.name) === mediaStem(clip?.name)) {
    score += 90;
  }

  score += intersectTokens(filteredAudioTokens, filteredClipTokens) * (selectionProfile === 'standard' ? 16 : 20);
  score += intersectTokens(filteredAudioTokens, filteredGroupTokens) * (selectionProfile === 'standard' ? 4 : 9);

  const audioSceneToken = firstTokenMatching(audioTokens, /^scene\d+$/i);
  const clipSceneToken = firstTokenMatching(clipTokens, /^scene\d+$/i);
  if (audioSceneToken && clipSceneToken && audioSceneToken === clipSceneToken) score += 36;

  const audioVersionToken = firstTokenMatching(audioTokens, /^v\d+$/i);
  const clipVersionToken = firstTokenMatching(clipTokens, /^v\d+$/i);
  if (audioVersionToken && clipVersionToken && audioVersionToken === clipVersionToken) score += 26;

  score += accentAlignmentScore(
    extractAccentTokens([candidate.audio.name, candidate.audio.path].filter(Boolean).join(' ')),
    extractAccentTokens([clip?.name, group.title, group.script, group.voiceover].filter(Boolean).join(' ')),
    selectionProfile
  );

  const preferredDuration = firstPositive(parseDurationSeconds(clip?.duration), parseDurationSeconds(group.duration));
  const audioDuration = parseDurationSeconds(candidate.audio.duration);
  if (audioDuration > 0 && preferredDuration > 0) {
    const diff = Math.abs(audioDuration - preferredDuration);
    if (diff <= 0.25) score += voiceLike && selectionProfile !== 'standard' ? 34 : 18;
    else if (diff <= 0.8) score += voiceLike && selectionProfile !== 'standard' ? 24 : 12;
    else if (diff <= 1.6) score += voiceLike && selectionProfile !== 'standard' ? 14 : 6;
    else if (diff <= 2.8) score += 2;
    else if (voiceLike && selectionProfile !== 'standard') score -= Math.min(24, Math.round(diff * 4));
  }

  return score;
}

function audioUsageBaseScore(usageType: FissionMixAudioUsageType, selectionProfile: FissionMixSelectionProfile) {
  if (selectionProfile === 'digital_human') {
    if (usageType === 'ai_voice') return 132;
    if (usageType === 'voice') return 112;
    if (usageType === 'unknown') return 54;
    if (usageType === 'music') return 14;
    return 8;
  }
  if (selectionProfile === 'human_presenter') {
    if (usageType === 'voice') return 112;
    if (usageType === 'ai_voice') return 108;
    if (usageType === 'unknown') return 60;
    if (usageType === 'music') return 22;
    return 16;
  }
  if (usageType === 'ai_voice') return 90;
  if (usageType === 'voice') return 82;
  if (usageType === 'unknown') return 58;
  if (usageType === 'music') return 40;
  return 24;
}

function extractAccentTokens(value: string) {
  const tokens = new Set<string>();
  for (const [token, pattern] of ACCENT_PATTERN_ENTRIES) {
    if (pattern.test(value)) tokens.add(token);
  }
  return tokens;
}

function accentAlignmentScore(audioTokens: Set<string>, sceneTokens: Set<string>, selectionProfile: FissionMixSelectionProfile) {
  if (audioTokens.size === 0 || sceneTokens.size === 0) return 0;
  const matched = [...audioTokens].filter((token) => sceneTokens.has(token)).length;
  if (matched > 0) return matched * (selectionProfile === 'standard' ? 10 : 18);
  return selectionProfile === 'standard' ? -4 : -14;
}

function isVoiceLikeUsage(usageType: FissionMixAudioUsageType) {
  return usageType === 'ai_voice' || usageType === 'voice';
}

function firstPositive(...values: number[]) {
  return values.find((value) => value > 0) || 0;
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

function resolveAudioSource<TAudio extends MixAudioLike>(candidate: MixAudioCandidate<TAudio>): FissionMixAudioSource {
  return candidate.usageType === 'ai_voice' ? 'ai' : candidate.source;
}
