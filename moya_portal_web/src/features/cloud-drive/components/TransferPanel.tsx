import { useEffect, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import type { TransferTask } from '@/shared/types/electron';

export function TransferPanel() {
  const [tasks, setTasks] = useState<TransferTask[]>([]);

  async function refresh() {
    setTasks(await window.surgicol.cloud.listTransferTasks());
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="transfer-panel">
      <div className="section-header">
        <h2>传输列表</h2>
        <button type="button" onClick={refresh}>
          <RotateCcw size={16} />
          <span>刷新</span>
        </button>
      </div>

      {tasks.length === 0 ? (
        <div className="empty-state compact">暂无上传或下载任务</div>
      ) : (
        <div className="transfer-list">
          {tasks.map((task) => (
            <div className="transfer-row" key={task.id}>
              <div>
                <strong>{task.name}</strong>
                <span>{task.type === 'upload' ? '上传' : '下载'} · {task.status}</span>
              </div>
              <progress value={task.progress} max={100} />
              <button className="icon-button" type="button" title={task.status === 'paused' ? '继续' : '暂停'}>
                {task.status === 'paused' ? <Play size={16} /> : <Pause size={16} />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
