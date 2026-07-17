import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationsDirectory = join(process.cwd(), 'supabase', 'migrations')
const migrationFile = readdirSync(migrationsDirectory)
  .find((file) => file.endsWith('_save_nutrition_portions.sql'))
const sql = migrationFile
  ? readFileSync(join(migrationsDirectory, migrationFile), 'utf8')
  : ''

describe('saved nutrition portions migration', () => {
  it('creates a normalized reusable portion table with macro checks', () => {
    expect(migrationFile).toBeDefined()
    expect(sql).toMatch(/create table public\.saved_food_portion/i)
    expect(sql).toMatch(/unique\s*\(normalized_name\)/i)
    expect(sql).toMatch(/normalized_name\s*=\s*lower\s*\(regexp_replace/i)
    expect(sql).toMatch(/calories\s*>=\s*0/i)
    expect(sql).toMatch(/protein_g\s*>=\s*0/i)
    expect(sql).toMatch(/carbs_g\s*>=\s*0/i)
    expect(sql).toMatch(/fat_g\s*>=\s*0/i)
  })

  it('protects the table with owner-only RLS policies', () => {
    expect(sql).toMatch(/alter table public\.saved_food_portion\s+enable row level security/i)
    expect(sql).toMatch(/for select to authenticated\s+using \(is_owner\(\)\)/i)
    expect(sql).toMatch(/for insert to authenticated\s+with check \(is_owner\(\)\)/i)
    expect(sql).toMatch(
      /for update to authenticated\s+using \(is_owner\(\)\)\s+with check \(is_owner\(\)\)/i,
    )
  })

  it('explicitly exposes only the required Data API operations', () => {
    expect(sql).toMatch(
      /grant select, insert, update on table public\.saved_food_portion to authenticated/i,
    )
    expect(sql).toMatch(
      /grant usage, select on sequence public\.saved_food_portion_id_seq to authenticated/i,
    )
    expect(sql).not.toMatch(/grant delete on table public\.saved_food_portion/i)
    expect(sql).not.toMatch(/to anon/i)
  })
})
