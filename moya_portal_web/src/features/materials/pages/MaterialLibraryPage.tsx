import { MaterialCloudDrive } from '../components/MaterialCloudDrive'
import type { PageKey } from '../../../types'

export function MaterialLibraryPage({ onNavigate }: { onNavigate?: (page: PageKey) => void }) {
  return (
    <div className="material-library-page">
      <MaterialCloudDrive onNavigate={onNavigate} />
    </div>
  )
}
