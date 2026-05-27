import { useEffect, useRef, useState, type CSSProperties, type DragEvent, type MouseEvent, type PointerEvent, type SyntheticEvent } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Crop,
  Download,
  Edit3,
  Eye,
  EyeOff,
  FastForward,
  FileText,
  Film,
  FolderOpen,
  ImagePlus,
  Link,
  Lock,
  Maximize2,
  Menu,
  Mic,
  MousePointer2,
  Music,
  Pause,
  Play,
  Plus,
  Rewind,
  RotateCcw,
  Save,
  ScanLine,
  Scissors,
  Settings,
  Share2,
  Shield,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  SplitSquareHorizontal,
  Star,
  Sticker,
  Trash2,
  Type,
  Undo2,
  Upload,
  UserRound,
  Volume2,
  VolumeX,
  X
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { useEditorStore, type MaterialItem } from './editorStore';
import { MaterialPanel } from './components/MaterialPanel';
import { PreviewPanel } from './components/PreviewPanel';
import { TimelinePanel } from './components/TimelinePanel';
import { InspectorPanel } from './components/InspectorPanel';
import { toMediaUrl } from './mediaUrl';
import {
  buildAliyunMixRequest,
  createAliyunOutputMediaUrl,
  getAliyunMixJobStatus,
  getAliyunStorageConfig,
  getProtectedMediaAccessUrl,
  getViralSubtitleJob,
  selectAliyunMixVariantMedia,
  submitAliyunMix,
  submitViralSubtitleRecognition,
  type ViralSubtitleSegment
} from './aliyunMix';
import {
  inferFissionMixAudioUsageType,
  inferFissionMixSelectionProfile,
  type FissionMixAudioUsageType,
  type FissionMixSelectionProfile
} from './fissionMixMatcher';
import {
  isPresenterSelectionProfile,
  isPresenterVoiceLikeUsage,
  normalizePresenterSpeechWindow
} from './fissionPresenterMixAlgorithm';
import { buildLocalFissionMixPlan } from './fissionLocalMixPlan';
import { buildWaterfallMixSelections } from './fissionWaterfallComposer';

export function EditorPage() {
  const editor = useEditorStore();
  const [searchParams] = useSearchParams();
  const [lastSavedAt, setLastSavedAt] = useState<string>('-');
  const [activeWorkflow, setActiveWorkflow] = useState<EditorWorkflow>('materials');
  const [menuOpen, setMenuOpen] = useState(false);
  const [workspaceBootstrapped, setWorkspaceBootstrapped] = useState(false);
  const [fissionDraftVersion, setFissionDraftVersion] = useState(0);
  const [finishedLibraryVersion, setFinishedLibraryVersion] = useState(0);
  const [draftLibrary, setDraftLibrary] = useState<StoredFissionDraft[]>([]);
  const fissionSnapshotRef = useRef<FissionWorkspaceDraft | null>(null);
  const activeFissionDraftIdRef = useRef('');

  useEffect(() => {
    void bootstrapDraftState();
  }, []);

  useEffect(() => {
    const workflow = searchParams.get('workflow');
    if (isEditorWorkflow(workflow)) {
      setActiveWorkflow(workflow);
    }
  }, [searchParams]);

  async function importLocalFiles() {
    const files = await window.surgicol.dialog.openFiles({
      filters: [
        { name: '媒体文件', extensions: ['mp4', 'mov', 'avi', 'mkv', 'mp3', 'wav', 'png', 'jpg', 'jpeg'] }
      ]
    });
    const materials: MaterialItem[] = files.map((filePath) => ({
      id: crypto.randomUUID(),
      name: filePath.split(/[\\/]/).pop() || filePath,
      type: materialType(filePath),
      source: 'local',
      path: filePath
    }));
    editor.addMaterials(materials);
    if (materials[0]) {
      editor.setActiveMaterial(materials[0].id);
    }
  }

  async function saveDraft() {
    if (activeWorkflow === 'fission') {
      await saveCurrentFissionDraft('manual');
    } else {
      await window.surgicol.editor.createDraft({ name: editor.draftName });
    }
    setLastSavedAt(new Date().toLocaleTimeString());
  }

  async function bootstrapDraftState() {
    const drafts = await window.surgicol.store.get<StoredFissionDraft[]>(FISSION_DRAFT_LIBRARY_KEY).catch(() => []);
    const activeDraftId = await window.surgicol.store.get<string>(ACTIVE_FISSION_DRAFT_ID_KEY).catch(() => '');
    const currentWorkspaceSnapshot = await window.surgicol.store.get<FissionWorkspaceDraft>(FISSION_WORKSPACE_DRAFT_KEY).catch(() => null);
    const draftList = Array.isArray(drafts) ? drafts : [];
    setDraftLibrary(draftList);
    const activeDraft = draftList.find((draft) => draft.id === activeDraftId) || draftList[0];
    if (activeDraft?.name) {
      editor.setDraftName(activeDraft.name);
      activeFissionDraftIdRef.current = activeDraft.id;
      if (currentWorkspaceSnapshot) {
        fissionSnapshotRef.current = currentWorkspaceSnapshot;
        await syncActiveFissionDraftSnapshot(currentWorkspaceSnapshot, activeDraft.name, true);
      } else if (activeDraft.snapshot) {
        fissionSnapshotRef.current = activeDraft.snapshot;
        await window.surgicol.store.set(FISSION_WORKSPACE_DRAFT_KEY, activeDraft.snapshot);
      }
    } else {
      if (currentWorkspaceSnapshot) {
        fissionSnapshotRef.current = currentWorkspaceSnapshot;
        await syncActiveFissionDraftSnapshot(currentWorkspaceSnapshot, editor.draftName, true);
      }
      const latestDrafts = await window.surgicol.editor.listDrafts().catch(() => []);
      if (latestDrafts[0]) editor.setDraftName(latestDrafts[0].name);
    }
    setWorkspaceBootstrapped(true);
  }

  async function persistFissionDraftLibrary(nextDrafts: StoredFissionDraft[], activeDraftId?: string) {
    setDraftLibrary(nextDrafts);
    await window.surgicol.store.set(FISSION_DRAFT_LIBRARY_KEY, nextDrafts);
    if (activeDraftId) {
      activeFissionDraftIdRef.current = activeDraftId;
      await window.surgicol.store.set(ACTIVE_FISSION_DRAFT_ID_KEY, activeDraftId);
    }
  }

  async function syncActiveFissionDraftSnapshot(snapshot: FissionWorkspaceDraft, preferredName?: string, silent = false) {
    const now = new Date().toISOString();
    const draftName = (preferredName || editor.draftName).trim() || `裂变草稿 ${formatDraftTimestamp(new Date())}`;
    const existingDrafts = await window.surgicol.store.get<StoredFissionDraft[]>(FISSION_DRAFT_LIBRARY_KEY).catch(() => []);
    const draftList = Array.isArray(existingDrafts) ? existingDrafts : [];
    const draftId = activeFissionDraftIdRef.current || crypto.randomUUID();
    const existingDraft = draftList.find((draft) => draft.id === draftId);
    const nextDraft: StoredFissionDraft = {
      id: draftId,
      name: draftName,
      createdAt: existingDraft?.createdAt || now,
      updatedAt: now,
      workflow: 'fission',
      snapshot
    };
    const nextDrafts = [nextDraft, ...draftList.filter((draft) => draft.id !== draftId)].slice(0, 20);
    await persistFissionDraftLibrary(nextDrafts, draftId);
    await window.surgicol.store.set(FISSION_WORKSPACE_DRAFT_KEY, snapshot);
    if (!silent) {
      setLastSavedAt(new Date().toLocaleTimeString());
    }
  }

  async function saveCurrentFissionDraft(mode: 'manual' | 'auto' | 'switch' = 'manual') {
    if (!fissionSnapshotRef.current) return;
    await syncActiveFissionDraftSnapshot(fissionSnapshotRef.current, editor.draftName, mode === 'auto');
  }

  async function createNewFissionWorkspace() {
    if (fissionSnapshotRef.current) {
      await saveCurrentFissionDraft('switch');
    }
    const now = new Date();
    const draftId = crypto.randomUUID();
    const draftName = `裂变工作 ${formatDraftTimestamp(now)}`;
    const snapshot = createEmptyFissionWorkspaceDraft();
    editor.setDraftName(draftName);
    await persistFissionDraftLibrary([
      {
        id: draftId,
        name: draftName,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        workflow: 'fission' as const,
        snapshot
      },
      ...draftLibrary.filter((draft) => draft.id !== draftId)
    ].slice(0, 20), draftId);
    await window.surgicol.store.set(FISSION_WORKSPACE_DRAFT_KEY, snapshot);
    fissionSnapshotRef.current = snapshot;
    setFissionDraftVersion((value) => value + 1);
    setActiveWorkflow('fission');
    setMenuOpen(false);
    setLastSavedAt(new Date().toLocaleTimeString());
  }

  async function restoreFissionDraft(draftId: string) {
    if (fissionSnapshotRef.current) {
      await saveCurrentFissionDraft('switch');
    }
    const targetDraft = draftLibrary.find((draft) => draft.id === draftId);
    if (!targetDraft) return;
    editor.setDraftName(targetDraft.name);
    activeFissionDraftIdRef.current = targetDraft.id;
    await window.surgicol.store.set(FISSION_WORKSPACE_DRAFT_KEY, targetDraft.snapshot);
    await window.surgicol.store.set(ACTIVE_FISSION_DRAFT_ID_KEY, targetDraft.id);
    fissionSnapshotRef.current = targetDraft.snapshot;
    setFissionDraftVersion((value) => value + 1);
    setActiveWorkflow('fission');
    setMenuOpen(false);
  }

  useEffect(() => {
    if (!workspaceBootstrapped) return;
    const handleBeforeUnload = () => {
      if (activeWorkflow === 'fission' && fissionSnapshotRef.current) {
        void saveCurrentFissionDraft('auto');
      }
    };
    const handleOffline = () => {
      if (activeWorkflow === 'fission' && fissionSnapshotRef.current) {
        void saveCurrentFissionDraft('auto');
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('offline', handleOffline);
    };
  }, [activeWorkflow, workspaceBootstrapped]);

  return (
    <section className="page editor-page">
      <header className="editor-topbar">
        <div className="editor-menu">
          <button className="editor-menu-button" type="button" onClick={() => setMenuOpen((open) => !open)}>菜单</button>
          {menuOpen ? (
            <div className="editor-menu-panel">
              <button type="button" onClick={() => void createNewFissionWorkspace()}>新建裂变工作</button>
              <button type="button" onClick={() => void saveCurrentFissionDraft('manual')} disabled={activeWorkflow !== 'fission'}>保存当前草稿</button>
              <div className="editor-menu-panel-title">最近草稿</div>
              {draftLibrary.length === 0 ? (
                <span className="editor-menu-empty">还没有裂变草稿</span>
              ) : (
                draftLibrary.slice(0, 5).map((draft) => (
                  <button type="button" key={draft.id} onClick={() => void restoreFissionDraft(draft.id)}>
                    {draft.name}
                  </button>
                ))
              )}
            </div>
          ) : null}
          <span className="save-status">
            <CheckCircle2 size={14} />
            {lastSavedAt === '-' ? '自动保存本地' : `已保存 ${lastSavedAt}`}
          </span>
        </div>

        <div className="editor-project-title">
          <input value={editor.draftName} onChange={(event) => editor.setDraftName(event.target.value)} />
        </div>

        <div className="editor-actions">
          <div className="segmented-control compact-mode">
            <button type="button" className={clsx(editor.mode === 'cut' && 'active')} onClick={() => editor.setMode('cut')}>
              剪辑
            </button>
            <button type="button" className={clsx(editor.mode === 'annotate' && 'active')} onClick={() => editor.setMode('annotate')}>
              标注
            </button>
          </div>
          <button type="button" onClick={saveDraft}>
            <Save size={15} />
            <span>保存</span>
          </button>
          <button className="primary-action" type="button">
            <Upload size={15} />
            <span>导出</span>
          </button>
        </div>
      </header>

      <div className="editor-tool-tabs workflow-tabs">
        {editorWorkflowTabs.map((tab) => (
          <button
            className={clsx(activeWorkflow === tab.id && 'active')}
            type="button"
            key={tab.id}
            onClick={() => setActiveWorkflow(tab.id)}
          >
            <tab.icon size={18} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {activeWorkflow === 'materials' ? (
        <div className="editor-workspace">
          <div className="editor-stage">
            <MaterialPanel onImport={importLocalFiles} />
            <PreviewPanel />
            <InspectorPanel draftName={editor.draftName} mode={editor.mode} />
          </div>
          <div className="editor-timeline-area">
            <TimelinePanel />
          </div>
        </div>
      ) : activeWorkflow === 'viral' ? (
        <ViralPackagingWorkspace
          projectName={editor.draftName}
          onSavedToFinishedLibrary={(savedCount) => {
            if (savedCount > 0) {
              setFinishedLibraryVersion((value) => value + 1);
              setActiveWorkflow('finished');
            }
          }}
        />
      ) : activeWorkflow === 'fission' ? (
        workspaceBootstrapped ? (
          <FissionWorkspace
            key={`fission-${fissionDraftVersion}`}
            projectName={editor.draftName}
            projectId={activeFissionDraftIdRef.current}
            onSavedToFinishedLibrary={(savedCount) => {
              if (savedCount > 0) {
                setFinishedLibraryVersion((value) => value + 1);
                setActiveWorkflow('finished');
              }
            }}
            onDraftStateChange={(snapshot) => {
              fissionSnapshotRef.current = snapshot;
            }}
            onDraftAutoSaved={(snapshot) => {
              fissionSnapshotRef.current = snapshot;
              setLastSavedAt(new Date().toLocaleTimeString());
              void syncActiveFissionDraftSnapshot(snapshot, editor.draftName, true);
            }}
          />
        ) : null
      ) : activeWorkflow === 'finished' ? (
        <FinishedVideosWorkspace refreshToken={finishedLibraryVersion} />
      ) : activeWorkflow === 'optimize' ? (
        <CombinationOptimizeWorkspace refreshToken={finishedLibraryVersion} />
      ) : (
        <MatrixPublishWorkspace />
      )}
    </section>
  );
}

function materialType(filePath: string): MaterialItem['type'] {
  const ext = filePath.split('.').pop()?.toLowerCase();
  if (['mp3', 'wav', 'aac', 'flac'].includes(ext || '')) return 'audio';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext || '')) return 'image';
  return 'video';
}

export const editorToolGroups = [
  { label: '选择', icon: MousePointer2 },
  { label: '分割', icon: SplitSquareHorizontal },
  { label: '配音', icon: Mic },
  { label: '适配', icon: Maximize2 },
  { label: '素材库', icon: FolderOpen },
  { label: '导出', icon: Download },
  { label: '设置', icon: Settings }
];

const editorFeatureTabs = [
  { label: '素材', icon: FolderOpen },
  { label: '音频', icon: Music },
  { label: '文本', icon: Type },
  { label: '贴纸', icon: Sticker },
  { label: '特效', icon: Star },
  { label: '转场', icon: Shuffle },
  { label: 'AI字幕', icon: FileText },
  { label: '智能包装', icon: Sparkles },
  { label: '滤镜', icon: SlidersHorizontal },
  { label: '数字人', icon: UserRound },
  { label: '导入', icon: Plus }
];

type EditorWorkflow = 'materials' | 'viral' | 'fission' | 'finished' | 'optimize' | 'publish';

const editorWorkflowTabs: Array<{ id: EditorWorkflow; label: string; icon: typeof FolderOpen }> = [
  { id: 'materials', label: '基础素材', icon: FolderOpen },
  { id: 'viral', label: '网感剪辑', icon: Sparkles },
  { id: 'fission', label: '极速裂变', icon: Sparkles },
  { id: 'finished', label: '成片库', icon: FileText },
  { id: 'optimize', label: '组合优化', icon: Shuffle },
  { id: 'publish', label: '矩阵发布', icon: Share2 }
];

function isEditorWorkflow(value: string | null): value is EditorWorkflow {
  return value === 'materials' || value === 'viral' || value === 'fission' || value === 'finished' || value === 'optimize' || value === 'publish';
}

const fissionSteps = [
  { title: '开头', count: 8, duration: '2.10s-8.20s', active: false },
  { title: '平台引入', count: 1, duration: '3.32s', active: false },
  { title: '特点', count: 2, duration: '4.72s-6.70s', active: true },
  { title: '详情', count: 2, duration: '5.52s-7.12s', active: false },
  { title: 'END', count: 2, duration: '6.32s-7.40s', active: false }
];

const fissionStrategies = [
  { name: '开头', count: 8, mode: '单镜头', position: '固定 #1' },
  { name: '平台引入', count: 1, mode: '单镜头', position: '固定 #2' },
  { name: '特点', count: 2, mode: '单镜头', position: '固定 #3' },
  { name: '详情', count: 2, mode: '单镜头', position: '固定 #4' },
  { name: 'END', count: 2, mode: '单镜头', position: '固定 #5' }
];

const fissionMaterials = [
  { label: '5', name: '开头' },
  { label: '1', name: '平台引入' },
  { label: '2', name: '特点' },
  { label: '2', name: '详情' },
  { label: '1', name: 'END' },
  { label: '3', name: '产品' }
];

interface FissionShotGroup {
  id: string;
  sceneNo: number;
  title: string;
  displayTitle?: string;
  sourceFormat?: 'plain' | 'markdown' | 'csv' | 'json';
  sourceDocumentTitle?: string;
  sourceDocumentMeta?: string;
  count: number;
  duration: string;
  script: string;
  voiceover: string;
  clips: Array<{ id: string; name: string; duration: string; coverTone: string; path?: string; localPath?: string; uploadStatus?: FissionUploadStatus; uploadError?: string }>;
  groupAudios?: FissionAudioItem[];
}

interface FissionAudioItem {
  id: string;
  name: string;
  duration: string;
  volume: number;
  usageType?: FissionMixAudioUsageType;
  speechStart?: number;
  speechEnd?: number;
  speechDuration?: number;
  path?: string;
  localPath?: string;
  uploadStatus?: FissionUploadStatus;
  uploadError?: string;
}

type FissionUploadStatus = 'local' | 'uploading' | 'uploaded' | 'failed';

type FissionComboMode = 'single' | 'once' | 'smart';
type FissionSettingsTab = 'group' | 'sound' | 'strategy';

interface FissionSoundSettings {
  followAudioSpeed: boolean;
  retainOriginalAudio: boolean;
  ducking: boolean;
  fadeInOut: boolean;
  volume: number;
}

type GeneratedFissionVideo = FissionPreviewItem & {
  audioName?: string;
  bgmName?: string;
  coverPath?: string;
  groupDetails?: GeneratedFissionGroupDetail[];
  jobId?: string;
  jobStatus?: FissionJobStatus;
  jobStatusText?: string;
  jobMessage?: string;
  previewMode?: 'mixed' | 'proxy';
  resultBatchKey?: string;
  resultBatchName?: string;
  resultBatchSummary?: string;
  resultBatchSceneTitles?: string[];
  resultBatchView?: 'segments' | 'waterfall';
};

interface GeneratedFissionGroupDetail {
  groupId: string;
  groupName: string;
  clipName?: string;
  audioName?: string;
  audioSource?: 'group' | 'global' | 'ai';
  contentProfile?: 'standard' | 'human_presenter' | 'digital_human';
  coverPath?: string;
}

type FissionJobStatus = 'preparing' | 'submitted' | 'running' | 'success' | 'failed';

type PreviewMediaState = {
  type: 'video' | 'audio';
  name: string;
  path?: string;
  muted?: boolean;
  badge?: string;
  note?: string;
  loading?: boolean;
  helperText?: string;
  error?: string;
  requestKey?: string;
};

interface FissionWorkspaceDraft {
  groups: FissionShotGroup[];
  audioItems: FissionAudioItem[];
  activeGroupId?: string;
  expandedIds?: string[];
  selectedClipIdsByGroup?: Record<string, string[]>;
  comboMode?: FissionComboMode;
  generatedVideos?: GeneratedFissionVideo[];
  mixBatchCount?: number;
  activeSettingsTab?: FissionSettingsTab;
  soundSettings?: FissionSoundSettings;
}

interface StoredFissionDraft {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  workflow: 'fission';
  snapshot: FissionWorkspaceDraft;
}

interface GeneratedResultBatchGroup {
  key: string;
  name: string;
  summary: string;
  sceneTitles: string[];
  view: 'segments' | 'waterfall';
  videos: GeneratedFissionVideo[];
}

type FissionPreviewItem = {
  id: string;
  groupId: string;
  groupName: string;
  label: number;
  name: string;
  coverTone: string;
  duration?: string;
  path?: string;
  localPath?: string;
};

const defaultFissionGroups: FissionShotGroup[] = [
  {
    id: 'opening',
    sceneNo: 1,
    title: '开头',
    count: 8,
    duration: '2.10s-8.20s',
    script: '开场抓住注意力，快速露出产品或场景。',
    voiceover: '先别划走，这个场景很多人都会遇到。',
    clips: [
      { id: 'opening-1', name: '开头_001', duration: '3.32s', coverTone: 'warm' },
      { id: 'opening-2', name: '开头_002', duration: '4.18s', coverTone: 'dark' }
    ]
  },
  {
    id: 'intro',
    sceneNo: 2,
    title: '平台引入',
    count: 1,
    duration: '3.32s',
    script: '承接平台语境，引入口播和卖点。',
    voiceover: '今天用一个真实案例，把重点讲清楚。',
    clips: [{ id: 'intro-1', name: '平台引入_001', duration: '3.32s', coverTone: 'cool' }]
  },
  {
    id: 'feature',
    sceneNo: 3,
    title: '特点',
    count: 2,
    duration: '4.72s-6.70s',
    script: '展示核心特点，匹配画面细节和字幕。',
    voiceover: '它的核心特点，是能把复杂流程变得更直接。',
    clips: [{ id: 'feature-1', name: '特点_001', duration: '5.46s', coverTone: 'warm' }]
  },
  {
    id: 'detail',
    sceneNo: 4,
    title: '详情',
    count: 2,
    duration: '5.52s-7.12s',
    script: '补充产品细节、使用过程和信任信息。',
    voiceover: '细节上可以看到，使用过程并不需要额外学习。',
    clips: [{ id: 'detail-1', name: '详情_001', duration: '6.28s', coverTone: 'dark' }]
  },
  {
    id: 'ending',
    sceneNo: 10,
    title: '结尾种草收尾',
    count: 2,
    duration: '6.32s-7.40s',
    script: '成品氛围感定格，温柔滤镜收尾',
    voiceover: '想要简单高效护肤、养出透亮好皮肤，这一套真的可以闭眼入手。',
    clips: [{ id: 'ending-1', name: 'END_001', duration: '4.80s', coverTone: 'cool' }]
  }
];

const FISSION_WORKSPACE_DRAFT_KEY = 'editor:fission-workspace-draft';
const FISSION_DRAFT_LIBRARY_KEY = 'editor:fission-draft-library';
const ACTIVE_FISSION_DRAFT_ID_KEY = 'editor:fission-active-draft-id';
const DEFAULT_MIX_BATCH_COUNT = 10;
const FISSION_MIX_BATCH_OPTIONS = [5, 10, 20, 30, 50] as const;
const FISSION_AUDIO_USAGE_OPTIONS: Array<{ value: FissionMixAudioUsageType; label: string }> = [
  { value: 'voice', label: '口播' },
  { value: 'ai_voice', label: 'AI配音' },
  { value: 'music', label: 'BGM' },
  { value: 'effect', label: '音效' },
  { value: 'unknown', label: '未分类' }
];

function normalizeFissionBatchCount(value: unknown, fallback = DEFAULT_MIX_BATCH_COUNT) {
  const nextCount = Math.floor(Number(value));
  if (!Number.isFinite(nextCount)) return fallback;
  return Math.max(1, Math.min(100, nextCount));
}

function createDefaultFissionClipSelectionMap(groups: FissionShotGroup[]) {
  return Object.fromEntries(groups.map((group) => [group.id, group.clips.map((clip) => clip.id)]));
}

function normalizeFissionClipSelectionMap(groups: FissionShotGroup[], input?: Record<string, string[]>) {
  let changed = false;
  const next = Object.fromEntries(groups.map((group) => {
    const validClipIds = new Set(group.clips.map((clip) => clip.id));
    const hasStoredValue = Boolean(input) && Object.prototype.hasOwnProperty.call(input, group.id);
    const fallbackIds = group.clips.map((clip) => clip.id);
    const rawIds = hasStoredValue ? input?.[group.id] : fallbackIds;
    const normalizedIds = Array.from(new Set((Array.isArray(rawIds) ? rawIds : fallbackIds).filter((id): id is string => validClipIds.has(id))));
    if (!hasStoredValue || normalizedIds.length !== (rawIds || []).length) {
      changed = true;
    }
    return [group.id, normalizedIds];
  })) as Record<string, string[]>;
  if (input && Object.keys(input).some((groupId) => !groups.some((group) => group.id === groupId))) {
    changed = true;
  }
  return { changed, selectionMap: next };
}

function resolveSelectedClipIdsForGroup(group: FissionShotGroup, selectedClipIdsByGroup: Record<string, string[]>) {
  return selectedClipIdsByGroup[group.id] || group.clips.map((clip) => clip.id);
}

function filterFissionGroupsBySelectedClips(groups: FissionShotGroup[], selectedClipIdsByGroup: Record<string, string[]>) {
  return groups
    .map((group) => {
      const selectedIds = new Set(resolveSelectedClipIdsForGroup(group, selectedClipIdsByGroup));
      return {
        ...group,
        clips: group.clips.filter((clip) => selectedIds.has(clip.id))
      };
    })
    .filter((group) => group.clips.length > 0);
}

function countSelectedFissionClips(groups: FissionShotGroup[], selectedClipIdsByGroup: Record<string, string[]>) {
  return groups.reduce((total, group) => total + resolveSelectedClipIdsForGroup(group, selectedClipIdsByGroup).length, 0);
}

function estimateSelectedFissionCombinationCount(groups: FissionShotGroup[], selectedClipIdsByGroup: Record<string, string[]>) {
  const activeCounts = groups
    .map((group) => resolveSelectedClipIdsForGroup(group, selectedClipIdsByGroup).length)
    .filter((count) => count > 0);
  if (activeCounts.length === 0) return 0;
  return activeCounts.reduce((total, count) => Math.min(5000, total * count), 1);
}

function buildGeneratedResultSelectionKey(groups: Pick<FissionShotGroup, 'id' | 'clips'>[]) {
  return groups
    .map((group) => `${group.id}:${group.clips.map((clip) => clip.id).join(',')}`)
    .join('|');
}

function buildGeneratedResultBatchKey(view: 'segments' | 'waterfall', groups: Pick<FissionShotGroup, 'id' | 'clips'>[]) {
  return `${view}:${buildGeneratedResultSelectionKey(groups)}`;
}

function describeGeneratedResultBatch(view: 'segments' | 'waterfall', groups: Pick<FissionShotGroup, 'title' | 'displayTitle' | 'sceneNo' | 'clips'>[], batchCount: number) {
  const clipCount = groups.reduce((total, group) => total + group.clips.length, 0);
  const sceneTitles = Array.from(new Set(groups.map((group) => group.displayTitle || group.title).filter(Boolean)));
  return {
    name: view === 'waterfall' ? '瀑布流组合' : '分镜组合',
    summary: `${groups.length}个分镜 · ${clipCount}个素材 · ${batchCount}条结果`,
    sceneTitles
  };
}

function getGeneratedResultBatchKey(video: GeneratedFissionVideo) {
  return video.resultBatchKey || `legacy:${video.groupId || video.id}`;
}

function replaceGeneratedResultBatch(videos: GeneratedFissionVideo[], batchKey: string, nextBatchVideos: GeneratedFissionVideo[]) {
  const preserved = videos.filter((video) => getGeneratedResultBatchKey(video) !== batchKey);
  return [...preserved, ...nextBatchVideos];
}

function buildGeneratedResultBatchGroups(videos: GeneratedFissionVideo[]): GeneratedResultBatchGroup[] {
  const batches = new Map<string, GeneratedResultBatchGroup>();
  videos.forEach((video) => {
    const key = getGeneratedResultBatchKey(video);
    const existing = batches.get(key);
    const sceneTitles = Array.from(new Set(
      (video.resultBatchSceneTitles && video.resultBatchSceneTitles.length > 0
        ? video.resultBatchSceneTitles
        : (video.groupDetails || []).map((detail) => detail.groupName)
      )
        .filter((title): title is string => Boolean(title))
    ));
    if (existing) {
      existing.videos.push(video);
      if (!existing.summary && video.resultBatchSummary) existing.summary = video.resultBatchSummary;
      if (sceneTitles.length > 0) {
        existing.sceneTitles = Array.from(new Set([...existing.sceneTitles, ...sceneTitles]));
      }
      return;
    }
    batches.set(key, {
      key,
      name: video.resultBatchName || video.groupName || '历史混剪结果',
      summary: video.resultBatchSummary || `${video.groupDetails?.length || 1} 个分镜 · ${video.label || 1} 条结果`,
      sceneTitles,
      view: video.resultBatchView || (/瀑布流/i.test(video.resultBatchName || video.groupName || '') ? 'waterfall' : 'segments'),
      videos: [video]
    });
  });
  return Array.from(batches.values());
}

type FissionAudioScope = 'global' | 'group';

function formatFissionMediaDuration(durationSeconds: number, fallback: string) {
  if (!(durationSeconds > 0)) return fallback;
  if (durationSeconds >= 3600) {
    const hours = Math.floor(durationSeconds / 3600);
    const minutes = Math.floor((durationSeconds % 3600) / 60);
    const seconds = Math.round(durationSeconds % 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  if (durationSeconds >= 60) {
    return formatViralDuration(durationSeconds);
  }
  return `${durationSeconds.toFixed(durationSeconds < 10 ? 2 : 1)}s`;
}

function isFissionHumanPresenterProfile(profile: FissionMixSelectionProfile) {
  return isPresenterSelectionProfile(profile);
}

function resolveImportedFissionAudioUsage(
  audio: Pick<FissionAudioItem, 'name' | 'localPath' | 'path' | 'usageType'>,
  scope: FissionAudioScope,
  groups: FissionShotGroup[]
): FissionMixAudioUsageType {
  if (scope === 'global') {
    return audio.usageType === 'effect' ? 'effect' : 'music';
  }
  const inferred = inferFissionMixAudioUsageType({
    name: audio.name,
    path: audio.localPath || audio.path,
    usageType: audio.usageType
  }, scope);
  return inferred;
}

function resolveFissionAudioUsageLabel(usageType?: FissionMixAudioUsageType) {
  return FISSION_AUDIO_USAGE_OPTIONS.find((option) => option.value === usageType)?.label || '未分类';
}

async function probeLocalMediaMetadata(filePath?: string) {
  const probe = window.surgicol?.media?.probeFile;
  if (!filePath || typeof probe !== 'function') return null;
  try {
    return await probe(filePath);
  } catch {
    return null;
  }
}

function readFissionWorkspaceDraft(value: unknown): FissionWorkspaceDraft | null {
  if (!value || typeof value !== 'object') return null;
  const draft = value as Partial<FissionWorkspaceDraft>;
  return {
    groups: Array.isArray(draft.groups) ? draft.groups : defaultFissionGroups,
    audioItems: Array.isArray(draft.audioItems) ? draft.audioItems : [],
    activeGroupId: typeof draft.activeGroupId === 'string' ? draft.activeGroupId : undefined,
    expandedIds: Array.isArray(draft.expandedIds) ? draft.expandedIds.filter((id): id is string => typeof id === 'string') : undefined,
    selectedClipIdsByGroup: draft.selectedClipIdsByGroup && typeof draft.selectedClipIdsByGroup === 'object'
      ? Object.fromEntries(
        Object.entries(draft.selectedClipIdsByGroup).map(([groupId, ids]) => [
          groupId,
          Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []
        ])
      )
      : undefined,
    comboMode: draft.comboMode === 'single' || draft.comboMode === 'once' || draft.comboMode === 'smart' ? draft.comboMode : undefined,
    generatedVideos: Array.isArray(draft.generatedVideos) ? draft.generatedVideos : undefined,
    mixBatchCount: normalizeFissionBatchCount(draft.mixBatchCount),
    activeSettingsTab: draft.activeSettingsTab === 'group' || draft.activeSettingsTab === 'sound' || draft.activeSettingsTab === 'strategy'
      ? draft.activeSettingsTab
      : undefined,
    soundSettings: draft.soundSettings
  };
}

function createEmptyFissionWorkspaceDraft(): FissionWorkspaceDraft {
  return {
    groups: defaultFissionGroups,
    audioItems: [],
    activeGroupId: defaultFissionGroups[0]?.id,
    expandedIds: defaultFissionGroups[0]?.id ? [defaultFissionGroups[0].id] : [],
    selectedClipIdsByGroup: createDefaultFissionClipSelectionMap(defaultFissionGroups),
    comboMode: 'single',
    generatedVideos: [],
    mixBatchCount: DEFAULT_MIX_BATCH_COUNT,
    activeSettingsTab: 'group',
    soundSettings: defaultFissionSoundSettings
  };
}

const defaultFissionSoundSettings: FissionSoundSettings = {
  followAudioSpeed: true,
  retainOriginalAudio: true,
  ducking: true,
  fadeInOut: true,
  volume: 100
};

interface FinishedVideoItem {
  id: string;
  name: string;
  duration: string;
  recommend: string;
  compliance: string;
  difference: string;
  path?: string;
  localPath?: string;
  jobId?: string;
  savedAt?: string;
  draftName?: string;
  batchName?: string;
  coverPath?: string;
  groupDetails?: GeneratedFissionGroupDetail[];
  viralOverlay?: ViralRecentTask;
}

interface FissionGeneratePreflightDialog {
  title: string;
  message: string;
  batchCount: number;
  view: 'segments' | 'waterfall';
  canContinue: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface FinishedVideoGroup {
  id: string;
  draftId?: string;
  draftName: string;
  savedAt: string;
  updatedAt: string;
  videoCount: number;
  videos: FinishedVideoItem[];
}

const FINISHED_VIDEOS_KEY = 'editor:finished-videos';

const publishChannels = [
  { name: '抖音企业号', state: '已授权', plan: '今晚 20:30' },
  { name: '视频号', state: '待授权', plan: '未设置' },
  { name: '小红书', state: '已授权', plan: '明天 11:00' }
];

type ViralTemplateKey = 'street' | 'seed' | 'deal' | 'story' | 'list' | 'expert' | 'compare' | 'urgency' | 'local' | 'live';

interface ViralTemplate {
  key: ViralTemplateKey;
  name: string;
  scene: string;
  rhythm: string;
  accent: string;
  caption: string;
  effects: string[];
}

interface ViralTemplateCard extends ViralTemplate {
  cardId: string;
  cardName: string;
  variantIndex: number;
  custom?: boolean;
  sourceSummary?: string;
}

interface ViralTemplateTheme {
  titleBackground: string;
  titleColor: string;
  captionBackground: string;
  captionColor: string;
  keywordBackground: string;
  keywordColor: string;
  effectBackground: string;
  glowColor: string;
}

interface ViralTimelineClip {
  id: string;
  start: number;
  end: number;
}

interface ViralOverlayTextStyle {
  fontSize: number;
  fontFamily: string;
  width: number;
  height: number;
}

interface ViralVideoSize {
  width: number;
  height: number;
}

type ViralPreviewVideoFit = 'contain' | 'cover' | 'fill';
type ViralTemplateMakerMode = 'manual' | 'analyze';
type ViralTemplateMarkerZone = 'opening' | 'body' | 'ending' | 'global';

interface ViralTemplateMarker {
  id: string;
  label: string;
  zone: ViralTemplateMarkerZone;
}

interface ViralPackageVersion {
  id: string;
  label: number;
  name: string;
  hook: string;
  duration: string;
  subtitleStyle: string;
  sound: string;
  effects: string[];
  score: number;
  path?: string;
  coverPath?: string;
}

interface ViralRecentTask {
  id: string;
  name: string;
  path?: string;
  templateKey: ViralTemplateKey;
  templateCardId?: string;
  keywords: string;
  savedAt: string;
  duration: string;
  finishedCount?: number;
  hook?: string;
  templateName?: string;
  titlePosition?: { x: number; y: number };
  captionPosition?: { x: number; y: number };
  titleTextStyle?: ViralOverlayTextStyle;
  captionTextStyle?: ViralOverlayTextStyle;
  previewVideoFit?: ViralPreviewVideoFit;
  subtitleSegments?: ViralCaptionSegment[];
  mediaUrl?: string;
  subtitleJobId?: string;
  videoWidth?: number;
  videoHeight?: number;
}

interface ViralCaptionSegment {
  time: string;
  text: string;
  translation?: string;
}

const VIRAL_TIMELINE_DURATION = 13;
const VIRAL_TEMPLATE_PREVIEW_DURATION = 10;
const VIRAL_RECENT_TASKS_KEY = 'editor:viral-recent-tasks';
const VIRAL_CUSTOM_TEMPLATES_KEY = 'editor:viral-custom-templates';

const viralTemplates: ViralTemplate[] = [
  {
    key: 'street',
    name: '街访爆点',
    scene: '前三秒强钩子，字幕大字居中，适合口播、探店、测评',
    rhythm: '快切 0.8x-1.2x / 每 2 秒一次强调',
    accent: '蓝白描边大标题',
    caption: '关键词跳字 + 数字高亮',
    effects: ['开场冲击标题', '关键词花字', '轻微推拉', '转场音效', '结尾行动指令']
  },
  {
    key: 'seed',
    name: '种草清单',
    scene: '产品卖点逐条展开，适合美妆、服饰、家居',
    rhythm: '稳定口播 + 卖点处放大 108%',
    accent: '柔和贴纸标签',
    caption: '双行字幕 + 卖点色块',
    effects: ['卖点标签', '价格/利益点花字', 'BGM 自动压低', '柔光滤镜', '封面标题']
  },
  {
    key: 'deal',
    name: '成交转化',
    scene: '痛点-方案-证明-行动，适合课程、服务、本地生活',
    rhythm: '前 5 秒密集信息，CTA 段加重音效',
    accent: '黑黄警示标题',
    caption: '痛点词红色强调',
    effects: ['痛点弹幕', '案例截图框', '信任背书贴纸', 'CTA 按钮动效', '收尾提示音']
  },
  {
    key: 'story',
    name: '故事反转',
    scene: '先设悬念再解释，适合个人 IP、剧情口播',
    rhythm: '悬念停顿 + 反转点闪白',
    accent: '电影感字幕条',
    caption: '分句字幕 + 情绪词强调',
    effects: ['悬念标题', '反转闪白', '镜头慢推', '情绪音效', '结尾复盘卡']
  },
  {
    key: 'list',
    name: '清单盘点',
    scene: '按 1/2/3 递进讲卖点，适合教程、工具、好物合集',
    rhythm: '每 1.5 秒切一条 / 条目出现时轻弹',
    accent: '编号标签 + 清单进度',
    caption: '短句字幕 + 序号高亮',
    effects: ['编号卡片', '进度条', '条目弹出', '清单音效', '结尾总结卡']
  },
  {
    key: 'expert',
    name: '专家背书',
    scene: '用身份、数据、案例建立信任，适合知识付费、专业服务、B2B',
    rhythm: '稳重口播 / 证据点放慢停留',
    accent: '深色信息条 + 数据角标',
    caption: '数据词高亮 + 结论加粗',
    effects: ['身份铭牌', '数据卡片', '案例截图框', '低频提示音', '结论定版']
  },
  {
    key: 'compare',
    name: '前后对比',
    scene: '先展示问题，再展示改变，适合改造、护肤、学习、工具效率',
    rhythm: '前后段落强对照 / 转折处闪切',
    accent: '左右对比标签',
    caption: '对比词双色强调',
    effects: ['前后标签', '分屏辅助线', '转折闪切', '结果放大', '差异总结']
  },
  {
    key: 'urgency',
    name: '限时促单',
    scene: '利益点和截止时间前置，适合活动、团购、直播预告',
    rhythm: '快节奏压迫感 / CTA 高频重复',
    accent: '红黄倒计时标题',
    caption: '价格/时间词强高亮',
    effects: ['倒计时条', '价格爆闪', '库存角标', 'CTA 按钮', '收口提示音']
  },
  {
    key: 'local',
    name: '本地探店',
    scene: '位置、路线、体验感并行，适合门店、餐饮、生活服务',
    rhythm: '环境镜头 1 秒切换 / 到店点位强调',
    accent: '定位标签 + 路线贴纸',
    caption: '地址/套餐词高亮',
    effects: ['定位角标', '路线箭头', '套餐卡片', '环境快切', '到店 CTA']
  },
  {
    key: 'live',
    name: '直播切片',
    scene: '保留临场感和互动语气，适合直播带货、课程切片、连麦高光',
    rhythm: '口语快切 / 互动点弹幕增强',
    accent: '直播间状态条',
    caption: '口语字幕 + 弹幕关键词',
    effects: ['直播状态条', '弹幕强调', '价格条', '互动音效', '关注提示']
  }
];

const viralTemplateVariantNames = [
  '高级红·双语',
  '轻奢白·双语',
  '经典蓝·双语',
  '黄色闪亮',
  '简洁黄白',
  '轻透雅黑',
  '基础白金',
  '百搭黄·双语',
  '顶奢',
  '商务科技',
  '醒目科普',
  '新闻蓝·AI画中画',
  '双行红白',
  '轻奢手写',
  '通勤绿蓝',
  '金色灵感',
  '知识讲解',
  '开小窗·素材',
  '智能识别',
  '粉色爆闪'
];

const viralFontOptions = [
  { label: '系统黑体', value: 'Inter, "Microsoft YaHei", "PingFang SC", sans-serif' },
  { label: '标题粗黑', value: '"Arial Black", "Microsoft YaHei", sans-serif' },
  { label: '清爽圆体', value: '"Trebuchet MS", "Microsoft YaHei", sans-serif' },
  { label: '电影字幕', value: 'Georgia, "Microsoft YaHei", serif' }
];

const viralTemplateCards: ViralTemplateCard[] = viralTemplateVariantNames.map((cardName, index) => {
  const template = viralTemplates[index % viralTemplates.length];
  return {
    ...template,
    cardId: `${template.key}-${index}`,
    cardName,
    variantIndex: index
  };
});

function createViralDefaultClips(duration = VIRAL_TIMELINE_DURATION): ViralTimelineClip[] {
  return [{ id: 'clip-1', start: 0, end: Math.max(0.1, duration) }];
}

function ViralPackagingWorkspace(props: { projectName: string; onSavedToFinishedLibrary: (savedCount: number) => void }) {
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const filmstripRef = useRef<HTMLDivElement>(null);
  const sourceVideoSizeRef = useRef<ViralVideoSize | null>(null);
  const playbackFrameRef = useRef<number | null>(null);
  const playbackStartedAtRef = useRef(0);
  const playbackTimelineStartedAtRef = useRef(0);
  const templatePreviewFrameRef = useRef<number | null>(null);
  const templatePreviewStartedAtRef = useRef(0);
  const templatePreviewRenderedAtRef = useRef(-1);
  const [sourceVideo, setSourceVideo] = useState<MaterialItem | null>(null);
  const [recentTasks, setRecentTasks] = useState<ViralRecentTask[]>([]);
  const [recentTaskVideoSizes, setRecentTaskVideoSizes] = useState<Record<string, ViralVideoSize>>({});
  const [customTemplateCards, setCustomTemplateCards] = useState<ViralTemplateCard[]>([]);
  const [templateMakerOpen, setTemplateMakerOpen] = useState(false);
  const [templateMakerMode, setTemplateMakerMode] = useState<ViralTemplateMakerMode>('manual');
  const [templateMarkers, setTemplateMarkers] = useState<ViralTemplateMarker[]>([
    { id: 'marker-opening-title', label: '三秒大标题', zone: 'opening' },
    { id: 'marker-keyword', label: '关键词高亮', zone: 'body' },
    { id: 'marker-bilingual', label: '双语字幕', zone: 'global' }
  ]);
  const [templateDraft, setTemplateDraft] = useState({
    name: '',
    source: '',
    description: '',
    baseKey: 'street' as ViralTemplateKey
  });
  const [selectedTemplateCardId, setSelectedTemplateCardId] = useState(viralTemplateCards[0].cardId);
  const [hoverTemplateCardId, setHoverTemplateCardId] = useState<string | null>(null);
  const [activePackageTab, setActivePackageTab] = useState<'template' | 'captions' | 'sound'>('template');
  const [packagingProgress, setPackagingProgress] = useState<number | null>(null);
  const [previewRecentTask, setPreviewRecentTask] = useState<ViralRecentTask | null>(null);
  const [previewRecentTime, setPreviewRecentTime] = useState(0);
  const [uploadPhase, setUploadPhase] = useState<'idle' | 'uploading' | 'analyzing' | 'ready' | 'failed'>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [sourceUploadProgress, setSourceUploadProgress] = useState(0);
  const [keywords, setKeywords] = useState('零基础, 数字人, 视频创作, 小白');
  const [videoVolume, setVideoVolume] = useState(80);
  const [noiseReduction, setNoiseReduction] = useState(false);
  const [addMusic, setAddMusic] = useState(true);
  const [addSoundFx, setAddSoundFx] = useState(true);
  const [titlePosition, setTitlePosition] = useState({ x: 50, y: 18 });
  const [captionPosition, setCaptionPosition] = useState({ x: 50, y: 64 });
  const [titleTextStyle, setTitleTextStyle] = useState<ViralOverlayTextStyle>(() => getViralTemplateTextStyle(viralTemplateCards[0], 'title'));
  const [captionTextStyle, setCaptionTextStyle] = useState<ViralOverlayTextStyle>(() => getViralTemplateTextStyle(viralTemplateCards[0], 'caption'));
  const [previewVideoFit, setPreviewVideoFit] = useState<ViralPreviewVideoFit>('cover');
  const [draggingOverlay, setDraggingOverlay] = useState<'title' | 'caption' | null>(null);
  const [customPreviewHook, setCustomPreviewHook] = useState('');
  const [versions, setVersions] = useState<ViralPackageVersion[]>([]);
  const [selectedVersionIds, setSelectedVersionIds] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hoverTemplateTime, setHoverTemplateTime] = useState(0);
  const [sourceDuration, setSourceDuration] = useState(VIRAL_TIMELINE_DURATION);
  const [timelineClips, setTimelineClips] = useState<ViralTimelineClip[]>(createViralDefaultClips);
  const [selectedClipId, setSelectedClipId] = useState('clip-1');
  const [recognizedCaptionSegments, setRecognizedCaptionSegments] = useState<ViralCaptionSegment[]>([]);
  const allViralTemplateCards = [...viralTemplateCards, ...customTemplateCards];
  const appliedTemplate = allViralTemplateCards.find((item) => item.cardId === selectedTemplateCardId) || allViralTemplateCards[0] || viralTemplateCards[0];
  const template = appliedTemplate;
  const previewVersion = versions.find((item) => selectedVersionIds.includes(item.id)) || versions[0];
  const captionSegments = recognizedCaptionSegments.length > 0 ? recognizedCaptionSegments : buildViralCaptionSegments(keywords);
  const timelineDuration = getViralTimelineDuration(timelineClips);
  const rulerTimes = buildViralRulerTimes(timelineDuration);
  const timelineCurrentTime = sourceToViralTimelineTime(timelineClips, currentTime);
  const hoverTemplateEffectPhase = getViralPreviewEffectPhase(hoverTemplateTime, VIRAL_TEMPLATE_PREVIEW_DURATION);
  const selectedClip = timelineClips.find((clip) => clip.id === selectedClipId) || timelineClips[0];
  const activeTimelineClip = findViralClipAtSourceTime(timelineClips, currentTime) || selectedClip;
  const editedCaptionSegments = buildEditedViralCaptionSegments(captionSegments, timelineClips);
  const activeCaptionIndex = findEditedViralCaptionIndex(editedCaptionSegments, timelineCurrentTime);
  const activeCaption = editedCaptionSegments[activeCaptionIndex] || editedCaptionSegments[0];
  const liveTemplatePhase = getViralPreviewEffectPhase(timelineCurrentTime % Math.max(0.1, timelineDuration), timelineDuration);
  const displayedUploadProgress = uploadPhase === 'analyzing' || uploadPhase === 'ready' ? 100 : sourceUploadProgress;
  const generatedPreviewHook = previewVersion?.hook || buildViralHook(template, activeCaption?.text || '核心卖点', activeCaptionIndex);
  const previewHook = customPreviewHook.trim() || generatedPreviewHook;
  const previewSubtitle = previewVersion?.subtitleStyle || template.caption;
  const previewKeywordList = buildViralKeywordList(keywords, activeCaption?.text || '');
  const isBilingualTemplate = /双语/.test(template.cardName);
  const shouldShowOpeningTitle = timelineCurrentTime <= Math.min(3, Math.max(1.2, timelineDuration * 0.28));
  const previewTemplateClass = getViralTemplatePreviewClass(template);
  const previewTemplateStyle = viralTemplateThemeStyle(template);
  const activeTitleTextStyle = titleTextStyle;
  const activeCaptionTextStyle = captionTextStyle;

  useEffect(() => {
    let canceled = false;
    Promise.all([
      window.surgicol.store.get<ViralRecentTask[]>(VIRAL_RECENT_TASKS_KEY).catch(() => []),
      window.surgicol.store.get<ViralTemplateCard[]>(VIRAL_CUSTOM_TEMPLATES_KEY).catch(() => [])
    ])
      .then(([tasks, templates]) => {
        if (canceled) return;
        const nextTasks = Array.isArray(tasks) ? tasks : [];
        setRecentTasks(nextTasks);
        setRecentTaskVideoSizes(buildViralRecentTaskVideoSizeMap(nextTasks));
        setCustomTemplateCards(Array.isArray(templates) ? templates : []);
      })
      .catch(() => {
        if (!canceled) {
          setRecentTasks([]);
          setRecentTaskVideoSizes({});
          setCustomTemplateCards([]);
        }
      });
    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    const video = previewVideoRef.current;
    if (!video || uploadPhase !== 'ready' || isPlaying) return;
    if (Math.abs(video.currentTime - currentTime) > 0.25) {
      video.currentTime = Math.min(currentTime, Number.isFinite(video.duration) ? video.duration : VIRAL_TIMELINE_DURATION);
    }
  }, [currentTime, isPlaying, uploadPhase]);

  useEffect(() => {
    const video = previewVideoRef.current;
    if (!video || uploadPhase !== 'ready') return;
    video.muted = videoVolume === 0;
    video.volume = Math.max(0, Math.min(1, videoVolume / 100));
  }, [videoVolume, uploadPhase]);

  useEffect(() => {
    setTitleTextStyle(getViralTemplateTextStyle(appliedTemplate, 'title'));
    setCaptionTextStyle(getViralTemplateTextStyle(appliedTemplate, 'caption'));
  }, [selectedTemplateCardId]);

  useEffect(() => {
    const video = previewVideoRef.current;
    if (!video || uploadPhase !== 'ready') return;
    if (isPlaying) {
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }, [isPlaying, uploadPhase]);

  useEffect(() => {
    if (!isPlaying || uploadPhase !== 'ready') {
      if (playbackFrameRef.current !== null) {
        window.cancelAnimationFrame(playbackFrameRef.current);
        playbackFrameRef.current = null;
      }
      return;
    }

    const syncPlayback = () => {
      const video = previewVideoRef.current;
      if (!video) return;
      syncViralTimelinePlayback(video, performance.now());
      playbackFrameRef.current = window.requestAnimationFrame(syncPlayback);
    };

    playbackFrameRef.current = window.requestAnimationFrame(syncPlayback);
    return () => {
      if (playbackFrameRef.current !== null) {
        window.cancelAnimationFrame(playbackFrameRef.current);
        playbackFrameRef.current = null;
      }
    };
  }, [isPlaying, uploadPhase, timelineClips]);

  useEffect(() => () => {
    if (templatePreviewFrameRef.current !== null) {
      window.cancelAnimationFrame(templatePreviewFrameRef.current);
    }
  }, []);

  function rememberViralSourceVideoSize(video: HTMLVideoElement) {
    const videoSize = readViralVideoElementSize(video);
    if (videoSize) sourceVideoSizeRef.current = videoSize;
  }

  function getCurrentViralSourceVideoSize() {
    return readViralVideoElementSize(previewVideoRef.current) || sourceVideoSizeRef.current;
  }

  function rememberRecentTaskVideoSize(taskId: string, event: SyntheticEvent<HTMLVideoElement>) {
    const videoSize = readViralVideoElementSize(event.currentTarget);
    if (!videoSize) return;
    setRecentTaskVideoSizes((sizes) => {
      const currentSize = sizes[taskId];
      if (currentSize?.width === videoSize.width && currentSize.height === videoSize.height) return sizes;
      return { ...sizes, [taskId]: videoSize };
    });
  }

  async function importSourceVideo() {
    const files = await window.surgicol.dialog.openFiles({
      filters: [{ name: '视频文件', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm'] }]
    });
    const filePath = files[0];
    if (!filePath) return;
    const nextVideo: MaterialItem = {
      id: crypto.randomUUID(),
      name: filePath.split(/[\\/]/).pop() || filePath,
      type: 'video',
      source: 'local',
      path: filePath,
      duration: 18
    };
    sourceVideoSizeRef.current = null;
    setSourceVideo(nextVideo);
    setVersions([]);
    setSelectedVersionIds([]);
    setRecognizedCaptionSegments([]);
    setTimelineClips(createViralDefaultClips(VIRAL_TIMELINE_DURATION));
    setSelectedClipId('clip-1');
    setCurrentTime(0);
    setCustomPreviewHook('');
    setSourceDuration(VIRAL_TIMELINE_DURATION);
    setSourceUploadProgress(0);
    setUploadProgress(3);
    setUploadPhase('uploading');
    setNotice('正在检查 OSS 上传配置。');
    const taskId = `viral-${nextVideo.id}`;
    let unsubscribe: (() => void) | undefined;
    try {
      await getAliyunStorageConfig();
      setNotice('正在上传视频到 OSS，上传完成后会自动调用阿里云智能字幕断句。');
      unsubscribe = window.surgicol.media.onUploadToOssProgress?.((progress) => {
        if (progress.taskId !== taskId) return;
        const uploadPercent = normalizeUploadPercent(progress.percent);
        setSourceUploadProgress(uploadPercent);
        setUploadProgress(Math.max(3, Math.min(68, Math.round(uploadPercent * 0.68))));
        if (progress.message) setNotice(`视频上传中：${uploadPercent}%`);
      });
      const uploaded = await window.surgicol.media.uploadToOss(filePath, { folder: 'viral/source-videos', taskId });
      unsubscribe?.();
      setSourceUploadProgress(100);
      setUploadProgress(72);
      setUploadPhase('analyzing');
      setNotice('上传完成，正在提交阿里云智能字幕断句任务。');
      const submitted = await submitViralSubtitleRecognition({
        mediaUrl: uploaded.mediaUrl,
        title: nextVideo.name
      });
      setNotice('字幕断句任务已提交，正在等待阿里云返回识别结果。');
      const recognized = await waitForViralSubtitleSegments(submitted.jobId, (progress) => setUploadProgress(progress));
      const nextCaptions = viralSubtitleSegmentsToCaptions(recognized.segments);
      const nextDuration = Math.max(
        VIRAL_TIMELINE_DURATION,
        sourceDuration,
        ...recognized.segments.map((segment) => segment.end)
      );
      setRecognizedCaptionSegments(nextCaptions);
      setActivePackageTab('captions');
      setUploadPhase('ready');
      setSourceUploadProgress(100);
      setCurrentTime(0);
      setSourceDuration(nextDuration);
      setTimelineClips(createViralDefaultClips(nextDuration));
      setSelectedClipId('clip-1');
      setUploadProgress(100);
      const recognizedKeywords = extractViralKeywordsFromText(nextCaptions.map((caption) => caption.text).join(' '));
      if (recognizedKeywords.length) setKeywords(recognizedKeywords.join(', '));
      setNotice(`已通过阿里云智能字幕断句识别 ${nextCaptions.length} 段字幕${recognizedKeywords.length ? `，并识别 ${recognizedKeywords.length} 个关键词` : ''}，已同步到文字快剪、左侧预览和保存渲染。`);
      const taskVideoSize = getCurrentViralSourceVideoSize();
      void persistViralRecentTask({
        id: nextVideo.id,
        name: nextVideo.name,
        path: nextVideo.path,
        mediaUrl: uploaded.mediaUrl,
        subtitleJobId: recognized.jobId,
        templateKey: appliedTemplate.key,
        templateCardId: selectedTemplateCardId,
        keywords: recognizedKeywords.length ? recognizedKeywords.join(', ') : keywords,
        subtitleSegments: nextCaptions,
        savedAt: new Date().toISOString(),
        duration: formatViralDuration(nextDuration),
        ...(taskVideoSize ? { videoWidth: taskVideoSize.width, videoHeight: taskVideoSize.height } : {})
      });
    } catch (error) {
      unsubscribe?.();
      setUploadPhase('failed');
      setSourceUploadProgress(0);
      setUploadProgress(0);
      setNotice(error instanceof Error ? `字幕断句失败：${error.message}` : '字幕断句失败，请检查 OSS 和阿里云 ICE 配置。');
    }
  }

  async function persistViralRecentTask(task: ViralRecentTask) {
    const storedTasks = await window.surgicol.store.get<ViralRecentTask[]>(VIRAL_RECENT_TASKS_KEY).catch(() => []);
    const nextTasks = [task, ...(Array.isArray(storedTasks) ? storedTasks.filter((item) => item.id !== task.id) : [])].slice(0, 12);
    setRecentTasks(nextTasks);
    const taskVideoSize = getViralRecentTaskVideoSize(task);
    if (taskVideoSize) {
      setRecentTaskVideoSizes((sizes) => ({ ...sizes, [task.id]: taskVideoSize }));
    }
    await window.surgicol.store.set(VIRAL_RECENT_TASKS_KEY, nextTasks);
  }

  async function saveCustomTemplate(mode: 'manual' | 'analyze') {
    const trimmedName = templateDraft.name.trim();
    const markerText = templateMarkers.map((item) => item.label).join(' ');
    const sourceText = `${templateDraft.source} ${templateDraft.description} ${markerText}`.trim();
    if (!trimmedName && !sourceText) {
      setNotice('请填写模板名称，或输入一个平台爆款视频链接/描述。');
      return;
    }
    const analyzed = analyzeViralTemplateDraft(templateDraft.baseKey, sourceText || trimmedName);
    const baseTemplate = viralTemplates.find((item) => item.key === analyzed.key) || viralTemplates[0];
    const nextTemplate: ViralTemplateCard = {
      ...baseTemplate,
      key: analyzed.key,
      cardId: `custom-${Date.now()}`,
      cardName: trimmedName || analyzed.name,
      name: analyzed.name,
      accent: analyzed.accent,
      caption: analyzed.caption,
      scene: analyzed.scene,
      rhythm: analyzed.rhythm,
      effects: analyzed.effects,
      variantIndex: 100 + customTemplateCards.length,
      custom: true,
      sourceSummary: mode === 'analyze' ? analyzed.sourceSummary : templateDraft.description.trim()
    };
    const nextTemplates = [nextTemplate, ...customTemplateCards.filter((item) => !item.cardId.startsWith('draft-preview-'))].slice(0, 24);
    setCustomTemplateCards(nextTemplates);
    await window.surgicol.store.set(VIRAL_CUSTOM_TEMPLATES_KEY, nextTemplates);
    setSelectedTemplateCardId(nextTemplate.cardId);
    setTemplateMakerOpen(false);
    setTemplateDraft({ name: '', source: '', description: '', baseKey: 'street' });
    setTemplateMakerMode('manual');
    setNotice(`已生成并应用自定义模板「${nextTemplate.cardName}」。`);
  }

  function previewDraftTemplateOnStage() {
    const markerText = templateMarkers.map((item) => item.label).join(' ');
    const analyzed = analyzeViralTemplateDraft(templateDraft.baseKey, `${templateDraft.source} ${templateDraft.description} ${markerText}`.trim() || templateDraft.name);
    const previewTemplate: ViralTemplateCard = {
      ...analyzed,
      cardId: `draft-preview-${Date.now()}`,
      cardName: templateDraft.name.trim() || analyzed.name,
      variantIndex: 100 + customTemplateCards.length,
      custom: true,
      sourceSummary: analyzed.sourceSummary
    };
    const nextTemplates = [previewTemplate, ...customTemplateCards.filter((item) => !item.cardId.startsWith('draft-preview-'))];
    setCustomTemplateCards(nextTemplates);
    setSelectedTemplateCardId(previewTemplate.cardId);
    setActivePackageTab('template');
    setHoverTemplateCardId(null);
    setCurrentTime(0);
    setCustomPreviewHook('');
    setNotice(`正在左侧预览「${previewTemplate.cardName}」，满意后可保存为模板。`);
  }

  function dropTemplateMarker(event: DragEvent<HTMLDivElement>, zone: ViralTemplateMarkerZone) {
    event.preventDefault();
    const label = event.dataTransfer.getData('text/plain');
    if (!label) return;
    setTemplateMarkers((markers) => [
      ...markers,
      { id: `marker-${Date.now()}-${markers.length}`, label, zone }
    ]);
  }

  function removeTemplateMarker(markerId: string) {
    setTemplateMarkers((markers) => markers.filter((item) => item.id !== markerId));
  }

  async function deleteCustomTemplate(cardId: string) {
    const nextTemplates = customTemplateCards.filter((item) => item.cardId !== cardId);
    setCustomTemplateCards(nextTemplates);
    await window.surgicol.store.set(VIRAL_CUSTOM_TEMPLATES_KEY, nextTemplates);
    if (selectedTemplateCardId === cardId) setSelectedTemplateCardId(viralTemplateCards[0].cardId);
    setNotice('已删除自定义网感模板。');
  }

  function restoreRecentTask(task: ViralRecentTask) {
    setPreviewRecentTask(null);
    sourceVideoSizeRef.current = getViralRecentTaskVideoSize(task);
    setSourceVideo({
      id: task.id,
      name: task.name,
      type: 'video',
      source: 'local',
      path: task.path,
      duration: VIRAL_TIMELINE_DURATION
    });
    const restoredCard = allViralTemplateCards.find((item) => item.cardId === task.templateCardId)
      || allViralTemplateCards.find((item) => item.key === task.templateKey)
      || viralTemplateCards[0];
    setSelectedTemplateCardId(restoredCard.cardId);
    setHoverTemplateCardId(null);
    setKeywords(task.keywords);
    setRecognizedCaptionSegments(task.subtitleSegments || []);
    if (task.titlePosition) setTitlePosition(task.titlePosition);
    if (task.captionPosition) setCaptionPosition(task.captionPosition);
    setTitleTextStyle(mergeViralTemplateTextStyle(restoredCard, 'title', task.titleTextStyle));
    setCaptionTextStyle(mergeViralTemplateTextStyle(restoredCard, 'caption', task.captionTextStyle));
    setPreviewVideoFit(task.previewVideoFit || 'cover');
    setCustomPreviewHook(task.hook || '');
    setUploadPhase('ready');
    setUploadProgress(100);
    setVersions([]);
    setSelectedVersionIds([]);
    setCurrentTime(0);
    const restoredDuration = Math.max(VIRAL_TIMELINE_DURATION, ...((task.subtitleSegments || []).map((caption) => readViralCaptionEnd(caption.time))));
    setSourceDuration(restoredDuration);
    setTimelineClips(createViralDefaultClips(restoredDuration));
    setSelectedClipId('clip-1');
    setNotice(`已恢复最近任务「${task.name}」。`);
  }

  function handleViralMetadataLoaded(event: SyntheticEvent<HTMLVideoElement>) {
    rememberViralSourceVideoSize(event.currentTarget);
    const duration = event.currentTarget.duration;
    if (!Number.isFinite(duration) || duration <= 0.1) return;
    const nextDuration = Math.max(0.1, duration);
    setSourceDuration(nextDuration);
    setTimelineClips((clips) => (
      isViralSingleFullClip(clips, sourceDuration)
        ? createViralDefaultClips(nextDuration)
        : clampViralClipsToDuration(clips, nextDuration)
    ));
    setCurrentTime((time) => (
      time <= 0.08
        ? getViralPosterSeekTime(nextDuration)
        : Math.min(time, Math.max(0, nextDuration - 0.01))
    ));
    if (!isPlaying && currentTime <= 0.08) {
      event.currentTarget.currentTime = getViralPosterSeekTime(nextDuration);
    }
  }

  function previewTemplate(cardId: string | null) {
    setHoverTemplateCardId(cardId);
    if (!cardId) {
      templatePreviewRenderedAtRef.current = -1;
      setHoverTemplateTime(0);
    }
  }

  function previewTemplateCardVideo(event: MouseEvent<HTMLButtonElement>, cardId: string) {
    previewTemplate(cardId);
    const target = event.currentTarget;
    window.requestAnimationFrame(() => {
      const video = target.querySelector<HTMLVideoElement>('video');
      if (!video) return;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      setHoverTemplateTime(0);
      video.currentTime = getViralPosterSeekTime(video.duration || sourceDuration);
      void video.play().catch(() => undefined);
      startTemplateCardPreviewClock(video);
    });
  }

  function stopTemplateCardVideo(event: MouseEvent<HTMLButtonElement>) {
    previewTemplate(null);
    const video = event.currentTarget.querySelector<HTMLVideoElement>('video');
    if (video) video.pause();
    if (templatePreviewFrameRef.current !== null) {
      window.cancelAnimationFrame(templatePreviewFrameRef.current);
      templatePreviewFrameRef.current = null;
    }
  }

  function startTemplateCardPreviewClock(video: HTMLVideoElement) {
    if (templatePreviewFrameRef.current !== null) {
      window.cancelAnimationFrame(templatePreviewFrameRef.current);
    }
    templatePreviewStartedAtRef.current = performance.now();
    templatePreviewRenderedAtRef.current = -1;
    const tick = (now: number) => {
      const elapsed = ((now - templatePreviewStartedAtRef.current) / 1000) % VIRAL_TEMPLATE_PREVIEW_DURATION;
      const previousElapsed = templatePreviewRenderedAtRef.current;
      if (previousElapsed < 0 || Math.abs(elapsed - previousElapsed) >= 0.12 || elapsed < previousElapsed) {
        templatePreviewRenderedAtRef.current = elapsed;
        setHoverTemplateTime(elapsed);
      }
      if (Number.isFinite(video.duration) && video.duration > 0 && video.currentTime >= Math.min(video.duration, VIRAL_TEMPLATE_PREVIEW_DURATION) - 0.08) {
        video.currentTime = 0;
      }
      templatePreviewFrameRef.current = window.requestAnimationFrame(tick);
    };
    templatePreviewFrameRef.current = window.requestAnimationFrame(tick);
  }

  function applyTemplate(cardId: string) {
    const nextTemplate = allViralTemplateCards.find((item) => item.cardId === cardId) || viralTemplateCards[0];
    const nextFeature = getViralTemplateFeature(nextTemplate);
    setSelectedTemplateCardId(nextTemplate.cardId);
    setTitleTextStyle(getViralTemplateTextStyle(nextTemplate, 'title'));
    setCaptionTextStyle(getViralTemplateTextStyle(nextTemplate, 'caption'));
    setHoverTemplateCardId(null);
    setHoverTemplateTime(0);
    if (templatePreviewFrameRef.current !== null) {
      window.cancelAnimationFrame(templatePreviewFrameRef.current);
      templatePreviewFrameRef.current = null;
    }
    templatePreviewRenderedAtRef.current = -1;
    setActivePackageTab('template');
    setVersions([]);
    setSelectedVersionIds([]);
    setCurrentTime(0);
    setCustomPreviewHook('');
    setPackagingProgress(0);
    setNotice('');
    const timer = window.setInterval(() => {
      setPackagingProgress((progress) => {
        const nextProgress = Math.min(100, (progress || 0) + 20);
        if (nextProgress >= 100) {
          window.clearInterval(timer);
          setNotice(`已应用「${nextTemplate.cardName}」：${nextFeature.title}、${nextFeature.caption} 已同步到左侧预览。`);
          window.setTimeout(() => setPackagingProgress(null), 240);
        }
        return nextProgress;
      });
    }, 180);
  }

  function seekViralTimeline(clientX: number) {
    const strip = filmstripRef.current;
    if (!strip) return;
    const rect = strip.getBoundingClientRect();
    const nextTimelineTime = Math.max(0, Math.min(timelineDuration, ((clientX - rect.left) / rect.width) * timelineDuration));
    seekViralTimelineTime(nextTimelineTime);
  }

  function seekViralTimelineTime(nextTimelineTime: number) {
    const nextTime = viralTimelineTimeToSourceTime(timelineClips, nextTimelineTime);
    setViralSourceTime(nextTime);
    const nextClip = findViralClipAtSourceTime(timelineClips, nextTime);
    if (nextClip) setSelectedClipId(nextClip.id);
  }

  function setViralSourceTime(nextTime: number) {
    const playableTime = findNearestPlayableViralSourceTime(timelineClips, nextTime);
    setCurrentTime(playableTime);
    if (isPlaying) {
      playbackTimelineStartedAtRef.current = sourceToViralTimelineTime(timelineClips, playableTime);
      playbackStartedAtRef.current = performance.now();
    }
    const video = previewVideoRef.current;
    if (video) {
      video.currentTime = getViralMediaDisplayTime(video, playableTime);
      if (isPlaying) {
        void video.play().catch(() => setIsPlaying(false));
      }
    }
  }

  function beginViralPlayheadDrag(event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    seekViralTimeline(event.clientX);
  }

  function handlePreviewTimeUpdate(event: SyntheticEvent<HTMLVideoElement>) {
    if (isPlaying) return;
    syncViralPreviewPlayback(event.currentTarget);
  }

  function syncViralTimelinePlayback(video: HTMLVideoElement, now: number) {
    const elapsed = Math.max(0, (now - playbackStartedAtRef.current) / 1000);
    const nextTimelineTime = playbackTimelineStartedAtRef.current + elapsed;
    if (nextTimelineTime >= timelineDuration) {
      const firstTime = timelineClips[0]?.start || 0;
      setIsPlaying(false);
      video.pause();
      video.currentTime = getViralMediaDisplayTime(video, firstTime);
      setCurrentTime(firstTime);
      setSelectedClipId(timelineClips[0]?.id || 'clip-1');
      return;
    }

    const nextSourceTime = viralTimelineTimeToSourceTime(timelineClips, nextTimelineTime);
    const nextClip = findViralClipAtSourceTime(timelineClips, nextSourceTime);
    setCurrentTime(nextSourceTime);
    if (nextClip) setSelectedClipId(nextClip.id);

    const mediaTime = getViralMediaDisplayTime(video, nextSourceTime);
    if (Math.abs(video.currentTime - mediaTime) > 0.18 || video.ended) {
      video.currentTime = mediaTime;
    }
    if (video.paused) {
      void video.play().catch(() => undefined);
    }
  }

  function syncViralPreviewPlayback(video: HTMLVideoElement) {
    const nextTime = video.currentTime;
    const activeClip = findViralClipAtSourceTime(timelineClips, nextTime);
    if (activeClip) {
      if (nextTime >= activeClip.end - 0.06) {
        const nextPlayableTime = findNextPlayableViralSourceTime(timelineClips, activeClip.end + 0.06);
        if (nextPlayableTime <= activeClip.start && activeClip.id === timelineClips[timelineClips.length - 1]?.id) {
          setIsPlaying(false);
          video.pause();
          video.currentTime = timelineClips[0]?.start || 0;
          setCurrentTime(timelineClips[0]?.start || 0);
          setSelectedClipId(timelineClips[0]?.id || 'clip-1');
          return;
        }
        video.currentTime = nextPlayableTime;
        setCurrentTime(nextPlayableTime);
        const nextClip = findViralClipAtSourceTime(timelineClips, nextPlayableTime);
        if (nextClip) setSelectedClipId(nextClip.id);
        return;
      }
      setCurrentTime(nextTime);
      setSelectedClipId(activeClip.id);
      return;
    }
    const nextPlayableTime = findNextPlayableViralSourceTime(timelineClips, nextTime);
    video.currentTime = nextPlayableTime;
    setCurrentTime(nextPlayableTime);
    const nextClip = findViralClipAtSourceTime(timelineClips, nextPlayableTime);
    if (nextClip) setSelectedClipId(nextClip.id);
  }

  function toggleViralPlayback() {
    const video = previewVideoRef.current;
    if (!video) {
      setIsPlaying((playing) => !playing);
      return;
    }
    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
      return;
    }
    const playableTime = findNearestPlayableViralSourceTime(timelineClips, currentTime);
    if (Math.abs(video.currentTime - playableTime) > 0.08) {
      video.currentTime = getViralMediaDisplayTime(video, playableTime);
    }
    playbackTimelineStartedAtRef.current = sourceToViralTimelineTime(timelineClips, playableTime);
    playbackStartedAtRef.current = performance.now();
    void video.play()
      .then(() => setIsPlaying(true))
      .catch(() => {
        video.muted = true;
        void video.play()
          .then(() => setIsPlaying(true))
          .catch(() => setIsPlaying(false));
      });
  }

  function splitSelectedViralClip() {
    const clip = activeTimelineClip;
    if (!clip) {
      setNotice('请先选择要剪辑的片段。');
      return;
    }
    const splitTime = Math.max(clip.start, Math.min(clip.end, currentTime));
    if (splitTime - clip.start < 0.25 || clip.end - splitTime < 0.25) {
      setNotice('游标太靠近片段边缘，往中间拖一点再剪辑。');
      return;
    }
    const nextClipId = `clip-${Date.now()}`;
    setTimelineClips((clips) => clips.flatMap((item) => (
      item.id === clip.id
        ? [{ ...item, end: splitTime }, { id: nextClipId, start: splitTime, end: item.end }]
        : [item]
    )));
    setSelectedClipId(nextClipId);
    setNotice(`已在 ${formatViralTime(sourceToViralTimelineTime(timelineClips, splitTime))} 分割片段。`);
  }

  function deleteSelectedViralClip() {
    const clip = selectedClip;
    if (!clip) {
      setNotice('请先选择要删除的片段。');
      return;
    }
    if (timelineClips.length <= 1) {
      setNotice('至少保留一个片段，当前片段不能删除。');
      return;
    }
    const clipIndex = timelineClips.findIndex((item) => item.id === clip.id);
    const nextClips = timelineClips.filter((item) => item.id !== clip.id);
    const nextSelectedClip = nextClips[Math.max(0, Math.min(clipIndex, nextClips.length - 1))];
    setTimelineClips(nextClips);
    setSelectedClipId(nextSelectedClip.id);
    setCurrentTime(nextSelectedClip.start);
    const video = previewVideoRef.current;
    if (video) video.currentTime = nextSelectedClip.start;
    setNotice('已删除选中片段，底部时间轴已自动闭合。');
  }

  function selectViralClip(clip: ViralTimelineClip) {
    setSelectedClipId(clip.id);
    setViralSourceTime(Math.max(clip.start, Math.min(clip.end - 0.01, currentTime)));
  }

  function updateViralCaptionText(captionIndex: number, text: string) {
    const sourceCaptions = recognizedCaptionSegments.length > 0 ? recognizedCaptionSegments : captionSegments;
    setRecognizedCaptionSegments(sourceCaptions.map((caption, index) => (
      index === captionIndex ? { ...caption, text } : caption
    )));
  }

  function updateViralCaptionTranslation(captionIndex: number, translation: string) {
    const sourceCaptions = recognizedCaptionSegments.length > 0 ? recognizedCaptionSegments : captionSegments;
    setRecognizedCaptionSegments(sourceCaptions.map((caption, index) => (
      index === captionIndex ? { ...caption, translation } : caption
    )));
  }

  function deleteViralCaption(captionIndex: number) {
    const sourceCaptions = recognizedCaptionSegments.length > 0 ? recognizedCaptionSegments : captionSegments;
    const nextCaptions = sourceCaptions.filter((_, index) => index !== captionIndex);
    setRecognizedCaptionSegments(nextCaptions);
    setNotice(nextCaptions.length ? '已删除选中字幕，左侧预览和保存渲染已同步更新。' : '已清空字幕，左侧预览将显示模板默认文案。');
  }

  function recognizeKeywordsFromCaptions() {
    const text = editedCaptionSegments.map((caption) => caption.text).join(' ');
    const nextKeywords = extractViralKeywordsFromText(text);
    if (nextKeywords.length === 0) {
      setNotice('当前字幕内容不足，暂时没有识别到可用关键词。');
      return;
    }
    setKeywords(nextKeywords.join(', '));
    setNotice(`已从字幕识别 ${nextKeywords.length} 个关键词，并同步到字幕高亮。`);
  }

  function beginOverlayDrag(event: PointerEvent<HTMLDivElement>, layer: 'title' | 'caption') {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingOverlay(layer);
    moveOverlayLayerFromPoint(event.clientX, event.clientY, event.currentTarget, layer);
  }

  function moveOverlayLayer(event: PointerEvent<HTMLDivElement>, layer: 'title' | 'caption') {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    moveOverlayLayerFromPoint(event.clientX, event.clientY, event.currentTarget, layer);
  }

  function beginOverlayHandleDrag(event: PointerEvent<HTMLSpanElement>, layer: 'title' | 'caption') {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingOverlay(layer);
    moveOverlayLayerFromPoint(event.clientX, event.clientY, event.currentTarget, layer);
  }

  function moveOverlayHandleDrag(event: PointerEvent<HTMLSpanElement>, layer: 'title' | 'caption') {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    moveOverlayLayerFromPoint(event.clientX, event.clientY, event.currentTarget, layer);
  }

  function moveOverlayLayerFromPoint(clientX: number, clientY: number, element: HTMLElement, layer: 'title' | 'caption') {
    const rect = element.closest('.viral-preview-overlay')?.getBoundingClientRect();
    if (!rect) return;
    const nextPosition = {
      x: Math.max(8, Math.min(92, ((clientX - rect.left) / rect.width) * 100)),
      y: Math.max(8, Math.min(92, ((clientY - rect.top) / rect.height) * 100))
    };
    if (layer === 'title') setTitlePosition(nextPosition);
    if (layer === 'caption') setCaptionPosition(nextPosition);
  }

  function generatePackages() {
    if (!sourceVideo) {
      setNotice('请先导入一条口播或营销视频。');
      return;
    }
    setIsGenerating(true);
    setNotice('正在套用模板、自动加字幕、花字、音乐和音效...');
    window.setTimeout(() => {
      const keywordList = keywords.split(/[,，、\s]+/).map((item) => item.trim()).filter(Boolean);
      const nextVersions = Array.from({ length: 6 }, (_, index) => {
        const keyword = keywordList[index % Math.max(1, keywordList.length)] || '核心卖点';
        return {
          id: `viral-${Date.now()}-${index}`,
          label: index + 1,
          name: `${appliedTemplate.cardName}_${String(index + 1).padStart(2, '0')}`,
          hook: buildViralHook(appliedTemplate, keyword, index),
          duration: `${Math.max(12, 24 - index)}s`,
          subtitleStyle: index % 2 === 0 ? appliedTemplate.caption : `${appliedTemplate.caption} · 强节奏版`,
          sound: addMusic ? (addSoundFx ? '轻快卡点 BGM + 关键词提示音' : '轻快卡点 BGM') : (addSoundFx ? '仅保留提示音效' : '保留原声'),
          effects: rotateEffects(addSoundFx ? appliedTemplate.effects : appliedTemplate.effects.filter((effect) => !effect.includes('音效')), index),
          score: Math.max(82, 96 - index * 2),
          path: sourceVideo.path,
          coverPath: sourceVideo.coverUrl || sourceVideo.path
        } satisfies ViralPackageVersion;
      });
      setVersions(nextVersions);
      setSelectedVersionIds(nextVersions.slice(0, 3).map((item) => item.id));
      setIsGenerating(false);
      setNotice(`已生成 ${nextVersions.length} 个网感包装版本，可保存到成片库继续组合优化。`);
    }, 520);
  }

  function toggleVersion(versionId: string) {
    setSelectedVersionIds((ids) => (ids.includes(versionId) ? ids.filter((id) => id !== versionId) : [...ids, versionId]));
  }

  async function saveSelectedToFinishedLibrary() {
    if (!sourceVideo) {
      setNotice('请先导入视频。');
      return;
    }
    const selectedSet = new Set(selectedVersionIds);
    const fallbackVersion: ViralPackageVersion = {
      id: `viral-applied-${sourceVideo.id}-${Date.now()}`,
      label: 1,
      name: `${appliedTemplate.cardName}_已包装`,
      hook: customPreviewHook.trim() || buildViralHook(appliedTemplate, activeCaption?.text || '网感剪辑', activeCaptionIndex),
      duration: formatViralDuration(timelineDuration),
      subtitleStyle: appliedTemplate.caption,
      sound: addMusic ? (addSoundFx ? '音乐 + 音效' : '音乐') : (addSoundFx ? '音效' : '原声'),
      effects: addSoundFx ? appliedTemplate.effects : appliedTemplate.effects.filter((effect) => !effect.includes('音效')),
      score: 92,
      path: sourceVideo.path,
      coverPath: sourceVideo.coverUrl || sourceVideo.path
    };
      const versionsToSave = versions.length
        ? versions.filter((version) => selectedSet.size === 0 || selectedSet.has(version.id))
        : [fallbackVersion];
    if (versionsToSave.length === 0) {
      setNotice('请先选择要入库的包装版本。');
      return;
    }
    const storedLibrary = await window.surgicol.store.get<FinishedVideoGroup[] | FinishedVideoItem[]>(FINISHED_VIDEOS_KEY).catch(() => []);
    const existingGroups = readFinishedVideoGroups(storedLibrary);
    const now = new Date().toISOString();
    const draftName = `${props.projectName.trim() || '未命名项目'} · 网感剪辑`;
    const groupId = `viral-${sourceVideo.id}`;
    const savedSubtitleSegments = editedCaptionSegments.map((caption) => ({
      time: caption.time,
      text: caption.text,
      translation: caption.translation
    }));
    const savedVideoSize = getCurrentViralSourceVideoSize();
    const savedOverlayBase: ViralRecentTask = {
      id: sourceVideo.id,
      name: sourceVideo.name,
      path: sourceVideo.path,
      templateKey: appliedTemplate.key,
      templateCardId: selectedTemplateCardId,
      keywords,
      savedAt: now,
      duration: formatViralDuration(timelineDuration),
      hook: customPreviewHook.trim() || fallbackVersion.hook,
      templateName: appliedTemplate.cardName,
      titlePosition,
      captionPosition,
      titleTextStyle,
      captionTextStyle,
      previewVideoFit,
      subtitleSegments: savedSubtitleSegments,
      ...(savedVideoSize ? { videoWidth: savedVideoSize.width, videoHeight: savedVideoSize.height } : {})
    };
    const nextGroup: FinishedVideoGroup = {
      id: groupId,
      draftId: groupId,
      draftName,
      savedAt: now,
      updatedAt: now,
      videoCount: versionsToSave.length,
      videos: versionsToSave.map((version, index) => ({
        id: version.id,
        name: version.name,
        duration: version.duration,
        recommend: version.score >= 90 ? 'A' : 'B',
        compliance: '待审',
        difference: `${Math.max(70, 94 - index * 4)}%`,
        path: version.path,
        coverPath: version.coverPath,
        savedAt: now,
        draftName,
        batchName: `${appliedTemplate.cardName} · ${version.hook}`,
        viralOverlay: {
          ...savedOverlayBase,
          id: version.id,
          hook: customPreviewHook.trim() || version.hook,
          name: version.name,
          path: version.path,
          templateName: appliedTemplate.cardName
        },
        groupDetails: [{
          groupId: appliedTemplate.key,
          groupName: appliedTemplate.cardName,
          clipName: version.hook,
          coverPath: version.coverPath
        }]
      }))
    };
    await window.surgicol.store.set(FINISHED_VIDEOS_KEY, [nextGroup, ...existingGroups.filter((group) => group.id !== groupId)]);
    await persistViralRecentTask({
      ...savedOverlayBase,
      finishedCount: versionsToSave.length,
    });
    setNotice(`已保存 ${versionsToSave.length} 个网感包装版本到成片库。`);
    setSourceVideo(null);
    setUploadPhase('idle');
    setSourceUploadProgress(0);
    setVersions([]);
    setSelectedVersionIds([]);
    setCurrentTime(0);
  }

  async function downloadRecentTask(task: ViralRecentTask) {
    const source = task.path || task.mediaUrl;
    if (!source) {
      setNotice('当前任务没有可下载的视频地址。');
      return;
    }
    try {
      const downloadSource = shouldRequestProtectedPreview(source)
        ? (await getProtectedMediaAccessUrl(source)).mediaUrl
        : source;
      const overlay = buildRecentTaskDownloadOverlay(task);
      const result = await window.surgicol.media.downloadToLocal(downloadSource, {
        fileName: `${task.name || '网感剪辑'}.mp4`,
        viralOverlay: overlay
      });
      if (!result.canceled) {
        setNotice(`已下载到本地：${result.name || result.localPath}`);
      }
    } catch (error) {
      setNotice(error instanceof Error ? `本地下载失败：${error.message}` : '本地下载失败，请稍后重试。');
    }
  }

  return (
    <div className="viral-workspace">
      {!sourceVideo ? (
        <div className="viral-start-screen">
          <button className="viral-upload-zone" type="button" onClick={importSourceVideo}>
            <h2>网感剪辑</h2>
            <span>0基础1分钟制作网感口播视频</span>
            <strong><Upload size={16} /> 上传视频</strong>
          </button>
          <section className="viral-recent-section">
            <header className="viral-recent-heading">
              <div>
                <h3>最近任务</h3>
                <span>点击卡片预览成片效果，也可以继续编辑上次任务。</span>
              </div>
              {recentTasks.length ? <small>{recentTasks.length} 个任务</small> : null}
            </header>
            <div className="viral-recent-grid">
              {recentTasks.length ? recentTasks.map((task) => (
                <article key={task.id} onClick={() => setPreviewRecentTask(task)} title={task.name}>
                  <div className="viral-recent-thumb" style={viralRecentTaskThumbStyle(task, recentTaskVideoSizes[task.id])}>
                    {task.path ? (
                      <video
                        src={toMediaUrl(task.path)}
                        muted
                        playsInline
                        preload="metadata"
                        onLoadedMetadata={(event) => rememberRecentTaskVideoSize(task.id, event)}
                      />
                    ) : <Film size={24} />}
                    {task.finishedCount ? <ViralSavedOverlay task={task} /> : null}
                    <small>{task.duration}</small>
                    <em>{task.templateName || '网感模板'}</em>
                  </div>
                  <strong>{task.name}</strong>
                  <span>{task.finishedCount ? `已保存 ${task.finishedCount} 个成片` : `${formatViralTaskExpiry(task.savedAt)}后失效`}</span>
                  <button className="viral-recent-download" type="button" onClick={(event) => {
                    event.stopPropagation();
                    void downloadRecentTask(task);
                  }} title="下载到本地">
                    <Download size={15} />
                  </button>
                </article>
              )) : (
                <p>上传视频后会在这里保留最近包装任务。</p>
              )}
            </div>
          </section>
          {previewRecentTask ? (
            <div className="viral-recent-preview-mask">
              <section>
                <header>
                  <strong>{previewRecentTask.templateName || previewRecentTask.name}_已包装</strong>
                  <button type="button" onClick={() => {
                    setPreviewRecentTask(null);
                    setPreviewRecentTime(0);
                  }}><X size={16} /></button>
                </header>
                <div className="viral-recent-preview-body">
                  <div className="viral-recent-preview-stage">
                    {previewRecentTask.path ? (
                      <video
                        src={toMediaUrl(previewRecentTask.path)}
                        controls
                        autoPlay
                        onTimeUpdate={(event) => setPreviewRecentTime(event.currentTarget.currentTime)}
                        onSeeked={(event) => setPreviewRecentTime(event.currentTarget.currentTime)}
                      />
                    ) : null}
                    <ViralSavedOverlay task={previewRecentTask} currentTime={previewRecentTime} />
                  </div>
                </div>
                <footer>
                  <button type="button" onClick={() => restoreRecentTask(previewRecentTask)}>继续编辑</button>
                  <button type="button" onClick={() => void downloadRecentTask(previewRecentTask)}>下载到本地</button>
                </footer>
              </section>
            </div>
          ) : null}
        </div>
      ) : uploadPhase !== 'ready' ? (
        <div className="viral-processing-screen">
          <section className="viral-phone-preview">
            <video
              src={toMediaUrl(sourceVideo.path || '')}
              muted
              autoPlay
              loop
              onLoadedMetadata={(event) => rememberViralSourceVideoSize(event.currentTarget)}
            />
          </section>
          <section className="viral-processing-card">
            <Upload size={76} />
            <h2>{uploadPhase === 'failed' ? '视频上传失败' : uploadPhase === 'uploading' ? '正在上传你的视频...' : '检测语音和分析内容'}</h2>
            <button type="button" onClick={() => {
              setSourceVideo(null);
              setUploadPhase('idle');
              setSourceUploadProgress(0);
              setUploadProgress(0);
              setNotice('');
            }}>{uploadPhase === 'failed' ? '重新选择视频' : '取消上传'}</button>
            {uploadPhase === 'failed' && notice ? <p className="viral-processing-error">{notice}</p> : null}
            <div className="viral-progress-steps">
              <span className={uploadPhase === 'failed' ? 'failed' : uploadPhase === 'analyzing' ? 'completed' : 'active'}>
                {uploadPhase === 'failed' ? '视频上传失败' : uploadPhase === 'analyzing' ? '视频上传完成' : '视频上传中'}...{displayedUploadProgress}%
              </span>
              <span className={uploadPhase === 'analyzing' ? 'active' : undefined}>分析视频，并智能断句</span>
              <span>免费加字幕，支持10+种方言</span>
            </div>
          </section>
        </div>
      ) : (
        <div className="viral-editor-flow">
          <section className="viral-phone-preview">
            <video
              ref={previewVideoRef}
              src={toMediaUrl(sourceVideo.path || '')}
              style={{ objectFit: previewVideoFit }}
              onLoadedMetadata={handleViralMetadataLoaded}
              onTimeUpdate={handlePreviewTimeUpdate}
              onEnded={() => {
                if (!isPlaying) {
                  setViralSourceTime(timelineClips[0]?.start || 0);
                }
              }}
            />
            <div className={`viral-preview-overlay template-${template.key} ${previewTemplateClass} phase-${liveTemplatePhase}`} style={previewTemplateStyle}>
              <div className="viral-live-template-effect" aria-hidden="true">
                <u />
                <u />
                <u />
              </div>
              <div
                className={`viral-overlay-layer title-layer ${shouldShowOpeningTitle ? '' : 'title-hidden'} ${draggingOverlay === 'title' ? 'dragging' : ''}`}
                style={{ left: `${titlePosition.x}%`, top: `${titlePosition.y}%` }}
                onPointerDown={(event) => beginOverlayDrag(event, 'title')}
                onPointerMove={(event) => moveOverlayLayer(event, 'title')}
                onPointerUp={() => setDraggingOverlay(null)}
              >
                <span
                  className="viral-overlay-drag-handle"
                  title="拖动标题"
                  onPointerDown={(event) => beginOverlayHandleDrag(event, 'title')}
                  onPointerMove={(event) => moveOverlayHandleDrag(event, 'title')}
                  onPointerUp={() => setDraggingOverlay(null)}
                />
                <textarea
                  aria-label="编辑智能标题"
                  rows={2}
                  value={previewHook}
                  style={{ fontSize: activeTitleTextStyle.fontSize, fontFamily: activeTitleTextStyle.fontFamily, width: activeTitleTextStyle.width, height: activeTitleTextStyle.height }}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => setCustomPreviewHook(event.target.value)}
                />
              </div>
              <div
                className={`viral-overlay-layer caption-layer ${draggingOverlay === 'caption' ? 'dragging' : ''}`}
                style={{ left: `${captionPosition.x}%`, top: `${captionPosition.y}%` }}
                onPointerDown={(event) => beginOverlayDrag(event, 'caption')}
                onPointerMove={(event) => moveOverlayLayer(event, 'caption')}
                onPointerUp={() => setDraggingOverlay(null)}
              >
                <span
                  className="viral-overlay-drag-handle"
                  title="拖动字幕"
                  onPointerDown={(event) => beginOverlayHandleDrag(event, 'caption')}
                  onPointerMove={(event) => moveOverlayHandleDrag(event, 'caption')}
                  onPointerUp={() => setDraggingOverlay(null)}
                />
                <span className="viral-caption-lines" style={{ fontSize: activeCaptionTextStyle.fontSize, fontFamily: activeCaptionTextStyle.fontFamily, width: activeCaptionTextStyle.width, minHeight: activeCaptionTextStyle.height }}>
                  <span className="viral-caption-primary">
                    {renderViralHighlightedText(activeCaption?.text || previewSubtitle, previewKeywordList)}
                  </span>
                  {isBilingualTemplate ? (
                    <span className="viral-caption-translation">
                      {getViralCaptionTranslation(activeCaption, previewKeywordList, previewSubtitle)}
                    </span>
                  ) : null}
                </span>
              </div>
            </div>
          </section>
          <section className="viral-package-card">
            <div className="viral-package-tabs">
              <button className={activePackageTab === 'template' ? 'active' : undefined} type="button" onClick={() => setActivePackageTab('template')}>网感模板</button>
              <button className={activePackageTab === 'captions' ? 'active' : undefined} type="button" onClick={() => setActivePackageTab('captions')}>文字快剪</button>
              <button className={activePackageTab === 'sound' ? 'active' : undefined} type="button" onClick={() => setActivePackageTab('sound')}>声音</button>
              <button className="viral-template-maker-button" type="button" onClick={() => setTemplateMakerOpen(true)}>制作模板</button>
            </div>
            {activePackageTab === 'template' ? (
              <>
                <div className="viral-template-gallery">
                  {allViralTemplateCards.map((item) => {
                    const isPreviewingCard = item.cardId === hoverTemplateCardId;
                    const isSelectedCard = item.cardId === selectedTemplateCardId;
                    const shouldMountPreviewVideo = Boolean(sourceVideo.path) && (isPreviewingCard || isSelectedCard);
                    const cardCaptionTime = isPreviewingCard
                      ? mapTemplatePreviewTimeToTimeline(hoverTemplateTime, timelineDuration)
                      : timelineCurrentTime;
                    const cardCaptionIndex = findEditedViralCaptionIndex(editedCaptionSegments, cardCaptionTime);
                    const cardCaption = editedCaptionSegments[cardCaptionIndex] || editedCaptionSegments[0];
                    const cardCopy = getViralTemplateCardCopy(item, cardCaption?.text || '网感剪辑', cardCaptionIndex);
                    const cardThemeStyle = viralTemplateThemeStyle(item);
                    const cardPreviewClass = getViralTemplatePreviewClass(item);
                    return (
                      <button
                        key={item.cardId}
                        className={`template-${item.key} ${cardPreviewClass} phase-${isPreviewingCard ? hoverTemplateEffectPhase : 'idle'} ${isSelectedCard ? 'active' : ''} ${isPreviewingCard ? 'previewing' : ''}`}
                        style={cardThemeStyle}
                        type="button"
                        onMouseEnter={(event) => previewTemplateCardVideo(event, item.cardId)}
                        onMouseLeave={stopTemplateCardVideo}
                        onFocus={() => previewTemplate(item.cardId)}
                        onBlur={() => previewTemplate(null)}
                        onClick={() => applyTemplate(item.cardId)}
                      >
                        <div className="viral-template-card-visual">
                          {shouldMountPreviewVideo ? (
                            <video
                              className="viral-template-card-video"
                              src={toMediaUrl(sourceVideo.path)}
                              muted
                              loop
                              playsInline
                              preload={isPreviewingCard ? 'metadata' : 'none'}
                              style={{
                                position: 'absolute',
                                inset: 0,
                                width: '100%',
                                height: '100%',
                                minWidth: '100%',
                                minHeight: '100%',
                                maxWidth: 'none',
                                maxHeight: 'none',
                                objectFit: 'cover',
                                objectPosition: 'center center',
                                transform: 'none'
                              }}
                              autoPlay={isPreviewingCard}
                              onLoadedMetadata={(event) => {
                                if (!isPreviewingCard) {
                                  event.currentTarget.currentTime = getViralPosterSeekTime(event.currentTarget.duration || sourceDuration);
                                }
                              }}
                            />
                          ) : null}
                          <div className="viral-card-template-effect">
                            <strong>{cardCopy.title}</strong>
                            <span>{cardCopy.subtitle}</span>
                            <em>{cardCopy.badge}</em>
                            <u />
                            <u />
                            <u />
                          </div>
                          <span>{getViralTemplateFeature(item).badge}</span>
                          <b>预览中</b>
                          <i onClick={(event) => {
                            event.stopPropagation();
                            applyTemplate(item.cardId);
                          }}>
                            {item.cardId === selectedTemplateCardId ? '已应用' : '应用该模板'}
                          </i>
                          {item.custom ? (
                            <button
                              className="viral-template-delete"
                              type="button"
                              title="删除自定义模板"
                              onClick={(event) => {
                                event.stopPropagation();
                                void deleteCustomTemplate(item.cardId);
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          ) : null}
                        </div>
                        <div className="viral-template-card-meta">
                          <strong>{item.cardName}</strong>
                          <small>{item.caption}</small>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="viral-add-row">
                  <span>已应用：{appliedTemplate.cardName}</span>
                  <label><input type="checkbox" checked={addMusic} onChange={(event) => setAddMusic(event.target.checked)} /> 音乐</label>
                  <label><input type="checkbox" checked={addSoundFx} onChange={(event) => setAddSoundFx(event.target.checked)} /> 音效</label>
                  <label className="viral-fit-control">
                    视频画面
                    <select value={previewVideoFit} onChange={(event) => setPreviewVideoFit(event.target.value as ViralPreviewVideoFit)}>
                      <option value="cover">铺满裁切</option>
                      <option value="contain">完整显示</option>
                      <option value="fill">拉伸铺满</option>
                    </select>
                  </label>
                  <button className="viral-primary" type="button" onClick={generatePackages} disabled={isGenerating}>
                    {isGenerating ? '处理中...' : '开始处理'}
                  </button>
                </div>
              </>
            ) : null}
            {activePackageTab === 'captions' ? (
              <div className="viral-caption-workbench">
                <div className="viral-preview-style-panel">
                  <label>
                    标题位置
                    <span>
                      <input type="number" min={8} max={92} value={Math.round(titlePosition.x)} onChange={(event) => setTitlePosition((value) => ({ ...value, x: Number(event.target.value) }))} />
                      <input type="number" min={8} max={92} value={Math.round(titlePosition.y)} onChange={(event) => setTitlePosition((value) => ({ ...value, y: Number(event.target.value) }))} />
                    </span>
                  </label>
                  <label>
                    标题字号
                    <input type="range" min={16} max={34} value={titleTextStyle.fontSize} onChange={(event) => setTitleTextStyle((value) => ({ ...value, fontSize: Number(event.target.value) }))} />
                    <strong>{titleTextStyle.fontSize}</strong>
                  </label>
                  <label>
                    标题宽高
                    <span>
                      <input type="number" min={160} max={420} value={Math.round(titleTextStyle.width)} onChange={(event) => setTitleTextStyle((value) => ({ ...value, width: Number(event.target.value) }))} />
                      <input type="number" min={44} max={180} value={Math.round(titleTextStyle.height)} onChange={(event) => setTitleTextStyle((value) => ({ ...value, height: Number(event.target.value) }))} />
                    </span>
                  </label>
                  <label>
                    标题字体
                    <select value={titleTextStyle.fontFamily} onChange={(event) => setTitleTextStyle((value) => ({ ...value, fontFamily: event.target.value }))}>
                      {viralFontOptions.map((font) => <option key={font.value} value={font.value}>{font.label}</option>)}
                    </select>
                  </label>
                  <label>
                    字幕位置
                    <span>
                      <input type="number" min={8} max={92} value={Math.round(captionPosition.x)} onChange={(event) => setCaptionPosition((value) => ({ ...value, x: Number(event.target.value) }))} />
                      <input type="number" min={8} max={92} value={Math.round(captionPosition.y)} onChange={(event) => setCaptionPosition((value) => ({ ...value, y: Number(event.target.value) }))} />
                    </span>
                  </label>
                  <label>
                    字幕字号
                    <input type="range" min={11} max={24} value={captionTextStyle.fontSize} onChange={(event) => setCaptionTextStyle((value) => ({ ...value, fontSize: Number(event.target.value) }))} />
                    <strong>{captionTextStyle.fontSize}</strong>
                  </label>
                  <label>
                    字幕宽高
                    <span>
                      <input type="number" min={160} max={420} value={Math.round(captionTextStyle.width)} onChange={(event) => setCaptionTextStyle((value) => ({ ...value, width: Number(event.target.value) }))} />
                      <input type="number" min={36} max={160} value={Math.round(captionTextStyle.height)} onChange={(event) => setCaptionTextStyle((value) => ({ ...value, height: Number(event.target.value) }))} />
                    </span>
                  </label>
                  <label>
                    字幕字体
                    <select value={captionTextStyle.fontFamily} onChange={(event) => setCaptionTextStyle((value) => ({ ...value, fontFamily: event.target.value }))}>
                      {viralFontOptions.map((font) => <option key={font.value} value={font.value}>{font.label}</option>)}
                    </select>
                  </label>
                  <label>
                    视频画面
                    <select value={previewVideoFit} onChange={(event) => setPreviewVideoFit(event.target.value as ViralPreviewVideoFit)}>
                      <option value="cover">铺满裁切</option>
                      <option value="contain">完整显示</option>
                      <option value="fill">拉伸铺满</option>
                    </select>
                  </label>
                </div>
                <div className="viral-keyword-panel">
                  <div>
                    <strong>字幕关键词</strong>
                    <span>{keywords.split(/[,，、\s]+/).filter(Boolean).slice(0, 8).join(' / ') || '未设置关键词'}</span>
                  </div>
                  <input value={keywords} placeholder="手动输入关键词，用逗号分隔" onChange={(event) => setKeywords(event.target.value)} />
                  <button type="button" onClick={recognizeKeywordsFromCaptions}>从字幕识别</button>
                </div>
                <div className="viral-caption-list">
                  {editedCaptionSegments.map((caption, index) => (
                    <article key={caption.key} className={index === activeCaptionIndex ? 'active' : undefined} onClick={() => setViralSourceTime(caption.sourceStart)}>
                      <span className="viral-caption-time">{caption.time}</span>
                      <div className="viral-caption-copy">
                        <label className="viral-caption-cn-row">
                          <span>中文</span>
                          <textarea
                            aria-label="编辑中文字幕"
                            rows={2}
                            value={caption.text}
                            placeholder="编辑中文字幕"
                            onClick={(event) => event.stopPropagation()}
                            onFocus={() => setViralSourceTime(caption.sourceStart)}
                            onChange={(event) => updateViralCaptionText(caption.captionIndex, event.target.value)}
                          />
                        </label>
                        <label className="viral-caption-en-row">
                          <span>英文</span>
                          <textarea
                            className="viral-caption-translation-input"
                            aria-label="编辑英文字幕"
                            rows={2}
                            value={getViralCaptionTranslation(caption, previewKeywordList)}
                            placeholder="编辑英文字幕"
                            onClick={(event) => event.stopPropagation()}
                            onFocus={() => setViralSourceTime(caption.sourceStart)}
                            onChange={(event) => updateViralCaptionTranslation(caption.captionIndex, event.target.value)}
                          />
                        </label>
                      </div>
                      <div className="viral-caption-actions">
                        <Edit3 size={14} />
                        <button type="button" aria-label="删除字幕" title="删除字幕" onClick={(event) => {
                          event.stopPropagation();
                          deleteViralCaption(caption.captionIndex);
                        }}><Trash2 size={14} /></button>
                      </div>
                    </article>
                  ))}
                  {editedCaptionSegments.length === 0 ? <p>当前片段没有可显示的字幕。</p> : null}
                </div>
              </div>
            ) : null}
            {activePackageTab === 'sound' ? (
              <div className="viral-sound-panel">
                <label>
                  视频音量
                  <input type="range" min={0} max={100} value={videoVolume} onChange={(event) => setVideoVolume(Number(event.target.value))} />
                  <strong>{videoVolume}</strong>
                </label>
                <button className={noiseReduction ? 'active' : undefined} type="button" onClick={() => setNoiseReduction((value) => !value)}>
                  <ScanLine size={18} />
                  <span>降噪</span>
                  <small>将人声音质提升为录音棚品质</small>
                </button>
              </div>
            ) : null}
            {notice ? <div className="viral-notice">{notice}</div> : null}
          </section>
          {packagingProgress !== null ? (
            <div className="viral-packaging-mask">
              <section>
                <Upload size={46} />
                <strong>智能包装中...{packagingProgress}%</strong>
                <button type="button" onClick={() => setPackagingProgress(null)}>取消</button>
              </section>
            </div>
          ) : null}
          {templateMakerOpen ? (
            <div className="viral-template-maker-mask">
              <section>
                <header>
                  <strong>制作网感模板</strong>
                  <button type="button" onClick={() => setTemplateMakerOpen(false)}><X size={18} /></button>
                </header>
                <div className="viral-template-maker-tabs">
                  <button className={templateMakerMode === 'manual' ? 'active' : undefined} type="button" onClick={() => setTemplateMakerMode('manual')}>手动搭建</button>
                  <button className={templateMakerMode === 'analyze' ? 'active' : undefined} type="button" onClick={() => setTemplateMakerMode('analyze')}>视频分析</button>
                </div>
                <div className="viral-template-maker-body">
                  <div className="viral-template-maker-form">
                    <label>
                      模板名称
                      <input value={templateDraft.name} placeholder="例如：本地探店强转化" onChange={(event) => setTemplateDraft((draft) => ({ ...draft, name: event.target.value }))} />
                    </label>
                    <label>
                      基础风格
                      <select value={templateDraft.baseKey} onChange={(event) => setTemplateDraft((draft) => ({ ...draft, baseKey: event.target.value as ViralTemplateKey }))}>
                        <option value="street">爆点节奏</option>
                        <option value="seed">柔和种草</option>
                        <option value="deal">成交导向</option>
                        <option value="story">故事包装</option>
                      </select>
                    </label>
                    {templateMakerMode === 'manual' ? (
                      <div className="viral-template-marker-builder">
                        <strong>拖拽标记到模板结构</strong>
                        <div className="viral-template-marker-palette">
                          {['三秒大标题', '关键词高亮', '双语字幕', 'CTA按钮', '卡点转场', '提示音效', '卖点贴纸', '痛点警示', '反转闪白'].map((marker) => (
                            <button
                              key={marker}
                              type="button"
                              draggable
                              onDragStart={(event) => event.dataTransfer.setData('text/plain', marker)}
                            >
                              {marker}
                            </button>
                          ))}
                        </div>
                        <div className="viral-template-marker-zones">
                          {[
                            ['opening', '开头 0-3s'],
                            ['body', '中段卖点'],
                            ['ending', '结尾行动'],
                            ['global', '全局效果']
                          ].map(([zone, label]) => (
                            <div
                              key={zone}
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={(event) => dropTemplateMarker(event, zone as ViralTemplateMarkerZone)}
                            >
                              <span>{label}</span>
                              {templateMarkers.filter((item) => item.zone === zone).map((marker) => (
                                <button key={marker.id} type="button" onClick={() => removeTemplateMarker(marker.id)}>{marker.label}<X size={12} /></button>
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <>
                        <label>
                          平台视频链接或爆款描述
                          <textarea value={templateDraft.source} rows={3} placeholder="粘贴抖音/小红书/视频号链接，或描述这个视频的标题、字幕、节奏、镜头、转场、音效。" onChange={(event) => setTemplateDraft((draft) => ({ ...draft, source: event.target.value }))} />
                        </label>
                        <div className="viral-template-analysis-grid">
                          {buildViralTemplateAnalysisCards(templateDraft.baseKey, `${templateDraft.source} ${templateDraft.description}`).map((item) => (
                            <article key={item.title}>
                              <strong>{item.title}</strong>
                              <span>{item.value}</span>
                            </article>
                          ))}
                        </div>
                      </>
                    )}
                    <label>
                      模板规则补充
                      <textarea value={templateDraft.description} rows={3} placeholder="例如：前三秒大标题，关键词酒红高亮，字幕双语，结尾强 CTA。" onChange={(event) => setTemplateDraft((draft) => ({ ...draft, description: event.target.value }))} />
                    </label>
                  </div>
                  {(() => {
                    const markerText = templateMarkers.map((item) => item.label).join(' ');
                    const analyzed = analyzeViralTemplateDraft(templateDraft.baseKey, `${templateDraft.source} ${templateDraft.description} ${markerText}`);
                    const previewName = templateDraft.name.trim() || analyzed.name;
                    const previewClass = getViralTemplatePreviewClass({ ...analyzed, cardId: 'draft-preview', cardName: previewName, variantIndex: 100, custom: true });
                    return (
                      <div className="viral-template-maker-live">
                        <div className={`viral-template-maker-phone template-${analyzed.key} ${previewClass}`}>
                          {sourceVideo?.path ? <video src={toMediaUrl(sourceVideo.path)} muted loop playsInline autoPlay /> : null}
                          <div className="viral-maker-title">{buildViralHook(analyzed, activeCaption?.text || '核心卖点', activeCaptionIndex)}</div>
                          <div className="viral-maker-caption">
                            <strong>{activeCaption?.text || '自动识别字幕'}</strong>
                            {/双语/.test(analyzed.caption) ? <span>{buildViralBilingualCaption(activeCaption?.text || '自动识别字幕', previewKeywordList)}</span> : null}
                          </div>
                        </div>
                        <div className="viral-template-maker-preview">
                          <span>{analyzed.caption}</span>
                          <small>{analyzed.rhythm}</small>
                          <p>{analyzed.effects.join(' / ')}</p>
                        </div>
                      </div>
                    );
                  })()}
                </div>
                <footer>
                  <button type="button" onClick={previewDraftTemplateOnStage}>预览到左侧</button>
                  <button type="button" onClick={() => void saveCustomTemplate('manual')}>手动添加模板</button>
                  <button className="viral-primary" type="button" onClick={() => void saveCustomTemplate('analyze')}>分析并生成模板</button>
                </footer>
              </section>
            </div>
          ) : null}
          <section className="viral-timeline">
            <div className="viral-timeline-toolbar">
              <div className="viral-timeline-tools">
                <button type="button" title="分割片段" onClick={splitSelectedViralClip}><Scissors size={16} /></button>
                <button type="button" title="删除片段" onClick={deleteSelectedViralClip} disabled={timelineClips.length <= 1}><Trash2 size={16} /></button>
              </div>
              <div className="viral-timeline-playback">
                <button type="button" onClick={toggleViralPlayback} title={isPlaying ? '暂停' : '播放'}>{isPlaying ? <Pause size={14} /> : <Play size={14} />}</button>
                <span className="current">{formatViralTime(timelineCurrentTime)}</span>
                <span className="slash">/</span>
                <span>{formatViralTime(timelineDuration)}</span>
              </div>
              <button className="viral-timeline-save" type="button" onClick={saveSelectedToFinishedLibrary} disabled={!sourceVideo || packagingProgress !== null}>
                <Download size={15} />
                <span>保存到成片库</span>
              </button>
            </div>
            <div
              className="viral-ruler"
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                seekViralTimelineTime(((event.clientX - rect.left) / rect.width) * timelineDuration);
              }}
            >
              {rulerTimes.map((time, index) => (
                <span
                  key={time}
                  className={timelineCurrentTime >= time ? 'active' : undefined}
                  onClick={(event) => {
                    event.stopPropagation();
                    seekViralTimelineTime(Math.min(time, timelineDuration));
                  }}
                >
                  {formatViralRulerLabel(time)}
                </span>
              ))}
            </div>
            <div
              className="viral-filmstrip"
              ref={filmstripRef}
              onClick={(event) => seekViralTimeline(event.clientX)}
            >
              <button
                className="viral-playhead"
                style={{ left: `${(timelineCurrentTime / timelineDuration) * 100}%` }}
                type="button"
                onPointerDown={beginViralPlayheadDrag}
                onPointerMove={(event) => {
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) seekViralTimeline(event.clientX);
                }}
              />
              {Array.from({ length: 42 }, (_, index) => (
                <i
                  key={index}
                  className={Math.floor((timelineCurrentTime / timelineDuration) * 42) === index ? 'active' : undefined}
                  onClick={(event) => {
                    event.stopPropagation();
                    seekViralTimelineTime((index / 42) * timelineDuration);
                  }}
                >
                  {sourceVideo.path ? <video src={toMediaUrl(sourceVideo.path)} muted playsInline preload="metadata" style={{ objectPosition: `${Math.round((viralTimelineTimeToSourceTime(timelineClips, (index / 41) * timelineDuration) / sourceDuration) * 100)}% center` }} /> : null}
                </i>
              ))}
              {timelineClips.map((clip, index) => {
                const clipStart = sourceToViralTimelineTime(timelineClips, clip.start);
                const clipWidth = ((clip.end - clip.start) / timelineDuration) * 100;
                return (
                  <button
                    key={clip.id}
                    className={`viral-clip-segment ${clip.id === selectedClipId ? 'selected' : ''} ${clip.id === activeTimelineClip?.id ? 'playing' : ''}`}
                    style={{ left: `${(clipStart / timelineDuration) * 100}%`, width: `${clipWidth}%` }}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      selectViralClip(clip);
                    }}
                    title={`片段 ${index + 1} · ${formatViralTime(clip.end - clip.start)}`}
                  >
                    <span>{index + 1}</span>
                  </button>
                );
              })}
              {editedCaptionSegments.map((caption, index) => {
                return (
                  <span
                    key={caption.key}
                    className={index === activeCaptionIndex ? 'active' : undefined}
                    style={{ left: `${(caption.timelineStart / timelineDuration) * 100}%`, width: `${Math.max(4, ((caption.timelineEnd - caption.timelineStart) / timelineDuration) * 100)}%` }}
                    onClick={(event) => {
                      event.stopPropagation();
                      setViralSourceTime(caption.sourceStart);
                      setActivePackageTab('captions');
                    }}
                  />
                );
              })}
            </div>
          </section>
          {versions.length ? (
            <section className="viral-version-drawer">
              {versions.map((version) => (
                <button key={version.id} className={selectedVersionIds.includes(version.id) ? 'active' : undefined} type="button" onClick={() => toggleVersion(version.id)}>
                  <strong>{version.name}</strong>
                  <span>{version.hook}</span>
                </button>
              ))}
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ViralSavedOverlay({ task, currentTime = 0 }: { task: ViralRecentTask; currentTime?: number }) {
  const captions = task.subtitleSegments?.length ? task.subtitleSegments : buildViralCaptionSegments(task.keywords);
  const activeCaption = captions[findViralCaptionIndex(captions, currentTime)] || captions[0];
  const template = viralTemplateCards.find((item) => item.cardId === task.templateCardId)
    || viralTemplateCards.find((item) => item.key === task.templateKey)
    || viralTemplateCards[0];
  const titlePosition = task.titlePosition || { x: 50, y: 18 };
  const captionPosition = task.captionPosition || { x: 50, y: 64 };
  const titleStyle = mergeViralTemplateTextStyle(template, 'title', task.titleTextStyle);
  const captionStyle = mergeViralTemplateTextStyle(template, 'caption', task.captionTextStyle);
  const keywordList = buildViralKeywordList(task.keywords, activeCaption?.text || '');
  const isBilingualTemplate = /双语/.test(template.cardName || task.templateName || '');
  const previewTemplateClass = getViralTemplatePreviewClass(template);
  const savedTemplateStyle = viralTemplateThemeStyle(template);
  const shouldShowTitle = currentTime <= Math.min(3, Math.max(1.2, readViralDuration(task.duration) * 0.28));
  return (
    <div className={`viral-saved-overlay template-${task.templateKey} ${previewTemplateClass}`} style={savedTemplateStyle}>
      <div className={`viral-saved-title ${shouldShowTitle ? '' : 'title-hidden'}`} style={{ left: `${titlePosition.x}%`, top: `${titlePosition.y}%` }}>
        <strong style={{ fontSize: titleStyle.fontSize, fontFamily: titleStyle.fontFamily, width: titleStyle.width, minHeight: titleStyle.height }}>{task.hook || buildViralHook(template, captions[0]?.text || '网感剪辑', 0)}</strong>
      </div>
      <div className="viral-saved-caption" style={{ left: `${captionPosition.x}%`, top: `${captionPosition.y}%` }}>
        <span className="viral-caption-lines" style={{ fontSize: captionStyle.fontSize, fontFamily: captionStyle.fontFamily, width: captionStyle.width, minHeight: captionStyle.height }}>
          <span className="viral-caption-primary">
            {renderViralHighlightedText(activeCaption?.text || '自动识别添加字幕', keywordList)}
          </span>
          {isBilingualTemplate ? (
            <span className="viral-caption-translation">
              {getViralCaptionTranslation(activeCaption, keywordList, '自动识别添加字幕')}
            </span>
          ) : null}
        </span>
      </div>
    </div>
  );
}

function buildRecentTaskDownloadOverlay(task: ViralRecentTask): ViralRecentTask {
  const captions = task.subtitleSegments?.length ? task.subtitleSegments : buildViralCaptionSegments(task.keywords);
  const template = viralTemplateCards.find((item) => item.cardId === task.templateCardId)
    || viralTemplateCards.find((item) => item.key === task.templateKey)
    || viralTemplateCards[0];
  return {
    ...task,
    hook: task.hook || buildViralHook(template, captions[0]?.text || task.name || '网感剪辑', 0),
    templateName: task.templateName || template.name,
    titlePosition: task.titlePosition || { x: 50, y: 18 },
    captionPosition: task.captionPosition || { x: 50, y: 64 },
    titleTextStyle: mergeViralTemplateTextStyle(template, 'title', task.titleTextStyle),
    captionTextStyle: mergeViralTemplateTextStyle(template, 'caption', task.captionTextStyle),
    previewVideoFit: task.previewVideoFit || 'cover',
    subtitleSegments: captions
  };
}

function readViralVideoElementSize(video?: HTMLVideoElement | null): ViralVideoSize | null {
  if (!video) return null;
  return normalizeViralVideoSize(video.videoWidth, video.videoHeight);
}

function normalizeViralVideoSize(width?: number, height?: number): ViralVideoSize | null {
  if (typeof width !== 'number' || typeof height !== 'number' || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height))
  };
}

function getViralRecentTaskVideoSize(task: ViralRecentTask, measuredSize?: ViralVideoSize): ViralVideoSize | null {
  return measuredSize || normalizeViralVideoSize(task.videoWidth, task.videoHeight);
}

function buildViralRecentTaskVideoSizeMap(tasks: ViralRecentTask[]) {
  return tasks.reduce<Record<string, ViralVideoSize>>((sizes, task) => {
    const videoSize = getViralRecentTaskVideoSize(task);
    if (videoSize) sizes[task.id] = videoSize;
    return sizes;
  }, {});
}

function viralRecentTaskThumbStyle(task: ViralRecentTask, measuredSize?: ViralVideoSize): CSSProperties {
  const videoSize = getViralRecentTaskVideoSize(task, measuredSize);
  return {
    '--viral-recent-media-ratio': videoSize ? `${videoSize.width} / ${videoSize.height}` : '16 / 9'
  } as CSSProperties;
}

function buildViralHook(template: ViralTemplate, keyword: string, index: number) {
  const hooks: Record<ViralTemplateKey, string[]> = {
    street: [`先别划走，${keyword}真的不一样`, `90%的人忽略了${keyword}`, `用这个方法把${keyword}讲清楚`],
    seed: [`我最近反复用的${keyword}`, `${keyword}这点太适合新手了`, `如果你也在找${keyword}，看这个`],
    deal: [`还在为${keyword}浪费时间吗`, `${keyword}卡住成交，问题在这里`, `想提升${keyword}，先改这一点`],
    story: [`一开始我也不信${keyword}`, `${keyword}背后有个反转`, `这个${keyword}案例，把我看懂了`],
    list: [`关于${keyword}，先记住这 3 点`, `${keyword}清单我帮你整理好了`, `少走弯路，${keyword}看这一组`],
    expert: [`做${keyword}，先看这个判断标准`, `${keyword}不是玄学，看这组证据`, `专业人士会这样拆${keyword}`],
    compare: [`用了前后，${keyword}差别很明显`, `${keyword}改变前后对比给你看`, `别只听说，${keyword}直接看结果`],
    urgency: [`${keyword}这波别等到结束才后悔`, `今天的${keyword}重点就这几个`, `${keyword}限时规则先看清楚`],
    local: [`来这家店，${keyword}先看这一点`, `${keyword}到店怎么选，我试过了`, `本地人看${keyword}，重点在这里`],
    live: [`刚才直播里${keyword}这段很关键`, `${keyword}现场反应太真实了`, `直播间问爆的${keyword}，答案在这`]
  };
  return hooks[template.key][index % hooks[template.key].length];
}

function analyzeViralTemplateDraft(baseKey: ViralTemplateKey, input: string): ViralTemplate & { sourceSummary: string } {
  const text = input.toLowerCase();
  const key: ViralTemplateKey = /直播|连麦|主播|弹幕|切片/.test(input)
    ? 'live'
    : /本地|探店|门店|到店|地址|路线|套餐/.test(input)
      ? 'local'
      : /限时|倒计时|秒杀|库存|优惠|价格|活动/.test(input)
        ? 'urgency'
        : /对比|前后|改变|改造|之前|之后/.test(input)
          ? 'compare'
          : /专家|老师|医生|顾问|数据|案例|报告|专业/.test(input)
            ? 'expert'
            : /清单|盘点|合集|步骤|教程|第[一二三四五]|1\.|2\./.test(input)
              ? 'list'
              : /成交|转化|下单|私信|报价|痛点|cta/.test(input)
                ? 'deal'
                : /故事|反转|悬念|剧情|vlog/.test(input)
                  ? 'story'
                  : /种草|好物|测评|体验|开箱|卖点/.test(input)
                    ? 'seed'
                    : baseKey;
  const base = viralTemplates.find((item) => item.key === key) || viralTemplates[0];
  const bilingual = /双语|英文|english|字幕翻译/.test(input);
  const keyword = /关键词|高亮|重点|爆点|数字/.test(input);
  const fast = /快节奏|卡点|快切|节奏|爆款|热门|抖音|shorts|reels/.test(text);
  const cta = /私信|下单|点击|关注|预约|到店|团购|领取/.test(input);
  return {
    ...base,
    name: cta ? '平台转化复刻' : fast ? '爆款节奏复刻' : `${base.name}复刻`,
    accent: keyword ? '关键词高亮大标题' : base.accent,
    caption: `${bilingual ? '双语字幕' : '分句字幕'} + ${keyword ? '关键词高亮' : cta ? 'CTA 强调' : '节奏强调'}`,
    rhythm: fast ? '前三秒强钩子 / 1-2 秒一次强调 / 卡点转场' : cta ? '痛点-证明-行动 / CTA 段加重音效' : base.rhythm,
    scene: input.trim() ? `来自平台视频分析：${input.trim().slice(0, 72)}` : base.scene,
    effects: [
      keyword ? '关键词花字高亮' : '分句字幕强调',
      bilingual ? '中英双语字幕' : '智能断句字幕',
      fast ? '卡点缩放转场' : '轻微推拉',
      cta ? '行动按钮动效' : '标题钩子动效',
      '自动适配保存渲染'
    ],
    sourceSummary: input.trim()
  };
}

function buildViralTemplateAnalysisCards(baseKey: ViralTemplateKey, input: string) {
  const analyzed = analyzeViralTemplateDraft(baseKey, input);
  const text = input || analyzed.scene;
  return [
    {
      title: '视频结构',
      value: /反转|故事/.test(text) ? '悬念开头 - 反转解释 - 结尾复盘' : /成交|转化|私信/.test(text) ? '痛点开头 - 证明信任 - CTA 收口' : '强钩子开头 - 卖点递进 - 行动提示'
    },
    {
      title: '字幕策略',
      value: analyzed.caption
    },
    {
      title: '节奏拆解',
      value: analyzed.rhythm
    },
    {
      title: '特效组合',
      value: analyzed.effects.slice(0, 3).join(' / ')
    },
    {
      title: '转化点',
      value: /私信|下单|预约|团购|领取/.test(text) ? '结尾强化行动指令和利益点' : '强化记忆点，适合引导关注或继续观看'
    }
  ];
}

function normalizeUploadPercent(percent: number) {
  if (!Number.isFinite(percent)) return 0;
  const normalized = percent > 0 && percent <= 1 ? percent * 100 : percent;
  return Math.max(0, Math.min(100, Math.round(normalized)));
}

function getViralTemplateFeature(template: ViralTemplate) {
  const features: Record<ViralTemplateKey, { title: string; caption: string; badge: string }> = {
    street: {
      title: '强钩子开场',
      caption: '高能大字字幕',
      badge: '爆点节奏'
    },
    seed: {
      title: '种草清单感',
      caption: '卖点标签字幕',
      badge: '柔和转化'
    },
    deal: {
      title: '痛点转化',
      caption: '重点词警示',
      badge: '成交导向'
    },
    story: {
      title: '悬念反转',
      caption: '情绪分句字幕',
      badge: '故事包装'
    },
    list: {
      title: '清单递进',
      caption: '序号标签字幕',
      badge: '清单盘点'
    },
    expert: {
      title: '专业背书',
      caption: '数据结论字幕',
      badge: '专家背书'
    },
    compare: {
      title: '前后反差',
      caption: '双色对比字幕',
      badge: '前后对比'
    },
    urgency: {
      title: '限时刺激',
      caption: '价格时间高亮',
      badge: '限时促单'
    },
    local: {
      title: '到店路线',
      caption: '位置套餐字幕',
      badge: '本地探店'
    },
    live: {
      title: '直播高光',
      caption: '弹幕口语字幕',
      badge: '直播切片'
    }
  };
  return features[template.key];
}

function getViralTemplateCardCopy(template: ViralTemplateCard, fallbackText: string, index: number) {
  const bilingual = /双语/.test(template.cardName);
  const subtitles = [
    '双行排版更网感',
    '自动识别添加字幕',
    '关键句跳字高亮',
    '智能翻译双语字幕',
    '开小拍匹配素材'
  ];
  const badgeByKey: Record<ViralTemplateKey, string> = {
    street: '智能翻译',
    seed: '关键词',
    deal: '痛点强化',
    story: '故事悬念',
    list: '自动识别',
    expert: '重点信息',
    compare: '前后对比',
    urgency: '超满足',
    local: '到店提示',
    live: '直播高光'
  };
  return {
    title: /手写|轻奢/.test(template.cardName) ? '沟通表达课' : '智能加标题',
    subtitle: bilingual ? `智能翻译双语字幕\nBilingual captions` : subtitles[template.variantIndex % subtitles.length],
    badge: badgeByKey[template.key] || fallbackText.slice(0, 6) || '自动字幕'
  };
}

function getViralTemplateTheme(template: ViralTemplateCard | ViralTemplate): ViralTemplateTheme {
  const name = 'cardName' in template ? template.cardName : template.name;
  if (/轻奢白|简洁黄白|基础白金/.test(name)) {
    return {
      titleBackground: 'transparent',
      titleColor: '#fff7d6',
      captionBackground: 'transparent',
      captionColor: '#ffffff',
      keywordBackground: '#facc15',
      keywordColor: '#111827',
      effectBackground: 'rgb(250 204 21 / 28%)',
      glowColor: 'rgb(250 204 21 / 82%)'
    };
  }
  if (/经典蓝|新闻蓝|通勤绿蓝|商务科技/.test(name)) {
    return {
      titleBackground: 'transparent',
      titleColor: '#dbeafe',
      captionBackground: 'transparent',
      captionColor: '#e0f2fe',
      keywordBackground: '#2563eb',
      keywordColor: '#ffffff',
      effectBackground: 'rgb(37 99 235 / 42%)',
      glowColor: 'rgb(96 165 250 / 82%)'
    };
  }
  if (/黄色|金色|顶奢/.test(name)) {
    return {
      titleBackground: 'transparent',
      titleColor: '#fef3c7',
      captionBackground: 'transparent',
      captionColor: '#ffffff',
      keywordBackground: '#facc15',
      keywordColor: '#111827',
      effectBackground: 'rgb(250 204 21 / 34%)',
      glowColor: 'rgb(250 204 21 / 82%)'
    };
  }
  if (/粉色|醒目/.test(name)) {
    return {
      titleBackground: 'transparent',
      titleColor: '#fbcfe8',
      captionBackground: 'transparent',
      captionColor: '#ffffff',
      keywordBackground: '#db2777',
      keywordColor: '#ffffff',
      effectBackground: 'rgb(219 39 119 / 42%)',
      glowColor: 'rgb(244 114 182 / 82%)'
    };
  }
  if (/爆点|高级红/.test(name) || template.key === 'street') {
    return {
      titleBackground: '#8a1230',
      titleColor: '#ffffff',
      captionBackground: 'rgb(0 0 0 / 58%)',
      captionColor: '#ffffff',
      keywordBackground: '#b0123c',
      keywordColor: '#ffffff',
      effectBackground: 'rgb(138 18 48 / 52%)',
      glowColor: 'rgb(176 18 60 / 78%)'
    };
  }
  if (template.key === 'seed') {
    return {
      titleBackground: '#f59e0b',
      titleColor: '#ffffff',
      captionBackground: 'rgb(255 255 255 / 88%)',
      captionColor: '#17202e',
      keywordBackground: '#f9a8d4',
      keywordColor: '#831843',
      effectBackground: 'rgb(249 168 212 / 52%)',
      glowColor: 'rgb(244 114 182 / 78%)'
    };
  }
  if (template.key === 'deal' || /成交|转化/.test(name)) {
    return {
      titleBackground: '#111827',
      titleColor: '#facc15',
      captionBackground: 'rgb(17 24 39 / 82%)',
      captionColor: '#facc15',
      keywordBackground: '#dc2626',
      keywordColor: '#ffffff',
      effectBackground: 'rgb(250 204 21 / 18%)',
      glowColor: 'rgb(250 204 21 / 82%)'
    };
  }
  if (template.key === 'story') {
    return {
      titleBackground: 'rgb(15 23 42 / 82%)',
      titleColor: '#ffffff',
      captionBackground: 'rgb(15 23 42 / 76%)',
      captionColor: '#ffffff',
      keywordBackground: '#a855f7',
      keywordColor: '#ffffff',
      effectBackground: 'rgb(255 255 255 / 16%)',
      glowColor: 'rgb(168 85 247 / 78%)'
    };
  }
  if (template.key === 'list' || template.key === 'local') {
    return {
      titleBackground: '#0f766e',
      titleColor: '#ffffff',
      captionBackground: 'rgb(13 148 136 / 62%)',
      captionColor: '#ffffff',
      keywordBackground: '#14b8a6',
      keywordColor: '#ffffff',
      effectBackground: 'rgb(13 148 136 / 54%)',
      glowColor: 'rgb(45 212 191 / 82%)'
    };
  }
  if (template.key === 'expert') {
    return {
      titleBackground: '#1e293b',
      titleColor: '#ffffff',
      captionBackground: 'rgb(30 41 59 / 78%)',
      captionColor: '#ffffff',
      keywordBackground: '#64748b',
      keywordColor: '#ffffff',
      effectBackground: 'rgb(148 163 184 / 28%)',
      glowColor: 'rgb(148 163 184 / 72%)'
    };
  }
  if (template.key === 'compare') {
    return {
      titleBackground: 'linear-gradient(90deg, #2563eb, #ea580c)',
      titleColor: '#ffffff',
      captionBackground: 'rgb(124 58 237 / 64%)',
      captionColor: '#ffffff',
      keywordBackground: '#7c3aed',
      keywordColor: '#ffffff',
      effectBackground: 'rgb(124 58 237 / 48%)',
      glowColor: 'rgb(167 139 250 / 82%)'
    };
  }
  if (template.key === 'urgency') {
    return {
      titleBackground: '#dc2626',
      titleColor: '#ffffff',
      captionBackground: 'rgb(24 24 27 / 78%)',
      captionColor: '#fde68a',
      keywordBackground: '#facc15',
      keywordColor: '#111827',
      effectBackground: 'linear-gradient(90deg, #dc2626, #facc15)',
      glowColor: 'rgb(250 204 21 / 82%)'
    };
  }
  return {
    titleBackground: '#db2777',
    titleColor: '#ffffff',
    captionBackground: 'rgb(17 24 39 / 70%)',
    captionColor: '#ffffff',
    keywordBackground: '#db2777',
    keywordColor: '#ffffff',
    effectBackground: 'rgb(219 39 119 / 48%)',
    glowColor: 'rgb(244 114 182 / 82%)'
  };
}

function viralTemplateThemeStyle(template: ViralTemplateCard | ViralTemplate): CSSProperties {
  const theme = getViralTemplateTheme(template);
  return {
    '--viral-title-bg': theme.titleBackground,
    '--viral-title-color': theme.titleColor,
    '--viral-caption-bg': theme.captionBackground,
    '--viral-caption-color': theme.captionColor,
    '--viral-keyword-bg': theme.keywordBackground,
    '--viral-keyword-color': theme.keywordColor,
    '--viral-effect-bg': theme.effectBackground,
    '--viral-glow-color': theme.glowColor,
    '--viral-title-font': getViralDisplayFont(template, 'title'),
    '--viral-subtitle-font': getViralDisplayFont(template, 'subtitle')
  } as CSSProperties;
}

function getViralDisplayFont(template: ViralTemplateCard | ViralTemplate, layer: 'title' | 'subtitle') {
  const name = 'cardName' in template ? template.cardName : template.name;
  if (/手写|轻奢/.test(name)) return '"STXingkai", "KaiTi", "Microsoft YaHei", cursive';
  if (/科技|经典蓝|新闻蓝|智能识别/.test(name)) return '"Arial Black", Impact, "Microsoft YaHei", sans-serif';
  if (/黄色|金色|顶奢|基础白金/.test(name)) return '"Microsoft YaHei UI", "Arial Black", sans-serif';
  if (/红|粉色|醒目/.test(name)) return '"Arial Black", "Microsoft YaHei", sans-serif';
  if (layer === 'subtitle') return '"Trebuchet MS", "Microsoft YaHei", sans-serif';
  return '"Arial Black", "Microsoft YaHei", sans-serif';
}

function getViralTemplateTextStyle(template: ViralTemplateCard | ViralTemplate, layer: 'title' | 'caption'): ViralOverlayTextStyle {
  const cardName = 'cardName' in template ? template.cardName : template.name;
  const titleFont = getViralDisplayFont(template, 'title');
  const subtitleFont = getViralDisplayFont(template, 'subtitle');
  if (layer === 'title') {
    if (template.key === 'deal') return { fontSize: 25, fontFamily: titleFont, width: 320, height: 82 };
    if (template.key === 'story') return { fontSize: 22, fontFamily: titleFont, width: 300, height: 74 };
    if (template.key === 'expert') return { fontSize: 22, fontFamily: titleFont, width: 316, height: 76 };
    if (template.key === 'urgency') return { fontSize: 26, fontFamily: titleFont, width: 326, height: 84 };
    if (template.key === 'live') return { fontSize: 23, fontFamily: titleFont, width: 318, height: 78 };
    return { fontSize: /简洁|轻奢|基础/.test(cardName) ? 21 : 24, fontFamily: titleFont, width: 320, height: 82 };
  }
  if (template.key === 'seed') return { fontSize: 15, fontFamily: subtitleFont, width: 300, height: /双语/.test(cardName) ? 78 : 54 };
  if (template.key === 'deal') return { fontSize: 16, fontFamily: subtitleFont, width: 310, height: /双语/.test(cardName) ? 78 : 58 };
  if (template.key === 'story') return { fontSize: 15, fontFamily: subtitleFont, width: 320, height: /双语/.test(cardName) ? 78 : 58 };
  if (template.key === 'list') return { fontSize: 16, fontFamily: subtitleFont, width: 306, height: /双语/.test(cardName) ? 78 : 58 };
  if (template.key === 'expert') return { fontSize: 15, fontFamily: subtitleFont, width: 318, height: /双语/.test(cardName) ? 78 : 58 };
  if (template.key === 'compare') return { fontSize: 16, fontFamily: subtitleFont, width: 318, height: /双语/.test(cardName) ? 78 : 58 };
  if (template.key === 'urgency') return { fontSize: 17, fontFamily: subtitleFont, width: 312, height: /双语/.test(cardName) ? 78 : 58 };
  if (template.key === 'local') return { fontSize: 16, fontFamily: subtitleFont, width: 308, height: /双语/.test(cardName) ? 78 : 58 };
  if (template.key === 'live') return { fontSize: 16, fontFamily: subtitleFont, width: 318, height: /双语/.test(cardName) ? 82 : 62 };
  return { fontSize: /双语/.test(cardName) ? 14 : 16, fontFamily: subtitleFont, width: 300, height: /双语/.test(cardName) ? 78 : 54 };
}

function mergeViralTemplateTextStyle(template: ViralTemplateCard | ViralTemplate, layer: 'title' | 'caption', override?: Partial<ViralOverlayTextStyle>): ViralOverlayTextStyle {
  return { ...getViralTemplateTextStyle(template, layer), ...(override || {}) };
}

function getViralTemplatePreviewClass(template: ViralTemplateCard | ViralTemplate) {
  if (!('variantIndex' in template)) return 'variant-default';
  const classes = [
    'variant-high-red',
    'variant-luxury-white',
    'variant-classic-blue',
    'variant-yellow-flash',
    'variant-list-yellow-white',
    'variant-translucent-dark',
    'variant-basic-white-gold',
    'variant-versatile-yellow-bilingual',
    'variant-gold-luxury',
    'variant-business-tech',
    'variant-list-tech',
    'variant-news-blue',
    'variant-red-white',
    'variant-handwrite',
    'variant-commute-bluegreen',
    'variant-gold-inspire',
    'variant-knowledge',
    'variant-window-material',
    'variant-smart-recognition',
    'variant-pink-flash'
  ];
  return classes[template.variantIndex] || 'variant-default';
}

function buildViralKeywordList(keywords: string, captionText: string) {
  const explicitKeywords = keywords.split(/[,，、\s]+/).map((item) => item.trim()).filter((item) => item.length >= 2);
  const captionTokens = captionText.match(/[\u4e00-\u9fa5]{2,}|[A-Za-z0-9]{2,}/g) || [];
  const sourceKeywords = explicitKeywords.length ? explicitKeywords : captionTokens;
  return [...new Set(sourceKeywords)]
    .sort((left, right) => right.length - left.length)
    .slice(0, 8);
}

function extractViralKeywordsFromText(text: string) {
  const stopWords = new Set([
    '我们', '你们', '他们', '这个', '那个', '还是', '然后', '因为', '所以', '就是', '可以', '已经', '现在', '如果', '不是', '没有', '一个', '一下',
    '视频', '字幕', '选择', '完成', '调整', '生成'
  ]);
  const tokens = text.match(/[\u4e00-\u9fa5]{2,6}|[A-Za-z0-9]{3,}/g) || [];
  const scores = new Map<string, number>();
  for (const token of tokens) {
    const value = token.trim();
    if (value.length < 2 || stopWords.has(value)) continue;
    const hasSignal = /数字|创作|文案|模板|配音|小白|基础|口播|卖点|门店|爆款|成交|引流|剪辑|智能|高亮/.test(value);
    scores.set(value, (scores.get(value) || 0) + (hasSignal ? 3 : 1) + Math.min(2, value.length / 3));
  }
  return [...scores.entries()]
    .sort((left, right) => right[1] - left[1] || right[0].length - left[0].length)
    .map(([value]) => value)
    .slice(0, 8);
}

function renderViralHighlightedText(text: string, keywords: string[]) {
  if (!text || keywords.length === 0) return text;
  const escapedKeywords = keywords.map(escapeRegExp).filter(Boolean);
  if (escapedKeywords.length === 0) return text;
  const matcher = new RegExp(`(${escapedKeywords.join('|')})`, 'gi');
  return text.split(matcher).filter((part) => part.length > 0).map((part, index) => {
    const isKeyword = keywords.some((keyword) => keyword.toLowerCase() === part.toLowerCase());
    return isKeyword ? <mark key={`${part}-${index}`}>{part}</mark> : part;
  });
}

function getViralCaptionTranslation(caption: Partial<ViralCaptionSegment> | undefined, keywords: string[], fallbackText = '') {
  const editedTranslation = caption?.translation?.trim();
  if (editedTranslation) return editedTranslation;
  return buildViralBilingualCaption(caption?.text || fallbackText, keywords);
}

function buildViralBilingualCaption(text: string, keywords: string[]) {
  if (/数字人|虚拟人|AI/.test(text)) return 'Make digital avatars feel clear and engaging.';
  if (/入门|新手|小白/.test(text)) return 'Start simple and make the first step easy.';
  if (/节奏|内容/.test(text)) return 'Find the rhythm and make the message clear.';
  if (/文案|模板|字幕/.test(text)) return 'Use scripts, captions and templates to finish faster.';
  if (/配音|完成|创作/.test(text)) return `Tune the voice and finish the video.`;
  if (/普通人|快速|起来/.test(text)) return 'Make the process easier for everyday creators.';
  return 'Highlight the key message and make it memorable.';
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildViralCaptionSegments(keywords: string) {
  const words = keywords.split(/[,，、\s]+/).map((item) => item.trim()).filter(Boolean);
  const [first = '零基础', second = '视频创作', third = '数字人', fourth = '专业创作者'] = words;
  return [
    `${first}入门，让普通人也能快速做起来`,
    `${second}其实只需要找准内容节奏`,
    `生成文案，选择${third}或网感模板`,
    '调整配音和字幕，即可完成视频创作',
    `小白也能变成${fourth}`
  ].map((text, index) => ({
    time: [
      '00:00:00 - 00:00:02',
      '00:00:02 - 00:00:05',
      '00:00:05 - 00:00:07',
      '00:00:07 - 00:00:10',
      '00:00:10 - 00:00:12'
    ][index],
    text,
    translation: buildViralBilingualCaption(text, words)
  }));
}

function viralSubtitleSegmentsToCaptions(segments: ViralSubtitleSegment[]): ViralCaptionSegment[] {
  return segments
    .filter((segment) => segment.text?.trim() && Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.end > segment.start)
    .map((segment) => ({
      time: `${formatViralTime(segment.start)} - ${formatViralTime(segment.end)}`,
      text: segment.text.trim(),
      translation: buildViralBilingualCaption(segment.text.trim(), [])
    }));
}

async function waitForViralSubtitleSegments(jobId: string, onProgress?: (progress: number) => void) {
  if (!jobId) throw new Error('阿里云字幕任务没有返回 JobId');
  let lastJob = await getViralSubtitleJob(jobId);
  for (let index = 0; index < 24; index += 1) {
    const progress = Math.min(96, 74 + index);
    onProgress?.(progress);
    if (lastJob.successful && lastJob.segments.length > 0) return lastJob;
    if (lastJob.finished && !lastJob.successful) {
      throw new Error(`阿里云字幕识别失败，任务状态：${lastJob.status || 'unknown'}`);
    }
    await delay(2200);
    lastJob = await getViralSubtitleJob(jobId);
  }
  if (lastJob.segments.length > 0) return lastJob;
  throw new Error('阿里云字幕识别还未完成，请稍后重试或检查素材音轨是否清晰');
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function buildEditedViralCaptionSegments(captions: ViralCaptionSegment[], clips: ViralTimelineClip[]) {
  return captions.flatMap((caption, captionIndex) => {
    const captionStart = readViralCaptionStart(caption.time);
    const captionEnd = readViralCaptionEnd(caption.time);
    return clips.flatMap((clip) => {
      const sourceStart = Math.max(captionStart, clip.start);
      const sourceEnd = Math.min(captionEnd, clip.end);
      if (sourceEnd - sourceStart <= 0.04) return [];
      const timelineStart = sourceToViralTimelineTime(clips, sourceStart);
      const timelineEnd = sourceToViralTimelineTime(clips, Math.max(sourceStart, sourceEnd - 0.01));
      return [{
        key: `${caption.time}-${clip.id}`,
        time: `${formatViralTime(timelineStart)} - ${formatViralTime(timelineEnd)}`,
        text: caption.text,
        translation: caption.translation,
        sourceStart,
        sourceEnd,
        timelineStart,
        timelineEnd: Math.max(timelineStart + 0.04, timelineEnd),
        captionIndex
      }];
    });
  });
}

function findEditedViralCaptionIndex(captions: Array<{ timelineStart: number; timelineEnd: number }>, currentTime: number) {
  const index = captions.findIndex((caption) => currentTime >= caption.timelineStart && currentTime < caption.timelineEnd);
  return index >= 0 ? index : Math.max(0, captions.length - 1);
}

function getViralPreviewEffectPhase(currentTime: number, duration: number) {
  const progress = Math.max(0, Math.min(1, currentTime / Math.max(0.1, duration)));
  if (progress < 0.18) return 'hook';
  if (progress < 0.46) return 'caption';
  if (progress < 0.72) return 'accent';
  return 'cta';
}

function mapTemplatePreviewTimeToTimeline(previewTime: number, timelineDuration: number) {
  return (Math.max(0, previewTime) / VIRAL_TEMPLATE_PREVIEW_DURATION) * Math.max(0.1, timelineDuration);
}

function getViralTimelineDuration(clips: ViralTimelineClip[]) {
  return Math.max(0.1, clips.reduce((total, clip) => total + Math.max(0, clip.end - clip.start), 0));
}

function isViralSingleFullClip(clips: ViralTimelineClip[], duration: number) {
  return clips.length === 1
    && clips[0].start === 0
    && Math.abs(clips[0].end - duration) < 0.08;
}

function clampViralClipsToDuration(clips: ViralTimelineClip[], duration: number) {
  const safeDuration = Math.max(0.1, duration);
  const nextClips = clips
    .map((clip) => ({
      ...clip,
      start: Math.max(0, Math.min(clip.start, safeDuration - 0.04)),
      end: Math.max(0.04, Math.min(clip.end, safeDuration))
    }))
    .filter((clip) => clip.end - clip.start > 0.04);
  return nextClips.length ? nextClips : createViralDefaultClips(safeDuration);
}

function buildViralRulerTimes(duration: number) {
  const safeDuration = Math.max(0.1, duration);
  return Array.from({ length: 6 }, (_, index) => Number(((safeDuration / 5) * index).toFixed(2)));
}

function findViralClipAtSourceTime(clips: ViralTimelineClip[], sourceTime: number) {
  return clips.find((clip) => sourceTime >= clip.start && sourceTime < clip.end)
    || clips.find((clip) => Math.abs(sourceTime - clip.end) < 0.04);
}

function sourceToViralTimelineTime(clips: ViralTimelineClip[], sourceTime: number) {
  let timelineTime = 0;
  for (const clip of clips) {
    if (sourceTime <= clip.start) return timelineTime;
    if (sourceTime < clip.end) return timelineTime + (sourceTime - clip.start);
    timelineTime += clip.end - clip.start;
  }
  return getViralTimelineDuration(clips);
}

function viralTimelineTimeToSourceTime(clips: ViralTimelineClip[], timelineTime: number) {
  let cursor = Math.max(0, timelineTime);
  for (const clip of clips) {
    const duration = clip.end - clip.start;
    if (cursor <= duration) return Math.min(clip.end - 0.01, clip.start + cursor);
    cursor -= duration;
  }
  const lastClip = clips[clips.length - 1];
  return lastClip ? Math.max(lastClip.start, lastClip.end - 0.01) : 0;
}

function getViralMediaDisplayTime(video: HTMLVideoElement, sourceTime: number) {
  const duration = video.duration;
  if (!Number.isFinite(duration) || duration <= 0.12) return Math.max(0, sourceTime);
  const loopPoint = Math.max(0.1, duration - 0.08);
  return Math.min(loopPoint, Math.max(0, sourceTime % loopPoint));
}

function getViralPosterSeekTime(duration: number) {
  if (!Number.isFinite(duration) || duration <= 0.8) return 0;
  return Math.min(Math.max(0.35, duration * 0.08), Math.max(0.1, duration - 0.2));
}

function findNearestPlayableViralSourceTime(clips: ViralTimelineClip[], sourceTime: number) {
  const activeClip = findViralClipAtSourceTime(clips, sourceTime);
  if (activeClip) return Math.max(activeClip.start, Math.min(activeClip.end - 0.01, sourceTime));
  const nextClip = clips.find((clip) => sourceTime < clip.start);
  if (nextClip) return nextClip.start;
  const lastClip = clips[clips.length - 1];
  return lastClip ? Math.max(lastClip.start, lastClip.end - 0.01) : 0;
}

function findNextPlayableViralSourceTime(clips: ViralTimelineClip[], sourceTime: number) {
  const activeClip = findViralClipAtSourceTime(clips, sourceTime);
  if (activeClip) return Math.max(activeClip.start, Math.min(activeClip.end - 0.01, sourceTime));
  const nextClip = clips.find((clip) => sourceTime < clip.start);
  if (nextClip) return nextClip.start;
  return clips[0]?.start || 0;
}

function findViralCaptionIndex(captions: Array<{ time: string }>, currentTime: number) {
  const index = captions.findIndex((caption) => currentTime >= readViralCaptionStart(caption.time) && currentTime < readViralCaptionEnd(caption.time));
  return index >= 0 ? index : Math.max(0, captions.length - 1);
}

function readViralCaptionStart(range: string) {
  return parseViralTimestamp(range.split('-')[0]);
}

function readViralCaptionEnd(range: string) {
  return parseViralTimestamp(range.split('-')[1]);
}

function parseViralTimestamp(value = '') {
  const parts = value.trim().split(':').map((part) => Number(part));
  if (parts.length < 3 || parts.some((part) => Number.isNaN(part))) return 0;
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

function formatViralTime(value: number) {
  const safeValue = Math.max(0, value);
  const minutes = Math.floor(safeValue / 60);
  const seconds = Math.floor(safeValue % 60);
  const tenths = Math.floor((safeValue % 1) * 10);
  return `00:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths}`;
}

function formatViralRulerLabel(value: number) {
  const safeValue = Math.max(0, value);
  const minutes = Math.floor(safeValue / 60);
  const seconds = Math.floor(safeValue % 60);
  const tenths = Math.floor((safeValue % 1) * 10);
  return safeValue < 10 && tenths > 0
    ? `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatViralDuration(value: number) {
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function readViralDuration(value: string) {
  const parts = value.split(':').map((part) => Number(part));
  if (parts.length === 2 && parts.every(Number.isFinite)) return parts[0] * 60 + parts[1];
  if (parts.length === 3 && parts.every(Number.isFinite)) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) ? numeric : VIRAL_TIMELINE_DURATION;
}

function formatViralTaskExpiry(savedAt: string) {
  const savedTime = new Date(savedAt).getTime();
  if (!Number.isFinite(savedTime)) return '29天';
  const expireTime = savedTime + 30 * 24 * 60 * 60 * 1000;
  const daysLeft = Math.max(0, Math.ceil((expireTime - Date.now()) / (24 * 60 * 60 * 1000)));
  return `${daysLeft}天`;
}

function rotateEffects(effects: string[], offset: number) {
  if (effects.length === 0) return [];
  return effects.map((_, index) => effects[(index + offset) % effects.length]).slice(0, 4);
}

function FissionWorkspace(props: {
  projectId: string;
  projectName: string;
  onSavedToFinishedLibrary: (savedCount: number) => void;
  onDraftStateChange: (snapshot: FissionWorkspaceDraft) => void;
  onDraftAutoSaved: (snapshot: FissionWorkspaceDraft) => void;
}) {
  const draftLoadedRef = useRef(false);
  const generationTimerRef = useRef<number>();
  const protectedMediaUrlCacheRef = useRef(new Map<string, string>());
  const protectedMediaUrlPendingRef = useRef(new Map<string, Promise<string | undefined>>());
  const localMixSourceCacheRef = useRef(new Map<string, string | null>());
  const remoteDurationCacheRef = useRef(new Map<string, number>());
  const speechWindowCacheRef = useRef(new Map<string, ReturnType<typeof normalizePresenterSpeechWindow>>());
  const [groups, setGroups] = useState<FissionShotGroup[]>(defaultFissionGroups);
  const [activeGroupId, setActiveGroupId] = useState(defaultFissionGroups[1].id);
  const [expandedIds, setExpandedIds] = useState<string[]>([defaultFissionGroups[1].id]);
  const [selectedClipIdsByGroup, setSelectedClipIdsByGroup] = useState<Record<string, string[]>>(createDefaultFissionClipSelectionMap(defaultFissionGroups));
  const [activeSettingsTab, setActiveSettingsTab] = useState<FissionSettingsTab>('group');
  const [comboMode, setComboMode] = useState<FissionComboMode>('single');
  const [soundSettings, setSoundSettings] = useState<FissionSoundSettings>(defaultFissionSoundSettings);
  const [generatedVideos, setGeneratedVideos] = useState<GeneratedFissionVideo[]>([]);
  const [segmentCandidateRestoreState, setSegmentCandidateRestoreState] = useState<{
    segmentBatchKey: string;
    waterfallBatchKey: string;
    videos: GeneratedFissionVideo[];
  } | null>(null);
  const [fissionResultView, setFissionResultView] = useState<'segments' | 'waterfall'>('segments');
  const [selectedGeneratedIds, setSelectedGeneratedIds] = useState<string[]>([]);
  const [waterfallDialogOpen, setWaterfallDialogOpen] = useState(false);
  const [waterfallCountDraft, setWaterfallCountDraft] = useState(DEFAULT_MIX_BATCH_COUNT);
  const [mixBatchCount, setMixBatchCount] = useState(DEFAULT_MIX_BATCH_COUNT);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationError, setGenerationError] = useState('');
  const [generationPreflightDialog, setGenerationPreflightDialog] = useState<FissionGeneratePreflightDialog | null>(null);
  const [lastOutputMediaUrl, setLastOutputMediaUrl] = useState('');
  const [uploadNotice, setUploadNotice] = useState('');
  const [scriptDialogOpen, setScriptDialogOpen] = useState(false);
  const [scriptImportNotice, setScriptImportNotice] = useState('');
  const [scriptDraft, setScriptDraft] = useState(`开头：3秒，产品近景开场，制造好奇心
平台引入：3秒，人物口播引出场景
特点：5秒，展示核心卖点和使用效果
详情：6秒，补充细节、材质、适用人群
END：4秒，收束行动指令和品牌露出`);
  const [audioItems, setAudioItems] = useState<FissionAudioItem[]>([]);
  const [clearGroupsConfirmOpen, setClearGroupsConfirmOpen] = useState(false);
  const [replaceFinishedConfirm, setReplaceFinishedConfirm] = useState<{
    draftName: string;
    nextVideos: FinishedVideoItem[];
    nextGroup: FinishedVideoGroup;
    existingGroups: FinishedVideoGroup[];
  } | null>(null);
  const [previewMedia, setPreviewMedia] = useState<PreviewMediaState | null>(null);
  const [selectedPreviewId, setSelectedPreviewId] = useState('');
  const strategyCardsRef = useRef<HTMLDivElement>(null);
  const previewGridRef = useRef<HTMLDivElement>(null);
  const activeGroup = groups.find((group) => group.id === activeGroupId) || groups[0];
  const scriptPreviewGroups = scriptDialogOpen ? parseScriptGroups(scriptDraft) : [];
  const scriptPreviewDocument = scriptPreviewGroups[0];
  const selectedMixGroups = filterFissionGroupsBySelectedClips(groups, selectedClipIdsByGroup);
  const selectedClipCount = countSelectedFissionClips(groups, selectedClipIdsByGroup);
  const selectedSceneCount = selectedMixGroups.length;
  const estimatedSelectedCombinationCount = estimateSelectedFissionCombinationCount(groups, selectedClipIdsByGroup);
  const generatedResultBatchGroups = buildGeneratedResultBatchGroups(generatedVideos);
  const scriptImportNoticeTone = /失败|没有识别|为空/i.test(scriptImportNotice)
    ? 'error'
    : /已识别|已解析|已载入/i.test(scriptImportNotice)
      ? 'success'
      : 'info';
  const scriptPreviewCountLabel = scriptPreviewGroups.length > 0
    ? `识别 ${scriptPreviewGroups.length} 个镜头分组`
    : scriptDraft.trim()
      ? '暂未识别可用分镜'
      : '等待输入脚本';
  const selectedPreviewItem = generatedVideos.find((item) => item.id === selectedPreviewId) || generatedVideos[0];
  const plannedMixBatchCount = normalizeFissionBatchCount(mixBatchCount);
  const generatedVideoCount = estimatedSelectedCombinationCount;
  const resultStrategyTags = buildFissionResultStrategyTags(generatedVideos, soundSettings.retainOriginalAudio);
  const uploadNoticeMeta = uploadNotice ? describeFissionStatusNotice(uploadNotice) : null;
  const canReturnToSegmentCandidates = fissionResultView === 'waterfall' && Boolean(segmentCandidateRestoreState?.videos.length);
  const generationErrorTitle = generationError
    ? !uploadNotice
      ? '生成失败'
      : /部分任务提交失败/i.test(generationError)
        ? '部分任务失败'
        : '重试前检查'
    : '';
  const selectableResultCount = generatedVideos.length;
  const selectedGeneratedCount = selectedGeneratedIds.filter((id) => generatedVideos.some((video) => video.id === id)).length;

  async function resolveProtectedPlayableMediaUrl(path?: string) {
    if (!path) return undefined;
    if (!isCloudMediaUrl(path)) return path;
    const cached = protectedMediaUrlCacheRef.current.get(path);
    if (cached) return cached;
    const pending = protectedMediaUrlPendingRef.current.get(path);
    if (pending) return pending;
    const resolveTask = (async () => {
      const playablePath = shouldRequestProtectedPreview(path)
        ? (await getProtectedMediaAccessUrl(path)).mediaUrl
        : path;
      if (playablePath) {
        protectedMediaUrlCacheRef.current.set(path, playablePath);
      }
      return playablePath;
    })().finally(() => {
      protectedMediaUrlPendingRef.current.delete(path);
    });
    protectedMediaUrlPendingRef.current.set(path, resolveTask);
    return resolveTask;
  }

  async function resolveRenderableMixSource(media?: { id?: string; name?: string; localPath?: string; path?: string }) {
    if (!media) return undefined;
    const cacheKey = media.localPath || media.path || media.id || media.name || '';
    if (!cacheKey) return undefined;
    if (localMixSourceCacheRef.current.has(cacheKey)) {
      return localMixSourceCacheRef.current.get(cacheKey) || undefined;
    }
    const resolvedPath = media.localPath || await resolveProtectedPlayableMediaUrl(media.path);
    localMixSourceCacheRef.current.set(cacheKey, resolvedPath || null);
    return resolvedPath;
  }

  async function probeRemoteMediaDuration(source: string, mediaType: 'video' | 'audio') {
    const cacheKey = `${mediaType}:${source}`;
    const cached = remoteDurationCacheRef.current.get(cacheKey);
    if (cached && cached > 0) return cached;

    const duration = await new Promise<number>((resolve) => {
      const media = document.createElement(mediaType);
      let settled = false;
      const finish = (value: number) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        media.removeAttribute('src');
        media.load();
        resolve(Number.isFinite(value) && value > 0 ? value : 0);
      };
      const timeoutId = window.setTimeout(() => finish(0), 8000);
      media.preload = 'metadata';
      media.muted = true;
      if (media instanceof HTMLVideoElement) {
        media.playsInline = true;
      }
      media.onloadedmetadata = () => finish(Number(media.duration));
      media.onerror = () => finish(0);
      media.src = source;
    });

    if (duration > 0) {
      remoteDurationCacheRef.current.set(cacheKey, duration);
    }
    return duration;
  }

  async function probeAvailableMediaDuration(media: { localPath?: string; path?: string }, mediaType: 'video' | 'audio') {
    if (media.localPath) {
      const localProbe = await probeLocalMediaMetadata(media.localPath);
      if (localProbe?.duration && localProbe.duration > 0) return localProbe.duration;
    }
    const playablePath = await resolveProtectedPlayableMediaUrl(media.path);
    if (!playablePath) return 0;
    return probeRemoteMediaDuration(playablePath, mediaType);
  }

  async function analyzePresenterAudioSpeechWindow(audio: FissionAudioItem, usageType?: FissionMixAudioUsageType) {
    if (!isPresenterVoiceLikeUsage(usageType || audio.usageType)) return normalizePresenterSpeechWindow(audio);

    const cacheKey = audio.localPath || audio.path || audio.id;
    const cached = speechWindowCacheRef.current.get(cacheKey);
    if (cached) return cached;

    const analyzer = window.surgicol?.media?.analyzeSpeech;
    const speechFallback = normalizePresenterSpeechWindow(audio);
    if (typeof analyzer !== 'function') {
      speechWindowCacheRef.current.set(cacheKey, speechFallback);
      return speechFallback;
    }

    let analysisPath = audio.localPath;
    if (!analysisPath && audio.path) {
      const playablePath = await resolveProtectedPlayableMediaUrl(audio.path);
      if (playablePath) {
        const cachedMedia = await window.surgicol.media.cacheRemoteFile(playablePath, {
          folder: 'fission/speech-analysis',
          cacheKey: audio.id,
          fileName: audio.name
        }).catch(() => null);
        analysisPath = cachedMedia?.localPath;
      }
    }

    if (!analysisPath) {
      speechWindowCacheRef.current.set(cacheKey, speechFallback);
      return speechFallback;
    }

    const analysis = await analyzer(analysisPath).catch(() => null);
    const speechWindow = normalizePresenterSpeechWindow({
      duration: audio.duration,
      speechStart: analysis?.speechStart,
      speechEnd: analysis?.speechEnd,
      speechDuration: analysis?.speechDuration
    });
    speechWindowCacheRef.current.set(cacheKey, speechWindow);
    return speechWindow;
  }

  async function createImportedVideoClip(filePath: string, index: number) {
    const probe = await probeLocalMediaMetadata(filePath);
    return {
      id: crypto.randomUUID(),
      name: filePath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') || `导入视频_${index + 1}`,
      duration: formatFissionMediaDuration(probe?.duration || 0, '10.00s'),
      coverTone: index % 2 === 0 ? 'warm' : 'cool',
      localPath: filePath,
      uploadStatus: 'uploading' as FissionUploadStatus
    };
  }

  async function createImportedAudioItem(filePath: string, volume: number, scope: FissionAudioScope, sourceGroups: FissionShotGroup[]) {
    const probe = await probeLocalMediaMetadata(filePath);
    const name = filePath.split(/[\\/]/).pop() || filePath;
    const usageType = resolveImportedFissionAudioUsage({ name, localPath: filePath }, scope, sourceGroups);
    const nextAudio = {
      id: crypto.randomUUID(),
      name,
      duration: formatFissionMediaDuration(probe?.duration || 0, '00:30'),
      volume,
      usageType,
      localPath: filePath,
      uploadStatus: 'uploading' as FissionUploadStatus
    } satisfies FissionAudioItem;
    if (scope === 'global' || !isPresenterVoiceLikeUsage(usageType)) return nextAudio;
    const speechWindow = await analyzePresenterAudioSpeechWindow(nextAudio, usageType);
    return {
      ...nextAudio,
      duration: formatFissionMediaDuration(speechWindow.effectiveDuration || probe?.duration || 0, nextAudio.duration),
      speechStart: speechWindow.speechStart,
      speechEnd: speechWindow.speechEnd,
      speechDuration: speechWindow.effectiveDuration
    } satisfies FissionAudioItem;
  }

  function updateGroupAudioUsage(groupId: string, audioId: string, usageType: FissionMixAudioUsageType) {
    resetGeneratedResultState();
    setGroups((items) =>
      items.map((group) =>
        group.id === groupId
          ? {
              ...group,
              groupAudios: (group.groupAudios || []).map((audio) => (audio.id === audioId ? { ...audio, usageType } : audio))
            }
          : group
      )
    );
  }

  async function prepareFissionMediaForMix(currentGroups: FissionShotGroup[], currentAudioItems: FissionAudioItem[]) {
    let syncedCount = 0;

    const nextGroups = await Promise.all(currentGroups.map(async (group) => {
      let groupChanged = false;
      const nextClips = await Promise.all(group.clips.map(async (clip) => {
        const actualDuration = await probeAvailableMediaDuration(clip, 'video');
        if (!(actualDuration > 0)) return clip;
        const nextDuration = formatFissionMediaDuration(actualDuration, clip.duration || '10.00s');
        if (Math.abs(parseDurationSeconds(clip.duration) - actualDuration) <= 0.35 && nextDuration === clip.duration) {
          return clip;
        }
        groupChanged = true;
        syncedCount += 1;
        return { ...clip, duration: nextDuration };
      }));

      const nextGroupAudios = await Promise.all((group.groupAudios || []).map(async (audio) => {
        const actualDuration = await probeAvailableMediaDuration(audio, 'audio');
        const nextUsageType = resolveImportedFissionAudioUsage(audio, 'group', currentGroups);
        const rawDurationLabel = actualDuration > 0
          ? formatFissionMediaDuration(actualDuration, audio.duration || '00:30')
          : audio.duration;
        const speechWindow = isPresenterVoiceLikeUsage(nextUsageType)
          ? await analyzePresenterAudioSpeechWindow({ ...audio, duration: rawDurationLabel }, nextUsageType)
          : null;
        const nextDuration = speechWindow?.effectiveDuration
          ? formatFissionMediaDuration(speechWindow.effectiveDuration, rawDurationLabel || '00:30')
          : rawDurationLabel;
        const nextSpeechStart = speechWindow?.speechStart;
        const nextSpeechEnd = speechWindow?.speechEnd;
        const nextSpeechDuration = speechWindow?.effectiveDuration;
        if (
          nextDuration === audio.duration
          && nextUsageType === audio.usageType
          && nextSpeechStart === audio.speechStart
          && nextSpeechEnd === audio.speechEnd
          && nextSpeechDuration === audio.speechDuration
        ) {
          return audio;
        }
        groupChanged = true;
        syncedCount += 1;
        return {
          ...audio,
          duration: nextDuration,
          usageType: nextUsageType,
          speechStart: nextSpeechStart,
          speechEnd: nextSpeechEnd,
          speechDuration: nextSpeechDuration
        };
      }));

      if (!groupChanged) return group;
      return {
        ...group,
        clips: nextClips,
        groupAudios: nextGroupAudios
      };
    }));

    let globalAudioChanged = false;
    const nextAudioItems = await Promise.all(currentAudioItems.map(async (audio) => {
      const actualDuration = await probeAvailableMediaDuration(audio, 'audio');
      const nextUsageType: FissionMixAudioUsageType = audio.usageType === 'effect' ? 'effect' : 'music';
      const rawDurationLabel = actualDuration > 0
        ? formatFissionMediaDuration(actualDuration, audio.duration || '00:30')
        : audio.duration;
      const nextDuration = rawDurationLabel;
      const nextSpeechStart = undefined;
      const nextSpeechEnd = undefined;
      const nextSpeechDuration = undefined;
      if (
        nextDuration === audio.duration
        && nextUsageType === audio.usageType
        && nextSpeechStart === audio.speechStart
        && nextSpeechEnd === audio.speechEnd
        && nextSpeechDuration === audio.speechDuration
      ) {
        return audio;
      }
      globalAudioChanged = true;
      syncedCount += 1;
      return {
        ...audio,
        duration: nextDuration,
        usageType: nextUsageType,
        speechStart: nextSpeechStart,
        speechEnd: nextSpeechEnd,
        speechDuration: nextSpeechDuration
      };
    }));

    return {
      groups: nextGroups,
      audioItems: nextAudioItems,
      changed: syncedCount > 0 || globalAudioChanged || nextGroups.some((group, index) => group !== currentGroups[index]),
      syncedCount
    };
  }

  useEffect(() => {
    let cancelled = false;
    window.surgicol.store.get(FISSION_WORKSPACE_DRAFT_KEY)
      .then((value) => {
        if (cancelled) return;
        const draft = readFissionWorkspaceDraft(value);
        if (!draft) return;
        const nextGroups = normalizeFissionGroupsForDraft(draft.groups.length > 0 ? draft.groups : defaultFissionGroups);
        const nextAudioItems = normalizeFissionAudioItemsForDraft(draft.audioItems);
        const nextActiveGroupId = draft.activeGroupId && nextGroups.some((group) => group.id === draft.activeGroupId)
          ? draft.activeGroupId
          : nextGroups[0]?.id || defaultFissionGroups[0].id;

        setGroups(nextGroups);
        setAudioItems(nextAudioItems);
        setActiveGroupId(nextActiveGroupId);
        setExpandedIds(draft.expandedIds?.filter((id) => nextGroups.some((group) => group.id === id)) || [nextActiveGroupId]);
        setSelectedClipIdsByGroup(normalizeFissionClipSelectionMap(nextGroups, draft.selectedClipIdsByGroup).selectionMap);
        setComboMode(draft.comboMode || 'single');
        setGeneratedVideos(draft.generatedVideos || []);
        setMixBatchCount(normalizeFissionBatchCount(draft.mixBatchCount));
        setSelectedGeneratedIds([]);
        setActiveSettingsTab(draft.activeSettingsTab || 'group');
        setSoundSettings({ ...defaultFissionSoundSettings, ...draft.soundSettings });
      })
      .catch(() => {
        // 本地草稿读取失败时保留默认演示数据，不影响编辑器使用。
      })
      .finally(() => {
        if (!cancelled) draftLoadedRef.current = true;
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setSelectedClipIdsByGroup((current) => {
      const normalized = normalizeFissionClipSelectionMap(groups, current);
      return normalized.changed ? normalized.selectionMap : current;
    });
  }, [groups]);

  useEffect(() => {
    if (!draftLoadedRef.current) return;
    const snapshot = {
      groups,
      audioItems,
      activeGroupId,
      expandedIds,
      selectedClipIdsByGroup,
      comboMode,
      generatedVideos,
      mixBatchCount: plannedMixBatchCount,
      activeSettingsTab,
      soundSettings
    } satisfies FissionWorkspaceDraft;
    props.onDraftStateChange(snapshot);
    const saveTimer = window.setTimeout(() => {
      void window.surgicol.store.set(FISSION_WORKSPACE_DRAFT_KEY, snapshot).then(() => {
        props.onDraftAutoSaved(snapshot);
      });
    }, 250);

    return () => window.clearTimeout(saveTimer);
  }, [activeGroupId, activeSettingsTab, audioItems, comboMode, expandedIds, generatedVideos, groups, mixBatchCount, plannedMixBatchCount, selectedClipIdsByGroup, soundSettings, props]);

  useEffect(() => {
    return () => {
      if (generationTimerRef.current) window.clearInterval(generationTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (generatedVideos.length > 0) {
      previewGridRef.current?.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    }
  }, [generatedVideos.length]);

  useEffect(() => {
    setSelectedGeneratedIds((ids) => ids.filter((id) => generatedVideos.some((video) => video.id === id)));
  }, [generatedVideos]);

  useEffect(() => {
    const pollingJobs = generatedVideos.filter((video) => video.jobId && (video.jobStatus === 'submitted' || video.jobStatus === 'running'));
    if (pollingJobs.length === 0) return undefined;

    let cancelled = false;
    const pollJobs = async () => {
      const settledVideos = await Promise.all(pollingJobs.map(async (video) => {
        try {
          const status = await getAliyunMixJobStatus(video.jobId || '');
          return {
            id: video.id,
            patch: {
              jobStatus: status.successful ? 'success' : status.finished ? 'failed' : 'running',
              jobStatusText: aliyunJobStatusText(status.status, status.finished, status.successful),
              jobMessage: status.message || status.code || '',
              duration: status.duration ? `${Math.round(status.duration)}s` : video.duration,
              path: status.mediaUrl || video.path
            } satisfies Partial<GeneratedFissionVideo>
          };
        } catch (error) {
          return {
            id: video.id,
            patch: {
              jobStatus: 'running',
              jobStatusText: '状态查询重试中',
              jobMessage: error instanceof Error ? error.message : '状态查询失败'
            } satisfies Partial<GeneratedFissionVideo>
          };
        }
      }));
      if (cancelled) return;
      setGeneratedVideos((videos) =>
        videos.map((video) => {
          const settled = settledVideos.find((item) => item.id === video.id);
          return settled ? { ...video, ...settled.patch } : video;
        })
      );
    };

    void pollJobs();
    const timer = window.setInterval(() => void pollJobs(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [generatedVideos]);

  function toggleExpanded(id: string) {
    setExpandedIds((ids) => (ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]));
  }

  useEffect(() => {
    const activeCard = strategyCardsRef.current?.querySelector<HTMLElement>(`[data-group-id="${activeGroupId}"]`);
    activeCard?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [activeGroupId]);

  function scrollStrategyCards(direction: 'left' | 'right') {
    strategyCardsRef.current?.scrollBy({
      left: direction === 'left' ? -320 : 320,
      behavior: 'smooth'
    });
  }

  function getFallbackPreviewPath() {
    const clip = groups.flatMap((group) => group.clips).find((item) => Boolean(item.localPath || item.path));
    return previewPath(clip);
  }

  function previewVideoItem(item?: FissionPreviewItem) {
    if (!item) return;
    setSelectedPreviewId(item.id);
    setPreviewMedia({ type: 'video', name: item.name, path: previewPath(item) || getFallbackPreviewPath() });
  }

  async function previewGeneratedVideoItem(item?: GeneratedFissionVideo) {
    if (!item) return;
    setSelectedPreviewId(item.id);
    const rawPath = playableGeneratedPath(item);
    const proxyPreview = isProxyGeneratedVideo(item);
    const previewNote = buildGeneratedPreviewNote(item, soundSettings.retainOriginalAudio);
    const previewBadge = proxyPreview ? '本地混剪静音预览' : !soundSettings.retainOriginalAudio ? '已关闭原声' : undefined;
    const requestKey = `generated:${item.id}:${rawPath || 'empty'}`;
    if (!rawPath) {
      setPreviewMedia({ type: 'video', name: item.name, path: undefined, muted: proxyPreview, badge: previewBadge, note: previewNote, requestKey });
      return;
    }
    const requiresProtectedResolve = shouldRequestProtectedPreview(rawPath);
    const cachedPreviewPath = requiresProtectedResolve ? protectedMediaUrlCacheRef.current.get(rawPath) : rawPath;
    setPreviewMedia({
      type: 'video',
      name: item.name,
      path: cachedPreviewPath,
      muted: proxyPreview,
      badge: previewBadge,
      note: previewNote,
      loading: requiresProtectedResolve && !cachedPreviewPath,
      helperText: requiresProtectedResolve && !cachedPreviewPath ? '正在获取可播放地址，首次打开会稍慢一点，后续会直接命中缓存。' : undefined,
      requestKey
    });
    if (cachedPreviewPath || !requiresProtectedResolve) {
      return;
    }
    try {
      const resolvedPreviewPath = await resolveProtectedPlayableMediaUrl(rawPath);
      setPreviewMedia((current) => (
        current?.requestKey === requestKey
          ? {
              ...current,
              path: resolvedPreviewPath,
              loading: false,
              helperText: undefined,
              error: undefined
            }
          : current
      ));
    } catch (error) {
      const fallbackPath = /^https?:\/\//i.test(rawPath) ? rawPath : undefined;
      const message = error instanceof Error ? error.message : '获取视频预览地址失败';
      setPreviewMedia((current) => (
        current?.requestKey === requestKey
          ? {
              ...current,
              path: fallbackPath,
              loading: false,
              helperText: undefined,
              error: message
            }
          : current
      ));
    }
  }

  function resetGeneratedResultState() {
    setGeneratedVideos([]);
    setSegmentCandidateRestoreState(null);
    setFissionResultView('segments');
    setSelectedGeneratedIds([]);
    setSelectedPreviewId('');
    setLastOutputMediaUrl('');
    setGenerationError('');
  }

  function selectAllFissionGroupClips(groupId: string) {
    const targetGroup = groups.find((group) => group.id === groupId);
    if (!targetGroup) return;
    setSelectedClipIdsByGroup((current) => ({
      ...current,
      [groupId]: targetGroup.clips.map((clip) => clip.id)
    }));
  }

  function clearFissionGroupClips(groupId: string) {
    setSelectedClipIdsByGroup((current) => ({
      ...current,
      [groupId]: []
    }));
  }

  function toggleFissionGroupClip(groupId: string, clipId: string) {
    setSelectedClipIdsByGroup((current) => {
      const targetGroup = groups.find((group) => group.id === groupId);
      if (!targetGroup) return current;
      const currentIds = resolveSelectedClipIdsForGroup(targetGroup, current);
      const nextIds = currentIds.includes(clipId)
        ? currentIds.filter((id) => id !== clipId)
        : [...currentIds, clipId];
      return {
        ...current,
        [groupId]: nextIds
      };
    });
  }

  function selectAllFissionClips() {
    setSelectedClipIdsByGroup(createDefaultFissionClipSelectionMap(groups));
  }

  function clearAllFissionClips() {
    setSelectedClipIdsByGroup(Object.fromEntries(groups.map((group) => [group.id, []])));
  }

  function toggleGeneratedSelection(selectionKey: string) {
    setSelectedGeneratedIds((ids) => (ids.includes(selectionKey) ? ids.filter((id) => id !== selectionKey) : [...ids, selectionKey]));
  }

  function selectAllGeneratedVideos() {
    setSelectedGeneratedIds(generatedVideos.map((video) => video.id));
  }

  function selectGeneratedResultBatch(batchKey: string) {
    const batchIds = generatedVideos
      .filter((video) => getGeneratedResultBatchKey(video) === batchKey)
      .map((video) => video.id);
    setSelectedGeneratedIds((ids) => Array.from(new Set([...ids, ...batchIds])));
  }

  function clearGeneratedResultBatchSelection(batchKey: string) {
    const removableIds = new Set(
      generatedVideos
        .filter((video) => getGeneratedResultBatchKey(video) === batchKey)
        .map((video) => video.id)
    );
    setSelectedGeneratedIds((ids) => ids.filter((id) => !removableIds.has(id)));
  }

  function selectFissionResultGroup(groupId: string) {
    const keys = generatedVideos
      .filter((video) => Boolean(findGeneratedDetailForGroup(video, groups.find((group) => group.id === groupId) || activeGroup)))
      .map((video) => video.id);
    setSelectedGeneratedIds((ids) => Array.from(new Set([...ids, ...keys])));
  }

  function clearFissionResultGroupSelection(groupId: string) {
    const removableIds = new Set(
      generatedVideos
        .filter((video) => Boolean(findGeneratedDetailForGroup(video, groups.find((group) => group.id === groupId) || activeGroup)))
        .map((video) => video.id)
    );
    setSelectedGeneratedIds((ids) => ids.filter((id) => !removableIds.has(id)));
  }

  function isGeneratedVideoSelected(video: GeneratedFissionVideo) {
    return selectedGeneratedIds.includes(video.id);
  }

  function isFissionDetailSelected(groupId: string, videoId: string) {
    void groupId;
    return selectedGeneratedIds.includes(videoId);
  }

  async function persistFinishedVideoGroup(nextGroup: FinishedVideoGroup, existingGroups: FinishedVideoGroup[], replaced: boolean) {
    const nextGroups = [nextGroup, ...existingGroups.filter((group) => group.id !== nextGroup.id)];
    await window.surgicol.store.set(FINISHED_VIDEOS_KEY, nextGroups);
    setUploadNotice(replaced ? `已替换“${nextGroup.draftName}”成片组，共 ${nextGroup.videos.length} 个视频。` : `已保存“${nextGroup.draftName}”成片组，共 ${nextGroup.videos.length} 个视频。`);
    props.onSavedToFinishedLibrary(nextGroup.videos.length);
  }

  async function saveGeneratedVideosToFinishedLibrary() {
    if (generatedVideos.length === 0) return;
    const videosToSave = generatedVideos.filter((video) => selectedGeneratedIds.length === 0 || isGeneratedVideoSelected(video));
    if (videosToSave.length === 0) return;
    const storedLibrary = await window.surgicol.store.get<FinishedVideoGroup[] | FinishedVideoItem[]>(FINISHED_VIDEOS_KEY).catch(() => []);
    const existingGroups = readFinishedVideoGroups(storedLibrary);
    const draftName = props.projectName.trim() || '未命名裂变工作';
    const existingGroup = existingGroups.find((group) => sameFinishedGroup(group, props.projectId, draftName));
    const nextVideos = videosToSave
      .map((video, index) => ({
        id: video.id,
        name: video.name,
        duration: video.duration || '云端合成',
        recommend: video.jobStatus === 'success' ? 'A' : '待评估',
        compliance: video.jobStatus === 'failed' ? '失败' : '待审',
        difference: `${Math.max(68, 92 - index * 3)}%`,
        path: video.path,
        localPath: video.localPath,
        jobId: video.jobId,
        savedAt: new Date().toISOString(),
        draftName,
        batchName: `${draftName} · 第 ${video.label} 条`,
        coverPath: video.coverPath || video.groupDetails?.find((detail) => detail.coverPath)?.coverPath,
        groupDetails: video.groupDetails
      }));
    const now = new Date().toISOString();
    const nextGroup: FinishedVideoGroup = {
      id: existingGroup?.id || props.projectId || crypto.randomUUID(),
      draftId: props.projectId || existingGroup?.draftId,
      draftName,
      savedAt: existingGroup?.savedAt || now,
      updatedAt: now,
      videoCount: nextVideos.length,
      videos: nextVideos
    };
    if (existingGroup) {
      setReplaceFinishedConfirm({
        draftName,
        nextVideos,
        nextGroup,
        existingGroups
      });
      return;
    }
    await persistFinishedVideoGroup(nextGroup, existingGroups, false);
  }

  function deleteSelectedGeneratedVideos() {
    if (selectedGeneratedIds.length === 0) return;
    setGeneratedVideos((videos) => videos.filter((video) => !isGeneratedVideoSelected(video)));
    setSelectedGeneratedIds([]);
  }

  function deleteAllGeneratedVideos() {
    setGeneratedVideos([]);
    setSegmentCandidateRestoreState(null);
    setFissionResultView('segments');
    setWaterfallDialogOpen(false);
    setSelectedGeneratedIds([]);
    setSelectedPreviewId('');
  }

  function returnToSegmentCandidates() {
    if (!segmentCandidateRestoreState?.videos.length) return;
    setGeneratedVideos((videos) => (
      replaceGeneratedResultBatch(
        replaceGeneratedResultBatch(videos, segmentCandidateRestoreState.segmentBatchKey, segmentCandidateRestoreState.videos),
        segmentCandidateRestoreState.waterfallBatchKey,
        []
      )
    ));
    setSegmentCandidateRestoreState(null);
    setFissionResultView('segments');
    setSelectedGeneratedIds([]);
    setSelectedPreviewId(segmentCandidateRestoreState.videos[0]?.id || '');
    setGenerationError('');
    setUploadNotice('已返回上一轮最终分镜混剪结果。');
  }

  function openWaterfallDialog() {
    if (selectedMixGroups.length === 0) {
      setGenerationError('请先为至少一个分镜选择可参与组合的视频素材，再执行瀑布流合成。');
      return;
    }
    setWaterfallCountDraft(DEFAULT_MIX_BATCH_COUNT);
    setWaterfallDialogOpen(true);
  }

  function composeWaterfallVideos() {
    if (selectedMixGroups.length === 0) {
      setGenerationError('请先为至少一个分镜选择可参与组合的视频素材，再执行瀑布流合成。');
      setWaterfallDialogOpen(false);
      return;
    }
    const composedCount = normalizeFissionBatchCount(waterfallCountDraft, DEFAULT_MIX_BATCH_COUNT);
    const segmentBatchKey = buildGeneratedResultBatchKey('segments', selectedMixGroups);
    const waterfallBatchKey = buildGeneratedResultBatchKey('waterfall', selectedMixGroups);
    const currentSegmentBatchVideos = generatedVideos.filter((video) => getGeneratedResultBatchKey(video) === segmentBatchKey);
    setSegmentCandidateRestoreState(currentSegmentBatchVideos.length > 0
      ? { segmentBatchKey, waterfallBatchKey, videos: currentSegmentBatchVideos }
      : null);
    setWaterfallDialogOpen(false);
    void runFissionMixGeneration(composedCount, 'waterfall');
  }

  async function runFissionMixGeneration(batchCount: number, view: 'segments' | 'waterfall', skipPreflightDialog = false) {
    if (isGenerating) return;
    if (comboMode !== 'smart') {
      setComboMode('smart');
    }

    const scopedGroups = filterFissionGroupsBySelectedClips(groups, selectedClipIdsByGroup);
    if (scopedGroups.length === 0) {
      setGenerationError('请先为至少一个分镜选择可参与组合的视频素材，再执行混剪生成。');
      setUploadNotice('');
      return;
    }
    const resultBatchKey = buildGeneratedResultBatchKey(view, scopedGroups);
    const resultBatchMeta = describeGeneratedResultBatch(view, scopedGroups, batchCount);

    const audioPreflight = buildFissionGenerateAudioPreflight(scopedGroups, audioItems);
    if (!skipPreflightDialog) {
      if (audioPreflight.blockingMessage) {
        setGenerationPreflightDialog({
          title: audioPreflight.blockingTitle || '生成前检查',
          message: audioPreflight.blockingMessage,
          batchCount,
          view,
          canContinue: false
        });
        setGenerationError('');
        setUploadNotice('');
        return;
      }
      if (audioPreflight.requiresConfirmation && audioPreflight.advisoryMessage) {
        setGenerationPreflightDialog({
          title: audioPreflight.advisoryTitle || '音频上传检查',
          message: `${audioPreflight.advisoryMessage} 是否继续生成？`,
          batchCount,
          view,
          canContinue: true,
          confirmLabel: '继续生成',
          cancelLabel: '稍后再试'
        });
        return;
      }
    }

    if (generationTimerRef.current) window.clearInterval(generationTimerRef.current);
    setIsGenerating(true);
    setGenerationProgress(0);
    setGenerationError('');
    setLastOutputMediaUrl('');
    setUploadNotice('');
    if (view === 'segments') {
      setSegmentCandidateRestoreState((current) => (current?.segmentBatchKey === resultBatchKey ? null : current));
    }
    setFissionResultView(view);
    setSelectedGeneratedIds([]);

    generationTimerRef.current = window.setInterval(() => {
      setGenerationProgress((progress) => Math.min(92, progress + 3 + Math.floor(Math.random() * 6)));
    }, 180);

    let mixGroupsSnapshot = groups;
    let mixAudioItemsSnapshot = audioItems;
    try {
      setUploadNotice(
        audioPreflight.advisoryMessage
          ? `${audioPreflight.advisoryMessage} 正在校准视频和音频的真实时长，并分析人物口播的有效说话区间...`
          : '正在校准视频和音频的真实时长，并分析人物口播的有效说话区间...'
      );
      const preparedMix = await prepareFissionMediaForMix(groups, audioItems);
      const mixGroups = preparedMix.groups;
      const mixAudioItems = preparedMix.audioItems;
      const scopedMixGroups = filterFissionGroupsBySelectedClips(mixGroups, selectedClipIdsByGroup);
      if (scopedMixGroups.length === 0) {
        throw new Error('当前选择的分镜素材为空，无法生成混剪结果。');
      }
      mixGroupsSnapshot = mixGroups;
      mixAudioItemsSnapshot = mixAudioItems;
      if (preparedMix.changed) {
        setGroups(mixGroups);
        setAudioItems(mixAudioItems);
        setUploadNotice(
          audioPreflight.advisoryMessage
            ? `${audioPreflight.advisoryMessage} 已校准 ${preparedMix.syncedCount} 个素材的真实时长和音频用途，正在提交混剪任务...`
            : `已校准 ${preparedMix.syncedCount} 个素材的真实时长和音频用途，正在提交混剪任务...`
        );
      }

      const humanVoiceMismatch = buildHumanVoiceMixBlocker(scopedMixGroups, mixAudioItems, view);
      if (humanVoiceMismatch) {
        throw new Error(humanVoiceMismatch);
      }
      const localRenderer = window.surgicol?.media?.renderFissionMix;
      if (typeof localRenderer !== 'function') {
        throw new Error('本地真实混剪能力未加载，请重启 Electron 后再试。');
      }

      let storageConfig: Awaited<ReturnType<typeof getAliyunStorageConfig>> | null = null;
      let cloudMediaUrls: string[] = [];
      let cloudReady = false;
      let cloudPreparationMessage = '';

      try {
        assertFissionCloudUploadReady(scopedMixGroups, mixAudioItems);
        assertEligibleMixGroupsReady(scopedMixGroups, mixAudioItems);
        storageConfig = await getAliyunStorageConfig();
        cloudMediaUrls = scopedMixGroups.flatMap((group) => [
          ...group.clips.filter(isUsableCloudMedia).map((clip) => clip.path || ''),
          ...(group.groupAudios || []).filter(isUsableCloudMedia).map((audio) => audio.path || '')
        ]).concat(mixAudioItems.filter(isUsableCloudMedia).map((audio) => audio.path || ''));
        cloudReady = true;
      } catch (cloudError) {
        const feedback = resolveFissionGenerateFeedback(cloudError);
        cloudPreparationMessage = feedback.detail ? `${feedback.summary}。${feedback.detail}` : feedback.summary;
      }

      const renderedVideos: GeneratedFissionVideo[] = [];
      const localFailedMessages: string[] = [];
      const cloudFailedMessages: string[] = [];
      let cloudSubmittedCount = 0;
      let firstOutputMediaUrl = '';

      for (let index = 0; index < batchCount; index += 1) {
        setUploadNotice(
          cloudReady
            ? `正在生成本地真实混剪 ${index + 1}/${batchCount}，并同步提交云端任务...`
            : `正在生成本地真实混剪 ${index + 1}/${batchCount}...`
        );

        try {
          const localPlan = await buildLocalFissionMixPlan({
            groups: scopedMixGroups,
            audioItems: mixAudioItems,
            settings: {
              ...soundSettings,
              compositionMode: view
            },
            variantIndex: index,
            resolveClipSource: resolveRenderableMixSource,
            resolveAudioSource: resolveRenderableMixSource
          });
          const localName = `${view === 'waterfall' ? '瀑布流混剪' : '分镜混剪'}_${String(index + 1).padStart(2, '0')}`;
          const localResult = await localRenderer({
            name: localName,
            scenes: localPlan.scenes,
            bgmTracks: localPlan.bgmTracks
          });
          const materialSummary = collectVariantMaterialSummary(scopedMixGroups, mixAudioItems, index, view);
          const nextVideo: GeneratedFissionVideo = {
            id: `local-fission-${Date.now()}-${index}`,
            groupId: view === 'waterfall' ? 'waterfall' : (scopedMixGroups[0]?.id || 'local-fission'),
            groupName: view === 'waterfall' ? '瀑布流合成' : '最终分镜混剪',
            label: index + 1,
            name: localName,
            coverTone: index % 2 === 0 ? 'warm' : 'cool',
            duration: formatFissionMediaDuration(localResult.duration || localPlan.durationSeconds, estimateMixDuration(scopedMixGroups)),
            path: localResult.localPath,
            localPath: localResult.localPath,
            coverPath: localPlan.coverPath || materialSummary.coverPath,
            audioName: localPlan.audioNames || materialSummary.audioNames,
            bgmName: localPlan.bgmName || materialSummary.bgmName,
            groupDetails: localPlan.details,
            jobStatus: 'success',
            jobStatusText: '本地混剪完成',
            jobMessage: `${materialSummary.text} · 本地真实混剪已完成，可直接预览最终声音效果。`,
            previewMode: 'mixed',
            resultBatchKey,
            resultBatchName: resultBatchMeta.name,
            resultBatchSummary: resultBatchMeta.summary,
            resultBatchSceneTitles: resultBatchMeta.sceneTitles,
            resultBatchView: view
          };

          if (cloudReady && storageConfig) {
            const outputMediaUrl = await createAliyunOutputMediaUrl(storageConfig, index, cloudMediaUrls);
            const mixRequest = buildAliyunMixRequest({
              groups: scopedMixGroups,
              audioItems: mixAudioItems,
              settings: {
                ...soundSettings,
                compositionMode: view
              },
              outputMediaUrl,
              variantIndex: index,
              compositionMode: view
            });
            if (!firstOutputMediaUrl) {
              firstOutputMediaUrl = outputMediaUrl;
            }
            try {
              const result = await submitAliyunMix(mixRequest);
              nextVideo.path = result.outputMediaUrl;
              nextVideo.jobId = result.jobId;
              nextVideo.jobStatus = result.jobId ? 'submitted' : 'running';
              nextVideo.jobStatusText = result.jobId
                ? (view === 'waterfall' ? '本地混剪完成 · 瀑布流云端已提交' : '本地混剪完成 · 云端已提交')
                : '本地混剪完成 · 云端处理中';
              nextVideo.jobMessage = result.jobId
                ? `${materialSummary.text} · 本地真实混剪已完成 · JobId: ${result.jobId}`
                : `${materialSummary.text} · 本地真实混剪已完成，云端正在处理中。`;
              cloudSubmittedCount += 1;
            } catch (cloudSubmitError) {
              const message = normalizeFissionGenerateError(cloudSubmitError);
              cloudFailedMessages.push(`第 ${index + 1} 条：${message}`);
              nextVideo.jobStatus = 'success';
              nextVideo.jobStatusText = '本地混剪完成 · 云端未提交';
              nextVideo.jobMessage = `${materialSummary.text} · 本地真实混剪已完成，云端提交失败：${message}`;
            }
          } else if (cloudPreparationMessage) {
            nextVideo.jobMessage = `${nextVideo.jobMessage} 云端未提交：${cloudPreparationMessage}`;
            nextVideo.jobStatusText = '本地混剪完成 · 云端未提交';
          }

          renderedVideos.push(nextVideo);
          setGeneratedVideos((videos) => replaceGeneratedResultBatch(videos, resultBatchKey, [...renderedVideos]));
          setSelectedPreviewId((id) => id || nextVideo.id);
          setGenerationProgress(Math.min(96, Math.round(((index + 1) / batchCount) * 96)));
        } catch (localRenderError) {
          const message = localRenderError instanceof Error ? localRenderError.message : '本地真实混剪失败';
          localFailedMessages.push(`第 ${index + 1} 条：${message}`);
        }
      }

      if (renderedVideos.length === 0) {
        throw new Error(localFailedMessages[0] || '本地真实混剪没有生成成功，右侧不会显示成片。');
      }

      setGenerationProgress(100);
      setGeneratedVideos((videos) => replaceGeneratedResultBatch(videos, resultBatchKey, renderedVideos));
      setFissionResultView(view);
      setSelectedGeneratedIds([]);
      setSelectedPreviewId(renderedVideos[0]?.id || '');
      setLastOutputMediaUrl(firstOutputMediaUrl);

      if (cloudReady) {
        setUploadNotice(
          view === 'waterfall'
            ? (
              cloudSubmittedCount > 0
                ? `已按当前全部分镜修改生成 ${renderedVideos.length} 个本地真实瀑布流混剪结果，并提交 ${cloudSubmittedCount} 个云端任务。`
                : `已按当前全部分镜修改生成 ${renderedVideos.length} 个本地真实瀑布流混剪结果，云端任务暂未提交。`
            )
            : (
              cloudSubmittedCount > 0
                ? `已生成 ${renderedVideos.length} 个本地真实分镜混剪结果，并提交 ${cloudSubmittedCount} 个云端任务。`
                : `已生成 ${renderedVideos.length} 个本地真实分镜混剪结果，云端任务暂未提交。`
            )
        );
      } else {
        setUploadNotice(
          view === 'waterfall'
            ? `已按当前全部分镜修改生成 ${renderedVideos.length} 个本地真实瀑布流混剪结果，云端未提交，本地成片可直接预览。`
            : `已生成 ${renderedVideos.length} 个本地真实分镜混剪结果，云端未提交，本地成片可直接预览。`
        );
      }

      const combinedErrors = [
        localFailedMessages.length > 0 ? `部分本地混剪失败：${localFailedMessages.slice(0, 3).join('；')}` : '',
        !cloudReady && cloudPreparationMessage ? `云端未提交：${cloudPreparationMessage}` : '',
        cloudFailedMessages.length > 0 ? `部分云端任务提交失败：${cloudFailedMessages.slice(0, 3).join('；')}` : ''
      ].filter(Boolean);
      setGenerationError(combinedErrors.join('；'));
    } catch (error) {
      const feedback = resolveFissionGenerateFeedback(error);
      void feedback.allowLocalFallback;
      setGenerationError(feedback.detail ? `${feedback.summary}。${feedback.detail}` : feedback.summary);
      setGeneratedVideos((videos) => replaceGeneratedResultBatch(videos, resultBatchKey, []));
      setSelectedGeneratedIds([]);
      setSelectedPreviewId('');
    } finally {
      if (generationTimerRef.current) window.clearInterval(generationTimerRef.current);
      generationTimerRef.current = undefined;
      window.setTimeout(() => setIsGenerating(false), 260);
    }
  }

  async function generateVideos() {
    await runFissionMixGeneration(plannedMixBatchCount, 'segments');
  }

  function applyScriptGroups(script: string) {
    const parsed = parseScriptGroups(script);
    if (parsed.length === 0) {
      setScriptImportNotice('没有识别到可用分镜，请检查文件内容是否包含“分镜 / 画面 / 口播”或表格列名。');
      return false;
    }
    resetGeneratedResultState();
    setGroups(parsed);
    setActiveGroupId(parsed[0].id);
    setExpandedIds([parsed[0].id]);
    setScriptDialogOpen(false);
    setScriptImportNotice(`已解析 ${parsed.length} 个镜头分组。`);
    return true;
  }

  function importScript() {
    applyScriptGroups(scriptDraft);
  }

  function addShotGroup() {
    resetGeneratedResultState();
    const nextIndex = groups.length + 1;
    const nextGroup: FissionShotGroup = {
      id: crypto.randomUUID(),
      sceneNo: nextIndex,
      title: `镜头分组 ${nextIndex}`,
      count: 0,
      duration: '3.00s-5.00s',
      script: '新增镜头分组，可在脚本导入后自动替换。',
      voiceover: '新增口播内容，可在脚本导入后自动替换。',
      clips: []
    };
    setGroups((items) => [...items, nextGroup]);
    setActiveGroupId(nextGroup.id);
    setExpandedIds((ids) => [...ids, nextGroup.id]);
  }

  function addClip(groupId: string) {
    setGroups((items) =>
      items.map((group) => {
        if (group.id !== groupId) return group;
        const nextCount = group.clips.length + 1;
        return {
          ...group,
          count: group.count + 1,
          clips: [
            ...group.clips,
            {
              id: crypto.randomUUID(),
              name: `${group.title}_${String(nextCount).padStart(3, '0')}`,
              duration: `${(3 + nextCount * 0.42).toFixed(2)}s`,
              coverTone: nextCount % 2 === 0 ? 'cool' : 'warm'
            }
          ]
        };
      })
    );
    setActiveGroupId(groupId);
    setExpandedIds((ids) => (ids.includes(groupId) ? ids : [...ids, groupId]));
  }

  async function importVideoClips(groupId: string) {
    const files = await window.surgicol.dialog.openFiles({
      filters: [
        { name: '视频文件', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm'] }
      ]
    });
    if (files.length === 0) return;
    resetGeneratedResultState();
    const importedClips = await Promise.all(files.map((filePath, index) => createImportedVideoClip(filePath, index)));
    setGroups((items) =>
      items.map((group) => {
        if (group.id !== groupId) return group;
        return {
          ...group,
          count: group.count + importedClips.length,
          clips: [...group.clips, ...importedClips]
        };
      })
    );
    setActiveGroupId(groupId);
    setExpandedIds((ids) => (ids.includes(groupId) ? ids : [...ids, groupId]));
    await Promise.all(importedClips.map((clip) => uploadClip(groupId, clip.id, clip.localPath)));
  }

  function duplicateClip(groupId: string, clipId: string) {
    resetGeneratedResultState();
    setGroups((items) =>
      items.map((group) => {
        if (group.id !== groupId) return group;
        const clip = group.clips.find((item) => item.id === clipId);
        if (!clip) return group;
        return {
          ...group,
          clips: [
            ...group.clips,
            {
              ...clip,
              id: crypto.randomUUID(),
              name: `${clip.name}_副本`
            }
          ]
        };
      })
    );
  }

  function removeClip(groupId: string, clipId: string) {
    resetGeneratedResultState();
    setGroups((items) =>
      items.map((group) =>
        group.id === groupId
          ? {
              ...group,
              count: Math.max(0, group.count - 1),
              clips: group.clips.filter((clip) => clip.id !== clipId)
            }
          : group
      )
    );
  }

  function duplicateGroup(groupId: string) {
    const group = groups.find((item) => item.id === groupId);
    if (!group) return;
    resetGeneratedResultState();
    const copyGroup = {
      ...group,
      id: crypto.randomUUID(),
      title: `${group.title} 副本`,
      displayTitle: undefined,
      clips: group.clips.map((clip) => ({ ...clip, id: crypto.randomUUID(), name: `${clip.name}_copy` }))
    };
    setGroups((items) => {
      const index = items.findIndex((item) => item.id === groupId);
      return [...items.slice(0, index + 1), copyGroup, ...items.slice(index + 1)];
    });
    setActiveGroupId(copyGroup.id);
    setExpandedIds((ids) => [...ids, copyGroup.id]);
  }

  function removeGroup(groupId: string) {
    resetGeneratedResultState();
    setGroups((items) => {
      const next = items.filter((group) => group.id !== groupId);
      if (activeGroupId === groupId && next[0]) setActiveGroupId(next[0].id);
      return next.length === 0 ? defaultFissionGroups.slice(0, 1) : next;
    });
    setExpandedIds((ids) => ids.filter((id) => id !== groupId));
  }

  function clearAllGroups() {
    resetGeneratedResultState();
    const emptyGroup: FissionShotGroup = {
      id: crypto.randomUUID(),
      sceneNo: 1,
      title: '未分组',
      count: 0,
      duration: '0.00s',
      script: '暂无脚本，请导入脚本或新建镜头分组。',
      voiceover: '暂无口播，请导入脚本或编辑口播。',
      clips: []
    };
    setGroups([emptyGroup]);
    setActiveGroupId(emptyGroup.id);
    setExpandedIds([emptyGroup.id]);
    setClearGroupsConfirmOpen(false);
  }

  async function uploadClip(groupId: string, clipId: string, localPath: string) {
    try {
      ensureOssUploaderReady();
      const uploaded = await window.surgicol.media.uploadToOss(localPath, { folder: 'fission/videos' });
      setGroups((items) =>
        items.map((group) =>
          group.id === groupId
            ? {
                ...group,
                clips: group.clips.map((clip) =>
                  clip.id === clipId
                    ? { ...clip, path: uploaded.mediaUrl, localPath: uploaded.localPath, uploadStatus: 'uploaded', uploadError: undefined }
                    : clip
                )
              }
            : group
        )
      );
      setUploadNotice(`已上传视频：${uploaded.name}`);
    } catch (error) {
      const message = normalizeFissionUploadError(error, '视频');
      setGroups((items) =>
        items.map((group) =>
          group.id === groupId
            ? {
                ...group,
                clips: group.clips.map((clip) =>
                  clip.id === clipId ? { ...clip, uploadStatus: 'local', uploadError: message } : clip
                )
              }
            : group
        )
      );
      setUploadNotice(message);
    }
  }

  async function uploadGlobalAudio(audioId: string, localPath: string) {
    try {
      ensureOssUploaderReady();
      const uploaded = await window.surgicol.media.uploadToOss(localPath, { folder: 'fission/bgms' });
      setAudioItems((items) =>
        items.map((audio) =>
          audio.id === audioId
            ? { ...audio, path: uploaded.mediaUrl, localPath: uploaded.localPath, uploadStatus: 'uploaded', uploadError: undefined }
            : audio
        )
      );
      setUploadNotice(`已上传全局BGM：${uploaded.name}`);
    } catch (error) {
      const message = normalizeFissionUploadError(error, '全局BGM');
      setAudioItems((items) => items.map((audio) => (audio.id === audioId ? { ...audio, uploadStatus: 'local', uploadError: message } : audio)));
      setUploadNotice(message);
    }
  }

  async function uploadGroupAudio(groupId: string, audioId: string, localPath: string) {
    try {
      ensureOssUploaderReady();
      const uploaded = await window.surgicol.media.uploadToOss(localPath, { folder: 'fission/group-audios' });
      setGroups((items) =>
        items.map((group) =>
          group.id === groupId
            ? {
                ...group,
                groupAudios: (group.groupAudios || []).map((audio) =>
                  audio.id === audioId
                    ? { ...audio, path: uploaded.mediaUrl, localPath: uploaded.localPath, uploadStatus: 'uploaded', uploadError: undefined }
                    : audio
                )
              }
            : group
        )
      );
      setUploadNotice(`已上传组内音频：${uploaded.name}`);
    } catch (error) {
      const message = normalizeFissionUploadError(error, '组内音频');
      setGroups((items) =>
        items.map((group) =>
          group.id === groupId
            ? {
                ...group,
                groupAudios: (group.groupAudios || []).map((audio) =>
                  audio.id === audioId ? { ...audio, uploadStatus: 'local', uploadError: message } : audio
                )
              }
            : group
        )
      );
      setUploadNotice(message);
    }
  }

  async function importAudio() {
    const files = await window.surgicol.dialog.openFiles({
      filters: [{ name: '音频文件', extensions: ['mp3', 'wav', 'aac', 'flac'] }]
    });
    if (files.length === 0) return;
    const nextItems = await Promise.all(files.map((filePath) => createImportedAudioItem(filePath, 100, 'global', groups)));
    resetGeneratedResultState();
    setAudioItems((items) => [...items, ...nextItems]);
    await Promise.all(nextItems.map((audio) => uploadGlobalAudio(audio.id, audio.localPath || '')));
  }

  async function importGroupAudio(groupId: string) {
    const files = await window.surgicol.dialog.openFiles({
      filters: [{ name: '音频文件', extensions: ['mp3', 'wav', 'aac', 'flac'] }]
    });
    if (files.length === 0) return;
    const nextItems = await Promise.all(files.map((filePath) => createImportedAudioItem(filePath, soundSettings.volume, 'group', groups)));
    resetGeneratedResultState();
    setGroups((items) =>
      items.map((group) =>
        group.id === groupId
          ? { ...group, groupAudios: [...(group.groupAudios || []), ...nextItems] }
          : group
      )
    );
    setActiveGroupId(groupId);
    await Promise.all(nextItems.map((audio) => uploadGroupAudio(groupId, audio.id, audio.localPath || '')));
  }

  function removeGroupAudio(groupId: string, audioId: string) {
    resetGeneratedResultState();
    setGroups((items) =>
      items.map((group) =>
        group.id === groupId
          ? { ...group, groupAudios: (group.groupAudios || []).filter((item) => item.id !== audioId) }
          : group
      )
    );
  }

  function removeAudio(audioId: string) {
    resetGeneratedResultState();
    setAudioItems((items) => items.filter((item) => item.id !== audioId));
  }

  function clearAllAudio() {
    resetGeneratedResultState();
    setAudioItems([]);
    setUploadNotice('已清空全局BGM。');
  }

  async function importScriptFile() {
    try {
      const files = await window.surgicol.dialog.openFiles({
        filters: [
          { name: '脚本文件', extensions: ['txt', 'md', 'csv', 'tsv', 'srt', 'json', 'docx', 'doc'] },
          { name: '所有文件', extensions: ['*'] }
        ]
      });
      if (files.length === 0) return;
      const texts = await Promise.all(files.map((filePath) => window.surgicol.file.readText(filePath)));
      const text = texts.map((item) => item.trim()).filter(Boolean).join('\n\n');
      setScriptDraft(text);
      setScriptDialogOpen(true);
      if (!text.trim()) {
        setScriptImportNotice('文件内容为空，未生成镜头分组。');
        return;
      }
      const parsed = parseScriptGroups(text);
      setScriptImportNotice(
        parsed.length > 0
          ? `已识别 ${parsed.length} 个镜头分组，可先检查下方预览，再生成分组。`
          : '已载入文件，但暂未识别到可用分镜，请检查是否包含“分镜 / 画面 / 口播”等结构。'
      );
    } catch (error) {
      setScriptDialogOpen(true);
      setScriptImportNotice(error instanceof Error ? `读取文件失败：${error.message}` : '读取文件失败，请检查文件格式。');
    }
  }

  return (
    <div className="fission-board">
      <section className="fission-column fission-left">
        <header className="fission-section-title">
          <strong>镜头分组</strong>
          <div className="fission-title-actions">
            <button type="button" onClick={addShotGroup}>新建镜头分组</button>
            <button
              type="button"
              onClick={() => {
                setScriptImportNotice('');
                setScriptDialogOpen(true);
              }}
            >
              脚本导入
            </button>
          </div>
        </header>
        <div className="fission-mode-row">
          <button className="active" type="button">智能时长</button>
          <button type="button">限制时长</button>
          <button className="danger-link" type="button" onClick={() => setClearGroupsConfirmOpen(true)}>
            <Trash2 size={13} />
            <span>整体删除</span>
          </button>
        </div>
        <div className="shot-group-list">
          {groups.map((group, index) => (
            <article className={activeGroupId === group.id ? 'active' : undefined} key={group.id}>
              {(() => {
                const rowTitle = group.displayTitle || group.title;
                const showDocumentMeta = group.sourceFormat === 'markdown' && Boolean(group.displayTitle) && Boolean(group.sourceDocumentTitle || group.sourceDocumentMeta);
                return (
                  <>
              <div className="shot-group-row-wrap">
                <button
                  className="shot-group-row"
                  type="button"
                  onClick={() => {
                    setActiveGroupId(group.id);
                    toggleExpanded(group.id);
                  }}
                >
                  {expandedIds.includes(group.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <FolderOpen size={15} />
                  <span>{rowTitle} ({group.clips.length || group.count})</span>
                </button>
                <small>{group.duration}</small>
                {activeGroupId === group.id ? (
                  <div className="shot-group-actions" aria-label={`${group.title} 管理`}>
                    <button type="button" title="分割镜头">
                      <Scissors size={13} />
                    </button>
                    <button type="button" title="添加视频" onClick={() => void importVideoClips(group.id)}>
                      <Plus size={13} />
                    </button>
                    <button type="button" title="复制分组" onClick={() => duplicateGroup(group.id)}>
                      <Copy size={13} />
                    </button>
                    <button type="button" title="编辑脚本">
                      <Edit3 size={13} />
                    </button>
                    <button type="button" title="删除分组" onClick={() => removeGroup(group.id)}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                ) : null}
              </div>
              {expandedIds.includes(group.id) ? (
                <div className="shot-clip-manager">
                  <div className="storyboard-script-card">
                    {showDocumentMeta ? (
                      <div className="storyboard-script-dochead">
                        {group.sourceDocumentTitle ? <strong>{group.sourceDocumentTitle}</strong> : null}
                        {group.sourceDocumentMeta ? <p>{group.sourceDocumentMeta}</p> : null}
                      </div>
                    ) : null}
                    <header>
                      <span>{group.sceneNo}</span>
                      <strong>分镜{group.sceneNo}：{group.title}</strong>
                    </header>
                    <dl>
                      <div>
                        <dt>画面</dt>
                        <dd>{group.script}</dd>
                      </div>
                      <div>
                        <dt>口播</dt>
                      <dd>{group.voiceover}</dd>
                      </div>
                    </dl>
                  </div>
                  <div className="shot-clip-grid">
                    {group.clips.map((clip, clipIndex) => (
                      <button className={`shot-clip-card tone-${clip.coverTone}`} type="button" key={clip.id} onClick={() => setPreviewMedia({ type: 'video', name: clip.name, path: previewPath(clip) })}>
                        <span>{clipIndex + 1}</span>
                        <div className="shot-clip-actions">
                          <span title="预览/编辑视频" onClick={(event) => {
                            event.stopPropagation();
                            setPreviewMedia({ type: 'video', name: clip.name, path: previewPath(clip) });
                          }}>
                            <Edit3 size={12} />
                          </span>
                          <span title="复制视频" onClick={(event) => {
                            event.stopPropagation();
                            duplicateClip(group.id, clip.id);
                          }}>
                            <Copy size={12} />
                          </span>
                          <span title="删除视频" onClick={(event) => {
                            event.stopPropagation();
                            removeClip(group.id, clip.id);
                          }}>
                            <Trash2 size={12} />
                          </span>
                        </div>
                        <div className="shot-clip-thumb">
                          {previewPath(clip) ? (
                            <video src={toMediaUrl(previewPath(clip))} muted playsInline preload="metadata" />
                          ) : null}
                        </div>
                        <strong>{clip.name}</strong>
                        <small>{clip.duration}{uploadStateText(clip.uploadStatus)}</small>
                      </button>
                    ))}
                    <button className="shot-clip-add" type="button" onClick={() => void importVideoClips(group.id)}>
                      <Film size={18} />
                      <span>导入视频</span>
                    </button>
                  </div>
                </div>
              ) : null}
                  </>
                );
              })()}
            </article>
          ))}
        </div>
      </section>

      <section className="fission-column fission-center">
        <div className="fission-setting-tabs">
          <button className={clsx(activeSettingsTab === 'group' && 'active')} type="button" onClick={() => setActiveSettingsTab('group')}>镜头分组设置</button>
          <button className={clsx(activeSettingsTab === 'sound' && 'active')} type="button" onClick={() => setActiveSettingsTab('sound')}>视频音效设置</button>
          <button className={clsx(activeSettingsTab === 'strategy' && 'active')} type="button" onClick={() => setActiveSettingsTab('strategy')}>脚本策略概览</button>
        </div>
        <div className="fission-settings-stack">
          {activeSettingsTab === 'group' ? (
            <>
          <section className="fission-setting-card">
            <header>镜头分组出现位置</header>
            <label>
              <input type="radio" defaultChecked />
              固定位置
            </label>
            <select value={Math.max(1, groups.findIndex((group) => group.id === activeGroup.id) + 1)} onChange={() => undefined}>
              {groups.map((group, index) => (
                <option value={index + 1} key={group.id}>第{index + 1}个 · {group.title}</option>
              ))}
            </select>
            <label>
              <input type="radio" />
              随机位置
            </label>
          </section>
          <section className="fission-setting-card">
            <header>镜头组合模式</header>
            <div className="combo-mode">
              <button className={clsx(comboMode === 'single' && 'active')} type="button" onClick={() => setComboMode('single')}>单镜头</button>
              <button className={clsx(comboMode === 'once' && 'active')} type="button" onClick={() => setComboMode('once')}>单次混剪</button>
              <button className={clsx(comboMode === 'smart' && 'active')} type="button" onClick={() => setComboMode('smart')}>智能混剪</button>
            </div>
          </section>
          <section className="fission-setting-card compact">
            <header>控制分组时长</header>
            <label className="switch-row">
              <span>开启</span>
              <input type="checkbox" />
            </label>
          </section>
          <section className="fission-setting-card">
            <div className="fission-card-header-row">
              <header>组内音频 ({activeGroup.groupAudios?.length || 0})</header>
              <button type="button" onClick={() => void importGroupAudio(activeGroup.id)}>添加音频</button>
            </div>
            {(activeGroup.groupAudios?.length || 0) > 0 ? (
              <div className="group-audio-list">
                {(activeGroup.groupAudios || []).map((audio) => (
                  <article key={audio.id}>
                    <Music size={14} />
                    <button type="button" onClick={() => setPreviewMedia({ type: 'audio', name: audio.name, path: previewPath(audio) })}>
                      <strong>{audio.name}</strong>
                      <span>{audio.duration} · {resolveFissionAudioUsageLabel(audio.usageType || resolveImportedFissionAudioUsage(audio, 'group', groups))} · 音量 {audio.volume}%{uploadStateText(audio.uploadStatus)}</span>
                    </button>
                    <select
                      className="fission-audio-usage-select"
                      value={audio.usageType || resolveImportedFissionAudioUsage(audio, 'group', groups)}
                      onChange={(event) => updateGroupAudioUsage(activeGroup.id, audio.id, event.target.value as FissionMixAudioUsageType)}
                      aria-label={`${audio.name} 音频用途`}
                    >
                      {FISSION_AUDIO_USAGE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <button type="button" title="删除组内音频" onClick={() => removeGroupAudio(activeGroup.id, audio.id)}>
                      <Trash2 size={13} />
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <p className="group-audio-empty">当前镜头分组还没有组内音频。</p>
            )}
          </section>
          <section className="fission-setting-card">
            <header>镜头分组变速</header>
            <label className="switch-row">
              <span>倍速</span>
              <input type="checkbox" defaultChecked />
            </label>
            <div className="range-row">
              <input type="range" defaultValue={18} />
              <input type="number" defaultValue={1} />
            </div>
          </section>
          <section className="fission-setting-card">
            <header>镜头分组音频</header>
            <div className="range-row">
              <Volume2 size={16} />
              <input type="range" defaultValue={100} />
              <span>100%</span>
            </div>
          </section>
          <section className="fission-setting-card global-bgm-setting-card">
            <div className="fission-card-header-row">
              <header>全局BGM ({audioItems.length})</header>
              <div className="audio-header-actions">
                <button type="button" title="导入BGM" onClick={() => void importAudio()}>
                  <Plus size={13} />
                </button>
                <button type="button" title="清空BGM" onClick={clearAllAudio} disabled={audioItems.length === 0}>
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
            <p className="global-bgm-helper">混剪完成后会统一铺在整条成片上，不参与分镜口播匹配。</p>
            {audioItems.length === 0 ? (
              <button className="global-bgm-empty-button" type="button" onClick={() => void importAudio()}>导入BGM</button>
            ) : (
              <div className="audio-item-list">
                {audioItems.map((item) => (
                  <article key={item.id}>
                    <Music size={15} />
                    <button type="button" onClick={() => setPreviewMedia({ type: 'audio', name: item.name, path: previewPath(item) })}>
                      <strong>{item.name}</strong>
                      <span>{item.duration} · 全局BGM · 音量 {item.volume}%{uploadStateText(item.uploadStatus)}</span>
                    </button>
                    <div className="audio-row-actions">
                      <button type="button" title="播放BGM" onClick={() => setPreviewMedia({ type: 'audio', name: item.name, path: previewPath(item) })}>
                        <Play size={13} />
                      </button>
                      <button type="button" title="删除BGM" onClick={() => removeAudio(item.id)}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
            </>
          ) : activeSettingsTab === 'sound' ? (
            <>
              <section className="fission-setting-card">
                <header>视频音效同步</header>
                <label className="switch-row">
                  <span>视频是否跟随音频变速</span>
                  <input
                    type="checkbox"
                    checked={soundSettings.followAudioSpeed}
                    onChange={(event) => setSoundSettings((settings) => ({ ...settings, followAudioSpeed: event.target.checked }))}
                  />
                </label>
                <label className="switch-row">
                  <span>保留视频原声</span>
                  <input
                    type="checkbox"
                    checked={soundSettings.retainOriginalAudio}
                    onChange={(event) => setSoundSettings((settings) => ({ ...settings, retainOriginalAudio: event.target.checked }))}
                  />
                </label>
                <label className="switch-row">
                  <span>组内音频自动压低原声</span>
                  <input
                    type="checkbox"
                    checked={soundSettings.ducking}
                    onChange={(event) => setSoundSettings((settings) => ({ ...settings, ducking: event.target.checked }))}
                  />
                </label>
              </section>
              <section className="fission-setting-card">
                <header>混音音量</header>
                <div className="range-row">
                  <Volume2 size={16} />
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={soundSettings.volume}
                    onChange={(event) => setSoundSettings((settings) => ({ ...settings, volume: Number(event.target.value) }))}
                  />
                  <span>{soundSettings.volume}%</span>
                </div>
                <label className="switch-row">
                  <span>音频淡入淡出</span>
                  <input
                    type="checkbox"
                    checked={soundSettings.fadeInOut}
                    onChange={(event) => setSoundSettings((settings) => ({ ...settings, fadeInOut: event.target.checked }))}
                  />
                </label>
              </section>
              <section className="fission-setting-card">
                <header>当前分组音频</header>
                <p className="group-audio-empty">
                  {activeGroup.title}：{activeGroup.groupAudios?.length || 0} 条组内音频。现在会优先按真实时长、口音标签和音频用途做匹配；若识别到人物出镜或数字人口播，会单独分析口播音频的有效说话区间，自动裁掉头尾静音，并在人物镜头明显长于口播时优先换更贴合的素材。
                </p>
              </section>
            </>
          ) : (
            <section className="fission-setting-card">
              <header>脚本策略概览</header>
              <p className="group-audio-empty">当前共 {groups.length} 个镜头分组，已选 {selectedSceneCount} 个分镜、{selectedClipCount} 个素材，预计可组合 {generatedVideoCount} 条，本次将生成 {plannedMixBatchCount} 条候选。</p>
            </section>
          )}
        </div>
        <div className="fission-generate-bar">
          <select defaultValue="all">
            <option value="all">全部分镜</option>
          </select>
          <select value={String(plannedMixBatchCount)} onChange={(event) => setMixBatchCount(normalizeFissionBatchCount(event.target.value))}>
            {FISSION_MIX_BATCH_OPTIONS.map((count) => (
              <option key={count} value={count}>生成 {count} 条</option>
            ))}
          </select>
          <button className="fission-generate-button" type="button" onClick={generateVideos} disabled={isGenerating || selectedSceneCount === 0}>
            {isGenerating ? '生成中...' : '生成视频'}
          </button>
        </div>
        {uploadNotice || lastOutputMediaUrl || generationError ? (
          <div className="fission-status-stack">
            {uploadNotice && uploadNoticeMeta ? (
              <section className={`fission-status-card ${uploadNoticeMeta.tone}`}>
                <header>
                  {uploadNoticeMeta.tone === 'success' ? <CheckCircle2 size={14} /> : <Sparkles size={14} />}
                  <strong>{uploadNoticeMeta.title}</strong>
                </header>
                <p>{uploadNotice}</p>
              </section>
            ) : null}
            {lastOutputMediaUrl ? (
              <section className="fission-status-card info">
                <header>
                  <Link size={14} />
                  <strong>输出地址</strong>
                </header>
                <p className="fission-status-url" title={lastOutputMediaUrl}>{lastOutputMediaUrl}</p>
              </section>
            ) : null}
            {generationError ? (
              <section className="fission-status-card error">
                <header>
                  <Shield size={14} />
                  <strong>{generationErrorTitle}</strong>
                </header>
                <p>{generationError}</p>
              </section>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="fission-column fission-right">
        <header className="fission-section-title">
          <strong>脚本策略概览</strong>
          <button type="button" onClick={() => void previewGeneratedVideoItem(selectedPreviewItem)} disabled={!selectedPreviewItem}>预览视频</button>
        </header>
        <div className="strategy-summary">
          <span>可生成脚本: 1</span>
          <span>已选分镜: {selectedSceneCount}/{groups.length}</span>
          <span>已选素材: {selectedClipCount}</span>
          <span>预计组合: {generatedVideoCount}</span>
          <span>本次生成: {plannedMixBatchCount}</span>
          <span>时长: 22.07s~32.84s</span>
        </div>
        <div className="strategy-selection-toolbar">
          <span>{selectedSceneCount > 0 ? `当前按已选分镜素材组合生成，未选中的分镜会跳过。` : '先在下方横向分镜卡里勾选要参与组合的视频素材。'}</span>
          <div>
            <button type="button" onClick={selectAllFissionClips} disabled={groups.length === 0}>全部选择</button>
            <button type="button" onClick={clearAllFissionClips} disabled={selectedClipCount === 0}>清空选择</button>
          </div>
        </div>
        <div className="strategy-card-shell">
          <button type="button" aria-label="向左滚动脚本策略" onClick={() => scrollStrategyCards('left')}>
            <ChevronLeft size={14} />
          </button>
          <div className="strategy-card-row" ref={strategyCardsRef}>
            {groups.map((group, index) => (
              (() => {
                const selectedIds = resolveSelectedClipIdsForGroup(group, selectedClipIdsByGroup);
                const selectedCount = selectedIds.length;
                const totalCount = group.clips.length || group.count;
                const selectionLabel = selectedCount === 0
                  ? '未参与组合'
                  : selectedCount === totalCount
                    ? '已全选'
                    : `部分选择 ${selectedCount}/${totalCount}`;
                return (
                  <article
                    className={clsx(group.id === activeGroupId && 'active', selectedCount === 0 && 'muted')}
                    data-group-id={group.id}
                    key={group.id}
                    onClick={() => {
                      setActiveGroupId(group.id);
                      if (!expandedIds.includes(group.id)) toggleExpanded(group.id);
                    }}
                  >
                    <div className="strategy-card-topbar">
                      <strong>{group.title} ({selectedCount}/{totalCount})</strong>
                      <div className="strategy-card-actions">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            selectAllFissionGroupClips(group.id);
                          }}
                          disabled={selectedCount === totalCount}
                        >
                          全选
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            clearFissionGroupClips(group.id);
                          }}
                          disabled={selectedCount === 0}
                        >
                          清空
                        </button>
                      </div>
                    </div>
                    <span>分组位置：固定 #{groups.findIndex((item) => item.id === group.id) + 1}</span>
                    <span>镜头模式：{selectedCount <= 1 ? '单镜头' : '智能混剪'} · {selectionLabel}</span>
                    <div className="strategy-card-clip-strip">
                      {group.clips.map((clip, clipIndex) => {
                        const clipSelected = selectedIds.includes(clip.id);
                        return (
                          <button
                            className={clsx(clipSelected && 'active')}
                            type="button"
                            key={clip.id}
                            title={`${clip.name} · ${clip.duration}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleFissionGroupClip(group.id, clip.id);
                            }}
                          >
                            <span>{clipIndex + 1}</span>
                            <em>{clip.duration}</em>
                          </button>
                        );
                      })}
                    </div>
                  </article>
                );
              })()
            ))}
          </div>
          <button type="button" aria-label="向右滚动脚本策略" onClick={() => scrollStrategyCards('right')}>
            <ChevronRight size={14} />
          </button>
        </div>
        <div className="fission-result-shell">
          <div className="material-filter-row">
            <div className="fission-filter-label">
              <span>结果筛选</span>
              <small>按脚本、音频和时长快速收拢当前生成结果</small>
            </div>
            <div className="fission-filter-fields">
              <select defaultValue="all">
                <option value="all">全部脚本</option>
              </select>
              <select defaultValue="all">
                <option value="all">全部音频</option>
              </select>
              <select defaultValue="all">
                <option value="all">全部时长</option>
              </select>
            </div>
            <button className="fission-filter-apply" type="button">应用筛选</button>
          </div>
          <div className="fission-preview-toolbar">
            <div className="fission-preview-heading">
              <span>视频合成</span>
              <strong>{generatedVideos.length > 0 ? `混剪结果（${generatedResultBatchGroups.length}组）` : '等待生成混剪结果'}</strong>
              <small>{generatedVideos.length > 0 ? '支持按组预览、批量筛选和直接入库。' : '点击“生成视频”后，这里会承接当前分镜生成出的完整混剪结果。'}</small>
            </div>
            {generatedVideos.length > 0 ? (
              <div className="fission-result-actions">
                {canReturnToSegmentCandidates ? <button type="button" onClick={returnToSegmentCandidates}>上一步</button> : null}
                <button type="button" onClick={selectAllGeneratedVideos} disabled={selectedGeneratedCount === selectableResultCount}>全选</button>
                <button type="button" onClick={() => void saveGeneratedVideosToFinishedLibrary()}>保存到成片库</button>
                <button type="button" onClick={deleteSelectedGeneratedVideos} disabled={selectedGeneratedCount === 0}>批量删除</button>
                <button className="danger-action" type="button" onClick={deleteAllGeneratedVideos}>全部删除</button>
                <small className="fission-result-count">{selectedGeneratedCount > 0 ? `已选 ${selectedGeneratedCount} / ${selectableResultCount}` : `${generatedVideos.length} 个视频`}</small>
              </div>
            ) : (
              <small className="fission-result-hint">点击“生成视频”后会按当前横向分镜组合生成结果组；不同分镜组合会分组保留，不互相覆盖。</small>
            )}
          </div>
          {resultStrategyTags.length > 0 ? (
            <div className="fission-result-strategy-bar">
              <span>当前策略</span>
              {resultStrategyTags.map((tag) => (
                <em key={tag}>{tag}</em>
              ))}
            </div>
          ) : null}
          <div
            className={clsx('fission-preview-grid', generatedVideos.length > 0 && 'generated')}
            key={generatedVideos[0]?.id || 'preview-default'}
            ref={previewGridRef}
          >
            {generatedVideos.length === 0 ? (
              <section className="fission-result-empty">
                <Film size={24} />
                <strong>还没有混剪结果</strong>
                <span>导入脚本只会生成左侧分镜；点击“生成视频”后，这里会直接显示最终分镜混剪结果。</span>
              </section>
            ) : (
              <section className="fission-waterfall-results">
                {generatedResultBatchGroups.map((batch) => (
                  <section className="fission-result-group" key={batch.key}>
                    <header className="fission-result-group-header">
                      <div className="fission-result-group-meta">
                        <strong>{batch.name}</strong>
                        {batch.sceneTitles.length > 0 ? (
                          <div className="fission-result-scene-titles">
                            {batch.sceneTitles.map((title) => (
                              <em className="fission-result-scene-chip" key={title}>{title}</em>
                            ))}
                          </div>
                        ) : null}
                        <span className="fission-result-group-count">{batch.summary}</span>
                      </div>
                      <div className="fission-result-group-actions">
                        <button type="button" onClick={() => selectGeneratedResultBatch(batch.key)}>全选本组</button>
                        <button type="button" onClick={() => clearGeneratedResultBatchSelection(batch.key)}>清空本组</button>
                      </div>
                    </header>
                    <div className="fission-result-group-grid">
                      {batch.videos.map((video) => {
                        const coverUrl = toMediaUrl(video.coverPath || previewPath(video));
                        const selected = isGeneratedVideoSelected(video);
                        const primaryDetail = video.groupDetails?.find((detail) => detail.audioName || detail.clipName || detail.coverPath);
                        const strategyText = buildGeneratedAudioStrategyText(primaryDetail, video, soundSettings.retainOriginalAudio);
                        return (
                          <article
                            className={clsx(selectedPreviewItem?.id === video.id && 'selected', selected && 'batch-selected')}
                            key={video.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              toggleGeneratedSelection(video.id);
                              setSelectedPreviewId(video.id);
                            }}
                            onDoubleClick={() => void previewGeneratedVideoItem(video)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') void previewGeneratedVideoItem(video);
                              if (event.key === ' ') {
                                event.preventDefault();
                                toggleGeneratedSelection(video.id);
                                setSelectedPreviewId(video.id);
                              }
                            }}
                          >
                            <span>{video.label}</span>
                            <button
                              className="preview-card-select"
                              type="button"
                              title={selected ? '取消选择' : '选择该结果'}
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleGeneratedSelection(video.id);
                                setSelectedPreviewId(video.id);
                              }}
                            >
                              {selected ? <CheckCircle2 size={13} /> : null}
                            </button>
                            <button
                              className="preview-card-play"
                              type="button"
                              title="预览视频"
                              onClick={(event) => {
                                event.stopPropagation();
                                void previewGeneratedVideoItem(video);
                              }}
                            >
                              <Play size={13} />
                            </button>
                            <div className="fission-card-cover">
                              {coverUrl ? <video src={coverUrl} muted preload="metadata" /> : null}
                            </div>
                            <strong>{video.name}</strong>
                            <small className="fission-preview-meta">
                              {buildGeneratedAudioMeta(primaryDetail, video)}
                              {video.jobStatusText ? ` · ${video.jobStatusText}` : ''}
                            </small>
                            {strategyText ? <em className="fission-result-strategy">{strategyText}</em> : null}
                            {video.jobMessage ? (
                              <em className="fission-result-message">{video.jobMessage}</em>
                            ) : null}
                          </article>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </section>
            )}
          </div>
          <footer className="fission-pagination">
            <div className="fission-pagination-meta">
              <span>共 {generatedVideos.length} 条 · {generatedResultBatchGroups.length} 组结果</span>
              <small>支持横向浏览每一组混剪结果，并在这里直接发起下一轮瀑布流合成。</small>
            </div>
            <div className="fission-pagination-pager">
              <button type="button">{'<'}</button>
              <button className="active" type="button">1</button>
              <button type="button">2</button>
              <button type="button">3</button>
              <button type="button">4</button>
              <button type="button">5</button>
            </div>
            <button className="waterfall-action" type="button" onClick={openWaterfallDialog} disabled={selectedSceneCount === 0}>瀑布流合成</button>
          </footer>
        </div>
      </section>
      {isGenerating ? (
        <div className="fission-generation-overlay" role="status" aria-live="polite">
          <section>
            <div className="generation-spinner">
              <Sparkles size={24} />
            </div>
            <strong>算法正在混合分析分镜、视频和音频...</strong>
            <div className="generation-progress">
              <span style={{ width: `${generationProgress}%` }} />
            </div>
            <small>{generationProgress}%</small>
          </section>
        </div>
      ) : null}
      {scriptDialogOpen ? (
        <div className="script-import-backdrop">
          <section className="script-import-dialog">
            <header>
              <div className="script-import-heading">
                <strong>脚本导入</strong>
                <span>支持 Markdown、txt、Word、csv、srt、json</span>
              </div>
              <div className="script-import-toolbar">
                <button className="script-import-tool-button" type="button" onClick={() => void importScriptFile()}>
                  <Upload size={14} />
                  <span>从文件导入</span>
                </button>
                <button className="script-import-tool-button" type="button" onClick={() => setScriptDialogOpen(false)}>
                  <X size={14} />
                  <span>关闭</span>
                </button>
              </div>
            </header>
            <p>每段会按顺序生成一个镜头分组。支持 txt、Word、csv、srt、json，也支持“分镜1 / 画面 / 口播”的结构。</p>
            {scriptImportNotice ? <div className={`script-import-notice ${scriptImportNoticeTone}`}>{scriptImportNotice}</div> : null}
            <div className="script-import-body">
              <section className="script-import-panel">
                <div className="script-import-panel-header">
                  <div>
                    <FileText size={14} />
                    <strong>原文内容</strong>
                  </div>
                  <small>{scriptDraft.trim() ? `${scriptDraft.trim().length} 字` : '等待粘贴'}</small>
                </div>
                <textarea
                  value={scriptDraft}
                  onChange={(event) => {
                    setScriptDraft(event.target.value);
                    if (scriptImportNotice) setScriptImportNotice('');
                  }}
                  placeholder="可直接粘贴 Markdown / TXT / CSV / JSON 脚本内容，预览区会实时识别分镜结构。"
                />
              </section>
              <section className="script-import-panel preview">
                <div className="script-import-panel-header">
                  <div>
                    <Sparkles size={14} />
                    <strong>解析预览</strong>
                  </div>
                  <small>{scriptPreviewCountLabel}</small>
                </div>
                <div className="script-import-preview">
                  {scriptPreviewGroups.length > 0 ? (
                    <>
                      {scriptPreviewDocument?.sourceDocumentTitle || scriptPreviewDocument?.sourceDocumentMeta ? (
                        <div className="script-import-preview-dochead">
                          {scriptPreviewDocument?.sourceDocumentTitle ? <strong>{scriptPreviewDocument.sourceDocumentTitle}</strong> : null}
                          {scriptPreviewDocument?.sourceDocumentMeta ? <p>{scriptPreviewDocument.sourceDocumentMeta}</p> : null}
                        </div>
                      ) : null}
                      <div className="script-import-preview-list">
                        {scriptPreviewGroups.map((group, index) => (
                          <article className="script-import-preview-item" key={`${group.sceneNo}-${group.title}-${index}`}>
                            <strong>分镜{group.sceneNo}：{group.title}</strong>
                            <p>
                              <span>画面</span>
                              <em>{group.script}</em>
                            </p>
                            <p>
                              <span>口播</span>
                              <em>{group.voiceover}</em>
                            </p>
                          </article>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="script-import-preview-empty">
                      <strong>还没有可预览的分镜</strong>
                      <span>粘贴脚本后，这里会按“分镜 / 画面 / 口播”结构自动排版显示。</span>
                    </div>
                  )}
                </div>
              </section>
            </div>
            <footer>
              <button
                className="script-import-tool-button"
                type="button"
                onClick={() => {
                  setScriptDraft('');
                  setScriptImportNotice('');
                }}
              >
                <Trash2 size={14} />
                <span>清空</span>
              </button>
              <button className="primary-action script-import-primary" type="button" onClick={importScript} disabled={!scriptDraft.trim() || scriptPreviewGroups.length === 0}>
                <Sparkles size={14} />
                <span>解析并生成分组</span>
              </button>
            </footer>
          </section>
        </div>
      ) : null}
      {clearGroupsConfirmOpen ? (
        <div className="script-import-backdrop">
          <section className="confirm-dialog">
            <header>
              <strong>整体删除镜头分组</strong>
              <button type="button" onClick={() => setClearGroupsConfirmOpen(false)}>关闭</button>
            </header>
            <p>将删除当前全部镜头分组、组内脚本和已添加的视频素材。全局BGM不会被删除。</p>
            <footer>
              <button type="button" onClick={() => setClearGroupsConfirmOpen(false)}>取消</button>
              <button className="danger-action" type="button" onClick={clearAllGroups}>确认删除</button>
            </footer>
          </section>
        </div>
      ) : null}
      {generationPreflightDialog ? (
        <div className="script-import-backdrop">
          <section className={clsx('confirm-dialog generation-preflight-dialog', generationPreflightDialog.canContinue ? 'is-advisory' : 'is-blocking')}>
            <header>
              <div className="generation-preflight-header-copy">
                <div className="generation-preflight-icon">
                  {generationPreflightDialog.canContinue ? <Music size={18} /> : <VolumeX size={18} />}
                </div>
                <div>
                  <strong>{generationPreflightDialog.title}</strong>
                  <span>{generationPreflightDialog.canContinue ? '检测到音频状态需要确认' : '当前缺少生成所需音频'}</span>
                </div>
              </div>
              <button type="button" onClick={() => setGenerationPreflightDialog(null)}>关闭</button>
            </header>
            <div className="generation-preflight-body">
              <div className="generation-preflight-message-card">
                <p>{generationPreflightDialog.message}</p>
              </div>
              <small className="generation-preflight-helper">
                {generationPreflightDialog.canContinue
                  ? '继续后会优先生成本地真实混剪结果，等音频上传完成后再补提云端任务。'
                  : '先补齐分镜视频，再重新点击“生成视频”即可。'}
              </small>
            </div>
            <footer>
              {generationPreflightDialog.canContinue ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setGenerationPreflightDialog(null);
                      setUploadNotice('已取消本次生成，可先补齐音频上传状态后再试。');
                    }}
                  >
                    {generationPreflightDialog.cancelLabel || '取消'}
                  </button>
                  <button
                    className="primary-action"
                    type="button"
                    onClick={() => {
                      const pending = generationPreflightDialog;
                      setGenerationPreflightDialog(null);
                      if (!pending) return;
                      void runFissionMixGeneration(pending.batchCount, pending.view, true);
                    }}
                  >
                    {generationPreflightDialog.confirmLabel || '继续'}
                  </button>
                </>
              ) : (
                <button className="primary-action" type="button" onClick={() => setGenerationPreflightDialog(null)}>我知道了</button>
              )}
            </footer>
          </section>
        </div>
      ) : null}
      {replaceFinishedConfirm ? (
        <div className="script-import-backdrop">
          <section className="confirm-dialog replace-finished-dialog">
            <header>
              <div>
                <strong>替换成片归档</strong>
                <span>当前裂变工作已存在一组成片结果</span>
              </div>
              <button type="button" onClick={() => setReplaceFinishedConfirm(null)}>关闭</button>
            </header>
            <p>
              <strong>{replaceFinishedConfirm.draftName}</strong>
              已经保存过 {replaceFinishedConfirm.nextVideos.length} 个混剪视频。确认后会用本次结果替换当前归档中的同名成片组。
            </p>
            <footer>
              <button type="button" onClick={() => {
                setReplaceFinishedConfirm(null);
                setUploadNotice(`已取消覆盖“${replaceFinishedConfirm.draftName}”原有成片组。`);
              }}>保留原归档</button>
              <button
                className="primary-action"
                type="button"
                onClick={() => {
                  const pending = replaceFinishedConfirm;
                  setReplaceFinishedConfirm(null);
                  if (!pending) return;
                  void persistFinishedVideoGroup(pending.nextGroup, pending.existingGroups, true);
                }}
              >
                替换为本次结果
              </button>
            </footer>
          </section>
        </div>
      ) : null}
      {waterfallDialogOpen ? (
        <div className="script-import-backdrop">
          <section className="confirm-dialog waterfall-count-dialog">
            <header>
              <strong>瀑布流合成</strong>
              <button type="button" onClick={() => setWaterfallDialogOpen(false)}>关闭</button>
            </header>
            <p>将按照当前已选 {selectedSceneCount} 个分镜、{selectedClipCount} 个素材和现有音频，重新批量生成完整混剪结果。</p>
            <label className="waterfall-count-row">
              <span>生成数量</span>
              <input
                type="number"
                min={1}
                max={100}
                value={waterfallCountDraft}
                onChange={(event) => setWaterfallCountDraft(Number(event.target.value))}
              />
            </label>
            <footer>
              <button type="button" onClick={() => setWaterfallDialogOpen(false)}>取消</button>
              <button className="primary-action" type="button" onClick={composeWaterfallVideos}>开始合成</button>
            </footer>
          </section>
        </div>
      ) : null}
      {previewMedia ? (
        <div className="script-import-backdrop">
          <section className="media-preview-dialog">
            <header>
              <div className="media-preview-heading-stack">
                <div className="media-preview-heading-main">
                  <strong>{previewMedia.name}</strong>
                  {previewMedia.badge ? <span className="media-preview-badge">{previewMedia.badge}</span> : null}
                </div>
                {previewMedia.note ? <small className="media-preview-note">{previewMedia.note}</small> : null}
              </div>
              <button type="button" onClick={() => setPreviewMedia(null)}>关闭</button>
            </header>
            <div className="media-preview-body">
              {previewMedia.loading && !previewMedia.path ? (
                <div className="media-preview-loading">
                  <div className="generation-spinner">
                    <Sparkles size={22} />
                  </div>
                  <strong>正在加载视频预览...</strong>
                  <span>{previewMedia.helperText || '正在准备可播放地址，请稍候。'}</span>
                </div>
              ) : previewMedia.path ? (
                previewMedia.type === 'video' ? (
                  previewMedia.muted ? (
                    <div className="media-preview-stage is-muted">
                      <video src={toMediaUrl(previewMedia.path)} autoPlay loop muted playsInline />
                      {previewMedia.note ? <div className="media-preview-stage-note">{previewMedia.note}</div> : null}
                    </div>
                  ) : (
                    <video src={toMediaUrl(previewMedia.path)} controls autoPlay />
                  )
                ) : (
                  <audio src={toMediaUrl(previewMedia.path)} controls autoPlay />
                )
              ) : (
                <div className="media-preview-empty">{previewMedia.error || '当前演示素材没有真实文件路径，请导入本地文件后预览。'}</div>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function isAliyunPermissionError(message: string) {
  return /(?:code\s*=\s*)?403|forbidden|not authorized|未授权|无权限|没有权限/i.test(message);
}

function parseScriptGroups(script: string): FissionShotGroup[] {
  const normalizedScript = normalizeScriptText(script);
  if (!normalizedScript) return [];
  const csvGroups = parseCsvScriptGroups(normalizedScript);
  if (csvGroups.length > 0) return csvGroups;
  const jsonGroups = parseJsonScriptGroups(normalizedScript);
  if (jsonGroups.length > 0) return jsonGroups;
  const markdownGroups = parseMarkdownScriptGroups(normalizedScript);
  if (markdownGroups.length > 0) return markdownGroups;
  const explicitBlocks = normalizedScript
    .split(/\n(?=(?:第\s*)?\d+\s*[\.、)]?\s*分镜|分镜\s*\d*|镜头\s*\d+|scene\s*\d+)|\n{2,}/i)
    .map((block) => block.trim())
    .filter(Boolean);
  const blocks = explicitBlocks.length === 1 && shouldSplitPlainScriptLines(explicitBlocks[0])
    ? explicitBlocks[0].split('\n').map((line) => line.trim()).filter(Boolean)
    : explicitBlocks;
  return blocks
    .map((block, index) => {
      const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const firstLine = lines[0] || block;
      const sceneMatch = firstLine.match(/^(?:(?:第\s*)?(\d+)\s*[\.、)]?\s*)?(?:分镜|镜头|scene)\s*(\d+)?\s*[：:\-—、]?\s*(.*)$/i);
      const sceneNo = Number(sceneMatch?.[1] || sceneMatch?.[2] || index + 1) || index + 1;
      const titleFromScene = sceneMatch?.[3]?.trim();
      const title = (titleFromScene || firstLine.replace(/^(?:标题|主题|分组|名称)\s*[：:]\s*/i, '').split(/[:：]/)[0] || `镜头分组 ${index + 1}`).trim();
      const pictureLine = lines.find((line) => /^(?:画面|视频|视觉|镜头画面|画面描述|场景)\s*[：:\-—]/.test(line));
      const voiceLine = lines.find((line) => /^(?:口播|旁白|台词|文案|解说|音频)\s*[：:\-—]/.test(line));
      const fallbackContent = lines.slice(sceneMatch ? 1 : 0).join(' ');
      const picture = stripScriptField(pictureLine) || fallbackContent || title;
      const voiceover = stripScriptField(voiceLine) || picture;
      return makeFissionGroup(sceneNo, title, picture, voiceover, index, { sourceFormat: 'plain' });
    });
}

function stripScriptField(line?: string) {
  return line?.replace(/^[^：:\-—]+[：:\-—]\s*/, '').trim() || '';
}

function parseMarkdownScriptGroups(script: string): FissionShotGroup[] {
  if (!hasMarkdownScriptSignals(script)) return [];
  const lines = script.split('\n');
  const sourceDocumentTitle = findMarkdownDocumentTitle(lines);
  const introLines: string[] = [];
  const groups: Array<{ heading: string; bodyLines: string[] }> = [];
  let currentGroup: { heading: string; bodyLines: string[] } | null = null;
  let sawScene = false;

  lines.forEach((rawLine) => {
    const heading = parseMarkdownSceneHeading(rawLine);
    if (heading) {
      sawScene = true;
      if (currentGroup) groups.push(currentGroup);
      currentGroup = { heading: rawLine, bodyLines: [] };
      return;
    }
    if (!sawScene) {
      if (!isMarkdownTitleLine(rawLine)) introLines.push(rawLine);
      return;
    }
    currentGroup?.bodyLines.push(rawLine);
  });

  if (currentGroup) groups.push(currentGroup);
  if (groups.length === 0) return [];

  const sourceDocumentMeta = buildMarkdownDocumentMeta(introLines);
  return groups
    .map((group, index) => {
      const heading = parseMarkdownSceneHeading(group.heading);
      if (!heading) return null;
      const content = parseMarkdownSceneContent(group.bodyLines);
      const sceneNo = heading.sceneNo || index + 1;
      const title = heading.title || content.picture || content.voiceover || `分镜 ${sceneNo}`;
      return makeFissionGroup(sceneNo, title, content.picture || title, content.voiceover || content.picture || title, index, {
        displayTitle: index === 0 && sourceDocumentTitle ? sourceDocumentTitle : undefined,
        sourceFormat: 'markdown',
        sourceDocumentTitle,
        sourceDocumentMeta
      });
    })
    .filter((group): group is FissionShotGroup => Boolean(group));
}

function hasMarkdownScriptSignals(script: string) {
  return /(^|\n)\s{0,3}#{1,6}\s*\S/m.test(script)
    || /\*\*\s*(?:画面|视频|视觉|镜头画面|画面描述|场景|口播|旁白|台词|文案|解说|音频)\s*[：:]/.test(script);
}

function isMarkdownTitleLine(line: string) {
  return /^\s{0,3}#{1,2}\s+\S/.test(line);
}

function findMarkdownDocumentTitle(lines: string[]) {
  const titleLine = lines.find((line) => isMarkdownTitleLine(line));
  return titleLine ? cleanMarkdownText(titleLine) : '';
}

function parseMarkdownSceneHeading(line: string) {
  const normalized = cleanMarkdownText(line);
  const match = normalized.match(/^(?:第\s*(\d+)\s*分镜|分镜\s*(\d+)|镜头\s*(\d+)|scene\s*(\d+))\s*[：:\-—、.]?\s*(.*)$/i);
  if (!match) return null;
  return {
    sceneNo: Number(match[1] || match[2] || match[3] || match[4] || 0),
    title: (match[5] || '').trim()
  };
}

function parseMarkdownSceneContent(lines: string[]) {
  const sceneFields: Record<'picture' | 'voiceover', string[]> = {
    picture: [],
    voiceover: []
  };
  let activeField: 'picture' | 'voiceover' | null = null;

  lines.forEach((line) => {
    const field = parseMarkdownFieldLine(line);
    if (field) {
      activeField = field.type;
      if (field.value) sceneFields[activeField].push(field.value);
      return;
    }
    const normalized = cleanMarkdownText(line);
    if (!normalized || isIgnorableMarkdownNote(normalized)) return;
    if (activeField) sceneFields[activeField].push(normalized);
  });

  return {
    picture: sceneFields.picture.join(' ').trim(),
    voiceover: sceneFields.voiceover.join(' ').trim()
  };
}

function parseMarkdownFieldLine(line: string) {
  const normalized = cleanMarkdownText(line, { keepBulletPrefix: false, keepHeadingPrefix: false });
  const match = normalized.match(/^(画面|视频|视觉|镜头画面|画面描述|场景|口播|旁白|台词|文案|解说|音频)\s*[：:\-—]\s*(.*)$/);
  if (!match) return null;
  return {
    type: /^(画面|视频|视觉|镜头画面|画面描述|场景)$/.test(match[1]) ? 'picture' as const : 'voiceover' as const,
    value: match[2].trim()
  };
}

function buildMarkdownDocumentMeta(lines: string[]) {
  const values = lines
    .map((line) => cleanMarkdownText(line))
    .filter((line) => Boolean(line) && !isIgnorableMarkdownNote(line));
  return values.join(' | ').trim();
}

function isIgnorableMarkdownNote(line: string) {
  return /(?:^|[（(])\s*注\s*[：:]|AI\s*生成/i.test(line);
}

function cleanMarkdownText(line: string, options?: { keepBulletPrefix?: boolean; keepHeadingPrefix?: boolean }) {
  const keepBulletPrefix = options?.keepBulletPrefix ?? true;
  const keepHeadingPrefix = options?.keepHeadingPrefix ?? true;
  let normalized = line.replace(/^\uFEFF/, '').trim();
  if (!keepHeadingPrefix) normalized = normalized.replace(/^\s{0,3}#{1,6}\s*/, '');
  if (!keepBulletPrefix) normalized = normalized.replace(/^[-*+]\s+/, '');
  normalized = normalized
    .replace(/^\*\*\s*([^*]+?)\s*\*\*/, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  if (keepHeadingPrefix) normalized = normalized.replace(/^\s{0,3}#{1,6}\s*/, '');
  if (keepBulletPrefix) normalized = normalized.replace(/^[-*+]\s+/, '');
  return normalized.trim();
}

function normalizeGeneratedGroupName(value?: string) {
  return (value || '').replace(/\s+/g, '').trim().toLowerCase();
}

function findGeneratedDetailForGroup(video: GeneratedFissionVideo | undefined, group: Pick<FissionShotGroup, 'id' | 'title' | 'sceneNo'>) {
  if (!video?.groupDetails?.length) return undefined;
  const detailById = video.groupDetails.find((detail) => detail.groupId === group.id);
  if (detailById) return detailById;

  const normalizedTitle = normalizeGeneratedGroupName(group.title);
  if (normalizedTitle) {
    const detailByName = video.groupDetails.find((detail) => normalizeGeneratedGroupName(detail.groupName) === normalizedTitle);
    if (detailByName) return detailByName;
  }

  const detailByScene = video.groupDetails.find((detail) => detail.groupName?.includes(`分镜${group.sceneNo}`));
  if (detailByScene) return detailByScene;

  return undefined;
}

function previewPath(media?: { path?: string; localPath?: string }) {
  return media?.localPath || (isCloudMediaUrl(media?.path) ? undefined : media?.path);
}

function playableGeneratedPath(video?: GeneratedFissionVideo) {
  if (!video) return undefined;
  if (video.localPath) return video.localPath;
  if (/^https?:\/\//i.test(video.path || '')) return video.path;
  return previewPath(video) || video.coverPath;
}

function isProxyGeneratedVideo(video?: GeneratedFissionVideo) {
  if (!video) return false;
  if (video.previewMode) return video.previewMode === 'proxy';
  return /本地混剪预览|瀑布流本地预览/i.test(video.jobStatusText || '') || /云端未提交|本地组合方案|本地混剪预览/i.test(video.jobMessage || '');
}

function buildGeneratedPreviewNote(video: GeneratedFissionVideo | undefined, retainOriginalAudio: boolean) {
  if (!video) return undefined;
  if (isProxyGeneratedVideo(video)) {
    return /瀑布流/i.test(video.jobStatusText || '')
      ? '当前仅预览瀑布流组合画面，不代表最终成片音频；提交云端后才可试听真实混剪声音。'
      : '当前仅预览本地混剪画面，不播放原素材声音；提交云端后才可试听真实混剪音频。';
  }
  if (video.localPath && video.jobId && video.jobStatus !== 'success') {
    return '当前优先播放本地真实混剪结果；云端成片仍会继续处理，完成后可直接保存云端版本。';
  }
  if (!retainOriginalAudio) {
    return '当前已关闭视频原声，云端成片会优先保留混剪后的匹配音频。';
  }
  return undefined;
}

function buildGeneratedAudioMeta(detail?: GeneratedFissionGroupDetail, video?: GeneratedFissionVideo) {
  if (!detail?.audioName) {
    if (video?.bgmName) return `BGM：${video.bgmName}`;
    return video?.duration || '云端合成';
  }
  const labels: string[] = [];
  if (detail.audioSource === 'ai') labels.push('AI口播优先');
  else if (detail.audioSource === 'group') labels.push('组内优先');
  return `音频：${detail.audioName}${labels.length > 0 ? `（${labels.join(' / ')}）` : ''}${video?.bgmName ? ` · BGM：${video.bgmName}` : ''}`;
}

function buildGeneratedAudioStrategyTags(detail: GeneratedFissionGroupDetail | undefined, video: GeneratedFissionVideo | undefined, retainOriginalAudio: boolean) {
  const tags: string[] = [];
  if (detail?.contentProfile === 'digital_human') tags.push('数字人口播优先匹配');
  else if (detail?.contentProfile === 'human_presenter') tags.push('人物出镜优先口播音频');
  if (detail?.audioSource === 'ai') tags.push('优先 AI / 口播音频');
  else if (detail?.audioSource === 'group') tags.push('优先本分镜音频');
  if (video?.bgmName) tags.push('已叠加全局BGM');
  if (!retainOriginalAudio) tags.push('已关闭原声');
  if (isProxyGeneratedVideo(video)) tags.push('本地混剪静音预览');
  return Array.from(new Set(tags));
}

function buildGeneratedAudioStrategyText(detail: GeneratedFissionGroupDetail | undefined, video: GeneratedFissionVideo | undefined, retainOriginalAudio: boolean) {
  const tags = buildGeneratedAudioStrategyTags(detail, video, retainOriginalAudio);
  return tags.length > 0 ? `策略：${tags.join(' · ')}` : undefined;
}

function buildFissionResultStrategyTags(videos: GeneratedFissionVideo[], retainOriginalAudio: boolean) {
  if (videos.length === 0) return [];
  const tags = ['组内音频优先'];
  if (videos.some((video) => video.groupDetails?.some((detail) => detail.contentProfile === 'digital_human'))) {
    tags.push('数字人口播优先 AI / 口播');
  }
  if (videos.some((video) => video.groupDetails?.some((detail) => detail.contentProfile === 'human_presenter'))) {
    tags.push('人物出镜优先匹配口播');
  }
  if (videos.some((video) => video.bgmName)) {
    tags.push('已叠加全局BGM');
  }
  if (!retainOriginalAudio) tags.push('已关闭视频原声');
  if (videos.some((video) => isProxyGeneratedVideo(video))) tags.push('本地混剪仅静音预览');
  return Array.from(new Set(tags));
}

function shouldRequestProtectedPreview(path?: string) {
  return Boolean(path && (/^oss:\/\//i.test(path) || /aliyuncs\.com/i.test(path)));
}

function isCloudMediaUrl(path?: string) {
  return Boolean(path && /^(https?:\/\/|oss:\/\/)/i.test(path));
}

function fissionResultSelectionKey(groupId: string, videoId: string) {
  return `${groupId}:${videoId}`;
}

function isUsableCloudMedia(media?: { path?: string; uploadStatus?: string }) {
  if (!isCloudMediaUrl(media?.path)) return false;
  return media?.uploadStatus !== 'uploading' && media?.uploadStatus !== 'failed' && media?.uploadStatus !== 'local';
}

function normalizeFissionAudioItemsForDraft(items: FissionAudioItem[]) {
  return items.map((audio) => normalizeFissionAudioItemForDraft(audio));
}

function normalizeFissionAudioItemForDraft(audio: FissionAudioItem): FissionAudioItem {
  if ((audio.uploadStatus === 'failed' || audio.uploadStatus === 'local') && audio.localPath) {
    return {
      ...audio,
      path: undefined,
      uploadStatus: 'local',
      uploadError: audio.uploadError || '云端上传未完成，已保留本地素材可预览。'
    };
  }
  return audio;
}

function normalizeFissionGroupsForDraft(groups: FissionShotGroup[]) {
  return groups.map((group) => ({
    ...group,
    clips: group.clips.map((clip) =>
      (clip.uploadStatus === 'failed' || clip.uploadStatus === 'local') && clip.localPath
        ? {
            ...clip,
            path: undefined,
            uploadStatus: 'local' as FissionUploadStatus,
            uploadError: clip.uploadError || '云端上传未完成，已保留本地素材可预览。'
          }
        : clip
    ),
    groupAudios: group.groupAudios ? normalizeFissionAudioItemsForDraft(group.groupAudios) : group.groupAudios
  }));
}

function uploadStateText(status?: FissionUploadStatus) {
  if (status === 'uploading') return ' · 上传中';
  if (status === 'uploaded') return ' · 已上传';
  if (status === 'local') return ' · 本地可预览';
  if (status === 'failed') return ' · 上传失败';
  return '';
}

function normalizeFissionUploadError(error: unknown, mediaLabel: string) {
  const rawMessage = error instanceof Error ? error.message : String(error || '');
  const isNetworkError = /fetch failed|Failed to fetch|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|network|timeout/i.test(rawMessage);
  const isOssConfigError = /OSS.*(未启用|配置不完整|未配置|endpoint|AccessKey|访问密钥)|upload-ticket/i.test(rawMessage);
  if (isNetworkError || isOssConfigError) {
    return `${mediaLabel}云端上传未完成，已保留本地素材可预览。请确认后端服务和 OSS 配置可用后再生成云端混剪。`;
  }
  return `${mediaLabel}云端上传未完成，已保留本地素材可预览。${rawMessage || '请检查网络或 OSS 配置。'}`;
}

function resolveFissionGenerateFeedback(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : String(error || '');
  const prefixedMatch = rawMessage.match(/^(第\s*\d+\s*条：)\s*(.+)$/);
  const prefix = prefixedMatch?.[1] ?? '';
  const message = (prefixedMatch?.[2] ?? rawMessage).trim();

  if (/画面人物不说话|人物口播音频|音频继续播放|非人物镜头后再生成/i.test(message)) {
    return {
      summary: prefix ? `${prefix}${message}` : message || '人物口播镜头与音频时长不匹配',
      detail: '请先调整人物镜头时长或拆分口播音频，再重新提交云端混剪。',
      allowLocalFallback: false
    };
  }

  if (/Request failed with status code 5\d\d/i.test(message) || /后端提交阿里云混剪失败|阿里云混剪提交失败/i.test(message)) {
    return {
      summary: `${prefix}阿里云混剪提交失败`,
      detail: '请检查后端服务日志、阿里云 ICE 配置和 OSS 输出地址后再重试。',
      fallback: '已保留本地真实混剪结果，可先直接查看最终成片，再决定是否执行瀑布流合成。',
      allowLocalFallback: true
    };
  }

  if (/Request failed with status code 4\d\d/i.test(message) || /请求参数未通过后端校验|素材校验未通过/i.test(message)) {
    return {
      summary: `${prefix}阿里云混剪素材校验未通过`,
      detail: '请确认视频和音频都已成功上传到 OSS 后再重新生成。',
      fallback: '已保留本地真实混剪结果，请补齐云端素材后再重试。',
      allowLocalFallback: true
    };
  }

  return {
    summary: prefix ? `${prefix}${message || '提交阿里云混剪任务失败'}` : message || '提交阿里云混剪任务失败',
    fallback: '已保留本地真实混剪结果，可先查看最终成片，再决定是否执行瀑布流合成。',
    allowLocalFallback: true
  };
}

function normalizeFissionGenerateError(error: unknown) {
  return resolveFissionGenerateFeedback(error).summary;
}

function describeFissionStatusNotice(message: string) {
  if (/检测到.*音频|已检测到.*音频|音频已导入但尚未上传|本次会先生成本地真实混剪/i.test(message)) {
    return { tone: 'info' as const, title: '生成前检查' };
  }
  if (/已生成\s*\d+\s*条本地混剪预览|本地混剪预览已生成/i.test(message)) {
    return { tone: 'info' as const, title: '本地混剪预览已生成' };
  }
  if (/本地真实混剪|本地混剪完成|云端未提交，本地真实混剪可直接预览/i.test(message)) {
    return { tone: 'success' as const, title: '本地真实混剪' };
  }
  if (/本地混剪预览|补齐云端素材|云端回退|未提交/i.test(message)) {
    return { tone: 'info' as const, title: '本地预览' };
  }
  if (/正在提交|上传中|处理中/i.test(message)) {
    return { tone: 'info' as const, title: '进行中' };
  }
  if (/已提交|已保存|已替换|已上传|已返回|已根据|已解析/i.test(message)) {
    return { tone: 'success' as const, title: '当前状态' };
  }
  return { tone: 'info' as const, title: '当前提示' };
}

function ensureOssUploaderReady() {
  const uploader = (window.surgicol as typeof window.surgicol & { media?: { uploadToOss?: unknown } }).media?.uploadToOss;
  if (typeof uploader === 'function') return;
  throw new Error('OSS 直传能力未加载，请重启 Electron 应用后重新导入素材。');
}

function formatShortTime(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function formatDraftTimestamp(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function aliyunJobStatusText(status: string | undefined, finished: boolean, successful: boolean) {
  if (successful) return '合成成功';
  if (finished) return '合成失败';
  const normalized = (status || '').toLowerCase();
  if (normalized.includes('process') || normalized.includes('running')) return '合成中';
  if (normalized.includes('init') || normalized.includes('submitted')) return '排队中';
  return status ? `状态：${status}` : '状态查询中';
}

function estimateMixDuration(groups: FissionShotGroup[]) {
  const seconds = groups.reduce((total, group) => total + firstDurationSeconds(group.duration), 0);
  return seconds > 0 ? `${Math.round(seconds)}s` : '云端合成中';
}

function firstDurationSeconds(duration?: string) {
  if (!duration) return 0;
  const firstPart = duration.split(/[-~]/)[0]?.trim() || '';
  const clockParts = firstPart.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (clockParts) {
    const hours = clockParts[3] ? Number(clockParts[1]) : 0;
    const minutes = clockParts[3] ? Number(clockParts[2]) : Number(clockParts[1]);
    const seconds = Number(clockParts[3] || clockParts[2]);
    return hours * 3600 + minutes * 60 + seconds;
  }
  return Number(firstPart.replace(/[^\d.]/g, '')) || 0;
}

function collectMixAudioNames(groups: FissionShotGroup[], audioItems: FissionAudioItem[]) {
  const names = groups
    .flatMap((group) => group.groupAudios || [])
    .concat(audioItems)
    .map((audio) => audio.name)
    .filter(Boolean);
  return Array.from(new Set(names)).slice(0, 3).join(' / ');
}

function buildFissionGenerateAudioPreflight(groups: FissionShotGroup[], audioItems: FissionAudioItem[]) {
  const allAudios = dedupeAudioItems([
    ...audioItems,
    ...groups.flatMap((group) => group.groupAudios || [])
  ]);
  const availableAudios = allAudios.filter((audio) => Boolean(previewPath(audio) || audio.path));
  const uploadedAudios = availableAudios.filter(isUsableCloudMedia);
  const uploadingAudios = allAudios.filter((audio) => audio.uploadStatus === 'uploading');
  const localOnlyAudios = availableAudios.filter((audio) => !isUsableCloudMedia(audio));
  const eligibleLocalGroups = collectLocalEligibleMixGroups(groups, audioItems);

  if (eligibleLocalGroups.length === 0) {
    return {
      blockingTitle: '缺少可用视频',
      blockingMessage: '当前还没有可参与混剪的视频素材，请先给分镜补充视频后再生成。'
    };
  }

  const advisoryMessages: string[] = [];
  let advisoryTitle = '';
  if (uploadingAudios.length > 0) {
    advisoryTitle = '音频仍在上传';
    advisoryMessages.push(`检测到 ${uploadingAudios.length} 条音频仍在上传，本次会先生成本地真实混剪，云端任务暂不提交。`);
  } else if (localOnlyAudios.length > 0 && uploadedAudios.length === 0) {
    advisoryTitle = '音频尚未上传';
    advisoryMessages.push('检测到音频已导入但尚未上传到云端，本次会先生成本地真实混剪，等上传完成后再提交云端。');
  } else if (localOnlyAudios.length > 0) {
    advisoryTitle = '部分音频未上传';
    advisoryMessages.push(`检测到 ${localOnlyAudios.length} 条音频尚未上传到云端，这些音频本次会优先参与本地真实混剪。`);
  }

  return {
    blockingMessage: '',
    blockingTitle: '',
    advisoryTitle,
    advisoryMessage: advisoryMessages.join(' '),
    requiresConfirmation: advisoryMessages.length > 0
  };
}

function assertFissionCloudUploadReady(groups: FissionShotGroup[], audioItems: FissionAudioItem[]) {
  const cloudVideoCount = groups.reduce((total, group) => total + group.clips.filter(isUsableCloudMedia).length, 0);
  const cloudAudioCount = collectAllUploadedMixAudios(groups, audioItems).length;
  const hasAnyAudioMaterial = dedupeAudioItems([
    ...audioItems,
    ...groups.flatMap((group) => group.groupAudios || [])
  ]).some((audio) => Boolean(previewPath(audio) || audio.path));
  const uploadingCount = groups.reduce((total, group) =>
    total
    + group.clips.filter((clip) => clip.uploadStatus === 'uploading').length
    + (group.groupAudios || []).filter((audio) => audio.uploadStatus === 'uploading').length,
  0) + audioItems.filter((audio) => audio.uploadStatus === 'uploading').length;
  const failedOrLocalCount = groups.reduce((total, group) =>
    total
    + group.clips.filter((clip) => !isUsableCloudMedia(clip) && (clip.localPath || clip.uploadStatus === 'failed' || clip.uploadStatus === 'local')).length
    + (group.groupAudios || []).filter((audio) => !isUsableCloudMedia(audio) && (audio.localPath || audio.uploadStatus === 'failed' || audio.uploadStatus === 'local')).length,
  0) + audioItems.filter((audio) => !isUsableCloudMedia(audio) && (audio.localPath || audio.uploadStatus === 'failed' || audio.uploadStatus === 'local')).length;

  if (uploadingCount > 0) {
    throw new Error(`还有 ${uploadingCount} 个视频/音频正在上传，请等待上传完成后再生成。`);
  }
  if (cloudVideoCount === 0) {
    if (failedOrLocalCount > 0) {
      throw new Error(`当前有 ${failedOrLocalCount} 个素材只在本地或上传失败。阿里云混剪只能访问 OSS/http 媒体地址，请先启动后端并配置 OSS，重新上传视频和音频后再生成。`);
    }
    throw new Error(hasAnyAudioMaterial ? '当前没有已上传到 OSS 的视频素材，请先完成视频云端上传后再生成。' : '当前没有已上传到 OSS 的视频素材，请先导入并完成云端上传后再生成。');
  }
  if (!hasAnyAudioMaterial) return;
  if (cloudAudioCount > 0 && failedOrLocalCount === 0) return;
  if (failedOrLocalCount > 0) {
    throw new Error(`当前有 ${failedOrLocalCount} 个素材只在本地或上传失败。阿里云混剪只能访问 OSS/http 媒体地址，请先启动后端并配置 OSS，重新上传视频和音频后再生成。`);
  }
  throw new Error('当前存在未上传完成的组内音频或全局BGM，请完成音频云端上传后再生成。');
}

function assertEligibleMixGroupsReady(groups: FissionShotGroup[], audioItems: FissionAudioItem[]) {
  const eligibleGroups = collectEligibleMixGroups(groups, audioItems);
  if (eligibleGroups.length > 0) return;

  const uploadingItems = groups.flatMap((group) => [
    ...group.clips
      .filter((clip) => clip.uploadStatus === 'uploading')
      .map((clip) => `${group.title}:${clip.name}`),
    ...(group.groupAudios || [])
      .filter((audio) => audio.uploadStatus === 'uploading')
      .map((audio) => `${group.title}:${audio.name}`)
  ]);
  if (uploadingItems.length > 0) {
    throw new Error(`视频或组内音频还在上传中，请等待完成后再混剪：${uploadingItems.slice(0, 6).join('、')}`);
  }
  throw new Error('当前没有已上传完成的视频分镜，不能提交阿里云混剪。请先完成视频云端上传后再生成。');
}

function collectAllUploadedMixAudios(groups: FissionShotGroup[], audioItems: FissionAudioItem[]) {
  return dedupeAudioItems([
    ...audioItems,
    ...groups.flatMap((group) => group.groupAudios || [])
  ]).filter(isUsableCloudMedia);
}

function collectUploadedGlobalMixAudios(audioItems: FissionAudioItem[]) {
  return dedupeAudioItems(audioItems).filter(isUsableCloudMedia);
}

function collectEligibleMixGroups(groups: FissionShotGroup[], audioItems: FissionAudioItem[]) {
  void audioItems;
  return groups
    .map((group) => ({
      group,
      uploadedClips: group.clips.filter(isUsableCloudMedia)
    }))
    .filter((item) => item.uploadedClips.length > 0);
}

function collectVariantAudioNames(
  groups: FissionShotGroup[],
  audioItems: FissionAudioItem[],
  variantIndex: number,
  compositionMode: 'segments' | 'waterfall' = 'segments'
) {
  const names = resolveVariantSelections(groups, audioItems, variantIndex, compositionMode)
    .map((selection) => selection.audio?.name)
    .filter((name): name is string => Boolean(name));
  return Array.from(new Set(names)).slice(0, 4).join(' / ');
}

function collectVariantMaterialSummary(
  groups: FissionShotGroup[],
  audioItems: FissionAudioItem[],
  variantIndex: number,
  compositionMode: 'segments' | 'waterfall' = 'segments'
) {
  const selections = resolveVariantSelections(groups, audioItems, variantIndex, compositionMode);
  const selectedBgm = selectVariantBackgroundAudioItem(audioItems, variantIndex);
  const videoNames: string[] = [];
  const audioNames: string[] = [];
  const details: GeneratedFissionGroupDetail[] = [];
  let coverPath: string | undefined;

  selections.forEach((selection) => {
    const group = selection.group;
    const clip = selection.clip || group.clips[0];
    const audio = selection.audio;
    if (clip) {
      videoNames.push(`${group.title}:${clip.name}`);
      coverPath ||= previewPath(clip);
    }

    if (audio) audioNames.push(`${group.title}:${audio.name}`);
    details.push({
      groupId: group.id,
      groupName: group.title,
      clipName: clip?.name,
      audioName: audio?.name,
      audioSource: selection.audioSource,
      contentProfile: selection.selectionProfile,
      coverPath: previewPath(clip)
    });
  });

  const compactVideos = videoNames.slice(0, 4).join(' / ');
  const compactAudios = audioNames.slice(0, 4).join(' / ');
  const bgmName = selectedBgm?.name || '';
  return {
    audioNames: Array.from(new Set(audioNames.map((name) => name.split(':').slice(1).join(':')))).slice(0, 4).join(' / '),
    bgmName,
    coverPath,
    details,
    text: `视频：${compactVideos || '无已上传视频'} · 口播：${compactAudios || '无组内音频'}${bgmName ? ` · BGM：${bgmName}` : ''}`
  };
}

function buildHumanVoiceMixBlocker(
  groups: FissionShotGroup[],
  audioItems: FissionAudioItem[],
  compositionMode: 'segments' | 'waterfall' = 'segments'
) {
  const selections = resolveVariantSelections(groups, audioItems, 0, compositionMode);
  const mismatchMessages: string[] = [];

  selections.forEach((selection) => {
    if (!selection.voiceLocked || !selection.clip || !selection.audio || !isFissionHumanPresenterProfile(selection.selectionProfile)) {
      return;
    }
    const group = selection.group;
    const clipDuration = parseDurationSeconds(selection.clip.duration) || parseDurationSeconds(group.duration);
    const speechWindow = normalizePresenterSpeechWindow(selection.audio);
    const audioDuration = speechWindow.effectiveDuration || parseDurationSeconds(selection.audio.duration);
    if (clipDuration <= 0 || audioDuration <= 0 || audioDuration - clipDuration <= 2.2) {
      return;
    }
    mismatchMessages.push(
      `分镜「${group.title}」的人物口播音频 ${formatFissionMediaDuration(audioDuration, `${audioDuration.toFixed(1)}s`)} 明显长于人物镜头 ${formatFissionMediaDuration(clipDuration, `${clipDuration.toFixed(1)}s`)}`
    );
  });

  if (mismatchMessages.length === 0) return '';
  return `${mismatchMessages[0]}${mismatchMessages.length > 1 ? `；另外还有 ${mismatchMessages.length - 1} 个分镜也存在同类问题` : ''}。当前普通分镜混剪会出现“画面人物不说话、音频继续播放”的错位效果。请补充更长的人物镜头、把口播音频拆短到对应分镜，或先改成非人物镜头后再生成。`;
}

function resolveVariantSelections(
  groups: FissionShotGroup[],
  audioItems: FissionAudioItem[],
  variantIndex: number,
  compositionMode: 'segments' | 'waterfall'
) {
  const eligibleGroups = collectLocalEligibleMixGroups(groups, audioItems);
  if (compositionMode === 'waterfall') {
    return buildWaterfallMixSelections({
      groups: eligibleGroups.map(({ group, availableClips, availableGroupAudios }) => ({
        ...group,
        clips: availableClips,
        groupAudios: availableGroupAudios
      })),
      globalAudios: [],
      variantIndex
    });
  }
  return eligibleGroups.map(({ group, availableClips, availableGroupAudios }, groupIndex) => {
    const selection = selectAliyunMixVariantMedia({
      group,
      clips: availableClips,
      groupAudios: availableGroupAudios,
      globalAudios: [],
      variantIndex,
      groupIndex
    });
    return {
      orderIndex: groupIndex,
      group,
      clip: selection.clip || availableClips[0],
      audio: selection.audio,
      selectionProfile: selection.selectionProfile,
      contentProfile: selection.contentProfile,
      audioUsageType: selection.audioUsageType,
      audioSource: selection.audioSource,
      voiceLocked: selection.voiceLocked,
      voiceProfileKey: '',
      continuityLocked: false
    };
  });
}

function collectAvailableGlobalMixAudios(audioItems: FissionAudioItem[]) {
  return dedupeAudioItems(audioItems).filter((audio) => Boolean(previewPath(audio) || audio.path));
}

function collectLocalEligibleMixGroups(groups: FissionShotGroup[], audioItems: FissionAudioItem[]) {
  void audioItems;
  return groups
    .map((group) => ({
      group,
      availableClips: group.clips.filter((clip) => Boolean(previewPath(clip) || clip.path)),
      availableGroupAudios: (group.groupAudios || []).filter((audio) => Boolean(previewPath(audio) || audio.path))
    }))
    .filter((item) => item.availableClips.length > 0);
}

function selectVariantBackgroundAudioItem(audioItems: FissionAudioItem[], variantIndex: number) {
  const availableBgms = collectAvailableGlobalMixAudios(audioItems);
  if (availableBgms.length === 0) return undefined;
  return availableBgms[Math.max(0, variantIndex) % availableBgms.length];
}

function dedupeAudioItems(audios: FissionAudioItem[]) {
  const seen = new Set<string>();
  return audios.filter((audio) => {
    const key = audio.path || audio.id;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeScriptText(script: string) {
  return script
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+$/gm, '')
    .trim();
}

function shouldSplitPlainScriptLines(script: string) {
  const lines = script.split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return false;
  return lines.every((line) => /^[^：:\-—]{1,18}[：:\-—]\s*\S+/.test(line) && !/^(?:画面|口播|旁白|台词|文案|解说)\s*[：:\-—]/.test(line));
}

function parseCsvScriptGroups(script: string): FissionShotGroup[] {
  const rows = parseCsv(script.trim());
  if (rows.length < 2) return [];
  const headers = rows[0].map((item) => item.trim().toLowerCase());
  const titleIndex = headers.findIndex((item) => ['title', '标题', '分镜', '分镜标题', '镜头', 'name'].includes(item));
  const pictureIndex = headers.findIndex((item) => ['picture', '画面', '画面描述', '视频', '视觉', 'scene', 'visual'].includes(item));
  const voiceIndex = headers.findIndex((item) => ['voiceover', 'voice', '口播', '旁白', '台词', '文案', '解说'].includes(item));
  const sceneIndex = headers.findIndex((item) => ['scene', '分镜号', '序号', '编号', 'no', 'id'].includes(item));
  if (titleIndex < 0 && pictureIndex < 0 && voiceIndex < 0) return [];
  return rows.slice(1).filter((row) => row.some(Boolean)).map((row, index) => {
    const sceneNo = Number(row[sceneIndex] || index + 1) || index + 1;
    const title = row[titleIndex] || `分镜 ${sceneNo}`;
    const picture = row[pictureIndex] || title;
    const voiceover = row[voiceIndex] || picture;
    return makeFissionGroup(sceneNo, title, picture, voiceover, index, { sourceFormat: 'csv' });
  });
}

function parseJsonScriptGroups(script: string): FissionShotGroup[] {
  try {
    const parsed = JSON.parse(script);
    const sourceItems: unknown[] = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && Array.isArray(parsed.scenes)
        ? parsed.scenes
        : [];
    return sourceItems.map((sourceItem, index) => {
      const item = isRecord(sourceItem) ? sourceItem : {};
      const sceneNo = Number(item.sceneNo ?? item.scene ?? item.no ?? item['分镜号'] ?? item['序号'] ?? index + 1) || index + 1;
      const title = String(item.title ?? item.name ?? item['标题'] ?? item['分镜'] ?? `分镜 ${sceneNo}`);
      const picture = String(item.picture ?? item.visual ?? item.image ?? item.sceneText ?? item['画面'] ?? item['画面描述'] ?? title);
      const voiceover = String(item.voiceover ?? item.voice ?? item.line ?? item.copy ?? item['口播'] ?? item['旁白'] ?? item['文案'] ?? picture);
      return makeFissionGroup(sceneNo, title, picture, voiceover, index, { sourceFormat: 'json' });
    });
  } catch {
    return [];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function makeFissionGroup(
  sceneNo: number,
  title: string,
  picture: string,
  voiceover: string,
  index: number,
  options?: Pick<FissionShotGroup, 'displayTitle' | 'sourceFormat' | 'sourceDocumentTitle' | 'sourceDocumentMeta'>
): FissionShotGroup {
  const durationStart = 3 + index * 0.72;
  const durationEnd = durationStart + 2.1 + (index % 3) * 0.55;
  return {
    id: crypto.randomUUID(),
    sceneNo,
    title,
    displayTitle: options?.displayTitle,
    sourceFormat: options?.sourceFormat,
    sourceDocumentTitle: options?.sourceDocumentTitle,
    sourceDocumentMeta: options?.sourceDocumentMeta,
    count: Math.max(1, Math.min(8, Math.ceil((picture.length + voiceover.length) / 28))),
    duration: `${durationStart.toFixed(2)}s-${durationEnd.toFixed(2)}s`,
    script: picture,
    voiceover,
    clips: []
  };
}

function parseCsv(input: string): string[][] {
  const delimiter = detectCsvDelimiter(input);
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];
    if (char === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(value.trim());
      value = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = '';
    } else {
      value += char;
    }
  }
  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function detectCsvDelimiter(input: string) {
  const firstLine = input.split(/\r?\n/).find((line) => line.trim()) || '';
  const commaCount = (firstLine.match(/,/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;
  return tabCount > commaCount ? '\t' : ',';
}

function readFinishedVideoGroups(value: unknown): FinishedVideoGroup[] {
  if (!Array.isArray(value)) return [];
  if (value.every((item) => item && typeof item === 'object' && Array.isArray((item as FinishedVideoGroup).videos))) {
    return value as FinishedVideoGroup[];
  }
  const legacyVideos = value.filter((item): item is FinishedVideoItem => Boolean(item && typeof item === 'object' && 'id' in item && 'name' in item));
  if (legacyVideos.length === 0) return [];
  const grouped = new Map<string, FinishedVideoItem[]>();
  for (const video of legacyVideos) {
    const groupName = video.draftName?.trim() || '未分组裂变工作';
    const existing = grouped.get(groupName) || [];
    existing.push(video);
    grouped.set(groupName, existing);
  }
  return Array.from(grouped.entries()).map(([draftName, videos]) => {
    const savedAt = videos[0]?.savedAt || new Date().toISOString();
    return {
      id: `legacy-${draftName}`,
      draftName,
      savedAt,
      updatedAt: savedAt,
      videoCount: videos.length,
      videos
    } satisfies FinishedVideoGroup;
  });
}

function sameFinishedGroup(group: FinishedVideoGroup, draftId: string, draftName: string) {
  if (draftId && group.draftId) return group.draftId === draftId;
  return group.draftName === draftName;
}

function FinishedVideosWorkspace(props: { refreshToken: number }) {
  const [libraryGroups, setLibraryGroups] = useState<FinishedVideoGroup[]>([]);
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<string[]>([]);
  const [previewVideo, setPreviewVideo] = useState<{ name: string; path?: string; viralOverlay?: ViralRecentTask } | null>(null);
  const [previewVideoTime, setPreviewVideoTime] = useState(0);
  const [previewError, setPreviewError] = useState('');
  const [trackContextMenu, setTrackContextMenu] = useState<{ x: number; y: number; optionId: string; type: ComboTimelineTrackType } | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.surgicol.store.get<FinishedVideoGroup[] | FinishedVideoItem[]>(FINISHED_VIDEOS_KEY)
      .then((videos) => {
        if (cancelled) return;
        setLibraryGroups(readFinishedVideoGroups(videos));
      })
      .catch(() => {
        if (!cancelled) setLibraryGroups([]);
      });
    return () => {
      cancelled = true;
    };
  }, [props.refreshToken]);

  useEffect(() => {
    let cancelled = false;
    const videos = libraryGroups.flatMap((group) => group.videos);
    if (videos.length === 0) {
      setThumbUrls({});
      return undefined;
    }
    const resolveCovers = async () => {
      const resolvedEntries = await Promise.all(videos.map(async (video) => {
        const source = video.coverPath || video.path;
        if (!source) return [video.id, ''] as const;
        try {
          const nextPath = shouldRequestProtectedPreview(source)
            ? (await getProtectedMediaAccessUrl(source)).mediaUrl
            : source;
          return [video.id, nextPath] as const;
        } catch {
          return [video.id, source] as const;
        }
      }));
      if (cancelled) return;
      setThumbUrls(Object.fromEntries(resolvedEntries.filter((entry) => entry[1])));
    };
    void resolveCovers();
    return () => {
      cancelled = true;
    };
  }, [libraryGroups]);

  function toggleGroupCollapsed(groupId: string) {
    setCollapsedGroupIds((ids) => (ids.includes(groupId) ? ids.filter((id) => id !== groupId) : [...ids, groupId]));
  }

  async function previewFinishedVideo(video: FinishedVideoItem) {
    setPreviewVideoTime(0);
    const previewSource = video.localPath || video.path;
    if (!previewSource) {
      setPreviewError('当前成片没有可播放的视频地址。');
      setPreviewVideo({ name: video.name, path: undefined, viralOverlay: video.viralOverlay });
      return;
    }
    setPreviewError('');
    try {
      const nextPath = shouldRequestProtectedPreview(previewSource)
        ? (await getProtectedMediaAccessUrl(previewSource)).mediaUrl
        : previewSource;
      setPreviewVideo({ name: video.name, path: nextPath, viralOverlay: video.viralOverlay });
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : '获取成片预览地址失败');
      setPreviewVideo({ name: video.name, path: previewSource, viralOverlay: video.viralOverlay });
    }
  }

  async function downloadFinishedVideo(video: FinishedVideoItem) {
    if (!video.path) {
      setPreviewError('当前成片没有可下载的视频地址。');
      return;
    }
    setPreviewError('');
    try {
      const downloadSource = shouldRequestProtectedPreview(video.path)
        ? (await getProtectedMediaAccessUrl(video.path)).mediaUrl
        : video.path;
      const result = await window.surgicol.media.downloadToLocal(downloadSource, {
        fileName: `${video.name || '成片视频'}.mp4`,
        viralOverlay: video.viralOverlay ? buildRecentTaskDownloadOverlay(video.viralOverlay) : undefined
      });
      if (!result.canceled) {
        setPreviewError(`已下载到本地：${result.name || result.localPath}`);
      }
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : '本地下载失败，请稍后重试。');
    }
  }

  return (
    <div className="workflow-workspace">
      <section className="workflow-hero compact">
        <div>
          <span className="workflow-kicker">成片库</span>
          <h2>瀑布流筛选裂变结果</h2>
          <p>汇总批量生成的视频版本，按推荐、过审、差异度和字幕完整度做三剪筛选。</p>
        </div>
        <button type="button">
          <Download size={16} />
          <span>批量导出</span>
        </button>
      </section>

      {libraryGroups.length === 0 ? (
        <div className="workflow-empty-state">
          <FileText size={28} />
          <strong>成片库还没有保存的视频</strong>
          <p>在裂变结果里选择全部或部分视频，点击“保存到成片库”后会出现在这里。</p>
        </div>
      ) : (
        <div className="finished-group-stack">
          {libraryGroups.map((group) => (
            <section className="workflow-panel" key={group.id}>
              <header className="finished-group-header">
                <button className="finished-group-toggle" type="button" onClick={() => toggleGroupCollapsed(group.id)} aria-expanded={!collapsedGroupIds.includes(group.id)}>
                  {collapsedGroupIds.includes(group.id) ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                  <div>
                    <strong>{group.draftName}</strong>
                    <span>{group.videoCount} 个视频 · 最近保存 {formatLibraryTimestamp(group.updatedAt)}</span>
                  </div>
                </button>
                <small>{collapsedGroupIds.includes(group.id) ? '按裂变工作归档 · 已折叠' : '按裂变工作归档'}</small>
              </header>
              {collapsedGroupIds.includes(group.id) ? null : (
                <div className="finished-grid">
                  {group.videos.map((video) => (
                    <article className="finished-card" key={video.id}>
                      <div className="finished-thumb">
                        {thumbUrls[video.id] ? (
                          <video src={toMediaUrl(thumbUrls[video.id])} muted playsInline preload="metadata" />
                        ) : (
                          <div className="finished-thumb-placeholder">
                            <FileText size={24} />
                          </div>
                        )}
                        {video.viralOverlay ? <ViralSavedOverlay task={video.viralOverlay} /> : null}
                        <button className="finished-thumb-play" type="button" onClick={() => void previewFinishedVideo(video)} aria-label={`预览 ${video.name}`}>
                          <Play size={16} />
                        </button>
                        <span>{video.duration}</span>
                      </div>
                      <div className="finished-meta">
                        <strong>{video.name}</strong>
                        <div>
                          <span>推荐 {video.recommend}</span>
                          <span>过审 {video.compliance}</span>
                          <span>差异 {video.difference}</span>
                        </div>
                        {video.draftName ? <small>{video.batchName || video.draftName}</small> : null}
                      </div>
                      <div className="finished-actions">
                        <button type="button" onClick={() => void previewFinishedVideo(video)}>预览</button>
                        <button type="button" onClick={() => void downloadFinishedVideo(video)} disabled={!video.path}>下载</button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
      {previewVideo ? (
        <div className="script-import-backdrop">
          <section className="media-preview-dialog">
            <header>
              <strong>{previewVideo.name}</strong>
              <button type="button" onClick={() => {
                setPreviewVideo(null);
                setPreviewVideoTime(0);
                setPreviewError('');
              }}>
                <X size={16} />
              </button>
            </header>
            <div className="media-preview-body">
              {previewVideo.path ? (
                <div className="media-preview-stage">
                  <video
                    src={toMediaUrl(previewVideo.path)}
                    controls
                    autoPlay
                    onTimeUpdate={(event) => setPreviewVideoTime(event.currentTarget.currentTime)}
                    onSeeked={(event) => setPreviewVideoTime(event.currentTarget.currentTime)}
                  />
                  {previewVideo.viralOverlay ? <ViralSavedOverlay task={previewVideo.viralOverlay} currentTime={previewVideoTime} /> : null}
                </div>
              ) : (
                <div className="media-preview-empty">{previewError || '当前成片没有可播放的视频地址。'}</div>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

type CombinationOptimizeTab = 'basic' | 'subtitle' | 'filter' | 'decor' | 'wordArt';
type ComboTimelineTrackType = 'main' | 'sticker' | 'subtitle' | 'audio' | 'effect';
type ComboInspectorTab = 'basic' | 'mask' | 'beauty' | 'body';

const COMBO_TIMELINE_LABEL_WIDTH = 190;
const COMBO_TIMELINE_ZERO_OFFSET = -1;

interface ComboSubtitleItem {
  id: string;
  sourceOptionId: string;
  text: string;
  enabled: boolean;
}

interface ComboSubtitleSegment extends ComboSubtitleItem {
  option: CombinationSceneOption;
  start: number;
  duration: number;
}

interface ComboTrackDef {
  id: string;
  type: ComboTimelineTrackType;
}

interface ComboTimelineClip {
  optionId: string;
  trackId: string;
  trackType: ComboTimelineTrackType;
  start: number;
}

interface CombinationSceneOption {
  id: string;
  sceneId: string;
  sceneName: string;
  videoId: string;
  videoName: string;
  clipName: string;
  duration?: string;
  durationSeconds?: number;
  audioName?: string;
  coverPath?: string;
  sourcePath?: string;
}

interface CombinationSceneBucket {
  id: string;
  name: string;
  options: CombinationSceneOption[];
}

interface OptimizedCombination {
  id: string;
  label: number;
  name: string;
  scenes: CombinationSceneOption[];
  duration: string;
  score: number;
  state: string;
}

function CombinationOptimizeWorkspace(props: { refreshToken: number }) {
  const comboPanelRef = useRef<HTMLElement>(null);
  const comboVideoRef = useRef<HTMLVideoElement>(null);
  const [libraryGroups, setLibraryGroups] = useState<FinishedVideoGroup[]>([]);
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [selectedOptionIds, setSelectedOptionIds] = useState<Record<string, string>>({});
  const [selectedVideoId, setSelectedVideoId] = useState('');
  const [comboIsPlaying, setComboIsPlaying] = useState(false);
  const [comboIsMuted, setComboIsMuted] = useState(true);
  const [comboCurrentTime, setComboCurrentTime] = useState(0);
  const [isDraggingComboPlayhead, setIsDraggingComboPlayhead] = useState(false);
  const [comboFitMode, setComboFitMode] = useState<'contain' | 'cover'>('contain');
  const [comboQuality, setComboQuality] = useState('480p');
  const [comboAspectRatio, setComboAspectRatio] = useState<'9:16' | '16:9' | '1:1'>('9:16');
  const [trackZoom, setTrackZoom] = useState(64);
  const [loadedTimelineVideoId, setLoadedTimelineVideoId] = useState('');
  const [timelineTracks, setTimelineTracks] = useState<ComboTrackDef[]>([{ id: 'main-1', type: 'main' }]);
  const [visibleTrackTypes, setVisibleTrackTypes] = useState<ComboTimelineTrackType[]>(['main']);
  const [timelineClips, setTimelineClips] = useState<ComboTimelineClip[]>([]);
  const [selectedTrackOptionId, setSelectedTrackOptionId] = useState('');
  const [selectedTimelineLayerType, setSelectedTimelineLayerType] = useState<ComboTimelineTrackType>('main');
  const [trackClipOffsets, setTrackClipOffsets] = useState<Record<string, number>>({});
  const [lockedTrackClipIds, setLockedTrackClipIds] = useState<string[]>([]);
  const [timelineSnapEnabled, setTimelineSnapEnabled] = useState(true);
  const [timelineLinked, setTimelineLinked] = useState(true);
  const [activeToolTab, setActiveToolTab] = useState<CombinationOptimizeTab>('basic');
  const [subtitleItems, setSubtitleItems] = useState<ComboSubtitleItem[]>([]);
  const [subtitleInspectorTab, setSubtitleInspectorTab] = useState<ComboInspectorTab>('basic');
  const [subtitleBasicSettings, setSubtitleBasicSettings] = useState({
    scale: 100,
    keepRatio: true,
    x: 0,
    y: 0,
    rotation: 0,
    align: 'center',
    blend: true,
    antiShake: false,
    superQuality: false
  });
  const [selectedFilterIds, setSelectedFilterIds] = useState<string[]>([]);
  const [selectedDecorIds, setSelectedDecorIds] = useState<string[]>([]);
  const [selectedWordArtIds, setSelectedWordArtIds] = useState<string[]>([]);
  const [comboNotice, setComboNotice] = useState('');
  const [optimizedCombinations, setOptimizedCombinations] = useState<OptimizedCombination[]>([]);
  const [previewVideo, setPreviewVideo] = useState<{ name: string; path?: string } | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [trackContextMenu, setTrackContextMenu] = useState<{ x: number; y: number; optionId: string; type: ComboTimelineTrackType } | null>(null);
  const [coverDialogOpen, setCoverDialogOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    window.surgicol.store.get<FinishedVideoGroup[] | FinishedVideoItem[]>(FINISHED_VIDEOS_KEY)
      .then((videos) => {
        if (cancelled) return;
        const groups = readFinishedVideoGroups(videos);
        setLibraryGroups(groups);
        setSelectedGroupId((id) => (id && groups.some((group) => group.id === id) ? id : groups[0]?.id || ''));
      })
      .catch(() => {
        if (!cancelled) setLibraryGroups([]);
      });
    return () => {
      cancelled = true;
    };
  }, [props.refreshToken]);

  const selectedGroup = libraryGroups.find((group) => group.id === selectedGroupId) || libraryGroups[0];
  const sceneBuckets = selectedGroup ? buildCombinationSceneBuckets(selectedGroup) : [];
  const flatOptions = sceneBuckets.flatMap((scene) => scene.options);
  const timelineOptionMap = new Map(flatOptions.map((option) => [option.id, option] as const));
  const currentTimelineClips = timelineClips
    .map((clip) => {
      const option = timelineOptionMap.get(clip.optionId);
      if (!option) return null;
      return { ...clip, option };
    })
    .filter((clip): clip is ComboTimelineClip & { option: CombinationSceneOption } => Boolean(clip))
    .sort((a, b) => a.start - b.start);
  const loadedTimelineVideo = flatOptions.find((option) => option.id === selectedTrackOptionId) || flatOptions.find((option) => option.videoId === loadedTimelineVideoId);
  const currentTimelineOptions = currentTimelineClips.map((clip) => clip.option);
  const subtitleSegments = buildSubtitleSegments(currentTimelineOptions, subtitleItems, getTrackClipLeft, getTrackClipDuration);
  const activeSubtitleSegments = subtitleSegments.filter((segment) => (
    segment.enabled
    && comboCurrentTime >= segment.start
    && comboCurrentTime < segment.start + segment.duration
  ));
  const activeOption = currentTimelineClips.length > 0
    ? currentTimelineClips.find((clip) => comboCurrentTime >= clip.start && comboCurrentTime < clip.start + getTrackClipDuration('main', clip.option))?.option
      || currentTimelineOptions.find((option) => option.id === selectedVideoId)
      || currentTimelineOptions[0]
      || null
    : null;
  const activePreviewUrl = activeOption ? thumbUrls[activeOption.id] : '';
  const comboDurationSeconds = currentTimelineOptions.length > 0
    ? Math.max(0, currentTimelineClips.reduce((max, clip) => Math.max(max, clip.start + getTrackClipDuration(clip.trackType, clip.option)), 0))
    : 0;
  const selectedSceneOptions = sceneBuckets
    .map((scene) => scene.options.find((option) => option.id === selectedOptionIds[scene.id]) || scene.options[0])
    .filter((option): option is CombinationSceneOption => Boolean(option));
  const selectedTrackOption = flatOptions.find((option) => option.id === selectedTrackOptionId) || currentTimelineOptions[0];
  const orderedVisibleTracks = (timelineTracks.length > 0
    ? timelineTracks.slice().sort((a, b) => comboTimelineTrackOrder.indexOf(a.type) - comboTimelineTrackOrder.indexOf(b.type))
    : [{ id: 'main-1', type: 'main' }]) as ComboTrackDef[];
  const basicTargetType: ComboTimelineTrackType = selectedTimelineLayerType === 'subtitle' && subtitleItems.length > 0 ? 'subtitle' : 'main';
  const basicTargetLabel = basicTargetType === 'subtitle' ? '字幕层' : '主视频';
  const basicAlignPosition: Record<string, string> = {
    left: '18% 50%',
    center: '50% 50%',
    right: '82% 50%',
    top: '50% 18%',
    bottom: '50% 82%'
  };
  const basicLayerTransform = `translate(${subtitleBasicSettings.x}px, ${subtitleBasicSettings.y}px) scale(${subtitleBasicSettings.scale / 100}) rotate(${subtitleBasicSettings.rotation}deg)`;
  const basicVideoFilter = [
    comboPreviewFilter(selectedFilterIds),
    subtitleBasicSettings.superQuality ? 'contrast(112%) saturate(116%)' : '',
    subtitleBasicSettings.antiShake ? 'brightness(103%)' : ''
  ].filter(Boolean).join(' ');

  useEffect(() => {
    setSelectedOptionIds((current) => {
      const next: Record<string, string> = {};
      sceneBuckets.forEach((scene) => {
        const existing = scene.options.find((option) => option.id === current[scene.id]);
        next[scene.id] = existing?.id || scene.options[0]?.id || '';
      });
      return next;
    });
    setSelectedVideoId((id) => (flatOptions.some((option) => option.id === id) ? id : flatOptions[0]?.id || ''));
    setOptimizedCombinations([]);
  }, [selectedGroupId, sceneBuckets.length]);

  useEffect(() => {
    let cancelled = false;
    const resolveCovers = async () => {
      const resolvedEntries = await Promise.all(flatOptions.map(async (option) => {
        const source = option.coverPath || option.sourcePath;
        if (!source) return [option.id, ''] as const;
        try {
          const nextPath = shouldRequestProtectedPreview(source)
            ? (await getProtectedMediaAccessUrl(source)).mediaUrl
            : source;
          return [option.id, nextPath] as const;
        } catch {
          return [option.id, source] as const;
        }
      }));
      if (!cancelled) setThumbUrls(Object.fromEntries(resolvedEntries.filter((entry) => entry[1])));
    };
    if (flatOptions.length === 0) {
      setThumbUrls({});
      return undefined;
    }
    void resolveCovers();
    return () => {
      cancelled = true;
    };
  }, [selectedGroupId, flatOptions.length]);

  async function previewOption(option?: CombinationSceneOption) {
    if (!option) return;
    const source = option.sourcePath || option.coverPath;
    if (!source) {
      setPreviewError('当前镜头没有可播放的视频地址。');
      setPreviewVideo({ name: option.clipName });
      return;
    }
    setPreviewError('');
    try {
      const nextPath = shouldRequestProtectedPreview(source)
        ? (await getProtectedMediaAccessUrl(source)).mediaUrl
        : source;
      setPreviewVideo({ name: option.clipName, path: nextPath });
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : '获取镜头预览地址失败');
      setPreviewVideo({ name: option.clipName, path: source });
    }
  }

  function selectComboOption(option: CombinationSceneOption) {
    setSelectedOptionIds((ids) => ({ ...ids, [option.sceneId]: option.id }));
    setSelectedVideoId(option.id);
    setComboIsPlaying(false);
  }

  function loadOptionToTimeline(option?: CombinationSceneOption, preferredTrack: ComboTimelineTrackType = 'main') {
    if (!option) return;
    const materialType = getOptionMaterialType(option);
    if (preferredTrack !== materialType && preferredTrack !== 'main') {
      setComboNotice(`${comboTrackTypeLabels[materialType]}素材不能放入${comboTrackTypeLabels[preferredTrack]}轨道。`);
      return;
    }
    const targetType = preferredTrack || materialType || 'main';
    const targetTrackId = targetType === 'main'
      ? (timelineTracks.find((track) => track.type === 'main')?.id || 'main-1')
      : (timelineTracks.find((track) => track.type === targetType)?.id || createTimelineTrackId(targetType, timelineTracks));
    const existingOnTrack = currentTimelineClips.filter((clip) => clip.trackId === targetTrackId);
    const nextStart = existingOnTrack.reduce((max, clip) => Math.max(max, clip.start + getTrackClipDuration(clip.trackType, clip.option)), 0);
    setLoadedTimelineVideoId(option.videoId);
    setTimelineTracks((tracks) => {
      const ensuredMain: ComboTrackDef[] = tracks.some((track) => track.id === 'main-1') ? tracks : [{ id: 'main-1', type: 'main' }, ...tracks];
      return ensuredMain.some((track) => track.id === targetTrackId)
        ? ensuredMain
        : [...ensuredMain, { id: targetTrackId, type: targetType }];
    });
    setVisibleTrackTypes((types) => Array.from(new Set([...types, targetType])));
    setTimelineClips((clips) => [...clips, { optionId: option.id, trackId: targetTrackId, trackType: targetType, start: nextStart }]);
    setTrackClipOffsets((offsets) => ({ ...offsets, [trackClipKey(targetType, option.id)]: nextStart }));
    setSelectedTrackOptionId(option.id);
    setSelectedTimelineLayerType(targetType === 'subtitle' ? 'subtitle' : targetType);
    setSelectedVideoId(option.id);
    setComboCurrentTime(nextStart);
    setSubtitleItems((items) => remapSubtitleItems(currentTimelineOptions.concat(option), items));
    setComboNotice(`已将“${option.clipName}”追加到${comboTrackTypeLabels[targetType]}。`);
  }

  function addTimelineTrack(type: ComboTimelineTrackType) {
    setVisibleTrackTypes((types) => Array.from(new Set([...types, type])));
    setTimelineTracks((tracks) => [...tracks, { id: createTimelineTrackId(type, tracks), type }]);
    const label = comboTrackTypeLabels[type];
    setComboNotice(`已添加${label}轨道。拖入素材时会按素材类型进入对应轨道，未识别类型默认进入主轨。`);
  }

  function toggleComboPlay() {
    const video = comboVideoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }

  function seekComboPreview(seconds: number) {
    const video = comboVideoRef.current;
    const nextTime = Math.max(0, Math.min(comboDurationSeconds, comboCurrentTime + seconds));
    if (video) video.currentTime = Math.min(video.duration || nextTime, nextTime);
    setComboCurrentTime(nextTime);
  }

  function cycleComboAspectRatio() {
    setComboAspectRatio((ratio) => {
      if (ratio === '9:16') return '16:9';
      if (ratio === '16:9') return '1:1';
      return '9:16';
    });
  }

  function toggleComboMute() {
    const nextMuted = !comboIsMuted;
    const video = comboVideoRef.current;
    if (video) video.muted = nextMuted;
    setComboIsMuted(nextMuted);
  }

  function toggleComboFullscreen() {
    const panel = comboPanelRef.current;
    if (!panel) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
    } else {
      panel.requestFullscreen().catch(() => undefined);
    }
  }

  function jumpComboTimeline(time: number) {
    const nextTime = Math.max(0, Math.min(comboDurationSeconds, time));
    setComboCurrentTime(nextTime);
    const video = comboVideoRef.current;
    if (video) video.currentTime = Math.min(video.duration || nextTime, nextTime);
    const clip = currentTimelineClips.find((item) => nextTime >= item.start && nextTime < item.start + getTrackClipDuration(item.trackType, item.option))
      || currentTimelineClips[currentTimelineClips.length - 1];
    if (clip) {
      setSelectedTrackOptionId(clip.option.id);
      setSelectedVideoId(clip.option.id);
    }
  }

  function updateComboPlayheadFromClientX(clientX: number, element: HTMLElement) {
    const rect = element.getBoundingClientRect();
    const timelineStart = rect.left + COMBO_TIMELINE_LABEL_WIDTH + COMBO_TIMELINE_ZERO_OFFSET;
    const nextTime = Math.max(0, Math.min(comboDurationSeconds, (clientX - timelineStart + element.scrollLeft) / trackZoom));
    jumpComboTimeline(nextTime);
  }

  function updateComboRulerPlayheadFromClientX(clientX: number, element: HTMLElement) {
    const rect = element.getBoundingClientRect();
    const nextTime = Math.max(0, Math.min(comboDurationSeconds, (clientX - rect.left) / trackZoom));
    jumpComboTimeline(nextTime);
  }

  function beginComboPlayheadDrag(event: MouseEvent<HTMLElement>, dragSurface?: HTMLElement) {
    const targetElement = event.target as HTMLElement;
    if (!targetElement.closest('.combo-playhead') && targetElement.closest('button, input, select, textarea')) return;
    event.preventDefault();
    const target = dragSurface || event.currentTarget;
    setIsDraggingComboPlayhead(true);
    updateComboPlayheadFromClientX(event.clientX, target);
    const handleMove = (moveEvent: globalThis.MouseEvent) => updateComboPlayheadFromClientX(moveEvent.clientX, target);
    const handleUp = () => {
      setIsDraggingComboPlayhead(false);
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }

  function beginComboRulerDrag(event: MouseEvent<HTMLElement>) {
    event.preventDefault();
    const target = event.currentTarget;
    setIsDraggingComboPlayhead(true);
    updateComboRulerPlayheadFromClientX(event.clientX, target);
    const handleMove = (moveEvent: globalThis.MouseEvent) => updateComboRulerPlayheadFromClientX(moveEvent.clientX, target);
    const handleUp = () => {
      setIsDraggingComboPlayhead(false);
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }

  function deleteSelectedTrackClip() {
    if (!selectedTrackOption) return;
    comboVideoRef.current?.pause();
    setLoadedTimelineVideoId('');
    setSelectedTrackOptionId('');
    setSelectedVideoId('');
    setSelectedTimelineLayerType('main');
    setVisibleTrackTypes(['main']);
    setTimelineTracks([{ id: 'main-1', type: 'main' }]);
    setTimelineClips([]);
    setSubtitleItems([]);
    setComboCurrentTime(0);
    setComboIsPlaying(false);
    setComboNotice(`已从轨道移除“${selectedTrackOption.videoName}”。`);
  }

  function openTrackContextMenu(event: MouseEvent<HTMLElement>, type: ComboTimelineTrackType, option: CombinationSceneOption) {
    event.preventDefault();
    setSelectedTrackOptionId(option.id);
    setSelectedVideoId(option.id);
    setTrackContextMenu({ x: event.clientX, y: event.clientY, optionId: option.id, type });
  }

  function handleTrackContextAction(action: 'delete' | 'split' | 'cover') {
    const target = trackContextMenu ? flatOptions.find((option) => option.id === trackContextMenu.optionId) : selectedTrackOption;
    if (!target) return;
    if (action === 'delete') {
      comboVideoRef.current?.pause();
      setLoadedTimelineVideoId('');
      setSelectedTrackOptionId('');
      setSelectedVideoId('');
      setSelectedTimelineLayerType('main');
      setVisibleTrackTypes(['main']);
      setTimelineTracks([{ id: 'main-1', type: 'main' }]);
      setTimelineClips([]);
      setSubtitleItems([]);
      setComboCurrentTime(0);
      setComboIsPlaying(false);
      setComboNotice(`已删除片段“${target.clipName}”。`);
    } else if (action === 'split') {
      setComboNotice(`已在播放头 ${formatTimelineTick(comboCurrentTime)} 分割“${target.clipName}”。`);
    } else {
      setComboNotice(`已将“${target.clipName}”设为封面。`);
    }
    setTrackContextMenu(null);
  }

  function trackClipKey(type: ComboTimelineTrackType, optionId: string) {
    return `${type}:${optionId}`;
  }

  function getTrackClipLeft(type: ComboTimelineTrackType, option: CombinationSceneOption, index: number) {
    const fallback = type === 'effect' ? index * 7.2 + 0.8 : index * getTrackClipDuration(type, option);
    return trackClipOffsets[trackClipKey(type, option.id)] ?? fallback;
  }

  function getTrackClipDuration(type: ComboTimelineTrackType, option?: CombinationSceneOption) {
    if (type === 'main') return Math.max(0.5, option?.durationSeconds || parseDurationSeconds(option?.duration) || 4.8);
    if (type === 'subtitle') return 3.6;
    if (type === 'audio') return 2.8;
    if (type === 'sticker') return 3.8;
    return 4.2;
  }

  function getOptionMaterialType(option?: CombinationSceneOption): ComboTimelineTrackType {
    if (!option) return 'main';
    if (option.audioName && !option.clipName) return 'audio';
    return 'main';
  }

  function canPlaceClipOnTrack(type: ComboTimelineTrackType, trackId: string, option: CombinationSceneOption, start: number, movingKey?: string) {
    if (!timelineTracks.some((track) => track.id === trackId)) {
      return { ok: false, message: `请先添加${comboTrackTypeLabels[type]}轨道。` };
    }
    const duration = getTrackClipDuration(type, option);
    const end = start + duration;
    const sortedTrackClips = currentTimelineClips.filter((clip) => clip.trackId === trackId).map((clip, index) => {
      const key = trackClipKey(type, clip.option.id);
      const clipStart = getTrackClipLeft(type, clip.option, index);
      return {
        key,
        start: clipStart,
        end: clipStart + getTrackClipDuration(type, clip.option),
        name: clip.option.clipName
      };
    }).filter((item) => item.key !== movingKey);
    const overlapped = sortedTrackClips.find((item) => start < item.end && end > item.start);
    if (overlapped) {
      const safeStart = sortedTrackClips.reduce((max, item) => Math.max(max, item.end), 0);
      return {
        ok: false,
        message: `同一条${comboTrackTypeLabels[type]}轨道不能重叠。请放到 ${formatTimelineTick(safeStart)} 之后，或添加同类型上层轨道。`
      };
    }
    return { ok: true, message: '' };
  }

  function beginTrackClipDrag(event: DragEvent<HTMLElement>, type: ComboTimelineTrackType, option: CombinationSceneOption) {
    const key = trackClipKey(type, option.id);
    if (lockedTrackClipIds.includes(key)) {
      event.preventDefault();
      setComboNotice('该片段已锁定，解锁后才能移动。');
      return;
    }
    event.dataTransfer.setData('application/x-combo-track-clip', key);
    event.dataTransfer.setData('application/x-combo-track-type', type);
    event.dataTransfer.setData('application/x-combo-option-id', option.id);
    const sourceTrackId = currentTimelineClips.find((clip) => clip.option.id === option.id && clip.trackType === type)?.trackId || '';
    event.dataTransfer.setData('application/x-combo-track-id', sourceTrackId);
    event.dataTransfer.effectAllowed = 'move';
  }

  function moveTrackClipFromDrop(event: DragEvent<HTMLElement>, targetType: ComboTimelineTrackType = 'main', targetTrackId?: string) {
    event.preventDefault();
    event.stopPropagation();
    const optionId = event.dataTransfer.getData('application/x-combo-option-id');
    const clipKey = event.dataTransfer.getData('application/x-combo-track-clip');
    const sourceType = (event.dataTransfer.getData('application/x-combo-track-type') || 'main') as ComboTimelineTrackType;
    const sourceTrackId = event.dataTransfer.getData('application/x-combo-track-id');
    const type = targetType || sourceType || 'main';
    const option = flatOptions.find((item) => item.id === optionId);
    if (!option) return;
    if (!clipKey) {
      const materialType = getOptionMaterialType(option);
      if (type !== materialType) {
        setComboNotice(`${comboTrackTypeLabels[materialType]}素材不能放入${comboTrackTypeLabels[type]}轨道。`);
        return;
      }
      if (!targetTrackId && event.currentTarget.classList.contains('combo-timeline-body') && currentTimelineClips.length > 0) {
        const newTrackId = createTimelineTrackId(materialType, timelineTracks);
        setTimelineTracks((tracks) => [...tracks, { id: newTrackId, type: materialType }]);
        setVisibleTrackTypes((types) => Array.from(new Set([...types, materialType])));
        setTimelineClips((clips) => [...clips, { optionId: option.id, trackId: newTrackId, trackType: materialType, start: 0 }]);
        setTrackClipOffsets((offsets) => ({ ...offsets, [trackClipKey(materialType, option.id)]: 0 }));
        setLoadedTimelineVideoId(option.videoId);
        setSelectedTrackOptionId(option.id);
        setSelectedTimelineLayerType(materialType);
        setSelectedVideoId(option.id);
        setComboCurrentTime(0);
        setComboNotice(`已拖入“${option.clipName}”，并新建${comboTrackTypeLabels[materialType]}。`);
        return;
      }
      loadOptionToTimeline(option, type || 'main');
      return;
    }
    if (sourceType !== type) {
      setComboNotice(`${comboTrackTypeLabels[sourceType]}片段不能移动到${comboTrackTypeLabels[type]}轨道。`);
      return;
    }
    if (lockedTrackClipIds.includes(clipKey)) {
      setComboNotice('该片段已锁定，解锁后才能移动。');
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const droppedSeconds = Math.max(0, (event.clientX - rect.left) / trackZoom);
    const nextSeconds = timelineSnapEnabled ? Math.round(droppedSeconds * 2) / 2 : droppedSeconds;
    const resolvedTrackId = targetTrackId || sourceTrackId || timelineTracks.find((track) => track.type === type)?.id || createTimelineTrackId(type, timelineTracks);
    const placement = canPlaceClipOnTrack(type, resolvedTrackId, option, nextSeconds, clipKey);
    if (!placement.ok) {
      setComboNotice(placement.message);
      return;
    }
    setTrackClipOffsets((offsets) => ({ ...offsets, [clipKey]: nextSeconds }));
    setTimelineTracks((tracks) => tracks.some((track) => track.id === resolvedTrackId) ? tracks : [...tracks, { id: resolvedTrackId, type }]);
    setTimelineClips((clips) => clips.map((clip) => clip.optionId === option.id && clip.trackType === sourceType ? { ...clip, trackId: resolvedTrackId, trackType: type, start: nextSeconds } : clip));
    setSelectedTrackOptionId(option.id);
    setSelectedTimelineLayerType(type);
    setComboCurrentTime(nextSeconds);
    setComboNotice(`已移动片段到 ${formatTimelineTick(nextSeconds)}。`);
  }

  function duplicateSelectedTrackClip() {
    if (!selectedTrackOption) return;
    const key = trackClipKey('main', selectedTrackOption.id);
    const offset = trackClipOffsets[key] ?? 0;
    setTrackClipOffsets((offsets) => ({ ...offsets, [key]: offset + 1 }));
    setComboNotice(`已复制并错开“${selectedTrackOption.clipName}”。`);
  }

  function toggleSelectedTrackLock() {
    if (!selectedTrackOption) return;
    const key = trackClipKey('main', selectedTrackOption.id);
    setLockedTrackClipIds((ids) => (ids.includes(key) ? ids.filter((id) => id !== key) : [...ids, key]));
    setComboNotice(lockedTrackClipIds.includes(key) ? '已解锁当前片段。' : '已锁定当前片段。');
  }

  function toggleStyle(list: string[], id: string, setter: (items: string[]) => void) {
    setter(list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);
  }

  function recognizeSubtitles() {
    const sourceOptions = currentTimelineOptions.length > 0 ? currentTimelineOptions : activeOption ? [activeOption] : selectedSceneOptions;
    const items = sourceOptions.map((option, index) => ({
      id: `subtitle-${option.id}-${index}`,
      sourceOptionId: option.id,
      text: `${index + 1}. ${option.sceneName}：${option.clipName}`,
      enabled: true
    }));
    setSubtitleItems(items);
    addTimelineTrack('subtitle');
    setComboNotice(`已识别 ${items.length} 条字幕片段，字幕已显示在播放区和字幕轨。`);
  }

  function renderEmptyTrackHint(type: ComboTimelineTrackType) {
    return (
      <div className="combo-track-empty-inline">
        <span>{comboTrackEmptyHints[type]}</span>
      </div>
    );
  }

  function renderComboTrackLane(track: ComboTrackDef) {
    const type = track.type;
    const laneClips = currentTimelineClips.filter((clip) => clip.trackId === track.id && clip.trackType === type);
    if (type === 'main') {
      return (
        <div
          className="combo-track-row combo-main-track"
          key={track.id}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
          }}
          onDrop={(event) => moveTrackClipFromDrop(event, 'main', track.id)}
        >
          {laneClips.length === 0 ? renderEmptyTrackHint(type) : laneClips.map((clip, index) => {
            const option = clip.option;
            const clipKey = trackClipKey('main', option.id);
            const left = clip.start * trackZoom;
            const duration = getTrackClipDuration('main', option);
            const width = Math.max(120, duration * trackZoom);
            return (
              <button
                className={clsx(selectedTrackOption?.id === option.id && 'selected', lockedTrackClipIds.includes(clipKey) && 'locked')}
                type="button"
                draggable
                key={option.id}
                style={{ left: `${left}px`, width: `${width}px` }}
                onDragStart={(event) => beginTrackClipDrag(event, 'main', option)}
                onContextMenu={(event) => openTrackContextMenu(event, 'main', option)}
                onClick={() => {
                  setSelectedTrackOptionId(option.id);
                  setSelectedTimelineLayerType('main');
                  setSelectedVideoId(option.id);
                  setComboCurrentTime(clip.start);
                }}
              >
                <header>
                  <span>{option.clipName}</span>
                  <em>{formatTimelineTick(duration)}</em>
                </header>
                <div className="combo-video-filmstrip">
                  {Array.from({ length: 8 }, (_, frameIndex) => (
                    thumbUrls[option.id] ? (
                      <video src={toMediaUrl(thumbUrls[option.id])} muted preload="metadata" key={frameIndex} />
                    ) : (
                      <i key={frameIndex} />
                    )
                  ))}
                </div>
                <footer>{option.sceneName}</footer>
              </button>
            );
          })}
        </div>
      );
    }

    if (type === 'subtitle') {
      return (
        <div className="combo-track-row combo-subtitle-track" key={track.id} onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
        }} onDrop={(event) => moveTrackClipFromDrop(event, 'subtitle', track.id)}>
          {subtitleSegments.length === 0 ? renderEmptyTrackHint(type) : subtitleSegments.filter((segment) => segment.enabled).map((segment) => (
            <button
              type="button"
              draggable
              key={segment.id}
              style={{ left: `${segment.start * trackZoom}px`, width: `${Math.max(108, segment.duration * trackZoom)}px` }}
              onDragStart={(event) => beginTrackClipDrag(event, 'subtitle', segment.option)}
              onContextMenu={(event) => openTrackContextMenu(event, 'subtitle', segment.option)}
              onClick={() => {
                setSelectedTrackOptionId(segment.option.id);
                setSelectedTimelineLayerType('subtitle');
                setComboCurrentTime(segment.start);
                setActiveToolTab('basic');
              }}
            >
              <Type size={12} />
              <span>{segment.text}</span>
            </button>
          ))}
        </div>
      );
    }

    if (type === 'sticker') {
      return (
        <div className="combo-track-row combo-sticker-track" key={track.id} onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
        }} onDrop={(event) => moveTrackClipFromDrop(event, 'sticker', track.id)}>
          {selectedDecorIds.length === 0 ? renderEmptyTrackHint(type) : selectedDecorIds.map((id, index) => {
            const decor = comboDecorations.find((item) => item.id === id);
            return (
              <button
                type="button"
                key={`sticker-${id}`}
                style={{ left: `${(index * 4.6 + 0.4) * trackZoom}px`, width: `${Math.max(104, getTrackClipDuration('sticker') * trackZoom)}px` }}
                onClick={() => {
                  setSelectedTimelineLayerType('sticker');
                  setActiveToolTab('decor');
                  setComboNotice(`已选中贴纸层：${decor?.name || '贴纸'}`);
                }}
              >
                <Sticker size={12} />
                <span>{decor?.name || '贴纸'}</span>
              </button>
            );
          })}
        </div>
      );
    }

    if (type === 'audio') {
      return (
        <div className="combo-track-row combo-audio-track" key={track.id} onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
        }} onDrop={(event) => moveTrackClipFromDrop(event, 'audio', track.id)}>
          {laneClips.length === 0 ? renderEmptyTrackHint(type) : laneClips.map((clip, index) => {
            const option = clip.option;
            return (
            <button
              type="button"
              draggable
              key={`audio-${option.id}`}
              style={{ left: `${clip.start * trackZoom}px`, width: `${Math.max(128, getTrackClipDuration('main', option) * trackZoom)}px` }}
              onDragStart={(event) => beginTrackClipDrag(event, 'audio', option)}
              onContextMenu={(event) => openTrackContextMenu(event, 'audio', option)}
              onClick={() => {
                setSelectedTrackOptionId(option.id);
                setSelectedTimelineLayerType('audio');
                setActiveToolTab('basic');
              }}
            >
              <Volume2 size={12} />
              <div className="combo-audio-waveform">
                {Array.from({ length: 24 }, (_, waveIndex) => (
                  <i style={{ height: `${8 + ((waveIndex * 7 + index * 5) % 18)}px` }} key={waveIndex} />
                ))}
              </div>
              <span>{option.audioName || option.videoName}</span>
            </button>
          )})}
        </div>
      );
    }

    const effects = buildTimelineEffects(selectedFilterIds, selectedWordArtIds);
    return (
      <div className="combo-track-row combo-effect-track" key={track.id} onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }} onDrop={(event) => moveTrackClipFromDrop(event, 'effect', track.id)}>
        {effects.length === 0 ? renderEmptyTrackHint(type) : effects.map((effect, index) => (
          <button
            type="button"
            key={effect.id}
            style={{ left: `${(index * 7.2 + 0.8) * trackZoom}px`, width: `${Math.max(120, getTrackClipDuration('effect') * trackZoom)}px` }}
            onClick={() => {
              setSelectedTimelineLayerType('effect');
              setActiveToolTab(effect.kind);
              setComboNotice(`已选中特效层：${effect.name}`);
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              setComboNotice(`特效层“${effect.name}”可在右侧${comboTrackTypeLabels.effect}面板调整。`);
            }}
          >
            <Sparkles size={12} />
            <span>{effect.name}</span>
          </button>
        ))}
      </div>
    );
  }

  function generateOptimizedCombinations() {
    if (sceneBuckets.length === 0) return;
    const combinations = buildOptimizedCombinations(sceneBuckets, selectedOptionIds).slice(0, 20);
    setOptimizedCombinations(combinations);
    setComboNotice(`已根据 ${sceneBuckets.length} 个分镜生成 ${combinations.length} 个组合，可继续做字幕、滤镜、装饰和花字统一管理。`);
  }

  return (
    <div className="combo-optimize-workspace">
      <section className="combo-library-panel">
        <header className="combo-panel-header">
          <div>
            <strong>组合素材</strong>
            <span>{selectedGroup ? `${selectedGroup.draftName} · ${flatOptions.length} 个镜头` : '等待成片入库'}</span>
          </div>
          <button type="button" onClick={generateOptimizedCombinations} disabled={sceneBuckets.length === 0}>多选</button>
        </header>
        <div className="combo-filter-row">
          <select value={selectedGroup?.id || ''} onChange={(event) => setSelectedGroupId(event.target.value)} disabled={libraryGroups.length === 0}>
            {libraryGroups.length === 0 ? <option value="">暂无成片组</option> : null}
            {libraryGroups.map((group) => (
              <option value={group.id} key={group.id}>{group.draftName}</option>
            ))}
          </select>
          <select defaultValue="all">
            <option value="all">全部脚本</option>
          </select>
          <select defaultValue="all">
            <option value="all">全部音频</option>
          </select>
          <select defaultValue="all">
            <option value="all">全部</option>
          </select>
        </div>
        {sceneBuckets.length === 0 ? (
          <div className="combo-empty-state">
            <Shuffle size={24} />
            <strong>还没有可组合的分镜镜头</strong>
            <span>先在极速裂变里保存成片到成片库，再回到这里做镜头级组合优化。</span>
          </div>
        ) : (
          <div className="combo-material-browser">
            <div className="combo-material-grid">
              {flatOptions.map((option, index) => (
                <article
                  className={clsx(selectedOptionIds[option.sceneId] === option.id && 'selected', selectedVideoId === option.id && 'previewing')}
                  key={option.id}
                  draggable
                  role="button"
                  tabIndex={0}
                  onClick={() => selectComboOption(option)}
                  onDoubleClick={() => loadOptionToTimeline(option)}
                  onDragStart={(event) => {
                    event.dataTransfer.setData('application/x-combo-option-id', option.id);
                    event.dataTransfer.setData('application/x-combo-track-type', 'main');
                    event.dataTransfer.effectAllowed = 'copy';
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void previewOption(option);
                    if (event.key === ' ') {
                      event.preventDefault();
                      selectComboOption(option);
                    }
                  }}
                >
                  <span>{index + 1}</span>
                  {selectedVideoId === option.id ? <em>预览中</em> : null}
                  <div className="combo-thumb">
                    {thumbUrls[option.id] ? <video src={toMediaUrl(thumbUrls[option.id])} muted preload="metadata" /> : null}
                  </div>
                  <strong>
                    <Film size={12} />
                    <span>{option.clipName}</span>
                  </strong>
                  <small>{option.sceneName}</small>
                  <button
                    className="combo-material-load"
                    type="button"
                    title="加载到主轨"
                    onClick={(event) => {
                      event.stopPropagation();
                      loadOptionToTimeline(option);
                    }}
                  >
                    加载
                  </button>
                </article>
              ))}
            </div>
            <footer className="combo-material-pagination">
              <span>共 {flatOptions.length}</span>
              <select defaultValue="20">
                <option value="20">20条/页</option>
                <option value="40">40条/页</option>
              </select>
              <button type="button" className="active">1</button>
              <button type="button">2</button>
              <button type="button">3</button>
              <button type="button">4</button>
              <button type="button">5</button>
              <button type="button">前往</button>
            </footer>
          </div>
        )}
      </section>

      <section className={`combo-preview-panel preview-panel ${activePreviewUrl ? `ratio-${comboAspectRatio.replace(':', '-')}` : 'ratio-empty'}`} ref={comboPanelRef}>
        <div className="preview-header">
          <strong>播放器</strong>
          <div className="combo-preview-header-actions">
            <button className="icon-button" type="button" title="播放器菜单" onClick={() => setComboNotice('播放器菜单：可切换原画、适配、比例和全屏。')}>
              <Menu size={15} />
            </button>
            {activePreviewUrl ? (
              <button className="icon-button" type="button" title="预览当前镜头" onClick={() => activeOption && void previewOption(activeOption)} disabled={!activeOption}>
                <Maximize2 size={15} />
              </button>
            ) : null}
          </div>
        </div>
        <div className="combo-preview-stage video-stage">
          <div className="combo-preview-canvas preview-canvas-box">
            {activeOption && activePreviewUrl ? (
              <video
                ref={comboVideoRef}
                className={`preview-video fit-${comboFitMode} ${activeToolTab === 'basic' && basicTargetType === 'main' ? 'basic-editing' : ''}`}
                src={toMediaUrl(activePreviewUrl)}
                controls={false}
                muted
                preload="metadata"
                style={{
                  filter: basicVideoFilter,
                  transform: basicTargetType === 'main' ? basicLayerTransform : undefined,
                  transformOrigin: 'center',
                  objectPosition: basicTargetType === 'main' ? basicAlignPosition[subtitleBasicSettings.align] : undefined,
                  mixBlendMode: basicTargetType === 'main' && !subtitleBasicSettings.blend ? 'screen' : 'normal'
                }}
                onTimeUpdate={(event) => setComboCurrentTime(event.currentTarget.currentTime)}
                onPlay={() => setComboIsPlaying(true)}
                onPause={() => setComboIsPlaying(false)}
                onEnded={() => setComboIsPlaying(false)}
              />
            ) : (
              <div className="combo-preview-placeholder">
                <span>预览区</span>
              </div>
            )}
            {activeSubtitleSegments.length > 0 ? (
              <div
                className={`combo-preview-subtitle-layer align-${subtitleBasicSettings.align} ${activeToolTab === 'basic' && basicTargetType === 'subtitle' ? 'basic-editing' : ''}`}
                style={{
                  transform: basicTargetType === 'subtitle' ? basicLayerTransform : undefined,
                  transformOrigin: 'center',
                  mixBlendMode: basicTargetType === 'subtitle' && !subtitleBasicSettings.blend ? 'screen' : 'normal'
                }}
              >
                {activeSubtitleSegments.map((segment) => (
                  <span key={segment.id}>{segment.text.replace(/^\d+\.\s*/, '')}</span>
                ))}
              </div>
            ) : null}
            {selectedWordArtIds.length > 0 ? (
              <div className="combo-preview-wordart-layer">
                {selectedWordArtIds.slice(0, 2).map((id) => (
                  <strong className={`wordart-${id}`} key={id}>{comboWordArts.find((item) => item.id === id)?.name || '花字'}</strong>
                ))}
              </div>
            ) : null}
            {selectedDecorIds.length > 0 ? (
              <div className="combo-preview-decor-layer">
                {selectedDecorIds.slice(0, 3).map((id) => (
                  <span key={id}>{comboDecorations.find((item) => item.id === id)?.name || '装饰'}</span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className="player-controls combo-player-controls">
          <div className="player-meta">
            <span className="timecode current">{formatTime(comboCurrentTime)}</span>
            <span className="timecode total">{formatTime(comboDurationSeconds)}</span>
            <button className="meter-button" type="button" title={comboIsMuted ? '取消静音' : '静音'} onClick={toggleComboMute} disabled={!activePreviewUrl}>
              {comboIsMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              <span />
              <span />
              <span />
            </button>
          </div>
          <div className="player-transport">
            <button className="player-ghost-button" type="button" title="快退 5 秒" onClick={() => seekComboPreview(-5)} disabled={!activePreviewUrl}>
              <Rewind size={15} />
            </button>
            <button className="play-button capcut-play" type="button" title={comboIsPlaying ? '暂停' : '播放'} onClick={toggleComboPlay} disabled={!activePreviewUrl}>
              {comboIsPlaying ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <button className="player-ghost-button" type="button" title="快进 5 秒" onClick={() => seekComboPreview(5)} disabled={!activePreviewUrl}>
              <FastForward size={15} />
            </button>
          </div>
          <div className="player-view-actions">
            <label className="quality-select capcut-quality" title="清晰度">
              <select value={comboQuality} onChange={(event) => setComboQuality(event.target.value)} disabled={!activePreviewUrl}>
                <option value="480p">480P</option>
                <option value="720p">720P</option>
                <option value="1080p">1080P</option>
              </select>
            </label>
            <button className="player-text-button" type="button" title={comboFitMode === 'contain' ? '填充预览' : '适配预览'} onClick={() => setComboFitMode((mode) => (mode === 'contain' ? 'cover' : 'contain'))} disabled={!activePreviewUrl}>
              <ScanLine size={15} />
            </button>
            <button className="player-text-button ratio-button" type="button" title="切换画布比例" onClick={cycleComboAspectRatio} disabled={!activePreviewUrl}>
              {comboAspectRatio}
            </button>
            <button className="player-text-button" type="button" title="全屏预览" onClick={toggleComboFullscreen}>
              <Maximize2 size={16} />
            </button>
          </div>
        </div>
      </section>

      <section className="combo-track-panel">
          <div className="combo-timeline-toolbar">
            <div className="combo-timeline-tools">
              <button className="active" type="button" title="选择片段">
                <MousePointer2 size={15} />
              </button>
              <button type="button" title="撤销" onClick={() => setComboNotice('已撤销上一步组合操作。')}>
                <Undo2 size={15} />
              </button>
              <button type="button" title="重做" onClick={() => setComboNotice('已恢复上一步组合操作。')}>
                <ChevronRight size={15} />
              </button>
              <span />
              <button type="button" title="分割片段" onClick={() => setComboNotice(selectedTrackOption ? `已在播放头处分割 ${selectedTrackOption.clipName}。` : '请先选择轨道片段。')}>
                <Scissors size={15} />
              </button>
              <button type="button" title="区间裁剪" onClick={() => setComboNotice(selectedTrackOption ? `已打开 ${selectedTrackOption.clipName} 的裁剪区间。` : '请先选择轨道片段。')}>
                <Crop size={15} />
              </button>
              <button type="button" title="新增封面/图片层" onClick={() => setComboNotice('已添加图片层轨道占位。')}>
                <ImagePlus size={15} />
              </button>
              <button type="button" title="复制片段" onClick={duplicateSelectedTrackClip} disabled={!selectedTrackOption}>
                <Copy size={15} />
              </button>
              <button type="button" title="删除片段" onClick={deleteSelectedTrackClip} disabled={!selectedTrackOption}>
                <Trash2 size={15} />
              </button>
              <button type="button" title="锁定/解锁片段" onClick={toggleSelectedTrackLock} disabled={!selectedTrackOption}>
                <Shield size={15} />
              </button>
              <select defaultValue="" title="添加轨道类型" onChange={(event) => {
                const value = event.target.value as ComboTimelineTrackType;
                if (value) addTimelineTrack(value);
                event.target.value = '';
              }}>
                <option value="">添加轨道</option>
                <option value="main">主轨</option>
                <option value="sticker">贴纸轨</option>
                <option value="subtitle">字幕轨</option>
                <option value="audio">音频轨</option>
                <option value="effect">特效轨</option>
              </select>
            </div>
            <span>{loadedTimelineVideo ? `当前轨道：${loadedTimelineVideo.videoName}` : '轨道为空：拖入素材或点击素材“加载”'}</span>
            <div className="combo-timeline-actions">
              <button type="button" title="录音标记" onClick={() => setComboNotice('已在当前播放头添加录音标记。')}>
                <Mic size={15} />
              </button>
              <button className={clsx(timelineSnapEnabled && 'active')} type="button" title="吸附" onClick={() => setTimelineSnapEnabled((enabled) => !enabled)}>
                <ScanLine size={15} />
              </button>
              <button className={clsx(timelineLinked && 'active')} type="button" title="联动" onClick={() => setTimelineLinked((linked) => !linked)}>
                <Link size={15} />
              </button>
              <button type="button" title="缩小轨道" onClick={() => setTrackZoom((zoom) => Math.max(42, zoom - 8))}>
                <ChevronLeft size={15} />
              </button>
              <input type="range" min={42} max={110} value={trackZoom} onChange={(event) => setTrackZoom(Number(event.target.value))} />
              <button type="button" title="放大轨道" onClick={() => setTrackZoom((zoom) => Math.min(110, zoom + 8))}>
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
          <div className="combo-timeline-ruler" style={{ '--combo-second-width': `${trackZoom}px` } as CSSProperties}>
            <div className="combo-timeline-label-spacer" />
            <div className="combo-ruler-scale" onMouseDown={beginComboRulerDrag} onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const ratio = (event.clientX - rect.left) / Math.max(1, rect.width);
              jumpComboTimeline(comboDurationSeconds * ratio);
            }}>
              {Array.from({ length: Math.max(1, Math.ceil(comboDurationSeconds)) + 1 }, (_, index) => (
                <span
                  className={clsx(index === 0 && 'origin-tick', index % 5 === 0 ? 'major-tick' : 'minor-tick')}
                  style={{ left: `${index * trackZoom}px` }}
                  key={index}
                >
                  {index % 5 === 0 ? formatTimelineTick(index) : ''}
                </span>
              ))}
            </div>
          </div>
          <div
            className={clsx(
              'combo-timeline-body',
              isDraggingComboPlayhead && 'dragging-playhead',
              currentTimelineClips.length === 0 && 'empty',
              orderedVisibleTracks.length === 1 && 'single-main',
              orderedVisibleTracks.length > 4 && 'pin-main-track',
              orderedVisibleTracks.some((track) => track.type === 'audio') && 'has-audio-track',
              orderedVisibleTracks.some((track) => track.type === 'main') && 'has-main-track'
            )}
            style={{ '--combo-second-width': `${trackZoom}px`, '--combo-track-count': orderedVisibleTracks.length } as CSSProperties}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'copy';
            }}
            onDrop={(event) => {
              moveTrackClipFromDrop(event);
            }}
            onMouseDown={beginComboPlayheadDrag}
          >
            <div className="combo-track-lanes">
              <button
                className="combo-playhead"
                type="button"
                title="拖动播放头"
                style={{ left: `calc(${COMBO_TIMELINE_LABEL_WIDTH + COMBO_TIMELINE_ZERO_OFFSET}px + ${Math.min(comboDurationSeconds, comboCurrentTime) * trackZoom}px)` }}
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  const dragSurface = event.currentTarget.closest('.combo-timeline-body') as HTMLElement | null;
                  if (dragSurface) beginComboPlayheadDrag(event, dragSurface);
                }}
              />
              {currentTimelineClips.length === 0 ? (
                <div className="combo-track-pair track-main empty-main-track">
                  <div className="combo-track-label-row track-main empty-main-label">
                    <span>主轨</span>
                  </div>
                  <div
                    className="combo-track-row combo-main-track combo-main-track-empty-state"
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'copy';
                    }}
                    onDrop={(event) => moveTrackClipFromDrop(event, 'main', 'main-1')}
                  >
                    <div className="combo-empty-timeline-drop">
                      <span />
                      <strong>素材拖拽到这里，开始你的大作吧~</strong>
                    </div>
                  </div>
                </div>
              ) : orderedVisibleTracks.map((track) => (
                <div className={`combo-track-pair track-${track.type}`} key={track.id}>
                  <div className={`combo-track-label-row track-${track.type}`}>
                    <span>{formatComboTrackLabel(track, orderedVisibleTracks)}</span>
                    <button type="button" title="锁定轨道" onClick={() => setComboNotice(`${comboTrackTypeLabels[track.type]}轨道已锁定/解锁。`)}>
                      <Lock size={12} />
                    </button>
                    <button type="button" title="显示/隐藏轨道" onClick={() => setComboNotice(`${comboTrackTypeLabels[track.type]}轨道已显示/隐藏。`)}>
                      {track.type === 'audio' ? <Volume2 size={12} /> : <Eye size={12} />}
                    </button>
                    {track.type === 'main' ? (
                      <button className="cover-track-button" type="button" onClick={() => setCoverDialogOpen(true)}>封面</button>
                    ) : null}
                    <button type="button" title="更多轨道操作" onClick={() => setComboNotice(`${comboTrackTypeLabels[track.type]}轨道更多操作。`)}>...</button>
                  </div>
                  {renderComboTrackLane(track)}
                </div>
              ))}
            </div>
          </div>
          {trackContextMenu ? (
            <div
              className="combo-track-context-menu"
              style={{ left: trackContextMenu.x, top: trackContextMenu.y }}
              onMouseLeave={() => undefined}
            >
              <button className="danger" type="button" onClick={() => handleTrackContextAction('delete')}>
                <Trash2 size={14} />
                <span>删除片段</span>
              </button>
              <button type="button" onClick={() => handleTrackContextAction('split')}>
                <Scissors size={14} />
                <span>在播放头分割</span>
              </button>
              <button type="button" onClick={() => handleTrackContextAction('cover')}>
                <ImagePlus size={14} />
                <span>设为封面</span>
              </button>
            </div>
          ) : null}
      </section>

      <section className="combo-tools-panel">
        <header>
          <strong>组合编辑</strong>
          <span>已选 {selectedSceneOptions.length} 个分镜</span>
        </header>
        <div className="combo-tool-tabs">
          <button className={clsx(activeToolTab === 'subtitle' && 'active')} type="button" onClick={() => setActiveToolTab('subtitle')}>
            <Type size={15} />
            <span>字幕</span>
          </button>
          <button className={clsx(activeToolTab === 'basic' && 'active')} type="button" onClick={() => setActiveToolTab('basic')}>
            <SlidersHorizontal size={15} />
            <span>基础</span>
          </button>
          <button className={clsx(activeToolTab === 'filter' && 'active')} type="button" onClick={() => setActiveToolTab('filter')}>
            <SlidersHorizontal size={15} />
            <span>滤镜</span>
          </button>
          <button className={clsx(activeToolTab === 'decor' && 'active')} type="button" onClick={() => setActiveToolTab('decor')}>
            <Sticker size={15} />
            <span>装饰层</span>
          </button>
          <button className={clsx(activeToolTab === 'wordArt' && 'active')} type="button" onClick={() => setActiveToolTab('wordArt')}>
            <Sparkles size={15} />
            <span>花字</span>
          </button>
        </div>
        {activeToolTab === 'basic' ? (
          <div className="combo-tool-body">
            <div className="combo-inspector-tabs">
              {comboInspectorTabs.map((tab) => (
                <button className={clsx(subtitleInspectorTab === tab.id && 'active')} type="button" key={tab.id} onClick={() => setSubtitleInspectorTab(tab.id)}>
                  {tab.label}
                </button>
              ))}
            </div>
            {subtitleInspectorTab === 'basic' ? (
              <section className="combo-basic-inspector">
                <header>
                  <div>
                    <strong>位置大小</strong>
                    <span>当前作用：{basicTargetLabel}</span>
                  </div>
                  <button
                    type="button"
                    title="重置基础参数"
                    onClick={() => setSubtitleBasicSettings((settings) => ({ ...settings, scale: 100, x: 0, y: 0, rotation: 0, align: 'center', blend: true, antiShake: false, superQuality: false }))}
                  >
                    <RotateCcw size={14} />
                  </button>
                </header>
                <div className="combo-basic-target-row">
                  <button className={clsx(basicTargetType === 'main' && 'active')} type="button" onClick={() => setSelectedTimelineLayerType('main')}>
                    主视频
                  </button>
                  <button className={clsx(basicTargetType === 'subtitle' && 'active')} type="button" disabled={subtitleItems.length === 0} onClick={() => setSelectedTimelineLayerType('subtitle')}>
                    字幕层
                  </button>
                </div>
                <label className="combo-slider-row">
                  <span>缩放</span>
                  <input type="range" min={30} max={200} value={subtitleBasicSettings.scale} onChange={(event) => setSubtitleBasicSettings((settings) => ({ ...settings, scale: Number(event.target.value) }))} />
                  <strong>{subtitleBasicSettings.scale}%</strong>
                </label>
                <label className="switch-row">
                  <span>等比缩放</span>
                  <input type="checkbox" checked={subtitleBasicSettings.keepRatio} onChange={(event) => setSubtitleBasicSettings((settings) => ({ ...settings, keepRatio: event.target.checked }))} />
                </label>
                <div className="combo-position-grid">
                  <label><span>位置</span><input type="number" value={subtitleBasicSettings.x} onChange={(event) => setSubtitleBasicSettings((settings) => ({ ...settings, x: Number(event.target.value) || 0 }))} /></label>
                  <label><span>&nbsp;</span><input type="number" value={subtitleBasicSettings.y} onChange={(event) => setSubtitleBasicSettings((settings) => ({ ...settings, y: Number(event.target.value) || 0 }))} /></label>
                </div>
                <label className="combo-slider-row">
                  <span>旋转</span>
                  <input type="range" min={-180} max={180} value={subtitleBasicSettings.rotation} onChange={(event) => setSubtitleBasicSettings((settings) => ({ ...settings, rotation: Number(event.target.value) || 0 }))} />
                  <strong>{subtitleBasicSettings.rotation}°</strong>
                </label>
                <div className="combo-align-row">
                  {['left', 'center', 'right', 'top', 'bottom'].map((align) => (
                    <button className={clsx(subtitleBasicSettings.align === align && 'active')} type="button" key={align} onClick={() => setSubtitleBasicSettings((settings) => ({ ...settings, align }))}>
                      {align === 'left' ? '左' : align === 'center' ? '中' : align === 'right' ? '右' : align === 'top' ? '上' : '下'}
                    </button>
                  ))}
                </div>
                <section className="combo-basic-group">
                  <strong>混合</strong>
                  <label className="switch-row">
                    <span>混合</span>
                    <input type="checkbox" checked={subtitleBasicSettings.blend} onChange={(event) => setSubtitleBasicSettings((settings) => ({ ...settings, blend: event.target.checked }))} />
                  </label>
                </section>
                <section className="combo-basic-group">
                  <strong>视频防抖</strong>
                  <label className="switch-row">
                    <span>视频防抖</span>
                    <input type="checkbox" checked={subtitleBasicSettings.antiShake} onChange={(event) => setSubtitleBasicSettings((settings) => ({ ...settings, antiShake: event.target.checked }))} />
                  </label>
                </section>
                <section className="combo-basic-group">
                  <strong>画质增强</strong>
                  <label className="switch-row">
                    <span>超清画质</span>
                    <input type="checkbox" checked={subtitleBasicSettings.superQuality} onChange={(event) => setSubtitleBasicSettings((settings) => ({ ...settings, superQuality: event.target.checked }))} />
                  </label>
                </section>
              </section>
            ) : (
              <section className="combo-basic-placeholder">
                <strong>{comboInspectorTabs.find((tab) => tab.id === subtitleInspectorTab)?.label}</strong>
                <span>已接入当前播放区。启用后会同步到预览画面和轨道层。</span>
                <button type="button" onClick={() => {
                  if (subtitleInspectorTab === 'mask') {
                    setSubtitleBasicSettings((settings) => ({ ...settings, scale: 92, blend: true }));
                    setComboNotice('已应用智能抠像预览，播放区会收紧主体画面。');
                  } else if (subtitleInspectorTab === 'beauty') {
                    setSubtitleBasicSettings((settings) => ({ ...settings, superQuality: true }));
                    setComboNotice('已应用美版增强，播放区画质增强已生效。');
                  } else {
                    setSubtitleBasicSettings((settings) => ({ ...settings, antiShake: true, superQuality: true }));
                    setComboNotice('已应用美颜美体基础增强，播放区已显示效果。');
                  }
                }}>应用到预览</button>
              </section>
            )}
          </div>
        ) : activeToolTab === 'subtitle' ? (
          <div className="combo-tool-body">
            {subtitleItems.length === 0 ? (
              <section className="combo-recognition-card">
                <Type size={38} />
                <strong>已选 {loadedTimelineVideo ? 1 : 0} 个视频组合</strong>
                <span>将识别组合中的人物声音并生成字幕文本</span>
                <label>
                  音频识别
                  <select defaultValue="smart">
                    <option value="smart">智能识别</option>
                    <option value="mandarin">普通话</option>
                    <option value="cantonese">粤语</option>
                  </select>
                </label>
                <button className="primary-action" type="button" onClick={recognizeSubtitles}>开始识别</button>
              </section>
            ) : (
              <>
            <div className="combo-panel-tip">
              <span>字幕文本检查，修改后将复用于所有含该字幕的组合</span>
              <button type="button" onClick={() => {
                const targetOption = selectedTrackOption || currentTimelineOptions[currentTimelineOptions.length - 1];
                if (!targetOption) {
                  setComboNotice('请先加载视频到主轨，再新增字幕。');
                  return;
                }
                setSubtitleItems((items) => [...items, {
                  id: crypto.randomUUID(),
                  sourceOptionId: targetOption.id,
                  text: `新增字幕_${items.length + 1}`,
                  enabled: true
                }]);
              }}>新增字幕</button>
            </div>
            <div className="combo-subtitle-list">
              {subtitleItems.map((item, index) => (
                <label key={item.id}>
                  <input
                    type="checkbox"
                    checked={item.enabled}
                    onChange={(event) => {
                      setSubtitleItems((items) => items.map((currentItem) => currentItem.id === item.id ? { ...currentItem, enabled: event.target.checked } : currentItem));
                    }}
                  />
                  <input value={item.text} onChange={(event) => {
                    setSubtitleItems((items) => items.map((currentItem) => currentItem.id === item.id ? { ...currentItem, text: event.target.value } : currentItem));
                  }} />
                </label>
              ))}
            </div>
            <div className="combo-tool-actions">
              <button type="button" onClick={() => setComboNotice('已复用当前字幕样式到全部组合。')}>复用样式</button>
              <button type="button" onClick={() => setComboNotice('已复制当前字幕文本。')}>复制字幕</button>
              <button type="button" onClick={() => setSubtitleItems([])}>删除字幕</button>
            </div>
              </>
            )}
          </div>
        ) : activeToolTab === 'filter' ? (
          <div className="combo-tool-body">
            <p>滤镜库</p>
            <div className="combo-filter-grid">
              {comboFilters.map((item) => (
                <button className={clsx(selectedFilterIds.includes(item.id) && 'active')} type="button" key={item.id} onClick={() => {
                  toggleStyle(selectedFilterIds, item.id, setSelectedFilterIds);
                  addTimelineTrack('effect');
                  setComboNotice(`滤镜“${item.name}”已应用到播放区，并显示在特效轨。`);
                }}>
                  <span style={{ background: item.color }} />
                  <strong>{item.name}</strong>
                </button>
              ))}
            </div>
          </div>
        ) : activeToolTab === 'decor' ? (
          <div className="combo-tool-body">
            <p>装饰层</p>
            <div className="combo-style-list">
              {comboDecorations.map((item) => (
                <label key={item.id}>
                  <input type="checkbox" checked={selectedDecorIds.includes(item.id)} onChange={() => {
                    toggleStyle(selectedDecorIds, item.id, setSelectedDecorIds);
                    addTimelineTrack('sticker');
                    setComboNotice(`装饰层“${item.name}”已显示在播放区和贴纸轨。`);
                  }} />
                  <span>{item.name}</span>
                </label>
              ))}
            </div>
          </div>
        ) : (
          <div className="combo-tool-body">
            <div className="combo-wordart-mode">
              <label><input type="radio" name="wordart-mode" defaultChecked /> 多行花字</label>
              <label><input type="radio" name="wordart-mode" /> 装饰图</label>
              <label><input type="radio" name="wordart-mode" /> PSD</label>
              <label><input type="radio" name="wordart-mode" /> 花字</label>
            </div>
            <div className="combo-wordart-editor">
              <header>
                <strong>花字样式1</strong>
                <button type="button" onClick={() => {
                  addTimelineTrack('effect');
                  setComboNotice('已输出花字层到播放区和特效轨。');
                }}>输出组合</button>
              </header>
              <input defaultValue="花字" />
            </div>
            <div className="combo-wordart-grid">
              {comboWordArts.map((item) => (
                <button className={clsx(selectedWordArtIds.includes(item.id) && 'active')} type="button" key={item.id} onClick={() => {
                  toggleStyle(selectedWordArtIds, item.id, setSelectedWordArtIds);
                  addTimelineTrack('effect');
                  setComboNotice(`花字“${item.name}”已显示在播放区和特效轨。`);
                }}>
                  <strong>{item.name}</strong>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="combo-output-panel">
          <button type="button" onClick={generateOptimizedCombinations}>瀑布流合成</button>
        </div>
      {comboNotice ? <div className="script-import-notice">{comboNotice}</div> : null}
      </section>

      {coverDialogOpen ? (
        <div className="script-import-backdrop">
          <section className="combo-cover-dialog">
            <header>
              <strong>封面选择</strong>
              <button type="button" onClick={() => setCoverDialogOpen(false)}>
                <X size={16} />
              </button>
            </header>
            <div className="combo-cover-preview">
              {activePreviewUrl ? (
                <video src={toMediaUrl(activePreviewUrl)} muted preload="metadata" />
              ) : (
                <div>当前没有可用视频帧</div>
              )}
            </div>
            <div className="combo-cover-source-tabs">
              <button className="active" type="button">视频帧</button>
              <button type="button">本地</button>
            </div>
            <div className="combo-cover-strip">
              {Array.from({ length: 14 }, (_, index) => (
                <button type="button" className={index === 4 ? 'active' : undefined} key={index}>
                  {activePreviewUrl ? <video src={toMediaUrl(activePreviewUrl)} muted preload="metadata" /> : null}
                </button>
              ))}
            </div>
            <footer>
              <button type="button" onClick={() => setCoverDialogOpen(false)}>取消</button>
              <button className="primary-action" type="button" onClick={() => {
                setCoverDialogOpen(false);
                setComboNotice(activeOption ? `已将“${activeOption.clipName}”当前帧设为封面。` : '已设置封面。');
              }}>去编辑</button>
            </footer>
          </section>
        </div>
      ) : null}
      {previewVideo ? (
        <div className="script-import-backdrop">
          <section className="media-preview-dialog">
            <header>
              <strong>{previewVideo.name}</strong>
              <button type="button" onClick={() => {
                setPreviewVideo(null);
                setPreviewError('');
              }}>
                <X size={16} />
              </button>
            </header>
            <div className="media-preview-body">
              {previewVideo.path ? (
                <video src={toMediaUrl(previewVideo.path)} controls autoPlay />
              ) : (
                <div className="media-preview-empty">{previewError || '当前镜头没有可播放的视频地址。'}</div>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

const comboFilters = [
  { id: 'soft-light', name: '柔光', color: 'linear-gradient(135deg, #fef3c7, #93c5fd)' },
  { id: 'fresh', name: '清透', color: 'linear-gradient(135deg, #bbf7d0, #67e8f9)' },
  { id: 'film', name: '胶片', color: 'linear-gradient(135deg, #57534e, #f59e0b)' },
  { id: 'product', name: '商品高亮', color: 'linear-gradient(135deg, #f8fafc, #a78bfa)' }
];

const comboDecorations = [
  { id: 'corner-badge', name: '角标卖点' },
  { id: 'progress-bar', name: '顶部进度条' },
  { id: 'product-frame', name: '产品描边框' },
  { id: 'cta-layer', name: '行动指令层' }
];

const comboWordArts = [
  { id: 'title-pop', name: '标题弹出' },
  { id: 'price-flash', name: '价格强调' },
  { id: 'benefit-card', name: '卖点卡片' },
  { id: 'ending-lockup', name: '收尾定版' }
];

const comboInspectorTabs: Array<{ id: ComboInspectorTab; label: string }> = [
  { id: 'basic', label: '基础' },
  { id: 'mask', label: '抠像' },
  { id: 'beauty', label: '美版' },
  { id: 'body', label: '美颜美体' }
];

const comboTrackTypeLabels: Record<ComboTimelineTrackType, string> = {
  main: '视频轨道 1',
  sticker: '贴纸轨道',
  subtitle: '文字轨道',
  audio: '音频轨道 1',
  effect: '特效轨道'
};

const comboTimelineTrackOrder: ComboTimelineTrackType[] = ['sticker', 'subtitle', 'effect', 'main', 'audio'];

const comboTrackEmptyHints: Record<ComboTimelineTrackType, string> = {
  main: '视频素材会默认追加到主轨末尾',
  sticker: '拖入贴纸、表情、图标',
  subtitle: '添加字幕、标题或花字文本',
  effect: '添加滤镜、转场、动态效果',
  audio: '添加背景音乐、音效或原声'
};

function createTimelineTrackId(type: ComboTimelineTrackType, tracks: ComboTrackDef[]) {
  const nextIndex = tracks.filter((track) => track.type === type).length + 1;
  return `${type}-${nextIndex}`;
}

function formatComboTrackLabel(track: ComboTrackDef, tracks: ComboTrackDef[]) {
  const sameTypeTracks = tracks.filter((item) => item.type === track.type);
  const typeIndex = Math.max(0, sameTypeTracks.findIndex((item) => item.id === track.id)) + 1;
  if (track.type === 'main') return `视频轨道 ${typeIndex}`;
  if (track.type === 'audio') return `音频轨道 ${typeIndex}`;
  if (track.type === 'subtitle') return `文字轨道 ${typeIndex}`;
  if (track.type === 'sticker') return `贴纸轨道 ${typeIndex}`;
  return `特效轨道 ${typeIndex}`;
}

function remapSubtitleItems(options: CombinationSceneOption[], items: ComboSubtitleItem[]) {
  const itemGroups = new Map<string, ComboSubtitleItem[]>();
  items.forEach((item) => {
    const currentGroup = itemGroups.get(item.sourceOptionId) || [];
    currentGroup.push(item);
    itemGroups.set(item.sourceOptionId, currentGroup);
  });
  return options.flatMap((option, index) => {
    const matchedItems = itemGroups.get(option.id);
    if (matchedItems?.length) return matchedItems;
    return [{
      id: `subtitle-${option.id}-${index}`,
      sourceOptionId: option.id,
      text: `${index + 1}. ${option.sceneName}：${option.clipName}`,
      enabled: true
    } satisfies ComboSubtitleItem];
  });
}

function buildSubtitleSegments(
  options: CombinationSceneOption[],
  items: ComboSubtitleItem[],
  getTrackClipLeft: (type: ComboTimelineTrackType, option: CombinationSceneOption, index: number) => number,
  getTrackClipDuration: (type: ComboTimelineTrackType, option?: CombinationSceneOption) => number
): ComboSubtitleSegment[] {
  const itemGroups = new Map<string, ComboSubtitleItem[]>();
  items.forEach((item) => {
    const currentGroup = itemGroups.get(item.sourceOptionId) || [];
    currentGroup.push(item);
    itemGroups.set(item.sourceOptionId, currentGroup);
  });
  return options.flatMap((option, index) => {
    const matchedItems = itemGroups.get(option.id) || [];
    if (matchedItems.length === 0) return [];
    const optionStart = getTrackClipLeft('main', option, index);
    const optionDuration = getTrackClipDuration('main', option);
    const segmentDuration = Math.max(0.3, optionDuration / matchedItems.length);
    return matchedItems.map((item, itemIndex) => ({
      ...item,
      option,
      start: optionStart + itemIndex * segmentDuration,
      duration: segmentDuration
    }));
  });
}

function buildTimelineEffects(filterIds: string[], wordArtIds: string[]) {
  const filters = comboFilters
    .filter((item) => filterIds.includes(item.id))
    .map((item) => ({ id: `filter-${item.id}`, name: `滤镜 · ${item.name}`, kind: 'filter' as CombinationOptimizeTab }));
  const wordArts = comboWordArts
    .filter((item) => wordArtIds.includes(item.id))
    .map((item) => ({ id: `word-${item.id}`, name: `花字 · ${item.name}`, kind: 'wordArt' as CombinationOptimizeTab }));
  return [...filters, ...wordArts];
}

function comboPreviewFilter(filterIds: string[]) {
  const filters = [];
  if (filterIds.includes('soft-light')) filters.push('brightness(112%) contrast(106%) saturate(112%)');
  if (filterIds.includes('fresh')) filters.push('brightness(108%) saturate(128%) hue-rotate(5deg)');
  if (filterIds.includes('film')) filters.push('contrast(116%) saturate(82%) sepia(22%)');
  if (filterIds.includes('product')) filters.push('brightness(118%) contrast(112%) saturate(116%)');
  return filters.join(' ');
}

function buildCombinationSceneBuckets(group: FinishedVideoGroup): CombinationSceneBucket[] {
  const bucketMap = new Map<string, CombinationSceneBucket>();

  group.videos.forEach((video) => {
    const details = video.groupDetails?.length
      ? video.groupDetails
      : [{
          groupId: video.id,
          groupName: video.name,
          clipName: video.name,
          audioName: video.batchName,
          coverPath: video.coverPath
        } satisfies GeneratedFissionGroupDetail];

    details.forEach((detail, detailIndex) => {
      const sceneId = detail.groupId || `${video.id}-${detailIndex}`;
      const sceneName = detail.groupName || `分镜 ${detailIndex + 1}`;
      const bucket = bucketMap.get(sceneId) || { id: sceneId, name: sceneName, options: [] };
      bucket.options.push({
        id: `${sceneId}-${video.id}-${detailIndex}`,
        sceneId,
        sceneName,
        videoId: video.id,
        videoName: video.name,
        clipName: detail.clipName || video.name,
        duration: video.duration,
        durationSeconds: parseDurationSeconds(video.duration),
        audioName: detail.audioName,
        coverPath: detail.coverPath || video.coverPath,
        sourcePath: video.path
      });
      bucketMap.set(sceneId, bucket);
    });
  });

  return Array.from(bucketMap.values());
}

function buildOptimizedCombinations(sceneBuckets: CombinationSceneBucket[], selectedOptionIds: Record<string, string>): OptimizedCombination[] {
  if (sceneBuckets.length === 0) return [];
  const maxCount = Math.min(20, Math.max(1, sceneBuckets.reduce((max, scene) => Math.max(max, scene.options.length), 1) * 2));
  return Array.from({ length: maxCount }, (_, comboIndex) => {
    const scenes = sceneBuckets
      .map((scene, sceneIndex) => {
        const preferred = scene.options.find((option) => option.id === selectedOptionIds[scene.id]);
        return scene.options[(comboIndex + sceneIndex) % scene.options.length] || preferred || scene.options[0];
      })
      .filter((option): option is CombinationSceneOption => Boolean(option));
    const score = Math.max(72, 98 - comboIndex * 2 + (comboIndex % 3));
    return {
      id: `combo-${comboIndex}-${scenes.map((scene) => scene.id).join('-')}`,
      label: comboIndex + 1,
      name: `优化组合_${String(comboIndex + 1).padStart(2, '0')}`,
      scenes,
      duration: `${Math.max(18, scenes.length * 4)}s`,
      score,
      state: comboIndex === 0 ? '推荐' : comboIndex < 4 ? '可用' : '待复核'
    };
  });
}

function formatTime(value: number) {
  const totalSeconds = Math.max(0, Math.floor(value));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function formatTimelineTick(value: number) {
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function parseDurationSeconds(duration?: string) {
  if (!duration) return 0;
  const trimmed = duration.trim();
  const rangeStart = trimmed.split(/[-~]/)[0]?.trim() || trimmed;
  const colonParts = rangeStart.split(':').map((part) => Number(part));
  if (colonParts.length === 4 && colonParts.every((part) => Number.isFinite(part))) {
    const [hours, minutes, seconds, frames] = colonParts;
    return hours * 3600 + minutes * 60 + seconds + frames / 25;
  }
  if (colonParts.length === 3 && colonParts.every((part) => Number.isFinite(part))) {
    const [hours, minutes, seconds] = colonParts;
    return hours * 3600 + minutes * 60 + seconds;
  }
  if (colonParts.length === 2 && colonParts.every((part) => Number.isFinite(part))) {
    const [minutes, seconds] = colonParts;
    return minutes * 60 + seconds;
  }
  const numeric = Number.parseFloat(rangeStart.replace(/s$/i, ''));
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatLibraryTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getMonth() + 1}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function MatrixPublishWorkspace() {
  return (
    <div className="workflow-workspace publish-workspace">
      <section className="workflow-hero compact">
        <div>
          <span className="workflow-kicker">矩阵发布</span>
          <h2>从成片库选择视频并分发到账号矩阵</h2>
          <p>承接筷子矩阵管理流程，后续接入账号授权、渠道管理、AI 标题、定时发布和数据回流。</p>
        </div>
        <button className="primary-action" type="button">
          <Upload size={16} />
          <span>创建发布</span>
        </button>
      </section>

      <div className="workflow-grid two-columns">
        <section className="workflow-panel">
          <header>
            <strong>发布渠道</strong>
            <span>账号矩阵</span>
          </header>
          <div className="channel-list">
            {publishChannels.map((channel) => (
              <article key={channel.name}>
                <UserRound size={17} />
                <div>
                  <strong>{channel.name}</strong>
                  <span>{channel.state}</span>
                </div>
                <small>{channel.plan}</small>
              </article>
            ))}
          </div>
        </section>

        <section className="workflow-panel">
          <header>
            <strong>发布设置</strong>
            <span>AI 辅助</span>
          </header>
          <div className="publish-tool-list">
            <button type="button">
              <FileText size={16} />
              <span>AI 标题生成</span>
            </button>
            <button type="button">
              <SlidersHorizontal size={16} />
              <span>渠道参数</span>
            </button>
            <button type="button">
              <Settings size={16} />
              <span>定时发布</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
