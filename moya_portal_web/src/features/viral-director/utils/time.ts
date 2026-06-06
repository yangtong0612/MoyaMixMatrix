export function formatTimeRange(startSec: number, endSec: number) {
  return `${formatSec(startSec)} - ${formatSec(endSec)}`
}

export function formatSec(sec: number) {
  const safe = Math.max(0, Math.floor(sec))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
