import { http } from '@/shared/api/http';

export type CloudTab = 'all' | 'sharedWithMe' | 'private' | 'shared' | 'transport' | 'annotation' | 'videoSummary';

export interface DiskObject {
  id: number | null;
  object_type?: 1 | 2;
  object_name?: string;
  parent_id?: number;
  file_type?: number;
  file_size?: number;
  create_datetime?: string;
  update_datetime?: string;
  thumb_url?: string;
  bucket?: string;
  region?: string;
  object_id?: string;
  video_idstr?: string;
}

export interface NetdiskQuery {
  query_type?: CloudTab;
  parent_id?: number;
  page?: number;
  page_size?: number;
  file_type?: 1 | 2 | 3;
  is_published?: boolean;
  is_annotated?: boolean;
}

export function listNetdisk(params: NetdiskQuery) {
  return http.get<unknown, DiskObject[]>('/oss/netdisk', { params });
}

export function createFolder(data: { object_name: string; parent_id?: number }) {
  return http.post('/oss/netdisk', { object_type: 1, ...data });
}

export function renameObject(data: { id: number; name: string }) {
  return http.put('/oss/netdisk', data);
}

export function deleteObject(id: number) {
  return http.delete('/oss/netdisk', { data: { id } });
}

export function moveObject(data: { source_id: string; target_id: string }) {
  return http.post('/oss/netdisk/move', data);
}

export function listFolderTree() {
  return http.get('/oss/netdisk/dir_list');
}
