import { preferenceClient } from '../../../shared/clients/preference-client'
import type { DirectorMaterialPackage, GeneratedCanvasAsset } from '../../../shared/clients/preference-client'
import type {
  CloudAsset,
  CloudAssetKind,
  CloudFolder,
  Collaborator,
  FolderCollaborator,
  MaterialLibraryExternalAsset,
  MaterialLibraryImportProgress,
  MaterialLibraryImportResult,
  MaterialLibrarySnapshot,
} from '../types'

type MaterialLibraryBridgeResult = {
  ok: boolean
  state?: MaterialLibrarySnapshot
  assets?: CloudAsset[]
  folders?: CloudFolder[]
  canceled?: boolean
  error?: string
}

type MaterialLibraryBridge = {
  list?: () => Promise<MaterialLibraryBridgeResult>
  createFolder?: (payload: { name: string; parentId: string | null }) => Promise<MaterialLibraryBridgeResult>
  renameFolder?: (payload: { id: string; name: string }) => Promise<MaterialLibraryBridgeResult>
  deleteFolder?: (payload: { id: string }) => Promise<MaterialLibraryBridgeResult>
  restoreFolder?: (payload: { id: string }) => Promise<MaterialLibraryBridgeResult>
  moveFolder?: (payload: { id: string; parentId: string | null }) => Promise<MaterialLibraryBridgeResult>
  moveAssets?: (payload: { assetIds: string[]; folderId: string }) => Promise<MaterialLibraryBridgeResult>
  renameAsset?: (payload: { id: string; name: string }) => Promise<MaterialLibraryBridgeResult>
  deleteAssets?: (payload: { assetIds: string[] }) => Promise<MaterialLibraryBridgeResult>
  restoreAssets?: (payload: { assetIds: string[] }) => Promise<MaterialLibraryBridgeResult>
  revealAsset?: (payload: { id: string }) => Promise<MaterialLibraryBridgeResult>
  exportAssets?: (payload: { assetIds: string[] }) => Promise<MaterialLibraryBridgeResult & { exported?: { count: number; directory: string } }>
  exportFolder?: (payload: { id: string }) => Promise<MaterialLibraryBridgeResult & { exported?: { count: number; directory: string } }>
  toggleAssetFavorite?: (payload: { id: string; favorite: boolean }) => Promise<MaterialLibraryBridgeResult>
  importLocalEntries?: (payload: { folderId: string; mode: 'file' | 'folder'; taskId?: string }) => Promise<MaterialLibraryBridgeResult>
  updateCollaborator?: (payload: { phone: string; role: Collaborator['role']; enabled: boolean }) => Promise<MaterialLibraryBridgeResult>
  updateFolderCollaborators?: (payload: { folderId: string; collaborators: FolderCollaborator[] }) => Promise<MaterialLibraryBridgeResult>
  syncExternalAssets?: (payload: { assets: MaterialLibraryExternalAsset[] }) => Promise<MaterialLibraryBridgeResult>
  onImportProgress?: (callback: (progress: MaterialLibraryImportProgress) => void) => () => void
}

const fallbackStateKey = 'moyaclaw-material-library-state'
const fallbackFolders: CloudFolder[] = [
  { id: 'folder-director-packages', name: '爆款编导', parentId: null, count: 0, shared: true },
  { id: 'folder-ai-canvas', name: 'AI画布', parentId: null, count: 0 },
  { id: 'folder-local-upload', name: '本地上传', parentId: null, count: 0, shared: true },
  { id: 'folder-fission-production', name: '合成量产', parentId: null, count: 0, shared: true },
  { id: 'folder-final-output', name: '成片输出', parentId: null, count: 0, shared: true },
]
const fallbackCollaborators: Collaborator[] = [
  { name: 'ms', phone: '15812430995', role: '所有者', enabled: true },
  { name: '刘江', phone: '18897967083', role: '可管理', enabled: true },
  { name: '王海帆', phone: '18717932365', role: '无权限', enabled: false },
  { name: '刘晓铭', phone: '15397504896', role: '无权限', enabled: false },
]

export const materialLibraryClient = {
  async list(): Promise<MaterialLibrarySnapshot> {
    const externalAssets = collectExternalAssets()
    const bridge = materialLibraryBridge()
    if (bridge?.syncExternalAssets) {
      const result = await bridge.syncExternalAssets({ assets: externalAssets })
      if (result.ok && result.state) return result.state
    }
    if (bridge?.list) {
      const result = await bridge.list()
      if (result.ok && result.state) return result.state
    }
    return saveFallbackState(mergeExternalAssets(readFallbackState(), externalAssets))
  },

  async createFolder(payload: { name: string; parentId: string | null }) {
    const bridge = materialLibraryBridge()
    if (bridge?.createFolder) return bridge.createFolder(payload)
    const state = readFallbackState()
    const name = sanitizeFolderName(payload.name) || '新建文件夹'
    if (hasSiblingFolderName(state.folders, payload.parentId, name)) {
      return { ok: false, error: `同一层级已存在「${name}」，请换一个名称` }
    }
    const now = new Date().toISOString()
    const folder: CloudFolder = {
      id: `folder-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      parentId: payload.parentId,
      count: 0,
      createdAt: now,
      updatedAt: now,
    }
    return okWithState(saveFallbackState({ ...state, folders: [...state.folders, folder] }))
  },

  async renameFolder(payload: { id: string; name: string }) {
    const bridge = materialLibraryBridge()
    if (bridge?.renameFolder) return bridge.renameFolder(payload)
    const state = readFallbackState()
    const name = sanitizeFolderName(payload.name)
    if (!name) return { ok: false, error: '请输入文件夹名称' }
    const targetFolder = state.folders.find((folder) => folder.id === payload.id)
    if (!targetFolder) return { ok: false, error: '文件夹不存在' }
    if (hasSiblingFolderName(state.folders, targetFolder.parentId, name, payload.id)) {
      return { ok: false, error: `同一层级已存在「${name}」，请换一个名称` }
    }
    const folders = state.folders.map((folder) => (
      folder.id === payload.id ? { ...folder, name, updatedAt: new Date().toISOString() } : folder
    ))
    return okWithState(saveFallbackState({ ...state, folders }))
  },

  async deleteFolder(payload: { id: string }) {
    const bridge = materialLibraryBridge()
    if (bridge?.deleteFolder) return bridge.deleteFolder(payload)
    const state = readFallbackState()
    const now = new Date().toISOString()
    const descendants = getDescendantFolderIds(state.folders, payload.id)
    const removeIds = new Set([payload.id, ...descendants])
    return okWithState(saveFallbackState({
      ...state,
      folders: state.folders.map((folder) => removeIds.has(folder.id) ? { ...folder, deletedAt: now, updatedAt: now } : folder),
      assets: state.assets.map((asset) => removeIds.has(asset.folderId) ? { ...asset, deletedAt: now, updatedAt: now } : asset),
    }))
  },

  async restoreFolder(payload: { id: string }) {
    const bridge = materialLibraryBridge()
    if (bridge?.restoreFolder) return bridge.restoreFolder(payload)
    const state = readFallbackState()
    const now = new Date().toISOString()
    const descendants = getDescendantFolderIds(state.folders, payload.id)
    const restoreIds = new Set([payload.id, ...descendants])
    return okWithState(saveFallbackState({
      ...state,
      folders: state.folders.map((folder) => restoreIds.has(folder.id) ? { ...folder, deletedAt: '', updatedAt: now } : folder),
      assets: state.assets.map((asset) => restoreIds.has(asset.folderId) ? { ...asset, deletedAt: '', updatedAt: now } : asset),
    }))
  },

  async moveFolder(payload: { id: string; parentId: string | null }) {
    const bridge = materialLibraryBridge()
    if (bridge?.moveFolder) return bridge.moveFolder(payload)
    const state = readFallbackState()
    if (payload.parentId === payload.id || getDescendantFolderIds(state.folders, payload.id).includes(payload.parentId || '')) {
      return { ok: false, error: '不能移动到自身或子文件夹中' }
    }
    const folder = state.folders.find((item) => item.id === payload.id && !item.deletedAt)
    if (!folder) return { ok: false, error: '文件夹不存在' }
    if (hasSiblingFolderName(state.folders, payload.parentId, folder.name, payload.id)) {
      return { ok: false, error: `目标位置已存在「${folder.name}」，请先重命名` }
    }
    const now = new Date().toISOString()
    return okWithState(saveFallbackState({
      ...state,
      folders: state.folders.map((folder) => folder.id === payload.id ? { ...folder, parentId: payload.parentId, updatedAt: now } : folder),
    }))
  },

  async moveAssets(payload: { assetIds: string[]; folderId: string }) {
    const bridge = materialLibraryBridge()
    if (bridge?.moveAssets) return bridge.moveAssets(payload)
    const state = readFallbackState()
    const ids = new Set(payload.assetIds)
    const now = new Date().toISOString()
    return okWithState(saveFallbackState({
      ...state,
      assets: state.assets.map((asset) => ids.has(asset.id) ? { ...asset, folderId: payload.folderId, updatedAt: now } : asset),
    }))
  },

  async renameAsset(payload: { id: string; name: string }) {
    const bridge = materialLibraryBridge()
    if (bridge?.renameAsset) return bridge.renameAsset(payload)
    const state = readFallbackState()
    const name = sanitizeFolderName(payload.name)
    if (!name) return { ok: false, error: '请输入素材名称' }
    const now = new Date().toISOString()
    return okWithState(saveFallbackState({
      ...state,
      assets: state.assets.map((asset) => asset.id === payload.id ? { ...asset, name, updatedAt: now } : asset),
    }))
  },

  async deleteAssets(payload: { assetIds: string[] }) {
    const bridge = materialLibraryBridge()
    if (bridge?.deleteAssets) return bridge.deleteAssets(payload)
    const state = readFallbackState()
    const ids = new Set(payload.assetIds)
    const now = new Date().toISOString()
    return okWithState(saveFallbackState({
      ...state,
      assets: state.assets.map((asset) => ids.has(asset.id) ? { ...asset, deletedAt: now, updatedAt: now } : asset),
    }))
  },

  async restoreAssets(payload: { assetIds: string[] }) {
    const bridge = materialLibraryBridge()
    if (bridge?.restoreAssets) return bridge.restoreAssets(payload)
    const state = readFallbackState()
    const ids = new Set(payload.assetIds)
    const activeFolderIds = new Set(state.folders.filter((folder) => !folder.deletedAt).map((folder) => folder.id))
    const now = new Date().toISOString()
    return okWithState(saveFallbackState({
      ...state,
      assets: state.assets.map((asset) => ids.has(asset.id) ? {
        ...asset,
        folderId: activeFolderIds.has(asset.folderId) ? asset.folderId : 'folder-local-upload',
        deletedAt: '',
        updatedAt: now,
      } : asset),
    }))
  },

  async revealAsset(payload: { id: string }) {
    const bridge = materialLibraryBridge()
    if (bridge?.revealAsset) return bridge.revealAsset(payload)
    return { ok: false, error: '请在 Electron 客户端中定位本地文件' }
  },

  async exportAssets(payload: { assetIds: string[] }) {
    const bridge = materialLibraryBridge()
    if (bridge?.exportAssets) return bridge.exportAssets(payload)
    return { ok: false, error: '请在 Electron 客户端中导出素材' }
  },

  async exportFolder(payload: { id: string }) {
    const bridge = materialLibraryBridge()
    if (bridge?.exportFolder) return bridge.exportFolder(payload)
    return { ok: false, error: '请在 Electron 客户端中导出文件夹' }
  },

  async toggleAssetFavorite(payload: { id: string; favorite: boolean }) {
    const bridge = materialLibraryBridge()
    if (bridge?.toggleAssetFavorite) return bridge.toggleAssetFavorite(payload)
    const state = readFallbackState()
    const now = new Date().toISOString()
    return okWithState(saveFallbackState({
      ...state,
      assets: state.assets.map((asset) => asset.id === payload.id ? { ...asset, favorite: payload.favorite, updatedAt: now } : asset),
    }))
  },

  async importLocalEntries(payload: { folderId: string; mode: 'file' | 'folder'; taskId?: string }): Promise<MaterialLibraryImportResult> {
    const bridge = materialLibraryBridge()
    if (bridge?.importLocalEntries) return bridge.importLocalEntries(payload)
    return { ok: false, error: '请在 Electron 客户端中使用真实文件导入' }
  },

  onImportProgress(callback: (progress: MaterialLibraryImportProgress) => void) {
    return materialLibraryBridge()?.onImportProgress?.(callback)
  },

  async updateCollaborator(payload: { phone: string; role: Collaborator['role']; enabled: boolean }) {
    const bridge = materialLibraryBridge()
    if (bridge?.updateCollaborator) return bridge.updateCollaborator(payload)
    const state = readFallbackState()
    const collaborators = state.collaborators.map((item) => (
      item.phone === payload.phone ? { ...item, role: payload.role, enabled: payload.enabled } : item
    ))
    return okWithState(saveFallbackState({ ...state, collaborators }))
  },

  async updateFolderCollaborators(payload: { folderId: string; collaborators: FolderCollaborator[] }) {
    const bridge = materialLibraryBridge()
    if (bridge?.updateFolderCollaborators) return bridge.updateFolderCollaborators(payload)
    const state = readFallbackState()
    const folderCollaborators = normalizeFolderCollaborators(payload.collaborators)
    let found = false
    const folders = state.folders.map((folder) => {
      if (folder.id !== payload.folderId) return folder
      found = true
      return {
        ...folder,
        shared: folderCollaborators.length > 0,
        collaborators: folderCollaborators,
        updatedAt: new Date().toISOString(),
      }
    })
    if (!found) return { ok: false, error: '文件夹不存在' }
    return okWithState(saveFallbackState({ ...state, folders }))
  },

  async saveDirectorPackage(directorPackage: DirectorMaterialPackage) {
    const externalAssets = collectExternalAssets()
    if (!externalAssets.some((asset) => asset.source === 'director-package' && asset.sourceRef === directorPackage.scriptId)) {
      externalAssets.unshift(directorPackageToAsset(directorPackage))
    }
    const bridge = materialLibraryBridge()
    if (bridge?.syncExternalAssets) {
      return bridge.syncExternalAssets({ assets: externalAssets })
    }
    const state = mergeExternalAssets(readFallbackState(), externalAssets)
    return okWithState(saveFallbackState(state))
  },
}

export function cloudAssetPreviewUrl(asset: CloudAsset) {
  if (asset.url) return asset.url
  if (!asset.localPath) return ''
  if (/^(https?:|data:|blob:|moya-media:|file:)/i.test(asset.localPath)) return asset.localPath
  return `moya-media://file?path=${encodeURIComponent(asset.localPath)}`
}

function materialLibraryBridge(): MaterialLibraryBridge | undefined {
  return (window.surgicol as { materialLibrary?: MaterialLibraryBridge } | undefined)?.materialLibrary
}

function okWithState(state: MaterialLibrarySnapshot): MaterialLibraryBridgeResult {
  return { ok: true, state }
}

function readFallbackState(): MaterialLibrarySnapshot {
  try {
    const raw = window.localStorage.getItem(fallbackStateKey)
    const parsed = raw ? JSON.parse(raw) : null
    return normalizeSnapshot(parsed)
  } catch {
    return normalizeSnapshot(null)
  }
}

function saveFallbackState(state: MaterialLibrarySnapshot) {
  const normalized = normalizeSnapshot(state)
  window.localStorage.setItem(fallbackStateKey, JSON.stringify(normalized))
  return normalized
}

function normalizeSnapshot(value: unknown): MaterialLibrarySnapshot {
  const record = value && typeof value === 'object' ? value as Partial<MaterialLibrarySnapshot> : {}
  const folders = normalizeFolders(record.folders)
  const assets = normalizeAssets(record.assets, folders)
  const collaborators = Array.isArray(record.collaborators) && record.collaborators.length
    ? record.collaborators
    : fallbackCollaborators
  const foldersWithCounts = folders.map((folder) => ({
    ...folder,
    count: countFolderItems(folder.id, folders, assets),
  }))
  const activeFolders = foldersWithCounts.filter((folder) => !folder.deletedAt)
  const activeAssets = assets.filter((asset) => !asset.deletedAt)
  const activeSharedFolderIds = new Set(activeFolders.filter(isSharedFolder).map((folder) => folder.id))
  const recentCutoff = Date.now() - 14 * 24 * 60 * 60 * 1000
  return {
    folders: foldersWithCounts,
    assets,
    collaborators,
    quickCounts: {
      total: activeFolders.length + activeAssets.length,
      collaboration: activeSharedFolderIds.size,
      favorites: activeAssets.filter((asset) => asset.favorite || asset.status.includes('收藏')).length,
      recent: activeAssets.filter((asset) => new Date(asset.updatedAt || asset.createdAt || 0).getTime() >= recentCutoff).length,
      teamVideos: activeAssets.filter((asset) => asset.kind === '视频' || asset.kind === '成片').length,
      recycle: foldersWithCounts.filter((folder) => folder.deletedAt).length + assets.filter((asset) => asset.deletedAt).length,
    },
  }
}

function normalizeFolders(value: unknown): CloudFolder[] {
  const incoming = Array.isArray(value) ? value : []
  const byId = new Map<string, CloudFolder>()
  fallbackFolders.forEach((folder) => byId.set(folder.id, { ...folder }))
  incoming.forEach((item) => {
    if (!item || typeof item !== 'object') return
    const folder = item as Partial<CloudFolder>
    const id = String(folder.id || '').trim()
    const name = sanitizeFolderName(folder.name || '')
    if (!id || !name) return
    byId.set(id, {
      ...folder,
      id,
      name,
      parentId: folder.parentId || null,
      count: Number(folder.count) || 0,
      shared: Boolean(folder.shared || hasFolderCollaborators(folder.collaborators)),
      collaborators: normalizeFolderCollaborators(folder.collaborators),
      deletedAt: folder.deletedAt,
      createdAt: folder.createdAt,
      updatedAt: folder.updatedAt,
    })
  })
  return [...byId.values()]
}

function isSharedFolder(folder: CloudFolder) {
  return Boolean(folder.shared || hasFolderCollaborators(folder.collaborators))
}

function hasFolderCollaborators(value: unknown) {
  return normalizeFolderCollaborators(value).length > 0
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

function normalizeAssets(value: unknown, folders: CloudFolder[]): CloudAsset[] {
  const folderIds = new Set(folders.map((folder) => folder.id))
  const incoming = Array.isArray(value) ? value : []
  return incoming
    .map((item) => normalizeAsset(item, folderIds))
    .filter((asset): asset is CloudAsset => Boolean(asset))
}

function normalizeAsset(value: unknown, folderIds: Set<string>): CloudAsset | null {
  if (!value || typeof value !== 'object') return null
  const asset = value as Partial<CloudAsset>
  const id = String(asset.id || '').trim()
  const name = String(asset.name || '').trim()
  if (!id || !name) return null
  const folderId = asset.folderId && folderIds.has(asset.folderId) ? asset.folderId : folderForSource(asset.source)
  return {
    id,
    folderId,
    name,
    kind: normalizeKind(asset.kind),
    size: asset.size || formatBytes(asset.bytes || 0),
    bytes: asset.bytes,
    duration: asset.duration,
    status: asset.status || '已导入',
    tone: asset.tone || toneForKind(asset.kind),
    mimeType: asset.mimeType,
    localPath: asset.localPath,
    originalPath: asset.originalPath,
    url: asset.url,
    source: asset.source,
    sourceRef: asset.sourceRef,
    favorite: Boolean(asset.favorite),
    deletedAt: asset.deletedAt,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
    directorPackage: asset.directorPackage,
  }
}

function mergeExternalAssets(state: MaterialLibrarySnapshot, externalAssets: MaterialLibraryExternalAsset[]) {
  const managedSources = new Set(['director-package', 'canvas'])
  const managedRefs = new Set(externalAssets.map((asset) => `${asset.source}:${asset.sourceRef || asset.id}`))
  const assets = state.assets.filter((asset) => {
    if (!asset.source || !managedSources.has(asset.source)) return true
    return managedRefs.has(`${asset.source}:${asset.sourceRef || asset.id}`)
  })
  const byKey = new Map(assets.map((asset) => [`${asset.source || 'asset'}:${asset.sourceRef || asset.id}`, asset]))

  externalAssets.forEach((asset) => {
    const key = `${asset.source || 'asset'}:${asset.sourceRef || asset.id}`
    const folderId = folderForSource(asset.source)
    const current = byKey.get(key)
    byKey.set(key, {
      ...current,
      ...asset,
      id: asset.id || current?.id || key.replace(/[^a-zA-Z0-9_-]/g, '-'),
      folderId,
      kind: normalizeKind(asset.kind),
      size: asset.size || formatBytes(asset.bytes || 0),
      status: asset.status || '已导入',
      tone: asset.tone || toneForKind(asset.kind),
      favorite: asset.favorite ?? current?.favorite,
      deletedAt: asset.deletedAt ?? current?.deletedAt,
    })
  })

  return normalizeSnapshot({
    ...state,
    folders: state.folders,
    assets: [...byKey.values()].sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || ''))),
  })
}

function collectExternalAssets(): MaterialLibraryExternalAsset[] {
  return [
    ...preferenceClient.loadDirectorMaterialPackages().map(directorPackageToAsset),
    ...preferenceClient.loadGeneratedCanvasAssets().map(canvasAssetToAsset),
  ]
}

function directorPackageToAsset(directorPackage: DirectorMaterialPackage): MaterialLibraryExternalAsset {
  const duration = directorPackage.segments.reduce((total, segment) => total + (Number(segment.durationSec) || 0), 0)
  return {
    id: `director-package-${directorPackage.scriptId}`,
    source: 'director-package',
    sourceRef: directorPackage.scriptId,
    name: directorPackage.title,
    kind: '工程',
    size: `${directorPackage.segmentCount} 条分镜`,
    duration: duration ? formatDuration(duration) : undefined,
    status: '爆款编导入库',
    tone: 'green',
    createdAt: new Date(directorPackage.createdAt).toISOString(),
    updatedAt: new Date(directorPackage.updatedAt).toISOString(),
    directorPackage,
  }
}

function canvasAssetToAsset(asset: GeneratedCanvasAsset): MaterialLibraryExternalAsset {
  return {
    id: `canvas-asset-${asset.id}`,
    source: 'canvas',
    sourceRef: asset.id,
    name: asset.name,
    kind: asset.type,
    size: 'AI 生成',
    status: '画布入库',
    tone: 'purple',
    url: asset.url,
    createdAt: new Date(asset.createdAt).toISOString(),
    updatedAt: new Date(asset.createdAt).toISOString(),
  }
}

function folderForSource(source?: CloudAsset['source']) {
  if (source === 'director-package') return 'folder-director-packages'
  if (source === 'canvas') return 'folder-ai-canvas'
  return 'folder-local-upload'
}

function normalizeKind(kind?: CloudAssetKind) {
  return kind && ['视频', '图片', '音频', '工程', '成片'].includes(kind) ? kind : '工程'
}

function toneForKind(kind?: CloudAssetKind) {
  if (kind === '视频') return 'blue'
  if (kind === '图片') return 'cyan'
  if (kind === '音频') return 'purple'
  if (kind === '成片') return 'green'
  return 'orange'
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

function getDescendantFolderIds(folders: CloudFolder[], folderId: string): string[] {
  const children = folders.filter((folder) => folder.parentId === folderId)
  return children.flatMap((folder) => [folder.id, ...getDescendantFolderIds(folders, folder.id)])
}

function countFolderItems(folderId: string, folders: CloudFolder[], assets: CloudAsset[]) {
  const childFolders = folders.filter((folder) => folder.parentId === folderId && !folder.deletedAt)
  const directAssets = assets.filter((asset) => asset.folderId === folderId && !asset.deletedAt)
  return childFolders.length + directAssets.length
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`
}

function formatDuration(seconds: number) {
  const total = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  return `${minutes.toString().padStart(2, '0')}:${rest.toString().padStart(2, '0')}`
}
