import { describe, expect, it } from 'vitest'
import { formatDayText, formatWorkoutText, type ShareExercise } from '@/lib/share'

const DATE = new Date('2026-06-12T10:00:00')

function strength(sets: Array<[number, number, number]>): ShareExercise {
  return {
    name: 'Back Squat',
    modality: 'strength',
    sets: sets.map(([weight, reps, rpe], i) => ({ setNum: i + 1, weight, reps, rpe })),
  }
}

describe('formatWorkoutText', () => {
  it('collapses uniform strength sets into NxR @ load', () => {
    const text = formatWorkoutText({
      title: 'Lower Strength',
      sessionType: 'strength',
      weekNumber: 7,
      date: DATE,
      exercises: [strength([[92.5, 5, 8], [92.5, 5, 8], [92.5, 5, 8.5]])],
    })
    expect(text).toContain('strength session: Lower Strength — Week 7 — Friday, Jun 12, 2026')
    expect(text).toContain('Back Squat: 3×5 @ 92.5 kg (RPE 8, 8, 8.5)')
    expect(text).toContain('Total: 1 exercises · 3 sets')
  })

  it('lists varied strength sets individually and marks bodyweight', () => {
    const text = formatWorkoutText({
      title: 'Upper',
      date: DATE,
      exercises: [{
        name: 'Pull-up',
        modality: 'bodyweight',
        sets: [
          { setNum: 1, weight: 0, reps: 10, rpe: 7 },
          { setNum: 2, weight: 10, reps: 6, rpe: 9 },
        ],
      }],
    })
    expect(text).toContain('Pull-up: BW × 10, 10 kg × 6 (RPE 7, 9)')
  })

  it('formats erg sets with distance and time', () => {
    const text = formatWorkoutText({
      title: 'Machine Work',
      date: DATE,
      exercises: [{
        name: 'SkiErg',
        modality: 'erg',
        sets: [
          { setNum: 1, weight: 0, reps: 0, rpe: 0, distance_m: 200, duration_s: 42 },
          { setNum: 2, weight: 0, reps: 0, rpe: 0, distance_m: 200, duration_s: 41 },
        ],
      }],
    })
    expect(text).toContain('SkiErg: 2× 200m in 0:42, 200m in 0:41')
  })

  it('formats carries with load and distance', () => {
    const text = formatWorkoutText({
      title: 'Hyrox Prep',
      date: DATE,
      exercises: [{
        name: 'Farmers Carry',
        modality: 'carry',
        sets: [{ setNum: 1, weight: 32, reps: 0, rpe: 8, distance_m: 100 }],
      }],
    })
    expect(text).toContain('Farmers Carry: 32 kg × 100m')
  })

  it('skips exercises with no logged sets', () => {
    const text = formatWorkoutText({
      title: 'Lower',
      date: DATE,
      exercises: [
        strength([[100, 3, 8]]),
        { name: 'Lunge', modality: 'strength', sets: [] },
      ],
    })
    expect(text).not.toContain('Lunge')
    expect(text).toContain('Total: 1 exercises · 1 sets')
  })
})

describe('formatDayText', () => {
  it('includes readiness, vitals, goal, and fuel when present', () => {
    const text = formatDayText({
      date: DATE,
      readiness: {
        state: 'controlled',
        headline: 'Train as planned, cap RPE 8.5.',
        rationale: ['HRV -8% vs 30d', '7d load 1.02 — normal'],
        rpeCap: 8.5,
        volumeCap: 0.7,
        signals: {} as never,
      },
      recovery: 64,
      hrv: 52.3,
      rhr: 47,
      sleepScore: 71,
      topTodo: 'Ship onboarding',
      nutritionRemaining: { calories: 820, protein_g: 64 },
    })
    expect(text).toContain('Readiness: CONTROLLED — Train as planned, cap RPE 8.5.')
    expect(text).toContain('· HRV -8% vs 30d')
    expect(text).toContain('Vitals: recovery 64% · HRV 52.3 ms · RHR 47 bpm · sleep 71%')
    expect(text).toContain('Top goal: Ship onboarding')
    expect(text).toContain('Fuel remaining: 820 kcal · 64 g protein')
  })

  it('omits missing sections instead of inventing them', () => {
    const text = formatDayText({
      date: DATE,
      readiness: null,
      recovery: null,
      hrv: null,
      rhr: null,
      sleepScore: null,
      topTodo: null,
      nutritionRemaining: null,
    })
    expect(text).toBe('LifeOS day summary — Friday, Jun 12, 2026')
  })
})
