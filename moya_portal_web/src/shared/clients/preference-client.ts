import type { ScriptPackage } from '../../pages/viralDirectorModel'

export type ThemeMode = 'light' | 'dark'

export type GeneratedCanvasAsset = {
  id: string
  name: string
  url: string
  type: '图片' | '视频'
  createdAt: number
}

export type DirectorMaterialSegment = {
  segmentId: string
  groupLabel: string
  segmentTitle: string
  durationSec: number
  visualDescription: string
  voiceoverText: string
  onscreenText: string
  assetCount: number
}

export type DirectorMaterialPackage = {
  id: string
  source: 'viral-director'
  title: string
  scriptId: string
  productName: string
  segmentCount: number
  createdAt: number
  updatedAt: number
  segments: DirectorMaterialSegment[]
  scriptPackage: ScriptPackage
}

const themeKey = 'moyaclaw-theme'
const generatedCanvasAssetsKey = 'moyaclaw-ai-canvas-assets'
const directorMaterialPackagesKey = 'moyaclaw-director-material-packages'
const aiCanvasIdKey = 'moyaclaw-ai-canvas-id'
const studioThemeKey = 'studio_theme'
const canvasThemeKey = 'canvas_theme'
const canvasAssetsUpdatedEvent = 'moyaclaw-ai-canvas-assets-updated'
const directorMaterialPackagesUpdatedEvent = 'moyaclaw-director-material-packages-updated'

export const preferenceClient = {
  getTheme(): ThemeMode {
    const saved = window.localStorage.getItem(themeKey)
    return saved === 'dark' ? 'dark' : 'light'
  },

  setTheme(theme: ThemeMode) {
    window.localStorage.setItem(themeKey, theme)
  },

  syncStudioTheme(theme: ThemeMode) {
    window.localStorage.setItem(studioThemeKey, theme)
    window.localStorage.setItem(canvasThemeKey, theme)
  },

  rememberCanvasId(id: string) {
    window.localStorage.setItem(aiCanvasIdKey, id)
  },

  loadGeneratedCanvasAssets(): GeneratedCanvasAsset[] {
    try {
      const raw = window.localStorage.getItem(generatedCanvasAssetsKey)
      const parsed = raw ? JSON.parse(raw) : []
      return Array.isArray(parsed) ? parsed.filter((asset) => asset?.url && asset?.name) : []
    } catch {
      return []
    }
  },

  saveGeneratedCanvasAsset(asset: Omit<GeneratedCanvasAsset, 'id' | 'createdAt'>) {
    const current = preferenceClient.loadGeneratedCanvasAssets()
    const next: GeneratedCanvasAsset = {
      ...asset,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
    }
    const deduped = [next, ...current.filter((item) => item.url !== asset.url)].slice(0, 60)
    window.localStorage.setItem(generatedCanvasAssetsKey, JSON.stringify(deduped))
    window.dispatchEvent(new CustomEvent(canvasAssetsUpdatedEvent))
  },

  loadDirectorMaterialPackages(): DirectorMaterialPackage[] {
    try {
      const raw = window.localStorage.getItem(directorMaterialPackagesKey)
      const parsed = raw ? JSON.parse(raw) : []
      return Array.isArray(parsed)
        ? parsed.filter((item) => item?.source === 'viral-director' && item?.scriptId && item?.scriptPackage?.directorScript)
        : []
    } catch {
      return []
    }
  },

  saveDirectorMaterialPackage(scriptPackage: ScriptPackage) {
    const current = preferenceClient.loadDirectorMaterialPackages()
    const script = scriptPackage.directorScript
    const now = Date.now()
    const next: DirectorMaterialPackage = {
      id: `director-${script.scriptId}`,
      source: 'viral-director',
      title: script.title,
      scriptId: script.scriptId,
      productName: script.productName,
      segmentCount: script.segments.length,
      createdAt: now,
      updatedAt: now,
      segments: script.segments.map((segment) => ({
        segmentId: segment.segmentId,
        groupLabel: segment.groupLabel,
        segmentTitle: segment.segmentTitle,
        durationSec: segment.durationSec,
        visualDescription: segment.visualDescription,
        voiceoverText: segment.voiceoverText,
        onscreenText: segment.onscreenText,
        assetCount: segment.assetRefs.length,
      })),
      scriptPackage,
    }
    const deduped = [next, ...current.filter((item) => item.scriptId !== script.scriptId)].slice(0, 80)
    window.localStorage.setItem(directorMaterialPackagesKey, JSON.stringify(deduped))
    window.dispatchEvent(new CustomEvent(directorMaterialPackagesUpdatedEvent))
    return next
  },

  subscribeGeneratedCanvasAssets(callback: () => void) {
    window.addEventListener(canvasAssetsUpdatedEvent, callback)
    window.addEventListener('storage', callback)
    return () => {
      window.removeEventListener(canvasAssetsUpdatedEvent, callback)
      window.removeEventListener('storage', callback)
    }
  },

  subscribeDirectorMaterialPackages(callback: () => void) {
    window.addEventListener(directorMaterialPackagesUpdatedEvent, callback)
    window.addEventListener('storage', callback)
    return () => {
      window.removeEventListener(directorMaterialPackagesUpdatedEvent, callback)
      window.removeEventListener('storage', callback)
    }
  },
}
