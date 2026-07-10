# Saturday Sled Distance Design

## Goal

Reduce the Saturday Sled Push and Sled Pull prescription in the active `bulk-summer-2026` training block to one 20 m set each, without adding a dedicated distance field.

## Chosen approach

Add a new Supabase migration that updates existing Saturday Sled Push and Sled Pull records in `public.workout_exercises` for sessions in the `bulk-summer-2026` block. For each exercise, set `prescribed_sets` to `1` and replace the existing note with `20 m. Hard but controlled. No form breakdown.`

## Why this approach

The plan’s current records were created by migrations that have already run, so changing their old template migrations would not alter the live plan. A focused corrective migration updates every active week consistently. `prescribed_sets` continues to control the set count already displayed by the workout UI, while the existing `notes` column carries the distance as requested.

## Alternatives considered

1. Edit the original plan template migration. This would only affect fresh databases and would leave the current plan unchanged.
2. Add a dedicated distance column and user-interface field. This is unnecessary for a single fixed prescription and expands scope.
3. Update the database manually. This is not reproducible for future environments.

## Data flow and scope

The migration targets only workout exercises whose parent session has `block_slug = 'bulk-summer-2026'`, `day_of_week = 'saturday'`, and whose name is `Sled Push` or `Sled Pull`. It does not change session metadata, workout logging, UI components, or other training blocks.

## Verification

After applying the migration, query the targeted exercise rows and confirm that both names have `prescribed_sets = 1` and the exact distance-bearing note. Validate the migration syntax with the repository’s available Supabase workflow, if configured.
