'use client'

import { useState } from 'react'
import TabBar from '@/components/TabBar'
import TodayTab from '@/components/tabs/TodayTab'
import FocusTab from '@/components/tabs/FocusTab'
import WorkoutTab from '@/components/tabs/WorkoutTab'
import NutritionTab from '@/components/tabs/NutritionTab'
import WhoopTab from '@/components/tabs/WhoopTab'

const TAB_LABELS = ['TODAY', 'FOCUS', 'WORKOUT', 'NUTRITION', 'WHOOP']

export default function Shell() {
  const [activeTab, setActiveTab] = useState(1) // Default: Focus

  const renderTab = () => {
    switch (activeTab) {
      case 0:
        return <TodayTab />
      case 1:
        return <FocusTab />
      case 2:
        return <WorkoutTab />
      case 3:
        return <NutritionTab />
      case 4:
        return <WhoopTab />
      default:
        return <FocusTab />
    }
  }

  return (
    <div className="min-h-screen bg-[#0e0e0e] relative">
      {/* Status bar spacer / top header */}
      <header className="fixed top-0 left-0 right-0 z-10 h-28 border-b border-[#2a2a2a]"
        style={{
          background: 'rgba(14,14,14,0.92)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
        }}
      >
        <div className="h-14" aria-hidden="true" />
        <div className="h-14 flex items-center px-4">
          <span
            className="text-[#00d26a] text-sm font-bold tracking-widest"
            style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
          >
            LIFEOS
          </span>
          <span
            className="ml-3 text-[#555] text-[11px] uppercase tracking-widest"
            style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
          >
            · {TAB_LABELS[activeTab]}
          </span>
        </div>
      </header>

      {/* Main scrollable content */}
      <main className="overflow-y-auto pt-28 pb-24">
        {renderTab()}
      </main>

      {/* Fixed bottom tab bar */}
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  )
}
