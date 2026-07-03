'use client'

import { useRef, useState, type ReactNode } from 'react'

export interface SwipeAction {
  label: string
  /** Channel color for the action's text; background is a soft alpha of it. */
  color: string
  onPress: () => void
}

const ACTION_WIDTH = 76 // px per revealed action

/** Swipe-left-to-reveal actions behind a row (iOS mail style). Destructive
 *  actions live here so they need a deliberate two-step gesture instead of a
 *  stray tap. Pointer events, so mouse-drag works on desktop too. */
export default function SwipeRow({ children, actions }: { children: ReactNode; actions: SwipeAction[] }) {
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const start = useRef<{ x: number; y: number; offset: number; engaged: boolean } | null>(null)
  // A drag still emits a click on pointerup — swallow that one so it doesn't
  // immediately re-close the row we just swiped open.
  const suppressClick = useRef(false)
  const width = actions.length * ACTION_WIDTH

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    start.current = { x: e.clientX, y: e.clientY, offset, engaged: false }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = start.current
    if (!s) return
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y
    if (!s.engaged) {
      if (Math.abs(dx) < 8 || Math.abs(dx) <= Math.abs(dy)) return // vertical scroll wins
      s.engaged = true
      setDragging(true)
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    setOffset(Math.min(0, Math.max(-width - 12, s.offset + dx)))
  }

  const settle = () => {
    const s = start.current
    start.current = null
    setDragging(false)
    if (s?.engaged) {
      suppressClick.current = true
      setOffset((o) => (o < -width / 2 ? -width : 0))
    }
  }

  const press = (action: SwipeAction) => {
    setOffset(0)
    action.onPress()
  }

  return (
    <div className="relative overflow-hidden rounded-2xl" style={{ touchAction: 'pan-y' }}>
      {/* actions behind the row — hidden while closed (.panel is translucent,
          they'd bleed through); on close, stay visible until the slide ends */}
      <div
        className="absolute inset-y-0 right-0 flex"
        aria-hidden={offset === 0}
        style={{
          visibility: offset === 0 ? 'hidden' : 'visible',
          transition: `visibility 0s linear ${offset === 0 ? '0.28s' : '0s'}`,
        }}
      >
        {actions.map((a) => (
          <button
            key={a.label}
            onClick={() => press(a)}
            tabIndex={offset === 0 ? -1 : 0}
            className="flex items-center justify-center text-[10px] font-bold uppercase tracking-widest transition-transform active:scale-[0.95]"
            style={{
              width: ACTION_WIDTH,
              color: a.color,
              background: `${a.color}1f`,
              fontFamily: 'var(--font-jetbrains-mono, monospace)',
            }}
          >
            {a.label}
          </button>
        ))}
      </div>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={settle}
        onPointerCancel={settle}
        onClickCapture={(e) => {
          if (suppressClick.current) {
            suppressClick.current = false
            e.preventDefault()
            e.stopPropagation()
            return
          }
          // A tap on the row while open just closes it.
          if (offset !== 0) {
            e.stopPropagation()
            setOffset(0)
          }
        }}
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragging ? 'none' : 'transform 0.28s cubic-bezier(0.32, 0.72, 0.25, 1)',
        }}
      >
        {children}
      </div>
    </div>
  )
}
