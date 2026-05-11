import { RotateCcw, Sparkles } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { defaultClipSettings, useEditorStore, type ClipSettings } from '../editorStore';

interface InspectorPanelProps {
  draftName: string;
  mode: 'cut' | 'annotate';
}

type InspectorTab = 'picture' | 'audio' | 'speed' | 'animation' | 'adjust' | 'ai';

const tabs: Array<{ id: InspectorTab; label: string }> = [
  { id: 'picture', label: '画面' },
  { id: 'audio', label: '音频' },
  { id: 'speed', label: '变速' },
  { id: 'animation', label: '动画' },
  { id: 'adjust', label: '调节' },
  { id: 'ai', label: 'AI效果' }
];

export function InspectorPanel({ draftName, mode }: InspectorPanelProps) {
  const [tab, setTab] = useState<InspectorTab>('picture');
  const activeMaterialId = useEditorStore((state) => state.activeMaterialId);
  const material = useEditorStore((state) => state.materials.find((item) => item.id === activeMaterialId));
  const storedSettings = useEditorStore((state) => (activeMaterialId ? state.clipSettings[activeMaterialId] : undefined));
  const updateClipSettings = useEditorStore((state) => state.updateClipSettings);
  const settings = { ...defaultClipSettings, ...storedSettings };

  function patch(patchValue: Partial<ClipSettings>) {
    if (!activeMaterialId) return;
    updateClipSettings(activeMaterialId, patchValue);
  }

  if (!material) {
    return (
      <aside className="editor-panel inspector-panel empty-inspector">
        <div className="section-header">
          <h2>草稿参数</h2>
          <Sparkles size={16} />
        </div>
        <div className="draft-meta-list">
          <span>草稿名称:</span>
          <strong>{draftName}</strong>
          <span>保存位置:</span>
          <strong>D:/MoyaMatrix Drafts/{draftName}</strong>
          <span>比例:</span>
          <strong>适应</strong>
          <span>分辨率:</span>
          <strong>适应</strong>
          <span>草稿帧率:</span>
          <strong>30.00帧/秒</strong>
          <span>编辑模式:</span>
          <strong>{mode === 'cut' ? '剪辑' : '标注'}</strong>
        </div>
        <div className="inspector-empty-state">选中素材后可调整画面、音频、变速、动画和 AI 效果</div>
      </aside>
    );
  }

  return (
    <aside className="editor-panel inspector-panel clip-inspector">
      <div className="inspector-tabs">
        {tabs.map((item) => (
          <button className={tab === item.id ? 'active' : undefined} type="button" key={item.id} onClick={() => setTab(item.id)}>
            {item.label}
          </button>
        ))}
      </div>

      <div className="inspector-body">
        {tab === 'picture' ? <PictureTab settings={settings} patch={patch} /> : null}
        {tab === 'audio' ? <AudioTab settings={settings} patch={patch} /> : null}
        {tab === 'speed' ? <SpeedTab settings={settings} patch={patch} duration={material.duration || 0} /> : null}
        {tab === 'animation' ? <AnimationTab settings={settings} patch={patch} /> : null}
        {tab === 'adjust' ? <AdjustTab settings={settings} patch={patch} /> : null}
        {tab === 'ai' ? <AiTab settings={settings} patch={patch} /> : null}
      </div>
    </aside>
  );
}

function PictureTab({ settings, patch }: TabProps) {
  return (
    <>
      <Segmented options={['基础', '抠像', '蒙版', '美颜美体']} />
      <PanelSection title="位置大小" onReset={() => patch({ scale: 100, x: 0, y: 0, rotation: 0 })}>
        <ControlRow label="缩放" value={`${settings.scale}%`}>
          <input type="range" min="20" max="220" value={settings.scale} onChange={(event) => patch({ scale: Number(event.target.value) })} />
        </ControlRow>
        <ToggleRow label="等比缩放" checked />
        <ControlRow label="位置">
          <input type="number" value={settings.x} onChange={(event) => patch({ x: Number(event.target.value) })} />
          <input type="number" value={settings.y} onChange={(event) => patch({ y: Number(event.target.value) })} />
        </ControlRow>
        <ControlRow label="旋转" value={`${settings.rotation}°`}>
          <input type="range" min="-180" max="180" value={settings.rotation} onChange={(event) => patch({ rotation: Number(event.target.value) })} />
        </ControlRow>
      </PanelSection>
      <PanelSection title="混合">
        <ToggleRow label="混合" checked />
      </PanelSection>
      <PanelSection title="视频防抖">
        <ToggleRow label="视频防抖" checked={false} />
      </PanelSection>
    </>
  );
}

function AudioTab({ settings, patch }: TabProps) {
  return (
    <>
      <Segmented options={['基础', '换音色', '声音效果']} />
      <PanelSection title="基础">
        <ControlRow label="音量" value={`${settings.volume}%`}>
          <input type="range" min="0" max="150" value={settings.volume} onChange={(event) => patch({ volume: Number(event.target.value) })} />
        </ControlRow>
        <ControlRow label="淡入时长" value={`${settings.fadeIn.toFixed(1)}s`}>
          <input type="range" min="0" max="5" step="0.1" value={settings.fadeIn} onChange={(event) => patch({ fadeIn: Number(event.target.value) })} />
        </ControlRow>
        <ControlRow label="淡出时长" value={`${settings.fadeOut.toFixed(1)}s`}>
          <input type="range" min="0" max="5" step="0.1" value={settings.fadeOut} onChange={(event) => patch({ fadeOut: Number(event.target.value) })} />
        </ControlRow>
      </PanelSection>
      <PanelSection title="响度统一">
        <ToggleRow label="响度统一" checked={false} />
      </PanelSection>
    </>
  );
}

function SpeedTab({ settings, patch, duration }: TabProps & { duration: number }) {
  const nextDuration = duration > 0 ? duration / settings.speed : 0;
  return (
    <>
      <Segmented options={['常规变速', '曲线变速', '变速卡点']} />
      <PanelSection title="常规变速">
        <ControlRow label="倍数" value={`${settings.speed.toFixed(1)}x`}>
          <input type="range" min="0.2" max="4" step="0.1" value={settings.speed} onChange={(event) => patch({ speed: Number(event.target.value) })} />
        </ControlRow>
        <ControlRow label="时长" value={`${nextDuration.toFixed(1)}s`}>
          <div className="dashed-meter" />
        </ControlRow>
        <ToggleRow label="声音变调" checked={!settings.preservePitch} onChange={(checked) => patch({ preservePitch: !checked })} />
      </PanelSection>
    </>
  );
}

function AnimationTab({ settings, patch }: TabProps) {
  const options = ['none', 'fade', 'zoom', 'slide', 'flash', 'blur'];
  return (
    <>
      <Segmented options={['入场', '出场', '组合']} />
      <div className="effect-grid">
        {options.map((option) => (
          <button className={settings.animation === option ? 'active' : undefined} type="button" key={option} onClick={() => patch({ animation: option })}>
            <span>{animationLabel(option)}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function AdjustTab({ settings, patch }: TabProps) {
  return (
    <>
      <Segmented options={['基础', 'HSL', '曲线', '色轮', '蒙版']} />
      <PanelSection title="LUT">
        <ControlRow label="亮度" value={`${settings.brightness}%`}>
          <input type="range" min="40" max="180" value={settings.brightness} onChange={(event) => patch({ brightness: Number(event.target.value) })} />
        </ControlRow>
        <ControlRow label="对比度" value={`${settings.contrast}%`}>
          <input type="range" min="40" max="180" value={settings.contrast} onChange={(event) => patch({ contrast: Number(event.target.value) })} />
        </ControlRow>
        <ControlRow label="饱和度" value={`${settings.saturation}%`}>
          <input type="range" min="0" max="220" value={settings.saturation} onChange={(event) => patch({ saturation: Number(event.target.value) })} />
        </ControlRow>
      </PanelSection>
    </>
  );
}

function AiTab({ settings, patch }: TabProps) {
  const effects = ['none', 'portrait', 'comic', 'cinema', 'fresh', 'glow'];
  return (
    <>
      <PanelSection title="AI特效">
        <div className="effect-grid ai-grid">
          {effects.map((effect) => (
            <button className={settings.aiEffect === effect ? 'active' : undefined} type="button" key={effect} onClick={() => patch({ aiEffect: effect })}>
              <span>{aiLabel(effect)}</span>
            </button>
          ))}
        </div>
      </PanelSection>
      <PanelSection title="玩法">
        <button className="generate-button" type="button">生成</button>
      </PanelSection>
    </>
  );
}

interface TabProps {
  settings: ClipSettings;
  patch: (patch: Partial<ClipSettings>) => void;
}

function Segmented({ options }: { options: string[] }) {
  return (
    <div className="inspector-segmented">
      {options.map((option, index) => (
        <button className={index === 0 ? 'active' : undefined} type="button" key={option}>{option}</button>
      ))}
    </div>
  );
}

function PanelSection({ title, children, onReset }: { title: string; children: React.ReactNode; onReset?: () => void }) {
  return (
    <section className="inspector-section">
      <header>
        <span>{title}</span>
        {onReset ? (
          <button type="button" title="重置" onClick={onReset}>
            <RotateCcw size={14} />
          </button>
        ) : null}
      </header>
      {children}
    </section>
  );
}

function ControlRow({ label, value, children }: { label: string; value?: string; children: React.ReactNode }) {
  return (
    <label className="control-row">
      <span>{label}</span>
      <div>{children}</div>
      {value ? <strong>{value}</strong> : null}
    </label>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange?: (checked: boolean) => void }) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange?.(event.target.checked)} readOnly={!onChange} />
    </label>
  );
}

function animationLabel(value: string) {
  return ({ none: '无', fade: '展开', zoom: '轻微放大', slide: '向左滑动', flash: '闪现', blur: '模糊聚焦' } as Record<string, string>)[value];
}

function aiLabel(value: string) {
  return ({ none: '无', portrait: '人像增强', comic: '漫画', cinema: '电影感', fresh: '清新', glow: '灵感光效' } as Record<string, string>)[value];
}
