import { create } from 'zustand';

export type EditorMode = 'cut' | 'annotate';

export interface MaterialItem {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'image' | 'text';
  source: 'local' | 'cloud';
  path?: string;
  duration?: number;
  coverUrl?: string;
}

export interface TimelineSegment {
  id: string;
  materialId: string;
  trackId: string;
  start: number;
  duration: number;
  label?: string;
}

export interface ClipSettings {
  scale: number;
  x: number;
  y: number;
  rotation: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
  speed: number;
  preservePitch: boolean;
  animation: string;
  brightness: number;
  contrast: number;
  saturation: number;
  aiEffect: string;
}

export const defaultClipSettings: ClipSettings = {
  scale: 100,
  x: 0,
  y: 0,
  rotation: 0,
  volume: 100,
  fadeIn: 0,
  fadeOut: 0,
  speed: 1,
  preservePitch: true,
  animation: 'none',
  brightness: 100,
  contrast: 100,
  saturation: 100,
  aiEffect: 'none'
};

interface EditorState {
  mode: EditorMode;
  draftName: string;
  materials: MaterialItem[];
  segments: TimelineSegment[];
  undoStack: TimelineSegment[][];
  redoStack: TimelineSegment[][];
  clipSettings: Record<string, ClipSettings>;
  coverMaterialId?: string;
  activeMaterialId?: string;
  selectedSegmentId?: string;
  currentTime: number;
  setMode: (mode: EditorMode) => void;
  setDraftName: (name: string) => void;
  addMaterials: (items: MaterialItem[]) => void;
  updateMaterial: (id: string, patch: Partial<MaterialItem>) => void;
  updateClipSettings: (id: string, patch: Partial<ClipSettings>) => void;
  setProjectCover: (materialId: string, coverUrl: string, time: number) => void;
  addSegment: (segment: TimelineSegment) => void;
  addMaterialToTimeline: (materialId: string) => void;
  addMaterialToTrack: (materialId: string, trackId: string, start?: number) => void;
  deleteSegment: (id?: string) => void;
  moveSegment: (id: string, start: number, historyBase?: TimelineSegment[]) => void;
  splitSegmentAt: (time: number, id?: string) => void;
  addVoiceoverSegment: (time: number) => void;
  undo: () => void;
  redo: () => void;
  setActiveMaterial: (id?: string) => void;
  setCurrentTime: (time: number) => void;
  selectSegment: (id?: string) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  mode: 'cut',
  draftName: '未命名剪辑',
  materials: [],
  segments: [],
  undoStack: [],
  redoStack: [],
  clipSettings: {},
  currentTime: 0,
  setMode: (mode) => set({ mode }),
  setDraftName: (draftName) => set({ draftName }),
  addMaterials: (items) => set((state) => ({ materials: [...items, ...state.materials] })),
  updateMaterial: (id, patch) =>
    set((state) => ({
      materials: state.materials.map((item) => (item.id === id ? { ...item, ...patch } : item))
    })),
  updateClipSettings: (id, patch) =>
    set((state) => ({
      clipSettings: {
        ...state.clipSettings,
        [id]: {
          ...defaultClipSettings,
          ...state.clipSettings[id],
          ...patch
        }
      }
    })),
  setProjectCover: (materialId, coverUrl, time) =>
    set((state) => {
      const coverSegment: TimelineSegment = {
        id: 'project-cover',
        materialId,
        trackId: 'cover',
        start: Math.max(0, time),
        duration: 3,
        label: '封面'
      };
      const nextSegments = [
        ...state.segments.filter((segment) => segment.id !== coverSegment.id),
        coverSegment
      ];
      return {
        coverMaterialId: materialId,
        materials: state.materials.map((item) => (item.id === materialId ? { ...item, coverUrl } : item)),
        segments: nextSegments,
        selectedSegmentId: coverSegment.id
      };
    }),
  addSegment: (segment) =>
    set((state) => ({
      undoStack: [...state.undoStack, state.segments],
      redoStack: [],
      segments: [...state.segments, segment]
    })),
  addMaterialToTimeline: (materialId) =>
    set((state) => {
      const material = state.materials.find((item) => item.id === materialId);
      const duration = material?.duration && Number.isFinite(material.duration) ? Math.max(material.duration, 1) : 14;
      const trackId = material?.type === 'audio' ? 'audio' : 'video';
      const trackSegments = state.segments.filter((segment) => segment.trackId === trackId);
      const start = trackSegments.reduce((max, segment) => Math.max(max, segment.start + segment.duration), 0);
      const segment: TimelineSegment = {
        id: crypto.randomUUID(),
        materialId,
        trackId,
        start,
        duration,
        label: material?.name || '未命名素材'
      };
      return {
        undoStack: [...state.undoStack, state.segments],
        redoStack: [],
        activeMaterialId: materialId,
        currentTime: start,
        selectedSegmentId: segment.id,
        segments: [...state.segments, segment]
      };
    }),
  addMaterialToTrack: (materialId, trackId, start) =>
    set((state) => {
      const material = state.materials.find((item) => item.id === materialId);
      const duration = material?.duration && Number.isFinite(material.duration) ? Math.max(material.duration, 1) : 14;
      const trackSegments = state.segments.filter((segment) => segment.trackId === trackId);
      const fallbackStart = trackSegments.reduce((max, segment) => Math.max(max, segment.start + segment.duration), 0);
      const segment: TimelineSegment = {
        id: crypto.randomUUID(),
        materialId,
        trackId,
        start: Math.max(0, start ?? fallbackStart),
        duration,
        label: material?.name || '未命名素材'
      };
      return {
        undoStack: [...state.undoStack, state.segments],
        redoStack: [],
        activeMaterialId: materialId,
        currentTime: segment.start,
        selectedSegmentId: segment.id,
        segments: [...state.segments, segment]
      };
    }),
  deleteSegment: (id) =>
    set((state) => {
      const segmentId = id || state.selectedSegmentId;
      if (!segmentId) return state;
      const deletedSegment = state.segments.find((segment) => segment.id === segmentId);
      return {
        undoStack: [...state.undoStack, state.segments],
        redoStack: [],
        segments: state.segments.filter((segment) => segment.id !== segmentId),
        selectedSegmentId: state.selectedSegmentId === segmentId ? undefined : state.selectedSegmentId,
        activeMaterialId: deletedSegment?.materialId === state.activeMaterialId ? undefined : state.activeMaterialId
      };
    }),
  moveSegment: (id, start, historyBase) =>
    set((state) => {
      const nextStart = Math.max(0, start);
      return {
        undoStack: historyBase ? [...state.undoStack, historyBase] : state.undoStack,
        redoStack: historyBase ? [] : state.redoStack,
        segments: state.segments.map((segment) => (segment.id === id ? { ...segment, start: nextStart } : segment)),
        selectedSegmentId: id,
        currentTime: nextStart
      };
    }),
  splitSegmentAt: (time, id) =>
    set((state) => {
      const target = state.segments.find((segment) => {
        const isTarget = id ? segment.id === id : segment.id === state.selectedSegmentId || (time > segment.start && time < segment.start + segment.duration);
        return isTarget && time > segment.start + 0.15 && time < segment.start + segment.duration - 0.15;
      });
      if (!target) return state;

      const leftDuration = time - target.start;
      const rightDuration = target.duration - leftDuration;
      const leftSegment = { ...target, duration: leftDuration };
      const rightSegment = {
        ...target,
        id: crypto.randomUUID(),
        start: time,
        duration: rightDuration,
        label: target.label ? `${target.label} - 副本` : target.label
      };

      return {
        undoStack: [...state.undoStack, state.segments],
        redoStack: [],
        segments: state.segments.flatMap((segment) => (segment.id === target.id ? [leftSegment, rightSegment] : [segment])),
        selectedSegmentId: rightSegment.id,
        currentTime: time
      };
    }),
  addVoiceoverSegment: (time) =>
    set((state) => {
      const start = Math.max(0, time);
      const segment: TimelineSegment = {
        id: crypto.randomUUID(),
        materialId: '',
        trackId: 'audio',
        start,
        duration: 5,
        label: '录音片段'
      };
      return {
        undoStack: [...state.undoStack, state.segments],
        redoStack: [],
        segments: [...state.segments, segment],
        selectedSegmentId: segment.id,
        currentTime: start
      };
    }),
  undo: () =>
    set((state) => {
      const previous = state.undoStack.at(-1);
      if (!previous) return state;
      return {
        segments: previous,
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, state.segments],
        selectedSegmentId: undefined
      };
    }),
  redo: () =>
    set((state) => {
      const next = state.redoStack.at(-1);
      if (!next) return state;
      return {
        segments: next,
        undoStack: [...state.undoStack, state.segments],
        redoStack: state.redoStack.slice(0, -1),
        selectedSegmentId: undefined
      };
    }),
  setActiveMaterial: (activeMaterialId) => set({ activeMaterialId }),
  setCurrentTime: (currentTime) => set({ currentTime: Math.max(0, currentTime) }),
  selectSegment: (selectedSegmentId) => set({ selectedSegmentId })
}));
