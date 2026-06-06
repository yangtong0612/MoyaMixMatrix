import { ChevronLeft, Clock3, Play } from 'lucide-react'

import type { ScriptPackage } from '../../../pages/viralDirectorModel'
import { formatTimeRange } from '../utils/time'
import { InfoLine } from './InfoLine'

export function VideoAnalysisView({
  scriptPackage,
  onBack,
  onImitate,
  onMoreActions,
}: {
  scriptPackage: ScriptPackage
  onBack: () => void
  onImitate: () => void
  onMoreActions: () => void
}) {
  if (scriptPackage.analysisArtifact.analysisType !== 'reference_video') return null
  const analysis = scriptPackage.analysisArtifact
  const sourceLabel = scriptPackage.sourcePayload.videoInput?.mode === 'upload' ? '本地上传' : '视频链接'

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
            <p className="viral-subtitle">先确认参考视频解析结果，再进入仿写脚本。</p>
          </div>
          <div className="viral-inline-buttons">
            <button type="button" onClick={onMoreActions}>
              更多操作
            </button>
            <button type="button" className="viral-gradient-btn" onClick={onImitate}>
              仿写脚本
            </button>
          </div>
        </div>

        <div className="viral-analysis-split">
          <div className="viral-video-frame">
            <div className="viral-video-poster">
              <div className="viral-video-badges">
                <span>{sourceLabel}</span>
                <span>{analysis.videoSummary.durationLabel}</span>
              </div>
              <button type="button" aria-label="播放视频">
                <Play size={24} fill="currentColor" />
              </button>
              <div className="viral-video-overlay">
                <strong>{analysis.videoTitle}</strong>
                <p>{analysis.details.sellingPoints.join(' | ')}</p>
              </div>
            </div>
            <div className="viral-video-meta">
              <span>参考来源：{sourceLabel}</span>
              <span>{analysis.segments.length} 个结构段</span>
            </div>
            <div className="viral-video-structure-list">
              {analysis.details.structureSummary.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </div>

          <div className="viral-video-summary">
            <div className="viral-video-summary-head">
              <h3>视频总结</h3>
              <div className="viral-chip-row">
                <span>
                  <Clock3 size={15} />
                  口播时长：{analysis.videoSummary.durationLabel}
                </span>
                <span>口播语言：{analysis.videoSummary.language}</span>
              </div>
            </div>
            <InfoLine label="上传时间" value={analysis.videoSummary.uploadedAt} />
            <InfoLine label="产品名称" value={analysis.videoSummary.productName} />
            <InfoLine label="卖点词" value={analysis.details.sellingPoints.join('、')} />
            <InfoLine label="受众群体" value={analysis.details.targetAudience.join('、')} />
            <InfoLine label="受众分析" value={analysis.details.audienceAnalysis} />
          </div>
        </div>

        <div className="viral-table-wrap flat">
          <table className="viral-table generated-preview">
            <thead>
              <tr>
                <th>脚本结构</th>
                <th>时间段</th>
                <th>画面描述</th>
                <th>台词</th>
              </tr>
            </thead>
            <tbody>
              {analysis.segments.map((segment) => (
                <tr key={segment.segmentId}>
                  <td>
                    {segment.groupLabel} | {segment.segmentTitle}
                  </td>
                  <td>{formatTimeRange(segment.startSec, segment.endSec)}</td>
                  <td>{segment.visualDescription}</td>
                  <td>{segment.voiceoverText}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
