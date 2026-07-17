# Nutrition Saved Portions Design

**Date:** 2026-07-17

## Goal

Let a user optionally save a manually entered food as a reusable portion while logging it. Manual foods must still be loggable without being saved.

## User Experience

The existing generic-food form keeps its current **Add** action. That action logs one custom food portion for the selected meal and does not change the reusable portion list.

A second **Add & save portion** action appears beside it. It uses the same validated name and macro fields, saves those values as one reusable standard portion, logs one portion for the selected meal, clears the form, and immediately adds the saved item to every meal's existing portion dropdown.

Selecting a saved item from the dropdown uses the existing quantity control. A quantity of `1` represents the exact calories and macros entered when the portion was saved; other quantities scale those values through the existing portion-scaling behavior.

Saving the same normalized name again updates the existing saved portion's display name and macros rather than creating a duplicate. Editing and deleting saved portions are outside this change.

## Data Model

Add a dedicated `saved_food_portion` table rather than writing personal entries into `food_item`. The existing `food_item` table remains read-only nutrition-plan catalog data.

Each saved portion stores:

- an identity primary key;
- a unique normalized name and a display name;
- calories, protein, carbohydrates, and fat for one portion;
- creation and update timestamps.

The app is currently single-owner and protects nutrition data with the existing `is_owner()` function. The new table follows that model: enable row-level security and allow the authenticated owner to select, insert, and update rows. Grant only the Data API privileges needed for those actions. The migration also adds an updated-at trigger using the project's existing helper.

## Components and Data Flow

`GenericFoodAdder` exposes separate callbacks for log-only and log-and-save actions. Both actions use the same parsing and validation result so their accepted input remains identical.

The mobile and desktop nutrition containers load saved portions alongside catalog foods during initialization. They retain catalog foods for templates and substitutions, and build a combined portion-option collection for the reusable dropdown.

For **Add**:

1. Validate the manual food.
2. Insert the existing custom `meal_log_item` row.
3. Reload today's meal logs and clear the form on success.

For **Add & save portion**:

1. Validate the manual food.
2. Upsert the saved portion by normalized name.
3. Log the same values as the existing custom `meal_log_item` row.
4. Refresh the saved-portion collection and today's meal logs.
5. Clear the form only when both operations succeed.

When a saved portion is chosen from the dropdown, logging still creates a custom `meal_log_item` snapshot with its name and scaled macros. Historical logs therefore do not change if the saved portion is updated later.

## Errors and Consistency

Validation errors remain local to the generic-food form. Database failures use the nutrition tab's existing transient error treatment on mobile and the existing console/error pattern on desktop, with a specific message when saving a reusable portion fails.

If the portion upsert succeeds but logging fails, the reusable portion remains saved and the form remains populated so the user can retry logging. This avoids deleting or reverting a previously saved portion during error recovery. The UI refreshes the saved dropdown after a successful upsert even when the subsequent log fails.

## Testing

Unit tests cover:

- normalization used to identify duplicate saved-portion names;
- mapping catalog and saved rows into one dropdown option shape;
- scaling saved-portion macros by the selected quantity;
- preserving the existing manual-food validation behavior.

Component-level behavior is verified for the two explicit actions: **Add** calls log-only behavior, while **Add & save portion** requests both persistence operations and only clears after full success. Existing nutrition helper tests, lint, type checking, and the production build must remain green.

The database migration is verified locally where the Supabase runtime is available, including owner-only select/insert/update access and duplicate-name upsert behavior.

## Scope

This change includes optional save-on-log, immediate dropdown availability, cross-device persistence, duplicate-name updates, and support in both mobile and desktop nutrition views.

It does not include editing, deleting, reordering, categorizing, or sharing saved portions.
