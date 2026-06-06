import { useEffect, useRef, useState } from 'react'
import { Copy, MoreVertical, PencilLine, Trash2 } from 'lucide-react'

import type { ScriptPackage } from '../../../pages/viralDirectorModel'

export function ScriptCardMenu({
  scriptPackage,
  isOpen,
  canCopy,
  onToggle,
  onClose,
  onRename,
  onCopy,
  onDelete,
}: {
  scriptPackage: ScriptPackage
  isOpen: boolean
  canCopy: boolean
  onToggle: () => void
  onClose: () => void
  onRename: () => void
  onCopy: () => void
  onDelete: () => void
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [placement, setPlacement] = useState<'below' | 'above'>('below')

  useEffect(() => {
    if (!isOpen) return
    const button = buttonRef.current
    const menu = menuRef.current
    if (!button || !menu) return
    const buttonRect = button.getBoundingClientRect()
    const menuHeight = menu.getBoundingClientRect().height
    const gap = 4
    const spaceBelow = window.innerHeight - buttonRect.bottom
    const spaceAbove = buttonRect.top
    setPlacement(spaceBelow < menuHeight + gap && spaceAbove > spaceBelow ? 'above' : 'below')
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    function handlePointerDown(event: PointerEvent) {
      const target = event.target
      if (target instanceof Node && wrapRef.current?.contains(target)) return
      onClose()
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('click', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('click', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  return (
    <div ref={wrapRef} className="viral-card-menu-wrap">
      <button ref={buttonRef} type="button" className="viral-reference-menu" aria-label={`${scriptPackage.directorScript.title}更多操作`} aria-expanded={isOpen} onClick={onToggle}>
        <MoreVertical size={22} />
      </button>
      {isOpen ? (
        <div ref={menuRef} className={`viral-card-menu is-${placement}`} role="menu">
          <button type="button" role="menuitem" onClick={onRename}>
            <PencilLine size={15} />
            重命名
          </button>
          {canCopy ? (
            <button type="button" role="menuitem" onClick={onCopy}>
              <Copy size={15} />
              复制脚本
            </button>
          ) : null}
          <button type="button" role="menuitem" className="danger" onClick={onDelete}>
            <Trash2 size={15} />
            删除
          </button>
        </div>
      ) : null}
    </div>
  )
}
