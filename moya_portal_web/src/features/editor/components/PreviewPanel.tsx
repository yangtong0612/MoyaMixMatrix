import { Maximize2, Menu, Play, ScanLine, SkipBack, SkipForward, Volume2 } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { useEditorStore } from '../editorStore';
import { toMediaUrl } from '../mediaUrl';

export function PreviewPanel() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const activeMaterialId = useEditorStore((state) => state.activeMaterialId);
  const material = useEditorStore((state) => state.materials.find((item) => item.id === activeMaterialId));
  const updateMaterial = useEditorStore((state) => state.updateMaterial);
  const setCurrentTime = useEditorStore((state) => state.setCurrentTime);
  const currentTime = useEditorStore((state) => state.currentTime);
  const sourceUrl = useMemo(() => toMediaUrl(material?.path), [material?.path]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || Math.abs(video.currentTime - currentTime) < 0.35) return;
    video.currentTime = currentTime;
  }, [currentTime, sourceUrl]);

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }

  return (
    <section className="preview-panel">
      <div className="preview-header">
        <strong>播放器</strong>
        <button className="icon-button" type="button" title="播放器菜单">
          <Menu size={16} />
        </button>
      </div>
      <div className="video-stage">
        {material?.type === 'video' && sourceUrl ? (
          <video
            ref={videoRef}
            className="preview-video"
            src={sourceUrl}
            controls={false}
            onLoadedMetadata={(event) => {
              const duration = event.currentTarget.duration;
              if (Number.isFinite(duration)) updateMaterial(material.id, { duration });
            }}
            onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
          />
        ) : material ? (
          <div className="video-placeholder active-preview">
            <Play size={42} />
            <strong>{material.name}</strong>
            <span>{material.type === 'audio' ? '音频素材已选中，可添加到音频轨' : '素材已选中，可添加到时间线'}</span>
          </div>
        ) : (
          <div className="video-placeholder">
            <Play size={42} />
            <span>预览区</span>
          </div>
        )}
      </div>
      <div className="player-controls">
        <button className="icon-button" type="button" title="上一帧">
          <SkipBack size={16} />
        </button>
        <button className="play-button" type="button" title="播放" onClick={togglePlay} disabled={!material}>
          <Play size={18} />
        </button>
        <button className="icon-button" type="button" title="下一帧">
          <SkipForward size={16} />
        </button>
        <div className="timecode">{formatTime(currentTime)} / {formatTime(material?.duration || 0)}</div>
        <button className="icon-button" type="button" title="音量">
          <Volume2 size={16} />
        </button>
        <button className="icon-button" type="button" title="适配">
          <ScanLine size={16} />
        </button>
        <button className="icon-button" type="button" title="全屏">
          <Maximize2 size={16} />
        </button>
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
