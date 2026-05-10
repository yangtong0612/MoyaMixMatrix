import { File, Folder, MoreHorizontal } from 'lucide-react';
import type { DiskObject } from '../api/netdisk';

interface CloudFileTableProps {
  items: DiskObject[];
  selectedIds: number[];
  onToggle: (id: number) => void;
}

export function CloudFileTable({ items, selectedIds, onToggle }: CloudFileTableProps) {
  return (
    <div className="table-shell">
      <table className="data-table">
        <thead>
          <tr>
            <th aria-label="选择" />
            <th>名称</th>
            <th>类型</th>
            <th>大小</th>
            <th>更新时间</th>
            <th aria-label="操作" />
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const id = item.id ?? 0;
            const isFolder = item.object_type === 1;
            return (
              <tr key={`${item.object_name}-${id}`} className={selectedIds.includes(id) ? 'selected' : undefined}>
                <td>
                  <input type="checkbox" checked={selectedIds.includes(id)} onChange={() => onToggle(id)} />
                </td>
                <td>
                  <div className="file-name">
                    {isFolder ? <Folder size={18} /> : <File size={18} />}
                    <span>{item.object_name || '未命名'}</span>
                  </div>
                </td>
                <td>{isFolder ? '文件夹' : fileTypeLabel(item.file_type)}</td>
                <td>{isFolder ? '-' : formatSize(item.file_size)}</td>
                <td>{item.update_datetime || item.create_datetime || '-'}</td>
                <td>
                  <button className="icon-button" type="button" title="更多操作">
                    <MoreHorizontal size={16} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function fileTypeLabel(type?: number) {
  if (type === 1) return '文档';
  if (type === 2) return '视频';
  if (type === 3) return '图片';
  return '文件';
}

function formatSize(size = 0) {
  if (size <= 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = size;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}
