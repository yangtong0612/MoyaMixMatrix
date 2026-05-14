import { useEffect, useRef, useState, type CSSProperties, type DragEvent, type MouseEvent } from 'react';
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
import clsx from 'clsx';
import { useEditorStore, type MaterialItem } from './editorStore';
import { MaterialPanel } from './components/MaterialPanel';
import { PreviewPanel } from './components/PreviewPanel';
import { TimelinePanel } from './components/TimelinePanel';
import { InspectorPanel } from './components/InspectorPanel';
import { toMediaUrl } from './mediaUrl';
import { buildAliyunMixRequest, createAliyunOutputMediaUrl, getAliyunMixJobStatus, getAliyunStorageConfig, getProtectedMediaAccessUrl, submitAliyunMix } from './aliyunMix';

export function EditorPage() {
  const editor = useEditorStore();
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

type EditorWorkflow = 'materials' | 'fission' | 'finished' | 'optimize' | 'publish';

const editorWorkflowTabs: Array<{ id: EditorWorkflow; label: string; icon: typeof FolderOpen }> = [
  { id: 'materials', label: '基础素材', icon: FolderOpen },
  { id: 'fission', label: '极速裂变', icon: Sparkles },
  { id: 'finished', label: '成片库', icon: FileText },
  { id: 'optimize', label: '组合优化', icon: Shuffle },
  { id: 'publish', label: '矩阵发布', icon: Share2 }
];

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
  coverPath?: string;
  groupDetails?: GeneratedFissionGroupDetail[];
  jobId?: string;
  jobStatus?: FissionJobStatus;
  jobStatusText?: string;
  jobMessage?: string;
};

interface GeneratedFissionGroupDetail {
  groupId: string;
  groupName: string;
  clipName?: string;
  audioName?: string;
  audioSource?: 'group' | 'global';
  coverPath?: string;
}

type FissionJobStatus = 'preparing' | 'submitted' | 'running' | 'success' | 'failed';

interface FissionWorkspaceDraft {
  groups: FissionShotGroup[];
  audioItems: FissionAudioItem[];
  activeGroupId?: string;
  expandedIds?: string[];
  comboMode?: FissionComboMode;
  generatedVideos?: GeneratedFissionVideo[];
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

function readFissionWorkspaceDraft(value: unknown): FissionWorkspaceDraft | null {
  if (!value || typeof value !== 'object') return null;
  const draft = value as Partial<FissionWorkspaceDraft>;
  return {
    groups: Array.isArray(draft.groups) ? draft.groups : defaultFissionGroups,
    audioItems: Array.isArray(draft.audioItems) ? draft.audioItems : [],
    activeGroupId: typeof draft.activeGroupId === 'string' ? draft.activeGroupId : undefined,
    expandedIds: Array.isArray(draft.expandedIds) ? draft.expandedIds.filter((id): id is string => typeof id === 'string') : undefined,
    comboMode: draft.comboMode === 'single' || draft.comboMode === 'once' || draft.comboMode === 'smart' ? draft.comboMode : undefined,
    generatedVideos: Array.isArray(draft.generatedVideos) ? draft.generatedVideos : undefined,
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
    comboMode: 'single',
    generatedVideos: [],
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
  jobId?: string;
  savedAt?: string;
  draftName?: string;
  batchName?: string;
  coverPath?: string;
  groupDetails?: GeneratedFissionGroupDetail[];
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

function FissionWorkspace(props: {
  projectId: string;
  projectName: string;
  onSavedToFinishedLibrary: (savedCount: number) => void;
  onDraftStateChange: (snapshot: FissionWorkspaceDraft) => void;
  onDraftAutoSaved: (snapshot: FissionWorkspaceDraft) => void;
}) {
  const draftLoadedRef = useRef(false);
  const generationTimerRef = useRef<number>();
  const [groups, setGroups] = useState<FissionShotGroup[]>(defaultFissionGroups);
  const [activeGroupId, setActiveGroupId] = useState(defaultFissionGroups[1].id);
  const [expandedIds, setExpandedIds] = useState<string[]>([defaultFissionGroups[1].id]);
  const [activeSettingsTab, setActiveSettingsTab] = useState<FissionSettingsTab>('group');
  const [comboMode, setComboMode] = useState<FissionComboMode>('single');
  const [soundSettings, setSoundSettings] = useState<FissionSoundSettings>(defaultFissionSoundSettings);
  const [generatedVideos, setGeneratedVideos] = useState<GeneratedFissionVideo[]>([]);
  const [selectedGeneratedIds, setSelectedGeneratedIds] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationError, setGenerationError] = useState('');
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
  const [previewMedia, setPreviewMedia] = useState<{ type: 'video' | 'audio'; name: string; path?: string } | null>(null);
  const [selectedPreviewId, setSelectedPreviewId] = useState('');
  const strategyCardsRef = useRef<HTMLDivElement>(null);
  const previewGridRef = useRef<HTMLDivElement>(null);
  const activeGroup = groups.find((group) => group.id === activeGroupId) || groups[0];
  const generatedCount = groups.reduce((total, group) => total + Math.max(1, group.clips.length), 1);
  const selectedPreviewItem = generatedVideos.find((item) => item.id === selectedPreviewId) || generatedVideos[0];
  const generatedVideoCount = generatedVideos.length || generatedCount * Math.max(1, audioItems.length || 1);
  const selectedGeneratedCount = selectedGeneratedIds.filter((id) => generatedVideos.some((video) => video.id === id)).length;
  const generatedVideoGroups = groups.map((group) => ({
    group,
    videos: generatedVideos
      .map((video) => ({
        video,
        detail: video.groupDetails?.find((detail) => detail.groupId === group.id)
      }))
      .filter((item) => item.detail)
  })).filter((item) => item.videos.length > 0);

  useEffect(() => {
    let cancelled = false;
    window.surgicol.store.get(FISSION_WORKSPACE_DRAFT_KEY)
      .then((value) => {
        if (cancelled) return;
        const draft = readFissionWorkspaceDraft(value);
        if (!draft) return;
        const nextGroups = draft.groups.length > 0 ? draft.groups : defaultFissionGroups;
        const nextActiveGroupId = draft.activeGroupId && nextGroups.some((group) => group.id === draft.activeGroupId)
          ? draft.activeGroupId
          : nextGroups[0]?.id || defaultFissionGroups[0].id;

        setGroups(nextGroups);
        setAudioItems(draft.audioItems);
        setActiveGroupId(nextActiveGroupId);
        setExpandedIds(draft.expandedIds?.filter((id) => nextGroups.some((group) => group.id === id)) || [nextActiveGroupId]);
        setComboMode(draft.comboMode || 'single');
        setGeneratedVideos(draft.generatedVideos || []);
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
    if (!draftLoadedRef.current) return;
    const snapshot = {
      groups,
      audioItems,
      activeGroupId,
      expandedIds,
      comboMode,
      generatedVideos,
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
  }, [activeGroupId, activeSettingsTab, audioItems, comboMode, expandedIds, generatedVideos, groups, soundSettings, props]);

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
    if (!rawPath) {
      setPreviewMedia({ type: 'video', name: item.name, path: undefined });
      return;
    }
    try {
      const previewPath = shouldRequestProtectedPreview(rawPath)
        ? (await getProtectedMediaAccessUrl(rawPath)).mediaUrl
        : rawPath;
      setPreviewMedia({ type: 'video', name: item.name, path: previewPath });
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : '获取视频预览地址失败');
      setPreviewMedia({ type: 'video', name: item.name, path: rawPath });
    }
  }

  function resetGeneratedResultState() {
    setGeneratedVideos([]);
    setSelectedGeneratedIds([]);
    setSelectedPreviewId('');
    setLastOutputMediaUrl('');
    setGenerationError('');
  }

  function toggleGeneratedSelection(videoId: string) {
    setSelectedGeneratedIds((ids) => (ids.includes(videoId) ? ids.filter((id) => id !== videoId) : [...ids, videoId]));
  }

  function selectAllGeneratedVideos() {
    setSelectedGeneratedIds(generatedVideos.map((video) => video.id));
  }

  async function persistFinishedVideoGroup(nextGroup: FinishedVideoGroup, existingGroups: FinishedVideoGroup[], replaced: boolean) {
    const nextGroups = [nextGroup, ...existingGroups.filter((group) => group.id !== nextGroup.id)];
    await window.surgicol.store.set(FINISHED_VIDEOS_KEY, nextGroups);
    setUploadNotice(replaced ? `已替换“${nextGroup.draftName}”成片组，共 ${nextGroup.videos.length} 个视频。` : `已保存“${nextGroup.draftName}”成片组，共 ${nextGroup.videos.length} 个视频。`);
    props.onSavedToFinishedLibrary(nextGroup.videos.length);
  }

  async function saveGeneratedVideosToFinishedLibrary() {
    if (generatedVideos.length === 0) return;
    const selectedSet = new Set(selectedGeneratedIds);
    const videosToSave = generatedVideos.filter((video) => selectedSet.size === 0 || selectedSet.has(video.id));
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
    const selectedSet = new Set(selectedGeneratedIds);
    setGeneratedVideos((videos) => videos.filter((video) => !selectedSet.has(video.id)));
    setSelectedGeneratedIds([]);
  }

  function deleteAllGeneratedVideos() {
    setGeneratedVideos([]);
    setSelectedGeneratedIds([]);
    setSelectedPreviewId('');
  }

  async function generateVideos() {
    if (isGenerating) return;
    if (comboMode !== 'smart') {
      setComboMode('smart');
    }

    if (generationTimerRef.current) window.clearInterval(generationTimerRef.current);
    setIsGenerating(true);
    setGenerationProgress(0);
    setGenerationError('');
    setLastOutputMediaUrl('');
    setGeneratedVideos([]);

    generationTimerRef.current = window.setInterval(() => {
      setGenerationProgress((progress) => Math.min(92, progress + 3 + Math.floor(Math.random() * 6)));
    }, 180);

    try {
      assertEligibleMixGroupsReady(groups, audioItems);
      const storageConfig = await getAliyunStorageConfig();
      const batchCount = DEFAULT_MIX_BATCH_COUNT;
      const cloudMediaUrls = groups.flatMap((group) => [
        ...group.clips.map((clip) => clip.path || ''),
        ...(group.groupAudios || []).map((audio) => audio.path || '')
      ]).concat(audioItems.map((audio) => audio.path || '')).filter(isCloudMediaUrl);
      const mixJobs = Array.from({ length: batchCount }, (_, index) => {
        return index;
      });
      const resolvedJobs = await Promise.all(mixJobs.map(async (index) => {
        const outputMediaUrl = await createAliyunOutputMediaUrl(storageConfig, index, cloudMediaUrls);
        const materialSummary = collectVariantMaterialSummary(groups, audioItems, index);
        const mixRequest = buildAliyunMixRequest({
          groups,
          audioItems,
          settings: soundSettings,
          outputMediaUrl,
          variantIndex: index
        });
        return {
          outputMediaUrl,
          materialSummary,
          request: mixRequest
        };
      }));
      setLastOutputMediaUrl(resolvedJobs[0]?.outputMediaUrl || '');

      const submittedVideos: GeneratedFissionVideo[] = [];
      const failedMessages: string[] = [];
      for (let index = 0; index < resolvedJobs.length; index += 1) {
        const mixJob = resolvedJobs[index];
        setUploadNotice(`正在提交阿里云混剪任务 ${index + 1}/${resolvedJobs.length}`);
        try {
          const result = await submitAliyunMix(mixJob.request);
          const nextVideo: GeneratedFissionVideo = {
            id: `aliyun-mix-${Date.now()}-${index}`,
            groupId: groups[0]?.id || 'aliyun-mix',
            groupName: '阿里云混剪',
            label: index + 1,
            name: `阿里云混剪_${String(index + 1).padStart(2, '0')}`,
            coverTone: index % 2 === 0 ? 'warm' : 'cool',
            duration: estimateMixDuration(groups),
            path: result.outputMediaUrl,
            coverPath: mixJob.materialSummary.coverPath,
            audioName: mixJob.materialSummary.audioNames,
            groupDetails: mixJob.materialSummary.details,
            jobId: result.jobId,
            jobStatus: result.jobId ? 'submitted' : 'running',
            jobStatusText: result.jobId ? '已提交，等待合成' : '已提交',
            jobMessage: result.jobId ? `${mixJob.materialSummary.text} · JobId: ${result.jobId}` : mixJob.materialSummary.text
          };
          submittedVideos.push(nextVideo);
          setGeneratedVideos([...submittedVideos]);
          setSelectedPreviewId((id) => id || nextVideo.id);
        } catch (error) {
          const message = error instanceof Error ? error.message : '提交阿里云混剪任务失败';
          failedMessages.push(`第 ${index + 1} 条：${message}`);
          if (isAliyunPermissionError(message)) {
            throw new Error(`第 ${index + 1} 条：${message}`);
          }
        }
      }
      if (submittedVideos.length === 0) {
        throw new Error(failedMessages[0] || '阿里云混剪任务没有提交成功，右侧不会显示成片。');
      }
      setGenerationProgress(100);
      setGeneratedVideos(submittedVideos);
      setSelectedPreviewId(submittedVideos[0]?.id || '');
      setUploadNotice(`已提交 ${submittedVideos.length} 个阿里云混剪任务，右侧仅显示已成功提交的任务。`);
      setGenerationError(failedMessages.length > 0 ? `部分任务提交失败：${failedMessages.slice(0, 3).join('；')}` : '');
    } catch (error) {
      const message = error instanceof Error ? error.message : '提交阿里云混剪任务失败';
      setGenerationError(message);
      setGeneratedVideos([]);
      setSelectedGeneratedIds([]);
      setSelectedPreviewId('');
    } finally {
      if (generationTimerRef.current) window.clearInterval(generationTimerRef.current);
      generationTimerRef.current = undefined;
      window.setTimeout(() => setIsGenerating(false), 260);
    }
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
    const importedClips = files.map((filePath, index) => ({
      id: crypto.randomUUID(),
      name: filePath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') || `导入视频_${index + 1}`,
      duration: '10.00s',
      coverTone: index % 2 === 0 ? 'warm' : 'cool',
      localPath: filePath,
      uploadStatus: 'uploading' as FissionUploadStatus
    }));
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
      const message = error instanceof Error ? error.message : '视频上传 OSS 失败';
      setGroups((items) =>
        items.map((group) =>
          group.id === groupId
            ? {
                ...group,
                clips: group.clips.map((clip) =>
                  clip.id === clipId ? { ...clip, uploadStatus: 'failed', uploadError: message } : clip
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
      const uploaded = await window.surgicol.media.uploadToOss(localPath, { folder: 'fission/audios' });
      setAudioItems((items) =>
        items.map((audio) =>
          audio.id === audioId
            ? { ...audio, path: uploaded.mediaUrl, localPath: uploaded.localPath, uploadStatus: 'uploaded', uploadError: undefined }
            : audio
        )
      );
      setUploadNotice(`已上传音频：${uploaded.name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : '音频上传 OSS 失败';
      setAudioItems((items) => items.map((audio) => (audio.id === audioId ? { ...audio, uploadStatus: 'failed', uploadError: message } : audio)));
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
      const message = error instanceof Error ? error.message : '组内音频上传 OSS 失败';
      setGroups((items) =>
        items.map((group) =>
          group.id === groupId
            ? {
                ...group,
                groupAudios: (group.groupAudios || []).map((audio) =>
                  audio.id === audioId ? { ...audio, uploadStatus: 'failed', uploadError: message } : audio
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
    const nextItems: FissionAudioItem[] = files.map((filePath) => ({
      id: crypto.randomUUID(),
      name: filePath.split(/[\\/]/).pop() || filePath,
      duration: '00:30',
      volume: 100,
      localPath: filePath,
      uploadStatus: 'uploading'
    }));
    resetGeneratedResultState();
    setAudioItems((items) => [...items, ...nextItems]);
    await Promise.all(nextItems.map((audio) => uploadGlobalAudio(audio.id, audio.localPath || '')));
  }

  async function importGroupAudio(groupId: string) {
    const files = await window.surgicol.dialog.openFiles({
      filters: [{ name: '音频文件', extensions: ['mp3', 'wav', 'aac', 'flac'] }]
    });
    if (files.length === 0) return;
    const nextItems: FissionAudioItem[] = files.map((filePath) => ({
      id: crypto.randomUUID(),
      name: filePath.split(/[\\/]/).pop() || filePath,
      duration: '00:30',
      volume: soundSettings.volume,
      localPath: filePath,
      uploadStatus: 'uploading'
    }));
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
      applyScriptGroups(text);
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
            <button type="button" onClick={() => setScriptDialogOpen(true)}>脚本导入</button>
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
                  <span>{group.title} ({group.clips.length || group.count})</span>
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
                        <div />
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
            </article>
          ))}
        </div>
        <div className="audio-drop-panel">
          <header>
            <strong>音频分组 ({audioItems.length})</strong>
            <div className="audio-header-actions">
              <button type="button" title="导入音频" onClick={() => void importAudio()}>
                <Plus size={13} />
              </button>
              <button type="button" title="全量删除音频" onClick={clearAllAudio} disabled={audioItems.length === 0}>
                <Trash2 size={13} />
              </button>
            </div>
          </header>
          {audioItems.length === 0 ? (
            <button type="button" onClick={() => void importAudio()}>导入音频</button>
          ) : (
            <div className="audio-item-list">
              {audioItems.map((item) => (
                <article key={item.id}>
                  <Music size={15} />
                  <button type="button" onClick={() => setPreviewMedia({ type: 'audio', name: item.name, path: previewPath(item) })}>
                    <strong>{item.name}</strong>
                    <span>{item.duration} · 音量 {item.volume}%{uploadStateText(item.uploadStatus)}</span>
                  </button>
                  <div className="audio-row-actions">
                    <button type="button" title="播放音频" onClick={() => setPreviewMedia({ type: 'audio', name: item.name, path: previewPath(item) })}>
                      <Play size={13} />
                    </button>
                    <button type="button" title="编辑音频">
                      <Edit3 size={13} />
                    </button>
                    <button type="button" title="删除音频" onClick={() => removeAudio(item.id)}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
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
                      <span>{audio.duration} · 音量 {audio.volume}%{uploadStateText(audio.uploadStatus)}</span>
                    </button>
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
                  {activeGroup.title}：{activeGroup.groupAudios?.length || 0} 条组内音频，生成混剪时会优先参与该分镜混音。
                </p>
              </section>
            </>
          ) : (
            <section className="fission-setting-card">
              <header>脚本策略概览</header>
              <p className="group-audio-empty">当前共 {groups.length} 个镜头分组，可生成视频 {generatedVideoCount} 个。</p>
            </section>
          )}
        </div>
        <div className="fission-generate-bar">
          <select defaultValue="all">
            <option value="all">全部</option>
          </select>
          <select defaultValue="none">
            <option value="none">不限制导出</option>
          </select>
          <button className="fission-generate-button" type="button" onClick={generateVideos} disabled={isGenerating}>
            {isGenerating ? '生成中...' : '生成视频'}
          </button>
        </div>
        {uploadNotice ? <div className="script-import-notice">{uploadNotice}</div> : null}
        {lastOutputMediaUrl ? <div className="script-import-notice">输出地址：{lastOutputMediaUrl}</div> : null}
        {generationError ? <div className="script-import-notice">{generationError}</div> : null}
      </section>

      <section className="fission-column fission-right">
        <header className="fission-section-title">
          <strong>脚本策略概览</strong>
          <button type="button" onClick={() => void previewGeneratedVideoItem(selectedPreviewItem)} disabled={!selectedPreviewItem}>预览视频</button>
        </header>
        <div className="strategy-summary">
          <span>可生成脚本: 1</span>
          <span>可生成视频: {Math.max(DEFAULT_MIX_BATCH_COUNT, generatedVideoCount)}</span>
          <span>时长: 22.07s~32.84s</span>
        </div>
        <div className="strategy-card-shell">
          <button type="button" aria-label="向左滚动脚本策略" onClick={() => scrollStrategyCards('left')}>
            <ChevronLeft size={14} />
          </button>
          <div className="strategy-card-row" ref={strategyCardsRef}>
            {groups.map((group, index) => (
              <article className={group.id === activeGroupId ? 'active' : undefined} data-group-id={group.id} key={group.id}>
                <strong>{group.title} ({group.clips.length || group.count})</strong>
                <span>分组位置：固定 #{groups.findIndex((item) => item.id === group.id) + 1}</span>
                <span>镜头模式：{index === 0 ? '单镜头' : '智能混剪'}</span>
              </article>
            ))}
          </div>
          <button type="button" aria-label="向右滚动脚本策略" onClick={() => scrollStrategyCards('right')}>
            <ChevronRight size={14} />
          </button>
        </div>
        <div className="material-filter-row">
          <select defaultValue="all">
            <option value="all">全部脚本</option>
          </select>
          <select defaultValue="all">
            <option value="all">全部音频</option>
          </select>
          <select defaultValue="all">
            <option value="all">全部时长</option>
          </select>
          <button type="button">确定</button>
        </div>
        <div className="fission-preview-toolbar">
          <div>
            <span>视频封面</span>
            <strong>{generatedVideos.length > 0 ? '智能混剪结果' : '等待阿里云生成'}</strong>
          </div>
          {generatedVideos.length > 0 ? (
            <div className="fission-result-actions">
              <button type="button" onClick={selectAllGeneratedVideos} disabled={selectedGeneratedCount === generatedVideos.length}>全选</button>
              <button type="button" onClick={() => void saveGeneratedVideosToFinishedLibrary()}>保存到成片库</button>
              <button type="button" onClick={deleteSelectedGeneratedVideos} disabled={selectedGeneratedCount === 0}>批量删除</button>
              <button className="danger-action" type="button" onClick={deleteAllGeneratedVideos}>全部删除</button>
              <small>{selectedGeneratedCount > 0 ? `已选 ${selectedGeneratedCount} / ${generatedVideos.length}` : `${generatedVideos.length} 个视频`}</small>
            </div>
          ) : (
            <small>调用混剪 API 后显示成片</small>
          )}
        </div>
        <div
          className={clsx('fission-preview-grid', generatedVideos.length > 0 && 'generated')}
          key={generatedVideos[0]?.id || 'preview-default'}
          ref={previewGridRef}
        >
          {generatedVideos.length === 0 ? (
            <section className="fission-result-empty">
              <Film size={24} />
              <strong>还没有阿里云混剪成片</strong>
              <span>导入脚本只会生成左侧分镜；点击“生成视频”并成功提交阿里云任务后，这里才显示 10 条默认混剪结果。</span>
            </section>
          ) : (
            generatedVideoGroups.map(({ group, videos }) => (
              <section className="fission-result-group" key={group.id}>
                <header className="fission-result-group-header">
                  <strong>{group.title}</strong>
                  <span>{videos.length} 个混剪结果</span>
                </header>
                <div className="fission-result-group-grid">
                  {videos.map(({ video, detail }, index) => {
                    const coverUrl = toMediaUrl(detail?.coverPath || video.coverPath || previewPath(video));
                    return (
                      <article
                        className={clsx(
                          selectedPreviewItem?.id === video.id && 'selected',
                          selectedGeneratedIds.includes(video.id) && 'batch-selected'
                        )}
                        key={`${group.id}-${video.id}-${index}`}
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
                          title={selectedGeneratedIds.includes(video.id) ? '取消选择' : '选择视频'}
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleGeneratedSelection(video.id);
                            setSelectedPreviewId(video.id);
                          }}
                        >
                          {selectedGeneratedIds.includes(video.id) ? <CheckCircle2 size={13} /> : null}
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
                        <strong>{detail?.clipName || video.name}</strong>
                        <small className="fission-preview-meta">
                          {detail?.audioName ? `音频：${detail.audioName}${detail.audioSource === 'global' ? '（全局）' : ''}` : video.duration || '云端合成'}
                          {video.jobStatusText ? ` · ${video.jobStatusText}` : ''}
                        </small>
                        {video.jobMessage ? (
                          <em className="fission-result-message">{video.jobMessage}</em>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>
        <footer className="fission-pagination">
          <span>共 {generatedVideos.length} 条 · 10条/页</span>
          <button type="button">{'<'}</button>
          <button className="active" type="button">1</button>
          <button type="button">2</button>
          <button type="button">3</button>
          <button type="button">4</button>
          <button type="button">5</button>
          <button className="waterfall-action" type="button">瀑布流合成</button>
        </footer>
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
              <strong>脚本导入</strong>
              <div>
                <button type="button" onClick={() => void importScriptFile()}>从文件导入</button>
                <button type="button" onClick={() => setScriptDialogOpen(false)}>关闭</button>
              </div>
            </header>
            <p>每段会按顺序生成一个镜头分组。支持 txt、Word、csv、srt、json，也支持“分镜1 / 画面 / 口播”的结构。</p>
            {scriptImportNotice ? <div className="script-import-notice">{scriptImportNotice}</div> : null}
            <textarea value={scriptDraft} onChange={(event) => setScriptDraft(event.target.value)} />
            <footer>
              <button type="button" onClick={() => setScriptDraft('')}>清空</button>
              <button className="primary-action" type="button" onClick={importScript}>解析并生成分组</button>
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
            <p>将删除当前全部镜头分组、组内脚本和已添加的视频素材。音频分组不会被删除。</p>
            <footer>
              <button type="button" onClick={() => setClearGroupsConfirmOpen(false)}>取消</button>
              <button className="danger-action" type="button" onClick={clearAllGroups}>确认删除</button>
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
      {previewMedia ? (
        <div className="script-import-backdrop">
          <section className="media-preview-dialog">
            <header>
              <strong>{previewMedia.name}</strong>
              <button type="button" onClick={() => setPreviewMedia(null)}>关闭</button>
            </header>
            <div className="media-preview-body">
              {previewMedia.path ? (
                previewMedia.type === 'video' ? (
                  <video src={toMediaUrl(previewMedia.path)} controls autoPlay />
                ) : (
                  <audio src={toMediaUrl(previewMedia.path)} controls autoPlay />
                )
              ) : (
                <div className="media-preview-empty">当前演示素材没有真实文件路径，请导入本地文件后预览。</div>
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
      const durationStart = 3 + index * 0.72;
      const durationEnd = durationStart + 2.1 + (index % 3) * 0.55;
      return {
        id: crypto.randomUUID(),
        sceneNo,
        title,
        count: Math.max(1, Math.min(8, Math.ceil((picture.length + voiceover.length) / 28))),
        duration: `${durationStart.toFixed(2)}s-${durationEnd.toFixed(2)}s`,
        script: picture,
        voiceover,
        clips: []
      };
    });
}

function stripScriptField(line?: string) {
  return line?.replace(/^[^：:\-—]+[：:\-—]\s*/, '').trim() || '';
}

function previewPath(media?: { path?: string; localPath?: string }) {
  return media?.localPath || (isCloudMediaUrl(media?.path) ? undefined : media?.path);
}

function playableGeneratedPath(video?: GeneratedFissionVideo) {
  if (!video) return undefined;
  if (/^https?:\/\//i.test(video.path || '')) return video.path;
  return video.coverPath || previewPath(video);
}

function shouldRequestProtectedPreview(path?: string) {
  return Boolean(path && (/^oss:\/\//i.test(path) || /aliyuncs\.com/i.test(path)));
}

function isCloudMediaUrl(path?: string) {
  return Boolean(path && /^(https?:\/\/|oss:\/\/)/i.test(path));
}

function uploadStateText(status?: FissionUploadStatus) {
  if (status === 'uploading') return ' · 上传中';
  if (status === 'uploaded') return ' · 已上传';
  if (status === 'failed') return ' · 上传失败';
  return '';
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
  throw new Error('当前没有同时具备“已上传视频 + 已上传组内音频”的分镜。请只给要参与混剪的分镜上传视频和组内音频。');
}

function collectUploadedMixAudios(groups: FissionShotGroup[], audioItems: FissionAudioItem[]) {
  return dedupeAudioItems([
    ...audioItems,
    ...groups.flatMap((group) => group.groupAudios || [])
  ]).filter((audio) => isCloudMediaUrl(audio.path));
}

function collectEligibleMixGroups(groups: FissionShotGroup[], audioItems: FissionAudioItem[]) {
  const uploadedGlobalAudios = dedupeAudioItems(audioItems).filter((audio) => isCloudMediaUrl(audio.path));
  return groups
    .map((group) => ({
      group,
      uploadedClips: group.clips.filter((clip) => isCloudMediaUrl(clip.path)),
      uploadedGroupAudios: (group.groupAudios || []).filter((audio) => isCloudMediaUrl(audio.path))
    }))
    .filter((item) => item.uploadedClips.length > 0 && (item.uploadedGroupAudios.length > 0 || uploadedGlobalAudios.length > 0));
}

function collectVariantAudioNames(groups: FissionShotGroup[], audioItems: FissionAudioItem[], variantIndex: number) {
  const uploadedGlobalAudios = collectUploadedMixAudios(groups, audioItems);
  const names = groups
    .map((group, groupIndex) => {
      const groupAudios = (group.groupAudios || []).filter((audio) => isCloudMediaUrl(audio.path));
      if (groupAudios.length > 0) return groupAudios[variantIndex % groupAudios.length]?.name;
      return uploadedGlobalAudios.length > 0 ? uploadedGlobalAudios[(variantIndex + groupIndex) % uploadedGlobalAudios.length]?.name : undefined;
    })
    .filter((name): name is string => Boolean(name));
  return Array.from(new Set(names)).slice(0, 4).join(' / ');
}

function collectVariantMaterialSummary(groups: FissionShotGroup[], audioItems: FissionAudioItem[], variantIndex: number) {
  const eligibleGroups = collectEligibleMixGroups(groups, audioItems);
  const uploadedGlobalAudios = collectUploadedMixAudios(groups, audioItems);
  const videoNames: string[] = [];
  const audioNames: string[] = [];
  const details: GeneratedFissionGroupDetail[] = [];
  let coverPath: string | undefined;

  eligibleGroups.forEach(({ group, uploadedClips, uploadedGroupAudios }, groupIndex) => {
    const clip = uploadedClips[(variantIndex + groupIndex) % uploadedClips.length];
    if (clip) {
      videoNames.push(`${group.title}:${clip.name}`);
      coverPath ||= previewPath(clip);
    }

    const groupAudio = uploadedGroupAudios[variantIndex % uploadedGroupAudios.length];
    const globalAudio = uploadedGlobalAudios.length > 0 ? uploadedGlobalAudios[(variantIndex + groupIndex) % uploadedGlobalAudios.length] : undefined;
    const audio = groupAudio || globalAudio;
    if (audio) audioNames.push(`${group.title}:${audio.name}`);
    details.push({
      groupId: group.id,
      groupName: group.title,
      clipName: clip?.name,
      audioName: audio?.name,
      audioSource: groupAudio ? 'group' : globalAudio ? 'global' : undefined,
      coverPath: previewPath(clip)
    });
  });

  const compactVideos = videoNames.slice(0, 4).join(' / ');
  const compactAudios = audioNames.slice(0, 4).join(' / ');
  return {
    audioNames: Array.from(new Set(audioNames.map((name) => name.split(':').slice(1).join(':')))).slice(0, 4).join(' / '),
    coverPath,
    details,
    text: `视频：${compactVideos || '无已上传视频'} · 音频：${compactAudios || '无已上传音频'}`
  };
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
    return makeFissionGroup(sceneNo, title, picture, voiceover, index);
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
      return makeFissionGroup(sceneNo, title, picture, voiceover, index);
    });
  } catch {
    return [];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function makeFissionGroup(sceneNo: number, title: string, picture: string, voiceover: string, index: number): FissionShotGroup {
  const durationStart = 3 + index * 0.72;
  const durationEnd = durationStart + 2.1 + (index % 3) * 0.55;
  return {
    id: crypto.randomUUID(),
    sceneNo,
    title,
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
  const [previewVideo, setPreviewVideo] = useState<{ name: string; path?: string } | null>(null);
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
    if (!video.path) {
      setPreviewError('当前成片没有可播放的视频地址。');
      setPreviewVideo({ name: video.name, path: undefined });
      return;
    }
    setPreviewError('');
    try {
      const nextPath = shouldRequestProtectedPreview(video.path)
        ? (await getProtectedMediaAccessUrl(video.path)).mediaUrl
        : video.path;
      setPreviewVideo({ name: video.name, path: nextPath });
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : '获取成片预览地址失败');
      setPreviewVideo({ name: video.name, path: video.path });
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
                        <button type="button">{video.path ? '已入库' : '入库'}</button>
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
                setPreviewError('');
              }}>
                <X size={16} />
              </button>
            </header>
            <div className="media-preview-body">
              {previewVideo.path ? (
                <video src={toMediaUrl(previewVideo.path)} controls autoPlay />
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
