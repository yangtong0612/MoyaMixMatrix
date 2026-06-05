import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import {
  Cloud,
  Download,
  Edit3,
  Film,
  HardDrive,
  Music,
  Pause,
  Play,
  Scissors,
  Sparkles,
  Trash2,
  Type,
  Upload,
  Volume2,
  WandSparkles,
  X
} from 'lucide-react';
import clsx from 'clsx';
import { buildDriveContentUrl, listDriveNodes, type DriveNodeView } from '@/features/cloud-drive/api/netdisk';
import { toMediaUrl } from '@/features/editor/mediaUrl';
import {
  getViralTemplateCardCopy,
  getViralTemplatePreviewClass,
  viralFontOptions,
  viralTemplateCards,
  viralTemplateThemeStyle,
  type ViralTemplateCard
} from '@/shared/viralTemplates';
import { subtitleTemplates, defaultSubtitleKeywords } from './subtitleTemplateData';
import { getSubtitleRecognitionJob, submitSubtitleRecognition, type SubtitleRecognitionJob } from './subtitleTemplateApi';
import {
  buildCaptionTranslation,
  buildOpeningTitle,
  buildOpeningTitleFromCaptions,
  buildSubtitleOverlay,
  extractSubtitleKeywords,
  formatClock
} from './subtitleTemplateRender';
import type {
  SubtitleTemplate,
  SubtitleCaptionEntrance,
  SubtitleTemplateCaption,
  SubtitleTemplateProcessingState,
  SubtitleTemplateSoundSettings,
  SubtitleTemplateStyleVars,
  SubtitleTemplateTab,
  SubtitleTemplateTextStyle
} from './subtitleTemplateTypes';
import './subtitleTemplate.css';

const recentTaskKey = 'subtitle-template:recent-tasks';
const captionEntranceOptions: Array<{ value: SubtitleCaptionEntrance; label: string }> = [
  { value: 'none', label: '无' },
  { value: 'blur-reveal', label: '模糊聚焦' }
];
const emptyProcessing: SubtitleTemplateProcessingState = {
  active: false,
  title: '',
  progress: 0,
  message: '',
  cancellable: false
};

interface SubtitleTemplateRecentTask {
  id: string;
  name: string;
  path?: string;
  mediaUrl?: string;
  templateId: string;
  captions: SubtitleTemplateCaption[];
  keywords: string;
  savedAt: string;
  duration: number;
  styleOverride?: SubtitleTemplateStyleOverride;
}

interface SubtitleTemplateSourceVideo {
  id: string;
  name: string;
  path?: string;
  mediaUrl?: string;
  duration: number;
  source: 'local' | 'cloud';
}

type SubtitleTemplateLayerKey = 'title' | 'caption';
type SubtitleTemplateLayerPosition = SubtitleTemplate['titlePosition'];

interface SubtitleTemplateStyleOverride {
  titlePosition: SubtitleTemplateLayerPosition;
  captionPosition: SubtitleTemplateLayerPosition;
  titleTextStyle: SubtitleTemplateTextStyle;
  captionTextStyle: SubtitleTemplateTextStyle;
}

interface SubtitleTemplateLayerDragState {
  templateId: string;
  layer: SubtitleTemplateLayerKey;
  pointerId: number;
  offsetX: number;
  offsetY: number;
}

export function SubtitleTemplatePage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const phoneRef = useRef<HTMLDivElement>(null);
  const layerDragRef = useRef<SubtitleTemplateLayerDragState | null>(null);
  const [activeTab, setActiveTab] = useState<SubtitleTemplateTab>('template');
  const [sourceVideo, setSourceVideo] = useState<SubtitleTemplateSourceVideo | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState(subtitleTemplates[0].id);
  const [templateStyleOverrides, setTemplateStyleOverrides] = useState<Record<string, SubtitleTemplateStyleOverride>>({});
  const [captions, setCaptions] = useState<SubtitleTemplateCaption[]>([]);
  const [keywords, setKeywords] = useState(defaultSubtitleKeywords);
  const [captionEntrance, setCaptionEntrance] = useState<SubtitleCaptionEntrance>('none');
  const [openingTitle, setOpeningTitle] = useState('');
  const [soundSettings, setSoundSettings] = useState<SubtitleTemplateSoundSettings>({
    videoVolume: 50,
    bgmVolume: 50,
    music: true,
    soundFx: true,
    noiseReduction: false
  });
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [draggedLayer, setDraggedLayer] = useState<SubtitleTemplateLayerKey | null>(null);
  const [notice, setNotice] = useState('');
  const [processing, setProcessing] = useState<SubtitleTemplateProcessingState>(emptyProcessing);
  const [recentTasks, setRecentTasks] = useState<SubtitleTemplateRecentTask[]>([]);
  const [recentDrawerOpen, setRecentDrawerOpen] = useState(false);
  const [cloudPickerOpen, setCloudPickerOpen] = useState(false);
  const [cloudPickerLoading, setCloudPickerLoading] = useState(false);
  const [cloudVideos, setCloudVideos] = useState<DriveNodeView[]>([]);

  const selectedTemplate = subtitleTemplates.find((template) => template.id === selectedTemplateId) || subtitleTemplates[0];
  const selectedStyleOverride = templateStyleOverrides[selectedTemplate.id];
  const positionedTemplate: SubtitleTemplate = selectedStyleOverride
    ? {
        ...selectedTemplate,
        titlePosition: selectedStyleOverride.titlePosition,
        captionPosition: selectedStyleOverride.captionPosition,
        titleTextStyle: selectedStyleOverride.titleTextStyle,
        captionTextStyle: selectedStyleOverride.captionTextStyle
      }
    : selectedTemplate;
  const activeCaption = useMemo(() => {
    return captions.find((caption) => currentTime >= caption.start && currentTime < caption.end) || captions[0];
  }, [captions, currentTime]);
  const visibleRecentTasks = useMemo(() => normalizeRecentTasks(recentTasks), [recentTasks]);
  const displayedTitle = openingTitle || buildOpeningTitle(selectedTemplate, activeCaption?.text || captions[0]?.text || '字幕模板');
  const keywordList = useMemo(() => buildKeywordList(keywords, activeCaption?.text || ''), [keywords, activeCaption?.text]);
  const templateVars = buildTemplateVars(positionedTemplate);

  useEffect(() => {
    let canceled = false;
    readStoredValue<SubtitleTemplateRecentTask[]>(recentTaskKey, [])
      .then((tasks) => {
        if (!canceled) setRecentTasks(normalizeRecentTasks(Array.isArray(tasks) ? tasks : []));
      })
      .catch(() => {
        if (!canceled) setRecentTasks([]);
      });
    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = Math.max(0, Math.min(1, soundSettings.videoVolume / 100));
  }, [soundSettings.videoVolume, sourceVideo?.path]);

  async function importSourceVideo() {
    const bridge = window.surgicol;
    if (!bridge?.dialog?.openFiles || !bridge.media?.uploadToOss) {
      setNotice('本地桌面桥接未就绪，无法上传并识别字幕。');
      return;
    }
    const files = await bridge.dialog.openFiles({
      filters: [{ name: '视频文件', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm'] }]
    });
    const filePath = files[0];
    if (!filePath) return;

    const fileName = filePath.split(/[\\/]/).pop() || filePath;
    setNotice('');
    setCaptions([]);
    setOpeningTitle('');
    setCurrentTime(0);
    setActiveTab('template');
    setProcessing({
      active: true,
      title: '智能包装中',
      progress: 0,
      message: '正在读取视频并准备上传...',
      cancellable: true
    });

    try {
      const probe = await bridge.media.probeFile(filePath).catch(() => null);
      const duration = Math.max(1, Number(probe?.duration) || 13);
      const nextVideo = {
        id: crypto.randomUUID(),
        name: fileName,
        path: filePath,
        duration,
        source: 'local' as const
      };
      setSourceVideo(nextVideo);
      setProcessing((state) => ({ ...state, progress: 8, message: '正在上传视频到 OSS...' }));
      const uploaded = await bridge.media.uploadToOss(filePath, {
        folder: 'subtitle-template/source-videos',
        taskId: `subtitle-template-${nextVideo.id}`
      });
      setSourceVideo({ ...nextVideo, mediaUrl: uploaded.mediaUrl });
      setProcessing((state) => ({ ...state, title: '正在识别关键词', progress: 20, message: '已上传，正在提交 ASR 智能字幕任务...' }));
      const submitted = await submitSubtitleRecognition({ mediaUrl: uploaded.mediaUrl, title: fileName });
      const recognized = await waitForSubtitleRecognition(submitted.jobId, (progress, message) => {
        setProcessing((state) => ({ ...state, title: progress < 48 ? '正在识别关键词' : '正在识别画面内容', progress, message }));
      });
      const nextCaptions = buildCaptionsFromRecognition(recognized, duration);
      const nextKeywords = extractSubtitleKeywords(nextCaptions.map((caption) => caption.text).join(' '));
      setCaptions(nextCaptions);
      setKeywords(nextKeywords.length ? nextKeywords.join(', ') : defaultSubtitleKeywords);
      setOpeningTitle(buildOpeningTitleFromCaptions(selectedTemplate, nextCaptions, fileName));
      setActiveTab('captions');
      setProcessing({
        active: true,
        title: '网感模板应用完成',
        progress: 100,
        message: `已识别 ${nextCaptions.length} 条字幕，可继续调整模板、文字和声音。`,
        cancellable: false
      });
      await persistRecentTask({
        id: nextVideo.id,
        name: fileName,
        path: filePath,
        mediaUrl: uploaded.mediaUrl,
        templateId: selectedTemplate.id,
        captions: nextCaptions,
        keywords: nextKeywords.length ? nextKeywords.join(', ') : defaultSubtitleKeywords,
        savedAt: new Date().toISOString(),
        duration,
        styleOverride: buildTemplateStyleOverride(selectedTemplate)
      });
      window.setTimeout(() => setProcessing(emptyProcessing), 700);
    } catch (error) {
      setProcessing(emptyProcessing);
      setNotice(error instanceof Error ? `字幕模板处理失败：${error.message}` : '字幕模板处理失败，请检查后端、OSS 和阿里云 ICE 配置。');
    }
  }

  async function openCloudVideoPicker() {
    setCloudPickerOpen(true);
    setCloudPickerLoading(true);
    setNotice('');
    try {
      const root = await listDriveNodes(null);
      const videos = root.nodes.filter(isVideoDriveNode);
      setCloudVideos(videos);
      if (!videos.length) {
        setNotice('当前网盘根目录没有可用视频，请先在网盘上传 MP4/MOV 等视频文件。');
      }
    } catch (error) {
      setCloudVideos([]);
      setNotice(error instanceof Error ? `读取网盘视频失败：${error.message}` : '读取网盘视频失败，请确认后端和网盘服务已启动。');
    } finally {
      setCloudPickerLoading(false);
    }
  }

  async function importCloudVideo(node: DriveNodeView) {
    const bridge = window.surgicol;
    const mediaUrl = node.downloadUrl || node.previewUrl || buildDriveContentUrl(node.id);
    if (!mediaUrl) {
      setNotice('该网盘视频没有可用下载地址，暂时不能用于字幕模板。');
      return;
    }

    setCloudPickerOpen(false);
    setNotice('');
    setCaptions([]);
    setOpeningTitle('');
    setCurrentTime(0);
    setActiveTab('template');
    setProcessing({
      active: true,
      title: '正在读取网盘视频',
      progress: 8,
      message: '正在准备网盘视频预览和字幕识别...',
      cancellable: true
    });

    try {
      const cached = bridge?.media?.cacheRemoteFile
        ? await bridge.media.cacheRemoteFile(mediaUrl, {
            folder: 'subtitle-template/cloud-videos',
            cacheKey: node.id,
            fileName: node.name
          }).catch(() => null)
        : null;
      const localPath = cached?.localPath;
      const probe = localPath && bridge?.media?.probeFile ? await bridge.media.probeFile(localPath).catch(() => null) : null;
      const duration = Math.max(1, Number(probe?.duration) || 13);
      const nextVideo: SubtitleTemplateSourceVideo = {
        id: node.id,
        name: node.name,
        path: localPath,
        mediaUrl,
        duration,
        source: 'cloud'
      };
      setSourceVideo(nextVideo);
      setProcessing((state) => ({ ...state, title: '正在识别关键词', progress: 20, message: '网盘视频已选中，正在提交 ASR 智能字幕任务...' }));
      const submitted = await submitSubtitleRecognition({ mediaUrl, title: node.name });
      const recognized = await waitForSubtitleRecognition(submitted.jobId, (progress, message) => {
        setProcessing((state) => ({ ...state, title: progress < 48 ? '正在识别关键词' : '正在识别画面内容', progress, message }));
      });
      const nextCaptions = buildCaptionsFromRecognition(recognized, duration);
      const nextKeywords = extractSubtitleKeywords(nextCaptions.map((caption) => caption.text).join(' '));
      setCaptions(nextCaptions);
      setKeywords(nextKeywords.length ? nextKeywords.join(', ') : defaultSubtitleKeywords);
      setOpeningTitle(buildOpeningTitleFromCaptions(selectedTemplate, nextCaptions, node.name));
      setActiveTab('captions');
      setProcessing({
        active: true,
        title: '网感模板应用完成',
        progress: 100,
        message: `已识别 ${nextCaptions.length} 条字幕，可继续调整模板、文字和声音。`,
        cancellable: false
      });
      await persistRecentTask({
        id: nextVideo.id,
        name: node.name,
        path: localPath,
        mediaUrl,
        templateId: selectedTemplate.id,
        captions: nextCaptions,
        keywords: nextKeywords.join(', '),
        savedAt: new Date().toISOString(),
        duration,
        styleOverride: buildTemplateStyleOverride(selectedTemplate)
      });
      window.setTimeout(() => setProcessing(emptyProcessing), 700);
    } catch (error) {
      setProcessing(emptyProcessing);
      setNotice(error instanceof Error ? `网盘视频处理失败：${error.message}` : '网盘视频处理失败，请检查后端、OSS 和阿里云 ICE 配置。');
    }
  }

  async function persistRecentTask(task: SubtitleTemplateRecentTask) {
    const nextTasks = normalizeRecentTasks([task, ...recentTasks]);
    setRecentTasks(nextTasks);
    await writeStoredValue(recentTaskKey, nextTasks);
  }

  function restoreRecentTask(task: SubtitleTemplateRecentTask) {
    setSourceVideo({
      id: task.id,
      name: task.name,
      path: task.path,
      mediaUrl: task.mediaUrl,
      duration: task.duration || 13,
      source: task.mediaUrl && !task.path ? 'cloud' : 'local'
    });
    const restoredTemplateId = task.templateId || subtitleTemplates[0].id;
    const restoredTemplate = subtitleTemplates.find((template) => template.id === restoredTemplateId) || subtitleTemplates[0];
    setSelectedTemplateId(restoredTemplateId);
    if (task.styleOverride) {
      setTemplateStyleOverrides((current) => ({
        ...current,
        [restoredTemplateId]: buildTemplateStyleOverride(restoredTemplate, task.styleOverride)
      }));
    }
    setCaptions(task.captions || []);
    setKeywords(task.keywords || defaultSubtitleKeywords);
    setOpeningTitle(buildOpeningTitleFromCaptions(restoredTemplate, task.captions || [], task.name));
    setActiveTab('template');
    setRecentDrawerOpen(false);
    setNotice('已恢复最近字幕模板任务。');
  }

  function applyTemplate(template: SubtitleTemplate) {
    setSelectedTemplateId(template.id);
    setOpeningTitle((current) => current || buildOpeningTitle(template, activeCaption?.text || captions[0]?.text || template.name));
    setNotice((current) => current.startsWith('已应用') ? '' : current);
  }

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }

  function seekTo(time: number) {
    const video = videoRef.current;
    const safeTime = Math.max(0, Math.min(sourceVideo?.duration || 0, time));
    if (video) video.currentTime = safeTime;
    setCurrentTime(safeTime);
  }

  function updateCaption(id: string, patch: Partial<SubtitleTemplateCaption>) {
    setCaptions((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function addCaption() {
    const start = captions.length ? Math.max(...captions.map((caption) => caption.end)) : 0;
    const nextCaption: SubtitleTemplateCaption = {
      id: crypto.randomUUID(),
      start,
      end: Math.min(sourceVideo?.duration || start + 2, start + 2),
      text: `新增字幕 ${captions.length + 1}`,
      translation: 'New caption'
    };
    setCaptions((items) => [...items, nextCaption]);
  }

  function deleteCaption(id: string) {
    setCaptions((items) => items.filter((item) => item.id !== id));
  }

  function recognizeKeywordsFromCaptions() {
    const nextKeywords = extractSubtitleKeywords(captions.map((caption) => caption.text).join(' '));
    setKeywords(nextKeywords.length ? nextKeywords.join(', ') : defaultSubtitleKeywords);
    setOpeningTitle(buildOpeningTitleFromCaptions(selectedTemplate, captions, sourceVideo?.name || '字幕模板'));
  }

  function updateTemplateLayerPosition(templateId: string, layer: SubtitleTemplateLayerKey, position: SubtitleTemplateLayerPosition) {
    const baseTemplate = subtitleTemplates.find((template) => template.id === templateId) || subtitleTemplates[0];
    setTemplateStyleOverrides((current) => {
      const currentOverride = current[templateId];
      const nextOverride = buildTemplateStyleOverride(baseTemplate, currentOverride);
      return {
        ...current,
        [templateId]: {
          ...nextOverride,
          [`${layer}Position`]: {
            x: clampLayerPosition(position.x),
            y: clampLayerPosition(position.y)
          }
        }
      };
    });
  }

  function updateTemplateTextStyle(templateId: string, layer: SubtitleTemplateLayerKey, patch: Partial<SubtitleTemplateTextStyle>) {
    const baseTemplate = subtitleTemplates.find((template) => template.id === templateId) || subtitleTemplates[0];
    setTemplateStyleOverrides((current) => {
      const currentOverride = current[templateId];
      const nextOverride = buildTemplateStyleOverride(baseTemplate, currentOverride);
      const styleKey = layer === 'title' ? 'titleTextStyle' : 'captionTextStyle';
      return {
        ...current,
        [templateId]: {
          ...nextOverride,
          [styleKey]: {
            ...nextOverride[styleKey],
            ...patch
          }
        }
      };
    });
  }

  function beginTemplateLayerDrag(layer: SubtitleTemplateLayerKey, event: ReactPointerEvent<HTMLDivElement>) {
    if (!sourceVideo) return;
    const phone = phoneRef.current;
    if (!phone) return;
    const rect = phone.getBoundingClientRect();
    const activePosition = layer === 'title' ? positionedTemplate.titlePosition : positionedTemplate.captionPosition;
    const pointerX = ((event.clientX - rect.left) / rect.width) * 100;
    const pointerY = ((event.clientY - rect.top) / rect.height) * 100;
    layerDragRef.current = {
      templateId: positionedTemplate.id,
      layer,
      pointerId: event.pointerId,
      offsetX: pointerX - activePosition.x,
      offsetY: pointerY - activePosition.y
    };
    setDraggedLayer(layer);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.stopPropagation();
    event.preventDefault();
  }

  function moveTemplateLayer(event: ReactPointerEvent<HTMLDivElement>) {
    const dragState = layerDragRef.current;
    const phone = phoneRef.current;
    if (!dragState || !phone) return;
    const rect = phone.getBoundingClientRect();
    const pointerX = ((event.clientX - rect.left) / rect.width) * 100;
    const pointerY = ((event.clientY - rect.top) / rect.height) * 100;
    updateTemplateLayerPosition(dragState.templateId, dragState.layer, {
      x: clampLayerPosition(pointerX - dragState.offsetX),
      y: clampLayerPosition(pointerY - dragState.offsetY)
    });
    event.preventDefault();
  }

  function endTemplateLayerDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const dragState = layerDragRef.current;
    if (!dragState) return;
    const pointerTarget = event.target as HTMLElement;
    if (pointerTarget.hasPointerCapture?.(dragState.pointerId)) {
      pointerTarget.releasePointerCapture(dragState.pointerId);
    }
    layerDragRef.current = null;
    setDraggedLayer(null);
  }

  function startProcessingPreview() {
    if (!sourceVideo) {
      void importSourceVideo();
      return;
    }
    setProcessing({
      active: true,
      title: '智能包装中',
      progress: 0,
      message: '正在应用模板样式...',
      cancellable: true
    });
    const stages = [
      { progress: 20, title: '正在识别关键词', message: '正在匹配字幕关键词和高亮样式...' },
      { progress: 48, title: '正在识别画面内容', message: '正在分析画面安全区和标题位置...' },
      { progress: 100, title: '网感模板应用完成', message: '模板已应用到预览，可继续导出。' }
    ];
    stages.forEach((stage, index) => {
      window.setTimeout(() => setProcessing({ active: true, cancellable: index < 2, ...stage }), 520 * (index + 1));
    });
    window.setTimeout(() => setProcessing(emptyProcessing), 2100);
  }

  async function exportVideo() {
    if (!sourceVideo?.path && !sourceVideo?.mediaUrl) {
      setNotice('请先导入视频。');
      return;
    }
    if (captions.length === 0) {
      setNotice('请先完成字幕识别，或在文字快剪里新增字幕。');
      return;
    }
    const overlay = buildSubtitleOverlay({
      template: positionedTemplate,
      captions,
      title: displayedTitle,
      keywords,
      captionEntrance
    });
    try {
      setProcessing({
        active: true,
        title: '正在导出',
        progress: 72,
        message: '正在烧录标题、字幕和关键词高亮...',
        cancellable: false
      });
      const result = await window.surgicol.media.downloadToLocal(sourceVideo.path || sourceVideo.mediaUrl || '', {
        fileName: `${sourceVideo.name.replace(/\.[^.]+$/, '')}_${selectedTemplate.name}.mp4`,
        viralOverlay: overlay
      });
      setProcessing(emptyProcessing);
      if (!result.canceled) {
        setNotice(`已导出：${result.name || result.localPath}`);
      }
    } catch (error) {
      setProcessing(emptyProcessing);
      setNotice(error instanceof Error ? `导出失败：${error.message}` : '导出失败，请检查 ffmpeg 是否可用。');
    }
  }

  return (
    <section className="subtitle-template-workspace">
      <header className="subtitle-template-topbar">
        <div className="subtitle-template-brand">
          <span className="subtitle-template-logo" aria-hidden="true">
            <Sparkles size={19} strokeWidth={2.4} />
          </span>
          <strong>字幕模板</strong>
          <i />
          <span>网感剪辑</span>
        </div>
        <button className="subtitle-template-export" type="button" onClick={() => void exportVideo()} disabled={!sourceVideo}>
          <Download size={16} />
          <span>导出</span>
        </button>
      </header>

      <div className="subtitle-template-body">
        <section className="subtitle-template-preview-panel">
          <div
            className={clsx('subtitle-template-phone', draggedLayer && 'dragging-layer')}
            ref={phoneRef}
            onPointerMove={moveTemplateLayer}
            onPointerUp={endTemplateLayerDrag}
            onPointerCancel={endTemplateLayerDrag}
          >
            {sourceVideo ? (
              <video
                ref={videoRef}
                src={sourceVideo.path ? toMediaUrl(sourceVideo.path) : sourceVideo.mediaUrl}
                style={{ objectFit: 'cover' }}
                onLoadedMetadata={(event) => {
                  const duration = event.currentTarget.duration;
                  if (Number.isFinite(duration)) {
                    setSourceVideo((video) => video ? { ...video, duration } : video);
                  }
                }}
                onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
              />
            ) : (
              <div className="subtitle-template-empty-phone">
                <Upload size={36} />
                <div className="subtitle-template-upload-choices">
                  <button type="button" onClick={() => void importSourceVideo()}>
                    <HardDrive size={22} />
                    <strong>本地上传</strong>
                  </button>
                  <button type="button" onClick={() => void openCloudVideoPicker()}>
                    <Cloud size={22} />
                    <strong>网盘上传</strong>
                  </button>
                </div>
                <span>自动识别字幕并应用模板</span>
              </div>
            )}
            {sourceVideo ? (
              <div className={clsx('subtitle-template-overlay', selectedTemplate.id)} style={templateVars}>
                <div
                  className={clsx('subtitle-template-title-layer draggable-layer', draggedLayer === 'title' && 'dragging')}
                  style={{ left: `${positionedTemplate.titlePosition.x}%`, top: `${positionedTemplate.titlePosition.y}%` }}
                  onPointerDown={(event) => beginTemplateLayerDrag('title', event)}
                  onPointerMove={moveTemplateLayer}
                  onPointerUp={endTemplateLayerDrag}
                  onPointerCancel={endTemplateLayerDrag}
                  title="拖动调整开场标题位置"
                >
                  {displayedTitle.split('\n').map((line) => <strong key={line}>{line}</strong>)}
                </div>
                <div
                  className={clsx(
                    'subtitle-template-caption-layer draggable-layer',
                    captionEntrance === 'blur-reveal' && 'entrance-blur-reveal',
                    draggedLayer === 'caption' && 'dragging'
                  )}
                  style={{ left: `${positionedTemplate.captionPosition.x}%`, top: `${positionedTemplate.captionPosition.y}%` }}
                  onPointerDown={(event) => beginTemplateLayerDrag('caption', event)}
                  onPointerMove={moveTemplateLayer}
                  onPointerUp={endTemplateLayerDrag}
                  onPointerCancel={endTemplateLayerDrag}
                  title="拖动调整字幕位置"
                >
                  <span className="subtitle-template-caption-primary" key={`caption-primary-${activeCaption?.id || 'fallback'}-${captionEntrance}`}>
                    {renderCaptionText(activeCaption?.text || selectedTemplate.captionCopy, keywordList, captionEntrance)}
                  </span>
                  {selectedTemplate.bilingual ? (
                    <span className="subtitle-template-caption-translation" key={`caption-translation-${activeCaption?.id || 'fallback'}-${captionEntrance}`}>
                      {renderCaptionText(
                        activeCaption?.translation || buildCaptionTranslation(activeCaption?.text || selectedTemplate.captionCopy),
                        [],
                        captionEntrance,
                        5
                      )}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
          <div className="subtitle-template-player">
            <input
              type="range"
              min={0}
              max={Math.max(0.1, sourceVideo?.duration || 13)}
              step={0.01}
              value={Math.min(currentTime, sourceVideo?.duration || 13)}
              onChange={(event) => seekTo(Number(event.target.value))}
              disabled={!sourceVideo}
            />
            <div>
              <button type="button" onClick={togglePlay} disabled={!sourceVideo} title={isPlaying ? '暂停' : '播放'}>
                {isPlaying ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <span>{formatClock(currentTime)} / {formatClock(sourceVideo?.duration || 13)}</span>
              <div className="subtitle-template-player-actions">
                <button type="button" onClick={() => void importSourceVideo()} disabled={processing.active} title="切换视频">
                  <Upload size={15} />
                  <span>切换视频</span>
                </button>
                <button type="button" onClick={() => void openCloudVideoPicker()} disabled={processing.active} title="选择网盘视频">
                  <Cloud size={15} />
                  <span>网盘视频</span>
                </button>
                <button type="button" title="剪辑">
                  <Scissors size={15} />
                  <span>剪辑</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="subtitle-template-editor-panel">
          <div className="subtitle-template-tabs">
            <button className={clsx(activeTab === 'template' && 'active')} type="button" onClick={() => setActiveTab('template')}>字幕模板</button>
            <button className={clsx(activeTab === 'captions' && 'active')} type="button" onClick={() => setActiveTab('captions')}>文字快剪</button>
            <button className={clsx(activeTab === 'sound' && 'active')} type="button" onClick={() => setActiveTab('sound')}>声音</button>
          </div>

          {activeTab === 'template' ? (
            <div className="subtitle-template-tab-body template-body">
              <div className="subtitle-template-grid">
                {subtitleTemplates.map((template) => (
                  <button
                    className={clsx('subtitle-template-card', template.id, selectedTemplate.id === template.id && 'active')}
                    type="button"
                    key={template.id}
                    onClick={() => applyTemplate(template)}
                    style={buildTemplateVars(template)}
                  >
                    <div className="subtitle-template-card-visual">
                      {sourceVideo ? <video src={sourceVideo.path ? toMediaUrl(sourceVideo.path) : sourceVideo.mediaUrl} muted playsInline preload="metadata" /> : <Film size={24} />}
                      <SubtitleTemplateCardCover template={template} />
                    </div>
                    <span>{getSubtitleTemplateDisplayName(template)}</span>
                  </button>
                ))}
              </div>
              <div className="subtitle-template-add-row">
                {!sourceVideo && visibleRecentTasks.length > 0 ? (
                  <section className={clsx('subtitle-template-recent-drawer', recentDrawerOpen && 'open')}>
                    <button className="subtitle-template-recent-trigger" type="button" onClick={() => setRecentDrawerOpen((open) => !open)}>
                      <Film size={15} />
                      <span>最近任务</span>
                      <strong>{visibleRecentTasks.length}</strong>
                    </button>
                    {recentDrawerOpen ? (
                      <div className="subtitle-template-recent-popover">
                        <header>
                          <strong>最近任务</strong>
                          <span>最多保留 3 条</span>
                        </header>
                        {visibleRecentTasks.map((task) => (
                          <button type="button" key={task.id} onClick={() => restoreRecentTask(task)}>
                            <Film size={15} />
                            <span>
                              <strong>{task.name}</strong>
                              <small>{subtitleTemplates.find((template) => template.id === task.templateId)?.name || '字幕模板'}</small>
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </section>
                ) : null}
                <label><input type="checkbox" checked={soundSettings.music} onChange={(event) => updateSoundSetting('music', event.target.checked)} /> 音乐</label>
                <label><input type="checkbox" checked={soundSettings.soundFx} onChange={(event) => updateSoundSetting('soundFx', event.target.checked)} /> 音效</label>
                <button type="button" onClick={startProcessingPreview}>{sourceVideo ? '开始处理' : '上传视频'}</button>
              </div>
            </div>
          ) : null}

          {activeTab === 'captions' ? (
            <div className="subtitle-template-tab-body captions-body">
              <header className="subtitle-template-caption-tools subtitle-template-style-panel">
                <div className="subtitle-template-style-grid">
                  <label className="style-title-size">
                    标题字号
                    <span className="subtitle-template-style-range">
                      <input type="range" min={16} max={34} value={positionedTemplate.titleTextStyle.fontSize} onChange={(event) => updateTemplateTextStyle(positionedTemplate.id, 'title', { fontSize: Number(event.target.value) })} />
                      <strong>{positionedTemplate.titleTextStyle.fontSize}</strong>
                    </span>
                  </label>
                  <label className="style-title-font">
                    标题字体
                    <select value={positionedTemplate.titleTextStyle.fontFamily} onChange={(event) => updateTemplateTextStyle(positionedTemplate.id, 'title', { fontFamily: event.target.value })}>
                      {viralFontOptions.map((font) => <option key={font.value} value={font.value}>{font.label}</option>)}
                    </select>
                  </label>
                  <label className="style-caption-size">
                    字幕字号
                    <span className="subtitle-template-style-range">
                      <input type="range" min={11} max={24} value={positionedTemplate.captionTextStyle.fontSize} onChange={(event) => updateTemplateTextStyle(positionedTemplate.id, 'caption', { fontSize: Number(event.target.value) })} />
                      <strong>{positionedTemplate.captionTextStyle.fontSize}</strong>
                    </span>
                  </label>
                  <label className="style-caption-font">
                    字幕字体
                    <select value={positionedTemplate.captionTextStyle.fontFamily} onChange={(event) => updateTemplateTextStyle(positionedTemplate.id, 'caption', { fontFamily: event.target.value })}>
                      {viralFontOptions.map((font) => <option key={font.value} value={font.value}>{font.label}</option>)}
                    </select>
                  </label>
                  <label className="style-caption-entrance">
                    字幕出场
                    <select value={captionEntrance} onChange={(event) => setCaptionEntrance(event.target.value as SubtitleCaptionEntrance)}>
                      {captionEntranceOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <button className="style-add-caption" type="button" onClick={addCaption}>新增字幕</button>
                </div>
              </header>
              <label className="subtitle-template-title-input">
                开场标题
                <textarea rows={2} value={displayedTitle} onChange={(event) => setOpeningTitle(event.target.value)} />
              </label>
              <div className="subtitle-template-caption-list">
                {captions.map((caption) => (
                  <article className={caption.id === activeCaption?.id ? 'active' : undefined} key={caption.id} onClick={() => seekTo(caption.start)}>
                    <span>{formatClock(caption.start)} - {formatClock(caption.end)}</span>
                    <div>
                      <textarea rows={2} value={caption.text} onChange={(event) => updateCaption(caption.id, { text: event.target.value })} onClick={(event) => event.stopPropagation()} />
                      <textarea rows={2} value={caption.translation || ''} placeholder="英文/双语字幕" onChange={(event) => updateCaption(caption.id, { translation: event.target.value })} onClick={(event) => event.stopPropagation()} />
                    </div>
                    <button type="button" title="编辑字幕"><Edit3 size={15} /></button>
                    <button type="button" title="删除字幕" onClick={(event) => {
                      event.stopPropagation();
                      deleteCaption(caption.id);
                    }}><Trash2 size={15} /></button>
                  </article>
                ))}
                {captions.length === 0 ? <p>导入视频后会自动识别字幕，也可以手动新增。</p> : null}
              </div>
            </div>
          ) : null}

          {activeTab === 'sound' ? (
            <div className="subtitle-template-tab-body sound-body">
              <label>
                <span>视频音量</span>
                <input type="range" min={0} max={100} value={soundSettings.videoVolume} onChange={(event) => updateSoundSetting('videoVolume', Number(event.target.value))} />
                <strong>{soundSettings.videoVolume}</strong>
              </label>
              <button className={clsx(soundSettings.noiseReduction && 'active')} type="button" onClick={() => updateSoundSetting('noiseReduction', !soundSettings.noiseReduction)}>
                <Volume2 size={24} />
                <div>
                  <strong>降噪</strong>
                  <span>将人声音质提升为录音棚品质</span>
                </div>
              </button>
              <label>
                <span>背景音乐</span>
                <input type="range" min={0} max={100} value={soundSettings.bgmVolume} onChange={(event) => updateSoundSetting('bgmVolume', Number(event.target.value))} />
                <strong>{soundSettings.bgmVolume}</strong>
              </label>
            </div>
          ) : null}

          {activeTab === 'captions' ? (
            <div className="subtitle-template-keywords">
              <div>
                <strong>字幕关键词</strong>
                <span>{keywords.split(/[,，、\s]+/).filter(Boolean).slice(0, 8).join(' / ')}</span>
              </div>
              <input value={keywords} onChange={(event) => setKeywords(event.target.value)} />
              <button type="button" onClick={recognizeKeywordsFromCaptions}>从字幕识别</button>
            </div>
          ) : null}
        </section>
      </div>

      {cloudPickerOpen ? (
        <CloudVideoPicker
          loading={cloudPickerLoading}
          videos={cloudVideos}
          onClose={() => setCloudPickerOpen(false)}
          onSelect={(node) => void importCloudVideo(node)}
        />
      ) : null}
      {notice && !notice.startsWith('已应用') ? <div className="subtitle-template-notice">{notice}</div> : null}
      {processing.active ? <ProcessingDialog state={processing} onCancel={() => setProcessing(emptyProcessing)} /> : null}
    </section>
  );

  function updateSoundSetting<Key extends keyof SubtitleTemplateSoundSettings>(key: Key, value: SubtitleTemplateSoundSettings[Key]) {
    setSoundSettings((settings) => ({ ...settings, [key]: value }));
  }
}

function SubtitleTemplateCardCover({ template }: { template: SubtitleTemplate }) {
  const viralCard = getSubtitleTemplateViralCard(template);
  const viralCopy = getViralTemplateCardCopy(viralCard, template.captionCopy, viralCard.variantIndex);
  const copy = template.id === 'premium-red-bilingual' ? {
    title: '双行\n排版\n智能\n加标题',
    subtitle: '智能翻译\n双语字幕',
    badge: '高级红'
  } : {
    title: template.titleCopy || viralCopy.title,
    subtitle: template.captionCopy || viralCopy.subtitle,
    badge: template.badgeCopy || viralCopy.badge
  };
  return (
    <div
      className={clsx('subtitle-template-card-cover', `template-${viralCard.key}`, getViralTemplatePreviewClass(viralCard))}
      style={viralTemplateThemeStyle(viralCard)}
      aria-hidden="true"
    >
      <div className="subtitle-template-card-effect">
        <strong>{copy.title}</strong>
        <span>{copy.subtitle}</span>
        <em>{copy.badge}</em>
        <u />
        <u />
        <u />
      </div>
    </div>
  );
}

const subtitleTemplateViralCardNames: Record<string, string> = {
  'premium-red-bilingual': '高级红·双语',
  'luxury-white-bilingual': '轻奢白·双语',
  'classic-blue-bilingual': '经典蓝·双语',
  'yellow-flash': '黄色闪亮',
  'simple-yellow-white': '简洁黄白',
  'translucent-dark': '轻透雅黑',
  'basic-white-gold': '基础白金',
  'eye-catching-green': '通勤绿蓝'
};

function getSubtitleTemplateViralCard(template: SubtitleTemplate): ViralTemplateCard {
  const mappedName = subtitleTemplateViralCardNames[template.id] || template.name;
  return viralTemplateCards.find((card) => card.cardName === mappedName) || viralTemplateCards[0];
}

function ProcessingDialog({ state, onCancel }: { state: SubtitleTemplateProcessingState; onCancel: () => void }) {
  return (
    <div className="subtitle-template-processing-mask">
      <section>
        <WandSparkles size={42} />
        <strong>{state.title}...{state.progress}%</strong>
        <div><span style={{ width: `${Math.max(0, Math.min(100, state.progress))}%` }} /></div>
        <p>{state.message}</p>
        {state.cancellable ? <button type="button" onClick={onCancel}>取消</button> : null}
      </section>
    </div>
  );
}

function CloudVideoPicker({
  loading,
  videos,
  onClose,
  onSelect
}: {
  loading: boolean;
  videos: DriveNodeView[];
  onClose: () => void;
  onSelect: (node: DriveNodeView) => void;
}) {
  return (
    <div className="subtitle-template-cloud-mask" role="dialog" aria-modal="true" aria-label="选择网盘视频">
      <section className="subtitle-template-cloud-picker">
        <header>
          <div>
            <strong>网盘上传</strong>
            <span>选择一个网盘视频应用字幕模板</span>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭网盘选择">
            <X size={18} />
          </button>
        </header>
        <div className="subtitle-template-cloud-list">
          {loading ? <p>正在读取网盘视频...</p> : null}
          {!loading && videos.length === 0 ? <p>暂无可用视频，请先到网盘上传视频文件。</p> : null}
          {!loading ? videos.map((node) => (
            <button type="button" key={node.id} onClick={() => onSelect(node)}>
              <Film size={18} />
              <span>
                <strong>{node.name}</strong>
                <small>{formatFileSize(node.size)} · {node.updatedAt ? new Date(node.updatedAt).toLocaleString() : '网盘文件'}</small>
              </span>
            </button>
          )) : null}
        </div>
      </section>
    </div>
  );
}

async function waitForSubtitleRecognition(jobId: string, onProgress: (progress: number, message: string) => void) {
  if (!jobId) throw new Error('字幕识别没有返回 JobId');
  for (let index = 0; index < 28; index += 1) {
    const progress = Math.min(96, index < 8 ? 20 + index * 3 : 48 + index * 2);
    onProgress(progress, index < 8 ? '正在识别关键词...' : '正在识别画面内容...');
    const job = await getSubtitleRecognitionJob(jobId);
    if (job.successful && job.segments.length > 0) return job;
    if (job.finished && !job.successful) throw new Error(`字幕识别失败，任务状态：${job.status || 'unknown'}`);
    await delay(2200);
  }
  throw new Error('字幕识别等待超时，请稍后重试。');
}

function isVideoDriveNode(node: DriveNodeView) {
  if (node.nodeType !== 'FILE') return false;
  if (node.mimeType?.startsWith('video/')) return true;
  return /\.(mp4|mov|avi|mkv|webm)$/i.test(node.name);
}

function formatFileSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) return '未知大小';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = size;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function getSubtitleTemplateDisplayName(template: SubtitleTemplate) {
  const names: Record<string, string> = {
    'premium-red-bilingual': '高级红·双语',
    'luxury-white-bilingual': '轻奢白·双语',
    'classic-blue-bilingual': '经典蓝·双语',
    'yellow-flash': '黄色闪亮',
    'simple-yellow-white': '简洁黄白',
    'translucent-dark': '轻透雅粉',
    'basic-white-gold': '基础白金',
    'eye-catching-green': '吸睛绿'
  };
  return names[template.id] || template.name;
}

function buildCaptionsFromRecognition(job: SubtitleRecognitionJob, fallbackDuration: number): SubtitleTemplateCaption[] {
  const captions = job.segments
    .filter((segment) => segment.text?.trim() && Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.end > segment.start)
    .map((segment, index) => ({
      id: `caption-${index}-${Math.round(segment.start * 1000)}`,
      start: segment.start,
      end: segment.end,
      text: segment.text.trim(),
      translation: buildCaptionTranslation(segment.text.trim())
    }));
  if (captions.length > 0) return captions;
  return [
    { id: 'caption-fallback-1', start: 0, end: Math.min(2, fallbackDuration), text: '自动识别添加字幕', translation: 'Auto-generate captions.' }
  ];
}

function buildKeywordList(keywords: string, captionText: string) {
  const explicit = keywords.split(/[,，、\s]+/).map((item) => item.trim()).filter((item) => item.length >= 2);
  const fallback = extractSubtitleKeywords(captionText);
  return [...new Set((explicit.length ? explicit : fallback).slice(0, 8))];
}

function renderCaptionText(text: string, keywords: string[], entrance: SubtitleCaptionEntrance, delayOffset = 0) {
  if (entrance !== 'blur-reveal') return renderHighlightedText(text, keywords);
  const safeText = String(text || '');
  if (!safeText) return safeText;
  const parts = splitTextByKeywords(safeText, keywords);
  let tokenIndex = delayOffset;
  return parts.flatMap((part, partIndex) => {
    const characters = Array.from(part.text);
    const tokens = characters.map((character, characterIndex) => {
      if (character === '\n') {
        return <br key={`caption-br-${partIndex}-${characterIndex}`} />;
      }
      const currentIndex = tokenIndex++;
      return (
        <span
          className="moya-caption-token"
          key={`caption-token-${partIndex}-${characterIndex}`}
          style={{ '--moya-caption-token-index': currentIndex } as CSSProperties}
        >
          {character === ' ' ? '\u00A0' : character}
        </span>
      );
    });
    return part.highlighted ? [<mark key={`caption-mark-${partIndex}`}>{tokens}</mark>] : tokens;
  });
}

function buildTemplateStyleOverride(template: SubtitleTemplate, override?: Partial<SubtitleTemplateStyleOverride>): SubtitleTemplateStyleOverride {
  return {
    titlePosition: override?.titlePosition || template.titlePosition,
    captionPosition: override?.captionPosition || template.captionPosition,
    titleTextStyle: {
      ...template.titleTextStyle,
      ...override?.titleTextStyle
    },
    captionTextStyle: {
      ...template.captionTextStyle,
      ...override?.captionTextStyle
    }
  };
}

function normalizeRecentTasks(tasks: SubtitleTemplateRecentTask[]) {
  const seen = new Set<string>();
  return tasks
    .filter((task) => task && task.name)
    .filter((task) => {
      const key = getRecentTaskDedupeKey(task);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
}

function getRecentTaskDedupeKey(task: SubtitleTemplateRecentTask) {
  return (task.path || task.mediaUrl || task.name).trim().toLowerCase();
}

function clampLayerPosition(value: number) {
  if (!Number.isFinite(value)) return 50;
  return Math.max(4, Math.min(96, value));
}

function renderHighlightedText(text: string, keywords: string[]) {
  if (!text || keywords.length === 0) return text;
  return splitTextByKeywords(text, keywords).map((part, index) => {
    return part.highlighted ? <mark key={`${part.text}-${index}`}>{part.text}</mark> : part.text;
  });
}

function splitTextByKeywords(text: string, keywords: string[]) {
  const safeKeywords = keywords.map((keyword) => keyword.trim()).filter((keyword) => keyword.length >= 2);
  if (safeKeywords.length === 0) return [{ text, highlighted: false }];
  const escaped = safeKeywords.map((keyword) => keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).filter(Boolean);
  if (escaped.length === 0) return [{ text, highlighted: false }];
  const matcher = new RegExp(`(${escaped.join('|')})`, 'gi');
  return text.split(matcher).filter(Boolean).map((part) => ({
    text: part,
    highlighted: safeKeywords.some((keyword) => keyword.toLowerCase() === part.toLowerCase())
  }));
}

function buildTemplateVars(template: SubtitleTemplate): SubtitleTemplateStyleVars {
  return {
    '--subtitle-title-color': template.theme.titleColor,
    '--subtitle-title-stroke': template.theme.titleStroke,
    '--subtitle-caption-color': template.theme.captionColor,
    '--subtitle-caption-shadow': template.theme.captionShadow,
    '--subtitle-keyword-bg': template.theme.keywordBackground,
    '--subtitle-keyword-color': template.theme.keywordColor,
    '--subtitle-card-accent': template.theme.accent,
    '--subtitle-title-size': `${template.titleTextStyle.fontSize}px`,
    '--subtitle-title-font': template.titleTextStyle.fontFamily,
    '--subtitle-title-width': `${template.titleTextStyle.width}px`,
    '--subtitle-title-height': `${template.titleTextStyle.height}px`,
    '--subtitle-caption-size': `${template.captionTextStyle.fontSize}px`,
    '--subtitle-caption-font': template.captionTextStyle.fontFamily,
    '--subtitle-caption-width': `${template.captionTextStyle.width}px`,
    '--subtitle-caption-height': `${template.captionTextStyle.height}px`
  };
}

async function readStoredValue<T>(key: string, fallback: T): Promise<T> {
  const store = window.surgicol?.store;
  if (!store) return fallback;
  const value = await store.get<T>(key);
  return (value ?? fallback) as T;
}

async function writeStoredValue(key: string, value: unknown) {
  const store = window.surgicol?.store;
  if (!store) return false;
  return store.set(key, value);
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
