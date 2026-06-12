'use client'

import { useRef, useState } from 'react'

const TABS = [
  { icon: '◐', label: 'Today' },
  { icon: '◆', label: 'Focus' },
  { icon: '▲', label: 'Workout' },
  { icon: '○', label: 'Fuel' },
  { icon: '~', label: 'Whoop' },
]

interface TabBarProps {
  activeTab: number
  onTabChange: (index: number) => void
}

/** Floating glass dock — the filled pill springs between tabs and can be
 *  dragged like an iOS segmented control: it tracks the pointer while held
 *  and snaps to the nearest tab on release. */
export default function TabBar({ activeTab, onTabChange }: TabBarProps) {
  const barRef = useRef<HTMLDivElement>(null)
  // Continuous pill position (0…TABS.length-1) while dragging, else null.
  const [dragPos, setDragPos] = useState<number | null>(null)

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
    barRef.current?.setPointerCapture(e.pointerId)
    const pos = positionFromPointer(e.clientX)
    if (pos != null) setDragPos(pos)
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (dragPos == null) return
    const pos = positionFromPointer(e.clientX)
    if (pos != null) setDragPos(pos)
  }

  function settle() {
    if (dragPos == null) return
    onTabChange(Math.round(dragPos))
    setDragPos(null)
  }

  const dragging = dragPos != null
  const pillPos = dragPos ?? activeTab
  // While dragging, the tab nearest the pill reads as active.
  const focusTab = dragging ? Math.round(dragPos) : activeTab

  return (
    <nav
      className="pointer-events-none fixed bottom-0 left-0 right-0 z-20 px-4"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
    >
      <div
        ref={barRef}
        className="glass pointer-events-auto relative mx-auto flex max-w-md rounded-[28px] border border-[var(--border-hi)] p-1.5"
        style={{ boxShadow: 'var(--glass-edge), var(--shadow-pop)', touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={settle}
        onPointerCancel={settle}
      >
        {/* Springing / draggable active pill */}
        <div
          aria-hidden="true"
          className="absolute bottom-1.5 top-1.5"
          style={{
            left: 6,
            width: `calc((100% - 12px) / ${TABS.length})`,
            transform: `translateX(${pillPos * 100}%)`,
            transition: dragging ? 'none' : 'transform 0.45s cubic-bezier(0.3, 1.35, 0.4, 1)',
          }}
        >
          <div
            className="h-full w-full rounded-full"
            style={{
              background: 'linear-gradient(180deg, rgba(0,210,106,0.22), rgba(0,210,106,0.10))',
              border: '1px solid rgba(0,210,106,0.35)',
              boxShadow: dragging
                ? '0 0 24px rgba(0,210,106,0.32), inset 0 1px 0 rgba(255,255,255,0.12)'
                : '0 0 18px rgba(0,210,106,0.22), inset 0 1px 0 rgba(255,255,255,0.08)',
              transform: dragging ? 'scale(1.05)' : 'scale(1)',
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
