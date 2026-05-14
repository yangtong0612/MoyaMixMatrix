import { Download, Eye, File, FileCode, FileText, Folder, Image, MoreHorizontal, MoveRight, Pencil, Share2, Trash2, Video } from 'lucide-react';
import { useState } from 'react';
import type { MouseEvent } from 'react';
import type { DriveNodeView, UUID } from '../api/netdisk';

export type CloudFileViewMode = 'list' | 'thumb' | 'large';

interface CloudFileTableProps {
  items: DriveNodeView[];
  selectedId: UUID | null;
  viewMode: CloudFileViewMode;
  onSelect: (id: UUID) => void;
  onOpenFolder: (node: DriveNodeView) => void;
  onPreview: (node: DriveNodeView) => void;
  onDownload: (node: DriveNodeView) => void;
  onRename: (node: DriveNodeView) => void;
  onMove: (node: DriveNodeView) => void;
  onRecycle: (node: DriveNodeView) => void;
  onShare: (node: DriveNodeView) => void;
}

export function CloudFileTable({
  items,
  selectedId,
  viewMode,
  onSelect,
  onOpenFolder,
  onPreview,
  onDownload,
  onRename,
  onMove,
  onRecycle,
  onShare
}: CloudFileTableProps) {
  const [openMenuId, setOpenMenuId] = useState<UUID | null>(null);

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
            const isSelected = selectedId === item.id;
            return (
              <article
                key={item.id}
                className={isSelected ? 'cloud-file-list-row selected' : 'cloud-file-list-row'}
                onClick={(event) => stop(event, () => onSelect(item.id))}
                onDoubleClick={() => (isFolder ? onOpenFolder(item) : onPreview(item))}
              >
                <div className="cloud-file-list-name">
                  <input aria-label={`选择 ${item.name}`} type="checkbox" checked={isSelected} onChange={() => onSelect(item.id)} />
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
                        onSelect(item.id);
                      })
                    }
                  >
                    <MoreHorizontal size={15} />
                  </button>
                  {openMenuId === item.id ? (
                    <FileActionMenu
                      node={item}
                      onPreview={onPreview}
                      onRename={onRename}
                      onMove={onMove}
                      onRecycle={onRecycle}
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
          const isSelected = selectedId === item.id;
          return (
            <article
              key={item.id}
              className={isSelected ? 'cloud-file-card selected' : 'cloud-file-card'}
              onClick={(event) => stop(event, () => onSelect(item.id))}
              onDoubleClick={() => (isFolder ? onOpenFolder(item) : onPreview(item))}
            >
              <div className="cloud-card-toolbar">
                <input aria-label={`选择 ${item.name}`} type="checkbox" checked={isSelected} onChange={() => onSelect(item.id)} />
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
                      onSelect(item.id);
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
                  onRename={onRename}
                  onMove={onMove}
                  onRecycle={onRecycle}
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
  onRename,
  onMove,
  onRecycle
}: {
  node: DriveNodeView;
  onPreview: (node: DriveNodeView) => void;
  onRename: (node: DriveNodeView) => void;
  onMove: (node: DriveNodeView) => void;
  onRecycle: (node: DriveNodeView) => void;
}) {
  const isFolder = node.nodeType === 'FOLDER';
  return (
    <div className="cloud-file-menu" onClick={(event) => event.stopPropagation()}>
      {!isFolder ? (
        <button type="button" onClick={() => onPreview(node)}>
          <Eye size={15} />
          <span>预览</span>
        </button>
      ) : null}
      <button type="button" onClick={() => onRename(node)}>
        <Pencil size={15} />
        <span>重命名</span>
      </button>
      <button type="button" onClick={() => onMove(node)}>
        <MoveRight size={15} />
        <span>移动</span>
      </button>
      <button className="danger" type="button" onClick={() => onRecycle(node)}>
        <Trash2 size={15} />
        <span>删除</span>
      </button>
    </div>
  );
}

function FileVisual({ node }: { node: DriveNodeView }) {
  if (node.nodeType === 'FOLDER') {
    return <Folder className="folder-icon" size={54} />;
  }
  if (node.mimeType?.startsWith('image/') && (node.coverUrl || node.previewUrl)) {
    return <img src={node.coverUrl || node.previewUrl || ''} alt="" />;
  }
  const category = fileCategory(node.name, node.mimeType || undefined);
  if (category === 'image') return <Image className="image-icon" size={48} />;
  if (category === 'video') return <Video className="video-icon" size={48} />;
  if (category === 'document') return <FileText className="document-icon" size={48} />;
  if (category === 'code') return <FileCode className="code-icon" size={48} />;
  return <File className="file-icon" size={48} />;
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

function stop(event: MouseEvent, action: () => void) {
  event.stopPropagation();
  action();
}
