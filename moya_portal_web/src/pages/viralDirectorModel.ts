export type ScriptSourceType = 'product_description' | 'local_video' | 'video_link'
export type AnalysisType = 'product_brief' | 'reference_video'
export type ScriptStatus = 'draft' | 'completed'
export type ReferenceInputMode = 'upload' | 'link'

export type ProductInput = {
  productName: string
  description: string
  sellingPoints: string[]
  targetAudience: string[]
  stylePreference: string[]
  platformPreference: string[]
  extraRequirements?: string
}

export type VideoInput = {
  mode: ReferenceInputMode
  url?: string
  fileName?: string
  durationSec: number
}

export type RewriteInput = {
  productName: string
  description: string
  sellingPoints: string[]
  targetAudience: string[]
  stylePreference: string[]
  platformPreference: string[]
  mustKeep: string[]
  mustAvoid: string[]
}

export type SourcePayload = {
  sourceType: ScriptSourceType
  productInput?: ProductInput
  videoInput?: VideoInput
  rewriteInput?: RewriteInput
}

export type ProductBriefAnalysis = {
  analysisType: 'product_brief'
  headline: string
  sellingPointSummary: string
  audienceSummary: string
  styleSummary: string
  recommendedAngles: string[]
  recommendedGroups: string[]
  riskNotes: string[]
}

export type ReferenceVideoAnalysisSegment = {
  segmentId: string
  groupLabel: string
  segmentTitle: string
  visualDescription: string
  voiceoverText: string
  startSec: number
  endSec: number
}

export type ReferenceVideoAnalysis = {
  analysisType: 'reference_video'
  videoTitle: string
  videoSummary: {
    durationLabel: string
    language: string
    uploadedAt: string
    productName: string
  }
  details: {
    sellingPoints: string[]
    targetAudience: string[]
    audienceAnalysis: string
    structureSummary: string[]
  }
  segments: ReferenceVideoAnalysisSegment[]
  riskNotes: string[]
}

export type AnalysisArtifact = ProductBriefAnalysis | ReferenceVideoAnalysis

export type DirectorAssetRef = {
  assetId: string
  assetType: 'audio' | 'caption' | 'image' | 'other' | 'video'
  source: 'extracted' | 'generated' | 'library' | 'upload'
  name: string
  url: string
  thumbnailUrl: string
  purpose: string
  isReference: boolean
  isRequired: boolean
  boundSegmentId: string
  meta: Record<string, string | number>
}

export type DirectorAudioConfig = {
  voiceMode: 'ai_voice' | 'none' | 'original_voice'
  voiceName: string
  speed: number
  emotion: string
  accent: string
  pauseHints: string[]
  bgmSuggestion: string
}

export type DirectorSegment = {
  segmentId: string
  groupLabel: string
  segmentTitle: string
  durationSec: number
  visualDescription: string
  voiceoverText: string
  onscreenText: string
  shotType: string
  subject: string
  goal: string
  assetRefs: DirectorAssetRef[]
  audioConfig: DirectorAudioConfig
  transition: string
  generationNotes: string
  complianceNotes: string
  status: ScriptStatus
}

export type DirectorScript = {
  scriptId: string
  version: number
  title: string
  status: ScriptStatus
  sourceType: ScriptSourceType
  analysisType: AnalysisType
  productName: string
  targetAudience: string[]
  platform: string[]
  style: string[]
  tone: string[]
  language: string
  objective: string
  tags: string[]
  createdAt: string
  updatedAt: string
  segments: DirectorSegment[]
}

export type ScriptPackage = {
  sourcePayload: SourcePayload
  analysisArtifact: AnalysisArtifact
  directorScript: DirectorScript
}

export type SavedScriptGroups = {
  completed: ScriptPackage[]
  draft: ScriptPackage[]
}

const defaultAudioConfig: DirectorAudioConfig = {
  voiceMode: 'none',
  voiceName: '',
  speed: 1,
  emotion: '',
  accent: '',
  pauseHints: [],
  bgmSuggestion: '',
}

function nowIso() {
  return new Date().toISOString()
}

function buildId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

function joinText(items: string[], fallback: string) {
  return items.length ? items.join('、') : fallback
}

function splitPrompt(prompt: string) {
  return prompt
    .split(/[，。；、\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function buildReferenceInputTitle(videoInput: VideoInput) {
  return videoInput.fileName?.trim() || videoInput.url?.trim() || '参考视频'
}

function normalizeRewriteInput(videoInput: VideoInput, rewriteInput?: Partial<RewriteInput>): RewriteInput {
  const title = buildReferenceInputTitle(videoInput)
  return {
    productName: rewriteInput?.productName?.trim() || title,
    description: rewriteInput?.description?.trim() || '基于参考视频结构生成一版可编辑脚本。',
    sellingPoints: rewriteInput?.sellingPoints?.length ? rewriteInput.sellingPoints : ['结果先行', '节奏紧凑', '适合直接拍摄'],
    targetAudience: rewriteInput?.targetAudience?.length ? rewriteInput.targetAudience : ['平台泛人群', '看过同类内容的用户'],
    stylePreference: rewriteInput?.stylePreference?.length ? rewriteInput.stylePreference : ['口播带货', '结构清楚'],
    platformPreference: rewriteInput?.platformPreference?.length ? rewriteInput.platformPreference : ['抖音'],
    mustKeep: rewriteInput?.mustKeep?.length ? rewriteInput.mustKeep : ['开场抓停留', '卖点表达清楚'],
    mustAvoid: rewriteInput?.mustAvoid?.length ? rewriteInput.mustAvoid : ['绝对化表达', '夸大承诺'],
  }
}

function buildSegment(partial: Partial<DirectorSegment> & Pick<DirectorSegment, 'groupLabel' | 'segmentTitle' | 'durationSec' | 'visualDescription' | 'voiceoverText' | 'onscreenText' | 'shotType' | 'subject' | 'goal'>): DirectorSegment {
  return {
    segmentId: partial.segmentId || buildId('seg'),
    groupLabel: partial.groupLabel,
    segmentTitle: partial.segmentTitle,
    durationSec: partial.durationSec,
    visualDescription: partial.visualDescription,
    voiceoverText: partial.voiceoverText,
    onscreenText: partial.onscreenText,
    shotType: partial.shotType,
    subject: partial.subject,
    goal: partial.goal,
    assetRefs: partial.assetRefs || [],
    audioConfig: partial.audioConfig || defaultAudioConfig,
    transition: partial.transition || 'cut',
    generationNotes: partial.generationNotes || '',
    complianceNotes: partial.complianceNotes || '',
    status: partial.status || 'draft',
  }
}

export function createProductInputFromPrompt(prompt: string): ProductInput {
  const cleaned = prompt.trim()
  const parts = splitPrompt(cleaned)
  return {
    productName: parts[0] || '未命名产品',
    description: cleaned || '请根据产品描述生成脚本。',
    sellingPoints: parts.slice(1, 4).length ? parts.slice(1, 4) : ['核心卖点突出', '适合短视频表达', '适合直接拍摄'],
    targetAudience: parts.slice(4, 6).length ? parts.slice(4, 6) : ['目标消费人群', '平台内容受众'],
    stylePreference: ['口播带货', '结构清楚'],
    platformPreference: ['抖音'],
    extraRequirements: '前3秒抓停留，适合直接进入拍摄。',
  }
}

export function cloneScriptPackage(scriptPackage: ScriptPackage): ScriptPackage {
  return JSON.parse(JSON.stringify(scriptPackage)) as ScriptPackage
}

export function buildProductScriptPackageFromPrompt(prompt: string): ScriptPackage {
  return buildProductScriptPackage(createProductInputFromPrompt(prompt))
}

export function buildProductScriptPackage(input: ProductInput): ScriptPackage {
  const createdAt = nowIso()
  const productName = input.productName || '未命名产品'
  const firstSellingPoint = input.sellingPoints[0] || '核心卖点'
  const firstAudience = input.targetAudience[0] || '目标用户'

  const analysisArtifact: ProductBriefAnalysis = {
    analysisType: 'product_brief',
    headline: `${productName}脚本方向已生成`,
    sellingPointSummary: joinText(input.sellingPoints, '待补充卖点'),
    audienceSummary: joinText(input.targetAudience, '待补充人群'),
    styleSummary: joinText(input.stylePreference, '口播带货'),
    recommendedAngles: ['先痛点后卖点', '先结果后解释', '新手友好切入'],
    recommendedGroups: ['开场切入', '卖点展开', '结果呈现', '行动转化'],
    riskNotes: ['避免绝对化承诺', '优惠话术必须真实', '效果展示要可验证'],
  }

  const segments: DirectorSegment[] = [
    buildSegment({
      groupLabel: '开场切入',
      segmentTitle: '痛点开场',
      durationSec: 4,
      visualDescription: `人物近景出镜，快速点出${firstAudience}最常见的问题。`,
      voiceoverText: `如果你也卡在这个问题上，可以先看看这个${productName}。`,
      onscreenText: `${productName}解决第一个痛点`,
      shotType: '人物近景',
      subject: '人物+产品',
      goal: '快速建立相关性并抓停留',
      generationNotes: `优先强调${firstSellingPoint}，语气直接。`,
      complianceNotes: '避免夸大承诺。',
    }),
    buildSegment({
      groupLabel: '卖点展开',
      segmentTitle: '核心卖点解释',
      durationSec: 7,
      visualDescription: `产品特写和使用动作切换，突出${joinText(input.sellingPoints, '产品优势')}。`,
      voiceoverText: `真正拉开差距的是${joinText(input.sellingPoints, '这些卖点')}，尤其适合${joinText(input.targetAudience, '这类人群')}。`,
      onscreenText: joinText(input.sellingPoints, '核心卖点'),
      shotType: '产品特写',
      subject: '产品',
      goal: '解释卖点并降低理解门槛',
      transition: 'dissolve',
      generationNotes: '字幕和口播保持同义，不要机械重复。',
      complianceNotes: '避免无法验证的唯一性描述。',
    }),
    buildSegment({
      groupLabel: '结果呈现',
      segmentTitle: '场景化结果',
      durationSec: 6,
      visualDescription: `展示使用${productName}后的状态变化或结果对比。`,
      voiceoverText: `你会更直观地看到，为什么它更适合${firstAudience}。`,
      onscreenText: '结果更直观',
      shotType: '前后对比',
      subject: '人物+场景',
      goal: '建立结果预期',
      transition: 'slide',
      generationNotes: '结果要拍得清楚，避免只靠抽象形容。',
      complianceNotes: '避免暗示永久效果。',
    }),
    buildSegment({
      groupLabel: '行动转化',
      segmentTitle: '下单引导',
      durationSec: 5,
      visualDescription: '人物收尾，产品和行动提示同屏出现。',
      voiceoverText: `如果你想直接照着这个逻辑拍自己的版本，这条脚本已经可以直接用。`,
      onscreenText: '适合直接拍摄',
      shotType: '半身口播',
      subject: '人物+产品',
      goal: '完成收尾和行动引导',
      transition: 'fade',
      generationNotes: '转化句保持克制。',
      complianceNotes: '活动和承诺信息必须真实。',
    }),
  ]

  return {
    sourcePayload: {
      sourceType: 'product_description',
      productInput: input,
    },
    analysisArtifact,
    directorScript: {
      scriptId: buildId('script'),
      version: 1,
      title: `${productName}产品生成脚本`,
      status: 'draft',
      sourceType: 'product_description',
      analysisType: 'product_brief',
      productName,
      targetAudience: input.targetAudience,
      platform: input.platformPreference,
      style: input.stylePreference,
      tone: ['直接', '利落'],
      language: '中文',
      objective: '生成一版可直接编辑和拍摄的脚本。',
      tags: [...input.sellingPoints, ...input.targetAudience].slice(0, 6),
      createdAt,
      updatedAt: createdAt,
      segments,
    },
  }
}

export function buildReferenceScriptPackage(videoInput: VideoInput, rewriteInput?: Partial<RewriteInput>): ScriptPackage {
  const createdAt = nowIso()
  const normalizedRewrite = normalizeRewriteInput(videoInput, rewriteInput)
  const videoTitle = buildReferenceInputTitle(videoInput)
  const productName = normalizedRewrite.productName
  const firstSellingPoint = normalizedRewrite.sellingPoints[0] || '核心卖点'
  const firstAudience = normalizedRewrite.targetAudience[0] || '目标用户'

  const analysisArtifact: ReferenceVideoAnalysis = {
    analysisType: 'reference_video',
    videoTitle,
    videoSummary: {
      durationLabel: `${Math.max(videoInput.durationSec, 1)}秒`,
      language: '中文',
      uploadedAt: '2026-05-30 10:30:00',
      productName,
    },
    details: {
      sellingPoints: normalizedRewrite.sellingPoints,
      targetAudience: normalizedRewrite.targetAudience,
      audienceAnalysis: `这条参考视频适合迁移到${productName}，主要面向${joinText(normalizedRewrite.targetAudience, '目标用户')}。`,
      structureSummary: ['参考开场', '卖点展开', '结果证明', '行动引导'],
    },
    segments: [
      {
        segmentId: buildId('analysis'),
        groupLabel: '参考结构一',
        segmentTitle: '参考开场',
        visualDescription: '人物正面出镜，快速亮相产品并给出结果预期。',
        voiceoverText: '开场先抓停留。',
        startSec: 0,
        endSec: 4,
      },
      {
        segmentId: buildId('analysis'),
        groupLabel: '参考结构二',
        segmentTitle: '卖点展开',
        visualDescription: '产品特写、手部展示和字幕说明交替出现。',
        voiceoverText: '用简单语言解释为什么这个产品适合目标用户。',
        startSec: 4,
        endSec: 12,
      },
      {
        segmentId: buildId('analysis'),
        groupLabel: '参考结构三',
        segmentTitle: '结果证明',
        visualDescription: '展示使用后的状态变化，对比结果更清楚。',
        voiceoverText: '结果必须可见、可理解、可转述。',
        startSec: 12,
        endSec: 20,
      },
    ],
    riskNotes: ['避免照搬原文', '结果展示必须换成自己的真实内容', '不要复制原视频品牌信息'],
  }

  const segments: DirectorSegment[] = [
    buildSegment({
      groupLabel: '参考结构一',
      segmentTitle: '参考开场改写',
      durationSec: 4,
      visualDescription: `保留参考视频的快节奏开场，用人物出镜加产品亮相的方式切到${productName}。`,
      voiceoverText: `${firstAudience}如果也卡在这个问题上，那这次你可以直接看看${productName}。`,
      onscreenText: `${productName}快速切入`,
      shotType: '人物特写',
      subject: '人物+产品',
      goal: '借参考结构完成本品切入',
      generationNotes: '保留参考开场节奏。',
      complianceNotes: joinText(normalizedRewrite.mustAvoid, '避免夸大承诺'),
    }),
    buildSegment({
      groupLabel: '参考结构二',
      segmentTitle: '卖点迁移',
      durationSec: 7,
      visualDescription: `沿用参考视频的展示段落，但重点替换成${joinText(normalizedRewrite.sellingPoints, '本品卖点')}。`,
      voiceoverText: `真正拉开差距的是${joinText(normalizedRewrite.sellingPoints, '这些卖点')}，尤其适合${joinText(normalizedRewrite.targetAudience, '这类人群')}。`,
      onscreenText: joinText(normalizedRewrite.sellingPoints, '卖点迁移'),
      shotType: '产品特写',
      subject: '产品',
      goal: '把参考优势迁移到本品卖点上',
      transition: 'dissolve',
      generationNotes: joinText(normalizedRewrite.mustKeep, '保留参考节奏'),
      complianceNotes: joinText(normalizedRewrite.mustAvoid, '避免绝对化表达'),
    }),
    buildSegment({
      groupLabel: '参考结构三',
      segmentTitle: '结果证明',
      durationSec: 6,
      visualDescription: `按照参考视频的证据段组织结果展示，突出${firstSellingPoint}对应的变化。`,
      voiceoverText: '结果必须拍得清楚，而且能被普通用户理解。',
      onscreenText: '结果更直观',
      shotType: '前后对比',
      subject: '人物+场景',
      goal: '建立可信结果预期',
      transition: 'slide',
      generationNotes: '结果展示必须可拍、可验、可复述。',
      complianceNotes: '避免暗示永久效果。',
    }),
    buildSegment({
      groupLabel: '参考结构四',
      segmentTitle: '行动引导',
      durationSec: 5,
      visualDescription: '人物收尾，产品和行动提示同屏出现。',
      voiceoverText: '这条脚本已经整理好，直接按段拍就可以。',
      onscreenText: '适合直接拍摄',
      shotType: '半身口播',
      subject: '人物+产品',
      goal: '完成收尾和行动引导',
      transition: 'fade',
      generationNotes: '转化句尽量克制。',
      complianceNotes: '活动与承诺信息必须真实。',
    }),
  ]

  return {
    sourcePayload: {
      sourceType: videoInput.mode === 'upload' ? 'local_video' : 'video_link',
      videoInput,
      rewriteInput: normalizedRewrite,
    },
    analysisArtifact,
    directorScript: {
      scriptId: buildId('script'),
      version: 1,
      title: `${productName}参考改写脚本`,
      status: 'draft',
      sourceType: videoInput.mode === 'upload' ? 'local_video' : 'video_link',
      analysisType: 'reference_video',
      productName,
      targetAudience: normalizedRewrite.targetAudience,
      platform: normalizedRewrite.platformPreference,
      style: normalizedRewrite.stylePreference,
      tone: ['参考改写', '带货'],
      language: '中文',
      objective: '基于参考视频改写出适合当前场景的脚本。',
      tags: [...normalizedRewrite.sellingPoints, ...normalizedRewrite.targetAudience].slice(0, 6),
      createdAt,
      updatedAt: createdAt,
      segments,
    },
  }
}

export function updateSegment(scriptPackage: ScriptPackage, segmentId: string, patch: Partial<DirectorSegment>): ScriptPackage {
  return {
    ...scriptPackage,
    directorScript: {
      ...scriptPackage.directorScript,
      updatedAt: nowIso(),
      segments: scriptPackage.directorScript.segments.map((segment) =>
        segment.segmentId === segmentId ? { ...segment, ...patch } : segment,
      ),
    },
  }
}

export function attachAssetToSegment(
  scriptPackage: ScriptPackage,
  segmentId: string,
  asset: Omit<DirectorAssetRef, 'assetId' | 'boundSegmentId'>,
): ScriptPackage {
  const target = scriptPackage.directorScript.segments.find((segment) => segment.segmentId === segmentId)
  return updateSegment(scriptPackage, segmentId, {
    assetRefs: (target?.assetRefs || []).concat({
      ...asset,
      assetId: buildId('asset'),
      boundSegmentId: segmentId,
    }),
  })
}

export function groupSavedScripts(scriptPackages: ScriptPackage[]): SavedScriptGroups {
  return {
    completed: scriptPackages.filter((item) => item.directorScript.status === 'completed'),
    draft: scriptPackages.filter((item) => item.directorScript.status === 'draft'),
  }
}

export function createSeedScriptPackages(): ScriptPackage[] {
  const completed = buildProductScriptPackage({
    productName: '高级感假睫毛',
    description: '面向时尚潮流人群，突出高级感和使用便捷。',
    sellingPoints: ['高级感', '自然放大双眼', '新手易上手'],
    targetAudience: ['时尚女生', '新手通勤妆'],
    stylePreference: ['高级', '口播带货'],
    platformPreference: ['抖音'],
    extraRequirements: '前3秒抓停留。',
  })
  completed.directorScript.status = 'completed'
  completed.directorScript.title = '高级感假睫毛，时尚达人必备'

  const draft = buildReferenceScriptPackage({
    mode: 'upload',
    fileName: '宅家自己烫睫毛，不用睫毛膏也不用卸妆',
    durationSec: 59,
  })
  draft.directorScript.title = '宅家自己烫睫毛，不用睫毛膏也不用卸妆'

  return [completed, draft]
}
