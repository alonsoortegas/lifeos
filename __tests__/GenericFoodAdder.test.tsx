// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import GenericFoodAdder from '@/components/nutrition/GenericFoodAdder'

const expectedFood = {
  name: 'Greek Yogurt',
  calories: 120,
  protein_g: 20,
  carbs_g: 8,
  fat_g: 1,
}

function fillValidFood() {
  fireEvent.change(screen.getByLabelText('Food name'), { target: { value: 'Greek Yogurt' } })
  fireEvent.change(screen.getByLabelText('Calories'), { target: { value: '120' } })
  fireEvent.change(screen.getByLabelText('Protein grams'), { target: { value: '20' } })
  fireEvent.change(screen.getByLabelText('Carb grams'), { target: { value: '8' } })
  fireEvent.change(screen.getByLabelText('Fat grams'), { target: { value: '1' } })
}

afterEach(cleanup)

describe('GenericFoodAdder', () => {
  it('keeps Add as a log-only action', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true)
    const onSaveAndSubmit = vi.fn().mockResolvedValue(true)
    render(
      <GenericFoodAdder
        saving={false}
        onSubmit={onSubmit}
        onSaveAndSubmit={onSaveAndSubmit}
      />,
    )
    fillValidFood()

    fireEvent.click(screen.getByRole('button', { name: /^add$/i }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expectedFood))
    expect(onSaveAndSubmit).not.toHaveBeenCalled()
  })

  it('saves and logs through the explicit secondary action', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true)
    const onSaveAndSubmit = vi.fn().mockResolvedValue(true)
    render(
      <GenericFoodAdder
        saving={false}
        onSubmit={onSubmit}
        onSaveAndSubmit={onSaveAndSubmit}
      />,
    )
    fillValidFood()

    fireEvent.click(screen.getByRole('button', { name: /add & save portion/i }))

    await waitFor(() => expect(onSaveAndSubmit).toHaveBeenCalledWith(expectedFood))
    expect(onSubmit).not.toHaveBeenCalled()
    await waitFor(() => {
      expect((screen.getByLabelText('Food name') as HTMLInputElement).value).toBe('')
    })
  })

  it('keeps the draft populated when save-and-log does not fully succeed', async () => {
    const onSaveAndSubmit = vi.fn().mockResolvedValue(false)
    render(
      <GenericFoodAdder
        saving={false}
        onSubmit={vi.fn().mockResolvedValue(true)}
        onSaveAndSubmit={onSaveAndSubmit}
      />,
    )
    fillValidFood()

    fireEvent.click(screen.getByRole('button', { name: /add & save portion/i }))

    await waitFor(() => expect(onSaveAndSubmit).toHaveBeenCalledWith(expectedFood))
    expect((screen.getByLabelText('Food name') as HTMLInputElement).value).toBe('Greek Yogurt')
  })
})
