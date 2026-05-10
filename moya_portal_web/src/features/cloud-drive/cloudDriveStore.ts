import { create } from 'zustand';
import type { CloudTab, DiskObject } from './api/netdisk';

export type CloudMenuKey = 'myFolder' | 'sharedWithMeFolder' | 'privateFolder' | 'shareFolder' | 'transport' | 'annotation' | 'videoSummary';

const tabTypeMap: Record<CloudMenuKey, CloudTab> = {
  myFolder: 'all',
  sharedWithMeFolder: 'sharedWithMe',
  privateFolder: 'private',
  shareFolder: 'shared',
  transport: 'transport',
  annotation: 'annotation',
  videoSummary: 'videoSummary'
};

interface CloudDriveState {
  activeMenu: CloudMenuKey;
  currentFolderId: number;
  selectedIds: number[];
  objects: DiskObject[];
  isSidebarCollapsed: boolean;
  setActiveMenu: (menu: CloudMenuKey) => void;
  setCurrentFolderId: (id: number) => void;
  setObjects: (objects: DiskObject[]) => void;
  toggleSelection: (id: number) => void;
  clearSelection: () => void;
  toggleSidebar: () => void;
  currentTab: () => CloudTab;
}

export const useCloudDriveStore = create<CloudDriveState>((set, get) => ({
  activeMenu: 'myFolder',
  currentFolderId: 0,
  selectedIds: [],
  objects: [],
  isSidebarCollapsed: false,
  setActiveMenu: (activeMenu) => set({ activeMenu, selectedIds: [] }),
  setCurrentFolderId: (currentFolderId) => set({ currentFolderId }),
  setObjects: (objects) => set({ objects }),
  toggleSelection: (id) =>
    set((state) => ({
      selectedIds: state.selectedIds.includes(id)
        ? state.selectedIds.filter((item) => item !== id)
        : [...state.selectedIds, id]
    })),
  clearSelection: () => set({ selectedIds: [] }),
  toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
  currentTab: () => tabTypeMap[get().activeMenu]
}));
