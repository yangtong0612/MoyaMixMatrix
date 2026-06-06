import { useEffect, useRef, useState, type DragEvent } from 'react'
import { Clock3, Link2, Package2, Plus, Sparkles, Upload, X } from 'lucide-react'
import { notifyWarning } from '../../../ui/design-system'
import type { ScriptPackage, VideoInput } from '../../../pages/viralDirectorModel'
import type { EntryMode, LibraryTab } from '../types'
import {
  formatCreatedAt,
  getCreatedScriptSummary,
  getReferenceAnalysisTitle,
  getReferenceDurationLabel,
  getReferenceSegmentCount,
  getScriptAssetCount,
  renderReferenceSourceLabel,
} from '../model/script-package-utils'
import { isSupportedReferenceVideoFile } from '../utils/assets'
import { ScriptCardMenu } from './ScriptCardMenu'

type HomeViewProps = {
  entryMode: EntryMode
  libraryTab: LibraryTab
  productPrompt: string
  videoInput: VideoInput
  createdScripts: ScriptPackage[]
  referenceAnalyses: ScriptPackage[]
  openMenuScriptId: string | null
  onEntryModeChange: (mode: EntryMode) => void
  onLibraryTabChange: (tab: LibraryTab) => void
  onProductPromptChange: (value: string) => void
  onVideoInputChange: (value: VideoInput) => void
  onGenerate: (mode?: EntryMode) => void | Promise<void>
  onUploadGenerate: (file: File) => void | Promise<void>
  onOpenSavedScript: (scriptPackage: ScriptPackage) => void
  onToggleScriptMenu: (scriptId: string) => void
  onCloseScriptMenu: () => void
  onRenameScript: (scriptPackage: ScriptPackage) => void
  onCopyScript: (scriptPackage: ScriptPackage) => void
  onRequestDeleteScript: (scriptPackage: ScriptPackage) => void
}

export function HomeView({
  entryMode,
  libraryTab,
  productPrompt,
  videoInput,
  createdScripts,
  referenceAnalyses,
  openMenuScriptId,
  onEntryModeChange,
  onLibraryTabChange,
  onProductPromptChange,
  onVideoInputChange,
  onGenerate,
  onUploadGenerate,
  onOpenSavedScript,
  onToggleScriptMenu,
  onCloseScriptMenu,
  onRenameScript,
  onCopyScript,
  onRequestDeleteScript,
}: HomeViewProps) {
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null)
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState('')
  const [isUploadDragging, setIsUploadDragging] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false)
  const addMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!selectedUploadFile) {
      setUploadPreviewUrl('')
      return
    }
    const nextUrl = URL.createObjectURL(selectedUploadFile)
    setUploadPreviewUrl(nextUrl)
    return () => {
      URL.revokeObjectURL(nextUrl)
    }
  }, [selectedUploadFile])

  useEffect(() => {
    if (!isAddMenuOpen) return
    function handlePointerDown(event: PointerEvent) {
      const target = event.target
      if (target instanceof Node && addMenuRef.current?.contains(target)) return
      setIsAddMenuOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('click', handlePointerDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('click', handlePointerDown)
    }
  }, [isAddMenuOpen])

  function selectReferenceVideo(file: File) {
    if (!isSupportedReferenceVideoFile(file)) {
      notifyWarning('请上传视频文件')
      return
    }
    setSelectedUploadFile(file)
  }

  function openReferenceVideoPicker() {
    if (isSubmitting) return
    uploadInputRef.current?.click()
  }

  function handleReferenceVideoDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    setIsUploadDragging(false)
    const file = event.dataTransfer.files?.[0]
    if (file) selectReferenceVideo(file)
  }

  async function handlePrimaryAction() {
    if (isSubmitting) return
    if (entryMode === 'upload') {
      if (!selectedUploadFile) {
        notifyWarning('请先选择参考视频')
        return
      }
      try {
        setIsSubmitting(true)
        await onUploadGenerate(selectedUploadFile)
        return
      } finally {
        setIsSubmitting(false)
      }
    }
    try {
      setIsSubmitting(true)
      await onGenerate(entryMode)
    } finally {
      setIsSubmitting(false)
    }
  }

  function selectAddMode(mode: EntryMode) {
    setIsAddMenuOpen(false)
    onEntryModeChange(mode)
    window.requestAnimationFrame(() => {
      document.querySelector(mode === 'link' ? '.viral-peer-link input' : mode === 'product' ? '.viral-peer-textarea' : '.viral-peer-upload-dropzone')?.scrollIntoView({
        block: 'center',
        behavior: 'smooth',
      })
    })
  }

  return (
    <div className="viral-stack">
      <section className="viral-peer-hero">
        <h1>
          <Sparkles size={18} />
          AI帮你写脚本
        </h1>
      </section>

      <section className="viral-peer-shell">
        <div className="viral-peer-shell-inner">
          <div className="viral-peer-tabs">
            <button type="button" className={entryMode === 'product' ? 'is-active' : ''} onClick={() => onEntryModeChange('product')}>
              <Package2 size={16} />
              描述产品/服务
            </button>
            <button type="button" className={entryMode === 'upload' ? 'is-active' : ''} onClick={() => onEntryModeChange('upload')}>
              <Upload size={16} />
              上传参考视频
            </button>
            <button type="button" className={entryMode === 'link' ? 'is-active' : ''} onClick={() => onEntryModeChange('link')}>
              <Link2 size={16} />
              输入视频链接
            </button>
          </div>

          <div className="viral-peer-main">
            {entryMode === 'product' ? (
              <div className="viral-peer-textarea-wrap">
                <textarea
                  className="viral-peer-textarea"
                  value={productPrompt}
                  placeholder="输入你的产品、卖点信息，AI 帮你生成脚本"
                  onChange={(event) => onProductPromptChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (isSubmitting) return
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      void handlePrimaryAction()
                    }
                  }}
                />
                {productPrompt.trim() ? (
                  <button type="button" className="viral-peer-clear" aria-label="清空产品描述" onClick={() => onProductPromptChange('')}>
                    <X size={12} />
                  </button>
                ) : null}
              </div>
            ) : null}

            {entryMode === 'upload' ? (
              <div className="viral-peer-upload">
                <input
                  ref={uploadInputRef}
                  type="file"
                  hidden
                  accept="video/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (!file) return
                    selectReferenceVideo(file)
                    event.target.value = ''
                  }}
                />
                <div className="viral-peer-upload-dialog">
                  <div className="viral-peer-upload-copy">
                    <strong>{selectedUploadFile?.name || '上传参考视频'}</strong>
                    <p>上传一个本地视频，系统会先解析参考内容，再生成可编辑脚本。</p>
                  </div>
                  <div
                    className={`viral-peer-upload-dropzone${isUploadDragging ? ' is-dragging' : ''}`}
                    role="button"
                    tabIndex={0}
                    aria-label={selectedUploadFile ? '重新选择参考视频' : '选择参考视频'}
                    onClick={openReferenceVideoPicker}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        openReferenceVideoPicker()
                      }
                    }}
                    onDragEnter={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      setIsUploadDragging(true)
                    }}
                    onDragOver={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      event.dataTransfer.dropEffect = 'copy'
                      setIsUploadDragging(true)
                    }}
                    onDragLeave={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      setIsUploadDragging(false)
                    }}
                    onDrop={handleReferenceVideoDrop}
                  >
                    {selectedUploadFile ? (
                      <button
                        type="button"
                        className="viral-peer-clear"
                        aria-label="移除参考视频"
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          setSelectedUploadFile(null)
                          setIsUploadDragging(false)
                        }}
                      >
                        <X size={12} />
                      </button>
                    ) : null}
                    {uploadPreviewUrl ? (
                      <div className="viral-peer-upload-preview">
                        <video src={uploadPreviewUrl} controls playsInline preload="metadata" />
                      </div>
                    ) : (
                      <div className="viral-peer-upload-empty">
                        <Upload size={18} />
                        <span>支持上传本地视频，先预览再解析</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            {entryMode === 'link' ? (
              <div className="viral-peer-link">
                <div className="viral-peer-link-inline">
                  <span className="viral-peer-link-prefix">基于</span>
                  <div className="viral-peer-link-input-wrap">
                    <span>视频链接:</span>
                    <input
                      value={videoInput.url || ''}
                      onChange={(event) => onVideoInputChange({ ...videoInput, mode: 'link', url: event.target.value })}
                      onKeyDown={(event) => {
                        if (isSubmitting) return
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          void handlePrimaryAction()
                        }
                      }}
                      placeholder="请输入视频链接"
                    />
                    {videoInput.url?.trim() ? (
                      <button type="button" className="viral-peer-clear" aria-label="清空视频链接" onClick={() => onVideoInputChange({ ...videoInput, mode: 'link', url: '' })}>
                        <X size={12} />
                      </button>
                    ) : null}
                  </div>
                  <span className="viral-peer-link-suffix">，AI解析视频内容，帮你轻松复刻脚本</span>
                </div>
              </div>
            ) : null}
          </div>

          <div className="viral-peer-submit-row">
            <button
              type="button"
              className="viral-peer-submit"
              onClick={() => void handlePrimaryAction()}
              disabled={isSubmitting}
              aria-busy={isSubmitting}
            >
              {isSubmitting ? (entryMode === 'product' ? '生成中...' : '解析中...') : entryMode === 'product' ? '立即生成' : '立即解析'}
            </button>
          </div>
        </div>
      </section>

      <section className="viral-assets compact">
        <div className="viral-reference-toolbar">
          <div className="viral-reference-tabs" role="tablist" aria-label="脚本资产分类">
            <button type="button" className={libraryTab === 'created' ? 'is-active' : ''} onClick={() => onLibraryTabChange('created')}>
              我创建的
            </button>
            <button type="button" className={libraryTab === 'reference' ? 'is-active' : ''} onClick={() => onLibraryTabChange('reference')}>
              我参考的
            </button>
          </div>
          <div ref={addMenuRef} className="viral-add-menu-wrap">
            <button type="button" className="viral-reference-add" aria-label="新增脚本资产" aria-expanded={isAddMenuOpen} onClick={() => setIsAddMenuOpen((current) => !current)}>
              <Plus size={22} />
            </button>
            {isAddMenuOpen ? (
              <div className="viral-add-menu" role="menu">
                {libraryTab === 'created' ? (
                  <button type="button" role="menuitem" onClick={() => selectAddMode('product')}>
                    <Package2 size={15} />
                    从产品描述生成
                  </button>
                ) : (
                  <>
                    <button type="button" role="menuitem" onClick={() => selectAddMode('upload')}>
                      <Upload size={15} />
                      上传参考视频
                    </button>
                    <button type="button" role="menuitem" onClick={() => selectAddMode('link')}>
                      <Link2 size={15} />
                      输入视频链接
                    </button>
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>

        <div className="viral-script-list compact">
          {libraryTab === 'created'
            ? createdScripts.map((item) => (
              <article key={item.directorScript.scriptId} className="viral-created-card">
                <button type="button" className="viral-created-main" onClick={() => onOpenSavedScript(item)}>
                  <div className="viral-created-copy">
                    <h3>{item.directorScript.title}</h3>
                    <p>{getCreatedScriptSummary(item)}</p>
                    <small>
                      <Clock3 size={14} />
                      我 创建于{formatCreatedAt(item.directorScript.createdAt)}
                    </small>
                  </div>
                </button>
                <div className="viral-created-metrics">
                  <div className="viral-created-metric">
                    <strong>{getScriptAssetCount(item)}</strong>
                    <span>素材</span>
                  </div>
                  <div className="viral-created-metric">
                    <strong>{item.directorScript.segments.length}</strong>
                    <span>镜头分组</span>
                  </div>
                </div>
                <ScriptCardMenu
                  scriptPackage={item}
                  isOpen={openMenuScriptId === item.directorScript.scriptId}
                  canCopy
                  onToggle={() => onToggleScriptMenu(item.directorScript.scriptId)}
                  onClose={onCloseScriptMenu}
                  onRename={() => onRenameScript(item)}
                  onCopy={() => onCopyScript(item)}
                  onDelete={() => onRequestDeleteScript(item)}
                />
              </article>
            ))
            : referenceAnalyses.map((item) => (
              <article key={item.directorScript.scriptId} className="viral-reference-card">
                <button type="button" className="viral-reference-main" onClick={() => onOpenSavedScript(item)}>
                  <div className="viral-reference-thumb" aria-hidden="true">
                    <span>AI</span>
                    <strong>脚本</strong>
                  </div>
                  <div className="viral-reference-copy">
                    <h3>{getReferenceAnalysisTitle(item)}</h3>
                    <span>{getReferenceDurationLabel(item)}</span>
                    <small>{renderReferenceSourceLabel(item)}</small>
                  </div>
                </button>
                <div className="viral-reference-metric">
                  <strong>{getReferenceSegmentCount(item)}</strong>
                  <span>镜头分组</span>
                </div>
                <ScriptCardMenu
                  scriptPackage={item}
                  isOpen={openMenuScriptId === item.directorScript.scriptId}
                  canCopy={false}
                  onToggle={() => onToggleScriptMenu(item.directorScript.scriptId)}
                  onClose={onCloseScriptMenu}
                  onRename={() => onRenameScript(item)}
                  onCopy={() => onCopyScript(item)}
                  onDelete={() => onRequestDeleteScript(item)}
                />
              </article>
            ))}
        </div>
      </section>
    </div>
  )
}
