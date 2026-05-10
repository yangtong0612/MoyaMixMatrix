import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileText,
  FolderOpen,
  Maximize2,
  Mic,
  MousePointer2,
  Music,
  Plus,
  Save,
  Scissors,
  Settings,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  SplitSquareHorizontal,
  Star,
  Sticker,
  Type,
  Upload,
  UserRound
} from 'lucide-react';
import clsx from 'clsx';
import { useEditorStore, type MaterialItem } from './editorStore';
import { MaterialPanel } from './components/MaterialPanel';
import { PreviewPanel } from './components/PreviewPanel';
import { TimelinePanel } from './components/TimelinePanel';
import { InspectorPanel } from './components/InspectorPanel';

export function EditorPage() {
  const editor = useEditorStore();
  const [lastSavedAt, setLastSavedAt] = useState<string>('-');

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

      <div className="editor-tool-tabs">
        {editorFeatureTabs.map((tab, index) => (
          <button className={clsx(index === 0 && 'active')} type="button" key={tab.label}>
            <tab.icon size={18} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

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
