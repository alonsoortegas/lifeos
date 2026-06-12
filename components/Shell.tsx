'use client'

import { useState, useEffect, useRef, useSyncExternalStore } from 'react'
import TabBar from '@/components/TabBar'
import ThemeToggle from '@/components/ThemeToggle'
import TodayTab from '@/components/tabs/TodayTab'
import FocusTab from '@/components/tabs/FocusTab'
import WorkoutTab from '@/components/tabs/WorkoutTab'
import NutritionTab from '@/components/tabs/NutritionTab'
import WhoopTab from '@/components/tabs/WhoopTab'
import DesktopShell from '@/components/DesktopShell'

const TAB_LABELS = ['Today', 'Focus', 'Workout', 'Fuel', 'Whoop']
const DESKTOP_QUERY = '(min-width: 1024px)'
const TAB_QUERY_INDEX: Record<string, number> = {
  today: 0,
  focus: 1,
  workout: 2,
  nutrition: 3,
  whoop: 4,
}

function initialMobileTab() {
  if (typeof window === 'undefined') return 0
  return TAB_QUERY_INDEX[new URLSearchParams(window.location.search).get('tab') ?? ''] ?? 0
}

function subscribeToDesktopChange(onChange: () => void) {
  const mq = window.matchMedia(DESKTOP_QUERY)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

function getDesktopSnapshot() {
  return window.matchMedia(DESKTOP_QUERY).matches
}

function getServerDesktopSnapshot() {
  return false
}

function MobileShell() {
  const [activeTab, setActiveTab] = useState(initialMobileTab)
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const n = parseInt(e.key)
      if (n >= 1 && n <= 5) setActiveTab(n - 1)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const renderTab = () => {
    switch (activeTab) {
      case 0: return <TodayTab />
      case 1: return <FocusTab />
      case 2: return <WorkoutTab canAddExercises />
      case 3: return <NutritionTab />
      case 4: return <WhoopTab />
      default: return <TodayTab />
    }
  }

  return (
    <div className="min-h-screen relative">
      <header
        className="fixed top-0 left-0 right-0 z-10 h-28"
        style={{
          background: 'var(--chrome)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        }}
      >
        <div className="h-14" aria-hidden="true" />
        <div className="h-14 flex items-center px-4">
          <span
            role="img"
            aria-label="LifeOS"
            className="h-8 w-8 rounded-[9px] bg-cover bg-center"
            style={{ backgroundImage: 'url(/lifeos-icon.svg)', boxShadow: '0 0 16px rgba(0,210,106,0.25)' }}
          />
          <span className="display ml-2.5 text-[17px] font-bold tracking-tight text-[var(--text)]">
            Life<span className="text-[#00d26a]">OS</span>
          </span>
          <span className="ml-auto flex items-center gap-2">
            <ThemeToggle compact />
            <span className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--ink-04)] px-3 py-1.5">
              <span
                className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-[#00d26a]"
                aria-hidden="true"
              />
              <span className="display text-[11px] font-semibold text-[var(--text-dim)]">
                {TAB_LABELS[activeTab]}
              </span>
            </span>
          </span>
        </div>
        {/* Hairline with traveling shimmer */}
        <div className="glint-track absolute bottom-0 left-0 right-0 h-px bg-[var(--ink-06)]" aria-hidden="true" />
      </header>

      <main
        className="overflow-y-auto pt-28 pb-24"
        onTouchStart={e => {
          touchStartX.current = e.touches[0].clientX
          touchStartY.current = e.touches[0].clientY
        }}
        onTouchEnd={e => {
          const dx = e.changedTouches[0].clientX - touchStartX.current
          const dy = e.changedTouches[0].clientY - touchStartY.current
          if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
            setActiveTab(t => dx < 0 ? Math.min(4, t + 1) : Math.max(0, t - 1))
          }
        }}
      >
        {renderTab()}
      </main>

      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  )
}

export default function Shell() {
  const isDesktop = useSyncExternalStore(
    subscribeToDesktopChange,
    getDesktopSnapshot,
    getServerDesktopSnapshot
  )

  return isDesktop ? <DesktopShell /> : <MobileShell />
}
