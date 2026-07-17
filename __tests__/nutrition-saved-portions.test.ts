import { describe, expect, it } from 'vitest'
import {
  buildPortionOptions,
  normalizeSavedPortionName,
  savedFoodPortionPayload,
  scalePortionOption,
} from '@/lib/nutrition-portions'
import type { FoodItem, SavedFoodPortion } from '@/lib/types'

const catalogFood: FoodItem = {
  id: 3,
  name: 'Egg',
  category: 'protein',
  portion_label: '1 egg',
  grams: 50,
  calories: 72,
  protein_g: 6,
  carbs_g: 0.4,
  fat_g: 5,
  tracking_unit: 'piece',
  notes: null,
}

const savedPortion: SavedFoodPortion = {
  id: 9,
  normalized_name: 'greek yogurt',
  name: 'Greek Yogurt',
  calories: 120,
  protein_g: 20,
  carbs_g: 8,
  fat_g: 1,
  created_at: '2026-07-17T10:00:00Z',
  updated_at: '2026-07-17T10:00:00Z',
}

describe('saved nutrition portions', () => {
  it('normalizes names for duplicate detection', () => {
    expect(normalizeSavedPortionName('  Greek   Yogurt  ')).toBe('greek yogurt')
  })

  it('builds a clean upsert payload from a manual food', () => {
    expect(savedFoodPortionPayload({
      name: ' Greek Yogurt ',
      calories: 120,
      protein_g: 20,
      carbs_g: 8,
      fat_g: 1,
    })).toEqual({
      normalized_name: 'greek yogurt',
      name: 'Greek Yogurt',
      calories: 120,
      protein_g: 20,
      carbs_g: 8,
      fat_g: 1,
    })
  })

  it('combines catalog and saved portions into stable dropdown options', () => {
    expect(buildPortionOptions([catalogFood], [savedPortion])).toEqual([
      {
        key: 'catalog:3',
        source: 'catalog',
        sourceId: 3,
        name: 'Egg',
        portionLabel: '1 egg',
        calories: 72,
        protein_g: 6,
        carbs_g: 0.4,
        fat_g: 5,
      },
      {
        key: 'saved:9',
        source: 'saved',
        sourceId: 9,
        name: 'Greek Yogurt',
        portionLabel: '1 saved portion',
        calories: 120,
        protein_g: 20,
        carbs_g: 8,
        fat_g: 1,
      },
    ])
  })

  it('scales the macro snapshot for any selected quantity', () => {
    const savedOption = buildPortionOptions([], [savedPortion])[0]

    expect(scalePortionOption(savedOption, 1.5)).toEqual({
      quantity: 1.5,
      calories: 180,
      protein_g: 30,
      carbs_g: 12,
      fat_g: 1.5,
    })
  })
})
