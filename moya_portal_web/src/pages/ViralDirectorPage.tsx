import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import type { PageKey } from '../types'
import { notifyError, notifyInfo, notifySuccess, notifyWarning } from '../ui/design-system'
import { viralDirectorClient } from '../shared/clients/viral-director-client'
import { preferenceClient } from '../shared/clients/preference-client'
import { materialLibraryClient } from '../features/materials/api/material-library-client'
import { buildFissionDraftFromScriptPackage } from '../moya/fissionTypes'
import { savePendingFissionDraft } from '../moya/surgicol'
import { GeneratingPreviewView } from '../features/viral-director/components/GeneratingPreviewView'
import { VideoAnalysisView } from '../features/viral-director/components/VideoAnalysisView'
import { PreviewView } from '../features/viral-director/components/PreviewView'
import { EditorView } from '../features/viral-director/components/EditorView'
import { HomeView } from '../features/viral-director/components/HomeView'
import type { DirectorView, EditorMode, EntryMode, LibraryTab } from '../features/viral-director/types'
import { getUploadAssetType, isSupportedReferenceVideoLink } from '../features/viral-director/utils/assets'
import {
  duplicateScriptPackage,
  getReferenceAnalysisTitle,
  renameScriptPackage,
} from '../features/viral-director/model/script-package-utils'
import { useViralDirectorProductStream } from '../features/viral-director/hooks/useViralDirectorProductStream'
import {
  attachAssetToSegment,
  type DirectorSegment,
  type ScriptPackage,
  type ScriptStatus,
  type VideoInput,
  updateSegment,
} from './viralDirectorModel'

const initialProductPrompt = ''
const assetUploadAccept = [
  'video/*',
  'audio/*',
  '.mp4',
  '.mov',
  '.avi',
  '.mkv',
  '.webm',
  '.mp3',
  '.wav',
  '.m4a',
  '.aac',
  '.flac',
].join(',')
const initialVideoInput: VideoInput = {
  mode: 'link',
  url: '',
  fileName: '',
  durationSec: 59,
}

export function ViralDirectorPage({ onNavigate }: { onNavigate?: (page: PageKey) => void }) {
  const [view, setView] = useState<DirectorView>('home')
  const [entryMode, setEntryMode] = useState<EntryMode>('product')
  const [libraryTab, setLibraryTab] = useState<LibraryTab>('reference')
  const [editorMode, setEditorMode] = useState<EditorMode>('table')
  const [generatingBackView, setGeneratingBackView] = useState<DirectorView>('home')
  const [productPrompt, setProductPrompt] = useState(initialProductPrompt)
  const [videoInput, setVideoInput] = useState<VideoInput>(initialVideoInput)
  const [savedScripts, setSavedScripts] = useState<ScriptPackage[]>([])
  const [currentPackage, setCurrentPackage] = useState<ScriptPackage | null>(null)
  const [openMenuScriptId, setOpenMenuScriptId] = useState<string | null>(null)
  const [renameTarget, setRenameTarget] = useState<ScriptPackage | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<ScriptPackage | null>(null)
  const assetInputRef = useRef<HTMLInputElement | null>(null)
  const analysisRequestIdRef = useRef(0)
  const pendingSegmentIdRef = useRef<string | null>(null)
  const {
    cancelActiveStream,
    generateProductPreview,
    streamingPackage,
  } = useViralDirectorProductStream({
    persistScriptPackage,
    setCurrentPackage,
    setGeneratingBackView,
    setView,
  })

  useEffect(() => {
    void loadSavedScripts()
  }, [])

  useEffect(() => {
    if (view !== 'editor' || currentPackage?.directorScript.status !== 'draft') return
    const timer = window.setTimeout(() => {
      void persistScriptPackage(currentPackage, 'draft', { silent: true })
    }, 800)
    return () => {
      window.clearTimeout(timer)
    }
  }, [currentPackage, view])

  const createdScripts = useMemo(
    () => savedScripts.filter((item) => item.directorScript.status === 'completed'),
    [savedScripts],
  )
  const referenceAnalyses = useMemo(
    () => savedScripts.filter((item) => item.analysisArtifact.analysisType === 'reference_video'),
    [savedScripts],
  )

  async function loadSavedScripts() {
    const result = await viralDirectorClient.listScripts()
    if (!result.ok) {
      notifyInfo(result.error || '脚本库加载失败')
      return
    }
    setSavedScripts(result.scripts ?? [])
  }

  function openSavedScript(scriptPackage: ScriptPackage) {
    setCurrentPackage(scriptPackage)
    setEditorMode('table')
    setView(scriptPackage.analysisArtifact.analysisType === 'reference_video' && scriptPackage.directorScript.status !== 'completed' ? 'video-analysis' : 'editor')
  }

  async function handleGenerate(mode: EntryMode = entryMode) {
    if (mode === 'product') {
      const prompt = productPrompt.trim()
      if (!prompt) {
        notifyWarning('请输入产品或服务描述')
        return
      }
      await generateProductPreview(prompt, {
        clearCurrentPackage: true,
        fallbackView: 'home',
      })
      return
    }

    if (mode === 'link') {
      const linkUrl = videoInput.url?.trim() || ''
      if (!linkUrl) {
        notifyWarning('请输入视频链接')
        return
      }
      if (!isSupportedReferenceVideoLink(linkUrl)) {
        notifyWarning('当前仅支持抖音或小红书作品链接')
        return
      }
      const result = await viralDirectorClient.analyzeFromVideoLink({ url: linkUrl })
      if (!result.ok || !result.scriptPackage) {
        notifyError(result.error || '视频链接解析失败')
        return
      }
      const draftPackage = await persistScriptPackage(result.scriptPackage, 'draft', { silent: true })
      setLibraryTab('reference')
      setCurrentPackage(draftPackage)
      setView('video-analysis')
    }
  }

  async function regenerateCurrentScript(revisionInstruction = '') {
    if (!currentPackage) return
    const sourcePayload = currentPackage.sourcePayload
    const normalizedRevision = revisionInstruction.trim()

    if (sourcePayload.sourceType === 'product_description') {
      const prompt = sourcePayload.productInput?.description?.trim() || productPrompt.trim()
      if (!prompt) {
        notifyWarning('缺少原始产品描述，无法重新生成')
        return
      }
      await generateProductPreview(prompt, {
        clearCurrentPackage: false,
        fallbackView: 'preview',
        revisionInstruction: normalizedRevision,
      })
      return
    }

    if (sourcePayload.sourceType === 'video_link') {
      const linkUrl = sourcePayload.videoInput?.url?.trim() || ''
      if (!linkUrl) {
        notifyWarning('缺少原始视频链接，无法重新生成')
        return
      }
      if (!isSupportedReferenceVideoLink(linkUrl)) {
        notifyWarning('当前仅支持抖音或小红书作品链接')
        return
      }
      const requestId = analysisRequestIdRef.current + 1
      analysisRequestIdRef.current = requestId
      setGeneratingBackView('preview')
      setView('generating-preview')
      const result = await viralDirectorClient.analyzeFromVideoLink({
        url: linkUrl,
        revisionInstruction: normalizedRevision,
      })
      if (analysisRequestIdRef.current !== requestId) return
      if (!result.ok || !result.scriptPackage) {
        notifyError(result.error || '重新生成失败')
        setView('preview')
        return
      }
      const draftPackage = await persistScriptPackage(result.scriptPackage, 'draft', { silent: true })
      if (analysisRequestIdRef.current !== requestId) return
      setCurrentPackage(draftPackage)
      setView('preview')
      return
    }

    notifyWarning('本地上传视频需要重新上传后再生成')
  }

  async function handleUploadGenerate(file: File) {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const result = await viralDirectorClient.analyzeFromUpload({
      fileName: file.name,
      mimeType: file.type,
      bytes,
    })
    if (!result.ok || !result.scriptPackage) {
      notifyError(result.error || '本地视频解析失败')
      return
    }
    setVideoInput({ mode: 'upload', url: '', fileName: file.name, durationSec: 59 })
    const draftPackage = await persistScriptPackage(result.scriptPackage, 'draft', { silent: true })
    setLibraryTab('reference')
    setCurrentPackage(draftPackage)
    setView('video-analysis')
  }

  async function saveCurrentScript() {
    if (!currentPackage) return
    const saved = await persistScriptPackage(currentPackage, 'completed', { silent: false })
    if (!saved) return
    setCurrentPackage(saved)
    setLibraryTab('created')
    notifySuccess('脚本已保存到脚本库')
  }

  async function saveCurrentScriptToMaterialLibrary() {
    if (!currentPackage) return
    const directorPackage = preferenceClient.saveDirectorMaterialPackage(currentPackage)
    const result = await materialLibraryClient.saveDirectorPackage(directorPackage)
    if (!result.ok) {
      notifyError(result.error || '同步素材库失败')
      return
    }
    notifySuccess('已保存到素材库')
  }

  function openRenameDialog(scriptPackage: ScriptPackage) {
    setOpenMenuScriptId(null)
    setRenameTarget(scriptPackage)
    setRenameDraft(getReferenceAnalysisTitle(scriptPackage))
  }

  async function confirmRenameScript() {
    if (!renameTarget) return
    const nextTitle = renameDraft.trim()
    if (!nextTitle) {
      notifyWarning('请输入名称')
      return
    }
    const nextPackage = renameScriptPackage(renameTarget, nextTitle)
    const result = await viralDirectorClient.saveScript({ scriptPackage: nextPackage })
    if (!result.ok || !result.scriptPackage) {
      notifyError(result.error || '重命名失败')
      return
    }
    setSavedScripts(result.scripts ?? [])
    setCurrentPackage((current) => (current?.directorScript.scriptId === nextPackage.directorScript.scriptId ? result.scriptPackage ?? nextPackage : current))
    setRenameTarget(null)
    setRenameDraft('')
    notifySuccess('已重命名')
  }

  async function copyScriptToCreated(scriptPackage: ScriptPackage) {
    setOpenMenuScriptId(null)
    const nextPackage = duplicateScriptPackage(scriptPackage)
    const result = await viralDirectorClient.saveScript({ scriptPackage: nextPackage })
    if (!result.ok || !result.scriptPackage) {
      notifyError(result.error || '复制失败')
      return
    }
    setSavedScripts(result.scripts ?? [])
    setLibraryTab('created')
    notifySuccess('已复制到我创建的')
  }

  function requestDeleteScript(scriptPackage: ScriptPackage) {
    setOpenMenuScriptId(null)
    setDeleteTarget(scriptPackage)
  }

  async function confirmDeleteScript() {
    if (!deleteTarget) return
    const scriptId = deleteTarget.directorScript.scriptId
    const result = await viralDirectorClient.deleteScript({ scriptId })
    if (!result.ok) {
      notifyError(result.error || '删除失败')
      return
    }
    setSavedScripts(result.scripts ?? [])
    setCurrentPackage((current) => (current?.directorScript.scriptId === scriptId ? null : current))
    setDeleteTarget(null)
    notifySuccess('已删除')
  }

  async function sendCurrentScriptToProduction() {
    if (!currentPackage) return
    const draft = buildFissionDraftFromScriptPackage(currentPackage)
    await savePendingFissionDraft(draft)
    notifySuccess(`已导入合成量产，共 ${draft.groups.length} 条分镜`)
    onNavigate?.('production')
  }

  async function persistScriptPackage(
    scriptPackage: ScriptPackage,
    status: ScriptStatus,
    options: { silent: boolean },
  ) {
    const nextPackage: ScriptPackage = {
      ...scriptPackage,
      directorScript: {
        ...scriptPackage.directorScript,
        status,
        updatedAt: new Date().toISOString(),
      },
    }
    const result = await viralDirectorClient.saveScript({ scriptPackage: nextPackage })
    if (!result.ok || !result.scriptPackage) {
      if (options.silent) {
        notifyInfo('草稿自动保存失败')
        return nextPackage
      }
      notifyError(result.error || '脚本保存失败')
      return null
    }
    setSavedScripts(result.scripts ?? [])
    return result.scriptPackage
  }

  function exportCurrentScript() {
    if (!currentPackage) return
    const blob = new Blob([JSON.stringify(currentPackage, null, 2)], {
      type: 'application/json;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${currentPackage.directorScript.title || 'director-script'}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    notifySuccess('脚本 JSON 已导出')
  }

  function updateCurrentSegment(segmentId: string, patch: Partial<DirectorSegment>) {
    setCurrentPackage((current) => (current ? updateSegment(current, segmentId, patch) : current))
  }

  function updateCurrentTitle(title: string) {
    setCurrentPackage((current) => current ? {
      ...current,
      directorScript: {
        ...current.directorScript,
        title,
        updatedAt: new Date().toISOString(),
      },
    } : current)
  }

  function addNewSegment() {
    if (!currentPackage) return
    const nextIndex = currentPackage.directorScript.segments.length + 1
    const nextSegment: DirectorSegment = {
      segmentId: `seg_manual_${Date.now()}`,
      groupLabel: `新增镜头 ${nextIndex}`,
      segmentTitle: '新增段落',
      durationSec: 5,
      visualDescription: '补充该镜头的画面描述。',
      voiceoverText: '补充该镜头的台词口播。',
      onscreenText: '补充字幕文案。',
      shotType: '半身口播',
      subject: '人物+产品',
      goal: '补充内容目标',
      assetRefs: [],
      audioConfig: {
        voiceMode: 'none',
        voiceName: '',
        speed: 1,
        emotion: '',
        accent: '',
        pauseHints: [],
        bgmSuggestion: '',
      },
      transition: 'cut',
      generationNotes: '',
      complianceNotes: '',
      status: 'draft',
    }

    setCurrentPackage({
      ...currentPackage,
      directorScript: {
        ...currentPackage.directorScript,
        updatedAt: new Date().toISOString(),
        segments: [...currentPackage.directorScript.segments, nextSegment],
      },
    })
    notifySuccess('已新增一个镜头段落')
  }

  function deleteSegment(segmentId: string) {
    if (!currentPackage) return
    if (currentPackage.directorScript.segments.length <= 1) {
      notifyWarning('至少保留一个镜头段落')
      return
    }
    setCurrentPackage({
      ...currentPackage,
      directorScript: {
        ...currentPackage.directorScript,
        updatedAt: new Date().toISOString(),
        segments: currentPackage.directorScript.segments.filter((segment) => segment.segmentId !== segmentId),
      },
    })
  }

  function reorderSegment(sourceSegmentId: string, targetSegmentId: string) {
    if (sourceSegmentId === targetSegmentId) return
    setCurrentPackage((current) => {
      if (!current) return current
      const segments = [...current.directorScript.segments]
      const sourceIndex = segments.findIndex((segment) => segment.segmentId === sourceSegmentId)
      const targetIndex = segments.findIndex((segment) => segment.segmentId === targetSegmentId)
      if (sourceIndex < 0 || targetIndex < 0) return current
      const [movedSegment] = segments.splice(sourceIndex, 1)
      segments.splice(targetIndex, 0, movedSegment)
      return {
        ...current,
        directorScript: {
          ...current.directorScript,
          updatedAt: new Date().toISOString(),
          segments,
        },
      }
    })
  }

  function requestAssetUpload(segmentId: string) {
    pendingSegmentIdRef.current = segmentId
    assetInputRef.current?.click()
  }

  function handleAssetChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    const segmentId = pendingSegmentIdRef.current
    if (!file || !segmentId || !currentPackage) return
    const assetType = getUploadAssetType(file)
    if (!assetType) {
      notifyWarning('编辑脚本素材仅支持上传视频或音频')
      event.target.value = ''
      return
    }

    const objectUrl = URL.createObjectURL(file)

    const nextPackage = attachAssetToSegment(currentPackage, segmentId, {
      assetType,
      source: 'upload',
      name: file.name,
      url: objectUrl,
      thumbnailUrl: objectUrl,
      purpose: '示例素材',
      isReference: true,
      isRequired: false,
      meta: { size: file.size, mimeType: file.type || 'unknown' },
    })

    setCurrentPackage(nextPackage)
    pendingSegmentIdRef.current = null
    event.target.value = ''
    notifySuccess('示例素材已绑定到该镜头段落')
  }

  return (
    <div className="viral-director">
      <input
        ref={assetInputRef}
        type="file"
        hidden
        accept={assetUploadAccept}
        onChange={handleAssetChange}
      />

      {view === 'home' ? (
        <HomeView
          entryMode={entryMode}
          libraryTab={libraryTab}
          productPrompt={productPrompt}
          videoInput={videoInput}
          createdScripts={createdScripts}
          referenceAnalyses={referenceAnalyses}
          openMenuScriptId={openMenuScriptId}
          onEntryModeChange={setEntryMode}
          onLibraryTabChange={setLibraryTab}
          onProductPromptChange={setProductPrompt}
          onVideoInputChange={setVideoInput}
          onGenerate={handleGenerate}
          onUploadGenerate={handleUploadGenerate}
          onOpenSavedScript={openSavedScript}
          onToggleScriptMenu={(scriptId) => setOpenMenuScriptId((current) => (current === scriptId ? null : scriptId))}
          onCloseScriptMenu={() => setOpenMenuScriptId(null)}
          onRenameScript={openRenameDialog}
          onCopyScript={(scriptPackage) => void copyScriptToCreated(scriptPackage)}
          onRequestDeleteScript={requestDeleteScript}
        />
      ) : null}

      {view === 'generating-preview' ? (
        <GeneratingPreviewView
          scriptPackage={streamingPackage}
          onBack={() => {
            cancelActiveStream()
            setView(generatingBackView)
          }}
        />
      ) : null}

      {view === 'video-analysis' && currentPackage ? (
        <VideoAnalysisView
          scriptPackage={currentPackage}
          onBack={() => setView('home')}
          onImitate={() => setView('preview')}
          onMoreActions={() => notifyInfo('这里预留更多参考视频操作。')}
        />
      ) : null}

      {view === 'preview' && currentPackage ? (
        <PreviewView
          scriptPackage={currentPackage}
          onBack={() => setView(currentPackage.analysisArtifact.analysisType === 'reference_video' ? 'video-analysis' : 'home')}
          onAdopt={() => {
            setEditorMode('table')
            setView('editor')
          }}
          onSaveToMaterialLibrary={saveCurrentScriptToMaterialLibrary}
          onImportToProduction={sendCurrentScriptToProduction}
          onRegenerate={regenerateCurrentScript}
        />
      ) : null}

      {view === 'editor' && currentPackage ? (
        <EditorView
          scriptPackage={currentPackage}
          editorMode={editorMode}
          onBack={() => setView('home')}
          onEditorModeChange={setEditorMode}
          onUpdateTitle={updateCurrentTitle}
          onUpdateSegment={updateCurrentSegment}
          onAddSegment={addNewSegment}
          onDeleteSegment={deleteSegment}
          onReorderSegment={reorderSegment}
          onRequestAssetUpload={requestAssetUpload}
          onSave={saveCurrentScript}
          onSendToProduction={sendCurrentScriptToProduction}
          onExport={exportCurrentScript}
        />
      ) : null}

      {renameTarget ? (
        <div className="viral-menu-dialog-backdrop" role="presentation">
          <form
            className="viral-menu-dialog viral-rename-dialog"
            aria-label="重命名脚本"
            onSubmit={(event) => {
              event.preventDefault()
              void confirmRenameScript()
            }}
          >
            <h2>重命名</h2>
            <p>修改后会同步更新这条脚本或参考分析的名称。</p>
            <input
              value={renameDraft}
              onChange={(event) => setRenameDraft(event.target.value)}
              autoFocus
              aria-label="新的名称"
            />
            <div className="viral-menu-dialog-actions">
              <button type="button" onClick={() => setRenameTarget(null)}>
                取消
              </button>
              <button type="submit" className="viral-gradient-btn">
                确认
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="viral-menu-dialog-backdrop" role="presentation">
          <div className="viral-menu-dialog viral-delete-dialog" role="dialog" aria-modal="true" aria-label="删除脚本">
            <h2>删除这条记录？</h2>
            <p>删除后会从当前列表移除，不能在这里直接恢复。</p>
            <div className="viral-menu-dialog-actions">
              <button type="button" onClick={() => setDeleteTarget(null)}>
                取消
              </button>
              <button type="button" className="viral-danger-btn" onClick={() => void confirmDeleteScript()}>
                删除
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
