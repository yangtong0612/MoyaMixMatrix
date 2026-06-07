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
import emphasisBrightDingSound from '@/assets/sfx/emphasis-bright-ding.ogg';
import emphasisClickClackSound from '@/assets/sfx/emphasis-click-clack.ogg';
import emphasisSoftPopSound from '@/assets/sfx/emphasis-soft-pop.ogg';
import emphasisTechBeepSound from '@/assets/sfx/emphasis-tech-beep.ogg';
import openingHitLightSound from '@/assets/sfx/opening-hit-light.ogg';
import openingPopLightSound from '@/assets/sfx/opening-pop-light.ogg';
import openingPopSoftSound from '@/assets/sfx/opening-pop-soft.ogg';
import openingWhooshGentleSound from '@/assets/sfx/opening-whoosh-gentle.wav';
import transitionGlitchSciFiSound from '@/assets/sfx/transition-glitch-sci-fi.ogg';
import transitionGlitchSoftSound from '@/assets/sfx/transition-glitch-soft.ogg';
import transitionWhooshFastSound from '@/assets/sfx/transition-whoosh-fast.wav';
import transitionWhooshShortSound from '@/assets/sfx/transition-whoosh-short.wav';
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
  SubtitleCaptionSoundEffect,
  SubtitleCaptionSoundRhythm,
  SubtitleOpeningSoundEffect,
  SubtitleTemplateCaption,
  SubtitleTemplateProcessingState,
  SubtitleTemplateSoundSettings,
  SubtitleTemplateStyleVars,
  SubtitleTemplateTab,
  SubtitleTemplateTextStyle,
  SubtitleTemplateVideoZoomRange,
  SubtitleTransitionSoundEffect
} from './subtitleTemplateTypes';
import './subtitleTemplate.css';

const recentTaskKey = 'subtitle-template:recent-tasks';
const captionEntranceOptions: Array<{ value: SubtitleCaptionEntrance; label: string }> = [
  { value: 'none', label: '无' },
  { value: 'blur-reveal', label: '模糊聚焦' },
  { value: 'fade', label: '淡入' },
  { value: 'rise', label: '上浮' },
  { value: 'pop', label: '弹出' },
  { value: 'karaoke', label: '卡拉OK高亮' }
];
const openingSoundEffectOptions: Array<{ value: SubtitleOpeningSoundEffect; label: string }> = [
  { value: 'none', label: '无' },
  { value: 'pop-soft', label: '轻 Pop' },
  { value: 'pop-light', label: '短 Pop' },
  { value: 'hit-light', label: '轻 Hit' },
  { value: 'whoosh-gentle', label: '轻 Whoosh' }
];
const transitionSoundEffectOptions: Array<{ value: SubtitleTransitionSoundEffect; label: string }> = [
  { value: 'none', label: '无' },
  { value: 'whoosh-fast', label: '快 Whoosh' },
  { value: 'whoosh-short', label: '短 Whoosh' },
  { value: 'glitch-soft', label: '轻 Glitch' },
  { value: 'glitch-sci-fi', label: '科技 Glitch' }
];
const captionSoundEffectOptions: Array<{ value: SubtitleCaptionSoundEffect; label: string }> = [
  { value: 'none', label: '无' },
  { value: 'soft-pop', label: '轻啵' },
  { value: 'bright-ding', label: '清脆叮' },
  { value: 'click-clack', label: '咔哒' },
  { value: 'tech-beep', label: '科技哔' }
];
const captionSoundRhythmOptions: Array<{ value: SubtitleCaptionSoundRhythm; label: string }> = [
  { value: 'recommended', label: '克制推荐' },
  { value: 'boost', label: '节奏增强' },
  { value: 'all', label: '每句字幕' },
  { value: 'off', label: '关闭' }
];
const openingSoundEffectSources: Record<Exclude<SubtitleOpeningSoundEffect, 'none'>, string> = {
  'pop-soft': openingPopSoftSound,
  'pop-light': openingPopLightSound,
  'hit-light': openingHitLightSound,
  'whoosh-gentle': openingWhooshGentleSound
};
const transitionSoundEffectSources: Record<Exclude<SubtitleTransitionSoundEffect, 'none'>, string> = {
  'whoosh-fast': transitionWhooshFastSound,
  'whoosh-short': transitionWhooshShortSound,
  'glitch-soft': transitionGlitchSoftSound,
  'glitch-sci-fi': transitionGlitchSciFiSound
};
const captionSoundEffectSources: Record<Exclude<SubtitleCaptionSoundEffect, 'none'>, string> = {
  'soft-pop': emphasisSoftPopSound,
  'bright-ding': emphasisBrightDingSound,
  'click-clack': emphasisClickClackSound,
  'tech-beep': emphasisTechBeepSound
};
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
  openingSoundEffect?: SubtitleOpeningSoundEffect;
  transitionSoundEffect?: SubtitleTransitionSoundEffect;
  captionSoundEffect?: SubtitleCaptionSoundEffect;
  captionSoundRhythm?: SubtitleCaptionSoundRhythm;
  videoZoomRanges?: SubtitleTemplateVideoZoomRange[];
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
  const soundEffectAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastCaptionSoundKeyRef = useRef('');
  const lastCaptionSoundAtRef = useRef(-Infinity);
  const lastTransitionZoomRangeIdRef = useRef('');
  const openingSoundPlayedRef = useRef(false);
  const noticeTimerRef = useRef<number | null>(null);
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
    openingSoundEffect: 'none',
    transitionSoundEffect: 'none',
    captionSoundEffect: 'none',
    captionSoundRhythm: 'recommended',
    noiseReduction: false
  });
  const [videoZoomRanges, setVideoZoomRanges] = useState<SubtitleTemplateVideoZoomRange[]>([]);
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
  const activeCaptionKey = activeCaption?.id || '';
  const activeCaptionIndex = activeCaption ? captions.findIndex((caption) => caption.id === activeCaption.id) : -1;
  const visibleRecentTasks = useMemo(() => normalizeRecentTasks(recentTasks), [recentTasks]);
  const displayedTitle = openingTitle || buildOpeningTitle(selectedTemplate, activeCaption?.text || captions[0]?.text || '字幕模板');
  const keywordList = useMemo(() => buildKeywordList(keywords, activeCaption?.text || ''), [keywords, activeCaption?.text]);
  const templateVars = buildTemplateVars(positionedTemplate);
  const activeVideoZoomScale = getVideoZoomScale(videoZoomRanges, currentTime);

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

  useEffect(() => {
    lastCaptionSoundKeyRef.current = '';
    lastCaptionSoundAtRef.current = -Infinity;
    lastTransitionZoomRangeIdRef.current = '';
    openingSoundPlayedRef.current = false;
  }, [sourceVideo?.id]);

  useEffect(() => {
    lastTransitionZoomRangeIdRef.current = '';
  }, [videoZoomRanges]);

  useEffect(() => {
    return () => {
      soundEffectAudioRef.current?.pause();
      if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!sourceVideo || !isPlaying || !activeCaption || !activeCaptionKey) return;

    if (
      !openingSoundPlayedRef.current &&
      activeCaptionIndex === 0 &&
      currentTime <= 2.4 &&
      soundSettings.soundFx &&
      soundSettings.openingSoundEffect !== 'none'
    ) {
      openingSoundPlayedRef.current = true;
      lastCaptionSoundAtRef.current = currentTime;
      void playOpeningSoundEffect(soundSettings.openingSoundEffect);
      return;
    }

    const transitionZoomRange = getTransitionZoomSoundRange({
      currentTime,
      lastPlayedAt: lastCaptionSoundAtRef.current,
      lastRangeId: lastTransitionZoomRangeIdRef.current,
      soundEffect: soundSettings.transitionSoundEffect,
      soundFx: soundSettings.soundFx,
      videoZoomRanges
    });
    if (transitionZoomRange) {
      lastTransitionZoomRangeIdRef.current = transitionZoomRange.id;
      lastCaptionSoundAtRef.current = currentTime;
      void playTransitionSoundEffect(soundSettings.transitionSoundEffect);
      return;
    }

    if (lastCaptionSoundKeyRef.current === activeCaptionKey) return;
    lastCaptionSoundKeyRef.current = activeCaptionKey;

    if (shouldPlayTransitionSound({
      captions,
      captionIndex: activeCaptionIndex,
      currentTime,
      lastPlayedAt: lastCaptionSoundAtRef.current,
      soundEffect: soundSettings.transitionSoundEffect,
      soundFx: soundSettings.soundFx
    })) {
      lastCaptionSoundAtRef.current = currentTime;
      void playTransitionSoundEffect(soundSettings.transitionSoundEffect);
      return;
    }

    if (!shouldPlayCaptionSound({
      caption: activeCaption,
      captionIndex: activeCaptionIndex,
      currentTime,
      keywords,
      lastPlayedAt: lastCaptionSoundAtRef.current,
      rhythm: soundSettings.captionSoundRhythm,
      soundEffect: soundSettings.captionSoundEffect,
      soundFx: soundSettings.soundFx
    })) return;

    lastCaptionSoundAtRef.current = currentTime;
    void playCaptionSoundEffect(soundSettings.captionSoundEffect);
  }, [
    activeCaption,
    activeCaptionIndex,
    activeCaptionKey,
    captions,
    currentTime,
    isPlaying,
    keywords,
    sourceVideo,
    soundSettings.captionSoundEffect,
    soundSettings.captionSoundRhythm,
    soundSettings.openingSoundEffect,
    soundSettings.soundFx,
    soundSettings.transitionSoundEffect,
    videoZoomRanges
  ]);

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
    setVideoZoomRanges([]);
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
        styleOverride: buildTemplateStyleOverride(selectedTemplate),
        openingSoundEffect: soundSettings.openingSoundEffect,
        transitionSoundEffect: soundSettings.transitionSoundEffect,
        captionSoundEffect: soundSettings.captionSoundEffect,
        captionSoundRhythm: soundSettings.captionSoundRhythm,
        videoZoomRanges: []
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
    setVideoZoomRanges([]);
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
        styleOverride: buildTemplateStyleOverride(selectedTemplate),
        openingSoundEffect: soundSettings.openingSoundEffect,
        transitionSoundEffect: soundSettings.transitionSoundEffect,
        captionSoundEffect: soundSettings.captionSoundEffect,
        captionSoundRhythm: soundSettings.captionSoundRhythm,
        videoZoomRanges: []
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
    setVideoZoomRanges(normalizeVideoZoomRanges(task.videoZoomRanges, task.duration || 13));
    setSoundSettings((settings) => ({
      ...settings,
      openingSoundEffect: isOpeningSoundEffect(task.openingSoundEffect) ? task.openingSoundEffect : 'none',
      transitionSoundEffect: isTransitionSoundEffect(task.transitionSoundEffect) ? task.transitionSoundEffect : 'none',
      captionSoundEffect: isCaptionSoundEffect(task.captionSoundEffect) ? task.captionSoundEffect : 'none',
      captionSoundRhythm: isCaptionSoundRhythm(task.captionSoundRhythm) ? task.captionSoundRhythm : 'recommended'
    }));
    setActiveTab('template');
    setRecentDrawerOpen(false);
    showNotice('已恢复最近字幕模板任务。', 3000);
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
      resetSubtitleSoundPlaybackState();
      if (video.ended || video.currentTime >= Math.max(0, video.duration - 0.08)) {
        video.currentTime = 0;
        setCurrentTime(0);
      }
      video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }

  function seekTo(time: number) {
    const video = videoRef.current;
    const safeTime = Math.max(0, Math.min(sourceVideo?.duration || 0, time));
    if (video) video.currentTime = safeTime;
    if (safeTime <= 2.4 || safeTime < currentTime - 0.25) {
      resetSubtitleSoundPlaybackState();
    }
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

  function showNotice(message: string, autoHideMs = 0) {
    if (noticeTimerRef.current) {
      window.clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = null;
    }
    setNotice(message);
    if (autoHideMs > 0) {
      noticeTimerRef.current = window.setTimeout(() => {
        setNotice((current) => (current === message ? '' : current));
        noticeTimerRef.current = null;
      }, autoHideMs);
    }
  }

  function updateOpeningSoundEffect(value: SubtitleOpeningSoundEffect) {
    resetSubtitleSoundPlaybackState();
    updateSoundSetting('openingSoundEffect', value);
  }

  function updateTransitionSoundEffect(value: SubtitleTransitionSoundEffect) {
    resetSubtitleSoundPlaybackState();
    updateSoundSetting('transitionSoundEffect', value);
  }

  function updateCaptionSoundEffect(value: SubtitleCaptionSoundEffect) {
    resetSubtitleSoundPlaybackState();
    updateSoundSetting('captionSoundEffect', value);
  }

  function updateCaptionSoundRhythm(value: SubtitleCaptionSoundRhythm) {
    resetSubtitleSoundPlaybackState();
    updateSoundSetting('captionSoundRhythm', value);
  }

  function resetSubtitleSoundPlaybackState() {
    lastCaptionSoundKeyRef.current = '';
    lastCaptionSoundAtRef.current = -Infinity;
    lastTransitionZoomRangeIdRef.current = '';
    openingSoundPlayedRef.current = false;
  }

  function playOpeningSoundEffect(effect: SubtitleOpeningSoundEffect) {
    if (effect === 'none') return Promise.resolve();
    return playSoundEffectSource(openingSoundEffectSources[effect]);
  }

  function playTransitionSoundEffect(effect: SubtitleTransitionSoundEffect) {
    if (effect === 'none') return Promise.resolve();
    return playSoundEffectSource(transitionSoundEffectSources[effect]);
  }

  function playCaptionSoundEffect(effect: SubtitleCaptionSoundEffect) {
    if (effect === 'none') return Promise.resolve();
    return playSoundEffectSource(captionSoundEffectSources[effect]);
  }

  function playSoundEffectSource(source: string) {
    soundEffectAudioRef.current?.pause();
    const audio = new Audio(source);
    audio.volume = Math.max(0, Math.min(1, Math.max(soundSettings.videoVolume, 35) / 100));
    soundEffectAudioRef.current = audio;
    return audio.play().catch(() => undefined);
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
      captionEntrance,
      soundFx: soundSettings.soundFx,
      videoVolume: soundSettings.videoVolume,
      openingSoundEffect: soundSettings.openingSoundEffect,
      transitionSoundEffect: soundSettings.transitionSoundEffect,
      captionSoundEffect: soundSettings.captionSoundEffect,
      captionSoundRhythm: soundSettings.captionSoundRhythm,
      videoZoomRanges: normalizeVideoZoomRanges(videoZoomRanges, sourceVideo?.duration || 0)
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
        showNotice(`已导出：${result.name || result.localPath}`, 4000);
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
                style={{ objectFit: 'cover', transform: `scale(${activeVideoZoomScale})`, transition: 'transform 120ms ease' }}
                onLoadedMetadata={(event) => {
                  const duration = event.currentTarget.duration;
                  if (Number.isFinite(duration)) {
                    setSourceVideo((video) => video ? { ...video, duration } : video);
                  }
                }}
                onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
                onPlay={() => {
                  resetSubtitleSoundPlaybackState();
                  setIsPlaying(true);
                }}
                onPause={() => setIsPlaying(false)}
                onEnded={() => {
                  setIsPlaying(false);
                  resetSubtitleSoundPlaybackState();
                }}
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
                    captionEntrance !== 'none' && `entrance-${captionEntrance}`,
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
            <button className={clsx(activeTab === 'video' && 'active')} type="button" onClick={() => setActiveTab('video')}>画面效果</button>
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
                <div className="subtitle-template-sfx-panel">
                  <label>
                    开头音效
                    <select value={soundSettings.openingSoundEffect} onChange={(event) => updateOpeningSoundEffect(event.target.value as SubtitleOpeningSoundEffect)}>
                      {openingSoundEffectOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <button type="button" title="试听开头音效" disabled={soundSettings.openingSoundEffect === 'none'} onClick={() => void playOpeningSoundEffect(soundSettings.openingSoundEffect)}>
                      <Volume2 size={15} />
                    </button>
                  </label>
                  <label>
                    转场音效
                    <select value={soundSettings.transitionSoundEffect} onChange={(event) => updateTransitionSoundEffect(event.target.value as SubtitleTransitionSoundEffect)}>
                      {transitionSoundEffectOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <button type="button" title="试听转场音效" disabled={soundSettings.transitionSoundEffect === 'none'} onClick={() => void playTransitionSoundEffect(soundSettings.transitionSoundEffect)}>
                      <Volume2 size={15} />
                    </button>
                  </label>
                  <label>
                    重点音效
                    <select value={soundSettings.captionSoundEffect} onChange={(event) => updateCaptionSoundEffect(event.target.value as SubtitleCaptionSoundEffect)}>
                      {captionSoundEffectOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <button type="button" title="试听重点音效" disabled={soundSettings.captionSoundEffect === 'none'} onClick={() => void playCaptionSoundEffect(soundSettings.captionSoundEffect)}>
                      <Volume2 size={15} />
                    </button>
                  </label>
                  <label>
                    音效节奏
                    <select value={soundSettings.captionSoundRhythm} onChange={(event) => updateCaptionSoundRhythm(event.target.value as SubtitleCaptionSoundRhythm)}>
                      {captionSoundRhythmOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <i />
                  </label>
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

          {activeTab === 'video' ? (
            <div className="subtitle-template-tab-body video-body">
              <section className="subtitle-template-video-zoom-panel">
                <header>
                  <div>
                    <strong>画面推近</strong>
                    <span>按固定秒数放大底层视频，标题和字幕不跟随缩放。</span>
                  </div>
                  <div className="subtitle-template-video-zoom-actions">
                    <button type="button" onClick={addVideoZoomRange}>添加区间</button>
                    <button type="button" onClick={applyReferenceVideoZoomPreset}>套用参考节奏</button>
                  </div>
                </header>
                {videoZoomRanges.length ? (
                  <div className="subtitle-template-video-zoom-list">
                    {videoZoomRanges.map((range, index) => (
                      <div className="subtitle-template-video-zoom-row" key={range.id}>
                        <span>#{index + 1}</span>
                        <label>
                          开始
                          <input
                            type="number"
                            min={0}
                            max={Math.max(0.1, sourceVideo?.duration || 13)}
                            step={0.1}
                            value={range.start}
                            onChange={(event) => updateVideoZoomRange(range.id, { start: Number(event.target.value) })}
                          />
                        </label>
                        <label>
                          结束
                          <input
                            type="number"
                            min={0.1}
                            max={Math.max(0.1, sourceVideo?.duration || 13)}
                            step={0.1}
                            value={range.end}
                            onChange={(event) => updateVideoZoomRange(range.id, { end: Number(event.target.value) })}
                          />
                        </label>
                        <label>
                          倍率
                          <input
                            type="number"
                            min={1.01}
                            max={1.3}
                            step={0.01}
                            value={range.scale}
                            onChange={(event) => updateVideoZoomRange(range.id, { scale: Number(event.target.value) })}
                          />
                        </label>
                        <button type="button" title="删除区间" onClick={() => deleteVideoZoomRange(range.id)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>未设置时，导出保持原始画面比例。</p>
                )}
              </section>
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
      {notice && !notice.startsWith('已应用') ? (
        <div className="subtitle-template-notice">
          <span>{notice}</span>
          <button type="button" onClick={() => showNotice('')} title="关闭提示">关闭</button>
        </div>
      ) : null}
      {processing.active ? <ProcessingDialog state={processing} onCancel={() => setProcessing(emptyProcessing)} /> : null}
    </section>
  );

  function updateSoundSetting<Key extends keyof SubtitleTemplateSoundSettings>(key: Key, value: SubtitleTemplateSoundSettings[Key]) {
    setSoundSettings((settings) => ({ ...settings, [key]: value }));
  }

  function addVideoZoomRange() {
    const duration = Math.max(0.1, sourceVideo?.duration || 13);
    const start = roundSeconds(Math.min(Math.max(0, currentTime), Math.max(0, duration - 0.1)));
    const end = roundSeconds(Math.min(duration, start + 3));
    const nextRange: SubtitleTemplateVideoZoomRange = {
      id: crypto.randomUUID(),
      start,
      end: end > start ? end : roundSeconds(Math.min(duration, start + 0.1)),
      scale: 1.2
    };
    setVideoZoomRanges((ranges) => normalizeVideoZoomRanges([...ranges, nextRange], duration));
  }

  function applyReferenceVideoZoomPreset() {
    const duration = Math.max(0.1, sourceVideo?.duration || 13);
    const preset: SubtitleTemplateVideoZoomRange[] = [
      { id: crypto.randomUUID(), start: 3, end: 6, scale: 1.2 },
      { id: crypto.randomUUID(), start: 10, end: 13, scale: 1.2 }
    ];
    setVideoZoomRanges(normalizeVideoZoomRanges(preset, duration));
    showNotice('已套用画面推近参考节奏：3-6 秒、10-13 秒。', 2600);
  }

  function updateVideoZoomRange(id: string, patch: Partial<SubtitleTemplateVideoZoomRange>) {
    const duration = Math.max(0.1, sourceVideo?.duration || 13);
    setVideoZoomRanges((ranges) => {
      const nextRanges = ranges.map((range) => {
        if (range.id !== id) return range;
        const patchedStart = patch.start === undefined ? range.start : clampSeconds(patch.start, duration);
        const patchedEnd = patch.end === undefined ? range.end : clampSeconds(patch.end, duration);
        const start = roundSeconds(Math.min(patchedStart, Math.max(0, duration - 0.1)));
        const end = roundSeconds(Math.min(duration, Math.max(start + 0.1, patchedEnd)));
        return {
          ...range,
          ...patch,
          start,
          end,
          scale: Number((Math.max(1.01, Math.min(1.3, Number(patch.scale ?? range.scale) || 1.2))).toFixed(2))
        };
      });
      return normalizeVideoZoomRanges(nextRanges, duration);
    });
  }

  function deleteVideoZoomRange(id: string) {
    setVideoZoomRanges((ranges) => ranges.filter((range) => range.id !== id));
  }
}

function normalizeVideoZoomRanges(ranges: SubtitleTemplateVideoZoomRange[] | undefined, duration: number) {
  const safeDuration = Math.max(0.1, Number(duration) || 13);
  if (!Array.isArray(ranges)) return [];
  return ranges
    .map((range) => {
      const start = roundSeconds(Math.min(clampSeconds(range.start, safeDuration), Math.max(0, safeDuration - 0.1)));
      const end = roundSeconds(Math.min(safeDuration, Math.max(start + 0.1, clampSeconds(range.end, safeDuration))));
      return {
        id: range.id || crypto.randomUUID(),
        start,
        end,
        scale: Number((Math.max(1.01, Math.min(1.3, Number(range.scale) || 1.2))).toFixed(2))
      };
    })
    .filter((range) => range.end > range.start)
    .sort((left, right) => left.start - right.start || left.end - right.end)
    .slice(0, 12);
}

function getVideoZoomScale(ranges: SubtitleTemplateVideoZoomRange[], time: number) {
  const activeRange = ranges.find((range) => time >= range.start && time < range.end);
  return activeRange ? activeRange.scale : 1;
}

function getTransitionZoomSoundRange(input: {
  currentTime: number;
  lastPlayedAt: number;
  lastRangeId: string;
  soundEffect: SubtitleTransitionSoundEffect;
  soundFx: boolean;
  videoZoomRanges: SubtitleTemplateVideoZoomRange[];
}) {
  if (!input.soundFx || input.soundEffect === 'none' || input.videoZoomRanges.length === 0) return null;
  if (input.currentTime - input.lastPlayedAt < 0.7) return null;
  return input.videoZoomRanges.find((range) => (
    range.id !== input.lastRangeId &&
    input.currentTime >= range.start &&
    input.currentTime <= Math.min(range.end, range.start + 0.5)
  )) || null;
}

function shouldPlayTransitionSound(input: {
  captions: SubtitleTemplateCaption[];
  captionIndex: number;
  currentTime: number;
  lastPlayedAt: number;
  soundEffect: SubtitleTransitionSoundEffect;
  soundFx: boolean;
}) {
  if (!input.soundFx || input.soundEffect === 'none' || input.captionIndex <= 0) return false;
  if (input.currentTime - input.lastPlayedAt < 1.1) return false;
  const caption = input.captions[input.captionIndex];
  const previous = input.captions[input.captionIndex - 1];
  if (!caption || !previous) return false;
  return caption.start - previous.end >= 0.25;
}

function shouldPlayCaptionSound(input: {
  caption: SubtitleTemplateCaption;
  captionIndex: number;
  currentTime: number;
  keywords: string;
  lastPlayedAt: number;
  rhythm: SubtitleCaptionSoundRhythm;
  soundEffect: SubtitleCaptionSoundEffect;
  soundFx: boolean;
}) {
  if (!input.soundFx || input.soundEffect === 'none' || input.rhythm === 'off') return false;
  const minGap = input.rhythm === 'all' ? 0.45 : input.rhythm === 'boost' ? 0.9 : 1.5;
  if (input.currentTime - input.lastPlayedAt < minGap) return false;
  if (input.rhythm === 'all') return true;
  if (input.captionIndex === 0 && input.currentTime <= 2.4) return true;

  const text = `${input.caption.text || ''} ${input.caption.translation || ''}`;
  const hasKeyword = normalizeCaptionSoundKeywords(input.keywords).some((keyword) => text.includes(keyword));
  const hasEmphasisSignal = /[0-9一二三四五六七八九十百千万亿￥¥$%]|价格|优惠|重点|结论|最后|记住|必看|马上|直接|推荐|省钱|别买|划算|爆款|上新|限时|免费|教程|方法/.test(text);
  if (input.rhythm === 'recommended') return hasKeyword || hasEmphasisSignal;
  return hasKeyword || hasEmphasisSignal || input.captionIndex % 2 === 0;
}

function normalizeCaptionSoundKeywords(keywords: string) {
  return keywords
    .split(/[,，、\s]+/g)
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword.length >= 2);
}

function isOpeningSoundEffect(value: unknown): value is SubtitleOpeningSoundEffect {
  return openingSoundEffectOptions.some((option) => option.value === value);
}

function isTransitionSoundEffect(value: unknown): value is SubtitleTransitionSoundEffect {
  return transitionSoundEffectOptions.some((option) => option.value === value);
}

function isCaptionSoundEffect(value: unknown): value is SubtitleCaptionSoundEffect {
  return captionSoundEffectOptions.some((option) => option.value === value);
}

function isCaptionSoundRhythm(value: unknown): value is SubtitleCaptionSoundRhythm {
  return captionSoundRhythmOptions.some((option) => option.value === value);
}

function clampSeconds(value: number, duration: number) {
  const safeValue = Number(value);
  if (!Number.isFinite(safeValue)) return 0;
  return Math.max(0, Math.min(Math.max(0.1, duration), safeValue));
}

function roundSeconds(value: number) {
  return Number((Math.round(value * 100) / 100).toFixed(2));
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
  if (entrance === 'none') return renderHighlightedText(text, keywords);
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
