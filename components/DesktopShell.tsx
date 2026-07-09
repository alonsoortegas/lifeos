'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import ThemeToggle from '@/components/ThemeToggle'
import MonthReview from '@/components/review/MonthReview'
import TodayTab from '@/components/tabs/TodayTab'
import WhoopDesktop from '@/components/desktop/WhoopDesktop'
import FocusDesktop from '@/components/desktop/FocusDesktop'
import WorkoutDesktop from '@/components/desktop/WorkoutDesktop'
import NutritionDesktop from '@/components/desktop/NutritionDesktop'
import FinanceDesktop from '@/components/desktop/FinanceDesktop'
import TrendsDesktop from '@/components/desktop/TrendsDesktop'

const TABS = [
  { key: 'today',     icon: '◐', label: 'Today',     kbd: '1' },
  { key: 'focus',     icon: '◆', label: 'Focus',     kbd: '2' },
  { key: 'workout',   icon: '⌇', label: 'Workout',   kbd: '3' },
  { key: 'nutrition', icon: '◇', label: 'Nutrition', kbd: '4' },
  { key: 'whoop',     icon: '~', label: 'Whoop',     kbd: '5' },
  { key: 'trends',    icon: '∿', label: 'Trends',    kbd: '6' },
  { key: 'finance',   icon: '€', label: 'Finances',  kbd: '7' },
]

const TAB_KEYS = new Set(TABS.map(t => t.key))

function initialDesktopTab() {
  if (typeof window === 'undefined') return 'today'
  const tab = new URLSearchParams(window.location.search).get('tab')
  return tab && TAB_KEYS.has(tab) ? tab : 'today'
}

const CMDK_ITEMS = [
  { sec: 'jump',  ic: '◐', label: 'Go to Today',     kbd: '⌘1', tab: 'today',     action: undefined },
  { sec: 'jump',  ic: '◆', label: 'Go to Focus',     kbd: '⌘2', tab: 'focus',     action: undefined },
  { sec: 'jump',  ic: '⌇', label: 'Go to Workout',   kbd: '⌘3', tab: 'workout',   action: undefined },
  { sec: 'jump',  ic: '◇', label: 'Go to Nutrition', kbd: '⌘4', tab: 'nutrition', action: undefined },
  { sec: 'jump',  ic: '~', label: 'Go to Whoop',     kbd: '⌘5', tab: 'whoop',     action: undefined },
  { sec: 'jump',  ic: '∿', label: 'Go to Trends',    kbd: '⌘6', tab: 'trends',    action: undefined },
  { sec: 'jump',  ic: '€', label: 'Go to Finances',  kbd: '⌘7', tab: 'finance',   action: undefined },
  { sec: 'jump',  ic: '▦', label: 'Monthly review',  kbd: 'R',  tab: 'today',     action: 'review' },
  { sec: 'log',   ic: '+', label: 'Log a meal',      kbd: 'M',  tab: 'nutrition', action: 'log-meal' },
  { sec: 'log',   ic: '+', label: 'Start workout',   kbd: 'W',  tab: 'workout',   action: 'start' },
]

const SEC_TITLES: Record<string, string> = {
  jump: 'Jump to',
  log:  'Quick log',
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center justify-center px-1 rounded border border-[var(--border)] bg-[var(--ink-02)] font-mono text-[10px] text-[var(--text-dim)]"
      style={{ minWidth: 18, height: 18 }}
    >
      {children}
    </span>
  )
}

// ─── Topbar status ────────────────────────────────────────────────────────────
const supabaseTopbar = createClient()

type TopbarStatus = {
  lastSnapshotAt: string | null
  reauth: boolean
  connected: boolean
  loading: boolean
}

function useTopbarStatus(): TopbarStatus {
  const [state, setState] = useState({ lastSnapshotAt: null as string | null, reauth: false, connected: false })
  const [loading, setLoading] = useState(true)

  async function refresh() {
    const [statusRes, snapRes] = await Promise.allSettled([
      fetch('/api/whoop-status').then(r => r.json()),
      supabaseTopbar.from('whoop_snapshots').select('recorded_at').order('recorded_at', { ascending: false }).limit(1).single(),
    ])
    setState({
      lastSnapshotAt: snapRes.status === 'fulfilled' ? (snapRes.value.data?.recorded_at ?? null) : null,
      reauth: statusRes.status === 'fulfilled' ? (statusRes.value.reauth_required ?? false) : false,
      connected: statusRes.status === 'fulfilled' ? (statusRes.value.connected ?? false) : false,
    })
    setLoading(false)
  }

  useEffect(() => {
    const initialId = window.setTimeout(() => { void refresh() }, 0)
    const id = setInterval(() => { void refresh() }, 5 * 60 * 1000)
    return () => {
      window.clearTimeout(initialId)
      clearInterval(id)
    }
  }, [])

  return { ...state, loading }
}

function formatTopbarStatus(s: TopbarStatus): { text: string; dotColor: string; textColor: string } {
  if (s.loading) return { text: '…', dotColor: 'var(--text-faint)', textColor: 'var(--text-faint)' }
  if (!s.connected) return { text: 'whoop offline · other data live', dotColor: 'var(--text-faint)', textColor: 'var(--text-faint)' }
  if (s.reauth) return { text: 'reconnect whoop · other data live', dotColor: '#f59e0b', textColor: 'var(--text-dim)' }
  if (!s.lastSnapshotAt) return { text: 'no whoop data', dotColor: 'var(--text-faint)', textColor: 'var(--text-faint)' }

  const ageH = (Date.now() - new Date(s.lastSnapshotAt).getTime()) / 3_600_000
  const timeAgo = ageH < 1 ? 'just now' : ageH < 24 ? `${Math.floor(ageH)}h ago` : `${Math.floor(ageH / 24)}d ago`

  if (ageH > 30) return { text: `whoop stale · ${timeAgo}`, dotColor: '#f59e0b', textColor: 'var(--text-dim)' }
  return { text: timeAgo, dotColor: '#00d26a', textColor: 'var(--text-dim)' }
}

function CommandPalette({
  onClose,
  onNav,
}: {
  onClose: () => void
  onNav: (tab: string, action?: string) => void
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
        if (item?.tab) onNav(item.tab, item.action)
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
      style={{ background: 'var(--scrim)', backdropFilter: 'blur(12px) saturate(140%)', WebkitBackdropFilter: 'blur(12px) saturate(140%)' }}
      onClick={onClose}
    >
      <div
        className="glass-thick ticks sheet w-[560px] rounded-3xl border border-[var(--border-hi)] overflow-hidden"
        style={{ boxShadow: 'var(--glass-edge), var(--shadow-pop), 0 0 50px rgba(0,210,106,0.07)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Input row */}
        <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-[var(--border)]">
          <span className="font-mono text-[var(--text-dim)] text-sm">⌕</span>
          <input
            ref={inputRef}
            value={q}
            onChange={e => {
              setQ(e.target.value)
              setHighlighted(0)
            }}
            placeholder="jump, log, ask…"
            className="flex-1 bg-transparent border-none outline-none text-[var(--text)] text-[17px] placeholder:text-[var(--text-faint)]"
            style={{ fontFamily: 'var(--font-inter-tight, sans-serif)' }}
          />
          <Kbd>esc</Kbd>
        </div>

        {/* Results */}
        <div className="max-h-[420px] overflow-auto py-1.5">
          {Object.entries(grouped).map(([sec, list]) => (
            <div key={sec}>
              <div className="px-3 pt-2.5 pb-1 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--text-faint)]">
                {SEC_TITLES[sec]}
              </div>
              {list.map(it => {
                const idx = flatIdx++
                const active = idx === highlighted
                return (
                  <button
                    key={it.label}
                    onClick={() => { if (it.tab) onNav(it.tab, it.action); onClose() }}
                    onMouseEnter={() => setHighlighted(idx)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg mx-1.5 text-left text-sm transition-colors"
                    style={{
                      width: 'calc(100% - 12px)',
                      background: active ? 'var(--ink-06)' : 'transparent',
                      color: 'var(--text)',
                    }}
                  >
                    <span className="w-4 font-mono text-[11px] text-[var(--text-dim)]">{it.ic}</span>
                    <span className="flex-1" style={{ fontFamily: 'var(--font-inter-tight, sans-serif)' }}>{it.label}</span>
                    {it.kbd && <Kbd>{it.kbd}</Kbd>}
                  </button>
                )
              })}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-center text-[var(--text-faint)] text-sm">No results</div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3.5 px-4 py-2 border-t border-[var(--border)] font-mono text-[10px] text-[var(--text-faint)]">
          <span className="flex items-center gap-1"><Kbd>↑↓</Kbd> navigate</span>
          <span className="flex items-center gap-1"><Kbd>↵</Kbd> select</span>
          <span className="ml-auto">{filtered.length} results</span>
        </div>
      </div>
    </div>
  )
}

export default function DesktopShell() {
  const [activeTab, setActiveTab] = useState(initialDesktopTab)
  const [tabAction, setTabAction] = useState<string | undefined>(undefined)
  const [cmdkOpen, setCmdkOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const topbarStatus = useTopbarStatus()
  const statusDisplay = formatTopbarStatus(topbarStatus)

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
      if (mod && e.key === '5') { e.preventDefault(); setActiveTab('whoop') }
      if (mod && e.key === '6') { e.preventDefault(); setActiveTab('trends') }
      if (mod && e.key === '7') { e.preventDefault(); setActiveTab('finance') }
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
      case 'focus':     return <FocusDesktop />
      case 'workout':   return <WorkoutDesktop initialAction={tabAction} onInitialActionConsumed={() => setTabAction(undefined)} />
      case 'nutrition': return <NutritionDesktop initialAction={tabAction} onInitialActionConsumed={() => setTabAction(undefined)} />
      case 'whoop':     return <WhoopDesktop />
      case 'trends':    return <TrendsDesktop />
      case 'finance':   return <FinanceDesktop />
      default:          return <TodayTab />
    }
  }


  return (
    <div className="h-screen text-[var(--text)] flex flex-col overflow-hidden relative">

      {/* Title bar */}
      <div className="glass h-7 flex-shrink-0 flex items-center px-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-1.5" aria-hidden="true">
          <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-[#00d26a]" />
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--ink-08)]" />
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--ink-08)]" />
        </div>
        <div className="display flex-1 text-center text-[11px] font-medium text-[var(--text-faint)]">
          LifeOS — {currentTab?.label}
        </div>
        <div className="w-8" />
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">

        {/* Sidebar */}
        <aside
          className="flex-shrink-0 border-r border-[var(--border)] flex flex-col"
          style={{
            width: 196,
            padding: '18px 12px 16px',
            background: 'var(--material-thin)',
            backdropFilter: 'blur(24px) saturate(180%)',
            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          }}
        >
          {/* Brand */}
          <div className="flex items-center gap-2 px-2 pb-4">
            <span
              role="img"
              aria-label="LifeOS"
              className="h-7 w-7 rounded-[8px] bg-cover bg-center"
              style={{ backgroundImage: 'url(/lifeos-icon.svg)', boxShadow: '0 0 14px rgba(0,210,106,0.25)' }}
            />
            <span className="display text-[16px] font-bold tracking-tight text-[var(--text)]">
              Life<span className="text-[#00d26a]">OS</span>
            </span>
          </div>

          {/* Nav */}
          <nav className="flex flex-col gap-0.5">
            {TABS.map(t => {
              const on = activeTab === t.key
              return (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className="display relative flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all"
                  style={{
                    background: on
                      ? 'linear-gradient(180deg, rgba(0,210,106,0.18), rgba(0,210,106,0.08))'
                      : 'transparent',
                    border: on ? '1px solid rgba(0,210,106,0.3)' : '1px solid transparent',
                    boxShadow: on ? '0 0 16px rgba(0,210,106,0.12)' : 'none',
                    color: on ? 'var(--text)' : 'var(--text-dim)',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  <span
                    className="w-4 font-mono text-[13px]"
                    style={{
                      color: on ? '#00d26a' : 'var(--text-faint)',
                      textShadow: on ? '0 0 8px rgba(0,210,106,0.5)' : undefined,
                    }}
                  >{t.icon}</span>
                  <span className="flex-1">{t.label}</span>
                </button>
              )
            })}
          </nav>

          {/* Monthly review */}
          <button
            type="button"
            onClick={() => setReviewOpen(true)}
            className="display mt-1 flex items-center gap-2.5 rounded-xl border border-transparent px-3 py-2 text-left text-[13px] font-semibold text-[var(--text-dim)] transition-colors hover:text-[var(--text)]"
          >
            <span className="w-4 font-mono text-[13px] text-[var(--text-faint)]">▦</span>
            <span className="flex-1">Review</span>
          </button>

          <div className="flex-1" />

          {/* User */}
          <div
            className="flex items-center gap-2.5 px-2 border-t border-[var(--ink-06)]"
            style={{ paddingTop: 14 }}
          >
            <div
              className="w-[26px] h-[26px] rounded-full border border-[var(--border-hi)] bg-[var(--ink-04)] flex items-center justify-center font-mono text-[11px] text-[var(--text-dim)]"
            >A</div>
            <div className="flex-1 min-w-0" style={{ lineHeight: 1.2 }}>
              <div className="text-[13px] text-[var(--text)] truncate" style={{ fontFamily: 'var(--font-inter-tight, sans-serif)' }}>alonso</div>
              <div className="font-mono text-[9px] text-[var(--text-faint)]">lifeos · v0.4</div>
            </div>
            <span className="font-mono text-[var(--text-faint)]">⌥</span>
          </div>
        </aside>

        {/* Right: topbar + content + footer */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Topbar */}
          <div className="h-11 flex-shrink-0 flex items-center gap-3.5 px-4 border-b border-[var(--border)]">
            <div className="flex-1" />

            {/* Sync status */}
            <div className="flex items-center gap-2 font-mono text-[11px]" style={{ color: statusDisplay.textColor }}>
              <span className="w-1.5 h-1.5 rounded-full inline-block flex-shrink-0" style={{ background: statusDisplay.dotColor }} />
              <span>{statusDisplay.text}</span>
            </div>

            <ThemeToggle />

            {/* Search button */}
            <button
              onClick={() => setCmdkOpen(true)}
              className="glass ml-2 flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[var(--border)] text-[var(--text-dim)] text-[11px] hover:border-[var(--border-hi)] transition-all active:scale-[0.97]"
              style={{ fontFamily: 'var(--font-inter-tight, sans-serif)' }}
            >
              <span className="font-mono">⌕</span>
              search
              <Kbd>⌘K</Kbd>
            </button>
          </div>

          {/* Tab content — keyed so the panel re-boots on tab switch */}
          <main className="flex-1 overflow-auto">
            <div key={activeTab} className="boot py-4">
              {renderTab()}
            </div>
          </main>

        </div>
      </div>

      {/* ⌘K overlay */}
      {cmdkOpen && (
        <CommandPalette
          onClose={() => setCmdkOpen(false)}
          onNav={(tab, action) => {
            if (action === 'review') { setReviewOpen(true); setCmdkOpen(false); return }
            setActiveTab(tab); setTabAction(action); setCmdkOpen(false)
          }}
        />
      )}

      {reviewOpen && <MonthReview onClose={() => setReviewOpen(false)} />}
    </div>
  )
}
