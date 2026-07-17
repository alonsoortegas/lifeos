import type { ParsedGenericFood } from '@/lib/nutrition'
import type { FoodItem, SavedFoodPortion } from '@/lib/types'

export type PortionOption = {
  key: string
  source: 'catalog' | 'saved'
  sourceId: number
  name: string
  portionLabel: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

export function normalizeSavedPortionName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

export function savedFoodPortionPayload(
  food: ParsedGenericFood,
): Omit<SavedFoodPortion, 'id' | 'created_at' | 'updated_at'> {
  const name = food.name.trim().replace(/\s+/g, ' ')

  return {
    normalized_name: normalizeSavedPortionName(name),
    name,
    calories: food.calories,
    protein_g: food.protein_g,
    carbs_g: food.carbs_g,
    fat_g: food.fat_g,
  }
}

export function buildPortionOptions(
  foods: FoodItem[],
  savedPortions: SavedFoodPortion[],
): PortionOption[] {
  return [
    ...foods.map((food) => ({
      key: `catalog:${food.id}`,
      source: 'catalog' as const,
      sourceId: food.id,
      name: food.name,
      portionLabel: food.portion_label,
      calories: food.calories,
      protein_g: food.protein_g,
      carbs_g: food.carbs_g,
      fat_g: food.fat_g,
    })),
    ...savedPortions.map((portion) => ({
      key: `saved:${portion.id}`,
      source: 'saved' as const,
      sourceId: portion.id,
      name: portion.name,
      portionLabel: '1 saved portion',
      calories: portion.calories,
      protein_g: portion.protein_g,
      carbs_g: portion.carbs_g,
      fat_g: portion.fat_g,
    })),
  ]
}

function roundMacro(value: number): number {
  return Math.round(value * 10) / 10
}

export function scalePortionOption(option: PortionOption, quantity: number) {
  return {
    quantity,
    calories: Math.round(option.calories * quantity),
    protein_g: roundMacro(option.protein_g * quantity),
    carbs_g: roundMacro(option.carbs_g * quantity),
    fat_g: roundMacro(option.fat_g * quantity),
  }
}

export function portionMealLogItemPayload(option: PortionOption, quantity: number) {
  const scaled = scalePortionOption(option, quantity)

  return {
    food_item_id: option.source === 'catalog' ? option.sourceId : null,
    custom_food_name: option.source === 'saved' ? option.name : null,
    source: option.source === 'catalog' ? 'catalog' as const : 'custom' as const,
    ...scaled,
    substitution_group: option.source === 'catalog'
      ? `extra:${option.name}`
      : `saved:${normalizeSavedPortionName(option.name)}`,
  }
}
