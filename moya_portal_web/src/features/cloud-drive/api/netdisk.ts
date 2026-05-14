import { http } from '@/shared/api/http';

export type UUID = string;
export type NodeType = 'FILE' | 'FOLDER';
export type UploadStatus = 'INITIATED' | 'UPLOADING' | 'COMPLETED' | 'CANCELED';
export type CloudTab = 'files' | 'recycle' | 'share' | 'direct' | 'account' | 'transport';

interface ApiResponse<T> {
  success: boolean;
  code: string;
  message: string;
  data: T;
  timestamp: string;
}

export interface AuthTokenResponse {
  token: string;
  userId: UUID;
  username: string;
}

export interface CurrentUserView {
  id: UUID;
  username: string;
  email?: string;
  phone?: string;
  displayName?: string;
  quotaTotal: number;
  quotaUsed: number;
  quotaRemaining: number;
}

export interface VerificationSendResponse {
  status: string;
  devCode?: string;
}

export interface DriveNodeView {
  id: UUID;
  parentId?: UUID | null;
  name: string;
  nodeType: NodeType;
  size: number;
  mimeType?: string | null;
  fileHash?: string | null;
  ossBucket?: string | null;
  ossKey?: string | null;
  previewUrl?: string | null;
  downloadUrl?: string | null;
  coverUrl?: string | null;
  updatedAt?: string | null;
}

export interface DriveListResult {
  parentId?: UUID | null;
  nodes: DriveNodeView[];
}

export interface UploadTaskView {
  id: UUID;
  fileName: string;
  fileHash: string;
  fileSize: number;
  chunkSize: number;
  totalChunks: number;
  uploadedChunks: number;
  status: UploadStatus;
  ossBucket?: string | null;
  ossKey?: string | null;
  contentType?: string | null;
  uploadedIndexes: number[];
  updatedAt?: string | null;
}

export interface OssUploadTicketResponse {
  uploadUrl: string;
  bucket: string;
  objectKey: string;
  mediaUrl: string;
  contentType: string;
  expiresAt: string;
}

export interface InstantUploadResponse {
  hit: boolean;
  file?: DriveNodeView | null;
}

export interface CompleteUploadResponse {
  task: UploadTaskView;
  file: DriveNodeView;
}

export interface ShareItemView {
  id: UUID;
  nodeId: UUID;
  node: DriveNodeView;
}

export interface ShareLinkView {
  id: UUID;
  shareCode: string;
  expireAt?: string | null;
  allowPreview: boolean;
  allowDownload: boolean;
  canceled: boolean;
  extractCode?: string;
  items: ShareItemView[];
}

export interface DirectShareView {
  id: UUID;
  senderId: UUID;
  receiverId: UUID;
  status: string;
  saved: boolean;
  canceled: boolean;
  node: DriveNodeView;
  createdAt?: string | null;
}

async function unwrap<T>(request: Promise<ApiResponse<T>>) {
  const response = await request;
  return response.data;
}

export function register(data: {
  username: string;
  password: string;
  email?: string;
  phone?: string;
  displayName?: string;
  verificationChannel?: string;
  verificationTarget?: string;
  verificationCode?: string;
}) {
  return unwrap(http.post<unknown, ApiResponse<AuthTokenResponse>>('/auth/register', data));
}

export function login(data: { account: string; password: string }) {
  return unwrap(http.post<unknown, ApiResponse<AuthTokenResponse>>('/auth/login', data));
}

export function resetPassword(data: {
  verificationChannel: string;
  verificationTarget: string;
  verificationCode: string;
  newPassword: string;
}) {
  return unwrap(http.post<unknown, ApiResponse<void>>('/auth/reset-password', data));
}

export function oauthLogin(data: { provider: string; openid: string; unionid?: string; displayName?: string }) {
  return unwrap(http.post<unknown, ApiResponse<AuthTokenResponse>>('/auth/oauth/login', data));
}

export function getMe() {
  return unwrap(http.get<unknown, ApiResponse<CurrentUserView>>('/auth/me'));
}

export function sendVerificationCode(data: { scene: string; channel: string; target: string }) {
  return unwrap(http.post<unknown, ApiResponse<VerificationSendResponse>>('/verification/send', data));
}

export function checkVerificationCode(data: { scene: string; channel: string; target: string; code: string }) {
  return unwrap(http.post<unknown, ApiResponse<void>>('/verification/check', data));
}

export function listDriveNodes(parentId?: UUID | null) {
  return unwrap(
    http.get<unknown, ApiResponse<DriveListResult>>('/drive/nodes', {
      params: parentId ? { parentId } : undefined
    })
  );
}

export function createFolder(data: { parentId?: UUID | null; name: string }) {
  return unwrap(http.post<unknown, ApiResponse<DriveNodeView>>('/drive/folders', data));
}

export function renameNode(id: UUID, data: { name: string }) {
  return unwrap(http.patch<unknown, ApiResponse<DriveNodeView>>(`/drive/nodes/${id}/rename`, data));
}

export function moveNode(id: UUID, data: { targetParentId?: UUID | null }) {
  return unwrap(http.patch<unknown, ApiResponse<DriveNodeView>>(`/drive/nodes/${id}/move`, data));
}

export function recycleNode(id: UUID) {
  return unwrap(http.delete<unknown, ApiResponse<DriveNodeView>>(`/drive/nodes/${id}`));
}

export function listRecycleBin() {
  return unwrap(http.get<unknown, ApiResponse<DriveNodeView[]>>('/drive/recycle-bin'));
}

export function restoreNode(id: UUID) {
  return unwrap(http.post<unknown, ApiResponse<DriveNodeView>>(`/drive/recycle-bin/${id}/restore`));
}

export function permanentDeleteNode(id: UUID) {
  return unwrap(http.delete<unknown, ApiResponse<void>>(`/drive/recycle-bin/${id}`));
}

export function instantUpload(data: { parentId?: UUID | null; fileName: string; sha256: string }) {
  return unwrap(http.post<unknown, ApiResponse<InstantUploadResponse>>('/drive/uploads/instant', data));
}

export function initUpload(data: { fileName: string; sha256: string; totalBytes: number; chunkSize: number; contentType?: string }) {
  return unwrap(http.post<unknown, ApiResponse<UploadTaskView>>('/drive/uploads', data));
}

export function createUploadTicket(
  id: UUID,
  data: { fileName?: string; contentType?: string; size: number }
) {
  return unwrap(http.post<unknown, ApiResponse<OssUploadTicketResponse>>(`/drive/uploads/${id}/ticket`, data));
}

export function registerUploadChunk(id: UUID, data: { chunkIndex: number; sizeBytes: number; checksum?: string }) {
  return unwrap(http.post<unknown, ApiResponse<UploadTaskView>>(`/drive/uploads/${id}/chunks`, data));
}

export function completeUpload(id: UUID, data: { parentId?: UUID | null; ossKey?: string; contentType?: string }) {
  return unwrap(http.post<unknown, ApiResponse<CompleteUploadResponse>>(`/drive/uploads/${id}/complete`, data));
}

export function cancelUpload(id: UUID) {
  return unwrap(http.patch<unknown, ApiResponse<UploadTaskView>>(`/drive/uploads/${id}/cancel`));
}

export function createShareLink(data: {
  fileNodeIds: UUID[];
  extractCode?: string | null;
  validityDays?: number | null;
  allowPreview: boolean;
  allowDownload: boolean;
}) {
  return unwrap(http.post<unknown, ApiResponse<ShareLinkView>>('/share/links', data));
}

export function getPublicShare(shareCode: string, extractCode?: string) {
  return unwrap(
    http.get<unknown, ApiResponse<ShareLinkView>>(`/share/links/public/${encodeURIComponent(shareCode)}`, {
      params: extractCode ? { extractCode } : undefined
    })
  );
}

export function savePublicShareItem(shareCode: string, data: { shareItemId: UUID; targetParentId?: UUID | null }, extractCode?: string) {
  return unwrap(
    http.post<unknown, ApiResponse<DriveNodeView>>(`/share/links/public/${encodeURIComponent(shareCode)}/save`, data, {
      params: extractCode ? { extractCode } : undefined
    })
  );
}

export function cancelShareLink(id: UUID) {
  return unwrap(http.delete<unknown, ApiResponse<void>>(`/share/links/${id}`));
}

export function sendDirectShare(data: { fileNodeId: UUID; receiver: string }) {
  return unwrap(http.post<unknown, ApiResponse<DirectShareView>>('/share/direct', data));
}

export function listDirectInbox() {
  return unwrap(http.get<unknown, ApiResponse<DirectShareView[]>>('/share/direct/inbox'));
}

export function saveDirectShare(id: UUID, data: { targetParentId?: UUID | null }) {
  return unwrap(http.post<unknown, ApiResponse<DriveNodeView>>(`/share/direct/${id}/save`, data));
}

export function cancelDirectShare(id: UUID) {
  return unwrap(http.delete<unknown, ApiResponse<void>>(`/share/direct/${id}`));
}
