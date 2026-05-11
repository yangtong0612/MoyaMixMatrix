import { FastForward, Maximize2, Menu, Pause, Play, Rewind, ScanLine, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { defaultClipSettings, useEditorStore } from '../editorStore';
import { toMediaUrl } from '../mediaUrl';

export function PreviewPanel() {
  const panelRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [fitMode, setFitMode] = useState<'contain' | 'cover'>('contain');
  const [quality, setQuality] = useState('original');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '1:1'>('16:9');
  const activeMaterialId = useEditorStore((state) => state.activeMaterialId);
  const material = useEditorStore((state) => state.materials.find((item) => item.id === activeMaterialId));
  const clipSettings = useEditorStore((state) => (activeMaterialId ? state.clipSettings[activeMaterialId] : undefined));
  const updateMaterial = useEditorStore((state) => state.updateMaterial);
  const setCurrentTime = useEditorStore((state) => state.setCurrentTime);
  const currentTime = useEditorStore((state) => state.currentTime);
  const sourceUrl = useMemo(() => toMediaUrl(material?.path), [material?.path]);
  const duration = material?.duration && Number.isFinite(material.duration) ? material.duration : 0;
  const settings = { ...defaultClipSettings, ...clipSettings };
  const animationScale = settings.animation === 'zoom' ? 1.08 : 1;
  const animationOpacity = settings.animation === 'fade' ? 0.78 : 1;
  const visualFilter = [
    `brightness(${settings.brightness}%)`,
    `contrast(${settings.contrast}%)`,
    `saturate(${settings.saturation}%)`,
    settings.animation === 'blur' ? 'blur(1.5px)' : '',
    aiFilter(settings.aiEffect)
  ].filter(Boolean).join(' ');

  useEffect(() => {
    const video = videoRef.current;
    if (!video || Math.abs(video.currentTime - currentTime) < 0.35) return;
    video.currentTime = currentTime;
  }, [currentTime, sourceUrl]);

  useEffect(() => {
    setIsPlaying(false);
  }, [sourceUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = Math.max(0, Math.min(1, settings.volume / 100));
    video.playbackRate = settings.speed;
    video.preservesPitch = settings.preservePitch;
  }, [settings.volume, settings.speed, settings.preservePitch, sourceUrl]);

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }

  function seekBy(seconds: number) {
    const video = videoRef.current;
    const nextTime = Math.max(0, Math.min(duration || video?.duration || 0, currentTime + seconds));
    if (video) video.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  function toggleMute() {
    const video = videoRef.current;
    const nextMuted = !isMuted;
    if (video) video.muted = nextMuted;
    setIsMuted(nextMuted);
  }

  function toggleFitMode() {
    setFitMode((mode) => (mode === 'contain' ? 'cover' : 'contain'));
  }

  function toggleFullscreen() {
    const panel = panelRef.current;
    if (!panel) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
    } else {
      panel.requestFullscreen().catch(() => undefined);
    }
  }

  function cycleAspectRatio() {
    setAspectRatio((ratio) => {
      if (ratio === '16:9') return '9:16';
      if (ratio === '9:16') return '1:1';
      return '16:9';
    });
  }

  return (
    <section className={`preview-panel ratio-${aspectRatio.replace(':', '-')}`} ref={panelRef}>
      <div className="preview-header">
        <strong>播放器</strong>
        <button className="icon-button" type="button" title="播放器菜单">
          <Menu size={16} />
        </button>
      </div>
      <div className="video-stage">
        {material?.type === 'video' && sourceUrl ? (
          <div className={`preview-canvas-box animation-${settings.animation} ai-${settings.aiEffect}`}>
            <video
              ref={videoRef}
              className={`preview-video fit-${fitMode}`}
              src={sourceUrl}
              controls={false}
              style={{
                transform: `translate(${settings.x}px, ${settings.y}px) scale(${(settings.scale / 100) * animationScale}) rotate(${settings.rotation}deg)`,
                filter: visualFilter,
                opacity: animationOpacity
              }}
              onLoadedMetadata={(event) => {
                const duration = event.currentTarget.duration;
                if (Number.isFinite(duration)) updateMaterial(material.id, { duration });
              }}
              onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
            />
            <span className="canvas-handle top-left" />
            <span className="canvas-handle top-right" />
            <span className="canvas-handle bottom-left" />
            <span className="canvas-handle bottom-right" />
          </div>
        ) : material ? (
          <div className="video-placeholder active-preview">
            <Play size={42} />
            <strong>{material.name}</strong>
            <span>{material.type === 'audio' ? '音频素材已选中，可添加到音频轨' : '素材已选中，可添加到时间线'}</span>
          </div>
        ) : (
          <div className="video-placeholder">
            <span>预览区</span>
          </div>
        )}
      </div>
      <div className="player-controls">
        <div className="player-meta">
          <span className="timecode current">{formatTime(currentTime)}</span>
          <span className="timecode total">{formatTime(duration)}</span>
          <button className="meter-button" type="button" title={isMuted ? '取消静音' : '静音'} onClick={toggleMute} disabled={!material}>
            {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            <span />
            <span />
            <span />
          </button>
        </div>

        <div className="player-transport">
          <button className="player-ghost-button" type="button" title="快退 5 秒" onClick={() => seekBy(-5)} disabled={!material}>
            <Rewind size={15} />
          </button>
          <button className="play-button capcut-play" type="button" title={isPlaying ? '暂停' : '播放'} onClick={togglePlay} disabled={!material}>
            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <button className="player-ghost-button" type="button" title="快进 5 秒" onClick={() => seekBy(5)} disabled={!material}>
            <FastForward size={15} />
          </button>
        </div>

        <div className="player-view-actions">
          <label className="quality-select capcut-quality" title="清晰度">
            <select value={quality} onChange={(event) => setQuality(event.target.value)} disabled={!material}>
              <option value="original">原画</option>
              <option value="auto">自动</option>
              <option value="1080p">1080P</option>
              <option value="720p">720P</option>
              <option value="480p">480P</option>
            </select>
          </label>
          <button className="player-text-button" type="button" title={fitMode === 'contain' ? '填充预览' : '适配预览'} onClick={toggleFitMode} disabled={!material}>
            <ScanLine size={15} />
          </button>
          <button className="player-text-button ratio-button" type="button" title="切换画布比例" onClick={cycleAspectRatio} disabled={!material}>
            {aspectRatio}
          </button>
          <button className="player-text-button" type="button" title="全屏预览" onClick={toggleFullscreen}>
            <Maximize2 size={16} />
          </button>
        </div>
      </div>
    </section>
  );
}

function formatTime(value: number) {
  const totalSeconds = Math.max(0, Math.floor(value));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function aiFilter(effect: string) {
  if (effect === 'comic') return 'contrast(135%) saturate(150%)';
  if (effect === 'cinema') return 'contrast(120%) saturate(82%) brightness(92%)';
  if (effect === 'fresh') return 'brightness(112%) saturate(118%)';
  if (effect === 'glow') return 'brightness(118%) contrast(112%)';
  if (effect === 'portrait') return 'brightness(108%) saturate(112%)';
  return '';
}
