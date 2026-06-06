type ToastTone = 'success' | 'info' | 'warning' | 'error'

const toastLabels: Record<ToastTone, string> = {
  success: '完成',
  info: '提示',
  warning: '注意',
  error: '错误',
}

export function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

export function notifySuccess(message: string) {
  showToast('success', message)
}

export function notifyInfo(message: string) {
  showToast('info', message)
}

export function notifyWarning(message: string) {
  showToast('warning', message)
}

export function notifyError(message: string) {
  showToast('error', message)
}

function showToast(tone: ToastTone, message: string) {
  if (typeof document === 'undefined') return
  const host = ensureToastHost()
  const toast = document.createElement('div')
  toast.className = `moya-toast moya-toast-${tone}`
  toast.setAttribute('role', tone === 'error' ? 'alert' : 'status')
  toast.innerHTML = `<strong>${toastLabels[tone]}</strong><span>${escapeHtml(message)}</span>`
  host.appendChild(toast)
  window.setTimeout(() => {
    toast.classList.add('is-leaving')
    window.setTimeout(() => toast.remove(), 220)
  }, 2800)
}

function ensureToastHost() {
  const existing = document.querySelector<HTMLDivElement>('.moya-toast-host')
  if (existing) return existing
  const host = document.createElement('div')
  host.className = 'moya-toast-host'
  document.body.appendChild(host)
  return host
}

function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
