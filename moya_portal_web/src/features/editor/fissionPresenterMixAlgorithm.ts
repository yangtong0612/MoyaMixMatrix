export type PresenterSelectionProfile = 'standard' | 'human_presenter' | 'digital_human';
export type PresenterAudioUsageType = 'ai_voice' | 'voice' | 'music' | 'effect' | 'unknown';

export interface PresenterSpeechSourceLike {
  duration?: string;
  speechStart?: number;
  speechEnd?: number;
  speechDuration?: number;
}

export interface PresenterSpeechWindow {
  rawDuration: number;
  speechStart: number;
  speechEnd: number;
  effectiveDuration: number;
  trimmedLeading: number;
  trimmedTrailing: number;
  hasSpeech: boolean;
}

const PRESENTER_MIN_EFFECTIVE_SPEECH_SECONDS = 0.45;
const PRESENTER_LEADING_TRIM_THRESHOLD_SECONDS = 0.28;
const PRESENTER_TRAILING_TRIM_THRESHOLD_SECONDS = 0.24;
const PRESENTER_OVERLONG_CLIP_THRESHOLD_SECONDS = 0.55;
const PRESENTER_OVERLONG_AUDIO_THRESHOLD_SECONDS = 1.15;

export function parsePresenterDurationSeconds(value?: string) {
  if (!value) return 0;
  const trimmed = value.trim();
  const rangeIndex = Math.max(trimmed.indexOf('-'), trimmed.indexOf('~'));
  if (rangeIndex > 0) return parsePresenterDurationSeconds(trimmed.slice(0, rangeIndex));
  const clock = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (clock) {
    const hours = clock[3] ? Number(clock[1]) : 0;
    const minutes = clock[3] ? Number(clock[2]) : Number(clock[1]);
    const seconds = Number(clock[3] || clock[2]);
    return hours * 3600 + minutes * 60 + seconds;
  }
  return Number(trimmed.replace(/[^\d.]/g, '')) || 0;
}

export function isPresenterSelectionProfile(profile?: PresenterSelectionProfile) {
  return profile === 'human_presenter' || profile === 'digital_human';
}

export function isPresenterVoiceLikeUsage(usageType?: PresenterAudioUsageType | string) {
  return usageType === 'ai_voice' || usageType === 'voice';
}

export function normalizePresenterSpeechWindow(source?: PresenterSpeechSourceLike | null) {
  const speechStart = Math.max(0, Number(source?.speechStart) || 0);
  const speechEnd = Math.max(0, Number(source?.speechEnd) || 0);
  const speechDuration = Math.max(0, Number(source?.speechDuration) || 0);
  const rawDuration = Math.max(
    0,
    parsePresenterDurationSeconds(source?.duration),
    speechEnd,
    speechStart + speechDuration,
    speechDuration
  );
  if (!(rawDuration > 0)) {
    return {
      rawDuration: 0,
      speechStart: 0,
      speechEnd: 0,
      effectiveDuration: 0,
      trimmedLeading: 0,
      trimmedTrailing: 0,
      hasSpeech: false
    } satisfies PresenterSpeechWindow;
  }

  const candidateStart = clampSeconds(speechStart, 0, rawDuration);
  const inferredSpeechEnd = speechDuration > 0 ? candidateStart + speechDuration : rawDuration;
  const candidateEnd = clampSeconds(source?.speechEnd ?? inferredSpeechEnd, candidateStart, rawDuration);
  const normalizedStart = candidateStart >= PRESENTER_LEADING_TRIM_THRESHOLD_SECONDS ? candidateStart : 0;
  const normalizedEnd = rawDuration - candidateEnd >= PRESENTER_TRAILING_TRIM_THRESHOLD_SECONDS ? candidateEnd : rawDuration;
  const effectiveDuration = Math.max(0, normalizedEnd - normalizedStart);

  if (effectiveDuration < PRESENTER_MIN_EFFECTIVE_SPEECH_SECONDS) {
    return {
      rawDuration,
      speechStart: 0,
      speechEnd: rawDuration,
      effectiveDuration: rawDuration,
      trimmedLeading: 0,
      trimmedTrailing: 0,
      hasSpeech: rawDuration >= PRESENTER_MIN_EFFECTIVE_SPEECH_SECONDS
    } satisfies PresenterSpeechWindow;
  }

  return {
    rawDuration,
    speechStart: normalizedStart,
    speechEnd: normalizedEnd,
    effectiveDuration,
    trimmedLeading: normalizedStart,
    trimmedTrailing: Math.max(0, rawDuration - normalizedEnd),
    hasSpeech: true
  } satisfies PresenterSpeechWindow;
}

export function presenterSpeechAlignmentPenalty(
  clipDurationSeconds: number,
  source: PresenterSpeechSourceLike,
  selectionProfile: PresenterSelectionProfile,
  usageType?: PresenterAudioUsageType | string
) {
  if (!isPresenterSelectionProfile(selectionProfile) || !isPresenterVoiceLikeUsage(usageType)) return 0;
  const speechWindow = normalizePresenterSpeechWindow(source);
  if (!(clipDurationSeconds > 0) || !(speechWindow.effectiveDuration > 0)) return 0;

  const clipLongerThanSpeech = clipDurationSeconds - speechWindow.effectiveDuration;
  if (clipLongerThanSpeech > PRESENTER_OVERLONG_CLIP_THRESHOLD_SECONDS) {
    return -Math.min(54, Math.round(clipLongerThanSpeech * 12));
  }

  const speechLongerThanClip = speechWindow.effectiveDuration - clipDurationSeconds;
  if (speechLongerThanClip > PRESENTER_OVERLONG_AUDIO_THRESHOLD_SECONDS) {
    return -Math.min(30, Math.round(speechLongerThanClip * 6));
  }

  return 0;
}

function clampSeconds(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
