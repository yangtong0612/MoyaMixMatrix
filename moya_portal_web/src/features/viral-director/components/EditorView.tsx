import { useEffect, useRef, useState, type DragEvent } from 'react'
import { ChevronLeft, Download, GripVertical, PencilLine, Plus, Save, Send, Trash2 } from 'lucide-react'
import type { DirectorSegment, ScriptPackage } from '../../../pages/viralDirectorModel'
import type { EditorMode } from '../types'
import { SegmentAssetList } from './SegmentAssetList'

export function EditorView({
  scriptPackage,
  editorMode,
  onBack,
  onEditorModeChange,
  onUpdateTitle,
  onUpdateSegment,
  onAddSegment,
  onDeleteSegment,
  onReorderSegment,
  onRequestAssetUpload,
  onSave,
  onSendToProduction,
  onExport,
}: {
  scriptPackage: ScriptPackage
  editorMode: EditorMode
  onBack: () => void
  onEditorModeChange: (mode: EditorMode) => void
  onUpdateTitle: (title: string) => void
  onUpdateSegment: (segmentId: string, patch: Partial<DirectorSegment>) => void
  onAddSegment: () => void
  onDeleteSegment: (segmentId: string) => void
  onReorderSegment: (sourceSegmentId: string, targetSegmentId: string) => void
  onRequestAssetUpload: (segmentId: string) => void
  onSave: () => void | Promise<void>
  onSendToProduction: () => void | Promise<void>
  onExport: () => void
}) {
  const { directorScript } = scriptPackage
  const [titleEditing, setTitleEditing] = useState(false)
  const [titleDraft, setTitleDraft] = useState(directorScript.title)
  const [draggingSegmentId, setDraggingSegmentId] = useState<string | null>(null)
  const titleInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!titleEditing) setTitleDraft(directorScript.title)
  }, [directorScript.title, titleEditing])

  useEffect(() => {
    if (!titleEditing) return
    titleInputRef.current?.focus()
    titleInputRef.current?.select()
  }, [titleEditing])

  function commitTitleEdit() {
    const nextTitle = titleDraft.trim() || directorScript.title
    if (nextTitle !== directorScript.title) onUpdateTitle(nextTitle)
    setTitleDraft(nextTitle)
    setTitleEditing(false)
  }

  function cancelTitleEdit() {
    setTitleDraft(directorScript.title)
    setTitleEditing(false)
  }

  function startSegmentDrag(segmentId: string, event: DragEvent<HTMLElement>) {
    setDraggingSegmentId(segmentId)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', segmentId)
  }

  function dropSegment(targetSegmentId: string, event: DragEvent<HTMLElement>) {
    event.preventDefault()
    const sourceSegmentId = event.dataTransfer.getData('text/plain') || draggingSegmentId
    if (sourceSegmentId) onReorderSegment(sourceSegmentId, targetSegmentId)
    setDraggingSegmentId(null)
  }

  function allowSegmentDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  return (
    <div className="viral-stack">
      <div className="viral-functional-head viral-editor-toolbar">
        <button type="button" className="viral-back" onClick={onBack}>
          <ChevronLeft size={22} />
          编辑脚本
        </button>
        <div className="viral-inline-buttons">
          <div className="viral-view-toggle">
            <button type="button" className={editorMode === 'text' ? 'is-active' : ''} onClick={() => onEditorModeChange('text')}>
              文本视图
            </button>
            <button type="button" className={editorMode === 'table' ? 'is-active' : ''} onClick={() => onEditorModeChange('table')}>
              表格视图
            </button>
          </div>
          <button type="button" onClick={onAddSegment}>
            <Plus size={18} />
            添加
          </button>
          <button type="button" onClick={onExport}>
            <Download size={18} />
            导出JSON
          </button>
          <button type="button" onClick={() => void onSendToProduction()}>
            <Send size={18} />
            导入合成量产
          </button>
          <button type="button" className="viral-gradient-btn" onClick={() => void onSave()}>
            <Save size={18} />
            保存
          </button>
        </div>
      </div>

      <section className="viral-editor-surface">
        <h2 className="viral-editor-title">
          <button
            type="button"
            className="viral-title-edit-button"
            aria-label="编辑脚本标题"
            onClick={() => setTitleEditing(true)}
          >
            <PencilLine size={22} />
          </button>
          {titleEditing ? (
            <input
              ref={titleInputRef}
              aria-label="编辑脚本标题"
              value={titleDraft}
              onBlur={() => commitTitleEdit()}
              onChange={(event) => setTitleDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  commitTitleEdit()
                }
                if (event.key === 'Escape') {
                  event.preventDefault()
                  cancelTitleEdit()
                }
              }}
            />
          ) : (
            <span className="viral-editor-title-text">{directorScript.title}</span>
          )}
        </h2>

        {editorMode === 'table' ? (
          <div className="viral-table-wrap flat">
            <table className="viral-table editor multidim">
              <thead>
                <tr>
                  <th>排序</th>
                  <th>镜头分组</th>
                  <th>画面描述</th>
                  <th>台词口播</th>
                  <th>素材</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {directorScript.segments.map((segment) => (
                  <tr
                    key={segment.segmentId}
                    className={draggingSegmentId === segment.segmentId ? 'is-dragging' : undefined}
                    onDragOver={allowSegmentDrop}
                    onDrop={(event) => dropSegment(segment.segmentId, event)}
                  >
                    <td>
                      <button
                        type="button"
                        className="viral-segment-icon-button drag"
                        draggable
                        aria-label={`拖动排序 ${segment.groupLabel}`}
                        onDragStart={(event) => startSegmentDrag(segment.segmentId, event)}
                        onDragEnd={() => setDraggingSegmentId(null)}
                      >
                        <GripVertical size={15} />
                      </button>
                    </td>
                    <td><input value={segment.groupLabel} onChange={(event) => onUpdateSegment(segment.segmentId, { groupLabel: event.target.value })} /></td>
                    <td><textarea rows={4} value={segment.visualDescription} onChange={(event) => onUpdateSegment(segment.segmentId, { visualDescription: event.target.value })} /></td>
                    <td><textarea rows={4} value={segment.voiceoverText} onChange={(event) => onUpdateSegment(segment.segmentId, { voiceoverText: event.target.value })} /></td>
                    <td>
                      <div className="viral-material-cell">
                        <button type="button" onClick={() => onRequestAssetUpload(segment.segmentId)}>
                          <Plus size={14} />
                          添加素材
                        </button>
                        <SegmentAssetList assets={segment.assetRefs} />
                      </div>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="viral-segment-icon-button danger"
                        aria-label={`删除 ${segment.groupLabel}`}
                        disabled={directorScript.segments.length <= 1}
                        onClick={() => onDeleteSegment(segment.segmentId)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="viral-text-view">
            {directorScript.segments.map((segment) => (
              <article
                key={segment.segmentId}
                className={`viral-text-segment${draggingSegmentId === segment.segmentId ? ' is-dragging' : ''}`}
                onDragOver={allowSegmentDrop}
                onDrop={(event) => dropSegment(segment.segmentId, event)}
              >
                <div className="viral-text-segment-tools">
                  <button
                    type="button"
                    className="viral-segment-icon-button drag"
                    draggable
                    aria-label={`拖动排序 ${segment.groupLabel}`}
                    onDragStart={(event) => startSegmentDrag(segment.segmentId, event)}
                    onDragEnd={() => setDraggingSegmentId(null)}
                  >
                    <GripVertical size={15} />
                  </button>
                  <button
                    type="button"
                    className="viral-segment-icon-button danger"
                    aria-label={`删除 ${segment.groupLabel}`}
                    disabled={directorScript.segments.length <= 1}
                    onClick={() => onDeleteSegment(segment.segmentId)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                <div className="viral-text-segment-head">
                  <label>
                    <span>镜头分组</span>
                    <input
                      value={segment.groupLabel}
                      onChange={(event) => onUpdateSegment(segment.segmentId, { groupLabel: event.target.value })}
                    />
                  </label>
                </div>
                <label className="viral-text-editor-field">
                  <span>画面</span>
                  <textarea
                    rows={4}
                    value={segment.visualDescription}
                    onChange={(event) => onUpdateSegment(segment.segmentId, { visualDescription: event.target.value })}
                  />
                </label>
                <label className="viral-text-editor-field">
                  <span>口播</span>
                  <textarea
                    rows={4}
                    value={segment.voiceoverText}
                    onChange={(event) => onUpdateSegment(segment.segmentId, { voiceoverText: event.target.value })}
                  />
                </label>
                <div className="viral-material-cell viral-text-material-cell">
                  <button type="button" onClick={() => onRequestAssetUpload(segment.segmentId)}>
                    <Plus size={14} />
                    添加素材
                  </button>
                  <SegmentAssetList assets={segment.assetRefs} />
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
