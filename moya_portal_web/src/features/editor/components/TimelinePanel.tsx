import {
  Brackets,
  Crop,
  ImagePlus,
  Eye,
  EyeOff,
  Link2,
  Lock,
  Magnet,
  Mic,
  MousePointer2,
  Redo2,
  Scissors,
  Shield,
  SplitSquareHorizontal,
  Trash2,
  Undo2,
  Unlock,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { type MaterialItem, useEditorStore } from '../editorStore';
import { toMediaUrl } from '../mediaUrl';

export function TimelinePanel() {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; segmentId: string } | null>(null);
  const [coverDialog, setCoverDialog] = useState<{
    segmentId: string;
    materialId: string;
    frames: Array<{ url: string; time: number }>;
    selectedIndex: number;
    loading: boolean;
  } | null>(null);
  const [draggingSegment, setDraggingSegment] = useState<{
    id: string;
    pointerOffset: number;
    baseSegments: ReturnType<typeof useEditorStore.getState>['segments'];
  } | null>(null);
  const [draggingPlayhead, setDraggingPlayhead] = useState(false);
  const [activeTool, setActiveTool] = useState<'select' | 'split' | 'trim' | 'crop'>('select');
  const [snapping, setSnapping] = useState(true);
  const [linkedSelection, setLinkedSelection] = useState(false);
  const [protectedEdit, setProtectedEdit] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [trackStates, setTrackStates] = useState<Record<string, { locked: boolean; visible: boolean; muted: boolean }>>({});
  const segments = useEditorStore((state) => state.segments);
  const materials = useEditorStore((state) => state.materials);
  const undoStack = useEditorStore((state) => state.undoStack);
  const redoStack = useEditorStore((state) => state.redoStack);
  const currentTime = useEditorStore((state) => state.currentTime);
  const setCurrentTime = useEditorStore((state) => state.setCurrentTime);
  const addMaterialToTimeline = useEditorStore((state) => state.addMaterialToTimeline);
  const addMaterialToTrack = useEditorStore((state) => state.addMaterialToTrack);
  const deleteSegment = useEditorStore((state) => state.deleteSegment);
  const moveSegment = useEditorStore((state) => state.moveSegment);
  const splitSegmentAt = useEditorStore((state) => state.splitSegmentAt);
  const addVoiceoverSegment = useEditorStore((state) => state.addVoiceoverSegment);
  const setProjectCover = useEditorStore((state) => state.setProjectCover);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const setActiveMaterial = useEditorStore((state) => state.setActiveMaterial);
  const selectSegment = useEditorStore((state) => state.selectSegment);
  const selectedSegmentId = useEditorStore((state) => state.selectedSegmentId);
  const timelineDuration = useMemo(() => {
    const contentEnd = segments.reduce((max, segment) => Math.max(max, segment.start + segment.duration), 0);
    return Math.max(60, Math.ceil(contentEnd / 5) * 5);
  }, [segments]);
  const tickStep = 5;
  const tickCount = Math.floor(timelineDuration / tickStep) + 1;
  const playheadLeft = `${Math.min(100, (currentTime / timelineDuration) * 100)}%`;
  const dynamicTracks = useMemo(() => buildTracks(segments), [segments]);
  const getTrackState = (trackId: string) => trackStates[trackId] || { locked: false, visible: true, muted: false };

  function timeFromPointer(clientX: number) {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    return (x / rect.width) * timelineDuration;
  }

  function setTimeFromPointer(clientX: number, freeMove = false) {
    const rawTime = timeFromPointer(clientX);
    setCurrentTime(!freeMove && snapping ? snapTime(rawTime, segments) : rawTime);
  }

  function selectTimelineSegment(segmentId: string, materialId: string, start: number) {
    selectSegment(segmentId);
    setActiveMaterial(materialId);
    setCurrentTime(start);
  }

  function removeSegment(segmentId?: string) {
    if (protectedEdit) return;
    const segment = segments.find((item) => item.id === (segmentId || selectedSegmentId));
    if (segment && getTrackState(segment.trackId).locked) return;
    deleteSegment(segmentId);
    setContextMenu(null);
  }

  function splitSelectedSegment() {
    if (protectedEdit) return;
    const segment = segments.find((item) => item.id === selectedSegmentId);
    if (segment && getTrackState(segment.trackId).locked) return;
    splitSegmentAt(currentTime, selectedSegmentId);
  }

  function setZoom(nextZoom: number) {
    setZoomLevel(Math.max(0.7, Math.min(2.5, Number(nextZoom.toFixed(2)))));
  }

  function nextVideoTrackId() {
    const usedIndexes = dynamicTracks
      .map((track) => track.id.match(/^video-(\d+)$/)?.[1])
      .filter(Boolean)
      .map(Number);
    const nextIndex = Math.max(1, ...usedIndexes) + 1;
    return `video-${nextIndex}`;
  }

  function toggleTrackState(trackId: string, key: 'locked' | 'visible' | 'muted') {
    setTrackStates((state) => {
      const current = state[trackId] || { locked: false, visible: true, muted: false };
      return { ...state, [trackId]: { ...current, [key]: !current[key] } };
    });
  }

  async function setCoverFromCurrentFrame(segmentId = selectedSegmentId) {
    const segment = segments.find((item) => item.id === segmentId);
    if (!segment || segment.trackId === 'cover') return;
    const material = materials.find((item) => item.id === segment.materialId);
    const sourceUrl = toMediaUrl(material?.path);
    if (!material || material.type !== 'video' || !sourceUrl) return;
    const frameTime = Math.max(0, Math.min(material.duration || segment.duration, currentTime - segment.start));
    const coverUrl = await captureVideoCover(sourceUrl, frameTime);
    setProjectCover(material.id, coverUrl, currentTime);
    setContextMenu(null);
  }

  async function openCoverDialog(segmentId = selectedSegmentId) {
    const segment = segments.find((item) => item.id === segmentId) || segments.find((item) => item.trackId === 'video');
    if (!segment || segment.trackId === 'cover') return;
    const material = materials.find((item) => item.id === segment.materialId);
    const sourceUrl = toMediaUrl(material?.path);
    if (!material || material.type !== 'video' || !sourceUrl) return;

    setCoverDialog({ segmentId: segment.id, materialId: material.id, frames: [], selectedIndex: 0, loading: true });
    const frames = await captureCoverFrames(sourceUrl, material.duration || segment.duration);
    const currentOffset = Math.max(0, Math.min(material.duration || segment.duration, currentTime - segment.start));
    const selectedIndex = frames.length === 0 ? 0 : frames.reduce((bestIndex, frame, index) => {
      return Math.abs(frame.time - currentOffset) < Math.abs(frames[bestIndex].time - currentOffset) ? index : bestIndex;
    }, 0);
    setCoverDialog({ segmentId: segment.id, materialId: material.id, frames, selectedIndex, loading: false });
  }

  function confirmCoverDialog() {
    if (!coverDialog || coverDialog.frames.length === 0) return;
    const frame = coverDialog.frames[coverDialog.selectedIndex];
    const segment = segments.find((item) => item.id === coverDialog.segmentId);
    setProjectCover(coverDialog.materialId, frame.url, (segment?.start || 0) + frame.time);
    setCoverDialog(null);
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT';
      if (isTyping) return;
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedSegmentId) {
        event.preventDefault();
        removeSegment(selectedSegmentId);
      }
      if ((event.key === 'b' || event.key === 'B') && selectedSegmentId) {
        event.preventDefault();
        splitSelectedSegment();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        undo();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
      }
      if (event.key === 'Escape') setContextMenu(null);
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedSegmentId]);

  useEffect(() => {
    if (!draggingSegment && !draggingPlayhead) return;

    function handlePointerMove(event: PointerEvent) {
      if (draggingPlayhead) {
        setTimeFromPointer(event.clientX, true);
        return;
      }
      if (!draggingSegment) return;
      const rawStart = timeFromPointer(event.clientX) - draggingSegment.pointerOffset;
      const nextStart = snapping ? snapTime(rawStart, segments.filter((segment) => segment.id !== draggingSegment.id)) : rawStart;
      moveSegment(draggingSegment.id, nextStart);
    }

    function handlePointerUp(event: PointerEvent) {
      if (draggingSegment) {
        const rawStart = timeFromPointer(event.clientX) - draggingSegment.pointerOffset;
        const nextStart = snapping ? snapTime(rawStart, segments.filter((segment) => segment.id !== draggingSegment.id)) : rawStart;
        moveSegment(draggingSegment.id, nextStart, draggingSegment.baseSegments);
      }
      setDraggingSegment(null);
      setDraggingPlayhead(false);
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [draggingSegment, draggingPlayhead, segments, snapping, timelineDuration]);

  return (
    <section className="timeline-panel" onClick={() => setContextMenu(null)}>
      <div className="timeline-toolbar">
        <div className="tool-strip timeline-tool-strip primary">
          <button className={activeTool === 'select' ? 'icon-button active' : 'icon-button'} type="button" title="选择工具：选中、移动和右键管理片段" onClick={() => setActiveTool('select')}>
            <MousePointer2 size={16} />
          </button>
          <button className="icon-button" type="button" title="撤销 Ctrl+Z" onClick={undo} disabled={undoStack.length === 0}>
            <Undo2 size={16} />
          </button>
          <button className="icon-button" type="button" title="重做 Ctrl+Y" onClick={redo} disabled={redoStack.length === 0}>
            <Redo2 size={16} />
          </button>
          <span className="timeline-tool-divider" />
          <button className={activeTool === 'split' ? 'icon-button active' : 'icon-button'} type="button" title="分割：在播放头位置切开选中片段，快捷键 B" onClick={splitSelectedSegment} disabled={!selectedSegmentId || protectedEdit}>
            <Scissors size={16} />
          </button>
          <button className={activeTool === 'trim' ? 'icon-button active' : 'icon-button'} type="button" title="修剪工具：当前版本用于进入修剪状态" onClick={() => setActiveTool('trim')}>
            <Brackets size={16} />
          </button>
          <button className={activeTool === 'crop' ? 'icon-button active' : 'icon-button'} type="button" title="裁剪工具：当前版本用于进入画面裁剪状态" onClick={() => setActiveTool('crop')}>
            <Crop size={16} />
          </button>
          <button className="icon-button" type="button" title="设为封面：截取当前播放头画面" onClick={() => void openCoverDialog()} disabled={segments.length === 0}>
            <ImagePlus size={16} />
          </button>
          <button className="icon-button danger" type="button" title="删除选中片段" onClick={() => removeSegment()} disabled={!selectedSegmentId || protectedEdit}>
            <Trash2 size={16} />
          </button>
          <button className={protectedEdit ? 'icon-button active' : 'icon-button'} type="button" title="保护剪辑：开启后禁止删除/分割片段" onClick={() => setProtectedEdit((value) => !value)}>
            <Shield size={16} />
          </button>
        </div>
        <div className="timeline-tool-status">
          <span>{toolDescription(activeTool)}</span>
        </div>
        <div className="tool-strip timeline-tool-strip right">
          <button className="icon-button" type="button" title="录音：在音频轨添加一段录音占位" onClick={() => addVoiceoverSegment(currentTime)} disabled={protectedEdit}>
            <Mic size={16} />
          </button>
          <button className={snapping ? 'icon-button active' : 'icon-button'} type="button" title="吸附：播放头靠近片段边缘时自动贴合" onClick={() => setSnapping((value) => !value)}>
            <Magnet size={16} />
          </button>
          <button className={linkedSelection ? 'icon-button active' : 'icon-button'} type="button" title="联动选择：为后续音视频同步选择预留" onClick={() => setLinkedSelection((value) => !value)}>
            <Link2 size={16} />
          </button>
          <button className="icon-button" type="button" title="缩小时间线" onClick={() => setZoom(zoomLevel - 0.2)}>
            <ZoomOut size={16} />
          </button>
          <input className="timeline-zoom" type="range" min="0.7" max="2.5" step="0.1" value={zoomLevel} onChange={(event) => setZoom(Number(event.target.value))} aria-label="时间线缩放" />
          <button className="icon-button" type="button" title="放大时间线" onClick={() => setZoom(zoomLevel + 0.2)}>
            <ZoomIn size={16} />
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
            onPointerDown={(event) => {
              setDraggingPlayhead(true);
              setTimeFromPointer(event.clientX, true);
            }}
          >
            {Array.from({ length: tickCount }).map((_, index) => (
              <span key={index}>{formatTick(index * tickStep)}</span>
            ))}
            {Array.from({ length: timelineDuration + 1 }).map((_, index) => (
              <i className={index % 5 === 0 ? 'timeline-minor-tick major' : 'timeline-minor-tick'} style={{ left: `${(index / timelineDuration) * 100}%` }} key={`minor-${index}`} />
            ))}
            <div className="timeline-progress" style={{ width: playheadLeft }} />
          </div>
        </div>

        <div className="tracks">
          <div className="timeline-playhead-layer">
            <div
              className="timeline-playhead"
              style={{ left: playheadLeft }}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setDraggingPlayhead(true);
              }}
            />
          </div>
          {segments.length === 0 ? (
            <div
              className="track-row track-row-main-empty"
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
              <div className="track-label">主轨</div>
              <div className="track-lane track-lane-main-empty">
                <span className="main-track-empty-hint">素材拖拽到这里，开始你的大作吧~</span>
              </div>
            </div>
          ) : null}
          {segments.length > 0 ? dynamicTracks.map((track, trackIndex) => (
            <div className={`track-row track-row-${track.id}`} key={track.id}>
              <div className="track-label">
                <div className="track-controls">
                  <button type="button" title={getTrackState(track.id).locked ? '解锁轨道' : '锁定轨道'} onClick={() => toggleTrackState(track.id, 'locked')}>
                    {getTrackState(track.id).locked ? <Lock size={12} /> : <Unlock size={12} />}
                  </button>
                  <button type="button" title={getTrackState(track.id).visible ? '隐藏轨道' : '显示轨道'} onClick={() => toggleTrackState(track.id, 'visible')}>
                    {getTrackState(track.id).visible ? <Eye size={12} /> : <EyeOff size={12} />}
                  </button>
                  <button type="button" title={getTrackState(track.id).muted ? '打开原声' : '关闭原声'} onClick={() => toggleTrackState(track.id, 'muted')}>
                    {getTrackState(track.id).muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
                  </button>
                </div>
                <span className="track-type-label">{track.label}</span>
                {track.id === 'video' ? (
                  <button className="track-cover-button" type="button" title="设置封面" onClick={(event) => {
                    event.stopPropagation();
                    void openCoverDialog();
                  }}>
                    <ImagePlus size={13} />
                    封面
                  </button>
                ) : null}
              </div>
              <div
                className={`track-lane track-lane-${track.id}${getTrackState(track.id).visible ? '' : ' is-hidden'}${getTrackState(track.id).muted ? ' is-muted' : ''}${getTrackState(track.id).locked ? ' is-locked' : ''}`}
                onClick={(event) => {
                  selectSegment(undefined);
                  setContextMenu(null);
                  setTimeFromPointer(event.clientX);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = getTrackState(track.id).locked ? 'none' : 'copy';
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (getTrackState(track.id).locked) return;
                  const materialId = event.dataTransfer.getData('application/x-moya-material');
                  if (!materialId) return;
                  const material = materials.find((item) => item.id === materialId);
                  const targetTrackId = material?.type === 'audio' ? 'audio' : track.id;
                  addMaterialToTrack(materialId, targetTrackId, timeFromPointer(event.clientX));
                }}
              >
                {segments.length === 0 && trackIndex === 0 ? <span className="drop-hint">拖入素材开始剪辑</span> : null}
                {segments
                  .filter((segment) => segment.trackId === track.id)
                  .map((segment) => {
                    const material = materials.find((item) => item.id === segment.materialId);
                    return (
                      <button
                        className={selectedSegmentId === segment.id ? `timeline-clip clip-${track.id} selected` : `timeline-clip clip-${track.id}`}
                        type="button"
                        key={segment.id}
                        style={{
                          left: `${(segment.start / timelineDuration) * 100}%`,
                          width: `${Math.max(2, (segment.duration / timelineDuration) * 100)}%`
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          setContextMenu(null);
                          selectTimelineSegment(segment.id, segment.materialId, segment.start);
                          if (activeTool === 'split' && !getTrackState(segment.trackId).locked) splitSegmentAt(currentTime, segment.id);
                        }}
                        onPointerDown={(event) => {
                          if (event.button !== 0 || activeTool !== 'select' || protectedEdit || getTrackState(segment.trackId).locked) return;
                          event.stopPropagation();
                          const pointerTime = timeFromPointer(event.clientX);
                          selectTimelineSegment(segment.id, segment.materialId, segment.start);
                          setDraggingSegment({
                            id: segment.id,
                            pointerOffset: pointerTime - segment.start,
                            baseSegments: segments
                          });
                        }}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          selectTimelineSegment(segment.id, segment.materialId, segment.start);
                          setContextMenu({ x: event.clientX, y: event.clientY, segmentId: segment.id });
                        }}
                      >
                        {track.id === 'cover' && material?.coverUrl ? <img className="timeline-cover-frame" src={material.coverUrl} alt="" /> : null}
                        {track.id !== 'cover' && material?.type === 'video' ? <TimelineFilmstrip material={material} /> : null}
                        <span>{segment.label || material?.name || '素材片段'}</span>
                      </button>
                    );
                  })}
              </div>
            </div>
          )) : null}
          {segments.length > 0 ? <div
            className="track-row track-row-new-video"
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'copy';
            }}
            onDrop={(event) => {
              event.preventDefault();
              const materialId = event.dataTransfer.getData('application/x-moya-material');
              const material = materials.find((item) => item.id === materialId);
              if (!materialId || material?.type === 'audio') return;
              addMaterialToTrack(materialId, nextVideoTrackId(), timeFromPointer(event.clientX));
            }}
          >
            <div className="track-label">新视频轨</div>
            <div className="track-lane track-lane-new-video">
              <span className="drop-hint">拖到这里新建视频轨</span>
            </div>
          </div> : null}
        </div>
      </div>
      {contextMenu ? (
        <div className="timeline-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(event) => event.stopPropagation()}>
          <button type="button" onClick={() => removeSegment(contextMenu.segmentId)}>
            <Trash2 size={14} />
            删除片段
          </button>
          <button
            type="button"
            onClick={() => {
              const segment = segments.find((item) => item.id === contextMenu.segmentId);
              if (!segment || getTrackState(segment.trackId).locked) return;
              splitSegmentAt(currentTime, contextMenu.segmentId);
            }}
          >
            <SplitSquareHorizontal size={14} />
            在播放头分割
          </button>
          <button type="button" onClick={() => void setCoverFromCurrentFrame(contextMenu.segmentId)}>
            <ImagePlus size={14} />
            设为封面
          </button>
        </div>
      ) : null}
      {coverDialog ? (
        <div className="cover-dialog-backdrop" onClick={() => setCoverDialog(null)}>
          <div className="cover-dialog" onClick={(event) => event.stopPropagation()}>
            <header>封面选择</header>
            <div className="cover-preview">
              {coverDialog.frames[coverDialog.selectedIndex] ? <img src={coverDialog.frames[coverDialog.selectedIndex].url} alt="" /> : <span>正在生成封面...</span>}
            </div>
            <div className="cover-source-tabs">
              <button className="active" type="button">视频帧</button>
              <button type="button">本地</button>
            </div>
            <div className="cover-filmstrip">
              {coverDialog.loading ? <span>正在读取视频帧...</span> : coverDialog.frames.map((frame, index) => (
                <button className={coverDialog.selectedIndex === index ? 'active' : undefined} type="button" key={`${frame.time}-${index}`} onClick={() => setCoverDialog({ ...coverDialog, selectedIndex: index })}>
                  <img src={frame.url} alt="" />
                </button>
              ))}
            </div>
            <footer>
              <button className="primary-action" type="button" onClick={confirmCoverDialog} disabled={coverDialog.frames.length === 0}>设为封面</button>
              <button type="button" onClick={() => setCoverDialog(null)}>取消</button>
            </footer>
          </div>
        </div>
      ) : null}
    </section>
  );
}

async function captureVideoCover(sourceUrl: string, time: number) {
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  video.playsInline = true;
  video.src = sourceUrl;
  video.style.position = 'fixed';
  video.style.left = '-9999px';
  video.style.top = '-9999px';
  document.body.appendChild(video);

  try {
    await waitFor(video, 'loadedmetadata');
    video.currentTime = Math.min(Math.max(time, 0), Math.max(video.duration - 0.05, 0));
    await waitFor(video, 'seeked');
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 180;
    const context = canvas.getContext('2d');
    if (!context) return '';
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    video.remove();
  }
}

async function captureCoverFrames(sourceUrl: string, duration: number) {
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  video.playsInline = true;
  video.src = sourceUrl;
  video.style.position = 'fixed';
  video.style.left = '-9999px';
  video.style.top = '-9999px';
  document.body.appendChild(video);

  try {
    await waitFor(video, 'loadedmetadata');
    const total = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : duration || 10;
    const count = 14;
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 180;
    const context = canvas.getContext('2d');
    if (!context) return [];
    const frames: Array<{ url: string; time: number }> = [];
    for (let index = 0; index < count; index += 1) {
      const time = Math.min((total / Math.max(1, count - 1)) * index, Math.max(total - 0.05, 0));
      video.currentTime = time;
      await waitFor(video, 'seeked');
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push({ url: canvas.toDataURL('image/jpeg', 0.82), time });
    }
    return frames;
  } finally {
    video.remove();
  }
}

function snapTime(time: number, segments: Array<{ start: number; duration: number }>) {
  const snapPoints = segments.flatMap((segment) => [segment.start, segment.start + segment.duration]);
  const nearest = snapPoints.find((point) => Math.abs(point - time) <= 0.18);
  return nearest ?? time;
}

function toolDescription(tool: 'select' | 'split' | 'trim' | 'crop') {
  if (tool === 'split') return '分割：点击片段或按 B 在播放头切开';
  if (tool === 'trim') return '修剪：用于片段边缘裁切';
  if (tool === 'crop') return '裁剪：用于画面比例与构图';
  return '选择：点击片段选中，右键打开菜单';
}

function buildTracks(segments: Array<{ trackId: string }>) {
  const videoTracks = new Set(['video']);
  const hasCover = segments.some((segment) => segment.trackId === 'cover');
  segments.forEach((segment) => {
    if (segment.trackId === 'video' || segment.trackId.startsWith('video-')) videoTracks.add(segment.trackId);
  });
  return [
    ...Array.from(videoTracks)
      .sort((left, right) => videoTrackIndex(left) - videoTrackIndex(right))
      .map((id) => ({ id, label: id === 'video' ? '主轨' : `视频轨 ${videoTrackIndex(id)}` })),
    ...(hasCover ? [{ id: 'cover', label: '封面轨' }] : []),
    { id: 'annotation', label: '标注轨' },
    { id: 'audio', label: '音频轨' }
  ];
}

function videoTrackIndex(trackId: string) {
  if (trackId === 'video') return 1;
  return Number(trackId.replace('video-', '')) || 1;
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
