const fs = require('fs')
const path = require('path')
const os = require('os')
const { randomUUID, createHmac, createHash } = require('crypto')
const { spawn } = require('child_process')
let ffmpegStaticPath = ''
try {
  ffmpegStaticPath = require('ffmpeg-static') || ''
} catch {}
const {
  viralDirectorStateFile,
  viralDirectorUploadDir,
} = require('./viral-director-paths.cjs')

const DEFAULT_LANGUAGE = '中文'
const DEFAULT_TONE = ['直接', '利落']
const DEFAULT_AUDIO_CONFIG = {
  voiceMode: 'none',
  voiceName: '',
  speed: 1,
  emotion: '自然',
  accent: '普通话',
  pauseHints: [],
  bgmSuggestion: '',
}
const PEER_SIGN_SERVICE = 'https://asrtools-update.bkfeng.top/sign'
const BCUT_API_BASE = 'https://member.bilibili.com/x/bcut/rubick-interface'
const JIANYING_API_BASE = 'https://lv-pc-api-sinfonlinec.ulikecam.com'
const KUAISHOU_ASR_API = 'https://ai.kuaishou.com/api/effects/subtitle_generate'

function createViralDirectorBackend({ app, ipcMain, services = {} }) {
  const stateApi = createStateApi(app)
  const runtimeServices = createServices(services)

  ipcMain.handle('viral-director:list', async () => ({
    ok: true,
    scripts: stateApi.list(),
  }))

  ipcMain.handle('viral-director:generate-product', async (_event, payload) => {
    const prompt = typeof payload?.prompt === 'string' ? payload.prompt.trim() : ''
    const revisionInstruction = typeof payload?.revisionInstruction === 'string' ? payload.revisionInstruction.trim() : ''
    if (!prompt) return { ok: false, error: '请输入产品或服务描述' }
    try {
      const scriptPackage = await runtimeServices.generateFromProduct(prompt, revisionInstruction)
      return { ok: true, scriptPackage }
    } catch (error) {
      return { ok: false, error: toErrorMessage(error, '产品脚本生成失败') }
    }
  })

  ipcMain.handle('viral-director:analyze-video-link', async (_event, payload) => {
    const url = typeof payload?.url === 'string' ? payload.url.trim() : ''
    const revisionInstruction = typeof payload?.revisionInstruction === 'string' ? payload.revisionInstruction.trim() : ''
    if (!url) return { ok: false, error: '请输入视频链接' }
    try {
      const scriptPackage = await runtimeServices.generateFromVideoLink(url, revisionInstruction)
      return { ok: true, scriptPackage }
    } catch (error) {
      return { ok: false, error: toErrorMessage(error, '视频链接解析失败') }
    }
  })

  ipcMain.handle('viral-director:analyze-upload', async (_event, payload) => {
    const fileName = typeof payload?.fileName === 'string' ? payload.fileName.trim() : ''
    const bytes = normalizeUploadBytes(payload?.bytes)
    if (!fileName || bytes.length === 0) return { ok: false, error: '请上传有效视频文件' }

    try {
      const storedPath = persistUpload(app, { fileName, bytes })
      const scriptPackage = await runtimeServices.generateFromUpload({
        storedPath,
        fileName,
        mimeType: typeof payload?.mimeType === 'string' ? payload.mimeType : '',
      })
      return {
        ok: true,
        scriptPackage,
        sourceFile: { fileName, storedPath },
      }
    } catch (error) {
      return { ok: false, error: toErrorMessage(error, '本地视频解析失败') }
    }
  })

  ipcMain.handle('viral-director:save-script', async (_event, payload) => {
    const scriptPackage = payload?.scriptPackage
    if (!scriptPackage?.directorScript?.scriptId) return { ok: false, error: '缺少脚本数据' }
    try {
      const saved = stateApi.upsert(scriptPackage)
      return { ok: true, scriptPackage: saved, scripts: stateApi.list() }
    } catch (error) {
      return { ok: false, error: toErrorMessage(error, '脚本保存失败') }
    }
  })

  ipcMain.handle('viral-director:delete-script', async (_event, payload) => {
    const scriptId = typeof payload?.scriptId === 'string' ? payload.scriptId.trim() : ''
    if (!scriptId) return { ok: false, error: '缺少脚本 ID' }
    try {
      stateApi.remove(scriptId)
      return { ok: true, scripts: stateApi.list() }
    } catch (error) {
      return { ok: false, error: toErrorMessage(error, '脚本删除失败') }
    }
  })

  return {
    close() {},
  }
}

function normalizeUploadBytes(value) {
  if (Array.isArray(value)) return value
  if (ArrayBuffer.isView(value)) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  return []
}

function createStateApi(app) {
  function readState() {
    const stateFile = viralDirectorStateFile(app)
    try {
      const parsed = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
      return Array.isArray(parsed?.scripts) ? parsed : { scripts: [] }
    } catch {
      return { scripts: [] }
    }
  }

  function writeState(state) {
    const stateFile = viralDirectorStateFile(app)
    fs.mkdirSync(path.dirname(stateFile), { recursive: true })
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf8')
  }

  return {
    list() {
      return readState().scripts
    },
    upsert(scriptPackage) {
      const current = readState()
      const nextScripts = current.scripts.some((item) => item?.directorScript?.scriptId === scriptPackage.directorScript.scriptId)
        ? current.scripts.map((item) =>
            item?.directorScript?.scriptId === scriptPackage.directorScript.scriptId ? scriptPackage : item,
          )
        : [scriptPackage, ...current.scripts]
      const nextState = { scripts: nextScripts }
      writeState(nextState)
      return scriptPackage
    },
    remove(scriptId) {
      const current = readState()
      writeState({
        scripts: current.scripts.filter((item) => item?.directorScript?.scriptId !== scriptId),
      })
    },
  }
}

function createServices(overrides) {
  let qwenConfigCache = null
  let linkConfigCache = null
  const getQwenConfig = () => {
    if (!qwenConfigCache) qwenConfigCache = resolveQwenConfig()
    return qwenConfigCache
  }
  const getLinkConfig = () => {
    if (!linkConfigCache) linkConfigCache = resolveLinkServiceConfig()
    return linkConfigCache
  }
  const generateJson = overrides.generateJson || ((systemPrompt, userPrompt) => runSingleCompletionJSON(getQwenConfig(), systemPrompt, userPrompt))
  const extractCopyFromLink = overrides.extractCopyFromLink || ((url) => extractCopyFromLinkService(getLinkConfig(), url))
  const transcribeUpload = overrides.transcribeUpload || ((input) => transcribeUploadViaPeerAsr(input))

  return {
    async generateFromProduct(prompt, revisionInstruction = '') {
      let modelOutput = {}
      try {
        modelOutput = await generateJson(PRODUCT_SYSTEM_PROMPT, buildProductUserPrompt(prompt, revisionInstruction))
      } catch (error) {
        modelOutput = { fallbackReason: toErrorMessage(error, 'AI 生成服务不可用') }
      }
      return buildProductScriptPackage(prompt, modelOutput, revisionInstruction)
    },
    async generateFromVideoLink(url, revisionInstruction = '') {
      let extracted
      try {
        extracted = await extractCopyFromLink(url)
      } catch (error) {
        extracted = fallbackLinkExtraction(url, error)
      }
      let modelOutput = {}
      try {
        modelOutput = await generateJson(REFERENCE_SYSTEM_PROMPT, buildReferenceUserPrompt(extracted, revisionInstruction))
      } catch (error) {
        modelOutput = { fallbackReason: toErrorMessage(error, 'AI 生成服务不可用') }
      }
      return buildReferenceScriptPackage({
        mode: 'link',
        sourceInput: url,
        sourceTitle: extracted.title || '参考视频',
        sourceText: extracted.text || '',
        sourceUrl: extracted.sourceUrl || url,
        durationSec: 59,
        revisionInstruction,
      }, modelOutput)
    },
    async generateFromUpload(input) {
      let extracted
      try {
        extracted = await transcribeUpload(input)
      } catch (error) {
        extracted = fallbackUploadExtraction(input, error)
      }
      let modelOutput = {}
      try {
        modelOutput = await generateJson(REFERENCE_SYSTEM_PROMPT, buildReferenceUserPrompt(extracted))
      } catch (error) {
        modelOutput = { fallbackReason: toErrorMessage(error, 'AI 生成服务不可用') }
      }
      return buildReferenceScriptPackage({
        mode: 'upload',
        sourceInput: input.storedPath,
        sourceTitle: extracted.title || input.fileName,
        sourceText: extracted.text || '',
        sourceUrl: input.storedPath,
        durationSec: extracted.durationSec || 59,
      }, modelOutput)
    },
  }
}

function fallbackLinkExtraction(url, error) {
  const message = toErrorMessage(error, '外部链接解析不可用')
  return {
    platform: detectLinkPlatform(url),
    title: '参考视频链接',
    text: [
      `外部链接解析不可用：${message}`,
      '请基于该链接生成一版基础参考脚本，并在风险提示中提醒用户需要人工复核原视频内容。',
    ].join('\n'),
    sourceUrl: url,
    fallbackReason: message,
  }
}

function fallbackUploadExtraction(input, error) {
  const message = toErrorMessage(error, '本地视频转文案不可用')
  const title = path.parse(input.fileName || '').name || '本地上传视频'
  return {
    title,
    text: [
      `本地视频转文案不可用：${message}`,
      `文件名：${input.fileName || title}`,
      '请基于文件名生成一版基础参考脚本，并在风险提示中提醒用户需要人工复核原视频内容。',
    ].join('\n'),
    sourceUrl: input.storedPath,
    durationSec: 59,
    platform: 'upload',
    fallbackReason: message,
  }
}

function resolveQwenConfig() {
  const fromEnv = process.env.DASHSCOPE_API_KEY?.trim()
  const fallback = parseLegacyQwenConfig()
  const apiKey = fromEnv || fallback.apiKey || ''
  if (!apiKey) {
    throw new Error('缺少 DashScope API Key，请设置 DASHSCOPE_API_KEY 或确保 V1 配置可读取')
  }
  return {
    apiKey,
    baseUrl: process.env.DASHSCOPE_BASE_URL?.trim() || fallback.baseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: process.env.DASHSCOPE_MODEL?.trim() || fallback.model || 'qwen3.6-plus',
  }
}

function parseLegacyQwenConfig() {
  const legacyQwenFile = path.join(resolveLegacyV1Root(), 'src', 'main', 'clone-article', 'llm.ts')
  try {
    const source = fs.readFileSync(legacyQwenFile, 'utf8')
    return {
      apiKey: matchSingleQuotedConst(source, 'DASHSCOPE_API_KEY'),
      baseUrl: matchSingleQuotedConst(source, 'DASHSCOPE_BASE_URL'),
      model: matchSingleQuotedConst(source, 'BUILTIN_MODEL_ID'),
    }
  } catch {
    return {}
  }
}

function resolveLinkServiceConfig() {
  const legacyLinkServiceFile = path.join(resolveLegacyV1Root(), 'src', 'main', 'copy-extract', 'link-draft-service.ts')
  try {
    const source = fs.readFileSync(legacyLinkServiceFile, 'utf8')
    return {
      douyinApiBase: matchSingleQuotedConst(source, 'DOUYIN_API_BASE') || 'http://www.moya888.com:8000',
      xhsApiBase: matchSingleQuotedConst(source, 'XHS_API_BASE') || 'http://www.moya888.com:8888',
    }
  } catch {
    return {
      douyinApiBase: 'http://www.moya888.com:8000',
      xhsApiBase: 'http://www.moya888.com:8888',
    }
  }
}

function resolveLegacyV1Root() {
  const candidates = [
    path.resolve(__dirname, '..', '..', '..', 'moyaclawV1.0'),
    path.resolve(__dirname, '..', '..', '..', '..', 'moyaclawV1.0'),
    path.resolve(process.cwd(), '..', '..', 'moyaclawV1.0'),
    path.resolve(process.cwd(), '..', 'moyaclawV1.0'),
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }

  return candidates[0]
}

function matchSingleQuotedConst(source, name) {
  const pattern = new RegExp(`const\\s+${name}\\s*=\\s*'([^']+)'`)
  const match = source.match(pattern)
  return match?.[1]?.trim() || ''
}

async function runSingleCompletionJSON(config, systemPrompt, userPrompt) {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.4,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
    signal: AbortSignal.timeout(120_000),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Qwen 请求失败 ${response.status}: ${text.slice(0, 300)}`)
  }

  const payload = await response.json()
  const content = payload?.choices?.[0]?.message?.content || ''
  return JSON.parse(stripJsonText(content))
}

function stripJsonText(text) {
  let value = String(text || '').trim()
  if (value.startsWith('```')) {
    value = value.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  }
  const firstObject = value.indexOf('{')
  const firstArray = value.indexOf('[')
  let start = -1
  if (firstObject === -1) start = firstArray
  else if (firstArray === -1) start = firstObject
  else start = Math.min(firstObject, firstArray)
  if (start === -1) return value
  const open = value[start]
  const close = open === '[' ? ']' : '}'
  const end = value.lastIndexOf(close)
  if (end <= start) return value
  return value.slice(start, end + 1)
}

async function extractCopyFromLinkService(config, link) {
  const platform = detectLinkPlatform(link)
  if (platform === 'douyin') {
    const data = await apiPost(config.douyinApiBase, '/api/douyin/extract-text', { share_link: link })
    const title = safeString(data.title)
    const text = safeString(data.text)
    if (!title && !text) throw new Error('接口已返回响应，但没有提取到可用文案')
    return {
      platform,
      title,
      text,
      sourceUrl: safeString(data.video_url) || link,
    }
  }
  if (platform === 'xiaohongshu') {
    const data = await apiPost(config.xhsApiBase, '/api/xiaohongshu/note-info', { url: link })
    const title = safeString(data['笔记标题'])
    const text = safeString(data.videoText) || safeString(data['笔记内容'])
    if (!title && !text) throw new Error('接口已返回响应，但没有提取到可用文案')
    return {
      platform,
      title,
      text,
      sourceUrl: safeString(data['笔记链接']) || link,
    }
  }
  throw new Error('暂不支持该链接，当前仅支持抖音和小红书链接')
}

async function apiPost(baseUrl, apiPath, body) {
  const response = await fetch(`${String(baseUrl || '').replace(/\/+$/, '')}${apiPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`链接解析请求失败 ${response.status}: ${text.slice(0, 300)}`)
  }
  return response.json()
}

async function transcribeUploadViaPeerAsr(input) {
  const prepared = await prepareUploadAudio(input)
  const errors = []

  try {
    for (const runner of [runBcutTranscription, runJianYingTranscription, runKuaiShouTranscription]) {
      try {
        const result = await runner(prepared)
        return {
          title: path.parse(input.fileName).name || '本地上传视频',
          text: result.text,
          sourceUrl: input.storedPath,
          durationSec: result.durationSec || 59,
          platform: 'upload',
          transcriptEngine: result.engine,
        }
      } catch (error) {
        errors.push(`${runner.name}: ${toErrorMessage(error, '调用失败')}`)
      }
    }
  } finally {
    prepared.cleanup()
  }

  throw new Error(`本地视频转文案失败：${errors.join(' | ')}`)
}

async function prepareUploadAudio(input) {
  const originalPath = input.storedPath
  const ext = path.extname(originalPath).toLowerCase()
  if (ext === '.mp3') {
    return {
      audioPath: originalPath,
      buffer: fs.readFileSync(originalPath),
      cleanup() {},
    }
  }

  const tempPath = path.join(os.tmpdir(), `viral-upload-${randomUUID()}.mp3`)
  await runFfmpegExtract(originalPath, tempPath)
  return {
    audioPath: tempPath,
    buffer: fs.readFileSync(tempPath),
    cleanup() {
      try {
        fs.unlinkSync(tempPath)
      } catch {}
    },
  }
}

async function runFfmpegExtract(inputPath, outputPath) {
  await new Promise((resolve, reject) => {
    const ffmpegBin = ffmpegStaticPath || 'ffmpeg'
    const child = spawn(
      ffmpegBin,
      ['-y', '-i', inputPath, '-ac', '1', '-f', 'mp3', '-af', 'aresample=async=1', outputPath],
      { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] },
    )
    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0 && fs.existsSync(outputPath)) {
        resolve()
        return
      }
      reject(new Error(`ffmpeg 抽音频失败: ${stderr.trim().slice(-400)}`))
    })
  })
}

async function runBcutTranscription(prepared) {
  const uploadApply = await fetchJson(`${BCUT_API_BASE}/resource/create`, {
    method: 'POST',
    headers: bcutJsonHeaders(),
    body: JSON.stringify({
      type: 2,
      name: 'audio.mp3',
      size: prepared.buffer.length,
      ResourceFileType: 'mp3',
      model_id: '8',
    }),
    signal: AbortSignal.timeout(60_000),
  })

  const uploadData = uploadApply?.data
  const uploadUrls = Array.isArray(uploadData?.upload_urls) ? uploadData.upload_urls : []
  if (!uploadData || !uploadUrls.length) {
    throw new Error('必剪申请上传失败：缺少 upload_urls')
  }

  const etags = []
  const perSize = Number(uploadData.per_size) || prepared.buffer.length
  for (let index = 0; index < uploadUrls.length; index += 1) {
    const start = index * perSize
    const end = Math.min(prepared.buffer.length, start + perSize)
    const partBuffer = prepared.buffer.subarray(start, end)
    const response = await fetch(uploadUrls[index], {
      method: 'PUT',
      headers: bcutJsonHeaders(),
      body: partBuffer,
      signal: AbortSignal.timeout(120_000),
    })
    if (!response.ok) throw new Error(`必剪上传分片失败 ${response.status}`)
    etags.push(response.headers.get('Etag') || response.headers.get('etag') || '')
  }

  const commitData = await fetchJson(`${BCUT_API_BASE}/resource/create/complete`, {
    method: 'POST',
    headers: bcutJsonHeaders(),
    body: JSON.stringify({
      InBossKey: uploadData.in_boss_key,
      ResourceId: uploadData.resource_id,
      Etags: etags.filter(Boolean).join(','),
      UploadId: uploadData.upload_id,
      model_id: '8',
    }),
    signal: AbortSignal.timeout(60_000),
  })

  const downloadUrl = safeString(commitData?.data?.download_url)
  if (!downloadUrl) throw new Error('必剪提交上传失败：缺少 download_url')

  const taskData = await fetchJson(`${BCUT_API_BASE}/task`, {
    method: 'POST',
    headers: bcutJsonHeaders(),
    body: JSON.stringify({
      resource: downloadUrl,
      model_id: '8',
    }),
    signal: AbortSignal.timeout(60_000),
  })
  const taskId = safeString(taskData?.data?.task_id)
  if (!taskId) throw new Error('必剪创建任务失败：缺少 task_id')

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const poll = await fetchJson(`${BCUT_API_BASE}/task/result?model_id=7&task_id=${encodeURIComponent(taskId)}`, {
      method: 'GET',
      headers: bcutJsonHeaders(),
      signal: AbortSignal.timeout(60_000),
    })
    const data = poll?.data
    if (Number(data?.state) === 4) {
      const resultJson = typeof data?.result === 'string' ? JSON.parse(data.result) : data?.result
      const utterances = Array.isArray(resultJson?.utterances) ? resultJson.utterances : []
      const text = utterances.map((item) => safeString(item?.transcript)).filter(Boolean).join(' ')
      const maxEnd = utterances.reduce((acc, item) => Math.max(acc, Number(item?.end_time) || 0), 0)
      if (!text) throw new Error('必剪返回成功但无可用文案')
      return {
        engine: 'bcut',
        text,
        durationSec: maxEnd > 0 ? Math.max(1, Math.round(maxEnd / 1000)) : 59,
      }
    }
    await sleep(1000)
  }

  throw new Error('必剪转写超时')
}

function bcutJsonHeaders() {
  return {
    'User-Agent': 'Bilibili/1.0.0 (https://www.bilibili.com)',
    'Content-Type': 'application/json',
  }
}

async function runJianYingTranscription(prepared) {
  const crc32Hex = crc32HexFromBuffer(prepared.buffer)
  const tdid = '3943278516897751'

  const signInfo = await getJianYingSign('/lv/v1/upload_sign', tdid)
  const uploadSign = await fetchJson(`${JIANYING_API_BASE}/lv/v1/upload_sign`, {
    method: 'POST',
    headers: buildJianYingHeaders(signInfo.deviceTime, signInfo.sign, tdid),
    body: JSON.stringify({ biz: 'pc-recognition' }),
    signal: AbortSignal.timeout(60_000),
  })
  const credentials = uploadSign?.data
  if (!credentials?.access_key_id || !credentials?.secret_access_key || !credentials?.session_token) {
    throw new Error('剪映上传签名失败：凭证缺失')
  }

  const auth = await requestJianYingUploadAuth({
    accessKey: credentials.access_key_id,
    secretKey: credentials.secret_access_key,
    sessionToken: credentials.session_token,
    fileSize: prepared.buffer.length,
  })

  const uploadHeaders = {
    'User-Agent': 'Mozilla/5.0',
    Authorization: auth.auth,
    'Content-CRC32': crc32Hex,
  }
  const uploadUrl = `https://${auth.uploadHost}/${auth.storeUri}?partNumber=1&uploadID=${encodeURIComponent(auth.uploadId)}`
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: uploadHeaders,
    body: prepared.buffer,
    signal: AbortSignal.timeout(120_000),
  })
  const uploadPayload = await uploadRes.json().catch(() => null)
  if (!uploadRes.ok || Number(uploadPayload?.success) !== 0) {
    throw new Error(`剪映上传失败 ${uploadRes.status}`)
  }

  const checkUrl = `https://${auth.uploadHost}/${auth.storeUri}?uploadID=${encodeURIComponent(auth.uploadId)}`
  const checkRes = await fetch(checkUrl, {
    method: 'POST',
    headers: uploadHeaders,
    body: `1:${crc32Hex}`,
    signal: AbortSignal.timeout(60_000),
  })
  if (!checkRes.ok) throw new Error(`剪映校验上传失败 ${checkRes.status}`)
  await checkRes.json().catch(() => null)

  const commitUrl = `https://${auth.uploadHost}/${auth.storeUri}?uploadID=${encodeURIComponent(auth.uploadId)}&partNumber=1&x-amz-security-token=${encodeURIComponent(credentials.session_token)}`
  const commitRes = await fetch(commitUrl, {
    method: 'PUT',
    headers: uploadHeaders,
    body: prepared.buffer,
    signal: AbortSignal.timeout(120_000),
  })
  await commitRes.text().catch(() => '')

  const submitSign = await getJianYingSign('/lv/v1/audio_subtitle/submit', tdid)
  const submitData = await fetchJson(`${JIANYING_API_BASE}/lv/v1/audio_subtitle/submit`, {
    method: 'POST',
    headers: buildJianYingHeaders(submitSign.deviceTime, submitSign.sign, tdid),
    body: JSON.stringify({
      adjust_endtime: 200,
      audio: auth.storeUri,
      caption_type: 2,
      client_request_id: randomUUID(),
      max_lines: 1,
      songs_info: [{ end_time: 6000, id: '', start_time: 0 }],
      words_per_line: 16,
    }),
    signal: AbortSignal.timeout(60_000),
  })
  const queryId = safeString(submitData?.data?.id)
  if (!queryId) throw new Error('剪映提交任务失败：缺少 id')

  const querySign = await getJianYingSign('/lv/v1/audio_subtitle/query', tdid)
  const queryData = await fetchJson(`${JIANYING_API_BASE}/lv/v1/audio_subtitle/query`, {
    method: 'POST',
    headers: buildJianYingHeaders(querySign.deviceTime, querySign.sign, tdid),
    body: JSON.stringify({
      id: queryId,
      pack_options: { need_attribute: true },
    }),
    signal: AbortSignal.timeout(60_000),
  })

  const utterances = Array.isArray(queryData?.data?.utterances) ? queryData.data.utterances : []
  const text = utterances.map((item) => safeString(item?.text)).filter(Boolean).join(' ')
  const maxEnd = utterances.reduce((acc, item) => Math.max(acc, Number(item?.end_time) || 0), 0)
  if (!text) throw new Error('剪映返回成功但无可用文案')
  return {
    engine: 'jianying',
    text,
    durationSec: maxEnd > 0 ? Math.max(1, Math.round(maxEnd / 1000)) : 59,
  }
}

async function getJianYingSign(apiPath, tdid) {
  const currentTime = String(Math.floor(Date.now() / 1000))
  const response = await fetchJson(PEER_SIGN_SERVICE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: apiPath,
      current_time: currentTime,
      pf: '4',
      appvr: '4.0.0',
      tdid,
    }),
    signal: AbortSignal.timeout(60_000),
  })
  const sign = safeString(response?.sign).toLowerCase()
  if (!sign) throw new Error('剪映签名服务未返回 sign')
  return { sign, deviceTime: currentTime }
}

function buildJianYingHeaders(deviceTime, sign, tdid) {
  return {
    'User-Agent': 'Cronet/TTNetVersion:01594da2 2023-03-14 QuicVersion:46688bb4 2022-11-28',
    appvr: '4.0.0',
    'device-time': String(deviceTime),
    pf: '4',
    sign,
    'sign-ver': '1',
    tdid,
    'Content-Type': 'application/json',
  }
}

async function requestJianYingUploadAuth({ accessKey, secretKey, sessionToken, fileSize }) {
  const requestParameters =
    `Action=ApplyUploadInner&FileSize=${fileSize}&FileType=object&IsInner=1&SpaceName=lv-mac-recognition&Version=2020-11-19&s=5y0udbjapi`
  const amzDate = toAmzDate(new Date())
  const dateStamp = amzDate.slice(0, 8)
  const headers = {
    'x-amz-date': amzDate,
    'x-amz-security-token': sessionToken,
  }
  const signature = awsSignature(secretKey, requestParameters, headers, 'GET', '', 'cn', 'vod')
  headers.authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKey}/${dateStamp}/cn/vod/aws4_request, ` +
    `SignedHeaders=x-amz-date;x-amz-security-token, Signature=${signature}`

  const response = await fetchJson(`https://vod.bytedanceapi.com/?${requestParameters}`, {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(60_000),
  })
  const storeInfo = response?.Result?.UploadAddress?.StoreInfos?.[0]
  const uploadHost = response?.Result?.UploadAddress?.UploadHosts?.[0]
  if (!storeInfo?.StoreUri || !storeInfo?.Auth || !storeInfo?.UploadID || !uploadHost) {
    throw new Error('剪映上传鉴权失败：缺少上传信息')
  }
  return {
    storeUri: storeInfo.StoreUri,
    auth: storeInfo.Auth,
    uploadId: storeInfo.UploadID,
    uploadHost,
  }
}

function toAmzDate(date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '')
}

function awsSignature(secretKey, requestParameters, headers, method = 'GET', payload = '', region = 'cn', service = 'vod') {
  const amzDate = headers['x-amz-date']
  const dateStamp = amzDate.slice(0, 8)
  const canonicalHeaders =
    `x-amz-date:${headers['x-amz-date']}\n` +
    `x-amz-security-token:${headers['x-amz-security-token']}\n`
  const signedHeaders = 'x-amz-date;x-amz-security-token'
  const canonicalRequest = [
    method,
    '/',
    requestParameters,
    canonicalHeaders,
    signedHeaders,
    sha256Hex(payload),
  ].join('\n')
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    `${dateStamp}/${region}/${service}/aws4_request`,
    sha256Hex(canonicalRequest),
  ].join('\n')
  const signingKey = getSignatureKey(secretKey, dateStamp, region, service)
  return createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex')
}

function getSignatureKey(secretKey, dateStamp, regionName, serviceName) {
  const kDate = hmacBuffer(Buffer.from(`AWS4${secretKey}`, 'utf8'), dateStamp)
  const kRegion = hmacBuffer(kDate, regionName)
  const kService = hmacBuffer(kRegion, serviceName)
  return hmacBuffer(kService, 'aws4_request')
}

function hmacBuffer(key, msg) {
  return createHmac('sha256', key).update(String(msg), 'utf8').digest()
}

function sha256Hex(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex')
}

async function runKuaiShouTranscription(prepared) {
  const form = new FormData()
  form.append('typeId', '1')
  form.append('file', new Blob([prepared.buffer], { type: 'audio/mpeg' }), 'audio.mp3')

  const response = await fetch(KUAISHOU_ASR_API, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(120_000),
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`快手接口失败 ${response.status}: ${text.slice(0, 200)}`)
  }
  const payload = await response.json()
  const items = Array.isArray(payload?.data?.text) ? payload.data.text : []
  const text = items.map((item) => safeString(item?.text)).filter(Boolean).join(' ')
  const maxEnd = items.reduce((acc, item) => Math.max(acc, Number(item?.end_time) || 0), 0)
  if (!text) throw new Error('快手返回成功但无可用文案')
  return {
    engine: 'kuaishou',
    text,
    durationSec: maxEnd > 0 ? Math.max(1, Math.round(maxEnd / 1000)) : 59,
  }
}

async function fetchJson(url, options) {
  const response = await fetch(url, options)
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`请求失败 ${response.status}: ${text.slice(0, 300)}`)
  }
  return response.json()
}

function crc32HexFromBuffer(buffer) {
  let crc = 0 ^ -1
  for (let i = 0; i < buffer.length; i += 1) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ buffer[i]) & 0xff]
  }
  return ((crc ^ -1) >>> 0).toString(16).padStart(8, '0')
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    }
    table[n] = c >>> 0
  }
  return table
})()

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function persistUpload(app, payload) {
  const buffer = Buffer.from(payload.bytes || [])
  const uploadDir = viralDirectorUploadDir(app)
  fs.mkdirSync(uploadDir, { recursive: true })
  const fileName = sanitizeFileName(payload.fileName)
  const storedPath = path.join(uploadDir, `${Date.now()}-${randomUUID()}-${fileName}`)
  fs.writeFileSync(storedPath, buffer)
  return storedPath
}

function sanitizeFileName(fileName) {
  return String(fileName || 'upload.mp4').replace(/[\\/:*?"<>|]+/g, '_')
}

function buildProductUserPrompt(prompt, revisionInstruction = '') {
  return [
    '根据以下产品描述生成结构化脚本分析和镜头段落脚本。',
    '产品描述：',
    prompt,
    ...(revisionInstruction ? ['本次调整要求：', revisionInstruction] : []),
    '请输出 JSON，不要输出额外说明。',
  ].join('\n')
}

function buildReferenceUserPrompt(extracted, revisionInstruction = '') {
  if (revisionInstruction) {
    extracted = {
      ...extracted,
      text: `${safeString(extracted.text) || ''}\n本次调整要求：\n${revisionInstruction}`,
    }
  }
  return [
    '根据以下参考视频提取结果，生成结构化视频分析和可编辑脚本。',
    `标题：${safeString(extracted.title) || '未命名参考视频'}`,
    `来源链接：${safeString(extracted.sourceUrl) || ''}`,
    '提取文案：',
    safeString(extracted.text) || '无可用文案',
    '请输出 JSON，不要输出额外说明。',
  ].join('\n')
}

const PRODUCT_SYSTEM_PROMPT = [
  '你是短视频编导策划助手。',
  '输出一个 JSON 对象，字段必须包含：',
  'headline, sellingPointSummary, audienceSummary, styleSummary, recommendedAngles, recommendedGroups, riskNotes, title, productName, targetAudience, platform, style, tone, objective, tags, segments。',
  'segments 是数组，每个元素必须包含：groupLabel, segmentTitle, durationSec, visualDescription, voiceoverText, onscreenText, shotType, subject, goal, transition, generationNotes, complianceNotes。',
  '所有文本用中文。',
].join('\n')

const REFERENCE_SYSTEM_PROMPT = [
  '你是短视频拆解与仿写编导助手。',
  '输出一个 JSON 对象，字段必须包含：',
  'videoTitle, durationLabel, language, uploadedAt, productName, sellingPoints, targetAudience, audienceAnalysis, structureSummary, riskNotes, title, platform, style, tone, objective, tags, segments。',
  'segments 是数组，每个元素必须包含：groupLabel, segmentTitle, startSec, endSec, durationSec, visualDescription, voiceoverText, onscreenText, shotType, subject, goal, transition, generationNotes, complianceNotes。',
  '所有文本用中文。',
].join('\n')

function buildProductScriptPackage(prompt, modelOutput, revisionInstruction = '') {
  const now = new Date().toISOString()
  const normalizedSegments = normalizeDirectorSegments(modelOutput?.segments, 'product')
  const productName = safeString(modelOutput?.productName) || safeString(modelOutput?.title) || extractLeadingPhrase(prompt) || '未命名产品'
  return {
    sourcePayload: {
      sourceType: 'product_description',
      productInput: {
        productName,
        description: prompt,
        sellingPoints: toStringArray(modelOutput?.tags),
        targetAudience: toStringArray(modelOutput?.targetAudience),
        stylePreference: toStringArray(modelOutput?.style),
        platformPreference: toStringArray(modelOutput?.platform),
        extraRequirements: revisionInstruction,
      },
    },
    analysisArtifact: {
      analysisType: 'product_brief',
      headline: safeString(modelOutput?.headline) || `${productName}脚本方向已生成`,
      sellingPointSummary: safeString(modelOutput?.sellingPointSummary) || joinText(toStringArray(modelOutput?.tags), '待补充卖点'),
      audienceSummary: safeString(modelOutput?.audienceSummary) || joinText(toStringArray(modelOutput?.targetAudience), '待补充人群'),
      styleSummary: safeString(modelOutput?.styleSummary) || joinText(toStringArray(modelOutput?.style), '口播带货'),
      recommendedAngles: toStringArray(modelOutput?.recommendedAngles).slice(0, 4),
      recommendedGroups: toStringArray(modelOutput?.recommendedGroups).slice(0, 6),
      riskNotes: toStringArray(modelOutput?.riskNotes).slice(0, 4),
    },
    directorScript: {
      scriptId: `viral_script_${randomUUID()}`,
      version: 1,
      title: safeString(modelOutput?.title) || `${productName}参考改写脚本`,
      status: 'draft',
      sourceType: 'product_description',
      analysisType: 'product_brief',
      productName,
      targetAudience: toStringArray(modelOutput?.targetAudience),
      platform: toStringArray(modelOutput?.platform),
      style: toStringArray(modelOutput?.style),
      tone: toStringArray(modelOutput?.tone).length ? toStringArray(modelOutput?.tone) : DEFAULT_TONE,
      language: DEFAULT_LANGUAGE,
      objective: safeString(modelOutput?.objective) || '生成一版可直接编辑和拍摄的镜头段落脚本',
      tags: toStringArray(modelOutput?.tags),
      createdAt: now,
      updatedAt: now,
      segments: normalizedSegments,
    },
  }
}

function buildReferenceScriptPackage(input, modelOutput) {
  const now = new Date().toISOString()
  const normalizedSegments = normalizeDirectorSegments(modelOutput?.segments, 'reference')
  const productName = safeString(modelOutput?.productName) || safeString(modelOutput?.title) || safeString(input.sourceTitle) || '参考视频脚本'
  return {
    sourcePayload: {
      sourceType: input.mode === 'upload' ? 'local_video' : 'video_link',
      videoInput: {
        mode: input.mode,
        url: input.sourceUrl,
        fileName: input.mode === 'upload' ? input.sourceTitle : '',
        durationSec: input.durationSec,
      },
    },
    analysisArtifact: {
      analysisType: 'reference_video',
      videoTitle: safeString(modelOutput?.videoTitle) || safeString(input.sourceTitle),
      videoSummary: {
        durationLabel: safeString(modelOutput?.durationLabel) || `${input.durationSec}s`,
        language: safeString(modelOutput?.language) || DEFAULT_LANGUAGE,
        uploadedAt: safeString(modelOutput?.uploadedAt) || now.slice(0, 19).replace('T', ' '),
        productName,
      },
      details: {
        sellingPoints: toStringArray(modelOutput?.sellingPoints),
        targetAudience: toStringArray(modelOutput?.targetAudience),
        audienceAnalysis: safeString(modelOutput?.audienceAnalysis) || '适合按当前参考内容的表达方式继续仿写。',
        structureSummary: toStringArray(modelOutput?.structureSummary),
      },
      segments: normalizedSegments.map((segment) => ({
        segmentId: segment.segmentId,
        groupLabel: segment.groupLabel,
        segmentTitle: segment.segmentTitle,
        visualDescription: segment.visualDescription,
        voiceoverText: segment.voiceoverText,
        startSec: Number(segment.startSec || 0),
        endSec: Number(segment.endSec || Number(segment.durationSec || 0)),
      })),
      riskNotes: toStringArray(modelOutput?.riskNotes),
    },
    directorScript: {
      scriptId: `viral_script_${randomUUID()}`,
      version: 1,
      title: safeString(modelOutput?.title) || `${productName}参考改写脚本`,
      status: 'draft',
      sourceType: input.mode === 'upload' ? 'local_video' : 'video_link',
      analysisType: 'reference_video',
      productName,
      targetAudience: toStringArray(modelOutput?.targetAudience),
      platform: toStringArray(modelOutput?.platform),
      style: toStringArray(modelOutput?.style),
      tone: toStringArray(modelOutput?.tone).length ? toStringArray(modelOutput?.tone) : DEFAULT_TONE,
      language: DEFAULT_LANGUAGE,
      objective: safeString(modelOutput?.objective) || '基于参考内容生成一版可直接编辑的编导脚本',
      tags: toStringArray(modelOutput?.tags),
      createdAt: now,
      updatedAt: now,
      segments: normalizedSegments,
    },
  }
}

function normalizeDirectorSegments(rawSegments, mode) {
  const items = Array.isArray(rawSegments) && rawSegments.length ? rawSegments : fallbackSegments(mode)
  let cursor = 0
  return items.map((item, index) => {
    const durationSec = sanitizeDuration(item?.durationSec, 5)
    const startSec = sanitizeDuration(item?.startSec, cursor)
    const endSec = Math.max(startSec + 1, sanitizeDuration(item?.endSec, startSec + durationSec))
    cursor = endSec
    return {
      segmentId: `seg_${randomUUID()}`,
      groupLabel: safeString(item?.groupLabel) || `结构 ${index + 1}`,
      segmentTitle: safeString(item?.segmentTitle) || `镜头 ${index + 1}`,
      durationSec: Math.max(1, durationSec),
      visualDescription: safeString(item?.visualDescription) || '补充该镜头的画面描述',
      voiceoverText: safeString(item?.voiceoverText) || '补充该镜头的口播内容',
      onscreenText: safeString(item?.onscreenText) || safeString(item?.segmentTitle) || `镜头 ${index + 1}`,
      shotType: safeString(item?.shotType) || '人物近景',
      subject: safeString(item?.subject) || '人物+产品',
      goal: safeString(item?.goal) || '完成当前镜头的信息表达',
      assetRefs: [],
      audioConfig: { ...DEFAULT_AUDIO_CONFIG },
      transition: safeString(item?.transition) || 'cut',
      generationNotes: safeString(item?.generationNotes) || '',
      complianceNotes: safeString(item?.complianceNotes) || '',
      status: 'draft',
      startSec,
      endSec,
    }
  })
}

function fallbackSegments(mode) {
  if (mode === 'reference') {
    return [
      { groupLabel: '参考结构一', segmentTitle: '参考开场', durationSec: 4, visualDescription: '人物正面出镜，快速亮出产品和结果预期。', voiceoverText: '开场先用强利益点或者强痛点抓停留。', goal: '抓停留' },
      { groupLabel: '参考结构二', segmentTitle: '卖点展开', durationSec: 7, visualDescription: '产品特写、手部展示和字幕说明交替出现。', voiceoverText: '用简单语言解释为什么这个产品更适合目标用户。', goal: '解释卖点' },
      { groupLabel: '参考结构三', segmentTitle: '结果证明', durationSec: 6, visualDescription: '展示前后状态变化或结果画面对比。', voiceoverText: '结果必须可见、可理解、可转述。', goal: '建立信任' },
    ]
  }
  return [
    { groupLabel: '开场切入', segmentTitle: '痛点开场', durationSec: 4, visualDescription: '人物近景出镜，直接点出用户最常见的问题。', voiceoverText: '用一句话说明为什么用户应该继续看下去。', goal: '建立相关性' },
    { groupLabel: '卖点展开', segmentTitle: '核心卖点解释', durationSec: 7, visualDescription: '产品特写和使用动作切换，突出核心卖点。', voiceoverText: '用简短口语解释产品价值。', goal: '解释卖点' },
    { groupLabel: '结果呈现', segmentTitle: '场景化结果', durationSec: 6, visualDescription: '展示使用后的状态变化或结果。', voiceoverText: '让结果更直观、更容易复述。', goal: '建立信任' },
    { groupLabel: '行动转化', segmentTitle: '下单引导', durationSec: 5, visualDescription: '人物再次拿起产品并给出购买提示。', voiceoverText: '给出明确行动引导。', goal: '促转化' },
  ]
}

function extractLeadingPhrase(prompt) {
  return String(prompt || '').split(/[，。,、\n]/).map((item) => item.trim()).find(Boolean) || ''
}

function joinText(items, fallback) {
  return items.length ? items.join('、') : fallback
}

function safeString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function toStringArray(value) {
  if (!Array.isArray(value)) return []
  return value.map((item) => safeString(item)).filter(Boolean)
}

function sanitizeDuration(value, fallback) {
  const num = Number(value)
  return Number.isFinite(num) && num >= 0 ? Math.round(num) : fallback
}

function detectLinkPlatform(link) {
  const value = String(link || '').toLowerCase()
  if (value.includes('douyin.com') || value.includes('v.douyin.com') || value.includes('iesdouyin.com')) return 'douyin'
  if (value.includes('xiaohongshu.com') || value.includes('xhslink.com') || value.includes('xhs.cn')) return 'xiaohongshu'
  return 'unknown'
}

function toErrorMessage(error, fallback) {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error.trim()) return error.trim()
  return fallback
}

module.exports = {
  createViralDirectorBackend,
}
