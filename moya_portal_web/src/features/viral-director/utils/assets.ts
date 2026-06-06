export const videoAssetExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm']
export const audioAssetExtensions = ['.mp3', '.wav', '.m4a', '.aac', '.flac']

export function isSupportedReferenceVideoFile(file: File) {
  return file.type.startsWith('video/') || videoAssetExtensions.some((extension) => file.name.toLowerCase().endsWith(extension))
}

export function getUploadAssetType(file: File): 'audio' | 'video' | null {
  if (file.type.startsWith('video/')) return 'video'
  if (file.type.startsWith('audio/')) return 'audio'

  const normalizedName = file.name.toLowerCase()
  if (videoAssetExtensions.some((extension) => normalizedName.endsWith(extension))) return 'video'
  if (audioAssetExtensions.some((extension) => normalizedName.endsWith(extension))) return 'audio'

  return null
}

export function isSupportedReferenceVideoLink(url: string) {
  const value = url.toLowerCase()
  return (
    value.includes('douyin.com') ||
    value.includes('v.douyin.com') ||
    value.includes('iesdouyin.com') ||
    value.includes('xiaohongshu.com') ||
    value.includes('xhslink.com') ||
    value.includes('xhs.cn')
  )
}
