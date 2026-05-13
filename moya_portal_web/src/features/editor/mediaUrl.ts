export function toMediaUrl(path?: string) {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  if (/^oss:\/\//i.test(path)) return undefined;
  return `moya-media://file?path=${encodeURIComponent(path)}`;
}
