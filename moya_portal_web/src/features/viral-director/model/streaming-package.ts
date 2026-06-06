import type { ViralDirectorStreamEvent } from '../../../shared/clients/viral-director-client'
import type { DirectorSegment, ScriptPackage } from '../../../pages/viralDirectorModel'

export function createStreamingProductPackage(prompt: string, revisionInstruction = ''): ScriptPackage {
  const now = new Date().toISOString()
  const productName = prompt.split(/[，。；、\n]/).map((item) => item.trim()).filter(Boolean)[0] || '产品脚本'
  return {
    sourcePayload: {
      sourceType: 'product_description',
      productInput: {
        productName,
        description: prompt,
        sellingPoints: [],
        targetAudience: [],
        stylePreference: [],
        platformPreference: [],
        extraRequirements: revisionInstruction,
      },
    },
    analysisArtifact: {
      analysisType: 'product_brief',
      headline: '',
      sellingPointSummary: '',
      audienceSummary: '',
      styleSummary: '',
      recommendedAngles: [],
      recommendedGroups: [],
      riskNotes: [],
    },
    directorScript: {
      scriptId: `viral_stream_${Date.now()}`,
      version: 1,
      title: '脚本生成中',
      status: 'draft',
      sourceType: 'product_description',
      analysisType: 'product_brief',
      productName,
      targetAudience: [],
      platform: [],
      style: [],
      tone: [],
      language: '中文',
      objective: '生成一版可直接编辑的编导脚本',
      tags: [],
      createdAt: now,
      updatedAt: now,
      segments: [],
    },
  }
}

export function applyStreamingMeta(scriptPackage: ScriptPackage | null, patch: Extract<ViralDirectorStreamEvent, { type: 'meta' }>['patch']) {
  if (!scriptPackage || scriptPackage.analysisArtifact.analysisType !== 'product_brief') return scriptPackage
  const productName = typeof patch.productName === 'string' && patch.productName.trim() ? patch.productName.trim() : scriptPackage.directorScript.productName
  return {
    ...scriptPackage,
    sourcePayload: {
      ...scriptPackage.sourcePayload,
      productInput: scriptPackage.sourcePayload.productInput ? {
        ...scriptPackage.sourcePayload.productInput,
        productName,
      } : scriptPackage.sourcePayload.productInput,
    },
    analysisArtifact: {
      ...scriptPackage.analysisArtifact,
      headline: typeof patch.headline === 'string' ? patch.headline : scriptPackage.analysisArtifact.headline,
      sellingPointSummary: typeof patch.sellingPointSummary === 'string' ? patch.sellingPointSummary : scriptPackage.analysisArtifact.sellingPointSummary,
      audienceSummary: typeof patch.audienceSummary === 'string' ? patch.audienceSummary : scriptPackage.analysisArtifact.audienceSummary,
      styleSummary: typeof patch.styleSummary === 'string' ? patch.styleSummary : scriptPackage.analysisArtifact.styleSummary,
      recommendedAngles: Array.isArray(patch.recommendedAngles) ? patch.recommendedAngles.filter(isString) : scriptPackage.analysisArtifact.recommendedAngles,
      recommendedGroups: Array.isArray(patch.recommendedGroups) ? patch.recommendedGroups.filter(isString) : scriptPackage.analysisArtifact.recommendedGroups,
      riskNotes: Array.isArray(patch.riskNotes) ? patch.riskNotes.filter(isString) : scriptPackage.analysisArtifact.riskNotes,
    },
    directorScript: {
      ...scriptPackage.directorScript,
      title: typeof patch.title === 'string' && patch.title.trim() ? patch.title : scriptPackage.directorScript.title,
      productName,
      targetAudience: Array.isArray(patch.targetAudience) ? patch.targetAudience.filter(isString) : scriptPackage.directorScript.targetAudience,
      platform: Array.isArray(patch.platform) ? patch.platform.filter(isString) : scriptPackage.directorScript.platform,
      style: Array.isArray(patch.style) ? patch.style.filter(isString) : scriptPackage.directorScript.style,
      tone: Array.isArray(patch.tone) ? patch.tone.filter(isString) : scriptPackage.directorScript.tone,
      objective: typeof patch.objective === 'string' && patch.objective.trim() ? patch.objective : scriptPackage.directorScript.objective,
      tags: Array.isArray(patch.tags) ? patch.tags.filter(isString) : scriptPackage.directorScript.tags,
      updatedAt: new Date().toISOString(),
    },
  }
}

export function applyStreamingSegment(scriptPackage: ScriptPackage | null, index: number, segment: DirectorSegment) {
  if (!scriptPackage) return scriptPackage
  const segments = [...scriptPackage.directorScript.segments]
  segments[Math.max(0, index)] = segment
  return {
    ...scriptPackage,
    directorScript: {
      ...scriptPackage.directorScript,
      updatedAt: new Date().toISOString(),
      segments: segments.filter(Boolean),
    },
  }
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}
