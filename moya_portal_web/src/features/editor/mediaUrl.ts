export function toMediaUrl(path?: string) {
  if (!path) return undefined;
  return `moya-media://file?path=${encodeURIComponent(path)}`;
}
