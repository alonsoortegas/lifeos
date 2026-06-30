import { describe, expect, it } from 'vitest'
import {
  applyWhoopAdjustment,
  computeWhoopEnergyCalibration,
  generateDefaultMeals,
  nutritionDayPayload,
} from '@/lib/nutrition'
import type { NutritionDayType } from '@/lib/types'

const FOOD_MACROS: Record<string, { calories: number; protein: number; carbs: number; fat: number }> = {
  Banana: { calories: 105, protein: 1.3, carbs: 27, fat: 0.4 },
  Berries: { calories: 70, protein: 1, carbs: 17, fat: 0.5 },
  Bread: { calories: 80, protein: 3, carbs: 15, fat: 1 },
  'Dry oats 1/2 cup': { calories: 150, protein: 5, carbs: 30, fat: 3 },
  'Dry oats 1/4 cup': { calories: 75, protein: 2.5, carbs: 15, fat: 1.5 },
  'Dry oats 3/4 cup': { calories: 225, protein: 7.5, carbs: 45, fat: 4.5 },
  'Dry rice 1/2 cup': { calories: 335, protein: 6, carbs: 72, fat: 1 },
  Egg: { calories: 72, protein: 6, carbs: 0.4, fat: 5 },
  Granola: { calories: 140, protein: 3, carbs: 20, fat: 5 },
  'Mixed nuts': { calories: 175, protein: 5, carbs: 5, fat: 15 },
  'Olive oil': { calories: 120, protein: 0, carbs: 0, fat: 14 },
  'Protein powder': { calories: 120, protein: 25, carbs: 2, fat: 1.5 },
  'Raw chicken breast': { calories: 300, protein: 50, carbs: 0, fat: 6 },
  'Rice cakes': { calories: 70, protein: 1.4, carbs: 15, fat: 0.5 },
  'Salad / raw veggies': { calories: 35, protein: 2, carbs: 7, fat: 0 },
  'Skyr / magerquark': { calories: 150, protein: 22, carbs: 10, fat: 0.5 },
  Vegetables: { calories: 60, protein: 3, carbs: 12, fat: 0.5 },
  Vollkornbrot: { calories: 75, protein: 3, carbs: 13, fat: 1.5 },
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
        totals.carbs += macros.carbs * item.quantity
        totals.fat += macros.fat * item.quantity
        return totals
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0 },
    )
}

describe('bulk meal templates', () => {
  it('uses one flat daily bulk template for every day type', () => {
    expect(generateDefaultMeals('moderate')).toEqual(generateDefaultMeals('hard'))
    expect(generateDefaultMeals('rest')).toEqual(generateDefaultMeals('hard'))
  })

  it.each(['hard', 'moderate', 'rest'] as const)('%s template approximates the flat daily bulk target', (dayType) => {
    const totals = templateTotals(dayType)
    expect(totals.calories).toBeGreaterThanOrEqual(2650)
    expect(totals.calories).toBeLessThanOrEqual(2750)
    expect(totals.protein).toBeGreaterThanOrEqual(155)
    expect(totals.protein).toBeLessThanOrEqual(170)
    expect(totals.carbs).toBeGreaterThanOrEqual(325)
    expect(totals.carbs).toBeLessThanOrEqual(345)
    expect(totals.fat).toBeGreaterThanOrEqual(75)
    expect(totals.fat).toBeLessThanOrEqual(85)
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
