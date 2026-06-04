import { http } from '@/shared/api/http';

export interface SubtitleRecognitionSegment {
  start: number;
  end: number;
  text: string;
}

export interface SubtitleRecognitionJob {
  jobId: string;
  status: string;
  finished: boolean;
  successful: boolean;
  segments: SubtitleRecognitionSegment[];
  text: string;
  raw?: unknown;
}

export async function submitSubtitleRecognition(input: { mediaUrl: string; title?: string; startTime?: string; duration?: string }) {
  const response = await http.post<typeof input, { data: SubtitleRecognitionJob }>('/viral/subtitles/recognize', input);
  return response.data;
}

export async function getSubtitleRecognitionJob(jobId: string) {
  const response = await http.get<unknown, { data: SubtitleRecognitionJob }>(`/viral/subtitles/jobs/${encodeURIComponent(jobId)}`);
  return response.data;
}
