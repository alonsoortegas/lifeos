'use client'

import { useState, useEffect, useCallback } from 'react'
import Card from '@/components/ui/Card'
import { createClient } from '@/lib/supabase'
import type { Todo } from '@/lib/types'

function getTodayDate() {
  return new Date().toISOString().split('T')[0]
}

export default function FocusTab() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [inputText, setInputText] = useState('')
  const [isPolishing, setIsPolishing] = useState(false)
  const [dbAvailable, setDbAvailable] = useState(true)

  const loadTodos = useCallback(async () => {
    try {
      const supabase = createClient()
      const today = getTodayDate()
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

  useEffect(() => {
    loadTodos()
  }, [loadTodos])

  const toggleTodo = async (todo: Todo) => {
    // Optimistic update
    setTodos((prev) =>
      prev.map((t) => (t.id === todo.id ? { ...t, done: !t.done } : t))
    )

    if (!dbAvailable) return

    try {
      const supabase = createClient()
      await supabase
        .from('todos')
        .update({ done: !todo.done })
        .eq('id', todo.id)
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

    const today = getTodayDate()
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

    if (!dbAvailable) return

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
    } catch {
      // keep optimistic
    }
  }

  const handleAdd = () => {
    addTodo(inputText)
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
            &ldquo;The body keeps the schedule. Show up before you feel ready.&rdquo;
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
          <div
            className="text-[#888] text-[11px]"
            style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
          >
            {done}/{total} done
          </div>
        </div>

        <Card>
          {todos.length === 0 ? (
            <div className="p-4 text-[#555] text-sm text-center">
              No goals yet. Add one below.
            </div>
          ) : (
            <ul className="divide-y divide-[#2a2a2a]">
              {todos.map((todo) => (
                <li key={todo.id}>
                  <button
                    onClick={() => toggleTodo(todo)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left min-h-[44px]"
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
                        <svg
                          width="11"
                          height="8"
                          viewBox="0 0 11 8"
                          fill="none"
                        >
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
                        todo.done
                          ? 'text-[#555] line-through'
                          : 'text-[#ededed]'
                      }`}
                    >
                      {todo.text}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

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
