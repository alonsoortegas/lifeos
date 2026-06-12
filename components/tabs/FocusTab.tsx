'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Card from '@/components/ui/Card'
import { getDailyAnchor } from '@/lib/focus-anchor'
import { createClient } from '@/lib/supabase'
import type { Todo } from '@/lib/types'
import {
  formatGoalDateEyebrow,
  getCurrentGoalDate,
  getMillisecondsUntilNextGoalReset,
  getNextGoalDate,
} from '@/lib/goal-dates'

export default function FocusTab() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [inputText, setInputText] = useState('')
  const [isPolishing, setIsPolishing] = useState(false)
  const [dbAvailable, setDbAvailable] = useState(true)
  const [tomorrowTodos, setTomorrowTodos] = useState<Todo[]>([])
  const [tomorrowInput, setTomorrowInput] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const didRollover = useRef(false)

  const loadTodos = useCallback(async () => {
    try {
      const supabase = createClient()
      const today = getCurrentGoalDate()
      const { data, error } = await supabase
        .from('todos')
        .select('*')
        .eq('day_date', today)
        .order('sort_order', { ascending: true })
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
        .order('sort_order', { ascending: true })
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

  const moveItem = async (
    id: number,
    list: Todo[],
    setter: React.Dispatch<React.SetStateAction<Todo[]>>,
    direction: 'up' | 'down',
  ) => {
    const idx = list.findIndex(t => t.id === id)
    if (idx < 0) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= list.length) return

    const a = list[idx]
    const b = list[swapIdx]
    const aOrder = a.sort_order
    const bOrder = b.sort_order

    setter(prev => prev.map(t => {
      if (t.id === a.id) return { ...t, sort_order: bOrder }
      if (t.id === b.id) return { ...t, sort_order: aOrder }
      return t
    }).sort((x, y) => x.sort_order - y.sort_order))

    if (!dbAvailable) return
    try {
      const supabase = createClient()
      await Promise.all([
        supabase.from('todos').update({ sort_order: bOrder }).eq('id', a.id),
        supabase.from('todos').update({ sort_order: aOrder }).eq('id', b.id),
      ])
    } catch { /* optimistic swap stands */ }
  }

  const addTodo = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return

    const today = getCurrentGoalDate()
    const nextOrder = todos.length > 0 ? Math.max(...todos.map(t => t.sort_order ?? 0)) + 1 : 1
    const tempId = Date.now()
    const optimistic: Todo = {
      id: tempId,
      text: trimmed,
      done: false,
      created_at: new Date().toISOString(),
      day_date: today,
      sort_order: nextOrder,
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
        .insert({ text: trimmed, day_date: today, sort_order: nextOrder })
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
    const nextOrder = tomorrowTodos.length > 0 ? Math.max(...tomorrowTodos.map(t => t.sort_order ?? 0)) + 1 : 1
    const tempId = Date.now()
    const optimistic: Todo = {
      id: tempId,
      text: trimmed,
      done: false,
      created_at: new Date().toISOString(),
      day_date: tomorrow,
      sort_order: nextOrder,
    }

    setTomorrowTodos((prev) => [...prev, optimistic])
    setTomorrowInput('')

    if (!dbAvailable) return

    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('todos')
        .insert({ text: trimmed, day_date: tomorrow, sort_order: nextOrder })
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

  const saveEdit = async (id: number, newText: string, isTomorrow = false) => {
    const trimmed = newText.trim()
    setEditingId(null)
    if (!trimmed) return

    const setter = isTomorrow ? setTomorrowTodos : setTodos
    setter(prev => prev.map(t => t.id === id ? { ...t, text: trimmed } : t))

    if (!dbAvailable) {
      if (!isTomorrow) window.dispatchEvent(new CustomEvent('goals-changed'))
      return
    }

    try {
      const supabase = createClient()
      await supabase.from('todos').update({ text: trimmed }).eq('id', id)
      if (!isTomorrow) window.dispatchEvent(new CustomEvent('goals-changed'))
    } catch {
      // optimistic edit stands
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
          className="text-[var(--text-faint)] text-[11px] tracking-widest uppercase mb-2"
          style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
        >
          · anchor ·
        </div>
        <Card className="p-4">
          <p className="text-[var(--text-dim)] text-sm leading-relaxed italic">
            &ldquo;{getDailyAnchor()}&rdquo;
          </p>
        </Card>
      </div>

      {/* Goals section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div
            className="text-[var(--text-faint)] text-[11px] tracking-widest uppercase"
            style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
          >
            · today&apos;s goals ·
          </div>
        </div>

        {/* Counter */}
        <div className="flex items-baseline gap-2 mb-2">
          <span
            className={`text-[38px] font-medium leading-none tracking-[-0.025em] tabular-nums ${done === total && total > 0 ? 'text-[#00d26a]' : 'text-[var(--text)]'}`}
            style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
          >
            {done}
          </span>
          <span
            className="text-[16px] text-[var(--text-faint)]"
            style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
          >
            / {total}
          </span>
          <span
            className={`ml-auto text-[10px] font-semibold uppercase tracking-[0.1em] ${done === total && total > 0 ? 'text-[#00d26a]' : 'text-[var(--text-faint)]'}`}
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
                  background: i < done ? '#00d26a' : 'var(--border)',
                  boxShadow: i < done ? '0 0 6px rgba(0,210,106,0.35)' : 'none',
                }}
              />
            ))}
          </div>
        )}

        <Card style={done === total && total > 0 ? { background: 'rgba(0,210,106,0.04)' } : {}}>
          {todos.length === 0 ? (
            <div className="p-4 text-[var(--text-faint)] text-sm text-center">
              No goals yet. Add one below.
            </div>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {todos.map((todo) => (
                <li key={todo.id} className="group flex items-center">
                  <button
                    onClick={() => toggleTodo(todo)}
                    className="flex-shrink-0 px-4 py-3 min-h-[44px] flex items-center"
                    aria-label={todo.done ? 'Mark incomplete' : 'Mark complete'}
                  >
                    <span
                      className={`w-5 h-5 rounded border flex items-center justify-center ${
                        todo.done ? 'bg-[#00d26a] border-[#00d26a]' : 'bg-transparent border-[var(--border-hi)]'
                      }`}
                    >
                      {todo.done && (
                        <svg width="11" height="8" viewBox="0 0 11 8" fill="none">
                          <path d="M1 4L4 7L10 1" stroke="#0b0f0d" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                  </button>
                  <div
                    className="flex-1 py-3 pr-1 min-h-[44px] flex items-center"
                    onClick={() => { if (!todo.done && editingId !== todo.id) { setEditingId(todo.id); setEditText(todo.text) } }}
                  >
                    {editingId === todo.id ? (
                      <input
                        autoFocus
                        value={editText}
                        onChange={e => setEditText(e.target.value)}
                        onBlur={() => saveEdit(todo.id, editText)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); saveEdit(todo.id, editText) }
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                        className="w-full bg-transparent text-sm text-[var(--text)] outline-none border-b border-[var(--border-hi)] pb-0.5"
                      />
                    ) : (
                      <span className={`text-sm leading-snug ${todo.done ? 'text-[var(--text-faint)] line-through cursor-default' : 'text-[var(--text)] cursor-text'}`}>
                        {todo.text}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => moveItem(todo.id, todos, setTodos, 'up')}
                      disabled={todos.indexOf(todo) === 0}
                      className="text-[var(--text-faint)] hover:text-[var(--text-dim)] text-[11px] px-1.5 py-3 min-h-[44px] flex items-center disabled:opacity-20"
                      aria-label="Move up"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => moveItem(todo.id, todos, setTodos, 'down')}
                      disabled={todos.indexOf(todo) === todos.length - 1}
                      className="text-[var(--text-faint)] hover:text-[var(--text-dim)] text-[11px] px-1.5 py-3 min-h-[44px] flex items-center disabled:opacity-20"
                      aria-label="Move down"
                    >
                      ↓
                    </button>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteTodo(todo.id) }}
                    className="opacity-0 group-hover:opacity-100 text-[var(--text-faint)] hover:text-[#ef4444] text-[14px] leading-none px-3 py-3 transition-opacity min-h-[44px] flex items-center"
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
          className="w-full border border-dashed border-[var(--border-hi)] text-[var(--text-faint)] rounded-xl py-3 text-[11px] font-semibold uppercase tracking-[0.14em] min-h-[44px] active:border-[var(--text-faint)] active:text-[var(--text-dim)] transition-colors"
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
          className="w-full bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] rounded-xl px-4 py-3 text-sm placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--border-hi)] min-h-[44px]"
          disabled={isPolishing}
        />
        <div className="flex gap-2">
          <button
            onClick={handleAdd}
            disabled={!inputText.trim() || isPolishing}
            className="flex-1 bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] rounded-xl py-3 text-sm font-medium min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed active:bg-[var(--border)] transition-colors"
          >
            + Add
          </button>
          <button
            onClick={handlePolishAndAdd}
            disabled={!inputText.trim() || isPolishing}
            className="flex-1 bg-[#00d26a] text-[var(--bg)] rounded-xl py-3 text-sm font-bold min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed active:opacity-80 transition-opacity"
          >
            {isPolishing ? 'polishing...' : '✦ Polish & Add'}
          </button>
        </div>
      </div>

      {/* Plan Tomorrow section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div
            className="text-[var(--text-faint)] text-[11px] tracking-widest uppercase"
            style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
          >
            plan tomorrow — {formatGoalDateEyebrow(getNextGoalDate())}
          </div>
          <div
            className="text-[var(--text-faint)] text-[11px] tabular-nums"
            style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
          >
            {tomorrowTodos.length} planned
          </div>
        </div>
        <div className="text-[var(--text-faint)] text-[11px] mb-3">Write tonight, locked until 6 AM.</div>

        <Card>
          {tomorrowTodos.length === 0 ? (
            <div className="p-4 text-[var(--text-faint)] text-sm text-center">
              Nothing planned for tomorrow yet.
            </div>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {tomorrowTodos.map((todo) => (
                <li key={todo.id} className="group flex items-center">
                  <span
                    className="flex-shrink-0 mx-4 w-5 h-5 rounded border border-[var(--border-hi)] bg-transparent opacity-55"
                    title="Activates at 6 AM"
                  />
                  <div
                    className="flex-1 py-3 pr-1 min-h-[44px] flex items-center"
                    onClick={() => { if (editingId !== todo.id) { setEditingId(todo.id); setEditText(todo.text) } }}
                  >
                    {editingId === todo.id ? (
                      <input
                        autoFocus
                        value={editText}
                        onChange={e => setEditText(e.target.value)}
                        onBlur={() => saveEdit(todo.id, editText, true)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); saveEdit(todo.id, editText, true) }
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                        className="w-full bg-transparent text-sm text-[var(--text)] outline-none border-b border-[var(--border-hi)] pb-0.5"
                      />
                    ) : (
                      <span className="text-sm text-[var(--text)] opacity-55 cursor-text">{todo.text}</span>
                    )}
                  </div>
                  <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => moveItem(todo.id, tomorrowTodos, setTomorrowTodos, 'up')}
                      disabled={tomorrowTodos.indexOf(todo) === 0}
                      className="text-[var(--text-faint)] hover:text-[var(--text-dim)] text-[11px] px-1.5 py-3 min-h-[44px] flex items-center disabled:opacity-20"
                      aria-label="Move up"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => moveItem(todo.id, tomorrowTodos, setTomorrowTodos, 'down')}
                      disabled={tomorrowTodos.indexOf(todo) === tomorrowTodos.length - 1}
                      className="text-[var(--text-faint)] hover:text-[var(--text-dim)] text-[11px] px-1.5 py-3 min-h-[44px] flex items-center disabled:opacity-20"
                      aria-label="Move down"
                    >
                      ↓
                    </button>
                  </div>
                  <button
                    onClick={() => deleteTomorrowTodo(todo.id)}
                    className="opacity-0 group-hover:opacity-100 text-[var(--text-faint)] hover:text-[#ef4444] text-[14px] leading-none px-3 py-3 transition-opacity min-h-[44px] flex items-center"
                    aria-label="Delete"
                  >
                    ×
                  </button>
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
            className="w-full bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] rounded-xl px-4 py-3 text-sm placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--border-hi)] min-h-[44px]"
          />
          <button
            onClick={handleAddTomorrow}
            disabled={!tomorrowInput.trim()}
            className="w-full bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] rounded-xl py-3 text-sm font-medium min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed active:bg-[var(--border)] transition-colors"
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
        <span className="text-[var(--text-faint)] text-[10px]">
          resets daily at 6 AM ·{' '}
        </span>
        <span className="text-[var(--border-hi)] text-[10px]">
          war room, not mood board
        </span>
      </div>

      <div className="h-4" />
    </div>
  )
}
