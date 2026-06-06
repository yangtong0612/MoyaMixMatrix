import { useState } from 'react'
import { ChevronLeft, Package2, PencilLine, RefreshCw, Send } from 'lucide-react'
import { notifyWarning } from '../../../ui/design-system'
import type { ScriptPackage } from '../../../pages/viralDirectorModel'

const revisionQuickOptions = ['开头更抓人', '台词更口语化', '突出产品卖点', '节奏更短更快']

export function PreviewView({
  scriptPackage,
  onBack,
  onAdopt,
  onSaveToMaterialLibrary,
  onImportToProduction,
  onRegenerate,
}: {
  scriptPackage: ScriptPackage
  onBack: () => void
  onAdopt: () => void
  onSaveToMaterialLibrary: () => void
  onImportToProduction: () => void | Promise<void>
  onRegenerate: (revisionInstruction?: string) => void | Promise<void>
}) {
  const segments = scriptPackage.directorScript.segments
  const [isRevisionOpen, setIsRevisionOpen] = useState(false)
  const [revisionInstruction, setRevisionInstruction] = useState('')

  function appendRevisionOption(option: string) {
    setRevisionInstruction((current) => {
      const normalized = current.trim()
      if (!normalized) return option
      if (normalized.includes(option)) return normalized
      return `${normalized}；${option}`
    })
  }

  function submitRevision() {
    const normalized = revisionInstruction.trim()
    if (!normalized) {
      notifyWarning('请先输入调整要求')
      return
    }
    setIsRevisionOpen(false)
    void onRegenerate(normalized)
  }

  return (
    <div className="viral-stack">
      <div className="viral-page-head viral-page-head-analysis">
        <button type="button" className="viral-back" onClick={onBack}>
          <ChevronLeft size={22} />
        </button>
        <h1>AI写脚本</h1>
      </div>

      <section className="viral-analysis-card wide">
        <div className="viral-functional-head">
          <div>
            <h2>{scriptPackage.directorScript.title}</h2>
            <p className="viral-subtitle">内容由 AI 生成，你可以先确认结构，再进入编辑。</p>
          </div>
          <div className="viral-inline-buttons">
            <button type="button" onClick={onSaveToMaterialLibrary}>
              <Package2 size={18} />
              保存到素材库
            </button>
            <button type="button" className="viral-gradient-btn" onClick={() => void onImportToProduction()}>
              <Send size={18} />
              导入合成量产
            </button>
            <button type="button" onClick={onAdopt}>
              <PencilLine size={18} />
              采用并编辑
            </button>
          </div>
        </div>

        <div className="viral-table-wrap flat">
          <table className="viral-table generated-preview">
            <thead>
              <tr>
                <th>镜头分组</th>
                <th>段落标题</th>
                <th>画面描述</th>
                <th>台词口播</th>
              </tr>
            </thead>
            <tbody>
              {segments.map((segment, index) => (
                <tr
                  key={segment.segmentId}
                  className="viral-table-reveal-row"
                  style={{ animationDelay: `${Math.min(index, 6) * 35}ms` }}
                >
                  <td>{segment.groupLabel}</td>
                  <td>{segment.segmentTitle}</td>
                  <td>{segment.visualDescription}</td>
                  <td>{segment.voiceoverText}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="viral-inline-actions preview">
          <p>{scriptPackage.directorScript.tags.join('、')}</p>
          <div className="viral-inline-buttons">
            <button type="button" onClick={() => void onRegenerate()}>
              <RefreshCw size={18} />
              重新生成
            </button>
            <button type="button" onClick={() => setIsRevisionOpen(true)}>
              调整要求
            </button>
          </div>
        </div>
      </section>

      {isRevisionOpen ? (
        <div className="viral-revision-backdrop" role="presentation">
          <div className="viral-revision-dialog" role="dialog" aria-modal="true" aria-labelledby="viralRevisionTitle">
            <div className="viral-revision-head">
              <div>
                <h2 id="viralRevisionTitle">调整生成要求</h2>
                <p>补充你想改的方向，系统会重新生成一版脚本。</p>
              </div>
              <button type="button" aria-label="关闭调整要求" onClick={() => setIsRevisionOpen(false)}>
                ×
              </button>
            </div>
            <div className="viral-revision-options">
              {revisionQuickOptions.map((option) => (
                <button type="button" key={option} onClick={() => appendRevisionOption(option)}>
                  {option}
                </button>
              ))}
            </div>
            <textarea
              value={revisionInstruction}
              onChange={(event) => setRevisionInstruction(event.target.value)}
              placeholder="例如：开头更炸一点，台词更像直播口播，减少夸张承诺，重点突出自然感。"
            />
            <div className="viral-revision-actions">
              <button type="button" onClick={() => setIsRevisionOpen(false)}>
                取消
              </button>
              <button type="button" className="viral-gradient-btn" onClick={submitRevision}>
                按要求重新生成
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
