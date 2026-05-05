'use client'

import { useState } from 'react'
import Card from '@/components/ui/Card'
import ProgressBar from '@/components/ui/ProgressBar'

type DayType = 'Hard' | 'Moderate' | 'Rest'

const TARGETS: Record<DayType, { cal: number; protein: number; carbs: number; fat: number }> = {
  Hard: { cal: 3200, protein: 200, carbs: 380, fat: 90 },
  Moderate: { cal: 2600, protein: 185, carbs: 280, fat: 80 },
  Rest: { cal: 2100, protein: 170, carbs: 180, fat: 70 },
}

const LOGGED = { cal: 1840, protein: 118, carbs: 215, fat: 52 }

const MEALS = [
  {
    name: 'Breakfast',
    time: '07:30',
    items: ['Oats 80g', 'Protein shake 40g', 'Banana 1x', 'Blueberries 100g'],
    cal: 520,
    protein: 38,
  },
  {
    name: 'Lunch',
    time: '12:15',
    items: ['Chicken breast 200g', 'White rice 150g', 'Broccoli 200g', 'Olive oil 15ml'],
    cal: 680,
    protein: 52,
  },
  {
    name: 'Pre-workout',
    time: '15:45',
    items: ['Rice cakes 3x', 'Peanut butter 30g', 'Apple 1x'],
    cal: 380,
    protein: 10,
  },
  {
    name: 'Dinner',
    time: '19:00',
    items: ['Salmon 180g', 'Sweet potato 200g', 'Asparagus 150g'],
    cal: 260,
    protein: 18,
  },
]

export default function NutritionTab() {
  const [dayType, setDayType] = useState<DayType>('Hard')
  const [expanded, setExpanded] = useState<number | null>(null)
  const [quickFood, setQuickFood] = useState('')
  const [quickProtein, setQuickProtein] = useState('')
  const [quickCarbs, setQuickCarbs] = useState('')

  const target = TARGETS[dayType]

  const macros = [
    { label: 'Calories', logged: LOGGED.cal, target: target.cal, unit: 'kcal', color: '#00d26a' },
    { label: 'Protein', logged: LOGGED.protein, target: target.protein, unit: 'g', color: '#00d26a' },
    { label: 'Carbs', logged: LOGGED.carbs, target: target.carbs, unit: 'g', color: '#888' },
    { label: 'Fat', logged: LOGGED.fat, target: target.fat, unit: 'g', color: '#555' },
  ]

  return (
    <div className="px-4 space-y-5">
      {/* Header */}
      <div className="pt-2">
        <h1 className="text-[22px] font-bold text-[#ededed]">Nutrition</h1>
        <div
          className="text-[#555] text-[11px] mt-0.5"
          style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
        >
          DAILY FUEL PLAN
        </div>
      </div>

      {/* Day type selector */}
      <div className="flex gap-2">
        {(['Hard', 'Moderate', 'Rest'] as DayType[]).map((dt) => (
          <button
            key={dt}
            onClick={() => setDayType(dt)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium border min-h-[44px] transition-colors ${
              dayType === dt
                ? 'bg-[#00d26a] border-[#00d26a] text-[#0e0e0e] font-bold'
                : 'bg-[#1a1a1a] border-[#2a2a2a] text-[#555]'
            }`}
          >
            {dt}
          </button>
        ))}
      </div>

      {/* Macro grid */}
      <div className="grid grid-cols-2 gap-3">
        {macros.map((m) => (
          <Card key={m.label} className="p-4 space-y-2">
            <div className="text-[#888] uppercase text-[11px] tracking-widest">
              {m.label}
            </div>
            <div className="flex items-baseline gap-1">
              <span
                className="text-[24px] font-bold text-[#ededed] leading-none"
                style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
              >
                {m.logged}
              </span>
              <span
                className="text-[#555] text-xs"
                style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
              >
                /{m.target}{m.unit}
              </span>
            </div>
            <ProgressBar value={m.logged} max={m.target} color={m.color} />
          </Card>
        ))}
      </div>

      {/* Meal cards */}
      <div className="space-y-2">
        <div
          className="text-[#555] text-[11px] tracking-widest uppercase"
          style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
        >
          · meals ·
        </div>
        {MEALS.map((meal, i) => (
          <Card key={meal.name} className="overflow-hidden">
            <button
              onClick={() => setExpanded(expanded === i ? null : i)}
              className="w-full flex items-center justify-between px-4 py-3.5 min-h-[52px]"
            >
              <div className="text-left">
                <div className="text-[#ededed] text-sm font-medium">
                  {meal.name}
                </div>
                <div
                  className="text-[#555] text-[11px] mt-0.5"
                  style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
                >
                  {meal.time} · {meal.cal}kcal · {meal.protein}g protein
                </div>
              </div>
              <span className="text-[#555] text-lg leading-none">
                {expanded === i ? '−' : '+'}
              </span>
            </button>
            {expanded === i && (
              <div className="border-t border-[#2a2a2a] px-4 py-3 space-y-1.5">
                {meal.items.map((item) => (
                  <div
                    key={item}
                    className="text-[#888] text-sm"
                    style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
                  >
                    · {item}
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* Quick log */}
      <div className="space-y-2">
        <div
          className="text-[#555] text-[11px] tracking-widest uppercase"
          style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
        >
          · quick log ·
        </div>
        <input
          type="text"
          value={quickFood}
          onChange={(e) => setQuickFood(e.target.value)}
          placeholder="food name..."
          className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#ededed] rounded-xl px-4 py-3 text-sm placeholder:text-[#555] focus:outline-none focus:border-[#3a3a3a] min-h-[44px]"
        />
        <div className="flex gap-2">
          <input
            type="number"
            value={quickProtein}
            onChange={(e) => setQuickProtein(e.target.value)}
            placeholder="protein g"
            className="flex-1 bg-[#1a1a1a] border border-[#2a2a2a] text-[#ededed] rounded-xl px-3 py-3 text-sm placeholder:text-[#555] focus:outline-none focus:border-[#3a3a3a] min-h-[44px]"
          />
          <input
            type="number"
            value={quickCarbs}
            onChange={(e) => setQuickCarbs(e.target.value)}
            placeholder="carbs g"
            className="flex-1 bg-[#1a1a1a] border border-[#2a2a2a] text-[#ededed] rounded-xl px-3 py-3 text-sm placeholder:text-[#555] focus:outline-none focus:border-[#3a3a3a] min-h-[44px]"
          />
          <button
            onClick={() => {
              setQuickFood('')
              setQuickProtein('')
              setQuickCarbs('')
            }}
            className="bg-[#00d26a] text-[#0e0e0e] rounded-xl px-5 py-3 text-sm font-bold min-h-[44px] active:opacity-80 transition-opacity"
          >
            Add
          </button>
        </div>
      </div>

      <div className="h-4" />
    </div>
  )
}
