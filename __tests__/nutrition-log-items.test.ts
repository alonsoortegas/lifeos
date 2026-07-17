import { describe, expect, it } from 'vitest'
import {
  generateDefaultMeals,
  loggedMealItemLabel,
  parseGenericFoodDraft,
} from '@/lib/nutrition'

describe('loggedMealItemLabel', () => {
  it('labels catalog foods with quantity', () => {
    expect(loggedMealItemLabel({
      quantity: 2,
      custom_food_name: null,
      food_item: { name: 'Egg' },
    })).toBe('Egg x2')
  })

  it('labels custom foods without needing a catalog food', () => {
    expect(loggedMealItemLabel({
      quantity: 1,
      custom_food_name: 'slice of cheese',
      food_item: null,
    })).toBe('slice of cheese')
  })
})

describe('parseGenericFoodDraft', () => {
  it('accepts package macros for a single portion', () => {
    expect(parseGenericFoodDraft({
      name: 'slice of cheese',
      calories: '90',
      protein_g: '6',
      carbs_g: '1',
      fat_g: '7',
    })).toEqual({
      ok: true,
      value: {
        name: 'slice of cheese',
        calories: 90,
        protein_g: 6,
        carbs_g: 1,
        fat_g: 7,
      },
    })
  })

  it('computes calories when kcal is left blank', () => {
    expect(parseGenericFoodDraft({
      name: 'custom yogurt',
      calories: '',
      protein_g: '20',
      carbs_g: '10',
      fat_g: '2',
    })).toEqual({
      ok: true,
      value: {
        name: 'custom yogurt',
        calories: 138,
        protein_g: 20,
        carbs_g: 10,
        fat_g: 2,
      },
    })
  })

  it('rejects empty names and negative macros', () => {
    expect(parseGenericFoodDraft({
      name: '',
      calories: '100',
      protein_g: '5',
      carbs_g: '0',
      fat_g: '1',
    })).toEqual({ ok: false, error: 'name the food' })

    expect(parseGenericFoodDraft({
      name: 'bad food',
      calories: '100',
      protein_g: '-5',
      carbs_g: '0',
      fat_g: '1',
    })).toEqual({ ok: false, error: 'macros must be zero or higher' })
  })
})

describe('generateDefaultMeals', () => {
  it('does not include pre-workout or post-workout meals', () => {
    expect(generateDefaultMeals('hard').map((meal) => meal.name)).toEqual([
      'breakfast',
      'midday',
      'dinner',
      'snack',
    ])
  })

  it('shows a 125g dry pasta option at dinner', () => {
    const dinner = generateDefaultMeals('hard').find((meal) => meal.name === 'dinner')

    expect(dinner?.items).toContainEqual(expect.objectContaining({
      label: '1/2 cup dry rice, 125g dry pasta, or 420g raw potatoes',
    }))
  })
})
