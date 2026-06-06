import type { MoyaTone } from '../../ui/types'
import type { DirectorMaterialPackage } from '../../shared/clients/preference-client'

export type MaterialsTab = 'library' | 'image' | 'video' | 'voice' | 'avatar'

export type MaterialAssetCard = {
  name: string
  type: string
  state: string
  used: number
  tone: MoyaTone
  url?: string
  directorPackage?: DirectorMaterialPackage
}

export type CloudFolder = {
  id: string
  name: string
  parentId: string | null
  count: number
  shared?: boolean
  collaborators?: FolderCollaborator[]
  deletedAt?: string
  createdAt?: string
  updatedAt?: string
}

export type CloudAssetKind = '视频' | '图片' | '音频' | '工程' | '成片'
export type CloudFilter = '全部' | '素材' | CloudAssetKind

export type CloudAsset = {
  id: string
  folderId: string
  name: string
  kind: CloudAssetKind
  size: string
  bytes?: number
  duration?: string
  status: string
  tone: MoyaTone
  mimeType?: string
  localPath?: string
  originalPath?: string
  url?: string
  source?: 'local-file' | 'director-package' | 'canvas' | 'seed'
  sourceRef?: string
  favorite?: boolean
  deletedAt?: string
  createdAt?: string
  updatedAt?: string
  directorPackage?: DirectorMaterialPackage
}

export type Collaborator = {
  name: string
  phone: string
  role: '所有者' | '可管理' | '仅查看' | '无权限'
  enabled: boolean
}

export type FolderCollaborator = {
  phone: string
  role: Exclude<Collaborator['role'], '所有者' | '无权限'>
}

export type FolderDialogState = {
  mode: 'root' | 'child' | 'rename'
  targetId?: string
}

export type UploadMode = 'file' | 'folder' | null

export type MaterialLibraryQuickCounts = {
  total: number
  collaboration: number
  favorites: number
  recent: number
  teamVideos: number
  recycle: number
}

export type MaterialLibrarySnapshot = {
  folders: CloudFolder[]
  assets: CloudAsset[]
  collaborators: Collaborator[]
  quickCounts: MaterialLibraryQuickCounts
}

export type MaterialLibraryExternalAsset = Pick<
  CloudAsset,
  'id' | 'name' | 'kind' | 'size' | 'bytes' | 'duration' | 'status' | 'tone' | 'mimeType' | 'url' | 'source' | 'sourceRef' | 'favorite' | 'deletedAt' | 'createdAt' | 'updatedAt' | 'directorPackage'
>

export type MaterialLibraryImportResult = {
  ok: boolean
  canceled?: boolean
  state?: MaterialLibrarySnapshot
  assets?: CloudAsset[]
  folders?: CloudFolder[]
  error?: string
}

export type MaterialLibraryImportProgressFile = {
  id: string
  name: string
  relativePath?: string
  size?: string
  bytes?: number
  status: 'queued' | 'uploading' | 'done' | 'failed'
  percent: number
  message?: string
}

export type MaterialLibraryImportProgress = {
  taskId: string
  mode: Exclude<UploadMode, null>
  stage: 'scanning' | 'uploading' | 'done' | 'canceled' | 'failed'
  message: string
  totalFiles: number
  completedFiles: number
  failedFiles: number
  overallPercent: number
  currentFileId?: string
  files: MaterialLibraryImportProgressFile[]
}
