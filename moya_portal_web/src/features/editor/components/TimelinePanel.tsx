import { MousePointer2, SplitSquareHorizontal, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { editorToolGroups } from '../EditorPage';
import { type MaterialItem, useEditorStore } from '../editorStore';
import { toMediaUrl } from '../mediaUrl';

const tracks = [
  { id: 'video', label: '视频轨 1' },
  { id: 'annotation', label: '标注轨' },
  { id: 'audio', label: '音频轨' }
];

export function TimelinePanel() {
  const timelineRef = useRef<HTMLDivElement>(null);
  const segments = useEditorStore((state) => state.segments);
  const materials = useEditorStore((state) => state.materials);
  const currentTime = useEditorStore((state) => state.currentTime);
  const setCurrentTime = useEditorStore((state) => state.setCurrentTime);
  const addMaterialToTimeline = useEditorStore((state) => state.addMaterialToTimeline);
  const setActiveMaterial = useEditorStore((state) => state.setActiveMaterial);
  const selectSegment = useEditorStore((state) => state.selectSegment);
  const selectedSegmentId = useEditorStore((state) => state.selectedSegmentId);
  const timelineDuration = useMemo(() => {
    const contentEnd = segments.reduce((max, segment) => Math.max(max, segment.start + segment.duration), 0);
    return Math.max(60, Math.ceil(contentEnd / 5) * 5);
  }, [segments]);
  const tickCount = Math.floor(timelineDuration / 5) + 1;
  const playheadLeft = `${Math.min(100, (currentTime / timelineDuration) * 100)}%`;

  function setTimeFromPointer(clientX: number) {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    setCurrentTime((x / rect.width) * timelineDuration);
  }

  return (
    <section className="timeline-panel">
      <div className="timeline-toolbar">
        <div className="tool-strip">
          {editorToolGroups.slice(0, 4).map((tool) => (
            <button className="icon-button" type="button" title={tool.label} key={tool.label}>
              <tool.icon size={16} />
            </button>
          ))}
        </div>
        <div className="tool-strip">
          <button className="icon-button" type="button" title="选择">
            <MousePointer2 size={16} />
          </button>
          <button className="icon-button" type="button" title="分割">
            <SplitSquareHorizontal size={16} />
          </button>
          <button className="icon-button danger" type="button" title="删除">
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <div className="timeline-content">
        <div className="timeline-ruler">
          <div className="timeline-label-spacer" />
          <div
            className="timeline-scale"
            ref={timelineRef}
            style={{ gridTemplateColumns: `repeat(${tickCount}, 1fr)` }}
            onClick={(event) => setTimeFromPointer(event.clientX)}
          >
            {Array.from({ length: tickCount }).map((_, index) => (
              <span key={index}>{formatTick(index * 5)}</span>
            ))}
            <div className="timeline-progress" style={{ width: playheadLeft }} />
          </div>
        </div>

        <div className="tracks">
          <div className="timeline-playhead-layer">
            <div className="timeline-playhead" style={{ left: playheadLeft }} />
          </div>
          {tracks.map((track, trackIndex) => (
            <div className="track-row" key={track.id}>
              <div className="track-label">{track.label}</div>
              <div
                className="track-lane"
                onClick={(event) => setTimeFromPointer(event.clientX)}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'copy';
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const materialId = event.dataTransfer.getData('application/x-moya-material');
                  if (materialId) addMaterialToTimeline(materialId);
                }}
              >
                {segments.length === 0 && trackIndex === 0 ? <span className="drop-hint">拖入素材开始剪辑</span> : null}
                {segments
                  .filter((segment) => segment.trackId === track.id)
                  .map((segment) => {
                    const material = materials.find((item) => item.id === segment.materialId);
                    return (
                      <button
                        className={selectedSegmentId === segment.id ? 'timeline-clip selected' : 'timeline-clip'}
                        type="button"
                        key={segment.id}
                        style={{
                          left: `${(segment.start / timelineDuration) * 100}%`,
                          width: `${Math.max(2, (segment.duration / timelineDuration) * 100)}%`
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          selectSegment(segment.id);
                          setActiveMaterial(segment.materialId);
                          setCurrentTime(segment.start);
                        }}
                      >
                        {material?.type === 'video' ? <TimelineFilmstrip material={material} /> : null}
                        <span>{segment.label || material?.name || '素材片段'}</span>
                      </button>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function formatTick(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}

function TimelineFilmstrip({ material }: { material: MaterialItem }) {
  const [frames, setFrames] = useState<string[]>([]);
  const sourceUrl = toMediaUrl(material.path);

  useEffect(() => {
    if (!sourceUrl) return;

    let canceled = false;
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';
    video.playsInline = true;
    video.src = sourceUrl;
    video.style.position = 'fixed';
    video.style.left = '-9999px';
    video.style.top = '-9999px';
    video.style.width = '160px';
    video.style.height = '90px';
    document.body.appendChild(video);

    async function captureFrames() {
      try {
        await waitFor(video, 'loadedmetadata');
        const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : material.duration || 10;
        const frameCount = Math.min(14, Math.max(6, Math.ceil(duration / 1.2)));
        const canvas = document.createElement('canvas');
        canvas.width = 120;
        canvas.height = 68;
        const context = canvas.getContext('2d');
        if (!context) return;

        const nextFrames: string[] = [];
        for (let index = 0; index < frameCount; index += 1) {
          if (canceled) return;
          const ratio = frameCount === 1 ? 0 : index / (frameCount - 1);
          video.currentTime = Math.min(Math.max(duration * ratio, 0), Math.max(duration - 0.08, 0));
          await waitFor(video, 'seeked');
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          nextFrames.push(canvas.toDataURL('image/jpeg', 0.72));
        }

        if (!canceled) setFrames(nextFrames);
      } catch {
        if (!canceled) setFrames([]);
      }
    }

    captureFrames();

    return () => {
      canceled = true;
      video.remove();
    };
  }, [sourceUrl, material.duration]);

  if (frames.length === 0) return <div className="timeline-filmstrip is-loading" />;

  return (
    <div className="timeline-filmstrip">
      {frames.map((frame, index) => (
        <img src={frame} alt="" key={`${frame}-${index}`} />
      ))}
    </div>
  );
}

function waitFor(target: HTMLMediaElement, eventName: 'loadedmetadata' | 'seeked') {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      target.removeEventListener(eventName, onEvent);
      target.removeEventListener('error', onError);
    };
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('Video frame capture failed'));
    };
    target.addEventListener(eventName, onEvent, { once: true });
    target.addEventListener('error', onError, { once: true });
  });
}
