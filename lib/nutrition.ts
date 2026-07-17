import type {
  FoodItem,
  MealLog,
  MealTemplateName,
  NutritionEquivalenceGroup,
  NutritionFoodPortion,
  NutritionDayType,
  NutritionDayTypeRow,
} from '@/lib/types'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface MacroTotals {
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

export interface WhoopEnergySnapshot {
  kilojoule: number | string | null
  recorded_at?: string
  cycle_start?: string | null
  cycle_end?: string | null
  raw_json?: {
    cycle?: {
      start?: string | null
      end?: string | null
    } | null
  } | null
}

export interface WhoopEnergyCalibration {
  method: 'static' | 'whoop_rolling_v1'
  adjustment: number
  baselineCalories: number | null
  recentCalories: number | null
  completedCycles: number
}

export interface NutritionTargetPlan {
  targets: Partial<Record<NutritionDayType, MacroTotals>>
  calibration: WhoopEnergyCalibration
}

export const FLAT_BULK_DAY_TYPE: NutritionDayType = 'hard'

export const STATIC_WHOOP_ENERGY_CALIBRATION: WhoopEnergyCalibration = {
  method: 'static',
  adjustment: 0,
  baselineCalories: null,
  recentCalories: null,
  completedCycles: 0,
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

export type GenericFoodDraft = {
  name: string
  calories: string
  protein_g: string
  carbs_g: string
  fat_g: string
}

export type ParsedGenericFood = {
  name: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

export type GenericFoodParseResult =
  | { ok: true; value: ParsedGenericFood }
  | { ok: false; error: string }

export const MEAL_LABELS: Record<MealTemplateName, string> = {
  breakfast: 'Breakfast',
  midday: 'Midday',
  pre_workout: 'Pre-workout',
  post_workout: 'Post-workout',
  dinner: 'Dinner',
  snack: 'Snack',
}

export const EMPTY_MACRO_TOTALS: MacroTotals = {
  calories: 0,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
}

export function normalizedNutritionKey(dayType: NutritionDayType): NutritionDayTypeRow['key'] {
  if (dayType === 'hard') return 'hard_training'
  if (dayType === 'moderate') return 'moderate_training'
  return 'rest_easy'
}

export function targetMapFromRows(
  rows: Array<Pick<NutritionDayTypeRow, 'key' | 'kcal_target' | 'protein_g' | 'carbs_g' | 'fat_g'>>,
): Partial<Record<NutritionDayType, MacroTotals>> {
  const result: Partial<Record<NutritionDayType, MacroTotals>> = {}
  for (const row of rows) {
    const dayType: NutritionDayType =
      row.key === 'hard_training' ? 'hard' :
      row.key === 'moderate_training' ? 'moderate' :
      'rest'
    result[dayType] = {
      calories: Number(row.kcal_target),
      protein_g: Number(row.protein_g),
      carbs_g: Number(row.carbs_g),
      fat_g: Number(row.fat_g),
    }
  }
  return result
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function cycleBounds(snapshot: WhoopEnergySnapshot) {
  return {
    start: snapshot.cycle_start ?? snapshot.raw_json?.cycle?.start ?? null,
    end: snapshot.cycle_end ?? snapshot.raw_json?.cycle?.end ?? null,
  }
}

export function computeWhoopEnergyCalibration(
  snapshots: WhoopEnergySnapshot[],
): WhoopEnergyCalibration {
  const normalized = snapshots.flatMap((snapshot) => {
    const kilojoule = Number(snapshot.kilojoule)
    const { start, end } = cycleBounds(snapshot)
    if (!Number.isFinite(kilojoule) || kilojoule <= 0 || !start || !end) return []

    const startMs = new Date(start).getTime()
    const endMs = new Date(end).getTime()
    const durationHours = (endMs - startMs) / 3_600_000
    if (!Number.isFinite(durationHours) || durationHours < 16 || durationHours > 36) return []

    const calories24h = (kilojoule / 4.184) * (24 / durationHours)
    if (calories24h < 1000 || calories24h > 5000) return []
    return [{ endMs, calories24h }]
  }).sort((a, b) => b.endMs - a.endMs).slice(0, 28)

  if (normalized.length < 14) {
    return { ...STATIC_WHOOP_ENERGY_CALIBRATION, completedCycles: normalized.length }
  }

  const baselineCalories = Math.round(median(normalized.map((cycle) => cycle.calories24h)))
  const recentCalories = Math.round(median(normalized.slice(0, 7).map((cycle) => cycle.calories24h)))
  const adjustment = clamp(
    Math.round(((recentCalories - baselineCalories) * 0.75) / 50) * 50,
    -200,
    300,
  )

  return {
    method: 'whoop_rolling_v1',
    adjustment,
    baselineCalories,
    recentCalories,
    completedCycles: normalized.length,
  }
}

export function applyWhoopAdjustment(
  targets: Partial<Record<NutritionDayType, MacroTotals>>,
  calibration: WhoopEnergyCalibration,
): Partial<Record<NutritionDayType, MacroTotals>> {
  if (calibration.method === 'static' || calibration.adjustment === 0) return targets

  return Object.fromEntries(
    Object.entries(targets).map(([dayType, target]) => [
      dayType,
      {
        ...target,
        calories: target.calories + calibration.adjustment,
        carbs_g: Math.max(0, Math.round(target.carbs_g + calibration.adjustment / 4)),
      },
    ]),
  ) as Partial<Record<NutritionDayType, MacroTotals>>
}

export async function loadNutritionTargetPlan(
  supabase: SupabaseClient,
): Promise<NutritionTargetPlan> {
  const targetResult = await supabase
    .from('nutrition_day_types')
    .select('key, kcal_target, protein_g, carbs_g, fat_g')

  const targets = targetMapFromRows(targetResult.data ?? [])
  return {
    targets,
    calibration: STATIC_WHOOP_ENERGY_CALIBRATION,
  }
}

export function nutritionDayPayload(
  dayType: NutritionDayType,
  target: MacroTotals,
  calibration: WhoopEnergyCalibration,
) {
  return {
    day_type: dayType,
    goal: 'bulk' as const,
    calories_target: Math.round(target.calories),
    protein_target: Math.round(target.protein_g),
    carbs_target: Math.round(target.carbs_g),
    fat_target: Math.round(target.fat_g),
    base_calories_target: Math.round(target.calories - calibration.adjustment),
    whoop_calories_baseline: calibration.baselineCalories,
    whoop_calories_recent: calibration.recentCalories,
    whoop_calorie_adjustment: calibration.adjustment,
    calorie_target_method: calibration.method,
  }
}

export function getDefaultNutritionDayType(reference = new Date()): NutritionDayType {
  void reference
  return FLAT_BULK_DAY_TYPE
}

export function calculateMacroCalories(macros: Pick<MacroTotals, 'protein_g' | 'carbs_g' | 'fat_g'>): number {
  return Math.round((macros.protein_g * 4) + (macros.carbs_g * 4) + (macros.fat_g * 9))
}

export function loggedMealItemLabel(item: {
  quantity: number
  custom_food_name?: string | null
  food_item?: { name?: string | null } | null
}): string {
  const foodName = item.custom_food_name?.trim() || item.food_item?.name || 'food'
  const quantity = Number(item.quantity) || 0
  if (quantity <= 0 || quantity === 1) return foodName

  return `${foodName} x${quantityValue(quantity)}`
}

function parseNonnegativeNumber(value: string): number | null {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return roundMacro(parsed)
}

export function parseGenericFoodDraft(draft: GenericFoodDraft): GenericFoodParseResult {
  const name = draft.name.trim()
  if (!name) return { ok: false, error: 'name the food' }

  const protein = parseNonnegativeNumber(draft.protein_g)
  const carbs = parseNonnegativeNumber(draft.carbs_g)
  const fat = parseNonnegativeNumber(draft.fat_g)
  if (protein === null || carbs === null || fat === null) {
    return { ok: false, error: 'macros must be zero or higher' }
  }

  const calories = draft.calories.trim()
    ? parseNonnegativeNumber(draft.calories)
    : calculateMacroCalories({ protein_g: protein, carbs_g: carbs, fat_g: fat })
  if (calories === null) return { ok: false, error: 'calories must be zero or higher' }
  if (calories === 0 && protein === 0 && carbs === 0 && fat === 0) {
    return { ok: false, error: 'enter at least one macro' }
  }

  return {
    ok: true,
    value: {
      name,
      calories: Math.round(calories),
      protein_g: protein,
      carbs_g: carbs,
      fat_g: fat,
    },
  }
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
  void dayType

  const commonDinnerProtein: DefaultMealItem = {
    foodName: 'Raw chicken breast',
    quantity: 1,
    label: '270g raw chicken/turkey',
    substitutionGroup: 'protein_45_50g',
  }

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
      name: 'dinner',
      label: MEAL_LABELS.dinner,
      defaultTime: '20:00',
      items: [
        commonDinnerProtein,
        { foodName: 'Dry rice 1/2 cup', quantity: 1, label: '1/2 cup dry rice, 125g dry pasta, or 420g raw potatoes', substitutionGroup: 'carb_70g_starchy' },
        { foodName: 'Vegetables', quantity: 1, label: 'vegetables' },
        { foodName: 'Olive oil', quantity: 1, label: '15ml olive oil' },
      ],
    },
    {
      name: 'snack',
      label: MEAL_LABELS.snack,
      defaultTime: '21:30',
      items: [
        { foodName: 'Mixed nuts', quantity: 1.3, label: '30g mixed nuts' },
        { foodName: 'Granola', quantity: 1, label: '1/4 cup granola', substitutionGroup: 'carb_27g' },
        { foodName: 'Bread', quantity: 1, label: '1 slice bread', substitutionGroup: 'carb_15g' },
      ],
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

function quantityValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '')
}
