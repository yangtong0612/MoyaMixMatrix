import { SlidersHorizontal } from 'lucide-react';

interface InspectorPanelProps {
  draftName: string;
  mode: 'cut' | 'annotate';
}

export function InspectorPanel({ draftName, mode }: InspectorPanelProps) {
  return (
    <aside className="editor-panel inspector-panel">
      <div className="section-header">
        <h2>草稿参数</h2>
        <SlidersHorizontal size={16} />
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
        <span>导入方式:</span>
        <strong>保留在原有位置</strong>
      </div>
      <label className="field">
        <span>编辑模式</span>
        <input value={mode === 'cut' ? '剪辑' : '标注'} readOnly />
      </label>
      <label className="field">
        <span>画布比例</span>
        <select defaultValue="16:9">
          <option>16:9</option>
          <option>9:16</option>
          <option>1:1</option>
          <option>4:3</option>
        </select>
      </label>
      <label className="field">
        <span>马赛克强度</span>
        <input type="range" min="0" max="100" defaultValue="45" />
      </label>
      <label className="field">
        <span>自动保存</span>
        <input type="checkbox" defaultChecked />
      </label>
    </aside>
  );
}
