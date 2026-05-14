import { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  Copy,
  Download,
  File,
  FileText,
  Folder,
  FolderPlus,
  LayoutGrid,
  HardDrive,
  Image,
  Inbox,
  Link as LinkIcon,
  List,
  MessageSquare,
  MoreVertical,
  Music,
  RefreshCw,
  Search,
  Share2,
  Trash2,
  Upload,
  UserRound,
  Video
} from 'lucide-react';
import clsx from 'clsx';
import {
  cancelDirectShare,
  cancelUpload,
  completeUpload,
  createFolder,
  createShareLink,
  createUploadTicket,
  getMe,
  initUpload,
  instantUpload,
  listDirectInbox,
  listDriveNodes,
  listRecycleBin,
  moveNode,
  permanentDeleteNode,
  recycleNode,
  registerUploadChunk,
  renameNode,
  restoreNode,
  saveDirectShare,
  type DirectShareView,
  type DriveNodeView
} from './api/netdisk';
import { useCloudDriveStore, type CloudMenuKey, type FileCategory, type UploadState } from './cloudDriveStore';
import { CloudFileTable, formatSize, type CloudFileViewMode } from './components/CloudFileTable';
import { TransferPanel } from './components/TransferPanel';

interface CloudDrivePageProps {
  initialMenu?: CloudMenuKey;
}

const categories: Array<{ key: FileCategory; label: string; icon: typeof Folder }> = [
  { key: 'all', label: '全部文件', icon: Folder },
  { key: 'document', label: '文档', icon: FileText },
  { key: 'video', label: '视频', icon: Video },
  { key: 'audio', label: '音频', icon: Music },
  { key: 'image', label: '图片', icon: Image },
  { key: 'other', label: '其它', icon: MoreVertical }
];

const utilityItems: Array<{ key: CloudMenuKey; label: string; icon: typeof Folder }> = [
  { key: 'recycle', label: '回收站', icon: Trash2 },
  { key: 'share', label: '分享中心', icon: Share2 },
  { key: 'direct', label: '站内消息', icon: Inbox },
  { key: 'account', label: '账号容量', icon: UserRound },
  { key: 'transport', label: '传输列表', icon: Download }
];

const viewOptions: Array<{ key: CloudFileViewMode; label: string }> = [
  { key: 'list', label: '列表模式' },
  { key: 'thumb', label: '缩略模式' },
  { key: 'large', label: '大图模式' }
];

export function CloudDrivePage({ initialMenu }: CloudDrivePageProps) {
  const store = useCloudDriveStore();
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [shareDraft, setShareDraft] = useState<DriveNodeView | null>(null);
  const [isFileGroupOpen, setIsFileGroupOpen] = useState(false);
  const [viewMode, setViewMode] = useState<CloudFileViewMode>('thumb');
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);

  const selectedNode = useMemo(() => store.nodes.find((item) => item.id === store.selectedId) || null, [store.nodes, store.selectedId]);
  const visibleNodes = useMemo(() => {
    const keyword = store.keyword.trim().toLowerCase();
    return store.nodes.filter((node) => {
      const keywordMatched = !keyword || node.name.toLowerCase().includes(keyword);
      const categoryMatched = store.category === 'all' || node.nodeType === 'FOLDER' || detectCategory(node.name, node.mimeType || undefined) === store.category;
      return keywordMatched && categoryMatched;
    });
  }, [store.nodes, store.keyword, store.category]);

  useEffect(() => {
    if (initialMenu) store.setActiveMenu(initialMenu);
  }, [initialMenu]);

  useEffect(() => {
    const unsubscribe = window.surgicol.cloud.onUploadDriveFileProgress((progress) => {
      const state = useCloudDriveStore.getState();
      const current = state.uploadStates.find((item) => item.taskId === progress.taskId) || state.uploadState;
      if (!current || current.taskId !== progress.taskId) return;
      if (current.status === 'canceled') return;
      state.upsertUploadState({
        ...current,
        percent: progress.percent,
        status: progress.status === 'failed' ? 'failed' : progress.status === 'done' ? 'finishing' : 'uploading',
        message: progress.message
      });
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (store.activeMenu === 'files') refreshFiles();
    if (store.activeMenu === 'recycle') refreshRecycle();
    if (store.activeMenu === 'direct') refreshDirectInbox();
    if (store.activeMenu === 'account') refreshMe();
  }, [store.activeMenu, store.currentFolderId]);

  async function run(action: () => Promise<void>, success?: string) {
    setLoading(true);
    try {
      await action();
      if (success) toast(success);
    } catch (error) {
      toast(error instanceof Error ? error.message : '操作失败');
    } finally {
      setLoading(false);
    }
  }

  function toast(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2600);
  }

  async function refreshFiles() {
    await run(async () => {
      const result = await listDriveNodes(store.currentFolderId);
      store.setNodes(result.nodes);
    });
  }

  async function refreshRecycle() {
    await run(async () => store.setRecycleNodes(await listRecycleBin()));
  }

  async function refreshDirectInbox() {
    await run(async () => store.setDirectInbox(await listDirectInbox()));
  }

  async function refreshMe() {
    await run(async () => store.setCurrentUser(await getMe()));
  }

  async function createFolderFromPrompt() {
    const name = window.prompt('请输入文件夹名称');
    if (!name?.trim()) return;
    await run(async () => {
      await createFolder({ parentId: store.currentFolderId, name: name.trim() });
      await refreshFiles();
    }, '文件夹已创建');
  }

  async function renameFromPrompt(node = selectedNode) {
    if (!node) return toast('请先选择文件或文件夹');
    const name = window.prompt('请输入新名称', node.name);
    if (!name?.trim()) return;
    await run(async () => {
      await renameNode(node.id, { name: name.trim() });
      await refreshFiles();
    }, '已重命名');
  }

  async function moveFromPrompt(node = selectedNode) {
    if (!node) return toast('请先选择文件或文件夹');
    const targetParentId = window.prompt('目标文件夹 UUID，留空移动到根目录');
    await run(async () => {
      await moveNode(node.id, { targetParentId: targetParentId?.trim() || null });
      await refreshFiles();
    }, '已移动');
  }

  async function recycleSelected(node = selectedNode) {
    if (!node) return toast('请先选择文件或文件夹');
    await run(async () => {
      await recycleNode(node.id);
      await refreshFiles();
    }, '已移入回收站');
  }

  async function restoreFromRecycle(node: DriveNodeView) {
    await run(async () => {
      await restoreNode(node.id);
      await refreshRecycle();
      await refreshFiles();
    }, '已恢复');
  }

  async function permanentDeleteFromRecycle(node: DriveNodeView) {
    await run(async () => {
      await permanentDeleteNode(node.id);
      await refreshRecycle();
      await refreshMe();
    }, '已彻底删除');
  }

  async function uploadFiles() {
    const localPaths = await window.surgicol.dialog.openFiles();
    if (!localPaths.length) return;
    const queuedUploads: UploadState[] = localPaths.map((localPath) => ({
      id: createUploadId(),
      fileName: fileNameFromPath(localPath),
      localPath,
      percent: 0,
      status: 'queued'
    }));
    store.setUploadStates(queuedUploads);
    for (let index = 0; index < localPaths.length; index += 1) {
      await uploadOne(localPaths[index], queuedUploads[index].id);
    }
  }

  async function uploadOne(localPath: string, uploadId: string) {
    await run(async () => {
      if (!updateUploadState(uploadId, { percent: 1, status: 'hashing' })) return;
      const fileInfo = await window.surgicol.cloud.inspectDriveFile(localPath);
      if (!updateUploadState(uploadId, { fileName: fileInfo.name, size: fileInfo.size, localPath: fileInfo.localPath, percent: 2, status: 'hashing' })) return;
      const instant = await instantUpload({ parentId: store.currentFolderId, fileName: fileInfo.name, sha256: fileInfo.sha256 });
      if (instant.hit) {
        updateUploadState(uploadId, { fileName: fileInfo.name, size: fileInfo.size, percent: 100, status: 'done', message: '秒传成功' });
        await refreshFiles();
        await refreshMe();
        return;
      }

      if (!updateUploadState(uploadId, { fileName: fileInfo.name, size: fileInfo.size, percent: 3, status: 'preparing' })) return;
      const uploadTask = await initUpload({
        fileName: fileInfo.name,
        sha256: fileInfo.sha256,
        totalBytes: Math.max(fileInfo.size, 1),
        chunkSize: Math.max(fileInfo.size, 1),
        contentType: fileInfo.contentType
      });
      if (!updateUploadState(uploadId, { taskId: uploadTask.id, fileName: fileInfo.name, size: fileInfo.size, percent: 6, status: 'preparing' })) {
        await cancelUpload(uploadTask.id);
        return;
      }
      const ticket = await createUploadTicket(uploadTask.id, {
        fileName: fileInfo.name,
        contentType: fileInfo.contentType,
        size: Math.max(fileInfo.size, 1)
      });
      if (!updateUploadState(uploadId, { taskId: uploadTask.id, fileName: fileInfo.name, size: fileInfo.size, percent: 8, status: 'uploading' })) {
        await cancelUpload(uploadTask.id);
        return;
      }
      await window.surgicol.cloud.uploadDriveFile(localPath, {
        taskId: uploadTask.id,
        uploadUrl: ticket.uploadUrl,
        bucket: ticket.bucket,
        objectKey: ticket.objectKey,
        contentType: ticket.contentType || fileInfo.contentType
      });
      await registerUploadChunk(uploadTask.id, { chunkIndex: 0, sizeBytes: Math.max(fileInfo.size, 1), checksum: fileInfo.sha256 });
      if (!updateUploadState(uploadId, { taskId: uploadTask.id, fileName: fileInfo.name, size: fileInfo.size, percent: 96, status: 'finishing' })) return;
      await completeUpload(uploadTask.id, { parentId: store.currentFolderId, ossKey: ticket.objectKey, contentType: ticket.contentType || fileInfo.contentType });
      updateUploadState(uploadId, { taskId: uploadTask.id, fileName: fileInfo.name, size: fileInfo.size, percent: 100, status: 'done' });
      await refreshFiles();
      await refreshMe();
    }, '上传完成');
  }

  function updateUploadState(uploadId: string, patch: Partial<UploadState>) {
    const current = useCloudDriveStore.getState().uploadStates.find((item) => item.id === uploadId);
    if (!current || current.status === 'canceled') return false;
    store.upsertUploadState({ ...current, ...patch, id: uploadId });
    return true;
  }

  function openFolder(node: DriveNodeView) {
    store.enterFolder(node);
  }

  function previewNode(node: DriveNodeView) {
    if (node.nodeType !== 'FILE') return;
    if (!node.previewUrl && !node.downloadUrl) return toast('当前文件没有可用预览地址');
    store.setPreviewState({ node, url: node.previewUrl || node.downloadUrl || '' });
  }

  function downloadNode(node: DriveNodeView) {
    const url = node.downloadUrl || node.previewUrl;
    if (!url) return toast('当前文件没有可用下载地址');
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = node.name;
    anchor.target = '_blank';
    anchor.click();
  }

  async function createShare(node: DriveNodeView, settings: { extractCode?: string; validityDays?: number | null }) {
    await run(async () => {
      const share = await createShareLink({
        fileNodeIds: [node.id],
        extractCode: settings.extractCode || null,
        validityDays: settings.validityDays,
        allowPreview: true,
        allowDownload: true
      });
      store.setShareResult({ ...share, extractCode: settings.extractCode || '' });
      setShareDraft(null);
      store.setActiveMenu('share');
    }, '分享链接已生成');
  }

  async function saveDirect(item: DirectShareView) {
    await run(async () => {
      await saveDirectShare(item.id, { targetParentId: store.currentFolderId });
      await refreshDirectInbox();
      await refreshFiles();
      await refreshMe();
    }, '已保存到我的网盘');
  }

  async function cancelDirect(item: DirectShareView) {
    await run(async () => {
      await cancelDirectShare(item.id);
      await refreshDirectInbox();
    }, '已取消站内分享');
  }

  function selectCategory(category: FileCategory) {
    store.setActiveMenu('files');
    store.setCategory(category);
  }

  function openUtility(menu: CloudMenuKey) {
    store.setActiveMenu(menu);
    store.setCategory('all');
  }

  const quotaPercent = store.currentUser && store.currentUser.quotaTotal > 0
    ? Math.min(100, Math.round((store.currentUser.quotaUsed / store.currentUser.quotaTotal) * 100))
    : 0;

  return (
    <section className="page cloud-drive cloud-drive-product">
      <aside className="cloud-drive-sidebar">
        <div className="cloud-drive-category-card">
          <button
            className={clsx('cloud-drive-section-title', store.activeMenu === 'files' && 'active', isFileGroupOpen && 'open')}
            type="button"
            onClick={() => setIsFileGroupOpen((open) => !open)}
          >
            <ChevronDown className="cloud-drive-section-arrow" size={14} />
            <span>我的文件</span>
          </button>
          {isFileGroupOpen ? (
            <div className="cloud-drive-category-list">
              {categories.map((item) => (
                <button
                  key={item.key}
                  className={clsx(store.activeMenu === 'files' && store.category === item.key && 'active')}
                  type="button"
                  onClick={() => selectCategory(item.key)}
                >
                  <item.icon size={16} />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="cloud-drive-utility-list">
          {utilityItems.map((item) => (
            <button
              key={item.key}
              className={clsx(store.activeMenu === item.key && 'active')}
              type="button"
              onClick={() => openUtility(item.key)}
            >
              <item.icon size={17} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        <div className="cloud-drive-quick">
          <button type="button" disabled>
            <ChevronDown size={13} />
            <span>快捷访问</span>
          </button>
          <div>+ 拖入常用文件夹</div>
        </div>

        <div className="cloud-drive-quota">
          <progress value={quotaPercent} max={100} />
          <span>
            {store.currentUser ? `${formatSize(store.currentUser.quotaUsed)}/${formatSize(store.currentUser.quotaTotal)}` : '0 B/0 B'}
          </span>
        </div>
      </aside>

      <main className="cloud-drive-main">
        <header className="cloud-drive-filebar">
          <div className="cloud-drive-primary-actions">
            <button className="cloud-drive-upload-button" type="button" onClick={uploadFiles}>
              <Upload size={17} />
              <span>上传</span>
            </button>
            <button type="button" onClick={createFolderFromPrompt}>
              <FolderPlus size={17} />
              <span>新建文件夹</span>
            </button>
          </div>
          <div className="cloud-drive-filebar-right">
            <div className="cloud-search">
              <Search size={15} />
              <input value={store.keyword} onChange={(event) => store.setKeyword(event.target.value)} placeholder="搜索我的文件" />
            </div>
            <button type="button" onClick={() => refreshCurrent()} disabled={loading}>
              <RefreshCw size={16} />
              <span>{loading ? '刷新中' : '搜索'}</span>
            </button>
          </div>
        </header>

        {store.activeMenu === 'files' ? (
          <>
            <div className="cloud-drive-file-heading">
              <DirectoryBar />
              <div className="cloud-drive-file-title-row">
                <div className="cloud-drive-file-title-left">
                  <strong>全部文件</strong>
                  <label className="cloud-drive-select-all" title="批量操作暂未开放">
                    <input type="checkbox" disabled />
                    <span>全选</span>
                  </label>
                </div>
                <div className="cloud-view-switcher">
                  <button
                    className="cloud-view-button"
                    type="button"
                    title="切换显示模式"
                    onClick={() => setIsViewMenuOpen((open) => !open)}
                  >
                    {viewMode === 'list' ? <List size={17} /> : <LayoutGrid size={17} />}
                  </button>
                  {isViewMenuOpen ? (
                    <div className="cloud-view-menu">
                      {viewOptions.map((item) => (
                        <button
                          key={item.key}
                          className={viewMode === item.key ? 'active' : undefined}
                          type="button"
                          onClick={() => {
                            setViewMode(item.key);
                            setIsViewMenuOpen(false);
                          }}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
            <CloudFileTable
              items={visibleNodes}
              selectedId={store.selectedId}
              viewMode={viewMode}
              onSelect={store.setSelectedId}
              onOpenFolder={openFolder}
              onPreview={previewNode}
              onDownload={downloadNode}
              onRename={renameFromPrompt}
              onMove={moveFromPrompt}
              onRecycle={recycleSelected}
              onShare={setShareDraft}
            />
          </>
        ) : null}

        {store.activeMenu === 'recycle' ? <RecyclePanel onRestore={restoreFromRecycle} onPermanentDelete={permanentDeleteFromRecycle} /> : null}
        {store.activeMenu === 'share' ? <ShareCenter /> : null}
        {store.activeMenu === 'direct' ? <DirectSharePanel onSave={saveDirect} onCancel={cancelDirect} /> : null}
        {store.activeMenu === 'account' ? <AccountPanel /> : null}
        {store.activeMenu === 'transport' ? <TransferPanel /> : null}
      </main>

      {shareDraft ? <ShareDialog node={shareDraft} onClose={() => setShareDraft(null)} onCreate={createShare} /> : null}
      {store.previewState ? <PreviewModal /> : null}
      {notice ? <div className="toast">{notice}</div> : null}
    </section>
  );

  function refreshCurrent() {
    if (store.activeMenu === 'files') return refreshFiles();
    if (store.activeMenu === 'recycle') return refreshRecycle();
    if (store.activeMenu === 'direct') return refreshDirectInbox();
    if (store.activeMenu === 'account') return refreshMe();
    return Promise.resolve();
  }
}

function DirectoryBar() {
  const store = useCloudDriveStore();
  const canGoParent = store.breadcrumbs.length > 1;
  const goParentFolder = () => {
    if (!canGoParent) return;
    store.jumpToBreadcrumb(store.breadcrumbs.length - 2);
  };

  return (
    <div className="cloud-directory-bar">
      <button className="cloud-parent-button" type="button" disabled={!canGoParent} onClick={goParentFolder}>
        <ChevronLeft size={15} />
        <span>返回上一级</span>
      </button>
      <nav className="cloud-breadcrumbs" aria-label="当前目录路径">
        {store.breadcrumbs.map((item, index) => (
          <button key={`${item.id || 'root'}-${index}`} type="button" onClick={() => store.jumpToBreadcrumb(index)}>
            {item.name}
          </button>
        ))}
      </nav>
    </div>
  );
}

function RecyclePanel({ onRestore, onPermanentDelete }: { onRestore: (node: DriveNodeView) => void; onPermanentDelete: (node: DriveNodeView) => void }) {
  const nodes = useCloudDriveStore((store) => store.recycleNodes);
  return (
    <div className="panel-pane">
      <div className="section-header">
        <h2>回收站</h2>
        <span>文件在这里可恢复或彻底删除</span>
      </div>
      <div className="cloud-list-cards">
        {nodes.map((node) => (
          <article key={node.id}>
            <div className="file-name">
              {node.nodeType === 'FOLDER' ? <Folder size={18} /> : <File size={18} />}
              <strong>{node.name}</strong>
            </div>
            <span>{node.nodeType === 'FOLDER' ? '文件夹' : formatSize(node.size)}</span>
            <div>
              <button type="button" onClick={() => onRestore(node)}>
                恢复
              </button>
              <button className="danger" type="button" onClick={() => onPermanentDelete(node)}>
                彻底删除
              </button>
            </div>
          </article>
        ))}
      </div>
      {nodes.length === 0 ? <div className="empty-state compact">回收站为空</div> : null}
    </div>
  );
}

function ShareCenter() {
  const store = useCloudDriveStore();
  const resultUrl = store.shareResult ? buildShareUrl(store.shareResult.shareCode, store.shareResult.extractCode) : '';
  return (
    <div className="share-workspace">
      <section className="share-card">
        <header>
          <LinkIcon size={18} />
          <strong>最近生成的链接</strong>
        </header>
        {store.shareResult ? (
          <div className="share-result">
            <span>分享码：{store.shareResult.shareCode}</span>
            <span>提取码：{store.shareResult.extractCode || '无'}</span>
            <span>过期时间：{store.shareResult.expireAt || '长期有效'}</span>
            <input readOnly value={resultUrl} />
            <button type="button" onClick={() => navigator.clipboard.writeText(resultUrl)}>
              <Copy size={16} />
              复制链接
            </button>
          </div>
        ) : (
          <div className="empty-state compact">选择文件后可生成公开分享链接</div>
        )}
      </section>
    </div>
  );
}

function DirectSharePanel({ onSave, onCancel }: { onSave: (item: DirectShareView) => void; onCancel: (item: DirectShareView) => void }) {
  const inbox = useCloudDriveStore((store) => store.directInbox);
  return (
    <div className="panel-pane">
      <div className="section-header">
        <h2>站内分享</h2>
        <span>接收并保存其他用户发来的文件</span>
      </div>
      <div className="cloud-list-cards">
        {inbox.map((item) => (
          <article key={item.id}>
            <div className="file-name">
              <MessageSquare size={18} />
              <strong>{item.node?.name || item.id}</strong>
            </div>
            <span>{item.saved ? '已保存' : item.status}</span>
            <div>
              <button type="button" disabled={item.saved || item.canceled} onClick={() => onSave(item)}>
                保存
              </button>
              <button type="button" onClick={() => onCancel(item)}>
                取消
              </button>
            </div>
          </article>
        ))}
      </div>
      {inbox.length === 0 ? <div className="empty-state compact">暂无站内分享</div> : null}
    </div>
  );
}

function AccountPanel() {
  const user = useCloudDriveStore((store) => store.currentUser);
  if (!user) return <div className="empty-state compact">正在加载账号信息</div>;
  const percent = user.quotaTotal > 0 ? Math.min(100, Math.round((user.quotaUsed / user.quotaTotal) * 100)) : 0;
  return (
    <div className="account-panel">
      <div className="account-card">
        <UserRound size={26} />
        <strong>{user.displayName || user.username}</strong>
        <span>{user.email || user.phone || user.id}</span>
      </div>
      <div className="account-card">
        <HardDrive size={26} />
        <strong>容量使用</strong>
        <progress value={percent} max={100} />
        <span>
          {formatSize(user.quotaUsed)} / {formatSize(user.quotaTotal)}，剩余 {formatSize(user.quotaRemaining)}
        </span>
      </div>
    </div>
  );
}

function ShareDialog({ node, onClose, onCreate }: { node: DriveNodeView; onClose: () => void; onCreate: (node: DriveNodeView, settings: { extractCode?: string; validityDays?: number | null }) => void }) {
  const [validityDays, setValidityDays] = useState<number | null>(7);
  const [extractCode, setExtractCode] = useState(randomCode());
  return (
    <div className="modal-mask">
      <div className="cloud-dialog">
        <header>
          <strong>创建分享：{node.name}</strong>
          <button type="button" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="dialog-body">
          <label>有效期</label>
          <div className="seg">
            {[1, 7, 30, 365].map((day) => (
              <button key={day} className={validityDays === day ? 'active' : undefined} type="button" onClick={() => setValidityDays(day)}>
                {day}天
              </button>
            ))}
            <button className={validityDays === null ? 'active' : undefined} type="button" onClick={() => setValidityDays(null)}>
              永久
            </button>
          </div>
          <label>提取码</label>
          <input value={extractCode} maxLength={8} onChange={(event) => setExtractCode(event.target.value)} />
        </div>
        <footer>
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button className="primary-action" type="button" onClick={() => onCreate(node, { extractCode, validityDays })}>
            生成链接
          </button>
        </footer>
      </div>
    </div>
  );
}

function PreviewModal() {
  const preview = useCloudDriveStore((store) => store.previewState);
  const setPreview = useCloudDriveStore((store) => store.setPreviewState);
  if (!preview) return null;
  const name = preview.node.name;
  const mimeType = preview.node.mimeType || '';
  return (
    <div className="modal-mask">
      <div className="cloud-preview-dialog">
        <header>
          <strong>{name}</strong>
          <button type="button" onClick={() => setPreview(null)}>
            ×
          </button>
        </header>
        <div>
          {mimeType.startsWith('image/') ? <img src={preview.url} alt={name} /> : null}
          {mimeType.startsWith('video/') ? <video src={preview.url} controls /> : null}
          {mimeType.startsWith('audio/') ? <audio src={preview.url} controls /> : null}
          {mimeType === 'application/pdf' || /\.pdf$/i.test(name) ? <iframe title={name} src={preview.url} /> : null}
          {!mimeType.startsWith('image/') && !mimeType.startsWith('video/') && !mimeType.startsWith('audio/') && mimeType !== 'application/pdf' && !/\.pdf$/i.test(name) ? (
            <div className="empty-state compact">
              <File size={24} />
              当前类型暂不支持内嵌预览，请下载查看。
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function detectCategory(name = '', mimeType?: string): FileCategory {
  if (mimeType?.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp|bmp|svg)$/i.test(name)) return 'image';
  if (mimeType?.startsWith('video/') || /\.(mp4|webm|mov|avi|mkv)$/i.test(name)) return 'video';
  if (/\.torrent$/i.test(name)) return 'torrent';
  if (mimeType?.startsWith('audio/') || /\.(mp3|wav|flac|aac|ogg)$/i.test(name)) return 'audio';
  if (/\.(doc|docx|pdf|txt|html|md|xls|xlsx|ppt|pptx)$/i.test(name)) return 'document';
  return 'other';
}

function createUploadId() {
  return `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function fileNameFromPath(localPath: string) {
  return localPath.split(/[\\/]/).pop() || localPath;
}

function buildShareUrl(shareCode: string, extractCode?: string) {
  const base = `${window.location.origin}/share/${shareCode}`;
  return extractCode ? `${base}?code=${encodeURIComponent(extractCode)}` : base;
}

function randomCode() {
  return Math.random().toString(36).slice(2, 6);
}
