import { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Edit3,
  FileText,
  Film,
  FolderOpen,
  Maximize2,
  Mic,
  MousePointer2,
  Music,
  Play,
  Plus,
  Save,
  Scissors,
  Settings,
  Share2,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  SplitSquareHorizontal,
  Star,
  Sticker,
  Trash2,
  Type,
  Upload,
  UserRound,
  Volume2
} from 'lucide-react';
import clsx from 'clsx';
import { useEditorStore, type MaterialItem } from './editorStore';
import { MaterialPanel } from './components/MaterialPanel';
import { PreviewPanel } from './components/PreviewPanel';
import { TimelinePanel } from './components/TimelinePanel';
import { InspectorPanel } from './components/InspectorPanel';
import { toMediaUrl } from './mediaUrl';

export function EditorPage() {
  const editor = useEditorStore();
  const [lastSavedAt, setLastSavedAt] = useState<string>('-');
  const [activeWorkflow, setActiveWorkflow] = useState<EditorWorkflow>('materials');

  useEffect(() => {
    window.surgicol.editor.listDrafts().then((drafts) => {
      if (drafts[0]) editor.setDraftName(drafts[0].name);
    });
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
    await window.surgicol.editor.createDraft({ name: editor.draftName });
    setLastSavedAt(new Date().toLocaleTimeString());
  }

  return (
    <section className="page editor-page">
      <header className="editor-topbar">
        <div className="editor-menu">
          <button className="editor-menu-button" type="button">菜单</button>
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
        <FissionWorkspace />
      ) : activeWorkflow === 'finished' ? (
        <FinishedVideosWorkspace />
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

type EditorWorkflow = 'materials' | 'fission' | 'finished' | 'publish';

const editorWorkflowTabs: Array<{ id: EditorWorkflow; label: string; icon: typeof FolderOpen }> = [
  { id: 'materials', label: '基础素材', icon: FolderOpen },
  { id: 'fission', label: '极速裂变', icon: Sparkles },
  { id: 'finished', label: '成片库', icon: FileText },
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
  clips: Array<{ id: string; name: string; duration: string; coverTone: string; path?: string }>;
  groupAudios?: FissionAudioItem[];
}

interface FissionAudioItem {
  id: string;
  name: string;
  duration: string;
  volume: number;
  path?: string;
}

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
};

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

type FissionPreviewItem = {
  id: string;
  groupId: string;
  groupName: string;
  label: number;
  name: string;
  coverTone: string;
  duration?: string;
  path?: string;
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

const defaultFissionSoundSettings: FissionSoundSettings = {
  followAudioSpeed: true,
  retainOriginalAudio: true,
  ducking: true,
  fadeInOut: true,
  volume: 100
};

const finishedVideos = [
  { name: '新品种草-裂变版 01', duration: '00:23', recommend: 'A', compliance: '高', difference: '82%' },
  { name: '新品种草-裂变版 02', duration: '00:27', recommend: 'B+', compliance: '高', difference: '76%' },
  { name: '门店探访-裂变版 03', duration: '00:31', recommend: 'A-', compliance: '中', difference: '88%' }
];

const publishChannels = [
  { name: '抖音企业号', state: '已授权', plan: '今晚 20:30' },
  { name: '视频号', state: '待授权', plan: '未设置' },
  { name: '小红书', state: '已授权', plan: '明天 11:00' }
];

function FissionWorkspace() {
  const draftLoadedRef = useRef(false);
  const generationTimerRef = useRef<number>();
  const [groups, setGroups] = useState<FissionShotGroup[]>(defaultFissionGroups);
  const [activeGroupId, setActiveGroupId] = useState(defaultFissionGroups[1].id);
  const [expandedIds, setExpandedIds] = useState<string[]>([defaultFissionGroups[1].id]);
  const [activeSettingsTab, setActiveSettingsTab] = useState<FissionSettingsTab>('group');
  const [comboMode, setComboMode] = useState<FissionComboMode>('single');
  const [soundSettings, setSoundSettings] = useState<FissionSoundSettings>(defaultFissionSoundSettings);
  const [generatedVideos, setGeneratedVideos] = useState<GeneratedFissionVideo[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [scriptDialogOpen, setScriptDialogOpen] = useState(false);
  const [scriptImportNotice, setScriptImportNotice] = useState('');
  const [scriptDraft, setScriptDraft] = useState(`开头：3秒，产品近景开场，制造好奇心
平台引入：3秒，人物口播引出场景
特点：5秒，展示核心卖点和使用效果
详情：6秒，补充细节、材质、适用人群
END：4秒，收束行动指令和品牌露出`);
  const [audioItems, setAudioItems] = useState<FissionAudioItem[]>([]);
  const [clearGroupsConfirmOpen, setClearGroupsConfirmOpen] = useState(false);
  const [previewMedia, setPreviewMedia] = useState<{ type: 'video' | 'audio'; name: string; path?: string } | null>(null);
  const [selectedPreviewId, setSelectedPreviewId] = useState('');
  const strategyCardsRef = useRef<HTMLDivElement>(null);
  const previewGridRef = useRef<HTMLDivElement>(null);
  const activeGroup = groups.find((group) => group.id === activeGroupId) || groups[0];
  const generatedCount = groups.reduce((total, group) => total + Math.max(1, group.clips.length), 1);
  const previewItems: FissionPreviewItem[] = groups
    .flatMap((group) =>
      group.clips.length > 0
        ? group.clips.map((clip) => ({
            ...clip,
            groupId: group.id,
            groupName: group.title,
            label: group.clips.length
          }))
        : [{
            id: group.id,
            groupId: group.id,
            groupName: group.title,
            label: group.count,
            name: group.title,
            coverTone: 'dark'
          }]
    )
    .slice(0, 10);
  const visiblePreviewItems: Array<FissionPreviewItem | GeneratedFissionVideo> = generatedVideos.length > 0 ? generatedVideos : previewItems;
  const selectedPreviewItem = visiblePreviewItems.find((item) => item.id === selectedPreviewId) || visiblePreviewItems[0];
  const generatedVideoCount = generatedVideos.length || generatedCount * Math.max(1, audioItems.length || 1);

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
    const saveTimer = window.setTimeout(() => {
      void window.surgicol.store.set(FISSION_WORKSPACE_DRAFT_KEY, {
        groups,
        audioItems,
        activeGroupId,
        expandedIds,
        comboMode,
        generatedVideos,
        activeSettingsTab,
        soundSettings
      });
    }, 250);

    return () => window.clearTimeout(saveTimer);
  }, [activeGroupId, activeSettingsTab, audioItems, comboMode, expandedIds, generatedVideos, groups, soundSettings]);

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
    return groups.flatMap((group) => group.clips).find((clip) => Boolean(clip.path))?.path;
  }

  function previewVideoItem(item?: FissionPreviewItem) {
    if (!item) return;
    setSelectedPreviewId(item.id);
    setPreviewMedia({ type: 'video', name: item.name, path: item.path || getFallbackPreviewPath() });
  }

  function buildGeneratedVideos(): GeneratedFissionVideo[] {
    const videoPool = groups.flatMap((group) =>
      group.clips.map((clip) => ({
        ...clip,
        groupId: group.id,
        groupName: group.title
      }))
    );
    const playableVideoPool = videoPool.filter((clip) => Boolean(clip.path));
    const fallbackPool = groups.map((group) => ({
      id: group.id,
      groupId: group.id,
      groupName: group.title,
      label: group.count,
      name: group.title,
      coverTone: 'dark',
      duration: group.duration,
      path: undefined
    }));
    const sourceVideos = playableVideoPool.length > 0 ? playableVideoPool : videoPool.length > 0 ? videoPool : fallbackPool;
    const fallbackPath = playableVideoPool[0]?.path;
    const targetCount = 50 + Math.floor(Math.random() * 51);

    return Array.from({ length: targetCount }, (_, index) => {
      const video = sourceVideos[index % sourceVideos.length];
      const groupAudios = groups.find((group) => group.id === video.groupId)?.groupAudios || [];
      const audioPool = groupAudios.length > 0 ? groupAudios : audioItems;
      const audio = audioPool.length > 0 ? audioPool[index % audioPool.length] : undefined;
      const variant = String(index + 1).padStart(3, '0');
      return {
        id: `generated-${Date.now()}-${index}`,
        groupId: video.groupId,
        groupName: video.groupName,
        label: index + 1,
        name: `智能混剪_${variant}`,
        coverTone: video.coverTone,
        duration: `${22 + (index % 11)}s`,
        path: video.path || fallbackPath,
        audioName: audio?.name
      };
    });
  }

  function generateVideos() {
    if (isGenerating) return;
    if (comboMode !== 'smart') {
      setComboMode('smart');
    }

    if (generationTimerRef.current) window.clearInterval(generationTimerRef.current);
    setIsGenerating(true);
    setGenerationProgress(0);
    setGeneratedVideos([]);

    generationTimerRef.current = window.setInterval(() => {
      setGenerationProgress((progress) => {
        const nextProgress = Math.min(100, progress + 4 + Math.floor(Math.random() * 8));
        if (nextProgress >= 100) {
          if (generationTimerRef.current) window.clearInterval(generationTimerRef.current);
          generationTimerRef.current = undefined;
          const nextVideos = buildGeneratedVideos();
          setGeneratedVideos(nextVideos);
          setSelectedPreviewId(nextVideos[0]?.id || '');
          window.setTimeout(() => setIsGenerating(false), 260);
        }
        return nextProgress;
      });
    }, 180);
  }

  function applyScriptGroups(script: string) {
    const parsed = parseScriptGroups(script);
    if (parsed.length === 0) {
      setScriptImportNotice('没有识别到可用分镜，请检查文件内容是否包含“分镜 / 画面 / 口播”或表格列名。');
      return false;
    }
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
    setGroups((items) =>
      items.map((group) => {
        if (group.id !== groupId) return group;
        const importedClips = files.map((filePath, index) => ({
          id: crypto.randomUUID(),
          name: filePath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') || `导入视频_${index + 1}`,
          duration: '10.00s',
          coverTone: index % 2 === 0 ? 'warm' : 'cool',
          path: filePath
        }));
        return {
          ...group,
          count: group.count + importedClips.length,
          clips: [...group.clips, ...importedClips]
        };
      })
    );
    setActiveGroupId(groupId);
    setExpandedIds((ids) => (ids.includes(groupId) ? ids : [...ids, groupId]));
  }

  function duplicateClip(groupId: string, clipId: string) {
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
    setGroups((items) => {
      const next = items.filter((group) => group.id !== groupId);
      if (activeGroupId === groupId && next[0]) setActiveGroupId(next[0].id);
      return next.length === 0 ? defaultFissionGroups.slice(0, 1) : next;
    });
    setExpandedIds((ids) => ids.filter((id) => id !== groupId));
  }

  function clearAllGroups() {
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

  async function importAudio() {
    const files = await window.surgicol.dialog.openFiles({
      filters: [{ name: '音频文件', extensions: ['mp3', 'wav', 'aac', 'flac'] }]
    });
    const nextItems = files.map((filePath) => ({
      id: crypto.randomUUID(),
      name: filePath.split(/[\\/]/).pop() || filePath,
      duration: '00:30',
      volume: 100,
      path: filePath
    }));
    setAudioItems((items) => [...items, ...nextItems]);
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
      path: filePath
    }));
    setGroups((items) =>
      items.map((group) =>
        group.id === groupId
          ? { ...group, groupAudios: [...(group.groupAudios || []), ...nextItems] }
          : group
      )
    );
    setActiveGroupId(groupId);
  }

  function removeGroupAudio(groupId: string, audioId: string) {
    setGroups((items) =>
      items.map((group) =>
        group.id === groupId
          ? { ...group, groupAudios: (group.groupAudios || []).filter((item) => item.id !== audioId) }
          : group
      )
    );
  }

  function removeAudio(audioId: string) {
    setAudioItems((items) => items.filter((item) => item.id !== audioId));
  }

  function clearAllAudio() {
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
                      <button className={`shot-clip-card tone-${clip.coverTone}`} type="button" key={clip.id} onClick={() => setPreviewMedia({ type: 'video', name: clip.name, path: clip.path })}>
                        <span>{clipIndex + 1}</span>
                        <div className="shot-clip-actions">
                          <span title="预览/编辑视频" onClick={(event) => {
                            event.stopPropagation();
                            setPreviewMedia({ type: 'video', name: clip.name, path: clip.path });
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
                        <small>{clip.duration}</small>
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
                  <button type="button" onClick={() => setPreviewMedia({ type: 'audio', name: item.name, path: item.path })}>
                    <strong>{item.name}</strong>
                    <span>{item.duration} · 音量 {item.volume}%</span>
                  </button>
                  <div className="audio-row-actions">
                    <button type="button" title="播放音频" onClick={() => setPreviewMedia({ type: 'audio', name: item.name, path: item.path })}>
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
                    <button type="button" onClick={() => setPreviewMedia({ type: 'audio', name: audio.name, path: audio.path })}>
                      <strong>{audio.name}</strong>
                      <span>{audio.duration} · 音量 {audio.volume}%</span>
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
      </section>

      <section className="fission-column fission-right">
        <header className="fission-section-title">
          <strong>脚本策略概览</strong>
          <button type="button" onClick={() => previewVideoItem(selectedPreviewItem)}>预览视频</button>
        </header>
        <div className="strategy-summary">
          <span>可生成脚本: 1</span>
          <span>可生成视频: {generatedVideoCount}</span>
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
            <strong>{generatedVideos.length > 0 ? '智能混剪结果' : '视频组合'}</strong>
          </div>
          <small>{generatedVideos.length > 0 ? `${generatedVideos.length} 个视频` : '22s ~ 32s'}</small>
        </div>
        <div
          className={clsx('fission-preview-grid', generatedVideos.length > 0 && 'generated')}
          key={generatedVideos[0]?.id || 'preview-default'}
          ref={previewGridRef}
        >
          {visiblePreviewItems.map((item, index) => (
            <article
              className={selectedPreviewItem?.id === item.id ? 'selected' : undefined}
              key={`${item.id}-${index}`}
              role="button"
              tabIndex={0}
              onClick={() => {
                if (generatedVideos.length > 0) {
                  previewVideoItem(item);
                  return;
                }
                setSelectedPreviewId(item.id);
              }}
              onDoubleClick={() => previewVideoItem(item)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') previewVideoItem(item);
                if (event.key === ' ') {
                  event.preventDefault();
                  setSelectedPreviewId(item.id);
                }
              }}
            >
              <span>{item.label}</span>
              <button
                className="preview-card-play"
                type="button"
                title="预览素材"
                onClick={(event) => {
                  event.stopPropagation();
                  previewVideoItem(item);
                }}
              >
                <Play size={13} />
              </button>
              <div />
              <strong>{generatedVideos.length > 0 ? item.name : item.groupName}</strong>
              <small className="fission-preview-meta">
                {item.duration || '00:30'}{generatedVideos.length > 0 && 'audioName' in item && item.audioName ? ` · ${item.audioName}` : ''}
              </small>
            </article>
          ))}
        </div>
        <footer className="fission-pagination">
          <span>共 {visiblePreviewItems.length} 条 · 10条/页</span>
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
        clips: [
          {
            id: crypto.randomUUID(),
            name: `${title}_001`,
            duration: `${durationStart.toFixed(2)}s`,
            coverTone: index % 2 === 0 ? 'warm' : 'cool'
          }
        ]
      };
    });
}

function stripScriptField(line?: string) {
  return line?.replace(/^[^：:\-—]+[：:\-—]\s*/, '').trim() || '';
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
    clips: [
      {
        id: crypto.randomUUID(),
        name: `${title}_001`,
        duration: `${durationStart.toFixed(2)}s`,
        coverTone: index % 2 === 0 ? 'warm' : 'cool'
      }
    ]
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

function FinishedVideosWorkspace() {
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

      <div className="finished-grid">
        {finishedVideos.map((video) => (
          <article className="finished-card" key={video.name}>
            <div className="finished-thumb">
              <FileText size={24} />
              <span>{video.duration}</span>
            </div>
            <div className="finished-meta">
              <strong>{video.name}</strong>
              <div>
                <span>推荐 {video.recommend}</span>
                <span>过审 {video.compliance}</span>
                <span>差异 {video.difference}</span>
              </div>
            </div>
            <div className="finished-actions">
              <button type="button">预览</button>
              <button type="button">入库</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
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
