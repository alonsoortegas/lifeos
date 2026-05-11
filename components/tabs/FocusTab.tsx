'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Card from '@/components/ui/Card'
import { createClient } from '@/lib/supabase'
import type { Todo } from '@/lib/types'
import {
  formatGoalDateEyebrow,
  getCurrentGoalDate,
  getMillisecondsUntilNextGoalReset,
  getNextGoalDate,
} from '@/lib/goal-dates'

const ANCHORS = [
  'The body keeps the schedule. Show up before you feel ready.',
  'Discipline is the bridge between goals and accomplishment.',
  'Small actions, compounded daily, become identity.',
  'Consistency beats intensity. Do the boring thing again.',
  'The goal is not to feel motivated. The goal is to move.',
  'You don\'t rise to the occasion — you fall to your systems.',
  'Rest is part of training. Skipping it is not toughness.',
  'One hard thing per day keeps the softness away.',
  'Clarity comes from action, not from thinking about action.',
  'Build the day you want, or someone else will build it for you.',
  'Progress is not always visible. Trust the process anyway.',
  'The athlete and the builder share one thing: showing up.',
]

function getDailyAnchor(): string {
  const dateKey = getCurrentGoalDate()
  const daysEpoch = Math.floor(new Date(dateKey).getTime() / 86_400_000)
  return ANCHORS[((daysEpoch % ANCHORS.length) + ANCHORS.length) % ANCHORS.length]
}

export default function FocusTab() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [inputText, setInputText] = useState('')
  const [isPolishing, setIsPolishing] = useState(false)
  const [dbAvailable, setDbAvailable] = useState(true)
  const [tomorrowTodos, setTomorrowTodos] = useState<Todo[]>([])
  const [tomorrowInput, setTomorrowInput] = useState('')
  const didRollover = useRef(false)

  const loadTodos = useCallback(async () => {
    try {
      const supabase = createClient()
      const today = getCurrentGoalDate()
      const { data, error } = await supabase
        .from('todos')
        .select('*')
        .eq('day_date', today)
        .order('created_at', { ascending: true })
      if (error) {
        setDbAvailable(false)
        return
      }
      setTodos(data ?? [])
    } catch {
      setDbAvailable(false)
    }
  }, [])

  const loadTomorrowTodos = useCallback(async () => {
    try {
      const supabase = createClient()
      const tomorrow = getNextGoalDate()
      const { data } = await supabase
        .from('todos')
        .select('*')
        .eq('day_date', tomorrow)
        .order('created_at', { ascending: true })
      setTomorrowTodos(data ?? [])
    } catch {
      /* non-critical */
    }
  }, [])

  const rolloverStaleGoals = useCallback(async () => {
    if (!dbAvailable) return
    try {
      const supabase = createClient()
      const today = getCurrentGoalDate()
      const { data: stale } = await supabase
        .from('todos')
        .select('*')
        .lt('day_date', today)
        .eq('done', false)
      if (!stale || stale.length === 0) return

      // Reload today's list fresh so dedup is accurate
      const { data: todayRows } = await supabase
        .from('todos')
        .select('text')
        .eq('day_date', today)
      const todayTexts = new Set((todayRows ?? []).map((r: { text: string }) => r.text.toLowerCase().trim()))

      const toInsert = stale
        .filter((s: Todo) => !todayTexts.has(s.text.toLowerCase().trim()))
        .map((s: Todo) => ({ text: s.text, day_date: today }))

      if (toInsert.length > 0) {
        await supabase.from('todos').insert(toInsert)
      }
      await supabase.from('todos').delete().in('id', stale.map((s: Todo) => s.id))
      await loadTodos()
      window.dispatchEvent(new CustomEvent('goals-changed'))
    } catch {
      /* non-critical */
    }
  }, [dbAvailable, loadTodos])

  useEffect(() => {
    const init = async () => {
      await loadTodos()
      void loadTomorrowTodos()

      if (!didRollover.current) {
        didRollover.current = true
        await rolloverStaleGoals()
      }
    }

    const id = window.setTimeout(() => { void init() }, 0)
    let resetId: number

    const refreshAtReset = () => {
      void loadTodos()
      void loadTomorrowTodos()
      resetId = window.setTimeout(refreshAtReset, getMillisecondsUntilNextGoalReset() + 1000)
    }

    resetId = window.setTimeout(refreshAtReset, getMillisecondsUntilNextGoalReset() + 1000)

    return () => {
      window.clearTimeout(id)
      window.clearTimeout(resetId)
    }
  }, [loadTodos, loadTomorrowTodos, rolloverStaleGoals])

  const toggleTodo = async (todo: Todo) => {
    // Optimistic update
    setTodos((prev) =>
      prev.map((t) => (t.id === todo.id ? { ...t, done: !t.done } : t))
    )

    if (!dbAvailable) {
      window.dispatchEvent(new CustomEvent('goals-changed'))
      return
    }

    try {
      const supabase = createClient()
      await supabase
        .from('todos')
        .update({ done: !todo.done })
        .eq('id', todo.id)
      window.dispatchEvent(new CustomEvent('goals-changed'))
    } catch {
      // Revert on failure
      setTodos((prev) =>
        prev.map((t) => (t.id === todo.id ? { ...t, done: todo.done } : t))
      )
    }
  }

  const addTodo = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return

    const today = getCurrentGoalDate()
    const tempId = Date.now()
    const optimistic: Todo = {
      id: tempId,
      text: trimmed,
      done: false,
      created_at: new Date().toISOString(),
      day_date: today,
    }

    // Optimistic update
    setTodos((prev) => [...prev, optimistic])
    setInputText('')

    if (!dbAvailable) {
      window.dispatchEvent(new CustomEvent('goals-changed'))
      return
    }

    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('todos')
        .insert({ text: trimmed, day_date: today })
        .select()
        .single()
      if (!error && data) {
        setTodos((prev) =>
          prev.map((t) => (t.id === tempId ? (data as Todo) : t))
        )
      }
      window.dispatchEvent(new CustomEvent('goals-changed'))
    } catch {
      // keep optimistic
    }
  }

  const deleteTodo = async (id: number) => {
    setTodos((prev) => prev.filter((t) => t.id !== id))
    window.dispatchEvent(new CustomEvent('goals-changed'))

    if (!dbAvailable) return

    try {
      const supabase = createClient()
      await supabase.from('todos').delete().eq('id', id)
    } catch {
      // non-critical — optimistic delete stands
    }
  }

  const addTomorrowTodo = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return

    const tomorrow = getNextGoalDate()
    const tempId = Date.now()
    const optimistic: Todo = {
      id: tempId,
      text: trimmed,
      done: false,
      created_at: new Date().toISOString(),
      day_date: tomorrow,
    }

    setTomorrowTodos((prev) => [...prev, optimistic])
    setTomorrowInput('')

    if (!dbAvailable) return

    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('todos')
        .insert({ text: trimmed, day_date: tomorrow })
        .select()
        .single()
      if (!error && data) {
        setTomorrowTodos((prev) =>
          prev.map((t) => (t.id === tempId ? (data as Todo) : t))
        )
      }
    } catch {
      // keep optimistic
    }
  }

  const deleteTomorrowTodo = async (id: number) => {
    setTomorrowTodos((prev) => prev.filter((t) => t.id !== id))

    if (!dbAvailable) return

    try {
      const supabase = createClient()
      await supabase.from('todos').delete().eq('id', id)
    } catch {
      // non-critical
    }
  }

  const handlePushRemaining = useCallback(async () => {
    const unchecked = todos.filter(t => !t.done)
    if (unchecked.length === 0) return

    const tomorrow = getNextGoalDate()
    const tomorrowTexts = new Set(tomorrowTodos.map(t => t.text.toLowerCase().trim()))
    const toAdd = unchecked.filter(t => !tomorrowTexts.has(t.text.toLowerCase().trim()))

    // Optimistic UI
    setTodos(prev => prev.filter(t => t.done))
    const tempInserted: Todo[] = toAdd.map(t => ({
      ...t,
      id: Date.now() + Math.random(),
      day_date: tomorrow,
      done: false,
    }))
    setTomorrowTodos(prev => [...prev, ...tempInserted])

    if (!dbAvailable) {
      window.dispatchEvent(new CustomEvent('goals-changed'))
      return
    }

    try {
      const supabase = createClient()
      if (toAdd.length > 0) {
        await supabase.from('todos').insert(toAdd.map(t => ({ text: t.text, day_date: tomorrow })))
      }
      await supabase.from('todos').delete().in('id', unchecked.map(t => t.id))
      await Promise.all([loadTodos(), loadTomorrowTodos()])
      window.dispatchEvent(new CustomEvent('goals-changed'))
    } catch {
      // Reload to reconcile optimistic state
      await Promise.all([loadTodos(), loadTomorrowTodos()])
    }
  }, [todos, tomorrowTodos, dbAvailable, loadTodos, loadTomorrowTodos])

  const handleAdd = () => {
    addTodo(inputText)
  }

  const handleAddTomorrow = () => {
    addTomorrowTodo(tomorrowInput)
  }

  const handlePolishAndAdd = async () => {
    const trimmed = inputText.trim()
    if (!trimmed || isPolishing) return

    setIsPolishing(true)
    try {
      const res = await fetch('/api/polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed }),
      })
      if (res.ok) {
        const { polished } = await res.json()
        await addTodo(polished ?? trimmed)
      } else {
        await addTodo(trimmed)
      }
    } catch {
      await addTodo(trimmed)
    } finally {
      setIsPolishing(false)
    }
  }

  const done = todos.filter((t) => t.done).length
  const total = todos.length

  return (
    <div className="px-4 space-y-5">
      {/* Anchor section */}
      <div>
        <div
          className="text-[#555] text-[11px] tracking-widest uppercase mb-2"
          style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
        >
          · anchor ·
        </div>
        <Card className="p-4">
          <p className="text-[#888] text-sm leading-relaxed italic">
            &ldquo;{getDailyAnchor()}&rdquo;
          </p>
        </Card>
      </div>

      {/* Goals section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div
            className="text-[#555] text-[11px] tracking-widest uppercase"
            style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
          >
            · today&apos;s goals ·
          </div>
        </div>

        {/* Counter */}
        <div className="flex items-baseline gap-2 mb-2">
          <span
            className={`text-[38px] font-medium leading-none tracking-[-0.025em] tabular-nums ${done === total && total > 0 ? 'text-[#00d26a]' : 'text-[#ededed]'}`}
            style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
          >
            {done}
          </span>
          <span
            className="text-[16px] text-[#555]"
            style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
          >
            / {total}
          </span>
          <span
            className={`ml-auto text-[10px] font-semibold uppercase tracking-[0.1em] ${done === total && total > 0 ? 'text-[#00d26a]' : 'text-[#555]'}`}
            style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
          >
            {total === 0 ? 'no goals yet' : done === total ? 'all done' : 'complete'}
          </span>
        </div>

        {/* Segmented bar */}
        {total > 0 && (
          <div className="flex gap-1 mb-4">
            {Array.from({ length: total }).map((_, i) => (
              <div
                key={i}
                className="h-[6px] flex-1 rounded-full transition-all duration-300"
                style={{
                  background: i < done ? '#00d26a' : '#2a2a2a',
                  boxShadow: i < done ? '0 0 6px rgba(0,210,106,0.35)' : 'none',
                }}
              />
            ))}
          </div>
        )}

        <Card style={done === total && total > 0 ? { background: 'rgba(0,210,106,0.04)' } : {}}>
          {todos.length === 0 ? (
            <div className="p-4 text-[#555] text-sm text-center">
              No goals yet. Add one below.
            </div>
          ) : (
            <ul className="divide-y divide-[#2a2a2a]">
              {todos.map((todo) => (
                <li key={todo.id} className="group flex items-center">
                  <button
                    onClick={() => toggleTodo(todo)}
                    className="flex-1 flex items-center gap-3 px-4 py-3 text-left min-h-[44px]"
                  >
                    {/* Checkbox */}
                    <span
                      className={`flex-shrink-0 w-5 h-5 rounded border flex items-center justify-center ${
                        todo.done
                          ? 'bg-[#00d26a] border-[#00d26a]'
                          : 'bg-transparent border-[#3a3a3a]'
                      }`}
                    >
                      {todo.done && (
                        <svg width="11" height="8" viewBox="0 0 11 8" fill="none">
                          <path
                            d="M1 4L4 7L10 1"
                            stroke="#0e0e0e"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </span>
                    <span
                      className={`text-sm leading-snug ${
                        todo.done ? 'text-[#555] line-through' : 'text-[#ededed]'
                      }`}
                    >
                      {todo.text}
                    </span>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteTodo(todo.id) }}
                    className="opacity-0 group-hover:opacity-100 text-[#555] hover:text-[#ef4444] text-[14px] leading-none px-3 py-3 transition-opacity min-h-[44px] flex items-center"
                    aria-label="Delete goal"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Push remaining */}
      {todos.some(t => !t.done) && (
        <button
          onClick={handlePushRemaining}
          className="w-full border border-dashed border-[#3a3a3a] text-[#555] rounded-xl py-3 text-[11px] font-semibold uppercase tracking-[0.14em] min-h-[44px] active:border-[#555] active:text-[#888] transition-colors"
          style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
        >
          push remaining to tomorrow
        </button>
      )}

      {/* Input area */}
      <div className="space-y-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleAdd()
            }
          }}
          placeholder="add a goal..."
          className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#ededed] rounded-xl px-4 py-3 text-sm placeholder:text-[#555] focus:outline-none focus:border-[#3a3a3a] min-h-[44px]"
          disabled={isPolishing}
        />
        <div className="flex gap-2">
          <button
            onClick={handleAdd}
            disabled={!inputText.trim() || isPolishing}
            className="flex-1 bg-[#1a1a1a] border border-[#2a2a2a] text-[#ededed] rounded-xl py-3 text-sm font-medium min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed active:bg-[#2a2a2a] transition-colors"
          >
            + Add
          </button>
          <button
            onClick={handlePolishAndAdd}
            disabled={!inputText.trim() || isPolishing}
            className="flex-1 bg-[#00d26a] text-[#0e0e0e] rounded-xl py-3 text-sm font-bold min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed active:opacity-80 transition-opacity"
          >
            {isPolishing ? 'polishing...' : '✦ Polish & Add'}
          </button>
        </div>
      </div>

      {/* Plan Tomorrow section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div
            className="text-[#555] text-[11px] tracking-widest uppercase"
            style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
          >
            plan tomorrow — {formatGoalDateEyebrow(getNextGoalDate())}
          </div>
          <div
            className="text-[#555] text-[11px] tabular-nums"
            style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
          >
            {tomorrowTodos.length} planned
          </div>
        </div>
        <div className="text-[#555] text-[11px] mb-3">Write tonight, locked until 6 AM.</div>

        <Card>
          {tomorrowTodos.length === 0 ? (
            <div className="p-4 text-[#555] text-sm text-center">
              Nothing planned for tomorrow yet.
            </div>
          ) : (
            <ul className="divide-y divide-[#2a2a2a]">
              {tomorrowTodos.map((todo) => (
                <li key={todo.id} className="group">
                  <div className="w-full flex items-center gap-3 px-4 py-3 text-left min-h-[44px] opacity-55">
                    <span
                      className="flex-shrink-0 w-5 h-5 rounded border border-[#3a3a3a] bg-transparent flex items-center justify-center cursor-not-allowed"
                      title="Activates at 6 AM"
                    />
                    <span className="flex-1 text-sm text-[#ededed]">{todo.text}</span>
                    <button
                      onClick={() => deleteTomorrowTodo(todo.id)}
                      className="opacity-0 group-hover:opacity-100 text-[#555] hover:text-[#ef4444] text-[14px] leading-none px-1 transition-opacity"
                      aria-label="Delete"
                    >
                      ×
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-2 mt-3">
          <input
            type="text"
            value={tomorrowInput}
            onChange={(e) => setTomorrowInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleAddTomorrow()
              }
            }}
            placeholder="add to tomorrow..."
            className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#ededed] rounded-xl px-4 py-3 text-sm placeholder:text-[#555] focus:outline-none focus:border-[#3a3a3a] min-h-[44px]"
          />
          <button
            onClick={handleAddTomorrow}
            disabled={!tomorrowInput.trim()}
            className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#ededed] rounded-xl py-3 text-sm font-medium min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed active:bg-[#2a2a2a] transition-colors"
          >
            + Add to Tomorrow
          </button>
        </div>
      </div>

      {/* Reset note */}
      <div
        className="text-center pb-2"
        style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
      >
        <span className="text-[#555] text-[10px]">
          resets daily at 6 AM ·{' '}
        </span>
        <span className="text-[#3a3a3a] text-[10px]">
          war room, not mood board
        </span>
      </div>

      <div className="h-4" />
    </div>
  )
}
