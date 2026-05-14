import { useEffect, useMemo, useState } from 'react';
import { FileImage, FolderOpen, RotateCcw } from 'lucide-react';
import type { TransferTask } from '@/shared/types/electron';
import { cancelUpload } from '../api/netdisk';
import { useCloudDriveStore, type UploadState } from '../cloudDriveStore';
import { formatSize } from './CloudFileTable';

type TransferTab = 'upload' | 'cloud';

export function TransferPanel() {
  const [tasks, setTasks] = useState<TransferTask[]>([]);
  const [activeTab, setActiveTab] = useState<TransferTab>('upload');
  const uploadStates = useCloudDriveStore((store) => store.uploadStates);
  const upsertUploadState = useCloudDriveStore((store) => store.upsertUploadState);
  const completedCount = uploadStates.filter((item) => item.status === 'done').length;
  const cancelableUploads = useMemo(() => uploadStates.filter(canCancelUpload), [uploadStates]);

  async function refresh() {
    setTasks(await window.surgicol.cloud.listTransferTasks());
  }

  async function cancelAllPending() {
    await Promise.all(
      cancelableUploads.map(async (item) => {
        if (item.taskId) {
          await cancelUpload(item.taskId).catch(() => undefined);
        }
        upsertUploadState({ ...item, percent: 0, status: 'canceled', message: '已取消' });
      })
    );
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="transfer-workspace">
      <aside className="transfer-tabs">
        <span>传输列表</span>
        <button className={activeTab === 'upload' ? 'active' : undefined} type="button" onClick={() => setActiveTab('upload')}>
          文件上传（{uploadStates.length}）
        </button>
        <button className={activeTab === 'cloud' ? 'active' : undefined} type="button" onClick={() => setActiveTab('cloud')}>
          云添加（0）
        </button>
      </aside>

      <section className="transfer-panel">
        <div className="transfer-panel-header">
          <h2>正在上传（{completedCount}/{uploadStates.length}）</h2>
          <div>
            <button type="button" onClick={refresh}>
              <RotateCcw size={16} />
              <span>刷新</span>
            </button>
            <button type="button" disabled={cancelableUploads.length === 0} onClick={cancelAllPending}>
              全部取消
            </button>
          </div>
        </div>

        {activeTab === 'upload' ? (
          <>
            {uploadStates.length === 0 ? <div className="empty-state compact">暂无本次上传任务</div> : null}
            {uploadStates.length > 0 ? (
              <div className="transfer-upload-list">
                {uploadStates.map((item) => (
                  <UploadTransferRow key={item.id} item={item} />
                ))}
                <div className="transfer-once-note">- 仅展示本次上传任务 -</div>
              </div>
            ) : null}
            {tasks.length > 0 ? (
              <div className="transfer-list transfer-legacy-list">
                {tasks.map((task) => (
                  <div className="transfer-row" key={task.id}>
                    <div>
                      <strong>{task.name}</strong>
                      <span>{task.type === 'upload' ? '上传' : '下载'} · {task.status}</span>
                    </div>
                    <progress value={task.progress} max={100} />
                    <span>{task.progress}%</span>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <div className="empty-state compact">暂无云添加任务</div>
        )}
      </section>
    </div>
  );
}

function UploadTransferRow({ item }: { item: UploadState }) {
  const isRunning = item.status === 'uploading' || item.status === 'finishing';
  const isDone = item.status === 'done';
  return (
    <article className="transfer-upload-row">
      <FileImage className="transfer-file-icon" size={30} />
      <div className="transfer-upload-main">
        <strong title={item.fileName}>{item.fileName}</strong>
        {isRunning ? <progress value={item.percent} max={100} /> : null}
        <span>{item.size ? formatSize(item.size) : uploadStatusText(item.status, item.message)}</span>
      </div>
      <div className="transfer-upload-actions">
        {isDone ? (
          <button type="button" title="打开所在位置" onClick={() => item.localPath && window.surgicol.file.reveal(item.localPath)}>
            <FolderOpen size={18} />
          </button>
        ) : null}
        {!isDone && !isRunning ? (
          <span>{uploadStatusText(item.status, item.message)}</span>
        ) : null}
      </div>
    </article>
  );
}

function canCancelUpload(item: UploadState) {
  return item.status === 'queued' || item.status === 'hashing' || item.status === 'preparing';
}

function uploadStatusText(status: string, message?: string) {
  if (message) return message;
  if (status === 'queued') return '等待上传';
  if (status === 'hashing') return '正在计算文件指纹';
  if (status === 'preparing') return '正在创建上传任务';
  if (status === 'uploading') return '正在上传到 OSS';
  if (status === 'finishing') return '正在完成落库';
  if (status === 'done') return '已完成';
  if (status === 'canceled') return '已取消';
  return '上传失败';
}
