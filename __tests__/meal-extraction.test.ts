import { describe, expect, it } from 'vitest'
import { deterministicMealExtraction } from '@/lib/meal-extraction'

const foods = [
  { id: 1, name: 'Egg', portion_label: '1 egg' },
  { id: 2, name: 'Banana', portion_label: '1 medium' },
  { id: 3, name: 'Protein powder', portion_label: '1 scoop' },
]

describe('deterministic meal extraction fallback', () => {
  it('grounds recognized foods to catalog ids and quantities', () => {
    const meal = deterministicMealExtraction(
      'dinner: 2 Egg, 1 Banana and Protein powder',
      foods,
    )
    expect(meal.meal_name).toBe('dinner')
    expect(meal.items).toEqual([
      expect.objectContaining({ food_item_id: 1, quantity: 2 }),
      expect.objectContaining({ food_item_id: 2, quantity: 1 }),
      expect.objectContaining({ food_item_id: 3, quantity: 1 }),
    ])
  })

  it('returns unmatched text instead of inventing a catalog item', () => {
    const meal = deterministicMealExtraction('mystery smoothie', foods)
    expect(meal.items).toEqual([])
    expect(meal.unmatched).toEqual(['mystery smoothie'])
  })
})
