import type {
  FoodItem,
  MealLog,
  MealTemplateName,
  NutritionEquivalenceGroup,
  NutritionFoodPortion,
  NutritionDayType,
  NutritionGoal,
} from '@/lib/types'

export interface MacroTotals {
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

export interface DefaultMealItem {
  foodName: string
  quantity: number
  label: string
  substitutionGroup?: string
}

export interface DefaultMeal {
  name: MealTemplateName
  label: string
  defaultTime: string
  items: DefaultMealItem[]
}

export interface SubstitutionOption {
  foodItemId: number
  foodName: string
  label: string
  quantity: number
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  groupName: string
}

export interface PortionSubstitutionOption {
  foodKey: string
  label: string
  portionLabel: string
  equivalenceGroup: string
  comparisonMacro: 'protein' | 'carbs' | 'fat'
  macroDelta: number
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

export const MEAL_LABELS: Record<MealTemplateName, string> = {
  breakfast: 'Breakfast',
  midday: 'Midday',
  pre_workout: 'Pre-workout',
  post_workout: 'Post-workout',
  dinner: 'Dinner',
  snack: 'Snack',
}

export function getDailyTargets(dayType: NutritionDayType, goal: NutritionGoal): MacroTotals {
  if (goal === 'race_week') {
    return { calories: 2600, protein_g: 165, carbs_g: 330, fat_g: 70 }
  }

  const cutTargets: Record<NutritionDayType, MacroTotals> = {
    hard: { calories: 2500, protein_g: 165, carbs_g: 300, fat_g: 70 },
    moderate: { calories: 2250, protein_g: 165, carbs_g: 220, fat_g: 75 },
    rest: { calories: 1950, protein_g: 165, carbs_g: 150, fat_g: 70 },
  }

  if (goal === 'maintenance') {
    return {
      calories: dayType === 'hard' ? 2700 : dayType === 'moderate' ? 2450 : 2200,
      protein_g: 165,
      carbs_g: dayType === 'hard' ? 330 : dayType === 'moderate' ? 270 : 205,
      fat_g: dayType === 'rest' ? 70 : 75,
    }
  }

  return cutTargets[dayType]
}

export function calculateMacroCalories(macros: Pick<MacroTotals, 'protein_g' | 'carbs_g' | 'fat_g'>): number {
  return Math.round((macros.protein_g * 4) + (macros.carbs_g * 4) + (macros.fat_g * 9))
}

export function calculateConsumed(mealLogs: MealLog[]): MacroTotals {
  return mealLogs.reduce<MacroTotals>(
    (totals, log) => {
      for (const item of log.meal_log_item ?? []) {
        totals.calories += Number(item.calories) || 0
        totals.protein_g += Number(item.protein_g) || 0
        totals.carbs_g += Number(item.carbs_g) || 0
        totals.fat_g += Number(item.fat_g) || 0
      }
      return totals
    },
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  )
}

export function calculateRemaining(targets: MacroTotals, consumed: MacroTotals): MacroTotals {
  return {
    calories: Math.round(targets.calories - consumed.calories),
    protein_g: Math.round(targets.protein_g - consumed.protein_g),
    carbs_g: Math.round(targets.carbs_g - consumed.carbs_g),
    fat_g: Math.round(targets.fat_g - consumed.fat_g),
  }
}

export function generateDefaultMeals(dayType: NutritionDayType): DefaultMeal[] {
  const commonDinnerProtein: DefaultMealItem = {
    foodName: 'Raw chicken breast',
    quantity: 1,
    label: '270g raw chicken/turkey',
    substitutionGroup: 'protein_45_50g',
  }

  if (dayType === 'hard') {
    return [
      {
        name: 'breakfast',
        label: MEAL_LABELS.breakfast,
        defaultTime: '07:30',
        items: [
          { foodName: 'Egg', quantity: 4, label: '4 eggs' },
          { foodName: 'Vollkornbrot', quantity: 3, label: '3 slices Vollkornbrot', substitutionGroup: 'carb_45_50g' },
        ],
      },
      {
        name: 'midday',
        label: MEAL_LABELS.midday,
        defaultTime: '12:30',
        items: [
          { foodName: 'Skyr / magerquark', quantity: 1, label: '1 cup skyr/magerquark', substitutionGroup: 'protein_25g' },
          { foodName: 'Banana', quantity: 1, label: '1 banana', substitutionGroup: 'carb_27g' },
          { foodName: 'Dry oats 3/4 cup', quantity: 1, label: '3/4 cup dry oats', substitutionGroup: 'carb_45_50g' },
          { foodName: 'Berries', quantity: 1, label: 'berries' },
        ],
      },
      {
        name: 'pre_workout',
        label: MEAL_LABELS.pre_workout,
        defaultTime: '16:00',
        items: [
          { foodName: 'Banana', quantity: 1, label: '1 banana', substitutionGroup: 'carb_27g' },
          { foodName: 'Rice cakes', quantity: 1, label: '2 rice cakes', substitutionGroup: 'carb_15g' },
        ],
      },
      {
        name: 'post_workout',
        label: MEAL_LABELS.post_workout,
        defaultTime: '18:00',
        items: [
          { foodName: 'Protein powder', quantity: 1, label: '1 scoop protein', substitutionGroup: 'protein_25g' },
          { foodName: 'Banana', quantity: 1, label: '1 banana', substitutionGroup: 'carb_27g' },
        ],
      },
      {
        name: 'dinner',
        label: MEAL_LABELS.dinner,
        defaultTime: '20:00',
        items: [
          commonDinnerProtein,
          { foodName: 'Dry rice 1/2 cup', quantity: 1, label: '1/2 cup dry rice', substitutionGroup: 'carb_70g_starchy' },
          { foodName: 'Vegetables', quantity: 1, label: 'vegetables' },
          { foodName: 'Olive oil', quantity: 1, label: '15ml olive oil' },
        ],
      },
      {
        name: 'snack',
        label: MEAL_LABELS.snack,
        defaultTime: '21:30',
        items: [
          { foodName: 'Mixed nuts', quantity: 1, label: '25g mixed nuts' },
          { foodName: 'Protein powder', quantity: 0.5, label: '1/2 scoop protein', substitutionGroup: 'protein_25g' },
        ],
      },
    ]
  }

  if (dayType === 'moderate') {
    return [
      {
        name: 'breakfast',
        label: MEAL_LABELS.breakfast,
        defaultTime: '07:30',
        items: [
          { foodName: 'Egg', quantity: 4, label: '4 eggs' },
          { foodName: 'Protein powder', quantity: 1, label: '1 scoop protein', substitutionGroup: 'protein_25g' },
          { foodName: 'Dry oats 1/2 cup', quantity: 1, label: '1/2 cup oats', substitutionGroup: 'carb_27g' },
          { foodName: 'Berries', quantity: 1, label: 'berries' },
        ],
      },
      {
        name: 'midday',
        label: MEAL_LABELS.midday,
        defaultTime: '12:30',
        items: [
          { foodName: 'Skyr / magerquark', quantity: 1, label: '1 cup skyr/magerquark', substitutionGroup: 'protein_25g' },
          { foodName: 'Banana', quantity: 1, label: '1 banana', substitutionGroup: 'carb_27g' },
          { foodName: 'Salad / raw veggies', quantity: 1, label: 'salad/raw veggies' },
        ],
      },
      {
        name: 'pre_workout',
        label: MEAL_LABELS.pre_workout,
        defaultTime: '16:00',
        items: [],
      },
      {
        name: 'post_workout',
        label: MEAL_LABELS.post_workout,
        defaultTime: '18:00',
        items: [],
      },
      {
        name: 'dinner',
        label: MEAL_LABELS.dinner,
        defaultTime: '19:30',
        items: [
          commonDinnerProtein,
          { foodName: 'Dry rice 1/2 cup', quantity: 1, label: '1/2 cup dry rice', substitutionGroup: 'carb_70g' },
          { foodName: 'Vegetables', quantity: 1, label: 'vegetables' },
        ],
      },
    ]
  }

  return [
    {
      name: 'breakfast',
      label: MEAL_LABELS.breakfast,
      defaultTime: '08:00',
      items: [
        { foodName: 'Egg', quantity: 4, label: '4 eggs' },
        { foodName: 'Protein powder', quantity: 1, label: '1 scoop protein', substitutionGroup: 'protein_25g' },
        { foodName: 'Dry oats 1/4 cup', quantity: 1, label: '1/4 cup oats', substitutionGroup: 'carb_15g' },
      ],
    },
    {
      name: 'midday',
      label: MEAL_LABELS.midday,
      defaultTime: '12:30',
      items: [
        { foodName: 'Skyr / magerquark', quantity: 1, label: '1 cup skyr/magerquark', substitutionGroup: 'protein_25g' },
        { foodName: 'Berries', quantity: 1, label: 'berries' },
      ],
    },
    {
      name: 'pre_workout',
      label: MEAL_LABELS.pre_workout,
      defaultTime: '16:00',
      items: [],
    },
    {
      name: 'post_workout',
      label: MEAL_LABELS.post_workout,
      defaultTime: '18:00',
      items: [],
    },
    {
      name: 'dinner',
      label: MEAL_LABELS.dinner,
      defaultTime: '19:30',
      items: [commonDinnerProtein, { foodName: 'Vegetables', quantity: 1, label: 'vegetables only' }],
    },
  ]
}

export function getSubstitutions(
  foodItemId: number,
  foods: FoodItem[],
  groups: { groupName: string; foodItemId: number; quantity: number; label: string }[],
  requestedGroupName?: string
): SubstitutionOption[] {
  const groupNames = requestedGroupName
    ? [requestedGroupName]
    : groups.filter((item) => item.foodItemId === foodItemId).map((item) => item.groupName)

  return groups
    .filter((item) => groupNames.includes(item.groupName) && item.foodItemId !== foodItemId)
    .map((item) => {
      const food = foods.find((candidate) => candidate.id === item.foodItemId)
      if (!food) return null
      return {
        foodItemId: food.id,
        foodName: food.name,
        label: item.label,
        quantity: item.quantity,
        calories: Math.round(food.calories * item.quantity),
        protein_g: roundMacro(food.protein_g * item.quantity),
        carbs_g: roundMacro(food.carbs_g * item.quantity),
        fat_g: roundMacro(food.fat_g * item.quantity),
        groupName: item.groupName,
      }
    })
    .filter((item): item is SubstitutionOption => Boolean(item))
}

export function getPortionSubstitutions(
  foodKey: string,
  portions: NutritionFoodPortion[],
  equivalenceGroups: NutritionEquivalenceGroup[]
): PortionSubstitutionOption[] {
  const source = portions.find((portion) => portion.food_key === foodKey)
  if (!source) return []

  const group = equivalenceGroups.find((candidate) => candidate.key === source.equivalence_group)
  const comparisonMacro = group?.compare_macro ?? dominantMacro(source)
  const sourceValue = macroFor(source, comparisonMacro)

  return portions
    .filter((portion) => portion.food_key !== source.food_key && portion.equivalence_group === source.equivalence_group)
    .map((portion) => ({
      foodKey: portion.food_key,
      label: portion.label,
      portionLabel: portion.portion_label,
      equivalenceGroup: portion.equivalence_group,
      comparisonMacro,
      macroDelta: roundMacro(macroFor(portion, comparisonMacro) - sourceValue),
      calories: calculateMacroCalories(portion),
      protein_g: portion.protein_g,
      carbs_g: portion.carbs_g,
      fat_g: portion.fat_g,
    }))
    .sort((a, b) => Math.abs(a.macroDelta) - Math.abs(b.macroDelta))
}

export function suggestNextFood(remainingMacros: MacroTotals, dayType: NutritionDayType): string {
  if (remainingMacros.protein_g > 20) {
    return 'Add 1 scoop protein or 1 cup skyr/magerquark.'
  }

  if (dayType === 'hard' && remainingMacros.carbs_g > 35) {
    return 'Add a carb block: banana, rice, oats, bread, tortilla, or rice cakes.'
  }

  if (dayType !== 'rest' && remainingMacros.carbs_g > 55) {
    return 'Add rice or oats with the next meal.'
  }

  if (dayType === 'rest' && remainingMacros.calories > 250 && remainingMacros.protein_g > 8) {
    return 'Keep it protein-led: skyr/magerquark, protein scoop, eggs, chicken, or lean beef.'
  }

  if (remainingMacros.calories < -100) {
    return 'You are over target. Keep the rest of today protein and vegetables only.'
  }

  return 'Stay with the template. Vegetables can stay loosely tracked.'
}

export function scaleFood(food: FoodItem, quantity: number) {
  return {
    quantity,
    calories: Math.round(food.calories * quantity),
    protein_g: roundMacro(food.protein_g * quantity),
    carbs_g: roundMacro(food.carbs_g * quantity),
    fat_g: roundMacro(food.fat_g * quantity),
  }
}

export function scalePortion(portion: NutritionFoodPortion, quantity: number) {
  const scaled = {
    quantity,
    calories: calculateMacroCalories({
      protein_g: portion.protein_g * quantity,
      carbs_g: portion.carbs_g * quantity,
      fat_g: portion.fat_g * quantity,
    }),
    protein_g: roundMacro(portion.protein_g * quantity),
    carbs_g: roundMacro(portion.carbs_g * quantity),
    fat_g: roundMacro(portion.fat_g * quantity),
  }

  return scaled
}

function macroFor(portion: NutritionFoodPortion, macro: 'protein' | 'carbs' | 'fat'): number {
  if (macro === 'protein') return portion.protein_g
  if (macro === 'carbs') return portion.carbs_g
  return portion.fat_g
}

function dominantMacro(portion: NutritionFoodPortion): 'protein' | 'carbs' | 'fat' {
  const values = [
    ['protein', portion.protein_g],
    ['carbs', portion.carbs_g],
    ['fat', portion.fat_g],
  ] as const

  return [...values].sort((a, b) => b[1] - a[1])[0][0]
}

function roundMacro(value: number): number {
  return Math.round(value * 10) / 10
}
