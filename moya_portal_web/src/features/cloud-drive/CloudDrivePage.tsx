import { useEffect, useMemo, useState } from 'react';
import { Archive, CheckSquare, ChevronDown, Download, File, Folder, FolderPlus, Lock, RefreshCw, Share2, Upload } from 'lucide-react';
import clsx from 'clsx';
import { listNetdisk, type DiskObject } from './api/netdisk';
import { useCloudDriveStore, type CloudMenuKey } from './cloudDriveStore';
import { CloudFileTable } from './components/CloudFileTable';
import { TransferPanel } from './components/TransferPanel';

interface CloudDrivePageProps {
  initialMenu?: CloudMenuKey;
}

const menuItems: Array<{ key: CloudMenuKey; label: string; icon: typeof Folder }> = [
  { key: 'myFolder', label: '全部文件', icon: Folder },
  { key: 'sharedWithMeFolder', label: '与我共享', icon: Share2 },
  { key: 'privateFolder', label: '未发布', icon: Lock },
  { key: 'shareFolder', label: '已发布', icon: Upload },
  { key: 'transport', label: '传输列表', icon: Download },
  { key: 'annotation', label: '标注进程', icon: CheckSquare },
  { key: 'videoSummary', label: '视频摘要', icon: Archive }
];

const fallbackObjects: DiskObject[] = [
  { id: 1, object_type: 1, object_name: '手术公开视频', parent_id: 0, update_datetime: '2026-05-09 08:00' },
  { id: 2, object_type: 2, object_name: '腹腔镜胆囊切除.mp4', parent_id: 0, file_type: 2, file_size: 734003200, update_datetime: '2026-05-08 19:24' },
  { id: 3, object_type: 2, object_name: '术式说明.pdf', parent_id: 0, file_type: 1, file_size: 2936012, update_datetime: '2026-05-07 11:12' }
];

export function CloudDrivePage({ initialMenu }: CloudDrivePageProps) {
  const store = useCloudDriveStore();
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');

  useEffect(() => {
    if (initialMenu) store.setActiveMenu(initialMenu);
  }, [initialMenu]);

  const filteredObjects = useMemo(() => {
    if (!keyword.trim()) return store.objects;
    return store.objects.filter((item) => item.object_name?.toLowerCase().includes(keyword.toLowerCase()));
  }, [keyword, store.objects]);

  async function refresh() {
    if (store.currentTab() === 'transport') return;

    setLoading(true);
    try {
      const data = await listNetdisk({
        query_type: store.currentTab(),
        parent_id: store.currentFolderId,
        page: 1,
        page_size: 50
      });
      store.setObjects(Array.isArray(data) ? data : fallbackObjects);
    } catch {
      store.setObjects(fallbackObjects);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [store.activeMenu, store.currentFolderId]);

  async function queueUpload() {
    const files = await window.surgicol.dialog.openFiles();
    await Promise.all(
      files.map((localPath) =>
        window.surgicol.cloud.addTransferTask({
          name: localPath.split(/[\\/]/).pop() || localPath,
          type: 'upload',
          localPath
        })
      )
    );
    store.setActiveMenu('transport');
  }

  return (
    <section className="page cloud-drive">
      <aside className={clsx('module-sidebar', store.isSidebarCollapsed && 'collapsed')}>
        <button className="sidebar-toggle" type="button" onClick={store.toggleSidebar}>
          <ChevronDown size={16} />
        </button>
        {menuItems.map((item) => (
          <button
            key={item.key}
            className={clsx('module-nav-item', store.activeMenu === item.key && 'active')}
            type="button"
            onClick={() => store.setActiveMenu(item.key)}
            title={item.label}
          >
            <item.icon size={18} />
            <span>{item.label}</span>
          </button>
        ))}
        <div className="module-sidebar-actions">
          <button type="button" onClick={queueUpload}>
            <Upload size={16} />
            <span>上传文件</span>
          </button>
          <button type="button">
            <FolderPlus size={16} />
            <span>新建文件夹</span>
          </button>
        </div>
      </aside>

      <div className="module-content">
        <header className="page-header">
          <div>
            <h1>网盘</h1>
            <p>已按原 Vue 模块拆成目录、文件、传输、标注进程和视频摘要视图。</p>
          </div>
          <div className="toolbar">
            <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索网盘内容" />
            <button type="button" onClick={refresh} disabled={loading}>
              <RefreshCw size={16} />
              <span>{loading ? '刷新中' : '刷新'}</span>
            </button>
          </div>
        </header>

        {store.activeMenu === 'transport' ? (
          <TransferPanel />
        ) : store.activeMenu === 'annotation' || store.activeMenu === 'videoSummary' ? (
          <PlaceholderView title={store.activeMenu === 'annotation' ? '标注进程' : '视频摘要'} />
        ) : (
          <CloudFileTable items={filteredObjects} selectedIds={store.selectedIds} onToggle={store.toggleSelection} />
        )}
      </div>
    </section>
  );
}

function PlaceholderView({ title }: { title: string }) {
  return (
    <div className="empty-state">
      <File size={28} />
      <strong>{title}</strong>
      <span>原模块逻辑已定位，下一步迁移接口、任务轮询和详情弹窗。</span>
    </div>
  );
}
