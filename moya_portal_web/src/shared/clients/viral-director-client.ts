import type { DirectorSegment, DirectorScript, ScriptPackage, ScriptSourceType } from '../../pages/viralDirectorModel'

type ScriptListResult = {
  ok: boolean
  scripts?: ScriptPackage[]
  error?: string
}

type ScriptPackageResult = {
  ok: boolean
  scriptPackage?: ScriptPackage
  error?: string
}

type SaveScriptResult = {
  ok: boolean
  scriptPackage?: ScriptPackage
  scripts?: ScriptPackage[]
  error?: string
}

type StreamStartResult = {
  ok: boolean
  taskId?: string
  error?: string
}

export type ViralDirectorStreamEvent =
  | { taskId: string; type: 'started'; sourceType: ScriptSourceType }
  | { taskId: string; type: 'meta'; patch: Partial<DirectorScript> & Record<string, unknown> }
  | { taskId: string; type: 'segment'; index: number; segment: DirectorSegment }
  | { taskId: string; type: 'done'; scriptPackage: ScriptPackage }
  | { taskId: string; type: 'error'; error: string }

export const viralDirectorClient = {
  listScripts(): Promise<ScriptListResult> {
    return (
      window.windowAPI?.listViralDirectorScripts?.().then((result) => ({
        ...result,
        scripts: (result.scripts ?? []) as ScriptPackage[],
      })) ?? Promise.resolve({ ok: false, error: '脚本后端不可用' })
    )
  },

  generateFromProduct(payload: { prompt: string; revisionInstruction?: string }): Promise<ScriptPackageResult> {
    return (
      window.windowAPI?.generateViralDirectorFromProduct?.(payload).then((result) => ({
        ...result,
        scriptPackage: result.scriptPackage as ScriptPackage | undefined,
      })) ?? Promise.resolve({ ok: false, error: '脚本后端不可用' })
    )
  },

  startProductStream(payload: { prompt: string; revisionInstruction?: string; taskId?: string }): Promise<StreamStartResult> {
    return (
      window.windowAPI?.startViralDirectorProductStream?.(payload).then((result) => ({
        ...result,
        taskId: typeof result.taskId === 'string' ? result.taskId : payload.taskId,
      })) ?? Promise.resolve({ ok: false, error: '脚本后端不可用' })
    )
  },

  cancelStream(payload: { taskId: string }): Promise<{ ok: boolean; error?: string }> {
    return window.windowAPI?.cancelViralDirectorStream?.(payload) ?? Promise.resolve({ ok: true })
  },

  onStreamEvent(callback: (event: ViralDirectorStreamEvent) => void): () => void {
    return window.windowAPI?.onViralDirectorStreamEvent?.((message) => {
      const event = message as ViralDirectorStreamEvent
      if (event?.taskId && event?.type) callback(event)
    }) ?? (() => {})
  },

  analyzeFromVideoLink(payload: { url: string; revisionInstruction?: string }): Promise<ScriptPackageResult> {
    return (
      window.windowAPI?.analyzeViralDirectorFromVideoLink?.(payload).then((result) => ({
        ...result,
        scriptPackage: result.scriptPackage as ScriptPackage | undefined,
      })) ?? Promise.resolve({ ok: false, error: '脚本后端不可用' })
    )
  },

  analyzeFromUpload(payload: {
    fileName: string
    mimeType?: string
    bytes: number[] | Uint8Array
  }): Promise<ScriptPackageResult> {
    return (
      window.windowAPI?.analyzeViralDirectorFromUpload?.(payload).then((result) => ({
        ...result,
        scriptPackage: result.scriptPackage as ScriptPackage | undefined,
      })) ?? Promise.resolve({ ok: false, error: '脚本后端不可用' })
    )
  },

  saveScript(payload: { scriptPackage: ScriptPackage }): Promise<SaveScriptResult> {
    return (
      window.windowAPI?.saveViralDirectorScript?.(payload).then((result) => ({
        ...result,
        scriptPackage: result.scriptPackage as ScriptPackage | undefined,
        scripts: (result.scripts ?? []) as ScriptPackage[],
      })) ?? Promise.resolve({ ok: false, error: '脚本后端不可用' })
    )
  },

  deleteScript(payload: { scriptId: string }): Promise<ScriptListResult> {
    return (
      window.windowAPI?.deleteViralDirectorScript?.(payload).then((result) => ({
        ...result,
        scripts: (result.scripts ?? []) as ScriptPackage[],
      })) ?? Promise.resolve({ ok: false, error: '脚本后端不可用' })
    )
  },
}
