'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import {
  BASE_CURRENCY,
  buildPositions,
  fetchFxRate,
  portfolioHistory,
  rollupHoldings,
  summarizePortfolio,
  type PortfolioSummary,
} from '@/lib/finance'
import type {
  AssetClass,
  FinAccount,
  FinCash,
  FinCashKind,
  FinHolding,
  FinInstrument,
  FinPrice,
  FinTransaction,
} from '@/lib/types'
import type { ParsedTxn, ParseResult } from '@/lib/finance/import'

const supabase = createClient()

const SOURCE_ACCOUNT: Record<string, { name: string; kind: FinAccount['kind'] }> = {
  csv_tr: { name: 'Trade Republic', kind: 'broker' },
  csv_revolut: { name: 'Revolut', kind: 'broker' },
  csv_crypto: { name: 'Crypto Wallet', kind: 'wallet' },
  manual: { name: 'Manual', kind: 'manual' },
}

export interface AddHoldingInput {
  accountName: string
  accountKind: FinAccount['kind']
  symbol: string
  assetClass: AssetClass
  isin?: string | null
  name?: string | null
  quantity: number
  avgCost: number | null
  /** Currency the avgCost was entered in; converted to BASE_CURRENCY on save. */
  costCurrency?: string
}

export interface AddCashInput {
  accountName: string
  kind: FinCashKind
  label?: string | null
  amount: number
  /** Currency the amount was entered in; converted to BASE_CURRENCY on save. */
  currency?: string
  /** Annual rate as a percent (2 = 2% p.a.); only used for `fixed`. */
  apyPct?: number
  /** Accrual start (YYYY-MM-DD); defaults to today. */
  startedAt?: string
}

export interface UseFinance {
  loading: boolean
  refreshing: boolean
  error: string | null
  accounts: FinAccount[]
  instruments: FinInstrument[]
  transactions: FinTransaction[]
  summary: PortfolioSummary
  history: { date: string; value: number }[]
  refreshPrices: () => Promise<void>
  addHolding: (input: AddHoldingInput) => Promise<boolean>
  addCash: (input: AddCashInput) => Promise<boolean>
  importTransactions: (source: string, parsed: ParseResult) => Promise<{ inserted: number; skipped: number } | null>
  deleteHolding: (id: number) => Promise<void>
  deleteCash: (id: number) => Promise<void>
  deleteTransaction: (txn: FinTransaction) => Promise<void>
}

export function useFinance(): UseFinance {
  const [accounts, setAccounts] = useState<FinAccount[]>([])
  const [instruments, setInstruments] = useState<FinInstrument[]>([])
  const [holdings, setHoldings] = useState<FinHolding[]>([])
  const [prices, setPrices] = useState<FinPrice[]>([])
  const [transactions, setTransactions] = useState<FinTransaction[]>([])
  const [cash, setCash] = useState<FinCash[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const flashError = (msg: string) => {
    setError(msg)
    setTimeout(() => setError(null), 4000)
  }

  const load = useCallback(async () => {
    const [acc, inst, hold, price, txn, csh] = await Promise.all([
      supabase.from('fin_accounts').select('*').order('name'),
      supabase.from('fin_instruments').select('*').order('symbol'),
      supabase.from('fin_holdings').select('*'),
      // Enough history for value, day-change, and the net-worth trend.
      supabase.from('fin_prices').select('*').order('as_of', { ascending: false }).limit(1000),
      supabase.from('fin_transactions').select('*').order('traded_at', { ascending: false }).limit(200),
      supabase.from('fin_cash').select('*').order('updated_at', { ascending: false }),
    ])
    if (acc.error || inst.error || hold.error || price.error || txn.error || csh.error) {
      flashError('couldn\'t load finances')
    }
    setAccounts((acc.data ?? []) as FinAccount[])
    setInstruments((inst.data ?? []) as FinInstrument[])
    setHoldings((hold.data ?? []) as FinHolding[])
    setPrices((price.data ?? []) as FinPrice[])
    setTransactions((txn.data ?? []) as FinTransaction[])
    setCash((csh.data ?? []) as FinCash[])
    setLoading(false)
  }, [])

  // Defer the initial load a tick so the fetch's setState calls don't run
  // synchronously inside the effect body (matches DesktopShell's pattern).
  useEffect(() => {
    const id = setTimeout(() => { void load() }, 0)
    return () => clearTimeout(id)
  }, [load])

  // Realtime: reload when the cron writes prices or anything mutates elsewhere.
  useEffect(() => {
    const channel = supabase
      .channel('finance_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fin_prices' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fin_holdings' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fin_transactions' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fin_cash' }, () => void load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [load])

  const summary = useMemo(
    () => summarizePortfolio(buildPositions(holdings, instruments, prices, accounts), cash),
    [holdings, instruments, prices, accounts, cash],
  )

  const history = useMemo(
    () => portfolioHistory(holdings, instruments, prices),
    [holdings, instruments, prices],
  )

  const ensureAccount = useCallback(async (name: string, kind: FinAccount['kind']): Promise<FinAccount | null> => {
    const existing = accounts.find((a) => a.name === name)
    if (existing) return existing
    const { data, error: e } = await supabase
      .from('fin_accounts')
      .insert({ name, kind })
      .select('*')
      .single()
    if (e) { flashError('couldn\'t create account'); return null }
    return data as FinAccount
  }, [accounts])

  const ensureInstrument = useCallback(async (
    symbol: string, assetClass: AssetClass, isin?: string | null, name?: string | null,
  ): Promise<FinInstrument | null> => {
    const existing = instruments.find((i) => i.symbol === symbol && i.asset_class === assetClass)
    if (existing) return existing
    const { data, error: e } = await supabase
      .from('fin_instruments')
      .upsert({ symbol, asset_class: assetClass, isin: isin ?? null, name: name ?? null }, { onConflict: 'symbol,asset_class' })
      .select('*')
      .single()
    if (e) { flashError('couldn\'t create instrument'); return null }
    return data as FinInstrument
  }, [instruments])

  const refreshPrices = useCallback(async () => {
    if (instruments.length === 0) return
    setRefreshing(true)
    try {
      await fetch('/api/finance/prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruments: instruments.map((i) => ({ id: i.id, symbol: i.symbol, asset_class: i.asset_class })),
        }),
      })
      await load()
    } catch {
      flashError('price refresh failed')
    } finally {
      setRefreshing(false)
    }
  }, [instruments, load])

  const addHolding = useCallback(async (input: AddHoldingInput): Promise<boolean> => {
    const account = await ensureAccount(input.accountName, input.accountKind)
    if (!account) return false
    const instrument = await ensureInstrument(input.symbol.toUpperCase(), input.assetClass, input.isin, input.name)
    if (!instrument) return false

    // avg_cost is stored in the portfolio base currency; convert if entered in another.
    let avgCost = input.avgCost
    if (avgCost != null && input.costCurrency && input.costCurrency !== BASE_CURRENCY) {
      const rate = await fetchFxRate(input.costCurrency, BASE_CURRENCY)
      if (rate == null) { flashError(`couldn't convert ${input.costCurrency}→${BASE_CURRENCY}`); return false }
      avgCost = avgCost * rate
    }

    const { error: e } = await supabase
      .from('fin_holdings')
      .upsert(
        { account_id: account.id, instrument_id: instrument.id, quantity: input.quantity, avg_cost: avgCost, updated_at: new Date().toISOString() },
        { onConflict: 'account_id,instrument_id' },
      )
    if (e) { flashError('couldn\'t save holding'); return false }
    await load()
    return true
  }, [ensureAccount, ensureInstrument, load])

  const addCash = useCallback(async (input: AddCashInput): Promise<boolean> => {
    const account = await ensureAccount(input.accountName, 'bank')
    if (!account) return false

    // Stored in base currency; convert the entered amount if it isn't already.
    let amount = input.amount
    if (input.currency && input.currency !== BASE_CURRENCY) {
      const rate = await fetchFxRate(input.currency, BASE_CURRENCY)
      if (rate == null) { flashError(`couldn't convert ${input.currency}→${BASE_CURRENCY}`); return false }
      amount = amount * rate
    }

    const apy = input.kind === 'fixed' ? (input.apyPct ?? 0) / 100 : 0
    const { error: e } = await supabase.from('fin_cash').insert({
      account_id: account.id,
      kind: input.kind,
      label: input.label ?? null,
      amount,
      currency: BASE_CURRENCY,
      apy,
      started_at: input.startedAt ?? new Date().toISOString().slice(0, 10),
      updated_at: new Date().toISOString(),
    })
    if (e) { flashError('couldn\'t save cash'); return false }
    await load()
    return true
  }, [ensureAccount, load])

  const importTransactions = useCallback(async (
    source: string, parsed: ParseResult,
  ): Promise<{ inserted: number; skipped: number } | null> => {
    if (parsed.rows.length === 0) return { inserted: 0, skipped: 0 }
    const meta = SOURCE_ACCOUNT[source] ?? SOURCE_ACCOUNT.manual
    const account = await ensureAccount(meta.name, meta.kind)
    if (!account) return null

    // Resolve every distinct instrument first.
    const symbolKey = (t: ParsedTxn) => `${t.assetClass}:${t.symbol}`
    const instrumentMap = new Map<string, FinInstrument>()
    for (const t of parsed.rows) {
      const key = symbolKey(t)
      if (!instrumentMap.has(key)) {
        const inst = await ensureInstrument(t.symbol, t.assetClass, t.isin)
        if (inst) instrumentMap.set(key, inst)
      }
    }

    // Skip transactions already imported (idempotency by external_id).
    const externalIds = parsed.rows.map((t) => t.externalId)
    const { data: existing } = await supabase
      .from('fin_transactions')
      .select('external_id')
      .in('external_id', externalIds)
    const seen = new Set((existing ?? []).map((r) => (r as { external_id: string }).external_id))

    const batchId = `${source}-${Date.now()}`
    const toInsert = parsed.rows
      .filter((t) => !seen.has(t.externalId))
      .map((t) => {
        const inst = instrumentMap.get(symbolKey(t))
        return {
          account_id: account.id,
          instrument_id: inst?.id ?? null,
          type: t.type,
          quantity: t.quantity,
          price: t.price,
          fee: t.fee,
          amount: t.amount,
          currency: t.currency,
          traded_at: t.tradedAt,
          source,
          import_batch_id: batchId,
          external_id: t.externalId,
        }
      })

    if (toInsert.length > 0) {
      const { error: e } = await supabase.from('fin_transactions').insert(toInsert)
      if (e) { flashError('import failed'); return null }
    }

    // Recompute holdings for the affected instruments from the imported rows.
    const rollup = rollupHoldings(parsed.rows)
    const holdingRows = [...rollup.values()]
      .map((r) => {
        const inst = instrumentMap.get(`${r.assetClass}:${r.symbol}`)
        return inst && r.quantity > 0
          ? { account_id: account.id, instrument_id: inst.id, quantity: r.quantity, avg_cost: r.avgCost, updated_at: new Date().toISOString() }
          : null
      })
      .filter((r): r is NonNullable<typeof r> => r != null)
    if (holdingRows.length > 0) {
      await supabase.from('fin_holdings').upsert(holdingRows, { onConflict: 'account_id,instrument_id' })
    }

    await load()
    return { inserted: toInsert.length, skipped: parsed.rows.length - toInsert.length }
  }, [ensureAccount, ensureInstrument, load])

  const deleteHolding = useCallback(async (id: number) => {
    const { error: e } = await supabase.from('fin_holdings').delete().eq('id', id)
    if (e) { flashError('couldn\'t remove holding'); return }
    await load()
  }, [load])

  const deleteCash = useCallback(async (id: number) => {
    const { error: e } = await supabase.from('fin_cash').delete().eq('id', id)
    if (e) { flashError('couldn\'t remove'); return }
    await load()
  }, [load])

  /** Recompute a holding's quantity + avg_cost from the transactions that
   *  remain for its account/instrument (used after a transaction is deleted). */
  const recomputeHolding = useCallback(async (accountId: number, instrumentId: number) => {
    const { data } = await supabase
      .from('fin_transactions')
      .select('type,quantity,price')
      .eq('account_id', accountId)
      .eq('instrument_id', instrumentId)
    const rows = (data ?? []) as { type: string; quantity: number | null; price: number | null }[]
    let qtyBuy = 0, costBuy = 0, qtySell = 0
    for (const r of rows) {
      const q = r.quantity ?? 0
      if (q <= 0) continue
      if (r.type === 'buy') { qtyBuy += q; costBuy += q * (r.price ?? 0) }
      else if (r.type === 'sell') { qtySell += q }
    }
    const quantity = qtyBuy - qtySell
    if (quantity <= 0) {
      await supabase.from('fin_holdings').delete().eq('account_id', accountId).eq('instrument_id', instrumentId)
    } else {
      await supabase.from('fin_holdings').upsert(
        { account_id: accountId, instrument_id: instrumentId, quantity, avg_cost: qtyBuy > 0 ? costBuy / qtyBuy : null, updated_at: new Date().toISOString() },
        { onConflict: 'account_id,instrument_id' },
      )
    }
  }, [])

  const deleteTransaction = useCallback(async (txn: FinTransaction) => {
    const { error: e } = await supabase.from('fin_transactions').delete().eq('id', txn.id)
    if (e) { flashError('couldn\'t remove transaction'); return }
    if (txn.account_id != null && txn.instrument_id != null) {
      await recomputeHolding(txn.account_id, txn.instrument_id)
    }
    await load()
  }, [load, recomputeHolding])

  return {
    loading, refreshing, error, accounts, instruments, transactions, summary, history,
    refreshPrices, addHolding, addCash, importTransactions, deleteHolding, deleteCash, deleteTransaction,
  }
}
