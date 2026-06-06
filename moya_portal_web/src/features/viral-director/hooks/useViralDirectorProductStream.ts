import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { notifyError } from '../../../ui/design-system'
import { viralDirectorClient, type ViralDirectorStreamEvent } from '../../../shared/clients/viral-director-client'
import type { ScriptPackage, ScriptStatus } from '../../../pages/viralDirectorModel'
import type { DirectorView } from '../types'
import {
  applyStreamingMeta,
  applyStreamingSegment,
  createStreamingProductPackage,
} from '../model/streaming-package'

type GenerateProductOptions = {
  clearCurrentPackage: boolean
  fallbackView: DirectorView
  revisionInstruction?: string
}

type PersistScriptPackage = (
  scriptPackage: ScriptPackage,
  status: ScriptStatus,
  options: { silent: boolean },
) => Promise<ScriptPackage | null>

export function useViralDirectorProductStream({
  persistScriptPackage,
  setCurrentPackage,
  setGeneratingBackView,
  setView,
}: {
  persistScriptPackage: PersistScriptPackage
  setCurrentPackage: Dispatch<SetStateAction<ScriptPackage | null>>
  setGeneratingBackView: Dispatch<SetStateAction<DirectorView>>
  setView: Dispatch<SetStateAction<DirectorView>>
}) {
  const [streamingPackage, setStreamingPackage] = useState<ScriptPackage | null>(null)
  const generationRequestIdRef = useRef(0)
  const activeStreamTaskIdRef = useRef<string | null>(null)
  const streamUnsubscribeRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    return () => {
      streamUnsubscribeRef.current?.()
      if (activeStreamTaskIdRef.current) {
        void viralDirectorClient.cancelStream({ taskId: activeStreamTaskIdRef.current })
      }
    }
  }, [])

  function cancelActiveStream() {
    const taskId = activeStreamTaskIdRef.current
    if (taskId) void viralDirectorClient.cancelStream({ taskId })
    activeStreamTaskIdRef.current = null
    streamUnsubscribeRef.current?.()
    streamUnsubscribeRef.current = null
    setStreamingPackage(null)
  }

  async function generateProductPreview(prompt: string, options: GenerateProductOptions) {
    const requestId = generationRequestIdRef.current + 1
    generationRequestIdRef.current = requestId
    const taskId = `viral_product_${Date.now()}_${requestId}`
    setGeneratingBackView(options.fallbackView)
    streamUnsubscribeRef.current?.()
    activeStreamTaskIdRef.current = taskId
    if (options.clearCurrentPackage) {
      setCurrentPackage(null)
    }
    setStreamingPackage(createStreamingProductPackage(prompt, options.revisionInstruction))
    setView('generating-preview')

    streamUnsubscribeRef.current = viralDirectorClient.onStreamEvent((event) => {
      void handleProductStreamEvent(event, taskId, requestId, options.fallbackView)
    })

    const streamStart = await viralDirectorClient.startProductStream({
      prompt,
      revisionInstruction: options.revisionInstruction,
      taskId,
    })
    if (generationRequestIdRef.current !== requestId) return
    if (streamStart.ok) return

    streamUnsubscribeRef.current?.()
    streamUnsubscribeRef.current = null
    activeStreamTaskIdRef.current = null
    await generateProductPreviewFallback(prompt, options, requestId)
  }

  async function generateProductPreviewFallback(
    prompt: string,
    options: GenerateProductOptions,
    requestId: number,
  ) {
    const result = await viralDirectorClient.generateFromProduct({
      prompt,
      revisionInstruction: options.revisionInstruction,
    })
    if (generationRequestIdRef.current !== requestId) return
    if (!result.ok || !result.scriptPackage) {
      notifyError(result.error || '脚本生成失败')
      setStreamingPackage(null)
      setView(options.fallbackView)
      return
    }
    const draftPackage = await persistScriptPackage(result.scriptPackage, 'draft', { silent: true })
    if (generationRequestIdRef.current !== requestId) return
    setStreamingPackage(null)
    setCurrentPackage(draftPackage)
    setView('preview')
  }

  async function handleProductStreamEvent(
    event: ViralDirectorStreamEvent,
    taskId: string,
    requestId: number,
    fallbackView: DirectorView,
  ) {
    if (event.taskId !== taskId || activeStreamTaskIdRef.current !== taskId) return
    if (generationRequestIdRef.current !== requestId) return

    if (event.type === 'meta') {
      setStreamingPackage((current) => applyStreamingMeta(current, event.patch))
      return
    }

    if (event.type === 'segment') {
      setStreamingPackage((current) => applyStreamingSegment(current, event.index, event.segment))
      return
    }

    if (event.type === 'error') {
      streamUnsubscribeRef.current?.()
      streamUnsubscribeRef.current = null
      activeStreamTaskIdRef.current = null
      setStreamingPackage(null)
      notifyError(event.error || '脚本生成失败')
      setView(fallbackView)
      return
    }

    if (event.type === 'done') {
      streamUnsubscribeRef.current?.()
      streamUnsubscribeRef.current = null
      activeStreamTaskIdRef.current = null
      const draftPackage = await persistScriptPackage(event.scriptPackage, 'draft', { silent: true })
      if (generationRequestIdRef.current !== requestId) return
      setStreamingPackage(null)
      setCurrentPackage(draftPackage)
      setView('preview')
    }
  }

  return {
    cancelActiveStream,
    generateProductPreview,
    streamingPackage,
  }
}
