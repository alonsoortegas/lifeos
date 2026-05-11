'use client'

import { useState, useEffect, useRef } from 'react'
import TodayTab from '@/components/tabs/TodayTab'
import FocusTab from '@/components/tabs/FocusTab'
import WorkoutTab from '@/components/tabs/WorkoutTab'
import NutritionTab from '@/components/tabs/NutritionTab'
import BioDesktop from '@/components/desktop/BioDesktop'

const TABS = [
  { key: 'today',     icon: '◐', label: 'Today',     kbd: '1' },
  { key: 'focus',     icon: '◆', label: 'Focus',     kbd: '2' },
  { key: 'workout',   icon: '⌇', label: 'Workout',   kbd: '3' },
  { key: 'nutrition', icon: '◇', label: 'Nutrition', kbd: '4' },
  { key: 'bio',       icon: '~', label: 'Whoop',     kbd: '5' },
]

const CMDK_ITEMS = [
  { sec: 'jump',  ic: '◐', label: 'Go to Today',           kbd: '⌘1', tab: 'today' },
  { sec: 'jump',  ic: '◆', label: 'Go to Focus',           kbd: '⌘2', tab: 'focus' },
  { sec: 'jump',  ic: '⌇', label: 'Go to Workout',         kbd: '⌘3', tab: 'workout' },
  { sec: 'jump',  ic: '◇', label: 'Go to Nutrition',       kbd: '⌘4', tab: 'nutrition' },
  { sec: 'jump',  ic: '~', label: 'Go to Whoop',           kbd: '⌘5', tab: 'bio' },
  { sec: 'log',   ic: '+', label: 'Log a meal',            kbd: 'M',  tab: 'nutrition' },
  { sec: 'log',   ic: '+', label: 'Start workout',         kbd: 'W',  tab: 'workout' },
  { sec: 'log',   ic: '+', label: 'Quick journal entry',   kbd: 'J',  tab: 'today' },
  { sec: 'log',   ic: '+', label: 'Add water · 250ml',     kbd: '⌘D', tab: 'nutrition' },
  { sec: 'data',  ic: '↑', label: 'Sync now',                                          },
  { sec: 'data',  ic: '↗', label: 'Export today as markdown'                           },
]

const SEC_TITLES: Record<string, string> = {
  jump: 'Jump to',
  log:  'Quick log',
  data: 'Data',
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center justify-center px-1 rounded border border-[#2a2a2a] bg-white/[0.02] font-mono text-[10px] text-[#888]"
      style={{ minWidth: 18, height: 18 }}
    >
      {children}
    </span>
  )
}

function FooterHint({ k, l }: { k: string; l: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Kbd>{k}</Kbd>
      <span>{l}</span>
    </span>
  )
}

function CommandPalette({
  onClose,
  onNav,
}: {
  onClose: () => void
  onNav: (tab: string) => void
}) {
  const [q, setQ] = useState('')
  const [highlighted, setHighlighted] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const filtered = q
    ? CMDK_ITEMS.filter(it => it.label.toLowerCase().includes(q.toLowerCase()))
    : CMDK_ITEMS

  const grouped = filtered.reduce<Record<string, typeof CMDK_ITEMS>>((acc, it) => {
    ;(acc[it.sec] = acc[it.sec] || []).push(it)
    return acc
  }, {})

  const flat = Object.values(grouped).flat()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted(h => Math.min(h + 1, flat.length - 1)) }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)) }
      if (e.key === 'Enter') {
        e.preventDefault()
        const item = flat[highlighted]
        if (item?.tab) onNav(item.tab)
        onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [flat, highlighted, onClose, onNav])

  let flatIdx = 0

  return (
    <div
      className="absolute inset-0 z-50 flex items-start justify-center pt-28"
      style={{ background: 'rgba(10,10,10,0.72)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="w-[560px] rounded-xl border border-[#3a3a3a] overflow-hidden"
        style={{ background: '#1a1a1a', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Input row */}
        <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-[#2a2a2a]">
          <span className="font-mono text-[#888] text-sm">⌕</span>
          <input
            ref={inputRef}
            value={q}
            onChange={e => {
              setQ(e.target.value)
              setHighlighted(0)
            }}
            placeholder="jump, log, ask…"
            className="flex-1 bg-transparent border-none outline-none text-[#ededed] text-[17px] placeholder:text-[#555]"
            style={{ fontFamily: 'var(--font-inter-tight, sans-serif)' }}
          />
          <Kbd>esc</Kbd>
        </div>

        {/* Results */}
        <div className="max-h-[420px] overflow-auto py-1.5">
          {Object.entries(grouped).map(([sec, list]) => (
            <div key={sec}>
              <div className="px-3 pt-2.5 pb-1 font-mono text-[10px] uppercase tracking-[0.15em] text-[#555]">
                {SEC_TITLES[sec]}
              </div>
              {list.map(it => {
                const idx = flatIdx++
                const active = idx === highlighted
                return (
                  <button
                    key={it.label}
                    onClick={() => { if (it.tab) onNav(it.tab); onClose() }}
                    onMouseEnter={() => setHighlighted(idx)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg mx-1.5 text-left text-sm transition-colors"
                    style={{
                      width: 'calc(100% - 12px)',
                      background: active ? 'rgba(255,255,255,0.05)' : 'transparent',
                      color: '#ededed',
                    }}
                  >
                    <span className="w-4 font-mono text-[11px] text-[#888]">{it.ic}</span>
                    <span className="flex-1" style={{ fontFamily: 'var(--font-inter-tight, sans-serif)' }}>{it.label}</span>
                    {it.kbd && <Kbd>{it.kbd}</Kbd>}
                  </button>
                )
              })}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-center text-[#555] text-sm">No results</div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3.5 px-4 py-2 border-t border-[#2a2a2a] font-mono text-[10px] text-[#555]">
          <span className="flex items-center gap-1"><Kbd>↑↓</Kbd> navigate</span>
          <span className="flex items-center gap-1"><Kbd>↵</Kbd> select</span>
          <span className="ml-auto">{filtered.length} results</span>
        </div>
      </div>
    </div>
  )
}

export default function DesktopShell() {
  const [activeTab, setActiveTab] = useState('today')
  const [cmdkOpen, setCmdkOpen] = useState(false)

  const currentTab = TABS.find(t => t.key === activeTab)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (cmdkOpen) return
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key === 'k') { e.preventDefault(); setCmdkOpen(true) }
      if (mod && e.key === '1') { e.preventDefault(); setActiveTab('today') }
      if (mod && e.key === '2') { e.preventDefault(); setActiveTab('focus') }
      if (mod && e.key === '3') { e.preventDefault(); setActiveTab('workout') }
      if (mod && e.key === '4') { e.preventDefault(); setActiveTab('nutrition') }
      if (mod && e.key === '5') { e.preventDefault(); setActiveTab('bio') }
    }
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCmdkOpen(false)
    }
    window.addEventListener('keydown', handler)
    window.addEventListener('keydown', escHandler)
    return () => {
      window.removeEventListener('keydown', handler)
      window.removeEventListener('keydown', escHandler)
    }
  }, [cmdkOpen])

  const renderTab = () => {
    switch (activeTab) {
      case 'today':     return <TodayTab />
      case 'focus':     return <FocusTab />
      case 'workout':   return <WorkoutTab />
      case 'nutrition': return <NutritionTab />
      case 'bio':       return <BioDesktop />
      default:          return <TodayTab />
    }
  }

  const todayStr = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

  return (
    <div className="h-screen bg-[#0e0e0e] text-[#ededed] flex flex-col overflow-hidden relative">

      {/* macOS-ish title bar */}
      <div className="h-7 flex-shrink-0 flex items-center px-3 border-b border-[#2a2a2a] bg-white/[0.015]">
        <div className="flex gap-1.5">
          {['#3a3a3a', '#3a3a3a', '#3a3a3a'].map((c, i) => (
            <div key={i} className="w-2.5 h-2.5 rounded-full border border-[#3a3a3a]" style={{ background: c }} />
          ))}
        </div>
        <div
          className="flex-1 text-center text-[11px] text-[#555]"
          style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
        >
          lifeos.app — {currentTab?.label}
        </div>
        <div className="w-8" />
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">

        {/* Sidebar */}
        <aside
          className="flex-shrink-0 border-r border-[#2a2a2a] flex flex-col bg-white/[0.01]"
          style={{ width: 196, padding: '18px 12px 16px' }}
        >
          {/* Brand */}
          <div className="flex items-center gap-2 px-2 pb-4">
            <div
              className="w-6 h-6 rounded-md flex items-center justify-center text-[#00d26a] text-xs font-mono"
              style={{ border: '1.25px solid #00d26a' }}
            >L</div>
            <span className="text-[15px] text-[#ededed] tracking-[0.03em]" style={{ fontFamily: 'var(--font-inter-tight, sans-serif)' }}>
              LifeOS
            </span>
          </div>

          {/* ⌘K trigger */}
          <button
            onClick={() => setCmdkOpen(true)}
            className="flex items-center gap-2 px-2.5 py-2 mb-3.5 rounded-lg border border-dashed border-[#3a3a3a] text-[#888] text-[12px] hover:border-[#555] transition-colors text-left"
          >
            <span className="font-mono text-[11px]">⌕</span>
            <span className="flex-1">jump to anything…</span>
            <Kbd>⌘K</Kbd>
          </button>

          {/* Nav */}
          <nav className="flex flex-col gap-0.5">
            {TABS.map(t => {
              const on = activeTab === t.key
              return (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className="relative flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors text-left"
                  style={{
                    background: on ? 'rgba(0,210,106,0.07)' : 'transparent',
                    color: on ? '#00d26a' : '#ededed',
                    fontFamily: 'var(--font-inter-tight, sans-serif)',
                    fontSize: 14,
                  }}
                >
                  {on && (
                    <div
                      className="absolute rounded-sm bg-[#00d26a]"
                      style={{ left: -12, top: 8, bottom: 8, width: 2 }}
                    />
                  )}
                  <span
                    className="w-4 font-mono text-[13px]"
                    style={{ color: on ? '#00d26a' : '#888' }}
                  >{t.icon}</span>
                  <span className="flex-1">{t.label}</span>
                  <Kbd>⌘{t.kbd}</Kbd>
                </button>
              )
            })}
          </nav>

          <div className="my-4 border-t border-dashed border-[#2a2a2a]" />

          {/* Saved views */}
          <div
            className="px-2 mb-1.5 text-[#555] uppercase tracking-[0.12em]"
            style={{ fontSize: 11, fontFamily: 'var(--font-inter-tight, sans-serif)' }}
          >
            Saved views
          </div>
          {['Last 7 days', 'PRs only', 'Sleep debt'].map(s => (
            <button
              key={s}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded text-[#888] hover:text-[#ededed] transition-colors text-left"
              style={{ fontSize: 12, fontFamily: 'var(--font-inter-tight, sans-serif)' }}
            >
              <span className="font-mono text-[10px] text-[#555]">·</span>
              {s}
            </button>
          ))}

          <div className="flex-1" />

          {/* User */}
          <div
            className="flex items-center gap-2.5 px-2 border-t border-dashed border-[#2a2a2a]"
            style={{ paddingTop: 14 }}
          >
            <div
              className="w-[26px] h-[26px] rounded-full border border-[#3a3a3a] bg-white/[0.04] flex items-center justify-center font-mono text-[11px] text-[#888]"
            >A</div>
            <div className="flex-1 min-w-0" style={{ lineHeight: 1.2 }}>
              <div className="text-[13px] text-[#ededed] truncate" style={{ fontFamily: 'var(--font-inter-tight, sans-serif)' }}>alonso</div>
              <div className="font-mono text-[9px] text-[#555]">lifeos · v0.4</div>
            </div>
            <span className="font-mono text-[#555]">⌥</span>
          </div>
        </aside>

        {/* Right: topbar + content + footer */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Topbar */}
          <div className="h-11 flex-shrink-0 flex items-center gap-3.5 px-4 border-b border-[#2a2a2a]">
            {/* Breadcrumb */}
            <div
              className="flex items-center gap-2 text-[13px] text-[#888]"
              style={{ fontFamily: 'var(--font-inter-tight, sans-serif)' }}
            >
              <span>{currentTab?.label}</span>
              <span className="text-[#555]">/</span>
              <span className="text-[#ededed]">{todayStr}</span>
            </div>

            {/* Period pills */}
            <div className="flex gap-1 ml-3">
              {['D', 'W', 'M', 'Q', 'Y'].map((p, i) => (
                <button
                  key={p}
                  className="flex items-center justify-center rounded font-mono text-[11px] transition-colors"
                  style={{
                    width: 26, height: 22,
                    border: `1px solid ${i === 0 ? '#3a3a3a' : '#2a2a2a'}`,
                    background: i === 0 ? 'rgba(255,255,255,0.04)' : 'transparent',
                    color: i === 0 ? '#ededed' : '#888',
                    cursor: 'pointer',
                  }}
                >{p}</button>
              ))}
            </div>

            <div className="flex-1" />

            {/* Sync status */}
            <div className="flex items-center gap-2 font-mono text-[11px] text-[#888]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00d26a] inline-block" />
              <span>synced</span>
            </div>

            {/* Search button */}
            <button
              onClick={() => setCmdkOpen(true)}
              className="ml-2 flex items-center gap-1.5 px-2.5 py-1 rounded border border-dashed border-[#3a3a3a] text-[#888] text-[11px] hover:border-[#555] transition-colors"
              style={{ fontFamily: 'var(--font-inter-tight, sans-serif)' }}
            >
              <span className="font-mono">⌕</span>
              search
              <Kbd>⌘K</Kbd>
            </button>
          </div>

          {/* Tab content */}
          <main className="flex-1 overflow-auto">
            <div className="py-4">
              {renderTab()}
            </div>
          </main>

          {/* Footer hints */}
          <div
            className="h-7 flex-shrink-0 flex items-center gap-4 px-4 border-t border-[#2a2a2a] font-mono text-[10px] text-[#555]"
            style={{ background: 'rgba(14,14,14,0.92)' }}
          >
            <FooterHint k="⌘K" l="commands" />
            <FooterHint k="⌘1–5" l="tabs" />
            <FooterHint k="J/K" l="navigate" />
            <span className="ml-auto">v0.4 · desktop</span>
          </div>
        </div>
      </div>

      {/* ⌘K overlay */}
      {cmdkOpen && (
        <CommandPalette
          onClose={() => setCmdkOpen(false)}
          onNav={(tab) => { setActiveTab(tab); setCmdkOpen(false) }}
        />
      )}
    </div>
  )
}
