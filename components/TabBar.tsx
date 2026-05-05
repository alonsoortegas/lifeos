'use client'

const TABS = [
  { icon: '◐', label: 'TODAY' },
  { icon: '◆', label: 'FOCUS' },
  { icon: '▲', label: 'WORKOUT' },
  { icon: '○', label: 'NUTRITION' },
  { icon: '~', label: 'WHOOP' },
]

interface TabBarProps {
  activeTab: number
  onTabChange: (index: number) => void
}

export default function TabBar({ activeTab, onTabChange }: TabBarProps) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 flex border-t border-[#2a2a2a] pb-7"
      style={{
        background: 'rgba(14,14,14,0.92)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}
    >
      {TABS.map((tab, i) => {
        const active = activeTab === i
        return (
          <button
            key={tab.label}
            onClick={() => onTabChange(i)}
            className="flex-1 flex flex-col items-center justify-center pt-3 pb-1 gap-0.5 min-h-[44px]"
            aria-label={tab.label}
            aria-current={active ? 'page' : undefined}
          >
            <span
              style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
              className={`text-base leading-none ${active ? 'text-[#00d26a]' : 'text-[#555]'}`}
            >
              {tab.icon}
            </span>
            <span
              className={`uppercase text-[10px] tracking-wider leading-none ${
                active ? 'text-[#00d26a]' : 'text-[#555]'
              }`}
              style={{ fontFamily: 'inherit' }}
            >
              {tab.label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
