'use client'

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

/** Floating glass dock — a filled pill springs between tabs. */
export default function TabBar({ activeTab, onTabChange }: TabBarProps) {
  return (
    <nav
      className="pointer-events-none fixed bottom-0 left-0 right-0 z-20 px-4"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
    >
      <div
        className="pointer-events-auto relative mx-auto flex max-w-md rounded-full border border-[var(--border-hi)] p-1.5"
        style={{
          background: 'var(--chrome)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow: 'var(--shadow-pop)',
        }}
      >
        {/* Springing active pill */}
        <div
          aria-hidden="true"
          className="absolute bottom-1.5 top-1.5"
          style={{
            left: 6,
            width: `calc((100% - 12px) / ${TABS.length})`,
            transform: `translateX(${activeTab * 100}%)`,
            transition: 'transform 0.45s cubic-bezier(0.3, 1.35, 0.4, 1)',
          }}
        >
          <div
            className="h-full w-full rounded-full"
            style={{
              background: 'linear-gradient(180deg, rgba(0,210,106,0.22), rgba(0,210,106,0.10))',
              border: '1px solid rgba(0,210,106,0.35)',
              boxShadow: '0 0 18px rgba(0,210,106,0.22), inset 0 1px 0 rgba(255,255,255,0.08)',
            }}
          />
        </div>

        {TABS.map((tab, i) => {
          const active = activeTab === i
          return (
            <button
              key={tab.label}
              onClick={() => onTabChange(i)}
              className="relative z-10 flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 transition-transform duration-150 active:scale-90"
              aria-label={tab.label}
              aria-current={active ? 'page' : undefined}
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
