import { create } from 'zustand';
import type { CloudTab, CurrentUserView, DirectShareView, DriveNodeView, ShareLinkView, UUID } from './api/netdisk';

export type CloudMenuKey = CloudTab;
export type FileCategory = 'all' | 'document' | 'video' | 'torrent' | 'audio' | 'other' | 'image';

export interface BreadcrumbItem {
  id: UUID | null;
  name: string;
}

export interface UploadState {
  id: string;
  ownerId?: UUID;
  taskId?: UUID;
  fileName: string;
  size?: number;
  localPath?: string;
  parentId?: UUID | null;
  sha256?: string;
  contentType?: string;
  chunkSize?: number;
  totalChunks?: number;
  uploadedIndexes?: number[];
  percent: number;
  status: 'queued' | 'hashing' | 'preparing' | 'uploading' | 'finishing' | 'done' | 'failed' | 'canceled' | 'resumable';
  message?: string;
  phase?: string;
  errorDetail?: string;
}

export interface PreviewState {
  node: DriveNodeView;
  url: string;
}

interface CloudDriveState {
  activeMenu: CloudMenuKey;
  currentUser: CurrentUserView | null;
  currentFolderId: UUID | null;
  breadcrumbs: BreadcrumbItem[];
  category: FileCategory;
  keyword: string;
  selectedIds: UUID[];
  nodes: DriveNodeView[];
  recycleNodes: DriveNodeView[];
  directInbox: DirectShareView[];
  shareResult: ShareLinkView | null;
  publicShare: ShareLinkView | null;
  uploadState: UploadState | null;
  uploadStates: UploadState[];
  previewState: PreviewState | null;
  isSidebarCollapsed: boolean;
  setActiveMenu: (menu: CloudMenuKey) => void;
  setCurrentUser: (user: CurrentUserView | null) => void;
  enterFolder: (folder: DriveNodeView) => void;
  jumpToBreadcrumb: (index: number) => void;
  setCategory: (category: FileCategory) => void;
  setKeyword: (keyword: string) => void;
  setSelectedIds: (ids: UUID[]) => void;
  selectOnly: (id: UUID | null) => void;
  toggleSelected: (id: UUID) => void;
  selectAllVisible: (ids: UUID[]) => void;
  clearSelection: () => void;
  setNodes: (nodes: DriveNodeView[]) => void;
  setRecycleNodes: (nodes: DriveNodeView[]) => void;
  setDirectInbox: (items: DirectShareView[]) => void;
  setShareResult: (share: ShareLinkView | null) => void;
  setPublicShare: (share: ShareLinkView | null) => void;
  setUploadState: (state: UploadState | null) => void;
  setUploadStates: (states: UploadState[]) => void;
  upsertUploadState: (state: UploadState) => void;
  removeUploadState: (id: string) => void;
  clearUploadStates: () => void;
  setPreviewState: (state: PreviewState | null) => void;
  clearWorkspace: () => void;
  toggleSidebar: () => void;
}

const rootCrumb: BreadcrumbItem = { id: null, name: '全部文件' };
const uploadHistoryLegacyStorageKey = 'moya-cloud-drive-upload-history-v1';
const uploadHistoryStoragePrefix = `${uploadHistoryLegacyStorageKey}:`;
const uploadHistoryLimit = 100;
const unfinishedUploadStatuses: UploadState['status'][] = ['queued', 'hashing', 'preparing', 'uploading', 'finishing'];

export const useCloudDriveStore = create<CloudDriveState>((set, get) => ({
  activeMenu: 'files',
  currentUser: null,
  currentFolderId: null,
  breadcrumbs: [rootCrumb],
  category: 'all',
  keyword: '',
  selectedIds: [],
  nodes: [],
  recycleNodes: [],
  directInbox: [],
  shareResult: null,
  publicShare: null,
  uploadState: null,
  uploadStates: [],
  previewState: null,
  isSidebarCollapsed: false,
  setActiveMenu: (activeMenu) => set({ activeMenu, selectedIds: [] }),
  setCurrentUser: (currentUser) =>
    set((state) => {
      const previousUserId = state.currentUser?.id || null;
      const currentUserId = currentUser?.id || null;
      if (previousUserId === currentUserId) return { currentUser };
      const uploadStates = loadUploadHistory(currentUserId);
      return {
        currentUser,
        uploadState: activeUploadFrom(uploadStates),
        uploadStates
      };
    }),
  enterFolder: (folder) =>
    set((state) => ({
      currentFolderId: folder.id,
      breadcrumbs: [...state.breadcrumbs, { id: folder.id, name: folder.name }],
      selectedIds: []
    })),
  jumpToBreadcrumb: (index) => {
    const nextBreadcrumbs = get().breadcrumbs.slice(0, index + 1);
    const current = nextBreadcrumbs[nextBreadcrumbs.length - 1] || rootCrumb;
    set({ breadcrumbs: nextBreadcrumbs.length ? nextBreadcrumbs : [rootCrumb], currentFolderId: current.id, selectedIds: [] });
  },
  setCategory: (category) => set({ category }),
  setKeyword: (keyword) => set({ keyword }),
  setSelectedIds: (selectedIds) => set({ selectedIds: uniqueIds(selectedIds) }),
  selectOnly: (id) => set({ selectedIds: id ? [id] : [] }),
  toggleSelected: (id) =>
    set((state) => ({
      selectedIds: state.selectedIds.includes(id) ? state.selectedIds.filter((selectedId) => selectedId !== id) : [...state.selectedIds, id]
    })),
  selectAllVisible: (ids) =>
    set((state) => {
      const uniqueVisibleIds = uniqueIds(ids);
      const allSelected = uniqueVisibleIds.length > 0 && uniqueVisibleIds.every((id) => state.selectedIds.includes(id));
      return { selectedIds: allSelected ? state.selectedIds.filter((id) => !uniqueVisibleIds.includes(id)) : uniqueIds([...state.selectedIds, ...uniqueVisibleIds]) };
    }),
  clearSelection: () => set({ selectedIds: [] }),
  setNodes: (nodes) => set({ nodes }),
  setRecycleNodes: (recycleNodes) => set({ recycleNodes }),
  setDirectInbox: (directInbox) => set({ directInbox }),
  setShareResult: (shareResult) => set({ shareResult }),
  setPublicShare: (publicShare) => set({ publicShare }),
  setUploadState: (uploadState) =>
    set((state) => {
      const nextUploadState = uploadState ? ownUploadState(uploadState, state.currentUser?.id || null) : uploadState;
      const uploadStates = nextUploadState ? upsertUploadStateList(state.uploadStates, nextUploadState) : state.uploadStates;
      persistUploadHistory(state.currentUser?.id || null, uploadStates);
      return {
        uploadState: nextUploadState,
        uploadStates
      };
    }),
  setUploadStates: (uploadStates) => {
    const currentUserId = get().currentUser?.id || null;
    const nextUploadStates = limitUploadHistory(uploadStates.map((item) => ownUploadState(item, currentUserId)));
    persistUploadHistory(currentUserId, nextUploadStates);
    set({ uploadStates: nextUploadStates, uploadState: activeUploadFrom(nextUploadStates) });
  },
  upsertUploadState: (uploadState) =>
    set((state) => {
      const nextUploadState = ownUploadState(uploadState, state.currentUser?.id || null);
      const uploadStates = upsertUploadStateList(state.uploadStates, nextUploadState);
      persistUploadHistory(state.currentUser?.id || null, uploadStates);
      return {
        uploadState: nextUploadState,
        uploadStates
      };
    }),
  removeUploadState: (id) =>
    set((state) => {
      const uploadStates = state.uploadStates.filter((item) => item.id !== id);
      persistUploadHistory(state.currentUser?.id || null, uploadStates);
      return {
        uploadState: activeUploadFrom(uploadStates),
        uploadStates
      };
    }),
  clearUploadStates: () => {
    persistUploadHistory(get().currentUser?.id || null, []);
    set({ uploadState: null, uploadStates: [] });
  },
  setPreviewState: (previewState) => set({ previewState }),
  clearWorkspace: () =>
    set({
      currentUser: null,
      currentFolderId: null,
      breadcrumbs: [rootCrumb],
      selectedIds: [],
      nodes: [],
      recycleNodes: [],
      directInbox: [],
      shareResult: null,
      publicShare: null,
      uploadState: null,
      uploadStates: [],
      previewState: null
    }),
  toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed }))
}));

function upsertUploadStateList(items: UploadState[], next: UploadState) {
  const index = items.findIndex((item) => item.id === next.id);
  if (index < 0) return limitUploadHistory([next, ...items]);
  return limitUploadHistory(items.map((item, itemIndex) => (itemIndex === index ? next : item)));
}

function uniqueIds(ids: UUID[]) {
  return Array.from(new Set(ids));
}

function activeUploadFrom(items: UploadState[]) {
  return items.find((item) => item.status !== 'done' && item.status !== 'canceled' && item.status !== 'failed') || items[0] || null;
}

function limitUploadHistory(items: UploadState[]) {
  return items.slice(0, uploadHistoryLimit);
}

function loadUploadHistory(userId?: UUID | null): UploadState[] {
  if (typeof window === 'undefined') return [];
  removeLegacyUploadHistory();
  if (!userId) return [];
  try {
    const raw = window.localStorage.getItem(uploadHistoryStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return limitUploadHistory(parsed.filter(isUploadStateLike).map((item) => normalizeUploadHistoryItem(item, userId)));
  } catch {
    return [];
  }
}

function persistUploadHistory(userId: UUID | null, items: UploadState[]) {
  if (typeof window === 'undefined') return;
  removeLegacyUploadHistory();
  if (!userId) return;
  try {
    window.localStorage.setItem(uploadHistoryStorageKey(userId), JSON.stringify(limitUploadHistory(items.map((item) => ownUploadState(item, userId)))));
  } catch {
    // localStorage may be full or disabled; upload UI should keep working in memory.
  }
}

function uploadHistoryStorageKey(userId: UUID) {
  return `${uploadHistoryStoragePrefix}${userId}`;
}

function removeLegacyUploadHistory() {
  try {
    window.localStorage.removeItem(uploadHistoryLegacyStorageKey);
  } catch {
    // localStorage may be disabled; account isolation still works in memory.
  }
}

function ownUploadState(item: UploadState, userId?: UUID | null): UploadState {
  return userId ? { ...item, ownerId: userId } : item;
}

function normalizeUploadHistoryItem(item: UploadState, userId: UUID): UploadState {
  const ownedItem = ownUploadState(item, userId);
  if (!unfinishedUploadStatuses.includes(ownedItem.status)) return ownedItem;
  return {
    ...ownedItem,
    percent: ownedItem.percent > 0 ? ownedItem.percent : 0,
    status: ownedItem.taskId && ownedItem.localPath ? 'resumable' : 'failed',
    message: ownedItem.taskId && ownedItem.localPath ? '可继续上传' : '上传中断'
  };
}

function isUploadStateLike(value: unknown): value is UploadState {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<UploadState>;
  return typeof item.id === 'string' && typeof item.fileName === 'string' && typeof item.percent === 'number' && typeof item.status === 'string';
}
