import { useMemo } from 'react';
import { FileImage, FolderOpen, RotateCcw } from 'lucide-react';
import { cancelUpload } from '../api/netdisk';
import { useCloudDriveStore, type UploadState } from '../cloudDriveStore';
import { formatSize } from './CloudFileTable';

export function TransferPanel() {
  const uploadStates = useCloudDriveStore((store) => store.uploadStates);
  const setUploadStates = useCloudDriveStore((store) => store.setUploadStates);
  const upsertUploadState = useCloudDriveStore((store) => store.upsertUploadState);
  const completedCount = uploadStates.filter((item) => item.status === 'done').length;
  const cancelableUploads = useMemo(() => uploadStates.filter(canCancelUpload), [uploadStates]);

  function refresh() {
    setUploadStates([...useCloudDriveStore.getState().uploadStates]);
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

  return (
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

      {uploadStates.length === 0 ? (
        <div className="empty-state compact">暂无上传记录</div>
      ) : (
        <div className="transfer-upload-list">
          {uploadStates.map((item) => (
            <UploadTransferRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </section>
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
        {!isDone && !isRunning ? <span>{uploadStatusText(item.status, item.message)}</span> : null}
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
