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
  taskId?: UUID;
  fileName: string;
  size?: number;
  localPath?: string;
  percent: number;
  status: 'queued' | 'hashing' | 'preparing' | 'uploading' | 'finishing' | 'done' | 'failed' | 'canceled';
  message?: string;
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
  selectedId: UUID | null;
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
  setSelectedId: (id: UUID | null) => void;
  setNodes: (nodes: DriveNodeView[]) => void;
  setRecycleNodes: (nodes: DriveNodeView[]) => void;
  setDirectInbox: (items: DirectShareView[]) => void;
  setShareResult: (share: ShareLinkView | null) => void;
  setPublicShare: (share: ShareLinkView | null) => void;
  setUploadState: (state: UploadState | null) => void;
  setUploadStates: (states: UploadState[]) => void;
  upsertUploadState: (state: UploadState) => void;
  setPreviewState: (state: PreviewState | null) => void;
  clearWorkspace: () => void;
  toggleSidebar: () => void;
}

const rootCrumb: BreadcrumbItem = { id: null, name: '全部文件' };

export const useCloudDriveStore = create<CloudDriveState>((set, get) => ({
  activeMenu: 'files',
  currentUser: null,
  currentFolderId: null,
  breadcrumbs: [rootCrumb],
  category: 'all',
  keyword: '',
  selectedId: null,
  nodes: [],
  recycleNodes: [],
  directInbox: [],
  shareResult: null,
  publicShare: null,
  uploadState: null,
  uploadStates: [],
  previewState: null,
  isSidebarCollapsed: false,
  setActiveMenu: (activeMenu) => set({ activeMenu, selectedId: null }),
  setCurrentUser: (currentUser) => set({ currentUser }),
  enterFolder: (folder) =>
    set((state) => ({
      currentFolderId: folder.id,
      breadcrumbs: [...state.breadcrumbs, { id: folder.id, name: folder.name }],
      selectedId: null
    })),
  jumpToBreadcrumb: (index) => {
    const nextBreadcrumbs = get().breadcrumbs.slice(0, index + 1);
    const current = nextBreadcrumbs[nextBreadcrumbs.length - 1] || rootCrumb;
    set({ breadcrumbs: nextBreadcrumbs.length ? nextBreadcrumbs : [rootCrumb], currentFolderId: current.id, selectedId: null });
  },
  setCategory: (category) => set({ category }),
  setKeyword: (keyword) => set({ keyword }),
  setSelectedId: (selectedId) => set({ selectedId }),
  setNodes: (nodes) => set({ nodes }),
  setRecycleNodes: (recycleNodes) => set({ recycleNodes }),
  setDirectInbox: (directInbox) => set({ directInbox }),
  setShareResult: (shareResult) => set({ shareResult }),
  setPublicShare: (publicShare) => set({ publicShare }),
  setUploadState: (uploadState) =>
    set((state) => ({
      uploadState,
      uploadStates: uploadState ? upsertUploadStateList(state.uploadStates, uploadState) : state.uploadStates
    })),
  setUploadStates: (uploadStates) => set({ uploadStates, uploadState: uploadStates.find((item) => item.status !== 'done' && item.status !== 'canceled') || uploadStates[0] || null }),
  upsertUploadState: (uploadState) =>
    set((state) => ({
      uploadState,
      uploadStates: upsertUploadStateList(state.uploadStates, uploadState)
    })),
  setPreviewState: (previewState) => set({ previewState }),
  clearWorkspace: () =>
    set({
      currentUser: null,
      currentFolderId: null,
      breadcrumbs: [rootCrumb],
      selectedId: null,
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
  if (index < 0) return [next, ...items];
  return items.map((item, itemIndex) => (itemIndex === index ? next : item));
}
