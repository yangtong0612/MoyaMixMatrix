import { useMemo, useState } from 'react';
import { FileImage, FolderOpen, Info, RotateCcw, X, XCircle } from 'lucide-react';
import { cancelUpload } from '../api/netdisk';
import { useCloudDriveStore, type UploadState } from '../cloudDriveStore';
import { formatSize } from './CloudFileTable';

export function TransferPanel() {
  const uploadStates = useCloudDriveStore((store) => store.uploadStates);
  const setUploadStates = useCloudDriveStore((store) => store.setUploadStates);
  const clearUploadStates = useCloudDriveStore((store) => store.clearUploadStates);
  const completedCount = uploadStates.filter((item) => item.status === 'done').length;
  const cancelableUploads = useMemo(() => uploadStates.filter(canCancelUpload), [uploadStates]);
  const runningCount = uploadStates.filter((item) => item.status === 'queued' || item.status === 'hashing' || item.status === 'preparing' || item.status === 'uploading' || item.status === 'finishing').length;
  const resumableCount = uploadStates.filter((item) => item.status === 'resumable').length;
  const failedCount = uploadStates.filter((item) => item.status === 'failed').length;

  function refresh() {
    setUploadStates([...useCloudDriveStore.getState().uploadStates]);
  }

  async function clearAllUploads() {
    await Promise.all(
      cancelableUploads.map(async (item) => {
        await cancelUploadTask(item);
      })
    );
    clearUploadStates();
  }

  async function clearDoneUploads() {
    setUploadStates(uploadStates.filter((item) => item.status !== 'done'));
  }

  return (
    <section className="transfer-panel">
      <div className="transfer-panel-header">
        <div>
          <h2>传输列表</h2>
          <div className="transfer-summary">
            <span>全部 {uploadStates.length}</span>
            <span>上传中 {runningCount}</span>
            <span>可继续 {resumableCount}</span>
            <span>失败 {failedCount}</span>
            <span>已完成 {completedCount}</span>
          </div>
        </div>
        <div>
          <button type="button" onClick={refresh}>
            <RotateCcw size={16} />
            <span>刷新</span>
          </button>
          <button type="button" disabled={completedCount === 0} onClick={clearDoneUploads}>
            清空已完成
          </button>
          <button type="button" disabled={uploadStates.length === 0} onClick={clearAllUploads}>
            全部清空
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
  const [showDetail, setShowDetail] = useState(false);
  const upsertUploadState = useCloudDriveStore((store) => store.upsertUploadState);
  const removeUploadState = useCloudDriveStore((store) => store.removeUploadState);
  const isRunning = item.status === 'uploading' || item.status === 'finishing';
  const isDone = item.status === 'done';
  const canRetry = item.status === 'resumable' || (item.status === 'failed' && Boolean(item.localPath));
  const statusMeta = uploadStatusMeta(item);

  async function cancelCurrent() {
    if (item.taskId) {
      await cancelUpload(item.taskId).catch(() => undefined);
    }
    upsertUploadState({ ...item, percent: 0, status: 'canceled', message: '已取消' });
  }

  async function removeCurrent() {
    if (canCancelUpload(item)) {
      await cancelUploadTask(item);
    }
    removeUploadState(item.id);
  }

  function resumeCurrent() {
    window.dispatchEvent(new CustomEvent('moya-cloud-resume-upload', { detail: item.id }));
  }

  return (
    <article className={`transfer-upload-row ${item.status}`}>
      <div className="transfer-upload-file">
        <FileImage className="transfer-file-icon" size={30} />
        <div>
          <strong title={item.fileName}>{item.fileName}</strong>
          <span>
            {item.size ? formatSize(item.size) : '未知大小'}
            {item.totalChunks ? ` · ${item.uploadedIndexes?.length || 0}/${item.totalChunks} 分片` : ''}
          </span>
        </div>
      </div>

      <div className="transfer-upload-main">
        <div className="transfer-stage-line">
          <span>{item.phase || uploadStatusText(item.status, item.message)}</span>
          <strong>{uploadStatusText(item.status, item.message)}</strong>
        </div>
        {item.status !== 'done' && item.status !== 'failed' && item.status !== 'canceled' ? <progress value={item.percent} max={100} /> : null}
        {item.errorDetail ? (
          <button className="transfer-detail-button" type="button" onClick={() => setShowDetail((open) => !open)}>
            <Info size={14} />
            {showDetail ? '收起详情' : '查看详情'}
          </button>
        ) : null}
        {showDetail && item.errorDetail ? (
          <div className="transfer-error-detail">
            <span>任务 ID：{item.taskId || item.id}</span>
            <span>阶段：{item.phase || '未知'}</span>
            <span title={item.errorDetail}>错误：{item.errorDetail}</span>
          </div>
        ) : null}
      </div>

      <div className="transfer-upload-actions">
        <span className={`transfer-status-pill ${statusMeta.kind}`}>{statusMeta.label}</span>
        {isDone ? (
          <button type="button" title="打开所在位置" onClick={() => item.localPath && window.surgicol.file.reveal(item.localPath)}>
            <FolderOpen size={18} />
          </button>
        ) : null}
        {canRetry ? (
          <button className="transfer-text-button primary" type="button" onClick={resumeCurrent}>
            <RotateCcw size={16} />
            <span>{item.status === 'failed' ? '重新上传' : '继续'}</span>
          </button>
        ) : null}
        {!isDone && canCancelUpload(item) ? (
          <button type="button" title="取消上传" onClick={cancelCurrent}>
            <XCircle size={16} />
          </button>
        ) : null}
        <button className="transfer-delete-button" type="button" title="删除记录" onClick={removeCurrent}>
          <X size={16} />
        </button>
      </div>
    </article>
  );
}

async function cancelUploadTask(item: UploadState) {
  if (!item.taskId) return;
  await cancelUpload(item.taskId).catch(() => undefined);
}

function canCancelUpload(item: UploadState) {
  return item.status === 'queued' || item.status === 'hashing' || item.status === 'preparing' || item.status === 'uploading' || item.status === 'finishing' || item.status === 'resumable';
}

function uploadStatusText(status: string, message?: string) {
  if (message) return message;
  if (status === 'queued') return '等待上传';
  if (status === 'hashing') return '正在计算文件指纹';
  if (status === 'preparing') return '正在创建上传任务';
  if (status === 'uploading') return '正在上传到 OSS';
  if (status === 'finishing') return '正在完成落库';
  if (status === 'done') return '已计入容量';
  if (status === 'canceled') return '已取消';
  if (status === 'resumable') return '可继续上传';
  return '上传失败';
}

function uploadStatusMeta(item: UploadState) {
  if (item.status === 'done') return { label: '已计入容量', kind: 'done' };
  if (item.status === 'resumable') return { label: '可继续', kind: 'resumable' };
  if (item.status === 'failed') return { label: '失败', kind: 'failed' };
  if (item.status === 'canceled') return { label: '已取消', kind: 'canceled' };
  return { label: '上传中', kind: 'running' };
}
