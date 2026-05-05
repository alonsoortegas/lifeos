'use client'

import { useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import Card from '@/components/ui/Card'

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
)

const STRENGTH_PLAN = [
  {
    name: 'Back Squat',
    sets: 4,
    reps: 5,
    weight: 225,
    unit: 'lb',
  },
  {
    name: 'Romanian Deadlift',
    sets: 3,
    reps: 8,
    weight: 185,
    unit: 'lb',
  },
  {
    name: 'Walking Lunge',
    sets: 3,
    reps: 10,
    weight: 40,
    unit: 'lb',
  },
  {
    name: 'Calf Raise',
    sets: 4,
    reps: 12,
    weight: 90,
    unit: 'lb',
  },
]

const RPE_OPTIONS = [6, 7, 7.5, 8, 8.5, 9, 9.5, 10]
const REP_OPTIONS = [3, 4, 5, 6, 7, 8, 9, 10, 12, 15]

interface LoggedSet {
  setNum: number
  weight: number
  reps: number
  rpe: number
}

interface ExerciseState {
  expanded: boolean
  selectedReps: number
  selectedRpe: number
  weight: number
  loggedSets: LoggedSet[]
}

export default function WorkoutTab() {
  const [exerciseStates, setExerciseStates] = useState<ExerciseState[]>(
    STRENGTH_PLAN.map((ex) => ({
      expanded: false,
      selectedReps: ex.reps,
      selectedRpe: 8,
      weight: ex.weight,
      loggedSets: [],
    }))
  )

  const toggleExpand = (i: number) => {
    setExerciseStates((prev) =>
      prev.map((s, idx) => (idx === i ? { ...s, expanded: !s.expanded } : s))
    )
  }

  const updateState = (i: number, patch: Partial<ExerciseState>) => {
    setExerciseStates((prev) =>
      prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s))
    )
  }

  const logSet = (i: number) => {
    const s = exerciseStates[i]
    const setNum = s.loggedSets.length + 1
    updateState(i, {
      loggedSets: [
        ...s.loggedSets,
        { setNum, weight: s.weight, reps: s.selectedReps, rpe: s.selectedRpe },
      ],
    })
    supabase.from('workout_logs').insert({
      exercise_name: STRENGTH_PLAN[i].name,
      set_number: setNum,
      weight_lbs: s.weight,
      reps: s.selectedReps,
      rpe: s.selectedRpe,
    }).then(({ error }) => {
      if (error) console.error('workout log insert failed:', error.message)
    })
  }

  const totalSets = exerciseStates.reduce(
    (acc, s) => acc + s.loggedSets.length,
    0
  )

  return (
    <div className="px-4 space-y-5">
      {/* Header */}
      <div className="pt-2">
        <div
          className="text-[#00d26a] uppercase text-[11px] tracking-widest mb-1"
          style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
        >
          STRENGTH · WORKOUT A
        </div>
        <h1 className="text-[22px] font-bold text-[#ededed]">Lower Body</h1>
        <div
          className="text-[#555] text-[11px] mt-0.5"
          style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
        >
          {STRENGTH_PLAN.length} exercises · {totalSets} sets logged
        </div>
      </div>

      {/* Exercise cards */}
      {STRENGTH_PLAN.map((ex, i) => {
        const s = exerciseStates[i]
        return (
          <Card key={ex.name} className="overflow-hidden">
            {/* Exercise header */}
            <button
              onClick={() => toggleExpand(i)}
              className="w-full flex items-center justify-between px-4 py-4 min-h-[56px]"
            >
              <div className="text-left">
                <div className="text-[#ededed] text-sm font-medium">
                  {ex.name}
                </div>
                <div
                  className="text-[#555] text-[11px] mt-0.5"
                  style={{
                    fontFamily: 'var(--font-jetbrains-mono, monospace)',
                  }}
                >
                  {ex.sets}×{ex.reps} · {ex.weight}lb
                </div>
              </div>
              <div className="flex items-center gap-3">
                {s.loggedSets.length > 0 && (
                  <span
                    className="text-[#00d26a] text-[11px]"
                    style={{
                      fontFamily: 'var(--font-jetbrains-mono, monospace)',
                    }}
                  >
                    {s.loggedSets.length}/{ex.sets}
                  </span>
                )}
                <span className="text-[#555] text-lg leading-none">
                  {s.expanded ? '−' : '+'}
                </span>
              </div>
            </button>

            {/* Expanded panel */}
            {s.expanded && (
              <div className="border-t border-[#2a2a2a] px-4 pb-4 space-y-4 pt-4">
                {/* Weight display */}
                <div className="flex items-center justify-between">
                  <span className="text-[#888] text-xs uppercase tracking-wider">
                    Weight
                  </span>
                  <span
                    className="text-[#ededed] text-2xl font-bold"
                    style={{
                      fontFamily: 'var(--font-jetbrains-mono, monospace)',
                    }}
                  >
                    {s.weight}
                    <span className="text-[#555] text-sm ml-1">lb</span>
                  </span>
                </div>

                {/* Rep selector */}
                <div>
                  <div className="text-[#888] text-xs uppercase tracking-wider mb-2">
                    Reps
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {REP_OPTIONS.map((r) => (
                      <button
                        key={r}
                        onClick={() => updateState(i, { selectedReps: r })}
                        className={`min-w-[40px] min-h-[36px] px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                          s.selectedReps === r
                            ? 'bg-[#00d26a] border-[#00d26a] text-[#0e0e0e] font-bold'
                            : 'bg-transparent border-[#2a2a2a] text-[#888]'
                        }`}
                        style={{
                          fontFamily: 'var(--font-jetbrains-mono, monospace)',
                        }}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                {/* RPE slider */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[#888] text-xs uppercase tracking-wider">
                      RPE
                    </span>
                    <span
                      className="text-[#ededed] text-sm font-bold"
                      style={{
                        fontFamily: 'var(--font-jetbrains-mono, monospace)',
                      }}
                    >
                      {s.selectedRpe}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {RPE_OPTIONS.map((r) => (
                      <button
                        key={r}
                        onClick={() => updateState(i, { selectedRpe: r })}
                        className={`flex-1 h-8 rounded text-[10px] border transition-colors ${
                          s.selectedRpe === r
                            ? 'bg-[#00d26a] border-[#00d26a] text-[#0e0e0e] font-bold'
                            : 'bg-transparent border-[#2a2a2a] text-[#555]'
                        }`}
                        style={{
                          fontFamily: 'var(--font-jetbrains-mono, monospace)',
                        }}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Log set button */}
                <button
                  onClick={() => logSet(i)}
                  className="w-full bg-[#00d26a] text-[#0e0e0e] rounded-xl py-3 text-sm font-bold min-h-[44px] active:opacity-80 transition-opacity"
                >
                  Log set →
                </button>

                {/* Logged sets */}
                {s.loggedSets.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[#555] text-[11px] uppercase tracking-wider">
                      Logged
                    </div>
                    {s.loggedSets.map((ls) => (
                      <div
                        key={ls.setNum}
                        className="flex items-center justify-between text-[#888] text-[11px]"
                        style={{
                          fontFamily: 'var(--font-jetbrains-mono, monospace)',
                        }}
                      >
                        <span>Set {ls.setNum}</span>
                        <span>
                          {ls.weight}lb × {ls.reps} reps
                        </span>
                        <span>RPE {ls.rpe}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>
        )
      })}

      <div className="h-4" />
    </div>
  )
}
