import { cloneScriptPackage, type ScriptPackage } from '../../../pages/viralDirectorModel'
import { formatSec } from '../utils/time'

export function renameScriptPackage(scriptPackage: ScriptPackage, title: string): ScriptPackage {
  const updatedAt = new Date().toISOString()
  return {
    ...scriptPackage,
    analysisArtifact: scriptPackage.analysisArtifact.analysisType === 'reference_video'
      ? {
        ...scriptPackage.analysisArtifact,
        videoTitle: title,
      }
      : scriptPackage.analysisArtifact,
    directorScript: {
      ...scriptPackage.directorScript,
      title,
      updatedAt,
    },
  }
}

export function duplicateScriptPackage(scriptPackage: ScriptPackage): ScriptPackage {
  const nextPackage = cloneScriptPackage(scriptPackage)
  const now = new Date().toISOString()
  const title = `${getReferenceAnalysisTitle(scriptPackage)} 副本`
  return {
    ...nextPackage,
    directorScript: {
      ...nextPackage.directorScript,
      scriptId: `viral_copy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title,
      status: 'completed',
      createdAt: now,
      updatedAt: now,
    },
  }
}

export function getCreatedScriptSummary(scriptPackage: ScriptPackage) {
  const { directorScript, analysisArtifact } = scriptPackage
  const parts = [
    analysisArtifact.analysisType === 'product_brief' ? analysisArtifact.sellingPointSummary : '',
    ...directorScript.tags,
    ...directorScript.style,
    directorScript.objective,
  ]
    .map((item) => item.trim())
    .filter(Boolean)
  return Array.from(new Set(parts)).slice(0, 5).join(' | ') || directorScript.productName || '已保存脚本'
}

export function getScriptAssetCount(scriptPackage: ScriptPackage) {
  return scriptPackage.directorScript.segments.reduce((total, segment) => total + segment.assetRefs.length, 0)
}

export function formatCreatedAt(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (num: number) => String(num).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export function getReferenceAnalysisTitle(scriptPackage: ScriptPackage) {
  if (scriptPackage.analysisArtifact.analysisType === 'reference_video') {
    return scriptPackage.analysisArtifact.videoTitle || scriptPackage.sourcePayload.videoInput?.fileName || scriptPackage.sourcePayload.videoInput?.url || scriptPackage.directorScript.title
  }
  return scriptPackage.directorScript.title
}

export function getReferenceSegmentCount(scriptPackage: ScriptPackage) {
  if (scriptPackage.analysisArtifact.analysisType === 'reference_video') {
    return scriptPackage.analysisArtifact.segments.length
  }
  return scriptPackage.directorScript.segments.length
}

export function renderReferenceSourceLabel(scriptPackage: ScriptPackage) {
  switch (scriptPackage.directorScript.sourceType) {
    case 'product_description':
      return '产品生成'
    case 'local_video':
      return '用户上传'
    case 'video_link':
      return '链接参考'
    default:
      return '未知来源'
  }
}

export function getReferenceDurationLabel(scriptPackage: ScriptPackage) {
  if (scriptPackage.analysisArtifact.analysisType === 'reference_video') {
    return scriptPackage.analysisArtifact.videoSummary.durationLabel
  }
  const totalDuration = scriptPackage.directorScript.segments.reduce((total, segment) => total + Number(segment.durationSec || 0), 0)
  return totalDuration > 0 ? formatSec(totalDuration) : '00:00'
}
