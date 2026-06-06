import type { DragEvent, MouseEvent, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Clock3,
  Command,
  Copy,
  Download,
  ExternalLink,
  Film,
  FileArchive,
  FileAudio,
  FileCode,
  FileJson,
  FileSpreadsheet,
  FileText,
  FileType,
  Filter,
  Folder,
  FolderOpen,
  FolderPlus,
  Eye,
  Image,
  LayoutGrid,
  Link,
  List,
  Loader2,
  Menu,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Share2,
  Star,
  Trash2,
  Upload,
  UploadCloud,
  Users,
  X,
} from 'lucide-react'
import type { PageKey } from '../../../types'
import { notifyError, notifyInfo, notifySuccess } from '../../../ui/design-system'
import { cloudAssetPreviewUrl, materialLibraryClient } from '../api/material-library-client'
import {
  cloudFilters,
} from '../data/materials-data'
import type {
  CloudAsset,
  CloudFilter,
  CloudFolder,
  Collaborator,
  FolderCollaborator,
  FolderDialogState,
  MaterialLibraryImportProgress,
  MaterialLibraryQuickCounts,
  MaterialLibrarySnapshot,
  UploadMode,
} from '../types'

type UploadResultDialogState = {
  mode: Exclude<UploadMode, null>
  assets: CloudAsset[]
  folders: CloudFolder[]
  successText: string
}

type MaterialShortcut = 'all' | 'collaboration' | 'favorites' | 'recent' | 'teamVideos' | 'recycle'
type CloudViewMode = 'grid' | 'list'

type DraggedMaterialItem =
  | { type: 'folder'; id: string }
  | { type: 'asset'; id: string }

type FolderContextMenuState = {
  folderId: string
  x: number
  y: number
}

type AssetContextMenuState = {
  assetId: string
  x: number
  y: number
}

type AssetCoverMeta = {
  Icon: LucideIcon
  label: string
  detail: string
  className: string
}

const recentWindowMs = 14 * 24 * 60 * 60 * 1000

const shortcutLabels: Record<MaterialShortcut, string> = {
  all: '全部文件',
  collaboration: '我的协作',
  favorites: '素材收藏',
  recent: '最近上传',
  teamVideos: '团队视频',
  recycle: '回收站',
}

export function MaterialCloudDrive({ onNavigate }: { onNavigate?: (page: PageKey) => void } = {}) {
  const [folders, setFolders] = useState<CloudFolder[]>([])
  const [cloudAssets, setCloudAssets] = useState<CloudAsset[]>([])
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null)
  const [activeShortcut, setActiveShortcut] = useState<MaterialShortcut>('all')
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set())
  const [draggedItem, setDraggedItem] = useState<DraggedMaterialItem | null>(null)
  const [dropTargetFolderId, setDropTargetFolderId] = useState<string | null>(null)
  const [folderContextMenu, setFolderContextMenu] = useState<FolderContextMenuState | null>(null)
  const [assetContextMenu, setAssetContextMenu] = useState<AssetContextMenuState | null>(null)
  const [filter, setFilter] = useState<CloudFilter>('全部')
  const [viewMode, setViewMode] = useState<CloudViewMode>('grid')
  const [query, setQuery] = useState('')
  const [folderDialog, setFolderDialog] = useState<FolderDialogState | null>(null)
  const [folderName, setFolderName] = useState('')
  const [assetRenameTarget, setAssetRenameTarget] = useState<CloudAsset | null>(null)
  const [assetName, setAssetName] = useState('')
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(new Set())
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set())
  const [previewAsset, setPreviewAsset] = useState<CloudAsset | null>(null)
  const [importProgress, setImportProgress] = useState<MaterialLibraryImportProgress | null>(null)
  const [uploadResult, setUploadResult] = useState<UploadResultDialogState | null>(null)
  const [uploadMenuOpen, setUploadMenuOpen] = useState(false)
  const [actionMenuOpen, setActionMenuOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [shareTargetFolderId, setShareTargetFolderId] = useState<string | null>(null)
  const [collaboratorQuery, setCollaboratorQuery] = useState('')
  const [collaborators, setCollaborators] = useState<Collaborator[]>([])
  const [quickCounts, setQuickCounts] = useState<MaterialLibraryQuickCounts>({
    total: 0,
    collaboration: 0,
    favorites: 0,
    recent: 0,
    teamVideos: 0,
    recycle: 0,
  })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const activeFolder = activeFolderId ? folders.find((folder) => folder.id === activeFolderId) || null : null
  const activeFolders = folders.filter((folder) => !folder.deletedAt)
  const folderById = new Map(folders.map((folder) => [folder.id, folder]))
  const sharedFolderIds = new Set(activeFolders.filter((folder) => folder.shared).map((folder) => folder.id))
  const path = activeFolderId ? getFolderPath(folders, activeFolderId) : []
  const depth = activeFolderId ? path.length : 0
  const recentCutoff = Date.now() - recentWindowMs
  const isFiltered = query.trim().length > 0 || filter !== '全部'
  const isRecycleView = activeShortcut === 'recycle'
  const canEditCurrentFolder = Boolean(activeFolderId && activeFolder && !activeFolder.deletedAt && !isRecycleView)
  const canCreateChild = canEditCurrentFolder && depth < 5
  const defaultUploadFolder = activeFolders.find((folder) => folder.id === 'folder-local-upload')
    || activeFolders.find((folder) => folder.name === '本地上传')
    || activeFolders.find((folder) => folder.parentId === null)
    || null
  const toolbarUploadFolderId = activeFolderId || defaultUploadFolder?.id || null
  const canUploadFromToolbar = !isRecycleView && !busy && Boolean(toolbarUploadFolderId)
  const canCreateToolbarFolder = !isRecycleView && !busy && (!activeFolderId || canCreateChild)
  const canRunToolbarAction = !isRecycleView && !busy
  const contextFolder = folderContextMenu ? folders.find((folder) => folder.id === folderContextMenu.folderId) || null : null
  const contextAsset = assetContextMenu ? cloudAssets.find((asset) => asset.id === assetContextMenu.assetId) || null : null
  const selectedFolderForToolbar = selectedFolderIds.size === 1
    ? folders.find((folder) => selectedFolderIds.has(folder.id) && !folder.deletedAt) || null
    : null
  const toolbarShareFolder = activeFolder && !activeFolder.deletedAt
    ? activeFolder
    : selectedFolderForToolbar
  const shareTargetFolder = shareTargetFolderId
    ? folders.find((folder) => folder.id === shareTargetFolderId && !folder.deletedAt) || null
    : toolbarShareFolder
  const canShareToolbarFolder = !isRecycleView && !busy && Boolean(toolbarShareFolder)

  const visibleChildFolders = folders.filter((folder) => {
    if (isRecycleView) {
      if (!folder.deletedAt) return false
      if (activeFolderId) return folder.parentId === activeFolderId
      return !folder.parentId || !folderById.get(folder.parentId)?.deletedAt
    }
    if (activeFolderId) return !folder.deletedAt && folder.parentId === activeFolderId
    if (activeShortcut === 'collaboration') return !folder.deletedAt && folder.shared
    if (activeShortcut === 'all') return !folder.deletedAt && folder.parentId === null
    return false
  })

  const visibleCloudAssets = cloudAssets.filter((asset) => {
    const folder = folderById.get(asset.folderId)
    const deletedByFolder = Boolean(folder?.deletedAt)
    if (isRecycleView) {
      if (!asset.deletedAt && !deletedByFolder) return false
      if (activeFolderId && asset.folderId !== activeFolderId) return false
    } else {
      if (asset.deletedAt || deletedByFolder) return false
      if (activeFolderId && asset.folderId !== activeFolderId) return false
      if (!activeFolderId && activeShortcut === 'collaboration' && !isInSharedFolder(asset.folderId, folders, sharedFolderIds)) return false
      if (!activeFolderId && activeShortcut === 'favorites' && !isFavoriteAsset(asset)) return false
      if (!activeFolderId && activeShortcut === 'recent' && !isRecentAsset(asset, recentCutoff)) return false
      if (!activeFolderId && activeShortcut === 'teamVideos' && asset.kind !== '视频' && asset.kind !== '成片') return false
    }
    if (filter === '素材' && asset.kind !== '视频' && asset.kind !== '图片' && asset.kind !== '音频') return false
    if (filter !== '全部' && filter !== '素材' && asset.kind !== filter) return false
    const text = `${asset.name}${asset.kind}${asset.status}`.toLowerCase()
    return text.includes(query.trim().toLowerCase())
  })
  const hasVisibleContent = visibleChildFolders.length > 0 || visibleCloudAssets.length > 0
  const showAssetSection = hasVisibleContent || isFiltered
  const gridStateClass = loading ? 'loading-view' : !hasVisibleContent ? 'empty-view' : ''
  const pageTitle = activeFolder ? activeFolder.name : shortcutLabels[activeShortcut]
  const folderDialogParentId = folderDialog
    ? folderDialog.mode === 'child'
      ? folderDialog.targetId || activeFolderId
      : folderDialog.mode === 'rename' && folderDialog.targetId
        ? folders.find((folder) => folder.id === folderDialog.targetId)?.parentId || null
        : null
    : null
  const folderDialogCleanName = sanitizeFolderName(folderName)
  const folderDialogDuplicate = Boolean(
    folderDialog
    && folderDialogCleanName
    && hasSiblingFolderName(
      folders,
      folderDialogParentId,
      folderDialogCleanName,
      folderDialog.mode === 'rename' ? folderDialog.targetId : undefined,
    ),
  )
  const selectedCount = selectedFolderIds.size + selectedAssetIds.size
  const visibleFolderIds = visibleChildFolders.map((folder) => folder.id)
  const visibleAssetIds = visibleCloudAssets.map((asset) => asset.id)
  const allVisibleFoldersSelected = visibleFolderIds.length > 0 && visibleFolderIds.every((id) => selectedFolderIds.has(id))
  const allVisibleAssetsSelected = visibleAssetIds.length > 0 && visibleAssetIds.every((id) => selectedAssetIds.has(id))
  const visibleCollaborators = collaborators.filter((item) => {
    const keyword = collaboratorQuery.trim()
    if (!keyword) return true
    return `${item.name}${item.phone}${item.role}`.toLowerCase().includes(keyword.toLowerCase())
  })
  const shareableCollaborators = collaborators.filter((item) => item.role !== '所有者')
  const folderAllShared = Boolean(shareTargetFolder && shareableCollaborators.length > 0 && shareableCollaborators.every((item) => folderCollaboratorRole(shareTargetFolder, item) !== '无权限'))
  const folderSharedCount = shareTargetFolder
    ? shareableCollaborators.filter((item) => folderCollaboratorRole(shareTargetFolder, item) !== '无权限').length
    : 0

  useEffect(() => {
    void loadLibrary()
  }, [])

  useEffect(() => materialLibraryClient.onImportProgress((progress) => {
    setImportProgress(progress)
  }), [])

  async function loadLibrary() {
    setLoading(true)
    try {
      applySnapshot(await materialLibraryClient.list())
      return true
    } catch (error) {
      notifyError(error instanceof Error ? error.message : '素材库加载失败')
      return false
    } finally {
      setLoading(false)
    }
  }

  function applySnapshot(snapshot: MaterialLibrarySnapshot, preferredFolderId?: string | null, preferredShortcut?: MaterialShortcut) {
    setFolders(snapshot.folders)
    setCloudAssets(snapshot.assets)
    setCollaborators(snapshot.collaborators)
    setQuickCounts(snapshot.quickCounts)
    setSelectedFolderIds((current) => new Set([...current].filter((id) => snapshot.folders.some((folder) => folder.id === id))))
    setSelectedAssetIds((current) => new Set([...current].filter((id) => snapshot.assets.some((asset) => asset.id === id))))
    setExpandedFolderIds((current) => {
      const next = new Set(current)
      snapshot.folders.filter((folder) => folder.parentId === null && !folder.deletedAt).forEach((folder) => next.add(folder.id))
      return next
    })
    if (preferredShortcut) setActiveShortcut(preferredShortcut)
    const folderIds = new Set(snapshot.folders.map((folder) => folder.id))
    setActiveFolderId((current) => {
      if (preferredFolderId !== undefined) return preferredFolderId && folderIds.has(preferredFolderId) ? preferredFolderId : null
      if (current && folderIds.has(current)) return current
      return null
    })
  }

  function selectShortcut(shortcut: MaterialShortcut) {
    setActiveShortcut(shortcut)
    setActiveFolderId(null)
    setShareOpen(false)
    setShareTargetFolderId(null)
    setFolderContextMenu(null)
    setAssetContextMenu(null)
  }

  function openFolder(folderId: string, shortcut: MaterialShortcut = 'all') {
    setActiveShortcut(shortcut)
    setActiveFolderId(folderId)
    setShareOpen(false)
    setShareTargetFolderId(null)
    setFolderContextMenu(null)
    setAssetContextMenu(null)
  }

  function toggleFolderExpanded(folderId: string) {
    setExpandedFolderIds((current) => {
      const next = new Set(current)
      if (next.has(folderId)) next.delete(folderId)
      else next.add(folderId)
      return next
    })
  }

  function openFolderDialog(mode: FolderDialogState['mode'], targetId?: string) {
    setFolderContextMenu(null)
    setAssetContextMenu(null)
    setUploadMenuOpen(false)
    setActionMenuOpen(false)
    setFolderDialog({ mode, targetId })
    if (mode === 'rename' && targetId) {
      setFolderName(folders.find((folder) => folder.id === targetId)?.name || '')
    } else {
      setFolderName('新建文件夹')
    }
  }

  function openToolbarFolderDialog() {
    setFolderContextMenu(null)
    setAssetContextMenu(null)
    setUploadMenuOpen(false)
    setActionMenuOpen(false)
    if (activeFolderId) {
      if (!canCreateChild) {
        notifyInfo('最多支持 5 级文件夹')
        return
      }
      openFolderDialog('child')
      return
    }
    setActiveShortcut('all')
    openFolderDialog('root')
  }

  function openFolderContextMenu(event: MouseEvent<HTMLElement>, folderId: string) {
    event.preventDefault()
    event.stopPropagation()
    if (isRecycleView) return
    setActiveShortcut('all')
    setActiveFolderId(folderId)
    setAssetContextMenu(null)
    setFolderContextMenu({
      folderId,
      x: Math.min(event.clientX, window.innerWidth - 244),
      y: Math.min(event.clientY, window.innerHeight - 392),
    })
  }

  function openAssetContextMenu(event: MouseEvent<HTMLElement>, assetId: string) {
    event.preventDefault()
    event.stopPropagation()
    setFolderContextMenu(null)
    setAssetContextMenu({
      assetId,
      x: Math.min(event.clientX, window.innerWidth - 196),
      y: Math.min(event.clientY, window.innerHeight - (isRecycleView ? 86 : 180)),
    })
  }

  function openAssetPreview(asset: CloudAsset) {
    setAssetContextMenu(null)
    setPreviewAsset(asset)
  }

  function createChildFolder(folderId: string) {
    if (!canCreateChildFolder(folders, folderId)) {
      notifyInfo('最多支持 5 级文件夹')
      return
    }
    setActiveShortcut('all')
    setActiveFolderId(folderId)
    setExpandedFolderIds((current) => new Set(current).add(folderId))
    openFolderDialog('child', folderId)
  }

  function openFolderShare(folderId: string) {
    setFolderContextMenu(null)
    setAssetContextMenu(null)
    setUploadMenuOpen(false)
    setActionMenuOpen(false)
    setShareTargetFolderId(folderId)
    setShareOpen(true)
  }

  function openToolbarShare() {
    if (!toolbarShareFolder) {
      notifyInfo('请进入一个文件夹，或只选择一个文件夹后管理协作')
      return
    }
    openFolderShare(toolbarShareFolder.id)
  }

  function closeSharePanel() {
    setShareOpen(false)
    setShareTargetFolderId(null)
    setCollaboratorQuery('')
  }

  function copyFolderLink(folderId: string) {
    const folder = folders.find((item) => item.id === folderId)
    const text = `moyaclaw://material-library/folder/${folderId}`
    void navigator.clipboard?.writeText(text)
    setFolderContextMenu(null)
    notifySuccess(`${folder?.name || '文件夹'}链接已复制`)
  }

  async function commitFolderDialog() {
    const cleanName = sanitizeFolderName(folderName)
    if (!cleanName || !folderDialog) return
    const parentId = folderDialog.mode === 'child'
      ? folderDialog.targetId || activeFolderId
      : folderDialog.mode === 'rename' && folderDialog.targetId
        ? folders.find((folder) => folder.id === folderDialog.targetId)?.parentId || null
        : null
    if (hasSiblingFolderName(folders, parentId, cleanName, folderDialog.mode === 'rename' ? folderDialog.targetId : undefined)) {
      notifyError(`同一层级已存在「${cleanName}」，请换一个名称`)
      return
    }
    setBusy(true)
    try {
      if (folderDialog.mode === 'rename' && folderDialog.targetId) {
        const result = await materialLibraryClient.renameFolder({ id: folderDialog.targetId, name: cleanName })
        if (!result.ok || !result.state) throw new Error(result.error || '文件夹名称修改失败')
        applySnapshot(result.state, folderDialog.targetId, 'all')
        notifySuccess('文件夹名称已修改')
      } else {
        const result = await materialLibraryClient.createFolder({ name: cleanName, parentId })
        if (!result.ok || !result.state) throw new Error(result.error || '文件夹创建失败')
        const matches = result.state.folders.filter((folder) => folder.parentId === parentId && folder.name === cleanName)
        const nextFolder = matches[matches.length - 1]
        applySnapshot(result.state, nextFolder?.id || activeFolderId, 'all')
        if (parentId) setExpandedFolderIds((current) => new Set(current).add(parentId))
        notifySuccess(folderDialog.mode === 'child' ? '二级文件夹已创建' : '一级文件夹已创建')
      }
      setFolderDialog(null)
    } catch (error) {
      notifyError(error instanceof Error ? error.message : '文件夹操作失败')
    } finally {
      setBusy(false)
    }
  }

  async function deleteActiveFolder() {
    if (!canEditCurrentFolder || !activeFolderId || !activeFolder) return
    await deleteFolderById(activeFolderId, activeFolder.parentId)
  }

  async function deleteFolderById(folderId: string, preferredFolderId: string | null) {
    setBusy(true)
    try {
      const result = await materialLibraryClient.deleteFolder({ id: folderId })
      if (!result.ok || !result.state) throw new Error(result.error || '文件夹删除失败')
      applySnapshot(result.state, preferredFolderId, 'all')
      setShareOpen(false)
      setShareTargetFolderId(null)
      notifySuccess('文件夹已移入回收站')
    } catch (error) {
      notifyError(error instanceof Error ? error.message : '文件夹删除失败')
    } finally {
      setBusy(false)
    }
  }

  async function restoreActiveFolder() {
    if (!activeFolderId || !activeFolder?.deletedAt) return
    await restoreFolderById(activeFolderId, activeFolderId)
  }

  async function restoreFolderById(folderId: string, preferredFolderId: string | null = folderId) {
    setBusy(true)
    try {
      const result = await materialLibraryClient.restoreFolder({ id: folderId })
      if (!result.ok || !result.state) throw new Error(result.error || '文件夹还原失败')
      applySnapshot(result.state, preferredFolderId, 'all')
      notifySuccess('文件夹已还原')
    } catch (error) {
      notifyError(error instanceof Error ? error.message : '文件夹还原失败')
    } finally {
      setBusy(false)
    }
  }

  async function restoreAsset(assetId: string) {
    setBusy(true)
    try {
      const result = await materialLibraryClient.restoreAssets({ assetIds: [assetId] })
      if (!result.ok || !result.state) throw new Error(result.error || '素材还原失败')
      applySnapshot(result.state, null, 'recycle')
      setSelectedAssetIds((current) => {
        const next = new Set(current)
        next.delete(assetId)
        return next
      })
      notifySuccess('素材已还原')
    } catch (error) {
      notifyError(error instanceof Error ? error.message : '素材还原失败')
    } finally {
      setBusy(false)
    }
  }

  async function toggleAssetFavorite(asset: CloudAsset) {
    if (asset.deletedAt) return
    setBusy(true)
    try {
      const result = await materialLibraryClient.toggleAssetFavorite({ id: asset.id, favorite: !isFavoriteAsset(asset) })
      if (!result.ok || !result.state) throw new Error(result.error || '收藏状态保存失败')
      applySnapshot(result.state)
      notifySuccess(isFavoriteAsset(asset) ? '已取消收藏' : '已收藏素材')
    } catch (error) {
      notifyError(error instanceof Error ? error.message : '收藏状态保存失败')
    } finally {
      setBusy(false)
    }
  }

  function toggleFolderSelection(folderId: string, checked: boolean) {
    setSelectedFolderIds((current) => {
      const next = new Set(current)
      if (checked) next.add(folderId)
      else next.delete(folderId)
      return next
    })
  }

  function toggleAssetSelection(assetId: string, checked: boolean) {
    setSelectedAssetIds((current) => {
      const next = new Set(current)
      if (checked) next.add(assetId)
      else next.delete(assetId)
      return next
    })
  }

  function toggleVisibleFolders(checked: boolean) {
    setSelectedFolderIds((current) => {
      const next = new Set(current)
      visibleFolderIds.forEach((id) => {
        if (checked) next.add(id)
        else next.delete(id)
      })
      return next
    })
  }

  function toggleVisibleAssets(checked: boolean) {
    setSelectedAssetIds((current) => {
      const next = new Set(current)
      visibleAssetIds.forEach((id) => {
        if (checked) next.add(id)
        else next.delete(id)
      })
      return next
    })
  }

  function clearSelection() {
    setSelectedFolderIds(new Set())
    setSelectedAssetIds(new Set())
  }

  function openAssetRename(asset: CloudAsset) {
    setAssetRenameTarget(asset)
    setAssetName(asset.name)
  }

  async function commitAssetRename() {
    if (!assetRenameTarget) return
    const cleanName = sanitizeFolderName(assetName)
    if (!cleanName) return
    setBusy(true)
    try {
      const result = await materialLibraryClient.renameAsset({ id: assetRenameTarget.id, name: cleanName })
      if (!result.ok || !result.state) throw new Error(result.error || '素材重命名失败')
      applySnapshot(result.state, activeFolderId, activeShortcut)
      setAssetRenameTarget(null)
      notifySuccess('素材名称已修改')
    } catch (error) {
      notifyError(error instanceof Error ? error.message : '素材重命名失败')
    } finally {
      setBusy(false)
    }
  }

  async function deleteAssets(assetIds: string[]) {
    if (!assetIds.length) return
    setBusy(true)
    try {
      const result = await materialLibraryClient.deleteAssets({ assetIds })
      if (!result.ok || !result.state) throw new Error(result.error || '素材删除失败')
      applySnapshot(result.state, activeFolderId, activeShortcut)
      setSelectedAssetIds((current) => {
        const next = new Set(current)
        assetIds.forEach((id) => next.delete(id))
        return next
      })
      notifySuccess(assetIds.length > 1 ? `已删除 ${assetIds.length} 个素材` : '素材已移入回收站')
    } catch (error) {
      notifyError(error instanceof Error ? error.message : '素材删除失败')
    } finally {
      setBusy(false)
    }
  }

  async function revealAsset(assetId: string) {
    try {
      const result = await materialLibraryClient.revealAsset({ id: assetId })
      if (!result.ok) throw new Error(result.error || '定位文件失败')
    } catch (error) {
      notifyError(error instanceof Error ? error.message : '定位文件失败')
    }
  }

  async function exportAssets(assetIds: string[]) {
    if (!assetIds.length) return
    try {
      const result = await materialLibraryClient.exportAssets({ assetIds })
      if (!result.ok) throw new Error(result.error || '素材导出失败')
      if (result.canceled) {
        notifyInfo('已取消导出')
        return
      }
      notifySuccess(`已导出 ${result.exported?.count ?? assetIds.length} 个素材`)
    } catch (error) {
      notifyError(error instanceof Error ? error.message : '素材导出失败')
    }
  }

  async function exportFolder(folderId: string) {
    try {
      const result = await materialLibraryClient.exportFolder({ id: folderId })
      if (!result.ok) throw new Error(result.error || '文件夹导出失败')
      if (result.canceled) {
        notifyInfo('已取消导出')
        return
      }
      notifySuccess(`已导出 ${result.exported?.count ?? 0} 个素材`)
    } catch (error) {
      notifyError(error instanceof Error ? error.message : '文件夹导出失败')
    }
  }

  async function deleteSelectedItems() {
    if (!selectedCount) return
    setBusy(true)
    try {
      let snapshot: MaterialLibrarySnapshot | undefined
      for (const folderId of selectedFolderIds) {
        const result = await materialLibraryClient.deleteFolder({ id: folderId })
        if (!result.ok || !result.state) throw new Error(result.error || '文件夹删除失败')
        snapshot = result.state
      }
      if (selectedAssetIds.size) {
        const result = await materialLibraryClient.deleteAssets({ assetIds: [...selectedAssetIds] })
        if (!result.ok || !result.state) throw new Error(result.error || '素材删除失败')
        snapshot = result.state
      }
      if (snapshot) applySnapshot(snapshot, activeFolderId, activeShortcut)
      clearSelection()
      notifySuccess('选中项已移入回收站')
    } catch (error) {
      notifyError(error instanceof Error ? error.message : '删除失败')
    } finally {
      setBusy(false)
    }
  }

  async function restoreSelectedItems() {
    if (!selectedCount) return
    setBusy(true)
    try {
      let snapshot: MaterialLibrarySnapshot | undefined
      for (const folderId of selectedFolderIds) {
        const result = await materialLibraryClient.restoreFolder({ id: folderId })
        if (!result.ok || !result.state) throw new Error(result.error || '文件夹还原失败')
        snapshot = result.state
      }
      if (selectedAssetIds.size) {
        const result = await materialLibraryClient.restoreAssets({ assetIds: [...selectedAssetIds] })
        if (!result.ok || !result.state) throw new Error(result.error || '素材还原失败')
        snapshot = result.state
      }
      if (snapshot) applySnapshot(snapshot, null, isRecycleView ? 'recycle' : activeShortcut)
      clearSelection()
      notifySuccess('选中项已还原')
    } catch (error) {
      notifyError(error instanceof Error ? error.message : '还原失败')
    } finally {
      setBusy(false)
    }
  }

  async function exportSelectedItems() {
    if (selectedFolderIds.size === 1 && selectedAssetIds.size === 0) {
      await exportFolder([...selectedFolderIds][0])
      return
    }
    if (selectedAssetIds.size > 0) {
      await exportAssets([...selectedAssetIds])
      return
    }
    notifyInfo('请选择素材，或只选择一个文件夹导出')
  }

  async function importLocalEntries(mode: Exclude<UploadMode, null>, targetFolderId = activeFolderId) {
    const folderId = targetFolderId || ''
    const targetFolder = folderId ? folders.find((folder) => folder.id === folderId) : null
    if (!targetFolder || targetFolder.deletedAt || isRecycleView) return
    const taskId = `material-import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    setUploadMenuOpen(false)
    setFolderContextMenu(null)
    setActiveShortcut('all')
    setActiveFolderId(folderId)
    setUploadResult(null)
    setImportProgress({
      taskId,
      mode,
      stage: 'scanning',
      message: mode === 'folder' ? '等待选择文件夹' : '等待选择文件',
      totalFiles: 0,
      completedFiles: 0,
      failedFiles: 0,
      overallPercent: 0,
      currentFileId: '',
      files: [],
    })
    setBusy(true)
    try {
      const result = await materialLibraryClient.importLocalEntries({ folderId, mode, taskId })
      if (!result.ok) throw new Error(result.error || '素材上传失败')
      if (result.state) applySnapshot(result.state, folderId, 'all')
      if (result.canceled) {
        setImportProgress(null)
        notifyInfo('已取消导入')
        return
      }
      const assets = result.assets || []
      const folders = result.folders || []
      if (!assets.length && !folders.length) {
        setImportProgress(null)
        notifyInfo('没有发现可导入内容')
        return
      }
      setImportProgress(null)
      setUploadResult({
        mode,
        assets,
        folders,
        successText: mode === 'folder'
          ? `已上传 ${folders.length} 个文件夹、${assets.length} 个素材到 OSS`
          : `已上传 ${assets.length} 个素材到 OSS`,
      })
      notifySuccess('素材已上传到 OSS 并加入当前文件夹')
    } catch (error) {
      setImportProgress((current) => current?.taskId === taskId ? {
        ...current,
        stage: 'failed',
        message: error instanceof Error ? error.message : '素材上传失败',
      } : current)
      notifyError(error instanceof Error ? error.message : '素材上传失败')
    } finally {
      setBusy(false)
    }
  }

  function toggleToolbarUploadMenu() {
    if (!canUploadFromToolbar) return
    setActionMenuOpen(false)
    setUploadMenuOpen((open) => !open)
  }

  function importFromToolbar(mode: Exclude<UploadMode, null>) {
    if (!toolbarUploadFolderId) {
      notifyInfo('请先新建文件夹后上传素材')
      return
    }
    setUploadMenuOpen(false)
    setActionMenuOpen(false)
    void importLocalEntries(mode, toolbarUploadFolderId)
  }

  async function createProjectFolder() {
    if (!canRunToolbarAction) return
    const parentId = activeFolderId || null
    if (activeFolderId && !canCreateChild) {
      notifyInfo('最多支持 5 级文件夹')
      return
    }
    setUploadMenuOpen(false)
    setActionMenuOpen(false)
    setFolderContextMenu(null)
    setBusy(true)
    try {
      const name = nextAvailableFolderName(folders, parentId, '新建项目')
      const result = await materialLibraryClient.createFolder({ name, parentId })
      if (!result.ok || !result.state) throw new Error(result.error || '工程创建失败')
      const matches = result.state.folders.filter((folder) => folder.parentId === parentId && folder.name === name)
      const nextFolder = matches[matches.length - 1]
      applySnapshot(result.state, nextFolder?.id || parentId, 'all')
      if (parentId) setExpandedFolderIds((current) => new Set(current).add(parentId))
      notifySuccess('工程文件夹已创建')
    } catch (error) {
      notifyError(error instanceof Error ? error.message : '工程创建失败')
    } finally {
      setBusy(false)
    }
  }

  function startMaterialCollection() {
    if (!canRunToolbarAction) return
    setUploadMenuOpen(false)
    setActionMenuOpen(false)
    setFolderContextMenu(null)
    if (onNavigate) {
      notifyInfo('已打开素材收集工作台')
      onNavigate('research')
      return
    }
    notifyInfo('请从左侧进入全域调研使用素材收集')
  }

  async function refreshLibrary() {
    setUploadMenuOpen(false)
    setActionMenuOpen(false)
    if (await loadLibrary()) notifySuccess('素材库已刷新')
  }

  async function saveFolderCollaborators(folder: CloudFolder, folderCollaborators: FolderCollaborator[]) {
    setBusy(true)
    try {
      const result = await materialLibraryClient.updateFolderCollaborators({
        folderId: folder.id,
        collaborators: folderCollaborators,
      })
      if (!result.ok || !result.state) {
        notifyError(result.error || '权限保存失败')
        return
      }
      applySnapshot(result.state, activeFolderId, activeShortcut)
      notifySuccess('协作权限已更新')
    } catch (error) {
      notifyError(error instanceof Error ? error.message : '权限保存失败')
    } finally {
      setBusy(false)
    }
  }

  async function changeFolderCollaboratorRole(phone: string, role: FolderCollaborator['role'] | '无权限') {
    if (!shareTargetFolder) return
    const next = nextFolderCollaborators(shareTargetFolder, collaborators, phone, role)
    await saveFolderCollaborators(shareTargetFolder, next)
  }

  async function changeAllFolderCollaborators(enabled: boolean) {
    if (!shareTargetFolder) return
    const next = enabled
      ? collaborators
        .filter((item) => item.role !== '所有者')
        .map((item) => ({
          phone: item.phone,
          role: folderCollaboratorRole(shareTargetFolder, item) === '可管理' ? '可管理' : '仅查看',
        } satisfies FolderCollaborator))
      : []
    await saveFolderCollaborators(shareTargetFolder, next)
  }

  function startFolderDrag(event: DragEvent<HTMLElement>, folderId: string) {
    if (isRecycleView) return
    event.dataTransfer.effectAllowed = 'move'
    setDraggedItem({ type: 'folder', id: folderId })
  }

  function startAssetDrag(event: DragEvent<HTMLElement>, assetId: string) {
    if (isRecycleView) return
    event.dataTransfer.effectAllowed = 'move'
    setDraggedItem({ type: 'asset', id: assetId })
  }

  function allowFolderDrop(event: DragEvent<HTMLElement>, targetFolderId: string | null) {
    if (!canDropOnFolder(draggedItem, targetFolderId, folders)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDropTargetFolderId(targetFolderId)
  }

  async function dropOnFolder(event: DragEvent<HTMLElement>, targetFolderId: string | null) {
    event.preventDefault()
    if (!canDropOnFolder(draggedItem, targetFolderId, folders)) {
      setDropTargetFolderId(null)
      setDraggedItem(null)
      return
    }
    const item = draggedItem
    setDropTargetFolderId(null)
    setDraggedItem(null)
    setBusy(true)
    try {
      if (item?.type === 'folder') {
        const result = await materialLibraryClient.moveFolder({ id: item.id, parentId: targetFolderId })
        if (!result.ok || !result.state) throw new Error(result.error || '文件夹移动失败')
        applySnapshot(result.state, item.id, 'all')
        if (targetFolderId) setExpandedFolderIds((current) => new Set(current).add(targetFolderId))
        notifySuccess('文件夹已移动')
      }
      if (item?.type === 'asset' && targetFolderId) {
        const result = await materialLibraryClient.moveAssets({ assetIds: [item.id], folderId: targetFolderId })
        if (!result.ok || !result.state) throw new Error(result.error || '素材移动失败')
        applySnapshot(result.state, activeFolderId, activeShortcut)
        notifySuccess('素材已移动')
      }
    } catch (error) {
      notifyError(error instanceof Error ? error.message : '移动失败')
    } finally {
      setBusy(false)
    }
  }

  const renderFolderTree = (parentId: string | null, level = 0): ReactNode => {
    return activeFolders.filter((folder) => folder.parentId === parentId).map((folder) => {
      const children = activeFolders.filter((child) => child.parentId === folder.id)
      const isExpanded = expandedFolderIds.has(folder.id)
      const isDropTarget = dropTargetFolderId === folder.id
      const isActive = activeFolderId === folder.id && activeShortcut !== 'recycle'
      const FolderIcon = isActive || isExpanded ? FolderOpen : Folder
      return (
        <div className="cloud-folder-node" data-level={level} key={folder.id}>
          <div
            className={`cloud-folder-row ${isActive ? 'active' : ''} ${isDropTarget ? 'drop-target' : ''}`}
            draggable={!busy}
            style={{ paddingLeft: Math.min(8 + level * 18, 78) }}
            onDragStart={(event) => startFolderDrag(event, folder.id)}
            onDragEnd={() => { setDraggedItem(null); setDropTargetFolderId(null) }}
            onDragOver={(event) => allowFolderDrop(event, folder.id)}
            onDragLeave={() => setDropTargetFolderId(null)}
            onDrop={(event) => void dropOnFolder(event, folder.id)}
            onContextMenu={(event) => openFolderContextMenu(event, folder.id)}
          >
            <button
              type="button"
              className="cloud-folder-toggle"
              onClick={() => children.length ? toggleFolderExpanded(folder.id) : openFolder(folder.id)}
              aria-label={children.length ? `${isExpanded ? '收起' : '展开'}${folder.name}` : `打开${folder.name}`}
            >
              {children.length ? (isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <span className="cloud-folder-toggle-spacer" />}
            </button>
            <button type="button" className="cloud-folder-name-button" onClick={() => openFolder(folder.id)}>
              <FolderIcon className="cloud-folder-file-icon" size={15} />
              <span title={folder.name}>{folder.name}</span>
            </button>
            <div className="cloud-folder-meta" aria-hidden="true">
              {folder.shared ? <Users className="cloud-folder-shared" size={12} aria-label="共享文件夹" /> : null}
              <small className="has-count">{folder.count ?? 0}</small>
            </div>
            <div className="cloud-folder-actions">
              <button
                type="button"
                className="cloud-folder-inline-action"
                onClick={(event) => openFolderContextMenu(event, folder.id)}
                aria-label={`${folder.name}更多操作`}
                title="更多操作"
              >
                <MoreHorizontal size={14} />
              </button>
            </div>
          </div>
          {isExpanded ? renderFolderTree(folder.id, level + 1) : null}
        </div>
      )
    })
  }

  return (
    <section className="cloud-drive">
      <aside className="cloud-folder-pane">
        <div className="cloud-quick-list">
          {[
            { key: 'all' as const, label: '全部文件', count: quickCounts.total, Icon: FolderOpen },
            { key: 'collaboration' as const, label: '我的协作', count: quickCounts.collaboration, Icon: Users },
            { key: 'favorites' as const, label: '素材收藏', count: quickCounts.favorites, Icon: Star },
            { key: 'recent' as const, label: '最近上传', count: quickCounts.recent, Icon: Clock3 },
            { key: 'teamVideos' as const, label: '团队视频', count: quickCounts.teamVideos, Icon: Film },
            { key: 'recycle' as const, label: '回收站', count: quickCounts.recycle, Icon: Trash2 },
          ].map(({ key, label, count, Icon }) => (
            <button key={key} type="button" className={activeShortcut === key && activeFolderId === null ? 'active' : ''} onClick={() => selectShortcut(key)}>
              <Icon size={15} />
              <span>{label}</span>
              <small>{count}</small>
            </button>
          ))}
        </div>
        <div
          className={`cloud-folder-section-head ${dropTargetFolderId === null && draggedItem?.type === 'folder' ? 'drop-target' : ''}`}
          onDragOver={(event) => allowFolderDrop(event, null)}
          onDragLeave={() => setDropTargetFolderId(null)}
          onDrop={(event) => void dropOnFolder(event, null)}
        >
          <span>主题文件夹</span>
          <button type="button" onClick={() => openFolderDialog('root')} disabled={busy} aria-label="新建一级文件夹" title="新建一级文件夹"><Plus size={14} /></button>
        </div>
        <div className="cloud-folder-tree">
          {renderFolderTree(null)}
        </div>
      </aside>

      <main className="cloud-content">
        <div className="cloud-content-head">
          <div className="cloud-breadcrumb" aria-label="当前位置">
            <div className="cloud-breadcrumb-track">
              {!activeFolder ? (
                <button className="cloud-breadcrumb-item root current" type="button" onClick={() => selectShortcut(activeShortcut)}>
                  {pageTitle}
                </button>
              ) : path.map((folder, index) => (
                <span className={`cloud-breadcrumb-segment ${index === 0 ? 'first' : ''}`} key={folder.id}>
                  {index > 0 ? <span className="cloud-breadcrumb-divider">/</span> : null}
                  <button
                    type="button"
                    className={`cloud-breadcrumb-item ${index === path.length - 1 ? 'current' : ''}`}
                    aria-current={index === path.length - 1 ? 'page' : undefined}
                    onClick={() => openFolder(folder.id, activeShortcut)}
                  >
                    {folder.name}
                  </button>
                  {index === path.length - 1 && canEditCurrentFolder ? (
                    <button
                      className="cloud-breadcrumb-edit"
                      type="button"
                      onClick={() => openFolderDialog('rename', activeFolderId || undefined)}
                      aria-label="重命名文件夹"
                      title="重命名文件夹"
                    >
                      <Pencil size={13} />
                    </button>
                  ) : null}
                </span>
              ))}
            </div>
          </div>
          <div className="cloud-head-actions">
            <div className="cloud-view-toggle" role="group" aria-label="显示方式">
              <button
                type="button"
                className={viewMode === 'grid' ? 'active' : ''}
                onClick={() => setViewMode('grid')}
                aria-pressed={viewMode === 'grid'}
                title="缩略图显示"
              >
                <LayoutGrid size={15} />
              </button>
              <button
                type="button"
                className={viewMode === 'list' ? 'active' : ''}
                onClick={() => setViewMode('list')}
                aria-pressed={viewMode === 'list'}
                title="列表显示"
              >
                <List size={16} />
              </button>
            </div>
            <label className="cloud-filter-select" title="过滤条件">
              <Filter size={14} />
              <select value={filter} onChange={(event) => setFilter(event.target.value as CloudFilter)} aria-label="过滤条件">
                {cloudFilters.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>
            <label className="cloud-search">
              <Search size={15} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入关键词..." />
            </label>
          </div>
        </div>

        <div className="cloud-toolbar">
          <div className="cloud-upload-menu-wrap">
            <button className="primary cloud-toolbar-action-primary" type="button" onClick={toggleToolbarUploadMenu} disabled={!canUploadFromToolbar}>
              <Upload size={15} /> 上传
            </button>
            {uploadMenuOpen ? (
              <div className="cloud-upload-menu">
                <button type="button" onClick={() => importFromToolbar('file')}><UploadCloud size={15} /> 上传文件</button>
                <button type="button" onClick={() => importFromToolbar('folder')}><FolderPlus size={15} /> 上传文件夹</button>
              </div>
            ) : null}
          </div>
          <button className="cloud-toolbar-action-primary" type="button" onClick={openToolbarFolderDialog} disabled={!canCreateToolbarFolder}><FolderPlus size={15} /> 新建文件夹</button>
          <button className="cloud-toolbar-action-outline" type="button" onClick={() => void createProjectFolder()} disabled={!canRunToolbarAction}><Plus size={15} /> 新建工程</button>
          <button className="cloud-toolbar-action-outline" type="button" onClick={startMaterialCollection} disabled={!canRunToolbarAction}><Plus size={15} /> 素材收集</button>
          <div className="cloud-toolbar-menu-wrap">
            <button className={`icon-only cloud-toolbar-menu-button ${actionMenuOpen ? 'active' : ''}`} type="button" onClick={() => { setUploadMenuOpen(false); setActionMenuOpen((open) => !open) }} aria-label="更多素材库操作" aria-expanded={actionMenuOpen}>
              <Menu size={17} />
            </button>
            {actionMenuOpen ? (
              <div className="cloud-action-menu" role="menu" aria-label="更多素材库操作">
                <button type="button" role="menuitem" onClick={() => void refreshLibrary()}><RefreshCw size={15} /> 刷新素材库</button>
                <button type="button" role="menuitem" onClick={() => importFromToolbar('file')} disabled={!canUploadFromToolbar}><UploadCloud size={15} /> 上传文件</button>
                <button type="button" role="menuitem" onClick={() => importFromToolbar('folder')} disabled={!canUploadFromToolbar}><FolderPlus size={15} /> 上传文件夹</button>
              </div>
            ) : null}
          </div>
          <div className="cloud-spacer" />
          <div className="cloud-toolbar-avatars" aria-hidden="true">
            {collaborators.slice(0, 3).map((item) => <span key={item.phone}>{item.name.slice(0, 1).toUpperCase()}</span>)}
          </div>
          {isRecycleView ? (
            <button type="button" onClick={() => void restoreActiveFolder()} disabled={!activeFolder?.deletedAt || busy}><RotateCcw size={15} /> 还原</button>
          ) : (
            <>
              <button type="button" onClick={openToolbarShare} disabled={!canShareToolbarFolder}><Users size={15} /> 可管理</button>
              <button type="button" onClick={() => void deleteActiveFolder()} disabled={!canEditCurrentFolder || busy}><Trash2 size={15} /> 删除</button>
            </>
          )}
        </div>

        {selectedCount ? (
          <div className="cloud-selection-toolbar">
            <strong>已选择 {selectedCount} 项</strong>
            <span>{selectedFolderIds.size ? `${selectedFolderIds.size} 个文件夹` : ''}{selectedFolderIds.size && selectedAssetIds.size ? ' · ' : ''}{selectedAssetIds.size ? `${selectedAssetIds.size} 个素材` : ''}</span>
            <button type="button" onClick={() => void exportSelectedItems()} disabled={busy || selectedFolderIds.size > 1}>导出</button>
            {isRecycleView ? (
              <button type="button" onClick={() => void restoreSelectedItems()} disabled={busy}>还原</button>
            ) : (
              <button type="button" className="danger" onClick={() => void deleteSelectedItems()} disabled={busy}>删除</button>
            )}
            <button type="button" onClick={clearSelection}>取消选择</button>
          </div>
        ) : null}

        <div className={`cloud-grid ${gridStateClass} view-${viewMode}`} aria-label="素材库文件">
          {loading ? (
            <div className="cloud-empty">
              <Loader2 className="spin" size={38} />
              <strong>正在加载素材库</strong>
              <span>从后端同步文件夹、真实文件和历史入库素材。</span>
            </div>
          ) : null}
          {!loading && visibleChildFolders.length ? (
            <div className="cloud-section-title">
              <label><input type="checkbox" checked={allVisibleFoldersSelected} onChange={(event) => toggleVisibleFolders(event.target.checked)} /> 文件夹</label>
              <span>{visibleChildFolders.length} 个</span>
            </div>
          ) : null}
          {!loading && visibleChildFolders.map((folder) => (
            <CloudFolderCard
              folder={folder}
              key={folder.id}
              isRecycleView={isRecycleView}
              selected={selectedFolderIds.has(folder.id)}
              onOpen={() => openFolder(folder.id, isRecycleView ? 'recycle' : 'all')}
              onRestore={() => void restoreFolderById(folder.id, folder.id)}
              onSelectChange={(checked) => toggleFolderSelection(folder.id, checked)}
              onDragStart={(event) => startFolderDrag(event, folder.id)}
              onDragEnd={() => { setDraggedItem(null); setDropTargetFolderId(null) }}
              onDragOver={(event) => allowFolderDrop(event, folder.id)}
              onDrop={(event) => void dropOnFolder(event, folder.id)}
            />
          ))}
          {!loading && showAssetSection ? (
            <div className="cloud-section-title">
              <label><input type="checkbox" checked={allVisibleAssetsSelected} onChange={(event) => toggleVisibleAssets(event.target.checked)} /> 素材</label>
              <span>{visibleCloudAssets.length} 个</span>
            </div>
          ) : null}
          {!loading && visibleCloudAssets.map((asset) => (
            <CloudAssetCard
              asset={asset}
              key={asset.id}
              isRecycleView={isRecycleView}
              selected={selectedAssetIds.has(asset.id)}
              onDragStart={(event) => startAssetDrag(event, asset.id)}
              onSelectChange={(checked) => toggleAssetSelection(asset.id, checked)}
              onToggleFavorite={() => void toggleAssetFavorite(asset)}
              onPreview={() => openAssetPreview(asset)}
              onContextMenu={(event) => openAssetContextMenu(event, asset.id)}
              onRestore={() => void restoreAsset(asset.id)}
            />
          ))}
          {!loading && !hasVisibleContent ? (
            <div className="cloud-empty">
              {isFiltered ? <FolderOpen size={42} /> : <CloudEmptyArtwork />}
              <strong>{isFiltered ? '没有匹配素材' : '暂无内容'}</strong>
              {isFiltered ? <span>换个关键词或切回全部筛选。</span> : null}
            </div>
          ) : null}
        </div>
      </main>

      {folderContextMenu && contextFolder && !contextFolder.deletedAt ? (
        <FolderContextMenu
          folder={contextFolder}
          position={folderContextMenu}
          canCreateChild={canCreateChildFolder(folders, contextFolder.id)}
          onClose={() => setFolderContextMenu(null)}
          onOpen={() => openFolder(contextFolder.id)}
          onCreateChild={() => createChildFolder(contextFolder.id)}
          onUploadFile={() => void importLocalEntries('file', contextFolder.id)}
          onUploadFolder={() => void importLocalEntries('folder', contextFolder.id)}
          onShare={() => openFolderShare(contextFolder.id)}
          onCopyLink={() => copyFolderLink(contextFolder.id)}
          onExport={() => void exportFolder(contextFolder.id)}
          onRename={() => openFolderDialog('rename', contextFolder.id)}
          onDelete={() => {
            setActiveShortcut('all')
            setActiveFolderId(contextFolder.id)
            setFolderContextMenu(null)
            void deleteFolderById(contextFolder.id, contextFolder.parentId)
          }}
        />
      ) : null}

      {assetContextMenu && contextAsset ? (
        <AssetContextMenu
          asset={contextAsset}
          position={assetContextMenu}
          isRecycleView={isRecycleView}
          onClose={() => setAssetContextMenu(null)}
          onPreview={() => {
            setAssetContextMenu(null)
            openAssetPreview(contextAsset)
          }}
          onReveal={() => {
            setAssetContextMenu(null)
            void revealAsset(contextAsset.id)
          }}
          onExport={() => {
            setAssetContextMenu(null)
            void exportAssets([contextAsset.id])
          }}
          onRename={() => {
            setAssetContextMenu(null)
            openAssetRename(contextAsset)
          }}
          onDelete={() => {
            setAssetContextMenu(null)
            void deleteAssets([contextAsset.id])
          }}
          onRestore={() => {
            setAssetContextMenu(null)
            void restoreAsset(contextAsset.id)
          }}
        />
      ) : null}

      {previewAsset ? (
        <CloudAssetPreviewDialog
          asset={previewAsset}
          onClose={() => setPreviewAsset(null)}
          onReveal={() => void revealAsset(previewAsset.id)}
          onExport={() => void exportAssets([previewAsset.id])}
        />
      ) : null}

      {shareOpen && shareTargetFolder ? (
        <aside className="cloud-share-panel" aria-label="管理协作者">
          <div className="cloud-share-head">
            <div><span>管理协作者</span><strong>{shareTargetFolder.name}</strong></div>
            <button type="button" onClick={closeSharePanel}><X size={16} /></button>
          </div>
          <label className="cloud-share-search"><Search size={14} /><input value={collaboratorQuery} onChange={(event) => setCollaboratorQuery(event.target.value)} placeholder="搜索手机号" /></label>
          <label className="cloud-check">
            <input type="checkbox" checked={folderAllShared} onChange={(event) => void changeAllFolderCollaborators(event.target.checked)} disabled={busy || !shareableCollaborators.length} />
            全员可见
            <span>{folderSharedCount} 人已授权</span>
          </label>
          <div className="cloud-collaborators">
            {visibleCollaborators.map((item) => {
              const role = folderCollaboratorRole(shareTargetFolder, item)
              const isOwner = item.role === '所有者'
              return (
              <div className="cloud-collaborator" key={item.phone}>
                <input type="checkbox" checked={role !== '无权限'} disabled={isOwner || busy} onChange={(event) => void changeFolderCollaboratorRole(item.phone, event.target.checked ? '可管理' : '无权限')} />
                <span className="cloud-avatar">{item.name.slice(0, 1).toUpperCase()}</span>
                <div>
                  <strong>{item.name}</strong>
                  <small>{item.phone}</small>
                </div>
                <select value={role} disabled={isOwner || busy} onChange={(event) => void changeFolderCollaboratorRole(item.phone, event.target.value as FolderCollaborator['role'] | '无权限')}>
                  {isOwner ? <option>所有者</option> : null}
                  <option>可管理</option>
                  <option>仅查看</option>
                  <option>无权限</option>
                </select>
              </div>
            )})}
          </div>
          <p>共享当前文件夹时，被授权成员可看到该文件夹及其子文件夹；未授权成员不会出现在“我的协作”。</p>
        </aside>
      ) : null}

      {folderDialog ? (
        <CloudFolderDialog
          mode={folderDialog.mode}
          value={folderName}
          duplicate={folderDialogDuplicate}
          cleanValue={folderDialogCleanName}
          onChange={setFolderName}
          onClose={() => setFolderDialog(null)}
          onConfirm={commitFolderDialog}
        />
      ) : null}
      {assetRenameTarget ? (
        <CloudAssetRenameDialog
          value={assetName}
          onChange={setAssetName}
          onClose={() => setAssetRenameTarget(null)}
          onConfirm={commitAssetRename}
        />
      ) : null}
      {importProgress && !uploadResult ? (
        <CloudImportProgressDialog progress={importProgress} onClose={() => setImportProgress(null)} />
      ) : null}
      {uploadResult ? <CloudUploadDialog result={uploadResult} onClose={() => setUploadResult(null)} /> : null}
    </section>
  )
}

function CloudEmptyArtwork() {
  return (
    <div className="cloud-empty-art" aria-hidden="true">
      <span className="cloud-empty-backplate plate-left" />
      <span className="cloud-empty-backplate plate-right" />
      <span className="cloud-empty-box" />
      <span className="cloud-empty-person">
        <i className="head" />
        <i className="hair" />
        <i className="body" />
        <i className="arm" />
        <i className="leg leg-left" />
        <i className="leg leg-right" />
      </span>
      <span className="cloud-empty-diamond diamond-left" />
      <span className="cloud-empty-diamond diamond-right" />
    </div>
  )
}

function FolderContextMenu({
  folder,
  position,
  canCreateChild,
  onClose,
  onOpen,
  onCreateChild,
  onUploadFile,
  onUploadFolder,
  onShare,
  onCopyLink,
  onExport,
  onRename,
  onDelete,
}: {
  folder: CloudFolder
  position: FolderContextMenuState
  canCreateChild: boolean
  onClose: () => void
  onOpen: () => void
  onCreateChild: () => void
  onUploadFile: () => void
  onUploadFolder: () => void
  onShare: () => void
  onCopyLink: () => void
  onExport: () => void
  onRename: () => void
  onDelete: () => void
}) {
  return (
    <div className="cloud-context-layer" onMouseDown={onClose} role="presentation">
      <div
        className="cloud-folder-context-menu"
        style={{ left: position.x, top: position.y }}
        role="menu"
        aria-label={`${folder.name}操作菜单`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button type="button" role="menuitem" onClick={onOpen}><ExternalLink size={15} /> 在当前区域打开</button>
        <div className="cloud-context-divider" />
        <button type="button" role="menuitem" onClick={onCreateChild} disabled={!canCreateChild}><FolderPlus size={15} /> 新建子文件夹</button>
        <button type="button" role="menuitem" onClick={onUploadFile}><UploadCloud size={15} /> 上传文件</button>
        <button type="button" role="menuitem" onClick={onUploadFolder}><Upload size={15} /> 上传文件夹</button>
        <div className="cloud-context-divider" />
        <button type="button" role="menuitem" onClick={onShare}><Share2 size={15} /> 分享 / 权限</button>
        <button type="button" role="menuitem" onClick={onCopyLink}><Link size={15} /> 复制链接</button>
        <div className="cloud-context-divider" />
        <button type="button" role="menuitem" disabled><FolderOpen size={15} /> 移动到</button>
        <button type="button" role="menuitem" disabled><Star size={15} /> 添加到快捷访问</button>
        <button type="button" role="menuitem" disabled><Copy size={15} /> 转移所有权</button>
        <div className="cloud-context-divider" />
        <button type="button" role="menuitem" onClick={onExport}><Download size={15} /> 导出</button>
        <button type="button" role="menuitem" onClick={onRename}><Pencil size={15} /> 重命名</button>
        <button type="button" role="menuitem" className="danger" onClick={onDelete}><Trash2 size={15} /> 删除</button>
      </div>
    </div>
  )
}

function AssetContextMenu({
  asset,
  position,
  isRecycleView,
  onClose,
  onPreview,
  onReveal,
  onExport,
  onRename,
  onDelete,
  onRestore,
}: {
  asset: CloudAsset
  position: AssetContextMenuState
  isRecycleView: boolean
  onClose: () => void
  onPreview: () => void
  onReveal: () => void
  onExport: () => void
  onRename: () => void
  onDelete: () => void
  onRestore: () => void
}) {
  return (
    <div className="cloud-context-layer" onMouseDown={onClose} onContextMenu={(event) => event.preventDefault()} role="presentation">
      <div
        className="cloud-folder-context-menu cloud-asset-context-menu"
        style={{ left: position.x, top: position.y }}
        role="menu"
        aria-label={`${asset.name}操作菜单`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {isRecycleView ? (
          <>
            <button type="button" role="menuitem" onClick={onPreview}><Eye size={15} /> 预览</button>
            <button type="button" role="menuitem" onClick={onRestore}><RotateCcw size={15} /> 还原</button>
          </>
        ) : (
          <>
            <button type="button" role="menuitem" onClick={onPreview}><Eye size={15} /> 预览</button>
            <button type="button" role="menuitem" onClick={onReveal}><ExternalLink size={15} /> 定位文件</button>
            <button type="button" role="menuitem" onClick={onExport}><Download size={15} /> 导出素材</button>
            <button type="button" role="menuitem" onClick={onRename}><Pencil size={15} /> 重命名</button>
            <div className="cloud-context-divider" />
            <button type="button" role="menuitem" className="danger" onClick={onDelete}><Trash2 size={15} /> 删除</button>
          </>
        )}
      </div>
    </div>
  )
}

function CloudFolderCard({
  folder,
  isRecycleView,
  selected,
  onOpen,
  onRestore,
  onSelectChange,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  folder: CloudFolder
  isRecycleView: boolean
  selected: boolean
  onOpen: () => void
  onRestore: () => void
  onSelectChange: (checked: boolean) => void
  onDragStart: (event: DragEvent<HTMLElement>) => void
  onDragEnd: () => void
  onDragOver: (event: DragEvent<HTMLElement>) => void
  onDrop: (event: DragEvent<HTMLElement>) => void
}) {
  return (
    <article
      className={`cloud-folder-card ${folder.shared ? 'shared' : ''} ${selected ? 'selected' : ''}`}
      draggable={!isRecycleView}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <input
        className="cloud-card-select"
        type="checkbox"
        checked={selected}
        onChange={(event) => onSelectChange(event.target.checked)}
        onClick={(event) => event.stopPropagation()}
        aria-label={`选择${folder.name}`}
      />
      <button type="button" className="cloud-folder-card-main" onClick={onOpen}>
        <Folder size={34} />
        <strong title={folder.name}>{folder.name}</strong>
        <span>{folder.count} 项{folder.shared ? ' · 已共享' : ''}</span>
      </button>
      {isRecycleView ? (
        <button type="button" className="cloud-card-action" onClick={onRestore}><RotateCcw size={13} /> 还原</button>
      ) : null}
    </article>
  )
}

function CloudAssetCard({
  asset,
  isRecycleView,
  selected,
  onDragStart,
  onSelectChange,
  onToggleFavorite,
  onPreview,
  onContextMenu,
  onRestore,
}: {
  asset: CloudAsset
  isRecycleView: boolean
  selected: boolean
  onDragStart: (event: DragEvent<HTMLElement>) => void
  onSelectChange: (checked: boolean) => void
  onToggleFavorite: () => void
  onPreview: () => void
  onContextMenu: (event: MouseEvent<HTMLElement>) => void
  onRestore: () => void
}) {
  const previewUrl = cloudAssetPreviewUrl(asset)
  const cover = getAssetCoverMeta(asset)
  const showMediaPreview = Boolean(previewUrl && (asset.kind === '视频' || asset.kind === '图片'))
  const assetDisplayName = getAssetDisplayName(asset)
  return (
    <article className={`cloud-asset-card ${selected ? 'selected' : ''}`} draggable={!isRecycleView} onClick={onPreview} onDragStart={onDragStart} onContextMenu={onContextMenu}>
      <input
        className="cloud-card-select"
        type="checkbox"
        checked={selected}
        onChange={(event) => onSelectChange(event.target.checked)}
        onClick={(event) => event.stopPropagation()}
        aria-label={`选择${assetDisplayName}`}
      />
      <div className="cloud-asset-body">
        <div className={`cloud-asset-thumb tone-${asset.tone} ${showMediaPreview ? 'has-media' : `file-cover ${cover.className}`}`}>
          {showMediaPreview && asset.kind === '视频' ? <video src={previewUrl} muted preload="metadata" /> : null}
          {showMediaPreview && asset.kind === '图片' ? <img src={previewUrl} alt={assetDisplayName} /> : null}
          {!showMediaPreview ? (
            <div className="cloud-asset-file-cover" aria-hidden="true">
              <cover.Icon size={34} strokeWidth={1.9} />
              <small>{cover.detail}</small>
            </div>
          ) : null}
          {asset.duration ? <span>{asset.duration}</span> : null}
          <i>{cover.label}</i>
          {!isRecycleView ? (
            <button type="button" className={`cloud-favorite-action ${isFavoriteAsset(asset) ? 'active' : ''}`} onClick={(event) => { event.stopPropagation(); onToggleFavorite() }} aria-label={isFavoriteAsset(asset) ? '取消收藏' : '收藏素材'}>
              <Star size={13} />
            </button>
          ) : null}
        </div>
        <strong className="cloud-asset-name" title={assetDisplayName}>{assetDisplayName}</strong>
        {isRecycleView ? (
          <button type="button" className="cloud-card-action" onClick={(event) => { event.stopPropagation(); onRestore() }}><RotateCcw size={13} /> 还原</button>
        ) : (
          <div className="cloud-asset-foot">
            <span>{asset.size || '未知大小'}</span>
            <em className="cloud-asset-status-chip">{asset.status}</em>
          </div>
        )}
      </div>
    </article>
  )
}

function CloudAssetPreviewDialog({
  asset,
  onClose,
  onReveal,
  onExport,
}: {
  asset: CloudAsset
  onClose: () => void
  onReveal: () => void
  onExport: () => void
}) {
  const previewUrl = cloudAssetPreviewUrl(asset)
  const cover = getAssetCoverMeta(asset)
  const isTextPreview = isTextPreviewAsset(asset)
  const isPdfPreview = isPdfAsset(asset)
  const [textState, setTextState] = useState<{ status: 'idle' | 'loading' | 'done' | 'failed'; content: string; error: string }>({
    status: 'idle',
    content: '',
    error: '',
  })

  useEffect(() => {
    if (!isTextPreview) return
    let alive = true
    setTextState({ status: 'loading', content: '', error: '' })
    readAssetTextPreview(asset, previewUrl).then((content) => {
      if (alive) setTextState({ status: 'done', content, error: '' })
    }).catch((error) => {
      if (alive) setTextState({ status: 'failed', content: '', error: error instanceof Error ? error.message : '无法读取文本预览' })
    })
    return () => {
      alive = false
    }
  }, [asset, isTextPreview, previewUrl])

  return (
    <div className="cloud-dialog-backdrop upload" role="presentation" onClick={onClose}>
      <section className="cloud-upload-dialog cloud-asset-preview-dialog" role="dialog" aria-modal="true" aria-label="素材预览" onClick={(event) => event.stopPropagation()}>
        <div className="cloud-dialog-head">
          <div>
            <span>素材预览</span>
            <strong title={asset.name}>{asset.name}</strong>
          </div>
          <button type="button" onClick={onClose}><X size={16} /></button>
        </div>
        <div className={`cloud-preview-stage ${cover.className}`}>
          {asset.kind === '视频' && previewUrl ? <video src={previewUrl} controls preload="metadata" /> : null}
          {asset.kind === '图片' && previewUrl ? <img src={previewUrl} alt={asset.name} /> : null}
          {asset.kind === '音频' && previewUrl ? (
            <div className="cloud-preview-audio">
              <cover.Icon size={42} />
              <audio src={previewUrl} controls />
            </div>
          ) : null}
          {isTextPreview ? (
            <div className="cloud-preview-text">
              {textState.status === 'loading' ? <Loader2 className="spin" size={24} /> : null}
              {textState.status === 'done' ? <pre>{textState.content}</pre> : null}
              {textState.status === 'failed' ? <span>{textState.error}</span> : null}
            </div>
          ) : null}
          {!isTextPreview && isPdfPreview && previewUrl ? <iframe src={previewUrl} title={asset.name} /> : null}
          {!isTextPreview && asset.kind !== '视频' && asset.kind !== '图片' && asset.kind !== '音频' && !isPdfPreview ? (
            <div className="cloud-preview-file">
              <cover.Icon size={52} strokeWidth={1.85} />
              <strong title={asset.name}>{asset.name}</strong>
              <span>{asset.size || '未知大小'}</span>
            </div>
          ) : null}
        </div>
        <div className="cloud-preview-meta">
          <div><span>文件名</span><strong title={asset.name}>{asset.name}</strong></div>
          <div><span>大小</span><strong>{asset.size || '未知大小'}</strong></div>
          <div><span>类型</span><strong>{asset.mimeType || cover.label}</strong></div>
        </div>
        <div className="cloud-upload-foot">
          <span>{asset.status}</span>
          <button type="button" onClick={onReveal}><ExternalLink size={14} /> 定位文件</button>
          <button className="primary" type="button" onClick={onExport}><Download size={14} /> 导出</button>
        </div>
      </section>
    </div>
  )
}

function getAssetCoverMeta(asset: CloudAsset): AssetCoverMeta {
  const mime = String(asset.mimeType || '').toLowerCase()
  const ext = getAssetExtension(asset).toLowerCase()
  const upperExt = ext ? ext.slice(1).toUpperCase() : ''

  if (asset.kind === '音频' || mime.startsWith('audio/') || ['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg'].includes(ext)) {
    return { Icon: FileAudio, label: '音频', detail: upperExt || 'AUDIO', className: 'audio' }
  }
  if (asset.kind === '视频' || mime.startsWith('video/')) {
    return { Icon: Play, label: asset.kind === '成片' ? '成片' : '视频', detail: upperExt || 'VIDEO', className: 'video' }
  }
  if (asset.kind === '图片' || mime.startsWith('image/')) {
    return { Icon: Image, label: '图片', detail: upperExt || 'IMAGE', className: 'image' }
  }
  if (ext === '.pdf' || mime === 'application/pdf') {
    return { Icon: FileText, label: 'PDF', detail: 'PDF', className: 'pdf' }
  }
  if (['.doc', '.docx', '.rtf'].includes(ext) || mime.includes('wordprocessingml') || mime.includes('msword')) {
    return { Icon: FileText, label: '文档', detail: upperExt || 'DOC', className: 'document' }
  }
  if (['.xls', '.xlsx', '.csv'].includes(ext) || mime.includes('spreadsheetml') || mime.includes('excel')) {
    return { Icon: FileSpreadsheet, label: '表格', detail: upperExt || 'SHEET', className: 'sheet' }
  }
  if (['.ppt', '.pptx', '.key'].includes(ext) || mime.includes('presentationml') || mime.includes('powerpoint')) {
    return { Icon: FileType, label: '演示', detail: upperExt || 'PPT', className: 'slides' }
  }
  if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext) || mime.includes('zip') || mime.includes('compressed')) {
    return { Icon: FileArchive, label: '压缩包', detail: upperExt || 'ZIP', className: 'archive' }
  }
  if (ext === '.json' || mime.includes('json')) {
    return { Icon: FileJson, label: 'JSON', detail: 'JSON', className: 'code' }
  }
  if (['.js', '.ts', '.tsx', '.jsx', '.html', '.css', '.xml', '.yaml', '.yml'].includes(ext)) {
    return { Icon: FileCode, label: '代码', detail: upperExt || 'CODE', className: 'code' }
  }
  if (['.txt', '.md', '.log'].includes(ext) || mime.startsWith('text/')) {
    return { Icon: FileText, label: '文本', detail: upperExt || 'TEXT', className: 'document' }
  }
  return { Icon: asset.kind === '成片' ? Film : Command, label: asset.kind, detail: upperExt || asset.kind, className: 'project' }
}

function getAssetExtension(asset: CloudAsset) {
  const name = asset.name || asset.localPath || asset.originalPath || ''
  const match = String(name).match(/\.[^.\\/\s]+$/)
  return match?.[0] || ''
}

function getAssetDisplayName(asset: CloudAsset) {
  const cleanName = String(asset.name || '').trim()
  if (cleanName) return cleanName
  return getPathFileName(asset.localPath) || getPathFileName(asset.originalPath) || '未命名素材'
}

function getPathFileName(filePath?: string) {
  const cleanPath = String(filePath || '').trim()
  if (!cleanPath) return ''
  const parts = cleanPath.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || cleanPath
}

function isTextPreviewAsset(asset: CloudAsset) {
  const mime = String(asset.mimeType || '').toLowerCase()
  const ext = getAssetExtension(asset).toLowerCase()
  return mime.startsWith('text/')
    || mime.includes('json')
    || mime.includes('xml')
    || ['.txt', '.md', '.json', '.csv', '.log', '.xml', '.html', '.css', '.js', '.jsx', '.ts', '.tsx', '.yaml', '.yml'].includes(ext)
}

function isPdfAsset(asset: CloudAsset) {
  const mime = String(asset.mimeType || '').toLowerCase()
  return mime === 'application/pdf' || getAssetExtension(asset).toLowerCase() === '.pdf'
}

function assetLocalPreviewPath(asset: CloudAsset) {
  return asset.localPath || asset.originalPath || ''
}

async function readAssetTextPreview(asset: CloudAsset, previewUrl: string) {
  const localPath = assetLocalPreviewPath(asset)
  const fileApi = (window.surgicol as { file?: { readText?: (filePath: string) => Promise<string> } } | undefined)?.file
  if (localPath && fileApi?.readText) return fileApi.readText(localPath)
  if (/^(https?:|data:|blob:)/i.test(previewUrl)) {
    const response = await fetch(previewUrl)
    if (!response.ok) throw new Error('无法读取文本预览')
    return response.text()
  }
  throw new Error('当前文件没有可读取的本地路径')
}

function CloudAssetRenameDialog({
  value,
  onChange,
  onClose,
  onConfirm,
}: {
  value: string
  onChange: (value: string) => void
  onClose: () => void
  onConfirm: () => void
}) {
  const cleanValue = sanitizeFolderName(value)
  return (
    <div className="cloud-dialog-backdrop" role="presentation" onClick={onClose}>
      <section className="cloud-dialog" role="dialog" aria-modal="true" aria-label="重命名素材" onClick={(event) => event.stopPropagation()}>
        <div className="cloud-dialog-head">
          <strong>重命名素材</strong>
          <button type="button" onClick={onClose}><X size={16} /></button>
        </div>
        <label>
          <span>素材名称</span>
          <input value={value} onChange={(event) => onChange(event.target.value)} autoFocus />
        </label>
        <p>只修改素材库显示名，不改动源文件名称。</p>
        <div className="cloud-dialog-actions">
          <button type="button" onClick={onClose}>取消</button>
          <button className="primary" type="button" onClick={onConfirm} disabled={!cleanValue}>确定</button>
        </div>
      </section>
    </div>
  )
}

function CloudFolderDialog({
  mode,
  value,
  duplicate,
  cleanValue,
  onChange,
  onClose,
  onConfirm,
}: {
  mode: FolderDialogState['mode']
  value: string
  duplicate: boolean
  cleanValue: string
  onChange: (value: string) => void
  onClose: () => void
  onConfirm: () => void
}) {
  const title = mode === 'rename' ? '编辑文件夹' : mode === 'child' ? '新建子文件夹' : '新建文件夹'
  const helperText = duplicate
    ? `同一层级已存在「${cleanValue}」，请换一个名称。`
    : '支持中文、英文、数字，名称会自动过滤 / \\ : * ? " < > | 等特殊符号。'
  return (
    <div className="cloud-dialog-backdrop" role="presentation" onClick={onClose}>
      <section className="cloud-dialog" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <div className="cloud-dialog-head">
          <strong>{title}</strong>
          <button type="button" onClick={onClose}><X size={16} /></button>
        </div>
        <label>
          <span>文件夹名称</span>
          <input value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={duplicate} autoFocus />
        </label>
        <p className={duplicate ? 'error' : ''}>{helperText}</p>
        <div className="cloud-dialog-actions">
          <button type="button" onClick={onClose}>取消</button>
          <button className="primary" type="button" onClick={onConfirm} disabled={!cleanValue || duplicate}>确定</button>
        </div>
      </section>
    </div>
  )
}

function CloudImportProgressDialog({
  progress,
  onClose,
}: {
  progress: MaterialLibraryImportProgress
  onClose: () => void
}) {
  const canClose = progress.stage === 'done' || progress.stage === 'failed' || progress.stage === 'canceled'
  const activeFiles = progress.files.length ? progress.files : []
  return (
    <div className="cloud-dialog-backdrop upload" role="presentation" onClick={canClose ? onClose : undefined}>
      <section className="cloud-upload-dialog cloud-progress-dialog" role="dialog" aria-modal="true" aria-label="上传进度" onClick={(event) => event.stopPropagation()}>
        <div className="cloud-dialog-head">
          <div>
            <span>{progress.mode === 'folder' ? '上传文件夹' : '上传文件'}</span>
            <strong>{progress.message || '正在上传素材'}</strong>
          </div>
          <button type="button" onClick={onClose} disabled={!canClose}><X size={16} /></button>
        </div>
        <div className="cloud-progress-summary">
          <div>
            <strong>{progress.overallPercent}%</strong>
            <span>{progress.completedFiles}/{progress.totalFiles} 已完成{progress.failedFiles ? ` · ${progress.failedFiles} 失败` : ''}</span>
          </div>
          <i><b style={{ width: `${progress.overallPercent}%` }} /></i>
        </div>
        <div className="cloud-progress-list">
          {activeFiles.length ? activeFiles.map((file) => (
            <article className={`cloud-progress-file ${file.status}`} key={file.id}>
              <div>
                <strong title={file.relativePath || file.name}>{file.name}</strong>
                <span>{file.relativePath || file.size || ''}</span>
              </div>
              <em>{progressFileStatusText(file.status, file.percent)}</em>
              <i><b style={{ width: `${Math.max(0, Math.min(100, file.percent))}%` }} /></i>
              {file.message ? <small>{file.message}</small> : null}
            </article>
          )) : (
            <div className="cloud-progress-empty">
              <Loader2 className="spin" size={22} />
              <span>{progress.message}</span>
            </div>
          )}
        </div>
        <div className="cloud-upload-foot">
          <span>{canClose ? '上传任务已结束。' : '上传中请保持当前窗口打开。'}</span>
          <button className="primary" type="button" onClick={onClose} disabled={!canClose}>完成</button>
        </div>
      </section>
    </div>
  )
}

function CloudUploadDialog({ result, onClose }: { result: UploadResultDialogState; onClose: () => void }) {
  const previewItems = result.assets.slice(0, 8)
  return (
    <div className="cloud-dialog-backdrop upload" role="presentation" onClick={onClose}>
      <section className="cloud-upload-dialog" role="dialog" aria-modal="true" aria-label="上传素材" onClick={(event) => event.stopPropagation()}>
        <div className="cloud-dialog-head">
          <div><span>{result.mode === 'folder' ? '上传文件夹' : '上传文件'}</span><strong>真实文件已上传到 OSS</strong></div>
          <button type="button" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="cloud-upload-success">
          <span />
          {result.successText}
        </div>
        <div className="cloud-upload-body">
          <div className="cloud-upload-drop">
            <UploadCloud size={34} />
            <strong>{result.mode === 'folder' ? '已保留电脑文件夹内部分类' : '已读取真实文件名称、体积和媒体时长'}</strong>
            <span>{result.folders.length ? `新增 ${result.folders.length} 个文件夹。` : '文件已进入当前文件夹。'}</span>
          </div>
          <div className="cloud-upload-preview">
            {previewItems.map((item, index) => (
              <article key={item.id}>
                <div className={`cloud-upload-thumb tone-${item.tone}`} />
                <strong>{item.name}</strong>
                <span>{item.kind} · {item.size}</span>
                <i style={{ width: `${86 + index * 3}%` }} />
              </article>
            ))}
          </div>
        </div>
        <div className="cloud-upload-foot">
          <span>已同步 {result.assets.length} 个素材{result.folders.length ? `、${result.folders.length} 个文件夹` : ''}。</span>
          <button className="primary" type="button" onClick={onClose}>完成</button>
        </div>
      </section>
    </div>
  )
}

function progressFileStatusText(status: MaterialLibraryImportProgress['files'][number]['status'], percent: number) {
  if (status === 'done') return '完成'
  if (status === 'failed') return '失败'
  if (status === 'uploading') return `${Math.max(0, Math.min(100, Math.round(percent)))}%`
  return '等待'
}

function getFolderPath(folders: CloudFolder[], folderId: string) {
  const path: CloudFolder[] = []
  let current = folders.find((folder) => folder.id === folderId)
  while (current) {
    path.unshift(current)
    current = current.parentId ? folders.find((folder) => folder.id === current?.parentId) : undefined
  }
  return path
}

function getDescendantFolderIds(folders: CloudFolder[], folderId: string): string[] {
  const children = folders.filter((folder) => folder.parentId === folderId)
  return children.flatMap((folder) => [folder.id, ...getDescendantFolderIds(folders, folder.id)])
}

function canDropOnFolder(item: DraggedMaterialItem | null, targetFolderId: string | null, folders: CloudFolder[]) {
  if (!item) return false
  if (targetFolderId && folders.find((folder) => folder.id === targetFolderId)?.deletedAt) return false
  if (item.type === 'asset') return Boolean(targetFolderId)
  if (item.type === 'folder') {
    if (targetFolderId === item.id) return false
    if (targetFolderId && getDescendantFolderIds(folders, item.id).includes(targetFolderId)) return false
    return true
  }
  return false
}

function canCreateChildFolder(folders: CloudFolder[], folderId: string) {
  return getFolderPath(folders, folderId).length < 5
}

function sanitizeFolderName(value: string) {
  return String(value || '').trim().replace(/[\\/:*?"<>|]/g, '')
}

function normalizeFolderName(value: string) {
  return sanitizeFolderName(value).toLowerCase()
}

function hasSiblingFolderName(folders: CloudFolder[], parentId: string | null, name: string, excludeId?: string) {
  const normalizedName = normalizeFolderName(name)
  return folders.some((folder) => (
    !folder.deletedAt
    && folder.id !== excludeId
    && folder.parentId === parentId
    && normalizeFolderName(folder.name) === normalizedName
  ))
}

function nextAvailableFolderName(folders: CloudFolder[], parentId: string | null, baseName: string) {
  const cleanBaseName = sanitizeFolderName(baseName) || '新建项目'
  let name = cleanBaseName
  let index = 2
  while (hasSiblingFolderName(folders, parentId, name)) {
    name = `${cleanBaseName} ${index}`
    index += 1
  }
  return name
}

function isFavoriteAsset(asset: CloudAsset) {
  return Boolean(asset.favorite || asset.status.includes('收藏'))
}

function isRecentAsset(asset: CloudAsset, cutoff: number) {
  return new Date(asset.updatedAt || asset.createdAt || 0).getTime() >= cutoff
}

function folderCollaboratorRole(folder: CloudFolder, collaborator: Collaborator): Collaborator['role'] {
  if (collaborator.role === '所有者') return '所有者'
  const explicit = folder.collaborators?.find((item) => item.phone === collaborator.phone)
  if (explicit) return explicit.role
  if (folder.shared && collaborator.enabled && collaborator.role !== '无权限') {
    return collaborator.role === '仅查看' ? '仅查看' : '可管理'
  }
  return '无权限'
}

function effectiveFolderCollaborators(folder: CloudFolder, collaborators: Collaborator[]): FolderCollaborator[] {
  const explicit = normalizeFolderCollaborators(folder.collaborators)
  if (explicit.length || !folder.shared) return explicit
  return collaborators
    .filter((item) => item.role !== '所有者' && item.enabled && item.role !== '无权限')
    .map((item) => ({
      phone: item.phone,
      role: item.role === '仅查看' ? '仅查看' : '可管理',
    }))
}

function nextFolderCollaborators(
  folder: CloudFolder,
  collaborators: Collaborator[],
  phone: string,
  role: FolderCollaborator['role'] | '无权限',
) {
  const byPhone = new Map(effectiveFolderCollaborators(folder, collaborators).map((item) => [item.phone, item]))
  if (role === '无权限') byPhone.delete(phone)
  else byPhone.set(phone, { phone, role })
  return normalizeFolderCollaborators([...byPhone.values()])
}

function normalizeFolderCollaborators(value: unknown): FolderCollaborator[] {
  const incoming = Array.isArray(value) ? value : []
  const byPhone = new Map<string, FolderCollaborator>()
  incoming.forEach((item) => {
    if (!item || typeof item !== 'object') return
    const record = item as Partial<FolderCollaborator>
    const phone = String(record.phone || '').trim()
    const role = record.role === '仅查看' ? '仅查看' : record.role === '可管理' ? '可管理' : null
    if (!phone || !role) return
    byPhone.set(phone, { phone, role })
  })
  return [...byPhone.values()]
}

function isInSharedFolder(folderId: string, folders: CloudFolder[], sharedFolderIds: Set<string>) {
  let current = folders.find((folder) => folder.id === folderId)
  while (current) {
    if (sharedFolderIds.has(current.id)) return true
    current = current.parentId ? folders.find((folder) => folder.id === current?.parentId) : undefined
  }
  return false
}
