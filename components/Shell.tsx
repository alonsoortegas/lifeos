'use client'

import { useState, useEffect, useRef, useSyncExternalStore } from 'react'
import TabBar from '@/components/TabBar'
import TodayTab from '@/components/tabs/TodayTab'
import FocusTab from '@/components/tabs/FocusTab'
import WorkoutTab from '@/components/tabs/WorkoutTab'
import NutritionTab from '@/components/tabs/NutritionTab'
import WhoopTab from '@/components/tabs/WhoopTab'
import DesktopShell from '@/components/DesktopShell'

const TAB_LABELS = ['TODAY', 'FOCUS', 'WORKOUT', 'NUTRITION', 'WHOOP']
const DESKTOP_QUERY = '(min-width: 1024px)'

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
  const [activeTab, setActiveTab] = useState(0)
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
    <div className="min-h-screen bg-[#0e0e0e] relative">
      <header
        className="fixed top-0 left-0 right-0 z-10 h-28 border-b border-[#2a2a2a]"
        style={{
          background: 'rgba(14,14,14,0.92)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
        }}
      >
        <div className="h-14" aria-hidden="true" />
        <div className="h-14 flex items-center px-4">
          <span
            role="img"
            aria-label="LifeOS"
            className="h-8 w-8 rounded-[7px] bg-cover bg-center"
            style={{ backgroundImage: 'url(/lifeos-icon.svg)' }}
          />
          <span
            className="ml-2 text-[15px] text-[#ededed] tracking-[0.03em]"
            style={{ fontFamily: 'var(--font-inter-tight, sans-serif)' }}
          >
            LifeOS
          </span>
          <span
            className="ml-3 text-[#555] text-[11px] uppercase tracking-widest"
            style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
          >
            · {TAB_LABELS[activeTab]}
          </span>
        </div>
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
