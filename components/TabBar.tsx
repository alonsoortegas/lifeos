'use client'

import { useEffect, useRef, useState } from 'react'

const TABS = [
  { icon: '◐', label: 'Today' },
  { icon: '◆', label: 'Focus' },
  { icon: '▲', label: 'Workout' },
  { icon: '○', label: 'Fuel' },
  { icon: '~', label: 'Whoop' },
  { icon: '∿', label: 'Trends' },
  { icon: '€', label: 'Money' },
]

interface TabBarProps {
  activeTab: number
  onTabChange: (index: number) => void
}

/** Floating glass dock — the glossy pill springs between tabs and can be
 *  dragged like an iOS segmented control: it tracks the finger while held
 *  and snaps to the nearest tab on release.
 *
 *  iOS Safari notes (don't simplify these away):
 *  - touchmove must be cancelled via a NATIVE non-passive listener — React's
 *    onTouchMove is passive, so Safari hijacks the gesture as a scroll and
 *    fires pointercancel mid-drag.
 *  - pointer capture is unreliable on iOS, so while dragging we listen for
 *    pointermove/up on window instead of relying on the bar receiving them.
 */
export default function TabBar({ activeTab, onTabChange }: TabBarProps) {
  const barRef = useRef<HTMLDivElement>(null)
  // Continuous pill position (0…TABS.length-1) while dragging, else null.
  // Mirrored in a ref so event handlers can read the latest value without
  // resorting to setState updaters — updaters run during render and must stay
  // pure (calling onTabChange from one triggers React's setState-in-render error).
  const [dragPos, setDragPosState] = useState<number | null>(null)
  const dragPosRef = useRef<number | null>(null)
  const setDragPos = (pos: number | null) => {
    dragPosRef.current = pos
    setDragPosState(pos)
  }
  const dragging = dragPos != null

  function positionFromPointer(clientX: number): number | null {
    const bar = barRef.current
    if (!bar) return null
    const rect = bar.getBoundingClientRect()
    const inner = rect.width - 12 // p-1.5 on both sides
    const segment = inner / TABS.length
    const x = clientX - rect.left - 6
    return Math.min(TABS.length - 1, Math.max(0, x / segment - 0.5))
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const pos = positionFromPointer(e.clientX)
    if (pos != null) setDragPos(pos)
  }

  // Block Safari from turning the drag into a page scroll. Must be a native
  // listener with { passive: false } — React touch handlers can't preventDefault.
  useEffect(() => {
    const bar = barRef.current
    if (!bar) return
    const prevent = (e: TouchEvent) => e.preventDefault()
    bar.addEventListener('touchmove', prevent, { passive: false })
    return () => bar.removeEventListener('touchmove', prevent)
  }, [])

  // While dragging, track the pointer on window (iOS-safe) and settle on release.
  useEffect(() => {
    if (!dragging) return

    const move = (e: PointerEvent) => {
      const pos = positionFromPointer(e.clientX)
      if (pos != null) setDragPos(pos)
    }
    const settle = (e: PointerEvent) => {
      const final = positionFromPointer(e.clientX) ?? dragPosRef.current
      setDragPos(null)
      if (final != null) onTabChange(Math.round(final))
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', settle)
    window.addEventListener('pointercancel', settle)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', settle)
      window.removeEventListener('pointercancel', settle)
    }
  }, [dragging, onTabChange])

  const pillPos = dragPos ?? activeTab
  // While dragging, the tab nearest the pill reads as active.
  const focusTab = dragging ? Math.round(dragPos!) : activeTab

  return (
    <nav
      className="pointer-events-none fixed bottom-0 left-0 right-0 z-20 px-4"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
    >
      <div
        ref={barRef}
        className="glass pointer-events-auto relative mx-auto flex max-w-md select-none rounded-[28px] border border-[var(--border-hi)] p-1.5"
        style={{
          boxShadow: 'var(--glass-edge), var(--shadow-pop)',
          touchAction: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
          WebkitTapHighlightColor: 'transparent',
        }}
        onPointerDown={handlePointerDown}
      >
        {/* Glossy draggable active pill */}
        <div
          aria-hidden="true"
          className="absolute bottom-1.5 top-1.5"
          style={{
            left: 6,
            width: `calc((100% - 12px) / ${TABS.length})`,
            transform: `translateX(${pillPos * 100}%)`,
            transition: dragging ? 'none' : 'transform 0.45s cubic-bezier(0.3, 1.35, 0.4, 1)',
            willChange: 'transform',
          }}
        >
          <div
            className="h-full w-full rounded-full"
            style={{
              // Specular sheen over a mint body — iOS "liquid" pill.
              background:
                'linear-gradient(180deg, rgba(255,255,255,0.20), rgba(255,255,255,0.02) 48%), linear-gradient(180deg, rgba(0,210,106,0.30), rgba(0,210,106,0.12))',
              border: '1px solid rgba(0,210,106,0.40)',
              boxShadow: dragging
                ? 'inset 0 1px 0 rgba(255,255,255,0.30), 0 6px 18px rgba(0,0,0,0.30), 0 0 26px rgba(0,210,106,0.38)'
                : 'inset 0 1px 0 rgba(255,255,255,0.20), 0 4px 12px rgba(0,0,0,0.22), 0 0 18px rgba(0,210,106,0.24)',
              transform: dragging ? 'scale(1.06)' : 'scale(1)',
              transition: 'transform 0.2s cubic-bezier(0.3, 1.35, 0.4, 1), box-shadow 0.2s ease',
            }}
          />
        </div>

        {TABS.map((tab, i) => {
          const active = focusTab === i
          return (
            <button
              key={tab.label}
              onClick={() => onTabChange(i)}
              className="relative z-10 flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 transition-transform duration-150 active:scale-90"
              aria-label={tab.label}
              aria-current={activeTab === i ? 'page' : undefined}
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-jetbrains-mono, monospace)',
                  transition: 'color 0.3s ease, transform 0.3s cubic-bezier(0.3, 1.35, 0.4, 1)',
                  transform: active ? 'translateY(-1px) scale(1.08)' : 'none',
                }}
                className={`text-[15px] leading-none ${active ? 'text-[#00d26a]' : 'text-[var(--text-faint)]'}`}
              >
                {tab.icon}
              </span>
              <span
                className={`display text-[10px] font-semibold leading-none ${
                  active ? 'text-[var(--text)]' : 'text-[var(--text-faint)]'
                }`}
                style={{ transition: 'color 0.3s ease' }}
              >
                {tab.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
