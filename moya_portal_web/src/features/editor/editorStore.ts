import { create } from 'zustand';

export type EditorMode = 'cut' | 'annotate';

export interface MaterialItem {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'image' | 'text';
  source: 'local' | 'cloud';
  path?: string;
  duration?: number;
}

export interface TimelineSegment {
  id: string;
  materialId: string;
  trackId: string;
  start: number;
  duration: number;
  label?: string;
}

interface EditorState {
  mode: EditorMode;
  draftName: string;
  materials: MaterialItem[];
  segments: TimelineSegment[];
  activeMaterialId?: string;
  selectedSegmentId?: string;
  currentTime: number;
  setMode: (mode: EditorMode) => void;
  setDraftName: (name: string) => void;
  addMaterials: (items: MaterialItem[]) => void;
  updateMaterial: (id: string, patch: Partial<MaterialItem>) => void;
  addSegment: (segment: TimelineSegment) => void;
  addMaterialToTimeline: (materialId: string) => void;
  setActiveMaterial: (id?: string) => void;
  setCurrentTime: (time: number) => void;
  selectSegment: (id?: string) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  mode: 'cut',
  draftName: '未命名剪辑',
  materials: [],
  segments: [],
  currentTime: 0,
  setMode: (mode) => set({ mode }),
  setDraftName: (draftName) => set({ draftName }),
  addMaterials: (items) => set((state) => ({ materials: [...items, ...state.materials] })),
  updateMaterial: (id, patch) =>
    set((state) => ({
      materials: state.materials.map((item) => (item.id === id ? { ...item, ...patch } : item))
    })),
  addSegment: (segment) => set((state) => ({ segments: [...state.segments, segment] })),
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
        activeMaterialId: materialId,
        currentTime: start,
        selectedSegmentId: segment.id,
        segments: [...state.segments, segment]
      };
    }),
  setActiveMaterial: (activeMaterialId) => set({ activeMaterialId }),
  setCurrentTime: (currentTime) => set({ currentTime: Math.max(0, currentTime) }),
  selectSegment: (selectedSegmentId) => set({ selectedSegmentId })
}));
