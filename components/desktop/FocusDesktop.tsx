'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { getDailyAnchor } from '@/lib/focus-anchor'
import { createClient } from '@/lib/supabase'
import type { Todo } from '@/lib/types'
import {
  formatGoalDateEyebrow,
  getCurrentGoalDate,
  getMillisecondsUntilNextGoalReset,
  getNextGoalDate,
} from '@/lib/goal-dates'

function Checkbox({ done }: { done: boolean }) {
  return (
    <span
      style={{
        width: 18, height: 18, borderRadius: 5, flexShrink: 0,
        border: `1px solid ${done ? '#00d26a' : 'var(--border-hi)'}`,
        background: done ? '#00d26a' : 'transparent',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {done && (
        <svg width="10" height="8" viewBox="0 0 11 8">
          <path d="M1 4L4 7L10 1" stroke="#0b0f0d" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      )}
    </span>
  )
}

export default function FocusDesktop() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [tomorrowTodos, setTomorrowTodos] = useState<Todo[]>([])
  const [inputText, setInputText] = useState('')
  const [tomorrowInput, setTomorrowInput] = useState('')
  const [isPolishing, setIsPolishing] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const [dbAvailable, setDbAvailable] = useState(true)
  const didRollover = useRef(false)

  const loadTodos = useCallback(async () => {
    try {
      const supabase = createClient()
      const today = getCurrentGoalDate()
      const { data, error } = await supabase
        .from('todos').select('*').eq('day_date', today)
        .order('sort_order', { ascending: true }).order('created_at', { ascending: true })
      if (error) { setDbAvailable(false); return }
      setTodos(data ?? [])
    } catch { setDbAvailable(false) }
  }, [])

  const loadTomorrowTodos = useCallback(async () => {
    try {
      const supabase = createClient()
      const tomorrow = getNextGoalDate()
      const { data } = await supabase
        .from('todos').select('*').eq('day_date', tomorrow)
        .order('sort_order', { ascending: true }).order('created_at', { ascending: true })
      setTomorrowTodos(data ?? [])
    } catch { /* non-critical */ }
  }, [])

  const rolloverStaleGoals = useCallback(async () => {
    if (!dbAvailable) return
    try {
      const supabase = createClient()
      const today = getCurrentGoalDate()
      const { data: stale } = await supabase.from('todos').select('*').lt('day_date', today).eq('done', false)
      if (!stale || stale.length === 0) return
      const { data: todayRows } = await supabase.from('todos').select('text').eq('day_date', today)
      const todayTexts = new Set((todayRows ?? []).map((r: { text: string }) => r.text.toLowerCase().trim()))
      const toInsert = stale.filter((s: Todo) => !todayTexts.has(s.text.toLowerCase().trim())).map((s: Todo) => ({ text: s.text, day_date: today }))
      if (toInsert.length > 0) await supabase.from('todos').insert(toInsert)
      await supabase.from('todos').delete().in('id', stale.map((s: Todo) => s.id))
      await loadTodos()
      window.dispatchEvent(new CustomEvent('goals-changed'))
    } catch { /* non-critical */ }
  }, [dbAvailable, loadTodos])

  useEffect(() => {
    const init = async () => {
      await loadTodos(); void loadTomorrowTodos()
      if (!didRollover.current) { didRollover.current = true; await rolloverStaleGoals() }
    }
    const id = window.setTimeout(() => { void init() }, 0)
    let resetId: number
    const refreshAtReset = () => {
      void loadTodos(); void loadTomorrowTodos()
      resetId = window.setTimeout(refreshAtReset, getMillisecondsUntilNextGoalReset() + 1000)
    }
    resetId = window.setTimeout(refreshAtReset, getMillisecondsUntilNextGoalReset() + 1000)
    return () => { window.clearTimeout(id); window.clearTimeout(resetId) }
  }, [loadTodos, loadTomorrowTodos, rolloverStaleGoals])

  const toggleTodo = async (todo: Todo) => {
    setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, done: !t.done } : t))
    if (!dbAvailable) { window.dispatchEvent(new CustomEvent('goals-changed')); return }
    try {
      const supabase = createClient()
      await supabase.from('todos').update({ done: !todo.done }).eq('id', todo.id)
      window.dispatchEvent(new CustomEvent('goals-changed'))
    } catch { setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, done: todo.done } : t)) }
  }

  const addTodo = async (text: string) => {
    const trimmed = text.trim(); if (!trimmed) return
    const today = getCurrentGoalDate()
    const nextOrder = todos.length > 0 ? Math.max(...todos.map(t => t.sort_order ?? 0)) + 1 : 1
    const tempId = Date.now()
    const optimistic: Todo = { id: tempId, text: trimmed, done: false, created_at: new Date().toISOString(), day_date: today, sort_order: nextOrder }
    setTodos(prev => [...prev, optimistic]); setInputText('')
    if (!dbAvailable) { window.dispatchEvent(new CustomEvent('goals-changed')); return }
    try {
      const supabase = createClient()
      const { data, error } = await supabase.from('todos').insert({ text: trimmed, day_date: today, sort_order: nextOrder }).select().single()
      if (!error && data) setTodos(prev => prev.map(t => t.id === tempId ? (data as Todo) : t))
      window.dispatchEvent(new CustomEvent('goals-changed'))
    } catch { /* keep optimistic */ }
  }

  const deleteTodo = async (id: number) => {
    setTodos(prev => prev.filter(t => t.id !== id))
    window.dispatchEvent(new CustomEvent('goals-changed'))
    if (!dbAvailable) return
    try { const supabase = createClient(); await supabase.from('todos').delete().eq('id', id) } catch { /* non-critical */ }
  }

  const addTomorrowTodo = async (text: string) => {
    const trimmed = text.trim(); if (!trimmed) return
    const tomorrow = getNextGoalDate()
    const nextOrder = tomorrowTodos.length > 0 ? Math.max(...tomorrowTodos.map(t => t.sort_order ?? 0)) + 1 : 1
    const tempId = Date.now()
    const optimistic: Todo = { id: tempId, text: trimmed, done: false, created_at: new Date().toISOString(), day_date: tomorrow, sort_order: nextOrder }
    setTomorrowTodos(prev => [...prev, optimistic]); setTomorrowInput('')
    if (!dbAvailable) return
    try {
      const supabase = createClient()
      const { data, error } = await supabase.from('todos').insert({ text: trimmed, day_date: tomorrow, sort_order: nextOrder }).select().single()
      if (!error && data) setTomorrowTodos(prev => prev.map(t => t.id === tempId ? (data as Todo) : t))
    } catch { /* keep optimistic */ }
  }

  const deleteTomorrowTodo = async (id: number) => {
    setTomorrowTodos(prev => prev.filter(t => t.id !== id))
    if (!dbAvailable) return
    try { const supabase = createClient(); await supabase.from('todos').delete().eq('id', id) } catch { /* non-critical */ }
  }

  const saveEdit = async (id: number, newText: string, isTomorrow = false) => {
    const trimmed = newText.trim(); setEditingId(null); if (!trimmed) return
    const setter = isTomorrow ? setTomorrowTodos : setTodos
    setter(prev => prev.map(t => t.id === id ? { ...t, text: trimmed } : t))
    if (!dbAvailable) { if (!isTomorrow) window.dispatchEvent(new CustomEvent('goals-changed')); return }
    try {
      const supabase = createClient()
      await supabase.from('todos').update({ text: trimmed }).eq('id', id)
      if (!isTomorrow) window.dispatchEvent(new CustomEvent('goals-changed'))
    } catch { /* optimistic edit stands */ }
  }

  const handlePushRemaining = useCallback(async () => {
    const unchecked = todos.filter(t => !t.done); if (unchecked.length === 0) return
    const tomorrow = getNextGoalDate()
    const tomorrowTexts = new Set(tomorrowTodos.map(t => t.text.toLowerCase().trim()))
    const toAdd = unchecked.filter(t => !tomorrowTexts.has(t.text.toLowerCase().trim()))
    setTodos(prev => prev.filter(t => t.done))
    const tempInserted: Todo[] = toAdd.map(t => ({ ...t, id: Date.now() + Math.random(), day_date: tomorrow, done: false }))
    setTomorrowTodos(prev => [...prev, ...tempInserted])
    if (!dbAvailable) { window.dispatchEvent(new CustomEvent('goals-changed')); return }
    try {
      const supabase = createClient()
      if (toAdd.length > 0) await supabase.from('todos').insert(toAdd.map(t => ({ text: t.text, day_date: tomorrow })))
      await supabase.from('todos').delete().in('id', unchecked.map(t => t.id))
      await Promise.all([loadTodos(), loadTomorrowTodos()])
      window.dispatchEvent(new CustomEvent('goals-changed'))
    } catch { await Promise.all([loadTodos(), loadTomorrowTodos()]) }
  }, [todos, tomorrowTodos, dbAvailable, loadTodos, loadTomorrowTodos])

  const handlePolishAndAdd = async () => {
    const trimmed = inputText.trim(); if (!trimmed || isPolishing) return
    setIsPolishing(true)
    try {
      const res = await fetch('/api/polish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: trimmed }) })
      if (res.ok) { const { polished } = await res.json(); await addTodo(polished ?? trimmed) } else await addTodo(trimmed)
    } catch { await addTodo(trimmed) } finally { setIsPolishing(false) }
  }

  const done = todos.filter(t => t.done).length
  const total = todos.length
  const uncheckedCount = todos.filter(t => !t.done).length

  const anchor = getDailyAnchor()
  const tomorrowLabel = formatGoalDateEyebrow(getNextGoalDate())

  const mono = 'var(--font-jetbrains-mono, monospace)'
  const sans = 'var(--font-inter-tight, sans-serif)'

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '20px 28px 24px', gap: 16, overflow: 'hidden', fontFamily: sans }}>

      {/* Anchor strip */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '10px 14px',
        background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10,
        flexShrink: 0,
      }}>
        <span style={{ fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', color: 'var(--text-faint)', textTransform: 'uppercase', flexShrink: 0 }}>
          · ANCHOR ·
        </span>
        <p style={{ margin: 0, color: 'var(--text-dim)', fontStyle: 'italic', fontSize: 13, lineHeight: 1.4, flex: 1 }}>
          &ldquo;{anchor}&rdquo;
        </p>
        <span style={{ fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--text-faint)', textTransform: 'uppercase', flexShrink: 0 }}>
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase()}
        </span>
      </div>

      {/* Two-column body */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 18, minHeight: 0 }}>

        {/* LEFT — Today */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, borderBottom: '1px solid var(--border)', paddingBottom: 6, flexShrink: 0 }}>
            <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', color: 'var(--text-dim)' }}>TODAY</span>
            <span style={{ flex: 1 }} />
            <span style={{ fontFamily: mono, fontSize: 10, color: done === total && total > 0 ? '#00d26a' : 'var(--text-dim)' }}>{done}/{total}</span>
            <span style={{ fontFamily: mono, fontSize: 10, color: 'var(--text-faint)' }}>· {done === total && total > 0 ? 'all done' : 'in progress'}</span>
          </div>

          {/* Counter + segmented bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontFamily: mono, fontSize: 44, fontWeight: 500, letterSpacing: '-0.03em', color: done === total && total > 0 ? '#00d26a' : 'var(--text)', lineHeight: 1 }}>
                {done}
              </span>
              <span style={{ fontFamily: mono, fontSize: 18, color: 'var(--text-faint)' }}>/ {total}</span>
            </div>
            {total > 0 && (
              <div style={{ flex: 1, display: 'flex', gap: 4 }}>
                {Array.from({ length: total }).map((_, i) => (
                  <div key={i} style={{
                    flex: 1, height: 6, borderRadius: 3,
                    background: i < done ? '#00d26a' : 'var(--border)',
                    boxShadow: i < done ? '0 0 6px rgba(0,210,106,0.35)' : 'none',
                  }} />
                ))}
              </div>
            )}
          </div>

          {/* List */}
          <div style={{ flex: 1, overflow: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, minHeight: 0 }}>
            {todos.length === 0 ? (
              <div style={{ padding: 24, color: 'var(--text-faint)', fontSize: 13, textAlign: 'center' }}>No goals yet. Add one below.</div>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {todos.map((todo, i) => (
                  <li
                    key={todo.id}
                    style={{
                      display: 'flex', alignItems: 'center', padding: '11px 14px',
                      borderBottom: i < todos.length - 1 ? '1px solid var(--border)' : 'none',
                      gap: 10,
                    }}
                  >
                    <button onClick={() => toggleTodo(todo)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0 }}>
                      <Checkbox done={todo.done} />
                    </button>
                    <div style={{ flex: 1, cursor: 'text' }} onClick={() => { if (!todo.done && editingId !== todo.id) { setEditingId(todo.id); setEditText(todo.text) } }}>
                      {editingId === todo.id ? (
                        <input
                          autoFocus value={editText}
                          onChange={e => setEditText(e.target.value)}
                          onBlur={() => saveEdit(todo.id, editText)}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveEdit(todo.id, editText) } if (e.key === 'Escape') setEditingId(null) }}
                          style={{ width: '100%', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-hi)', color: 'var(--text)', fontSize: 13, outline: 'none', padding: '0 0 2px', fontFamily: sans }}
                        />
                      ) : (
                        <span style={{ fontSize: 13.5, color: todo.done ? 'var(--text-faint)' : 'var(--text)', textDecoration: todo.done ? 'line-through' : 'none', lineHeight: 1.3 }}>
                          {todo.text}
                        </span>
                      )}
                    </div>
                    <button onClick={() => deleteTodo(todo.id)} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', fontSize: 16, cursor: 'pointer', padding: '0 4px', lineHeight: 1, flexShrink: 0, opacity: 0.6 }}>×</button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Input */}
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <input
              value={inputText} onChange={e => setInputText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void addTodo(inputText) } }}
              placeholder="add a goal…"
              disabled={isPolishing}
              style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: sans, fontSize: 13, padding: '9px 14px', borderRadius: 10, outline: 'none' }}
            />
            <button
              onClick={() => addTodo(inputText)} disabled={!inputText.trim() || isPolishing}
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '9px 18px', fontSize: 13, fontFamily: sans, borderRadius: 10, cursor: 'pointer', opacity: !inputText.trim() ? 0.4 : 1 }}
            >
              + Add
            </button>
            <button
              onClick={handlePolishAndAdd} disabled={!inputText.trim() || isPolishing}
              style={{ background: '#00d26a', border: 'none', color: 'var(--bg)', padding: '9px 18px', fontSize: 13, fontFamily: sans, fontWeight: 700, borderRadius: 10, cursor: 'pointer', opacity: !inputText.trim() || isPolishing ? 0.4 : 1 }}
            >
              {isPolishing ? 'polishing…' : '✦ Polish & Add'}
            </button>
          </div>

          {uncheckedCount > 0 && (
            <button
              onClick={handlePushRemaining}
              style={{ flexShrink: 0, border: '1px solid var(--border)', background: 'var(--ink-04)', color: 'var(--text-faint)', padding: '9px 0', fontSize: 11, fontFamily: mono, letterSpacing: '0.18em', textTransform: 'uppercase', borderRadius: 10, cursor: 'pointer' }}
            >
              push {uncheckedCount} remaining → tomorrow
            </button>
          )}
        </div>

        {/* RIGHT — Tomorrow */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, borderBottom: '1px solid var(--border)', paddingBottom: 6, flexShrink: 0 }}>
            <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', color: 'var(--text-dim)' }}>TOMORROW</span>
            <span style={{ flex: 1 }} />
            <span style={{ fontFamily: mono, fontSize: 10, color: 'var(--text-faint)' }}>{tomorrowTodos.length} planned</span>
            <span style={{ fontFamily: mono, fontSize: 10, color: 'var(--text-faint)' }}>· {tomorrowLabel}</span>
          </div>

          {/* List */}
          <div style={{ flex: 1, overflow: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, minHeight: 0, opacity: 0.85 }}>
            {tomorrowTodos.length === 0 ? (
              <div style={{ padding: 24, color: 'var(--text-faint)', fontSize: 13, textAlign: 'center' }}>Nothing planned yet.</div>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {tomorrowTodos.map((todo, i) => (
                  <li key={todo.id} style={{ display: 'flex', alignItems: 'center', padding: '11px 14px', borderBottom: i < tomorrowTodos.length - 1 ? '1px solid var(--border)' : 'none', gap: 10 }}>
                    <span style={{ width: 18, height: 18, borderRadius: 6, border: '1px solid var(--border-hi)', background: 'var(--ink-02)', flexShrink: 0 }} />
                    <div style={{ flex: 1, cursor: 'text' }} onClick={() => { if (editingId !== todo.id) { setEditingId(todo.id); setEditText(todo.text) } }}>
                      {editingId === todo.id ? (
                        <input
                          autoFocus value={editText}
                          onChange={e => setEditText(e.target.value)}
                          onBlur={() => saveEdit(todo.id, editText, true)}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveEdit(todo.id, editText, true) } if (e.key === 'Escape') setEditingId(null) }}
                          style={{ width: '100%', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-hi)', color: 'var(--text)', fontSize: 13, outline: 'none', padding: '0 0 2px', fontFamily: sans }}
                        />
                      ) : (
                        <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>{todo.text}</span>
                      )}
                    </div>
                    <button onClick={() => deleteTomorrowTodo(todo.id)} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', fontSize: 16, cursor: 'pointer', padding: '0 4px', lineHeight: 1, flexShrink: 0, opacity: 0.6 }}>×</button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Tomorrow input */}
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <input
              value={tomorrowInput} onChange={e => setTomorrowInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void addTomorrowTodo(tomorrowInput) } }}
              placeholder="add to tomorrow…"
              style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: sans, fontSize: 13, padding: '9px 14px', borderRadius: 10, outline: 'none' }}
            />
            <button
              onClick={() => addTomorrowTodo(tomorrowInput)} disabled={!tomorrowInput.trim()}
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '9px 18px', fontSize: 13, fontFamily: sans, borderRadius: 10, cursor: 'pointer', opacity: !tomorrowInput.trim() ? 0.4 : 1 }}
            >
              + Add
            </button>
          </div>

          <div style={{ textAlign: 'center', fontFamily: mono, fontSize: 10, color: 'var(--border-hi)', padding: '2px 0', flexShrink: 0 }}>
            resets daily at 6 AM · war room, not mood board
          </div>
        </div>
      </div>
    </div>
  )
}
