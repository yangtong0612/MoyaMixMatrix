import clsx from 'clsx';
import {
  Box,
  ChevronDown,
  Cloud,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Folder,
  Grid2X2,
  ListFilter,
  Plus,
  Search,
  Sparkles,
  Upload,
  UserRound
} from 'lucide-react';
import { useEditorStore } from '../editorStore';

interface MaterialPanelProps {
  onImport: () => void;
}

const materialMenus = [
  { label: '导入', icon: Upload, expandable: true },
  { label: '素材', icon: Folder },
  { label: '字幕稿', icon: FileText },
  { label: '我的', icon: UserRound, expandable: true },
  { label: 'AI 生成', icon: Sparkles, expandable: true },
  { label: '云素材', icon: Cloud, expandable: true },
  { label: '官方素材', icon: Box, expandable: true }
];

export function MaterialPanel({ onImport }: MaterialPanelProps) {
  const materials = useEditorStore((state) => state.materials);
  const activeMaterialId = useEditorStore((state) => state.activeMaterialId);
  const setActiveMaterial = useEditorStore((state) => state.setActiveMaterial);
  const addMaterialToTimeline = useEditorStore((state) => state.addMaterialToTimeline);

  return (
    <aside className="editor-panel material-panel">
      <nav className="material-rail">
        {materialMenus.map((item, index) => (
          <button className={clsName(index === 0)} type="button" key={item.label}>
            <span className="material-rail-icon">
              <item.icon size={15} />
            </span>
            <span className="material-rail-label">{item.label}</span>
            {item.expandable ? <ChevronDown className="material-rail-caret" size={12} /> : null}
          </button>
        ))}
      </nav>

      <div className="material-browser">
        <div className="material-browser-top">
          <button className="material-import" type="button" onClick={onImport}>
            <Plus size={14} />
            <span>导入</span>
          </button>
          <label className="material-search">
            <Search size={14} />
            <input placeholder="搜索文件名称、画面、台词" />
          </label>
          <button className="icon-button" type="button" title="网格">
            <Grid2X2 size={15} />
          </button>
          <button className="icon-button" type="button" title="筛选">
            <ListFilter size={15} />
          </button>
        </div>

        <div className="tabs compact-tabs">
          <button className="active" type="button">全部</button>
          <button type="button">视频</button>
          <button type="button">音频</button>
          <button type="button">图片</button>
        </div>

        <div className="material-list">
          {materials.length === 0 ? (
            <button className="material-dropzone" type="button" onClick={onImport}>
              <Plus size={18} />
              <strong>导入</strong>
              <span>视频、音频、图片，支持拖入添加</span>
            </button>
          ) : (
            materials.map((item) => (
              <button
                className={clsx('material-card', activeMaterialId === item.id && 'active')}
                type="button"
                key={item.id}
                draggable
                onClick={() => setActiveMaterial(item.id)}
                onDoubleClick={() => addMaterialToTimeline(item.id)}
                onDragStart={(event) => {
                  event.dataTransfer.setData('application/x-moya-material', item.id);
                  event.dataTransfer.effectAllowed = 'copy';
                }}
              >
                <div className="material-thumb">
                  {item.coverUrl ? <img className="material-cover" src={item.coverUrl} alt="" /> : null}
                  {!item.coverUrl && (item.type === 'video' ? <FileVideo size={20} /> : item.type === 'audio' ? <FileAudio size={20} /> : <FileImage size={20} />)}
                  <span className="material-duration">{formatDuration(item.duration)}</span>
                  <span
                    className="material-add"
                    role="button"
                    tabIndex={0}
                    onClick={(event) => {
                      event.stopPropagation();
                      addMaterialToTimeline(item.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        event.stopPropagation();
                        addMaterialToTimeline(item.id);
                      }
                    }}
                  >
                    <Plus size={14} />
                  </span>
                </div>
                <span>{item.name}</span>
                <small>{item.source === 'cloud' ? '网盘' : '本地'}</small>
              </button>
            ))
          )}
        </div>
      </div>
    </aside>
  );
}

function clsName(active: boolean) {
  return active ? 'active' : undefined;
}

function formatDuration(duration?: number) {
  if (!duration || !Number.isFinite(duration)) return '--:--';
  const totalSeconds = Math.max(0, Math.round(duration));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
