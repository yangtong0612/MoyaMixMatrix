import { Music } from 'lucide-react'
import type { DirectorAssetRef } from '../../../pages/viralDirectorModel'

export function SegmentAssetList({ assets }: { assets: DirectorAssetRef[] }) {
  if (assets.length === 0) {
    return (
      <div className="viral-asset-chip-row">
        <small>未添加素材</small>
      </div>
    )
  }

  return (
    <div className="viral-asset-chip-row">
      {assets.map((asset) => (
        asset.assetType === 'video' ? (
          <figure className="viral-asset-preview video" key={asset.assetId}>
            <video src={asset.url} controls muted playsInline preload="metadata" />
            <figcaption title={asset.name}>{asset.name}</figcaption>
          </figure>
        ) : asset.assetType === 'audio' ? (
          <figure className="viral-asset-preview audio" key={asset.assetId}>
            <div className="viral-audio-preview">
              <div className="viral-audio-wave" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
              <audio src={asset.url} controls preload="metadata" aria-label={asset.name} />
              <Music size={16} aria-hidden="true" />
            </div>
            <figcaption title={asset.name}>{asset.name}</figcaption>
          </figure>
        ) : (
          <span className={`viral-asset-chip type-${asset.assetType}`} key={asset.assetId} title={asset.name}>
            {asset.name}
          </span>
        )
      ))}
    </div>
  )
}
