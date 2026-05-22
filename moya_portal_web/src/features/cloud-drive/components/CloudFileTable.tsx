import { Download, Eye, File, FileCode, FileText, Folder, Image, Info, MoreHorizontal, MoveRight, Pencil, Share2, Trash2, Video } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { DragEvent, MouseEvent } from 'react';
import type { DriveNodeView, UUID } from '../api/netdisk';

export type CloudFileViewMode = 'list' | 'thumb' | 'large';

interface CloudFileTableProps {
  items: DriveNodeView[];
  selectedIds: UUID[];
  viewMode: CloudFileViewMode;
  onSelectOnly: (id: UUID) => void;
  onToggleSelect: (id: UUID) => void;
  onOpenFolder: (node: DriveNodeView) => void;
  onPreview: (node: DriveNodeView) => void;
  onDownload: (node: DriveNodeView) => void;
  onDetails: (node: DriveNodeView) => void;
  onRename: (node: DriveNodeView) => void;
  onMove: (node: DriveNodeView) => void;
  onMoveToFolder: (source: DriveNodeView, targetFolder: DriveNodeView) => void;
  onRecycle: (node: DriveNodeView) => void;
  onShare: (node: DriveNodeView) => void;
}

export function CloudFileTable({
  items,
  selectedIds,
  viewMode,
  onSelectOnly,
  onToggleSelect,
  onOpenFolder,
  onPreview,
  onDownload,
  onDetails,
  onRename,
  onMove,
  onMoveToFolder,
  onRecycle,
  onShare
}: CloudFileTableProps) {
  const [openMenuId, setOpenMenuId] = useState<UUID | null>(null);
  const [draggedNode, setDraggedNode] = useState<DriveNodeView | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<UUID | null>(null);

  useEffect(() => {
    setOpenMenuId(null);
  }, [viewMode]);

  function startDrag(event: DragEvent<HTMLElement>, node: DriveNodeView) {
    setDraggedNode(node);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', node.id);
  }

  function clearDrag() {
    setDraggedNode(null);
    setDragOverFolderId(null);
  }

  function allowFolderDrop(event: DragEvent<HTMLElement>, node: DriveNodeView) {
    if (!canDropOnFolder(draggedNode, node, items)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDragOverFolderId(node.id);
  }

  function leaveFolderDrop(event: DragEvent<HTMLElement>, node: DriveNodeView) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    if (dragOverFolderId === node.id) setDragOverFolderId(null);
  }

  function dropOnFolder(event: DragEvent<HTMLElement>, node: DriveNodeView) {
    event.preventDefault();
    event.stopPropagation();
    if (draggedNode && canDropOnFolder(draggedNode, node, items)) {
      onMoveToFolder(draggedNode, node);
    }
    clearDrag();
  }

  function handleItemClick(event: MouseEvent<HTMLElement>, id: UUID) {
    if (isFileControlClick(event.target)) {
      event.stopPropagation();
      return;
    }
    setOpenMenuId(null);
    stop(event, () => onSelectOnly(id));
  }

  if (viewMode === 'list') {
    return (
      <div className="cloud-file-list-shell" onClick={() => setOpenMenuId(null)}>
        <div className="cloud-file-list-header">
          <span>文件名</span>
          <span>大小</span>
          <span>类型</span>
          <span>修改时间</span>
          <span aria-label="操作" />
        </div>
        <div className="cloud-file-list">
          {items.map((item) => {
            const isFolder = item.nodeType === 'FOLDER';
            const isSelected = selectedIds.includes(item.id);
            return (
              <article
                key={item.id}
                className={fileItemClass('cloud-file-list-row', isSelected, dragOverFolderId === item.id)}
                draggable
                onDragStart={(event) => startDrag(event, item)}
                onDragEnd={clearDrag}
                onDragOver={(event) => allowFolderDrop(event, item)}
                onDragLeave={(event) => leaveFolderDrop(event, item)}
                onDrop={(event) => dropOnFolder(event, item)}
                onClick={(event) => handleItemClick(event, item.id)}
                onDoubleClick={() => (isFolder ? onOpenFolder(item) : onPreview(item))}
              >
                <div className="cloud-file-list-name">
                  <SelectionToggle name={item.name} selected={isSelected} onToggle={() => onToggleSelect(item.id)} />
                  <span className="cloud-file-list-icon">
                    <FileVisual node={item} />
                  </span>
                  <strong title={item.name}>{item.name || '未命名'}</strong>
                </div>
                <span>{isFolder ? '-' : formatSize(item.size)}</span>
                <span>{isFolder ? '文件夹' : fileTypeLabel(item.name, item.mimeType || undefined)}</span>
                <span>{formatFullDate(item.updatedAt)}</span>
                <div className="cloud-file-list-actions">
                  {!isFolder ? (
                    <>
                      <button type="button" title="分享" onClick={(event) => stop(event, () => onShare(item))}>
                        <Share2 size={15} />
                      </button>
                      <button type="button" title="下载" onClick={(event) => stop(event, () => onDownload(item))}>
                        <Download size={15} />
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    title="更多操作"
                    onClick={(event) =>
                      stop(event, () => {
                        setOpenMenuId(openMenuId === item.id ? null : item.id);
                        onSelectOnly(item.id);
                      })
                    }
                  >
                    <MoreHorizontal size={15} />
                  </button>
                  {openMenuId === item.id ? (
                    <FileActionMenu
                      node={item}
                      onPreview={onPreview}
                      onDetails={onDetails}
                      onRename={onRename}
                      onMove={onMove}
                      onRecycle={onRecycle}
                      onClose={() => setOpenMenuId(null)}
                    />
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
        {items.length === 0 ? <div className="empty-state compact">当前目录暂无文件</div> : null}
      </div>
    );
  }

  return (
    <div className={viewMode === 'large' ? 'cloud-file-grid-shell large' : 'cloud-file-grid-shell'} onClick={() => setOpenMenuId(null)}>
      <div className="cloud-file-grid">
        {items.map((item) => {
          const isFolder = item.nodeType === 'FOLDER';
          const isSelected = selectedIds.includes(item.id);
          return (
            <article
              key={item.id}
              className={fileItemClass('cloud-file-card', isSelected, dragOverFolderId === item.id)}
              draggable
              onDragStart={(event) => startDrag(event, item)}
              onDragEnd={clearDrag}
              onDragOver={(event) => allowFolderDrop(event, item)}
              onDragLeave={(event) => leaveFolderDrop(event, item)}
              onDrop={(event) => dropOnFolder(event, item)}
              onClick={(event) => handleItemClick(event, item.id)}
              onDoubleClick={() => (isFolder ? onOpenFolder(item) : onPreview(item))}
            >
              <div className="cloud-card-toolbar">
                <SelectionToggle name={item.name} selected={isSelected} onToggle={() => onToggleSelect(item.id)} />
                {!isFolder ? (
                  <>
                    <button type="button" title="分享" onClick={(event) => stop(event, () => onShare(item))}>
                      <Share2 size={15} />
                    </button>
                    <button type="button" title="下载" onClick={(event) => stop(event, () => onDownload(item))}>
                      <Download size={15} />
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  title="更多操作"
                  onClick={(event) =>
                    stop(event, () => {
                      setOpenMenuId(openMenuId === item.id ? null : item.id);
                      onSelectOnly(item.id);
                    })
                  }
                >
                  <MoreHorizontal size={15} />
                </button>
              </div>

              <div className="cloud-file-visual">
                <FileVisual node={item} />
              </div>
              <strong title={item.name}>{item.name || '未命名'}</strong>
              <span>{isFolder ? formatDate(item.updatedAt) : formatSize(item.size)}</span>

              {openMenuId === item.id ? (
                <FileActionMenu
                  node={item}
                  onPreview={onPreview}
                  onDetails={onDetails}
                  onRename={onRename}
                  onMove={onMove}
                  onRecycle={onRecycle}
                  onClose={() => setOpenMenuId(null)}
                />
              ) : null}
            </article>
          );
        })}
      </div>
      {items.length === 0 ? <div className="empty-state compact">当前目录暂无文件</div> : null}
    </div>
  );
}

function FileActionMenu({
  node,
  onPreview,
  onDetails,
  onRename,
  onMove,
  onRecycle,
  onClose
}: {
  node: DriveNodeView;
  onPreview: (node: DriveNodeView) => void;
  onDetails: (node: DriveNodeView) => void;
  onRename: (node: DriveNodeView) => void;
  onMove: (node: DriveNodeView) => void;
  onRecycle: (node: DriveNodeView) => void;
  onClose: () => void;
}) {
  const isFolder = node.nodeType === 'FOLDER';
  const runAction = (action: (node: DriveNodeView) => void) => {
    onClose();
    action(node);
  };
  return (
    <div className="cloud-file-menu" onClick={(event) => event.stopPropagation()}>
      {!isFolder ? (
        <button type="button" onClick={() => runAction(onPreview)}>
          <Eye size={15} />
          <span>预览</span>
        </button>
      ) : null}
      <button type="button" onClick={() => runAction(onDetails)}>
        <Info size={15} />
        <span>详情</span>
      </button>
      <button type="button" onClick={() => runAction(onRename)}>
        <Pencil size={15} />
        <span>重命名</span>
      </button>
      <button type="button" onClick={() => runAction(onMove)}>
        <MoveRight size={15} />
        <span>移动</span>
      </button>
      <button className="danger" type="button" onClick={() => runAction(onRecycle)}>
        <Trash2 size={15} />
        <span>删除</span>
      </button>
    </div>
  );
}

function SelectionToggle({ name, selected, onToggle }: { name: string; selected: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="cloud-file-select-control"
      aria-label={`${selected ? '取消选择' : '选择'} ${name}`}
      aria-pressed={selected}
      title={`${selected ? '取消选择' : '选择'} ${name}`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => stop(event, onToggle)}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <span className={selected ? 'cloud-file-select-box checked' : 'cloud-file-select-box'} aria-hidden="true" />
    </button>
  );
}

function FileVisual({ node }: { node: DriveNodeView }) {
  if (node.nodeType === 'FOLDER') {
    return <Folder className="folder-icon" size={54} />;
  }
  const category = fileCategory(node.name, node.mimeType || undefined);
  if (category === 'image') {
    const sources = [node.coverUrl, node.previewUrl].filter((url): url is string => Boolean(url));
    if (sources.length > 0) return <ThumbnailImage sources={sources} />;
    return <Image className="image-icon" size={48} />;
  }
  if (category === 'video') return <Video className="video-icon" size={48} />;
  if (category === 'document') return <FileText className="document-icon" size={48} />;
  if (category === 'code') return <FileCode className="code-icon" size={48} />;
  return <File className="file-icon" size={48} />;
}

function ThumbnailImage({ sources }: { sources: string[] }) {
  const [sourceIndex, setSourceIndex] = useState(0);
  const src = sources[sourceIndex];
  if (!src) return <Image className="image-icon" size={48} />;
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setSourceIndex((index) => index + 1)}
    />
  );
}

export function formatSize(size = 0) {
  if (size <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = size;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.replace('T', ' ').replace(/\.\d+.*/, '');
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatFullDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.replace('T', ' ').replace(/\.\d+.*/, '');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fileTypeLabel(name = '', mimeType?: string) {
  const category = fileCategory(name, mimeType);
  if (category === 'image') return imageExt(name) || '图片';
  if (category === 'video') return '视频';
  if (category === 'document') return documentExt(name) || '文档';
  if (category === 'code') return codeExt(name) || '代码';
  return '文件';
}

function fileCategory(name = '', mimeType?: string) {
  if (mimeType?.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp|bmp|svg)$/i.test(name)) return 'image';
  if (mimeType?.startsWith('video/') || /\.(mp4|webm|mov|avi|mkv)$/i.test(name)) return 'video';
  if (/\.(pdf|doc|docx|txt|md|xls|xlsx|ppt|pptx)$/i.test(name)) return 'document';
  if (/\.(html|css|js|ts|tsx|java|json|xml)$/i.test(name)) return 'code';
  return 'file';
}

function imageExt(name: string) {
  const ext = name.match(/\.([^.]+)$/)?.[1];
  return ext ? `${ext}文件` : '';
}

function documentExt(name: string) {
  const ext = name.match(/\.([^.]+)$/)?.[1];
  return ext ? `${ext}文件` : '';
}

function codeExt(name: string) {
  const ext = name.match(/\.([^.]+)$/)?.[1];
  return ext ? `${ext}文件` : '';
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function stop(event: { stopPropagation: () => void }, action: () => void) {
  event.stopPropagation();
  action();
}

function isFileControlClick(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('input, button, label, .cloud-file-select-control, .cloud-file-menu'));
}

function canDropOnFolder(source: DriveNodeView | null, target: DriveNodeView, items: DriveNodeView[]) {
  if (!source || target.nodeType !== 'FOLDER' || source.id === target.id) return false;
  if (source.nodeType === 'FOLDER' && isKnownDescendant(source.id, target, items)) return false;
  return true;
}

function isKnownDescendant(sourceId: UUID, target: DriveNodeView, items: DriveNodeView[]) {
  const byId = new Map(items.map((item) => [item.id, item]));
  let parentId = target.parentId;
  while (parentId) {
    if (parentId === sourceId) return true;
    parentId = byId.get(parentId)?.parentId || null;
  }
  return false;
}

function fileItemClass(base: string, selected: boolean, dragTarget: boolean) {
  return [base, selected ? 'selected' : '', dragTarget ? 'drag-target' : ''].filter(Boolean).join(' ');
}
