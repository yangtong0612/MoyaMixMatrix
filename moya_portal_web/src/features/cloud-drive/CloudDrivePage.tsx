import { useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent } from 'react';
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
  completeUpload,
  createFolder,
  createShareLink,
  createUploadTicket,
  getUploadTask,
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
  type DriveNodeView,
  type ShareLinkView
} from './api/netdisk';
import { useCloudDriveStore, type CloudMenuKey, type FileCategory, type UploadState } from './cloudDriveStore';
import { CloudFileTable, formatSize, type CloudFileViewMode } from './components/CloudFileTable';
import { DocumentPreview } from './components/DocumentPreview';
import { TransferPanel } from './components/TransferPanel';
import './cloudDrive.css';

interface CloudDrivePageProps {
  initialMenu?: CloudMenuKey;
}

interface MoveBreadcrumbItem {
  id: string | null;
  name: string;
}

type FileOperationDialogState =
  | { kind: 'create-folder'; value: string }
  | { kind: 'rename'; node: DriveNodeView; value: string }
  | {
      kind: 'move';
      node: DriveNodeView;
      nodes?: DriveNodeView[];
      targetParentId: string | null;
      targetName: string;
      browseParentId: string | null;
      breadcrumbs: MoveBreadcrumbItem[];
      folders: DriveNodeView[];
      loadingFolders: boolean;
    };

type ConfirmDialogState =
  | { kind: 'recycle'; nodes: DriveNodeView[] }
  | { kind: 'permanent-delete'; nodes: DriveNodeView[] };

interface LocalUploadFileEntry {
  localPath: string;
  name: string;
  size: number;
  relativeDir: string;
}

interface LocalUploadFolderEntry {
  name: string;
  relativePath: string;
}

interface LocalUploadPlan {
  files: LocalUploadFileEntry[];
  folders: LocalUploadFolderEntry[];
  errors?: Array<{ localPath: string; message: string }>;
}

const categories: Array<{ key: FileCategory; label: string; icon: typeof Folder }> = [
  { key: 'all', label: '全部文件', icon: Folder },
  { key: 'document', label: '文档', icon: FileText },
  { key: 'video', label: '视频', icon: Video },
  { key: 'audio', label: '音频', icon: Music },
  { key: 'image', label: '图片', icon: Image },
  { key: 'other', label: '其它', icon: MoreVertical }
];

const uploadChunkSize = 16 * 1024 * 1024;
const maxFileUploads = 3;
const maxPartUploadsPerFile = 3;

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
  const [shareDraft, setShareDraft] = useState<DriveNodeView[] | null>(null);
  const [isFileGroupOpen, setIsFileGroupOpen] = useState(false);
  const [viewMode, setViewMode] = useState<CloudFileViewMode>('thumb');
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const [fileOperation, setFileOperation] = useState<FileOperationDialogState | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [detailNode, setDetailNode] = useState<DriveNodeView | null>(null);
  const [isExternalDragOver, setIsExternalDragOver] = useState(false);
  const quotaRefreshTimerRef = useRef<number | null>(null);
  const externalDragDepthRef = useRef(0);

  const selectedNode = useMemo(() => store.nodes.find((item) => store.selectedIds.includes(item.id)) || null, [store.nodes, store.selectedIds]);
  const selectedNodes = useMemo(() => store.nodes.filter((item) => store.selectedIds.includes(item.id)), [store.nodes, store.selectedIds]);
  const visibleNodes = useMemo(() => {
    const keyword = store.keyword.trim().toLowerCase();
    return store.nodes.filter((node) => {
      const keywordMatched = !keyword || node.name.toLowerCase().includes(keyword);
      const categoryMatched = store.category === 'all' || node.nodeType === 'FOLDER' || detectCategory(node.name, node.mimeType || undefined) === store.category;
      return keywordMatched && categoryMatched;
    });
  }, [store.nodes, store.keyword, store.category]);
  const visibleIds = useMemo(() => visibleNodes.map((node) => node.id), [visibleNodes]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => store.selectedIds.includes(id));

  useEffect(() => {
    if (initialMenu) store.setActiveMenu(initialMenu);
  }, [initialMenu]);

  useEffect(() => {
    const onProgress = window.surgicol?.cloud?.onUploadDriveFileProgress;
    if (!onProgress) return undefined;
    const unsubscribe = onProgress((progress) => {
      const state = useCloudDriveStore.getState();
      const current = state.uploadStates.find((item) => item.taskId === progress.taskId) || state.uploadState;
      if (!current || current.taskId !== progress.taskId) return;
      if (current.status === 'canceled') return;
      const totalChunks = Math.max(current.totalChunks || 1, 1);
      const completedChunks = new Set(current.uploadedIndexes || []).size;
      const chunkProgress = typeof progress.chunkIndex === 'number' ? Math.min(1, Math.max(0, progress.percent / 100)) : 0;
      const uploadPercent = Math.round(8 + Math.min(88, ((completedChunks + chunkProgress) / totalChunks) * 88));
      state.upsertUploadState({
        ...current,
        percent: uploadPercent,
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

  useEffect(() => {
    const resume = (event: Event) => {
      const uploadId = (event as CustomEvent<string>).detail;
      if (!uploadId) return;
      const state = useCloudDriveStore.getState().uploadStates.find((item) => item.id === uploadId);
      if (!state?.localPath) return;
      uploadOne(state.localPath, state.id);
    };
    window.addEventListener('moya-cloud-resume-upload', resume);
    return () => window.removeEventListener('moya-cloud-resume-upload', resume);
  }, []);

  useEffect(() => () => {
    if (quotaRefreshTimerRef.current) {
      window.clearTimeout(quotaRefreshTimerRef.current);
    }
  }, []);

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

  function hasNameConflict(name: string, excludeId: string | null) {
    const normalized = name.trim().toLowerCase();
    const currentParentId = store.currentFolderId || null;
    return store.nodes.some((node) => node.id !== excludeId && (node.parentId || null) === currentParentId && node.name.trim().toLowerCase() === normalized);
  }

  function hasInvalidName(name: string) {
    return /[\\/:*?"<>|]/.test(name);
  }

  function isExternalFileDrag(event: DragEvent<HTMLElement>) {
    return Array.from(event.dataTransfer.types || []).includes('Files');
  }

  function handleExternalDragEnter(event: DragEvent<HTMLElement>) {
    if (!isExternalFileDrag(event)) return;
    event.preventDefault();
    externalDragDepthRef.current += 1;
    setIsExternalDragOver(true);
  }

  function handleExternalDragOver(event: DragEvent<HTMLElement>) {
    if (!isExternalFileDrag(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setIsExternalDragOver(true);
  }

  function handleExternalDragLeave(event: DragEvent<HTMLElement>) {
    if (!isExternalFileDrag(event)) return;
    externalDragDepthRef.current = Math.max(0, externalDragDepthRef.current - 1);
    if (externalDragDepthRef.current === 0) setIsExternalDragOver(false);
  }

  async function handleExternalDrop(event: DragEvent<HTMLElement>) {
    if (!isExternalFileDrag(event)) return;
    event.preventDefault();
    externalDragDepthRef.current = 0;
    setIsExternalDragOver(false);
    if (store.activeMenu !== 'files') {
      toast('请先进入网盘文件列表后再拖拽上传');
      return;
    }
    const getDroppedPath = window.surgicol?.file?.getDroppedPath;
    if (!getDroppedPath) {
      toast('请在 Electron 客户端中使用拖拽上传');
      return;
    }
    const localPaths = Array.from(event.dataTransfer.files || [])
      .map((file) => getDroppedPath(file))
      .filter(Boolean);
    if (!localPaths.length) return;
    await enqueueLocalUploads(localPaths, 'drop');
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
    await run(refreshAccountQuota);
  }

  async function refreshAccountQuota() {
    store.setCurrentUser(await getMe());
  }

  function scheduleAccountQuotaRefresh() {
    if (quotaRefreshTimerRef.current) {
      window.clearTimeout(quotaRefreshTimerRef.current);
    }
    quotaRefreshTimerRef.current = window.setTimeout(() => {
      quotaRefreshTimerRef.current = null;
      void refreshAccountQuotaSilently();
    }, 350);
  }

  async function flushAccountQuotaRefresh() {
    if (quotaRefreshTimerRef.current) {
      window.clearTimeout(quotaRefreshTimerRef.current);
      quotaRefreshTimerRef.current = null;
    }
    await refreshAccountQuotaSilently();
  }

  async function refreshAccountQuotaSilently() {
    try {
      await refreshAccountQuota();
    } catch {
      // 容量刷新失败不应该把已经完成的上传标记为失败。
    }
  }

  function openCreateFolderDialog() {
    setFileOperation({ kind: 'create-folder', value: '' });
  }

  function openRenameDialog(node = selectedNode) {
    if (!node) return toast('请先选择文件或文件夹');
    setFileOperation({ kind: 'rename', node, value: node.name });
  }

  async function openMoveDialog(node = selectedNode, nodes?: DriveNodeView[]) {
    if (!node) return toast('请先选择文件或文件夹');
    const initialOperation: FileOperationDialogState = {
      kind: 'move',
      node,
      nodes,
      targetParentId: null,
      targetName: '根目录',
      browseParentId: null,
      breadcrumbs: [{ id: null, name: '根目录' }],
      folders: [],
      loadingFolders: true
    };
    setFileOperation(initialOperation);
    await loadMoveFolders(initialOperation, null, [{ id: null, name: '根目录' }]);
  }

  async function submitFileOperation(operation: FileOperationDialogState) {
    const value = operation.kind === 'move' ? '' : operation.value.trim();
    if (operation.kind !== 'move' && !value) {
      toast(operation.kind === 'create-folder' ? '请输入文件夹名称' : '请输入新名称');
      return;
    }
    if (operation.kind !== 'move' && hasInvalidName(value)) {
      toast('文件名不能包含 \\ / : * ? " < > |');
      return;
    }
    if (operation.kind === 'create-folder' && hasNameConflict(value, null)) {
      toast('当前目录已存在同名文件或文件夹');
      return;
    }
    if (operation.kind === 'rename' && hasNameConflict(value, operation.node.id)) {
      toast('当前目录已存在同名文件或文件夹');
      return;
    }
    await run(async () => {
      if (operation.kind === 'create-folder') {
        await createFolder({ parentId: store.currentFolderId, name: value });
      }
      if (operation.kind === 'rename') {
        await renameNode(operation.node.id, { name: value });
      }
      if (operation.kind === 'move') {
        for (const node of operation.nodes || [operation.node]) {
          await moveNode(node.id, { targetParentId: operation.targetParentId });
        }
      }
      await refreshFiles();
      store.clearSelection();
      setFileOperation(null);
    }, operation.kind === 'create-folder' ? '文件夹已创建' : operation.kind === 'rename' ? '已重命名' : '已移动');
  }

  async function loadMoveFolders(operation: Extract<FileOperationDialogState, { kind: 'move' }>, parentId: string | null, breadcrumbs: MoveBreadcrumbItem[]) {
    setFileOperation((current) => {
      if (!isSameMoveOperation(current, operation)) return current;
      return { ...current, browseParentId: parentId, breadcrumbs, loadingFolders: true };
    });
    try {
      const result = await listDriveNodes(parentId);
      const movingIds = new Set((operation.nodes || [operation.node]).map((node) => node.id));
      const folders = result.nodes.filter((node) => node.nodeType === 'FOLDER' && !movingIds.has(node.id));
      setFileOperation((current) => {
        if (!isSameMoveOperation(current, operation)) return current;
        return { ...current, browseParentId: parentId, breadcrumbs, folders, loadingFolders: false };
      });
    } catch (error) {
      toast(error instanceof Error ? error.message : '加载文件夹失败');
      setFileOperation((current) => {
        if (!isSameMoveOperation(current, operation)) return current;
        return { ...current, loadingFolders: false };
      });
    }
  }

  function selectMoveTarget(operation: Extract<FileOperationDialogState, { kind: 'move' }>, targetParentId: string | null, targetName: string) {
    setFileOperation((current) => {
      if (!isSameMoveOperation(current, operation)) return current;
      return { ...current, targetParentId, targetName };
    });
  }

  async function enterMoveFolder(operation: Extract<FileOperationDialogState, { kind: 'move' }>, folder: DriveNodeView) {
    await loadMoveFolders(operation, folder.id, [...operation.breadcrumbs, { id: folder.id, name: folder.name }]);
  }

  async function jumpMoveBreadcrumb(operation: Extract<FileOperationDialogState, { kind: 'move' }>, index: number) {
    const breadcrumbs = operation.breadcrumbs.slice(0, index + 1);
    const target = breadcrumbs[breadcrumbs.length - 1] || { id: null, name: '根目录' };
    await loadMoveFolders(operation, target.id, breadcrumbs.length ? breadcrumbs : [{ id: null, name: '根目录' }]);
  }

  async function moveToFolder(source: DriveNodeView, targetFolder: DriveNodeView) {
    if (source.id === targetFolder.id) return;
    await run(async () => {
      await moveNode(source.id, { targetParentId: targetFolder.id });
      await refreshFiles();
    }, '已移动');
  }

  async function recycleSelected(node = selectedNode) {
    if (!node) return toast('请先选择文件或文件夹');
    setConfirmDialog({ kind: 'recycle', nodes: selectedNodes.length > 1 ? selectedNodes : [node] });
  }

  async function confirmRecycle(nodes: DriveNodeView[]) {
    await run(async () => {
      for (const item of nodes) {
        await recycleNode(item.id);
      }
      store.clearSelection();
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
    setConfirmDialog({ kind: 'permanent-delete', nodes: [node] });
  }

  async function confirmPermanentDelete(nodes: DriveNodeView[]) {
    await run(async () => {
      for (const item of nodes) {
        await permanentDeleteNode(item.id);
      }
      await refreshRecycle();
      await flushAccountQuotaRefresh();
    }, '已彻底删除');
  }

  async function submitConfirmDialog(dialog: ConfirmDialogState) {
    if (dialog.kind === 'recycle') {
      await confirmRecycle(dialog.nodes);
    } else {
      await confirmPermanentDelete(dialog.nodes);
    }
    setConfirmDialog(null);
  }

  async function uploadFiles() {
    if (!window.surgicol?.dialog || !window.surgicol?.cloud?.inspectDriveFile || !window.surgicol?.cloud?.uploadDriveFilePart) {
      toast('请在 Electron 客户端中使用本地上传');
      return;
    }
    const localPaths = await window.surgicol.dialog.openFiles();
    if (!localPaths.length) return;
    return enqueueLocalUploads(localPaths, 'dialog');
    const parentId = store.currentFolderId;
    const ownerId = store.currentUser?.id;
    const availablePaths = localPaths.filter((localPath) => !hasNameConflict(fileNameFromPath(localPath), null));
    if (availablePaths.length !== localPaths.length) {
      toast('当前目录已存在同名文件或文件夹');
    }
    if (!availablePaths.length) return;
    const queuedUploads: UploadState[] = availablePaths.map((localPath) => ({
      id: createUploadId(),
      ownerId,
      fileName: fileNameFromPath(localPath),
      localPath,
      parentId,
      percent: 0,
      status: 'queued'
    }));
    store.setUploadStates([...queuedUploads, ...useCloudDriveStore.getState().uploadStates]);
    await runConcurrent(queuedUploads, maxFileUploads, (item) => uploadOne(item.localPath || '', item.id));
    await flushAccountQuotaRefresh();
  }

  async function enqueueLocalUploads(localPaths: string[], source: 'dialog' | 'drop') {
    if (!window.surgicol?.cloud?.inspectLocalEntries || !window.surgicol?.cloud?.inspectDriveFile || !window.surgicol?.cloud?.uploadDriveFilePart) {
      toast('请在 Electron 客户端中使用本地上传');
      return;
    }
    let plan: LocalUploadPlan;
    try {
      plan = await window.surgicol.cloud.inspectLocalEntries(localPaths);
    } catch (error) {
      toast(error instanceof Error ? error.message : '读取本地文件失败');
      return;
    }
    if (plan.errors?.length) {
      toast(`有 ${plan.errors.length} 个本地项目无法读取，已跳过`);
    }
    const parentId = store.currentFolderId;
    const ownerId = store.currentUser?.id;
    const folderIdByRelativePath = new Map<string, string | null>([['', parentId]]);
    const folderNameByRelativePath = new Map<string, string>();
    const namesByParent = new Map<string, Set<string>>();
    namesByParent.set(parentKey(parentId), new Set(store.nodes.map((node) => node.name.trim().toLowerCase())));
    const sortedFolders = [...(plan.folders || [])].sort((a, b) => pathDepth(a.relativePath) - pathDepth(b.relativePath));
    let renamedCount = 0;

    try {
      for (const folder of sortedFolders) {
        const originalParentPath = parentRelativePath(folder.relativePath);
        const remoteParentPath = remoteParentRelativePath(originalParentPath, folderNameByRelativePath);
        const remoteParentId = folderIdByRelativePath.get(remoteParentPath) ?? parentId;
        const existingNames = await loadRemoteNames(remoteParentId, namesByParent);
        const safeName = reserveUniqueName(existingNames, folder.name, false);
        if (safeName !== folder.name) renamedCount += 1;
        const remotePath = joinRelativePath(remoteParentPath, safeName);
        const created = await createFolder({ parentId: remoteParentId, name: safeName });
        folderIdByRelativePath.set(remotePath, created.id);
        folderNameByRelativePath.set(folder.relativePath, safeName);
        namesByParent.set(parentKey(created.id), new Set());
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : '创建远端文件夹失败');
      await refreshFiles();
      return;
    }

    const queuedUploads: UploadState[] = [];
    for (const file of plan.files || []) {
      const remoteParentPath = remoteParentRelativePath(file.relativeDir || '', folderNameByRelativePath);
      const remoteParentId = folderIdByRelativePath.get(remoteParentPath) ?? parentId;
      const existingNames = await loadRemoteNames(remoteParentId, namesByParent);
      const safeName = reserveUniqueName(existingNames, file.name, true);
      if (safeName !== file.name) renamedCount += 1;
      queuedUploads.push({
        id: createUploadId(),
        ownerId,
        fileName: safeName,
        size: file.size,
        localPath: file.localPath,
        parentId: remoteParentId,
        percent: 0,
        status: 'queued'
      });
    }

    if (sortedFolders.length) await refreshFiles();
    if (!queuedUploads.length) {
      toast(sortedFolders.length ? '文件夹已创建' : '没有可上传的本地文件');
      return;
    }
    store.setUploadStates([...queuedUploads, ...useCloudDriveStore.getState().uploadStates]);
    toast(`${source === 'drop' ? '拖拽' : '选择'}上传：已加入 ${queuedUploads.length} 个文件到上传队列${renamedCount ? `，${renamedCount} 项已自动重命名` : ''}`);
    await runConcurrent(queuedUploads, maxFileUploads, (item) => uploadOne(item.localPath || '', item.id));
    await flushAccountQuotaRefresh();
  }

  async function loadRemoteNames(parentId: string | null, cache: Map<string, Set<string>>) {
    const key = parentKey(parentId);
    const cached = cache.get(key);
    if (cached) return cached;
    const result = await listDriveNodes(parentId);
    const names = new Set(result.nodes.map((node) => node.name.trim().toLowerCase()));
    cache.set(key, names);
    return names;
  }

  async function uploadOne(localPath: string, uploadId: string) {
    let shouldResumeOnFailure = false;
    try {
      if (!updateUploadState(uploadId, { percent: 1, status: 'hashing', phase: '计算指纹', message: '正在计算文件指纹', errorDetail: undefined })) return;
      const fileInfo = await window.surgicol.cloud.inspectDriveFile(localPath);
      const existing = useCloudDriveStore.getState().uploadStates.find((item) => item.id === uploadId);
      const targetFileName = existing?.fileName || fileInfo.name;
      if (fileInfo.size <= 0) {
        throw new Error('暂不支持上传空文件，请选择非空文件');
      }
      if (existing?.size && existing.size !== fileInfo.size) {
        throw new Error('本地文件大小已变化，请重新上传');
      }
      if (existing?.sha256 && existing.sha256 !== fileInfo.sha256) {
        throw new Error('本地文件内容已变化，请重新上传');
      }
      if (!updateUploadState(uploadId, {
        fileName: targetFileName,
        size: fileInfo.size,
        localPath: fileInfo.localPath,
        sha256: fileInfo.sha256,
        contentType: fileInfo.contentType,
        percent: 2,
        status: 'hashing',
        phase: '计算指纹',
        message: '正在计算文件指纹',
        errorDetail: undefined
      })) return;

      let uploadTask: Awaited<ReturnType<typeof initUpload>> | null = null;
      if (existing?.taskId) {
        try {
          updateUploadState(uploadId, { phase: '读取进度', message: '正在读取上传进度' });
          uploadTask = await getUploadTask(existing.taskId);
        } catch {
          throw new Error('上传任务不存在或已失效，请重新上传');
        }
      }
      const parentId = existing?.parentId ?? store.currentFolderId;
      if (!uploadTask) {
        updateUploadState(uploadId, { phase: '秒传检查', message: '正在检查是否可秒传' });
        const instant = await instantUpload({ parentId, fileName: targetFileName, sha256: fileInfo.sha256 });
        if (instant.hit) {
          updateUploadState(uploadId, { fileName: targetFileName, size: fileInfo.size, percent: 100, status: 'done', phase: '完成', message: '秒传成功，已计入容量', errorDetail: undefined });
          await refreshFiles();
          scheduleAccountQuotaRefresh();
          toast('秒传成功，容量已更新');
          return;
        }
        if (!updateUploadState(uploadId, { fileName: targetFileName, size: fileInfo.size, percent: 3, status: 'preparing', phase: '创建任务', message: '正在创建上传任务' })) return;
        const chunkSize = Math.max(1, Math.min(uploadChunkSize, Math.max(fileInfo.size, 1)));
        uploadTask = await initUpload({
          fileName: targetFileName,
          sha256: fileInfo.sha256,
          totalBytes: Math.max(fileInfo.size, 1),
          chunkSize,
          contentType: fileInfo.contentType
        });
      }

      if (uploadTask.status === 'CANCELED') throw new Error('上传任务已取消，请重新上传');
      shouldResumeOnFailure = Boolean(uploadTask.id && fileInfo.localPath);
      if (!updateUploadState(uploadId, {
        taskId: uploadTask.id,
        fileName: targetFileName,
        size: fileInfo.size,
        localPath: fileInfo.localPath,
        parentId,
        sha256: fileInfo.sha256,
        contentType: fileInfo.contentType,
        chunkSize: uploadTask.chunkSize,
        totalChunks: uploadTask.totalChunks,
        uploadedIndexes: uploadTask.uploadedIndexes,
        percent: uploadProgressPercent(uploadTask.uploadedIndexes.length, uploadTask.totalChunks),
        status: 'preparing',
        phase: uploadTask.uploadedIndexes.length > 0 ? '断点续传' : '准备上传',
        message: uploadTask.uploadedIndexes.length > 0 ? '继续上传' : '准备上传分片',
        errorDetail: undefined
      })) return;

      await uploadMissingChunks(localPath, uploadId, uploadTask, fileInfo.contentType);
      uploadTask = await getUploadTask(uploadTask.id);
      if (!updateUploadState(uploadId, {
        taskId: uploadTask.id,
        uploadedIndexes: uploadTask.uploadedIndexes,
        percent: 96,
        status: 'finishing',
        phase: '合并分片',
        message: '正在合并分片并写入网盘',
        errorDetail: undefined
      })) return;
      await completeUpload(uploadTask.id, {
        parentId,
        ossKey: uploadTask.ossKey || undefined,
        contentType: uploadTask.contentType || fileInfo.contentType
      });
      updateUploadState(uploadId, {
        taskId: uploadTask.id,
        fileName: targetFileName,
        size: fileInfo.size,
        percent: 100,
        status: 'done',
        uploadedIndexes: allChunkIndexes(uploadTask.totalChunks),
        phase: '完成',
        message: '已计入容量',
        errorDetail: undefined
      });
      await refreshFiles();
      scheduleAccountQuotaRefresh();
      toast('上传完成，容量已更新');
    } catch (error) {
      const current = useCloudDriveStore.getState().uploadStates.find((item) => item.id === uploadId);
      if (current?.status === 'canceled') return;
      const friendlyMessage = uploadFailureMessage(error, current);
      const nonResumableFailure = isNonResumableUploadFailure(error);
      updateUploadState(uploadId, {
        status: shouldResumeOnFailure && !nonResumableFailure && current?.taskId && current?.localPath ? 'resumable' : 'failed',
        message: friendlyMessage,
        phase: current?.phase || '上传失败',
        errorDetail: error instanceof Error ? error.message : '上传失败'
      });
      toast(friendlyMessage);
    }
  }

  async function uploadMissingChunks(localPath: string, uploadId: string, uploadTask: Awaited<ReturnType<typeof initUpload>>, contentType?: string) {
    const uploaded = new Set(uploadTask.uploadedIndexes || []);
    const missing = allChunkIndexes(uploadTask.totalChunks).filter((index) => !uploaded.has(index));
    if (!missing.length) return;
    if (!updateUploadState(uploadId, { status: 'uploading', phase: '上传分片', message: '正在上传分片', percent: uploadProgressPercent(uploaded.size, uploadTask.totalChunks) })) return;
    await runConcurrent(missing, maxPartUploadsPerFile, async (chunkIndex) => {
      const current = useCloudDriveStore.getState().uploadStates.find((item) => item.id === uploadId);
      if (!current || current.status === 'canceled') return;
      const start = uploadTask.chunkSize * chunkIndex;
      const sizeBytes = Math.min(uploadTask.chunkSize, uploadTask.fileSize - start);
      updateUploadState(uploadId, { phase: '签发分片', message: `正在获取第 ${chunkIndex + 1} 个分片上传地址` });
      const ticket = await createUploadTicket(uploadTask.id, { chunkIndex, partNumber: chunkIndex + 1, size: sizeBytes });
      updateUploadState(uploadId, { phase: '上传分片', message: `正在上传第 ${chunkIndex + 1} 个分片` });
      const part = await window.surgicol.cloud.uploadDriveFilePart(localPath, {
        taskId: uploadTask.id,
        uploadUrl: ticket.uploadUrl,
        chunkIndex,
        partNumber: chunkIndex + 1,
        start: ticket.start ?? start,
        end: ticket.end ?? start + sizeBytes - 1,
        contentType: ticket.contentType || contentType
      });
      updateUploadState(uploadId, { phase: '登记分片', message: `正在登记第 ${chunkIndex + 1} 个分片` });
      const nextTask = await registerUploadChunk(uploadTask.id, {
        chunkIndex,
        partNumber: chunkIndex + 1,
        sizeBytes,
        etag: part.etag
      });
      updateUploadState(uploadId, {
        taskId: uploadTask.id,
        uploadedIndexes: nextTask.uploadedIndexes,
        totalChunks: nextTask.totalChunks,
        percent: uploadProgressPercent(nextTask.uploadedIndexes.length, nextTask.totalChunks),
        status: 'uploading',
        phase: '上传分片',
        message: '正在上传分片'
      });
    });
  }

  function updateUploadState(uploadId: string, patch: Partial<UploadState>) {
    const current = useCloudDriveStore.getState().uploadStates.find((item) => item.id === uploadId);
    if (!current || current.status === 'canceled') return false;
    store.upsertUploadState({ ...current, ...patch, id: uploadId });
    return true;
  }

  function uploadFailureMessage(error: unknown, current?: UploadState) {
    const raw = error instanceof Error ? error.message : '上传失败';
    if (/当前目录已存在同名文件或文件夹|同名文件/.test(raw)) {
      return '当前目录已存在同名文件，未占用容量';
    }
    if (/容量不足|storage quota exceeded/i.test(raw)) {
      return '容量不足，文件未写入网盘';
    }
    const completedChunks = current?.uploadedIndexes?.length || 0;
    const totalChunks = current?.totalChunks || 0;
    if (current?.taskId && current?.localPath && totalChunks > 0 && completedChunks >= totalChunks) {
      return '完成处理失败，可继续重试';
    }
    if (/服务异常|INTERNAL_SERVER_ERROR/i.test(raw)) {
      return '上传服务暂时异常，请稍后继续重试';
    }
    if (/timeout/i.test(raw)) {
      return '上传处理超时，请点击继续重试';
    }
    return raw;
  }

  function isNonResumableUploadFailure(error: unknown) {
    const raw = error instanceof Error ? error.message : '';
    return /当前目录已存在同名文件或文件夹|同名文件|容量不足|storage quota exceeded|上传任务已取消/i.test(raw);
  }

  function openFolder(node: DriveNodeView) {
    store.enterFolder(node);
  }

  function previewNode(node: DriveNodeView) {
    if (node.nodeType !== 'FILE') return;
    if (!isNativeMediaPreview(node)) {
      store.setPreviewState({ node, url: node.previewUrl || node.downloadUrl || '' });
      return;
    }
    if (!node.previewUrl && !node.downloadUrl) return toast('当前文件没有可用预览地址');
    store.setPreviewState({ node, url: node.previewUrl || node.downloadUrl || '' });
  }

  function downloadNode(node: DriveNodeView) {
    const url = node.downloadUrl || node.previewUrl;
    if (!url) return toast('当前文件没有可用下载地址');
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = node.name;
    anchor.rel = 'noopener noreferrer';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  function showDetails(node: DriveNodeView) {
    setDetailNode(node);
  }

  async function copyShareText(text: string, success = '已复制分享链接') {
    if (!text) {
      toast('分享链接为空，无法复制');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast(success);
    } catch {
      toast('复制失败，请手动复制链接');
    }
  }

  async function createShare(nodes: DriveNodeView[], settings: { extractCode?: string; validityDays?: number | null; allowPreview: boolean; allowDownload: boolean }): Promise<ShareLinkView | null> {
    setLoading(true);
    try {
      const share = await createShareLink({
        fileNodeIds: nodes.map((node) => node.id),
        extractCode: settings.extractCode || null,
        validityDays: settings.validityDays,
        allowPreview: settings.allowPreview,
        allowDownload: settings.allowDownload
      });
      const result = { ...share, extractCode: settings.extractCode || '' };
      store.setShareResult(result);
      store.clearSelection();
      store.setActiveMenu('share');
      toast('分享链接已生成');
      return result;
    } catch (error) {
      toast(error instanceof Error ? error.message : '分享链接生成失败');
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function saveDirect(item: DirectShareView) {
    await run(async () => {
      await saveDirectShare(item.id, { targetParentId: store.currentFolderId });
      await refreshDirectInbox();
      await refreshFiles();
      await flushAccountQuotaRefresh();
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
    ? Math.min(100, (store.currentUser.quotaUsed / store.currentUser.quotaTotal) * 100)
    : 0;
  const quotaTooltip = store.currentUser
    ? `已用 ${formatExactBytes(store.currentUser.quotaUsed)}，剩余 ${formatExactBytes(store.currentUser.quotaRemaining)}，总容量 ${formatExactBytes(store.currentUser.quotaTotal)}`
    : '未加载账号容量';

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

        <div className="cloud-drive-sidebar-footer">
          <div className="cloud-drive-quota" title={quotaTooltip}>
            <progress value={quotaPercent} max={100} aria-label="账号容量使用情况" />
            <div className="cloud-drive-quota-row">
              <span>
                {store.currentUser ? `${formatSize(store.currentUser.quotaUsed)}/${formatSize(store.currentUser.quotaTotal)}` : '0 B/0 B'}
              </span>
              <strong>{formatPercent(quotaPercent)}</strong>
            </div>
          </div>
        </div>
      </aside>

      <main
        className={clsx('cloud-drive-main', isExternalDragOver && store.activeMenu === 'files' ? 'external-drag-over' : '')}
        onDragEnter={handleExternalDragEnter}
        onDragOver={handleExternalDragOver}
        onDragLeave={handleExternalDragLeave}
        onDrop={handleExternalDrop}
      >
        <header className="cloud-drive-filebar">
          <div className="cloud-drive-primary-actions">
            <button className="cloud-drive-upload-button" type="button" onClick={uploadFiles}>
              <Upload size={17} />
              <span>上传</span>
            </button>
            <button type="button" onClick={openCreateFolderDialog}>
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
                  <label className="cloud-drive-select-all" title={visibleIds.length ? '选择当前列表' : '当前列表为空'}>
                    <input type="checkbox" disabled={visibleIds.length === 0} checked={allVisibleSelected} onChange={() => store.selectAllVisible(visibleIds)} />
                    <span>全选</span>
                  </label>
                  {selectedNodes.length > 0 ? (
                    <div className="cloud-batch-actions">
                      <span title={selectedNodes.map((node) => node.name).join('、')}>已选 {selectedNodes.length} 项</span>
                      <button type="button" onClick={() => openMoveDialog(selectedNodes[0], selectedNodes)}>
                        移动
                      </button>
                      <button type="button" onClick={() => {
                        const files = selectedNodes.filter((node) => node.nodeType === 'FILE');
                        if (!files.length) return toast('请选择文件生成分享链接');
                        setShareDraft(files);
                      }}>
                        分享
                      </button>
                      <button className="danger" type="button" onClick={() => setConfirmDialog({ kind: 'recycle', nodes: selectedNodes })}>
                        删除
                      </button>
                    </div>
                  ) : null}
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
              selectedIds={store.selectedIds}
              viewMode={viewMode}
              onSelectOnly={store.selectOnly}
              onToggleSelect={store.toggleSelected}
              onOpenFolder={openFolder}
              onPreview={previewNode}
              onDownload={downloadNode}
              onDetails={showDetails}
              onRename={openRenameDialog}
              onMove={openMoveDialog}
              onMoveToFolder={moveToFolder}
              onRecycle={recycleSelected}
              onShare={(node) => setShareDraft([node])}
            />
          </>
        ) : null}

        {store.activeMenu === 'recycle' ? <RecyclePanel onRestore={restoreFromRecycle} onPermanentDelete={permanentDeleteFromRecycle} /> : null}
        {store.activeMenu === 'share' ? <ShareCenter onCopy={copyShareText} /> : null}
        {store.activeMenu === 'direct' ? <DirectSharePanel onSave={saveDirect} onCancel={cancelDirect} /> : null}
        {store.activeMenu === 'account' ? <AccountPanel /> : null}
        {store.activeMenu === 'transport' ? <TransferPanel /> : null}
        {isExternalDragOver && store.activeMenu === 'files' ? (
          <div className="cloud-drive-drop-overlay">
            <Upload size={34} />
            <strong>松开上传到：{store.breadcrumbs[store.breadcrumbs.length - 1]?.name || '全部文件'}</strong>
            <span>支持文件和文件夹，重名会自动重命名</span>
          </div>
        ) : null}
      </main>

      {shareDraft ? <ShareDialog nodes={shareDraft} onClose={() => setShareDraft(null)} onCreate={createShare} onCopy={copyShareText} /> : null}
      {confirmDialog ? (
        <ConfirmDialog
          dialog={confirmDialog}
          loading={loading}
          onClose={() => setConfirmDialog(null)}
          onSubmit={() => submitConfirmDialog(confirmDialog)}
        />
      ) : null}
      {detailNode ? <FileDetailsDialog node={detailNode} onClose={() => setDetailNode(null)} onPreview={previewNode} onDownload={downloadNode} /> : null}
      {fileOperation ? (
        <FileOperationDialog
          operation={fileOperation}
          loading={loading}
          onChange={(value) => {
            if (fileOperation.kind === 'move') return;
            setFileOperation({ ...fileOperation, value } as FileOperationDialogState);
          }}
          onClose={() => setFileOperation(null)}
          onSubmit={() => submitFileOperation(fileOperation)}
          onSelectMoveTarget={selectMoveTarget}
          onEnterMoveFolder={enterMoveFolder}
          onJumpMoveBreadcrumb={jumpMoveBreadcrumb}
        />
      ) : null}
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
  const visibleBreadcrumbs = compactBreadcrumbs(store.breadcrumbs);
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
        {visibleBreadcrumbs.map((item) => (
          item.ellipsis ? (
            <span key="ellipsis">...</span>
          ) : (
            <button key={`${item.id || 'root'}-${item.index}`} type="button" title={item.name} onClick={() => store.jumpToBreadcrumb(item.index)}>
              {item.name}
            </button>
          )
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

function ShareCenter({ onCopy }: { onCopy: (text: string, success?: string) => void }) {
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
            <button type="button" onClick={() => onCopy(resultUrl)}>
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
  const percent = user.quotaTotal > 0 ? Math.min(100, (user.quotaUsed / user.quotaTotal) * 100) : 0;
  const quotaTitle = `已用 ${formatExactBytes(user.quotaUsed)}，剩余 ${formatExactBytes(user.quotaRemaining)}，总容量 ${formatExactBytes(user.quotaTotal)}`;
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
        <progress value={percent} max={100} title={quotaTitle} />
        <span title={quotaTitle}>
          {formatSize(user.quotaUsed)} / {formatSize(user.quotaTotal)}，剩余 {formatSize(user.quotaRemaining)}
        </span>
        <small>{formatPercent(percent)} 已用</small>
      </div>
    </div>
  );
}

function ConfirmDialog({
  dialog,
  loading,
  onClose,
  onSubmit
}: {
  dialog: ConfirmDialogState;
  loading: boolean;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const isPermanent = dialog.kind === 'permanent-delete';
  const names = dialog.nodes.slice(0, 4).map((node) => node.name).join('、');
  const overflow = dialog.nodes.length > 4 ? ` 等 ${dialog.nodes.length} 项` : '';
  return (
    <div className="modal-mask">
      <div className="cloud-dialog confirm-dialog">
        <header>
          <strong>{isPermanent ? '永久删除确认' : '删除确认'}</strong>
          <button type="button" onClick={onClose}>×</button>
        </header>
        <div className="dialog-body">
          <p title={`${names}${overflow}`}>{names}{overflow}</p>
          <span className="dialog-hint">
            {isPermanent ? '永久删除后不可恢复，请确认这些文件不再需要。' : '删除后文件会移入回收站，可以稍后恢复。'}
          </span>
        </div>
        <footer>
          <button type="button" onClick={onClose}>取消</button>
          <button className={isPermanent ? 'danger-action' : 'primary-action'} type="button" disabled={loading} onClick={onSubmit}>
            {loading ? '处理中' : isPermanent ? '永久删除' : '移入回收站'}
          </button>
        </footer>
      </div>
    </div>
  );
}

function FileDetailsDialog({
  node,
  onClose,
  onPreview,
  onDownload
}: {
  node: DriveNodeView;
  onClose: () => void;
  onPreview: (node: DriveNodeView) => void;
  onDownload: (node: DriveNodeView) => void;
}) {
  const isFile = node.nodeType === 'FILE';
  const visualUrl = node.coverUrl || (node.mimeType?.startsWith('image/') ? node.previewUrl : null);
  return (
    <div className="modal-mask">
      <div className="cloud-dialog file-details-dialog">
        <header>
          <strong title={node.name}>{node.name}</strong>
          <button type="button" onClick={onClose}>×</button>
        </header>
        <div className="dialog-body">
          <div className="file-detail-preview">
            {visualUrl ? <img src={visualUrl} alt="" /> : isFile ? <File size={34} /> : <Folder size={34} />}
          </div>
          <dl className="file-detail-list">
            <div><dt>类型</dt><dd>{node.nodeType === 'FOLDER' ? '文件夹' : node.mimeType || detectCategory(node.name, node.mimeType || undefined)}</dd></div>
            <div><dt>大小</dt><dd>{node.nodeType === 'FOLDER' ? '-' : formatSize(node.size)}</dd></div>
            <div><dt>修改时间</dt><dd>{node.updatedAt ? node.updatedAt.replace('T', ' ').replace(/\.\d+.*/, '') : '-'}</dd></div>
            <div><dt>文件 ID</dt><dd title={node.id}>{node.id}</dd></div>
            <div><dt>父目录</dt><dd title={node.parentId || '根目录'}>{node.parentId || '根目录'}</dd></div>
            {isFile ? <div><dt>哈希</dt><dd title={node.fileHash || '-'}>{node.fileHash || '-'}</dd></div> : null}
            {isFile ? <div><dt>OSS Key</dt><dd title={node.ossKey || '-'}>{node.ossKey || '-'}</dd></div> : null}
            {isFile ? <div><dt>预览地址</dt><dd>{node.previewUrl ? '可用' : '不可用'}</dd></div> : null}
          </dl>
        </div>
        <footer>
          <button type="button" onClick={onClose}>关闭</button>
          {isFile ? <button type="button" onClick={() => onPreview(node)}>预览</button> : null}
          {isFile ? <button className="primary-action" type="button" onClick={() => onDownload(node)}>下载</button> : null}
        </footer>
      </div>
    </div>
  );
}

function FileOperationDialog({
  operation,
  loading,
  onChange,
  onClose,
  onSubmit,
  onSelectMoveTarget,
  onEnterMoveFolder,
  onJumpMoveBreadcrumb
}: {
  operation: FileOperationDialogState;
  loading: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  onSelectMoveTarget: (operation: Extract<FileOperationDialogState, { kind: 'move' }>, targetParentId: string | null, targetName: string) => void;
  onEnterMoveFolder: (operation: Extract<FileOperationDialogState, { kind: 'move' }>, folder: DriveNodeView) => void;
  onJumpMoveBreadcrumb: (operation: Extract<FileOperationDialogState, { kind: 'move' }>, index: number) => void;
}) {
  const isMove = operation.kind === 'move';
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (operation.kind !== 'rename') return;
    const input = nameInputRef.current;
    if (!input) return;
    const dotIndex = operation.node.nodeType === 'FILE' ? operation.value.lastIndexOf('.') : -1;
    input.focus();
    input.setSelectionRange(0, dotIndex > 0 ? dotIndex : operation.value.length);
  }, [operation]);
  const title = operation.kind === 'create-folder'
    ? '新建文件夹'
    : operation.kind === 'rename'
      ? `重命名：${operation.node.name}`
      : `移动：${operation.nodes && operation.nodes.length > 1 ? `${operation.nodes.length} 项` : operation.node.name}`;
  const label = operation.kind === 'create-folder' ? '文件夹名称' : '新名称';
  const placeholder = operation.kind === 'create-folder' ? '请输入文件夹名称' : operation.kind === 'rename' ? '请输入新名称' : '留空移动到根目录';

  return (
    <div className="modal-mask">
      <div className="cloud-dialog">
        <header>
          <strong>{title}</strong>
          <button type="button" onClick={onClose}>
            ×
          </button>
        </header>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <div className="dialog-body">
            {isMove ? (
              <MoveTargetPicker
                operation={operation}
                onSelectTarget={onSelectMoveTarget}
                onEnterFolder={onEnterMoveFolder}
                onJumpBreadcrumb={onJumpMoveBreadcrumb}
              />
            ) : (
              <>
                <label>{label}</label>
                <input
                  ref={nameInputRef}
                  autoFocus
                  value={operation.value}
                  placeholder={placeholder}
                  onChange={(event) => onChange(event.target.value)}
                />
              </>
            )}
          </div>
          <footer>
            <button type="button" onClick={onClose}>
              取消
            </button>
            <button className="primary-action" type="submit" disabled={loading}>
              {loading ? '处理中' : isMove ? `移动到${operation.targetName}` : '确认'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

function MoveTargetPicker({
  operation,
  onSelectTarget,
  onEnterFolder,
  onJumpBreadcrumb
}: {
  operation: Extract<FileOperationDialogState, { kind: 'move' }>;
  onSelectTarget: (operation: Extract<FileOperationDialogState, { kind: 'move' }>, targetParentId: string | null, targetName: string) => void;
  onEnterFolder: (operation: Extract<FileOperationDialogState, { kind: 'move' }>, folder: DriveNodeView) => void;
  onJumpBreadcrumb: (operation: Extract<FileOperationDialogState, { kind: 'move' }>, index: number) => void;
}) {
  return (
    <div className="move-target-picker">
      <div className="move-target-current">
        <span>当前目标</span>
        <strong>{operation.targetName}</strong>
      </div>
      <div className="move-target-breadcrumbs">
        {operation.breadcrumbs.map((item, index) => (
          <button key={`${item.id || 'root'}-${index}`} type="button" onClick={() => onJumpBreadcrumb(operation, index)}>
            {item.name}
          </button>
        ))}
      </div>
      <div className="move-target-actions">
        <button
          type="button"
          className={operation.targetParentId === null ? 'active' : undefined}
          onClick={() => onSelectTarget(operation, null, '根目录')}
        >
          选择根目录
        </button>
        {operation.browseParentId !== operation.targetParentId ? (
          <button
            type="button"
            onClick={() => onSelectTarget(operation, operation.browseParentId, currentMoveFolderName(operation))}
          >
            选择当前目录
          </button>
        ) : null}
      </div>
      <div className="move-folder-list">
        {operation.loadingFolders ? <div className="move-folder-empty">正在加载文件夹...</div> : null}
        {!operation.loadingFolders && operation.folders.length === 0 ? <div className="move-folder-empty">当前目录没有可选文件夹</div> : null}
        {!operation.loadingFolders
          ? operation.folders.map((folder) => (
              <article key={folder.id} className={operation.targetParentId === folder.id ? 'selected' : undefined}>
                <div>
                  <Folder size={18} />
                  <strong title={folder.name}>{folder.name}</strong>
                </div>
                <button type="button" onClick={() => onEnterFolder(operation, folder)}>
                  进入
                </button>
                <button type="button" onClick={() => onSelectTarget(operation, folder.id, folder.name)}>
                  选择
                </button>
              </article>
            ))
          : null}
      </div>
    </div>
  );
}

function ShareDialog({
  nodes,
  onClose,
  onCreate,
  onCopy
}: {
  nodes: DriveNodeView[];
  onClose: () => void;
  onCreate: (nodes: DriveNodeView[], settings: { extractCode?: string; validityDays?: number | null; allowPreview: boolean; allowDownload: boolean }) => Promise<ShareLinkView | null>;
  onCopy: (text: string, success?: string) => void;
}) {
  const [validityDays, setValidityDays] = useState<number | null>(7);
  const [extractCode, setExtractCode] = useState(randomCode());
  const [allowPreview, setAllowPreview] = useState(true);
  const [allowDownload, setAllowDownload] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [createdShare, setCreatedShare] = useState<ShareLinkView | null>(null);
  const title = nodes.length === 1 ? nodes[0].name : `共 ${nodes.length} 个文件`;
  const summaryItems = nodes.slice(0, 3);
  const resultUrl = createdShare ? buildShareUrl(createdShare.shareCode, createdShare.extractCode) : '';
  const fullShareText = createdShare
    ? `分享链接：${resultUrl}${createdShare.extractCode ? `\n提取码：${createdShare.extractCode}` : ''}`
    : '';

  async function submitShare() {
    if (!allowPreview && !allowDownload) {
      setError('请至少开启一种访问权限');
      return;
    }
    setError('');
    setCreating(true);
    const share = await onCreate(nodes, { extractCode, validityDays, allowPreview, allowDownload });
    if (share) {
      setCreatedShare({ ...share, extractCode });
    }
    setCreating(false);
  }

  return (
    <div className="modal-mask">
      <div className="cloud-dialog share-dialog">
        <header>
          <strong>创建公开分享</strong>
          <button type="button" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="dialog-body">
          <div className="share-file-summary">
            <span>{nodes.length === 1 ? '分享文件' : '分享文件'}</span>
            <strong title={title}>{title}</strong>
            <div>
              {summaryItems.map((node) => (
                <small key={node.id} title={node.name}>
                  {node.name}
                </small>
              ))}
              {nodes.length > summaryItems.length ? <small>等 {nodes.length} 项</small> : null}
            </div>
          </div>

          {createdShare ? (
            <div className="share-created-result">
              <span>分享链接</span>
              <input readOnly value={resultUrl} title={resultUrl} />
              <dl>
                <div>
                  <dt>提取码</dt>
                  <dd>{createdShare.extractCode || '无'}</dd>
                </div>
                <div>
                  <dt>过期时间</dt>
                  <dd>{createdShare.expireAt || '长期有效'}</dd>
                </div>
                <div>
                  <dt>访问权限</dt>
                  <dd>{[createdShare.allowPreview ? '允许预览' : '', createdShare.allowDownload ? '允许下载' : ''].filter(Boolean).join('、') || '无'}</dd>
                </div>
              </dl>
              <div className="share-copy-actions">
                <button type="button" onClick={() => onCopy(resultUrl)}>
                  <Copy size={16} />
                  复制链接
                </button>
                <button type="button" onClick={() => onCopy(fullShareText, '已复制链接和提取码')}>
                  <Copy size={16} />
                  复制链接和提取码
                </button>
              </div>
            </div>
          ) : (
            <>
              <label>有效期</label>
              <div className="seg share-validity-seg">
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
              <div className="share-code-row">
                <input value={extractCode} maxLength={4} onChange={(event) => setExtractCode(event.target.value.replace(/\s/g, '').slice(0, 4))} />
                <button type="button" onClick={() => setExtractCode(randomCode())}>
                  随机
                </button>
              </div>
              <div className="share-permission-grid">
                <label className={allowPreview ? 'active' : undefined}>
                  <input type="checkbox" checked={allowPreview} onChange={(event) => setAllowPreview(event.target.checked)} />
                  <span>允许预览</span>
                </label>
                <label className={allowDownload ? 'active' : undefined}>
                  <input type="checkbox" checked={allowDownload} onChange={(event) => setAllowDownload(event.target.checked)} />
                  <span>允许下载</span>
                </label>
              </div>
              {error ? <p className="dialog-error">{error}</p> : null}
            </>
          )}
        </div>
        <footer>
          <button type="button" onClick={onClose}>
            {createdShare ? '完成' : '取消'}
          </button>
          {!createdShare ? (
            <button className="primary-action" type="button" disabled={creating} onClick={submitShare}>
              {creating ? '生成中...' : '生成链接'}
            </button>
          ) : null}
        </footer>
      </div>
    </div>
  );
}

function PreviewModal() {
  const preview = useCloudDriveStore((store) => store.previewState);
  const setPreview = useCloudDriveStore((store) => store.setPreviewState);
  if (!preview) return null;
  const node = preview.node;
  const url = preview.url;
  const name = node.name;
  const mimeType = node.mimeType || '';
  const isNativeMedia = isNativeMediaPreview(node);
  return (
    <div className="modal-mask">
      <div className="cloud-preview-dialog">
        <header>
          <strong>{name}</strong>
          <button type="button" onClick={() => setPreview(null)}>
            ×
          </button>
        </header>
        <div className={clsx('cloud-preview-body', isNativeMedia ? 'media-preview-body' : 'document-preview-body')}>
          {mimeType.startsWith('image/') ? <img src={url} alt={name} /> : null}
          {mimeType.startsWith('video/') ? <video src={url} controls /> : null}
          {mimeType.startsWith('audio/') ? <audio src={url} controls /> : null}
          {!isNativeMedia ? <DocumentPreview node={node} onDownload={downloadPreviewNode} /> : null}
          {false && (mimeType === 'application/pdf' || /\.pdf$/i.test(name)) ? <iframe title={name} src={url} /> : null}
          {false && !mimeType.startsWith('image/') && !mimeType.startsWith('video/') && !mimeType.startsWith('audio/') && mimeType !== 'application/pdf' && !/\.pdf$/i.test(name) ? (
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

function downloadPreviewNode(node: DriveNodeView) {
  const url = node.downloadUrl || node.previewUrl;
  if (!url) return;
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = node.name;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function isNativeMediaPreview(node: DriveNodeView) {
  const mimeType = node.mimeType || '';
  return mimeType.startsWith('image/') || mimeType.startsWith('video/') || mimeType.startsWith('audio/');
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

function allChunkIndexes(totalChunks: number) {
  return Array.from({ length: Math.max(totalChunks, 0) }, (_, index) => index);
}

function uploadProgressPercent(uploadedChunks: number, totalChunks: number) {
  if (totalChunks <= 0) return 8;
  return Math.round(8 + Math.min(88, (uploadedChunks / totalChunks) * 88));
}

async function runConcurrent<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      if (item === undefined) return;
      await worker(item);
    }
  });
  await Promise.all(workers);
}

function fileNameFromPath(localPath: string) {
  return localPath.split(/[\\/]/).pop() || localPath;
}

function parentKey(parentId: string | null) {
  return parentId || '__root__';
}

function pathDepth(relativePath = '') {
  return relativePath.split('/').filter(Boolean).length;
}

function parentRelativePath(relativePath = '') {
  const parts = relativePath.split('/').filter(Boolean);
  parts.pop();
  return parts.join('/');
}

function remoteParentRelativePath(originalParentPath: string, folderNameByRelativePath: Map<string, string>) {
  const parts = originalParentPath.split('/').filter(Boolean);
  const remoteParts: string[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    const originalPath = parts.slice(0, index + 1).join('/');
    remoteParts.push(folderNameByRelativePath.get(originalPath) || parts[index]);
  }
  return remoteParts.join('/');
}

function joinRelativePath(parentPath: string, name: string) {
  return [parentPath, name].filter(Boolean).join('/');
}

function reserveUniqueName(existingNames: Set<string>, originalName: string, keepExtension: boolean) {
  const trimmedName = originalName.trim() || '未命名';
  if (!existingNames.has(trimmedName.toLowerCase())) {
    existingNames.add(trimmedName.toLowerCase());
    return trimmedName;
  }
  const { baseName, extension } = splitNameForRename(trimmedName, keepExtension);
  for (let index = 1; index < 10000; index += 1) {
    const candidate = `${baseName} (${index})${extension}`;
    const key = candidate.toLowerCase();
    if (!existingNames.has(key)) {
      existingNames.add(key);
      return candidate;
    }
  }
  const fallback = `${baseName} (${Date.now()})${extension}`;
  existingNames.add(fallback.toLowerCase());
  return fallback;
}

function splitNameForRename(name: string, keepExtension: boolean) {
  if (!keepExtension) return { baseName: name, extension: '' };
  const dotIndex = name.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex === name.length - 1) return { baseName: name, extension: '' };
  return { baseName: name.slice(0, dotIndex), extension: name.slice(dotIndex) };
}

function buildShareUrl(shareCode: string, extractCode?: string) {
  const base = `${window.location.origin}/share/${shareCode}`;
  return extractCode ? `${base}?code=${encodeURIComponent(extractCode)}` : base;
}

function randomCode() {
  return Math.random().toString(36).slice(2, 6);
}

function formatPercent(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0%';
  if (value < 0.1) return '<0.1%';
  if (value < 10) return `${value.toFixed(1)}%`;
  return `${Math.round(value)}%`;
}

function formatExactBytes(size = 0) {
  return `${new Intl.NumberFormat('zh-CN').format(Math.max(0, Math.round(size)))} B`;
}

function compactBreadcrumbs(items: MoveBreadcrumbItem[]) {
  const indexed = items.map((item, index) => ({ ...item, index, ellipsis: false }));
  if (indexed.length <= 4) return indexed;
  return [
    indexed[0],
    { id: null, name: '...', index: -1, ellipsis: true },
    ...indexed.slice(-2)
  ];
}

function isSameMoveOperation(
  current: FileOperationDialogState | null,
  operation: Extract<FileOperationDialogState, { kind: 'move' }>
): current is Extract<FileOperationDialogState, { kind: 'move' }> {
  return current?.kind === 'move' && current.node.id === operation.node.id;
}

function currentMoveFolderName(operation: Extract<FileOperationDialogState, { kind: 'move' }>) {
  const current = operation.breadcrumbs[operation.breadcrumbs.length - 1];
  return current?.name || '根目录';
}
