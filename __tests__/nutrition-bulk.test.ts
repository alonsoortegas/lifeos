import { describe, expect, it } from 'vitest'
import {
  applyWhoopAdjustment,
  computeWhoopEnergyCalibration,
  generateDefaultMeals,
  nutritionDayPayload,
} from '@/lib/nutrition'
import type { NutritionDayType } from '@/lib/types'

const FOOD_MACROS: Record<string, { calories: number; protein: number }> = {
  Banana: { calories: 105, protein: 1.3 },
  Berries: { calories: 70, protein: 1 },
  Bread: { calories: 80, protein: 3 },
  'Dry oats 1/2 cup': { calories: 150, protein: 5 },
  'Dry oats 1/4 cup': { calories: 75, protein: 2.5 },
  'Dry oats 3/4 cup': { calories: 225, protein: 7.5 },
  'Dry rice 1/2 cup': { calories: 335, protein: 6 },
  Egg: { calories: 72, protein: 6 },
  Granola: { calories: 140, protein: 3 },
  'Mixed nuts': { calories: 175, protein: 5 },
  'Olive oil': { calories: 120, protein: 0 },
  'Protein powder': { calories: 120, protein: 25 },
  'Raw chicken breast': { calories: 300, protein: 50 },
  'Rice cakes': { calories: 70, protein: 1.4 },
  'Salad / raw veggies': { calories: 35, protein: 2 },
  'Skyr / magerquark': { calories: 150, protein: 22 },
  Vegetables: { calories: 60, protein: 3 },
  Vollkornbrot: { calories: 75, protein: 3 },
}

function templateTotals(dayType: NutritionDayType) {
  return generateDefaultMeals(dayType)
    .flatMap((meal) => meal.items)
    .reduce(
      (totals, item) => {
        const macros = FOOD_MACROS[item.foodName]
        expect(macros, `Missing test macros for ${item.foodName}`).toBeDefined()
        totals.calories += macros.calories * item.quantity
        totals.protein += macros.protein * item.quantity
        return totals
      },
      { calories: 0, protein: 0 },
    )
}

describe('bulk meal templates', () => {
  it.each([
    ['hard', 2800],
    ['moderate', 2650],
    ['rest', 2450],
  ] as const)('%s template approximates its calorie and protein target', (dayType, target) => {
    const totals = templateTotals(dayType)
    expect(totals.calories).toBeGreaterThanOrEqual(target - 75)
    expect(totals.calories).toBeLessThanOrEqual(target + 75)
    expect(totals.protein).toBeGreaterThanOrEqual(150)
    expect(totals.protein).toBeLessThanOrEqual(175)
  })
})

function cycle(daysAgo: number, calories: number, completed = true) {
  const end = new Date('2026-06-29T06:00:00Z')
  end.setUTCDate(end.getUTCDate() - daysAgo)
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000)
  return {
    kilojoule: calories * 4.184,
    cycle_start: start.toISOString(),
    cycle_end: completed ? end.toISOString() : null,
  }
}

describe('WHOOP calorie calibration', () => {
  it('adjusts from recent completed cycles relative to the rolling baseline', () => {
    const snapshots = Array.from({ length: 28 }, (_, index) =>
      cycle(index, index < 7 ? 2200 : 2000)
    )
    const calibration = computeWhoopEnergyCalibration(snapshots)

    expect(calibration).toEqual({
      method: 'whoop_rolling_v1',
      adjustment: 150,
      baselineCalories: 2000,
      recentCalories: 2200,
      completedCycles: 28,
    })
  })

  it('ignores incomplete cycles and requires enough history', () => {
    const snapshots = Array.from({ length: 13 }, (_, index) => cycle(index, 2200))
    snapshots.push(cycle(14, 4500, false))

    expect(computeWhoopEnergyCalibration(snapshots)).toEqual({
      method: 'static',
      adjustment: 0,
      baselineCalories: null,
      recentCalories: null,
      completedCycles: 13,
    })
  })

  it('caps the adjustment and allocates it to carbohydrates', () => {
    const calibration = {
      method: 'whoop_rolling_v1' as const,
      adjustment: 300,
      baselineCalories: 1800,
      recentCalories: 2600,
      completedCycles: 28,
    }
    const adjusted = applyWhoopAdjustment({
      hard: { calories: 2800, protein_g: 160, carbs_g: 360, fat_g: 80 },
    }, calibration)

    expect(adjusted.hard).toEqual({
      calories: 3100,
      protein_g: 160,
      carbs_g: 435,
      fat_g: 80,
    })
    expect(nutritionDayPayload('hard', adjusted.hard!, calibration)).toMatchObject({
      calories_target: 3100,
      base_calories_target: 2800,
      whoop_calorie_adjustment: 300,
      calorie_target_method: 'whoop_rolling_v1',
    })
  })
})
