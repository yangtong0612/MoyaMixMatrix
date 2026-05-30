import type { MediaSplitSegmentRequest } from './types/electron';

export const materialSplitPresets = [
  { key: '3-parts', label: '三段', detail: '均分' },
  { key: '15s', label: '15秒', detail: '短切' },
  { key: '30s', label: '30秒', detail: '长切' }
] as const;

export type MaterialSplitPresetKey = typeof materialSplitPresets[number]['key'];

export interface MaterialSplitPlanSegment extends MediaSplitSegmentRequest {
  label: string;
  start: number;
  end: number;
  duration: number;
}

export function buildMaterialSplitSegments(duration: number, preset: MaterialSplitPresetKey): MaterialSplitPlanSegment[] {
  const safeDuration = Math.max(0, Number(duration) || 0);
  if (safeDuration <= 0.25) return [];
  const segmentLength = preset === '15s' ? 15 : preset === '30s' ? 30 : safeDuration / Math.min(3, Math.max(1, Math.ceil(safeDuration)));
  const segments: MaterialSplitPlanSegment[] = [];
  for (let start = 0, index = 0; start < safeDuration - 0.2; start += segmentLength, index += 1) {
    const end = Math.min(safeDuration, start + segmentLength);
    if (end - start < 0.25) break;
    segments.push({
      label: `片段 ${index + 1}`,
      start,
      end,
      duration: end - start
    });
  }
  return segments;
}
