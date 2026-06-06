import { ChevronLeft } from 'lucide-react'

import type { ScriptPackage } from '../../../pages/viralDirectorModel'

export function GeneratingPreviewView({ scriptPackage, onBack }: { scriptPackage: ScriptPackage | null; onBack: () => void }) {
  const segments = scriptPackage?.directorScript.segments ?? []
  const title = scriptPackage?.directorScript.title
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
          <div className="viral-generating-copy" aria-live="polite">
            {title && title !== '脚本生成中' ? <h2>{title}</h2> : <span className="viral-skeleton-line title" />}
            <span className="viral-skeleton-line subtitle" />
          </div>
          <button type="button" className="viral-gradient-btn viral-generating-action" disabled aria-busy="true">
            采用并编辑此脚本
          </button>
        </div>

        <div className="viral-table-wrap flat">
          <table className="viral-table generated-preview viral-skeleton-table" aria-label="脚本生成中">
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
              {segments.length === 0 ? (
                <tr className="viral-skeleton-row viral-skeleton-row-pending">
                  <td colSpan={4}>
                    <div className="viral-skeleton-pending">
                      <span className="viral-skeleton-line medium" />
                      <span className="viral-skeleton-line long" />
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
