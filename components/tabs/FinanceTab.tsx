'use client'

import { useState } from 'react'
import Card from '@/components/ui/Card'
import StatCard from '@/components/ui/StatCard'
import Sparkline from '@/components/ui/Sparkline'
import PortfolioDonut from '@/components/finance/PortfolioDonut'
import PortfolioHistory from '@/components/finance/PortfolioHistory'
import { useFinance, type AddHoldingInput, type AddCashInput } from '@/lib/finance/useFinance'
import {
  ASSET_CLASS_META,
  cashSeries,
  formatMoney,
  formatMoneyCompact,
  formatSignedPct,
  parseNumber,
  plTone,
} from '@/lib/finance'
import type { AssetClass, FinCashKind, FinTransaction } from '@/lib/types'

const MONO = { fontFamily: 'var(--font-jetbrains-mono, monospace)' }

// Currencies offered for entering an amount; converted to base on save.
const COST_CURRENCIES = ['EUR', 'USD', 'MXN']

type AddMode = 'holding' | 'cash' | null

export default function FinanceTab() {
  const fin = useFinance()
  const { summary } = fin
  const [addMode, setAddMode] = useState<AddMode>(null)

  // Composition segments: one slice per holding, grouped by asset class so
  // same-coloured slices sit together; opacity steps keep them distinguishable.
  const CLASS_ORDER: AssetClass[] = ['etf', 'stock', 'crypto']
  const investSegments = CLASS_ORDER.flatMap((cls) =>
    summary.positions
      .filter((p) => p.position.instrument.asset_class === cls && p.marketValue > 0)
      .map((p, i) => ({
        label: p.position.instrument.symbol,
        value: p.marketValue,
        pct: summary.totalValue > 0 ? (p.marketValue / summary.totalValue) * 100 : 0,
        color: ASSET_CLASS_META[cls].color,
        opacity: Math.max(0.45, 1 - i * 0.18),
      })),
  )
  // Cash & fixed savings round out net worth in the same composition view.
  const cashSegments = summary.cash
    .filter((c) => c.value > 0)
    .map((c, i) => ({
      label: c.row.label || ASSET_CLASS_META[c.row.kind].label,
      value: c.value,
      pct: summary.totalValue > 0 ? (c.value / summary.totalValue) * 100 : 0,
      color: ASSET_CLASS_META[c.row.kind].color,
      opacity: Math.max(0.45, 1 - i * 0.18),
    }))
  const donutSegments = [...investSegments, ...cashSegments]

  return (
    <div className="px-4 space-y-5">
      <div className="flex items-start justify-between pt-2">
        <div>
          <h1 className="text-[22px] font-bold text-[var(--text)]">Finances</h1>
          <div className="mt-0.5 text-[11px] text-[var(--text-faint)]" style={MONO}>
            ETF · STOCKS · CRYPTO
          </div>
        </div>
        <button
          onClick={() => fin.refreshPrices()}
          disabled={fin.refreshing || fin.instruments.length === 0}
          className="glass rounded-full border border-[var(--border)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-[var(--text-dim)] transition-transform active:scale-[0.95] disabled:opacity-50"
          style={MONO}
        >
          {fin.refreshing ? 'syncing…' : 'sync prices'}
        </button>
      </div>

      {fin.error && (
        <p className="text-xs text-[#fb7185]" style={MONO}>{fin.error}</p>
      )}

      {/* Net worth + change */}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <StatCard
            label="Net worth"
            value={formatMoney(summary.totalValue)}
            accent
            color="#00d26a"
            delta={{
              value: `${summary.dayChange >= 0 ? '+' : ''}${formatMoney(summary.dayChange)}`,
              tone: plTone(summary.dayChange),
              label: `today ${formatSignedPct(summary.dayChangePct)}`,
            }}
          />
        </div>
        <StatCard
          label="Total P/L"
          value={formatMoney(summary.totalPL)}
          color={summary.totalPL >= 0 ? '#00d26a' : '#fb7185'}
          sub={formatSignedPct(summary.totalPLPct)}
        />
        <StatCard
          label="Invested"
          value={formatMoney(summary.totalCost)}
          color="#38bdf8"
          sub={`${summary.positions.length} positions`}
        />
      </div>

      {/* Composition — how net worth comes together */}
      {donutSegments.length > 0 && (
        <Card className="p-4">
          <div className="mb-3 text-[11px] uppercase tracking-[0.14em] text-[var(--text-dim)]">Composition</div>
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0">
              <PortfolioDonut segments={donutSegments} centerValue={formatMoneyCompact(summary.totalValue)} />
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              {donutSegments.slice(0, 7).map((s) => (
                <div key={s.label} className="flex items-center gap-2 text-[11px]" style={MONO}>
                  <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: s.color, opacity: s.opacity }} />
                  <span className="truncate text-[var(--text-dim)]">{s.label}</span>
                  <span className="ml-auto flex-shrink-0 text-[var(--text-faint)]">{s.pct.toFixed(0)}%</span>
                  <span className="flex-shrink-0 text-[var(--text)]">{formatMoney(s.value)}</span>
                </div>
              ))}
            </div>
          </div>
          {/* by asset class */}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-[var(--ink-06)] pt-3">
            {summary.byClass.map((c) => (
              <div key={c.assetClass} className="flex items-center gap-1.5 text-[11px]" style={MONO}>
                <span className="h-2 w-2 rounded-full" style={{ background: ASSET_CLASS_META[c.assetClass].color }} />
                <span className="text-[var(--text-dim)]">{ASSET_CLASS_META[c.assetClass].label}</span>
                <span className="text-[var(--text-faint)]">{c.pct.toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Net-worth history */}
      {fin.history.length >= 2 && (
        <Card className="p-4">
          <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-[var(--text-dim)]">History</div>
          <PortfolioHistory
            data={fin.history}
            color={fin.history[fin.history.length - 1].value >= fin.history[0].value ? '#00d26a' : '#fb7185'}
          />
        </Card>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={() => setAddMode((m) => (m === 'holding' ? null : 'holding'))}
          className="btn-accent flex-1 rounded-full px-3 py-2 text-[12px] font-bold uppercase tracking-widest"
          style={MONO}
        >
          add holding
        </button>
        <button
          onClick={() => setAddMode((m) => (m === 'cash' ? null : 'cash'))}
          className="glass flex-1 rounded-full border border-[var(--border)] px-3 py-2 text-[12px] font-bold uppercase tracking-widest text-[var(--text-dim)] transition-transform active:scale-[0.97]"
          style={MONO}
        >
          add cash
        </button>
      </div>

      {addMode === 'holding' && <AddHoldingForm onAdd={async (i) => { const ok = await fin.addHolding(i); if (ok) setAddMode(null) }} />}
      {addMode === 'cash' && <AddCashForm onAdd={async (i) => { const ok = await fin.addCash(i); if (ok) setAddMode(null) }} />}

      {/* Holdings */}
      {fin.loading ? (
        <div className="py-8 text-center text-sm text-[var(--text-faint)]" style={MONO}>loading portfolio…</div>
      ) : summary.positions.length === 0 ? (
        <Card className="p-6 text-center text-sm text-[var(--text-faint)]">
          No holdings yet. Add one manually or import a CSV.
        </Card>
      ) : (
        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-widest text-[var(--text-faint)]" style={MONO}>· holdings ·</div>
          {summary.positions.map((p) => {
            const meta = ASSET_CLASS_META[p.position.instrument.asset_class]
            const series = p.position.series.slice(-30)
            const hasTrend = series.length >= 2
            const trendPct = hasTrend && series[0] > 0
              ? ((series[series.length - 1] - series[0]) / series[0]) * 100
              : null
            const trendColor = (trendPct ?? 0) >= 0 ? '#00d26a' : '#fb7185'
            const platform = p.position.account?.name
            return (
              <Card key={p.position.holding.id} className="p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: meta.color }} />
                      <span className="truncate text-sm font-semibold text-[var(--text)]">{p.position.instrument.symbol}</span>
                      {platform && (
                        <span className="flex-shrink-0 rounded-full border border-[var(--border)] px-1.5 py-px text-[9px] uppercase tracking-wider text-[var(--text-faint)]" style={MONO}>
                          {platform}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-[var(--text-faint)]" style={MONO}>
                      {p.position.holding.quantity} @ {p.position.price != null ? formatMoney(p.position.price, p.position.instrument.currency) : '—'}
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="text-right">
                      <div className="text-sm font-semibold text-[var(--text)]" style={MONO}>{formatMoney(p.marketValue)}</div>
                      <div
                        className="mt-0.5 text-[11px]"
                        style={{ ...MONO, color: p.unrealizedPL >= 0 ? '#00d26a' : '#fb7185' }}
                      >
                        {p.unrealizedPL >= 0 ? '+' : ''}{formatMoney(p.unrealizedPL)} · {formatSignedPct(p.unrealizedPLPct)}
                      </div>
                    </div>
                    <button
                      onClick={() => fin.deleteHolding(p.position.holding.id)}
                      aria-label={`Remove ${p.position.instrument.symbol}`}
                      className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text-faint)] transition-transform active:scale-90"
                      style={MONO}
                    >
                      ×
                    </button>
                  </div>
                </div>
                {hasTrend && (
                  <div className="mt-2 flex items-center gap-3 border-t border-[var(--ink-06)] pt-2">
                    <Sparkline data={series} width={150} height={28} color={trendColor} />
                    {trendPct != null && (
                      <span className="text-[11px]" style={{ ...MONO, color: trendColor }}>
                        {formatSignedPct(trendPct)}
                        <span className="ml-1 text-[var(--text-faint)]">trend</span>
                      </span>
                    )}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* Cash & savings */}
      {summary.cash.length > 0 && (
        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-widest text-[var(--text-faint)]" style={MONO}>· cash &amp; savings ·</div>
          {summary.cash.map((c) => {
            const meta = ASSET_CLASS_META[c.row.kind]
            const platform = fin.accounts.find((a) => a.id === c.row.account_id)?.name
            const series = cashSeries(c)
            const aprPct = c.row.apy * 100
            return (
              <Card key={c.row.id} className="p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: meta.color }} />
                      <span className="truncate text-sm font-semibold text-[var(--text)]">{c.row.label || meta.label}</span>
                      {platform && (
                        <span className="flex-shrink-0 rounded-full border border-[var(--border)] px-1.5 py-px text-[9px] uppercase tracking-wider text-[var(--text-faint)]" style={MONO}>
                          {platform}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-[var(--text-faint)]" style={MONO}>
                      {c.row.kind === 'fixed' ? `${aprPct.toFixed(2)}% p.a.` : 'cash balance'}
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="text-right">
                      <div className="text-sm font-semibold text-[var(--text)]" style={MONO}>{formatMoney(c.value)}</div>
                      {c.row.kind === 'fixed' && (
                        <div className="mt-0.5 text-[11px]" style={{ ...MONO, color: '#00d26a' }}>
                          +{formatMoney(c.interest)} earned
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => fin.deleteCash(c.row.id)}
                      aria-label="Remove balance"
                      className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text-faint)] transition-transform active:scale-90"
                      style={MONO}
                    >
                      ×
                    </button>
                  </div>
                </div>
                {series.length >= 2 && (
                  <div className="mt-2 flex items-center gap-3 border-t border-[var(--ink-06)] pt-2">
                    <Sparkline data={series} width={150} height={28} color={meta.color} />
                    <span className="text-[11px]" style={{ ...MONO, color: meta.color }}>
                      {formatSignedPct(c.principal > 0 ? (c.interest / c.principal) * 100 : null)}
                      <span className="ml-1 text-[var(--text-faint)]">since start</span>
                    </span>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* Transactions */}
      {fin.transactions.length > 0 && (
        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-widest text-[var(--text-faint)]" style={MONO}>· transactions ·</div>
          {fin.transactions.slice(0, 30).map((t) => {
            const instrument = fin.instruments.find((i) => i.id === t.instrument_id)
            return (
              <div key={t.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-[13px] text-[var(--text)]">
                    <span className="uppercase" style={{ color: TXN_TONE[t.type] ?? 'var(--text-dim)' }}>{t.type}</span>
                    {' '}{instrument?.symbol ?? '—'}
                  </div>
                  <div className="mt-0.5 text-[11px] text-[var(--text-faint)]" style={MONO}>
                    {t.traded_at.slice(0, 10)}
                    {t.quantity != null && ` · ${t.quantity}`}
                    {t.price != null && ` @ ${formatMoney(t.price, t.currency)}`}
                  </div>
                </div>
                <button
                  onClick={() => fin.deleteTransaction(t)}
                  aria-label="Delete transaction"
                  className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text-faint)] transition-transform active:scale-90"
                  style={MONO}
                >
                  ×
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div className="h-4" />
    </div>
  )
}

const TXN_TONE: Partial<Record<FinTransaction['type'], string>> = {
  buy: '#00d26a',
  sell: '#fb7185',
  dividend: '#38bdf8',
}

// ── Add holding ───────────────────────────────────────────────────────────────

function AddHoldingForm({ onAdd }: { onAdd: (input: AddHoldingInput) => void }) {
  const [symbol, setSymbol] = useState('')
  const [assetClass, setAssetClass] = useState<AssetClass>('etf')
  const [quantity, setQuantity] = useState('')
  const [avgCost, setAvgCost] = useState('')
  const [costCurrency, setCostCurrency] = useState('EUR')
  const [account, setAccount] = useState('Trade Republic')

  // Comma- and point-tolerant parsing, so `0,5` and `0.5` both work.
  const qty = parseNumber(quantity)
  const cost = parseNumber(avgCost)
  const valid = symbol.trim().length > 0 && qty != null && qty > 0

  return (
    <Card className="space-y-3 p-4">
      <div className="grid grid-cols-2 gap-2">
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          placeholder="Symbol (e.g. VWCE)"
          className="rounded-xl border border-[var(--border)] bg-[var(--ink-04)] px-3 py-2 text-sm text-[var(--text)]"
        />
        <select
          value={assetClass}
          onChange={(e) => setAssetClass(e.target.value as AssetClass)}
          className="rounded-xl border border-[var(--border)] bg-[var(--ink-04)] px-3 py-2 text-sm text-[var(--text)]"
        >
          <option value="etf">ETF</option>
          <option value="stock">Stock</option>
          <option value="crypto">Crypto</option>
        </select>
        <input
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          inputMode="decimal" type="text" placeholder="Quantity"
          className="rounded-xl border border-[var(--border)] bg-[var(--ink-04)] px-3 py-2 text-sm text-[var(--text)]"
        />
        <div className="flex gap-2">
          <input
            value={avgCost}
            onChange={(e) => setAvgCost(e.target.value)}
            inputMode="decimal" type="text" placeholder="Avg cost"
            className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--ink-04)] px-3 py-2 text-sm text-[var(--text)]"
          />
          <select
            value={costCurrency}
            onChange={(e) => setCostCurrency(e.target.value)}
            aria-label="Cost currency"
            className="rounded-xl border border-[var(--border)] bg-[var(--ink-04)] px-2 py-2 text-sm text-[var(--text)]"
            style={MONO}
          >
            {COST_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
      {cost != null && costCurrency !== 'EUR' && (
        <p className="text-[11px] text-[var(--text-faint)]" style={MONO}>
          converted to EUR at today&apos;s rate on save
        </p>
      )}
      <input
        value={account}
        onChange={(e) => setAccount(e.target.value)}
        placeholder="Account"
        className="w-full rounded-xl border border-[var(--border)] bg-[var(--ink-04)] px-3 py-2 text-sm text-[var(--text)]"
      />
      <button
        onClick={() => valid && onAdd({
          accountName: account.trim() || 'Manual',
          accountKind: 'broker',
          symbol: symbol.trim(),
          assetClass,
          quantity: qty,
          avgCost: cost,
          costCurrency,
        })}
        disabled={!valid}
        className="btn-accent w-full rounded-full px-3 py-2 text-[12px] font-bold uppercase tracking-widest disabled:opacity-50"
        style={MONO}
      >
        save holding
      </button>
    </Card>
  )
}

// ── Add cash / fixed savings ───────────────────────────────────────────────────

function AddCashForm({ onAdd }: { onAdd: (input: AddCashInput) => void }) {
  const [account, setAccount] = useState('Revolut')
  const [kind, setKind] = useState<FinCashKind>('cash')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('EUR')
  const [apy, setApy] = useState('')
  const [startedAt, setStartedAt] = useState(() => new Date().toISOString().slice(0, 10))

  const amt = parseNumber(amount)
  const valid = account.trim().length > 0 && amt != null && amt > 0

  return (
    <Card className="space-y-3 p-4">
      <div className="grid grid-cols-2 gap-2">
        <input
          value={account}
          onChange={(e) => setAccount(e.target.value)}
          placeholder="Platform (e.g. Revolut)"
          className="rounded-xl border border-[var(--border)] bg-[var(--ink-04)] px-3 py-2 text-sm text-[var(--text)]"
        />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as FinCashKind)}
          className="rounded-xl border border-[var(--border)] bg-[var(--ink-04)] px-3 py-2 text-sm text-[var(--text)]"
        >
          <option value="cash">Cash</option>
          <option value="fixed">Fixed savings</option>
        </select>
        <div className="flex gap-2">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal" type="text" placeholder="Amount"
            className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--ink-04)] px-3 py-2 text-sm text-[var(--text)]"
          />
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            aria-label="Currency"
            className="rounded-xl border border-[var(--border)] bg-[var(--ink-04)] px-2 py-2 text-sm text-[var(--text)]"
            style={MONO}
          >
            {COST_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {kind === 'fixed' && (
          <div className="flex gap-2">
            <input
              value={apy}
              onChange={(e) => setApy(e.target.value)}
              inputMode="decimal" type="text" placeholder="Rate % p.a."
              className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--ink-04)] px-3 py-2 text-sm text-[var(--text)]"
            />
          </div>
        )}
      </div>
      {kind === 'fixed' && (
        <label className="flex items-center justify-between gap-2 text-[11px] text-[var(--text-dim)]" style={MONO}>
          <span>Earning since</span>
          <input
            value={startedAt}
            onChange={(e) => setStartedAt(e.target.value)}
            type="date"
            className="rounded-xl border border-[var(--border)] bg-[var(--ink-04)] px-3 py-1.5 text-sm text-[var(--text)]"
          />
        </label>
      )}
      {amt != null && currency !== 'EUR' && (
        <p className="text-[11px] text-[var(--text-faint)]" style={MONO}>
          converted to EUR at today&apos;s rate on save
        </p>
      )}
      <button
        onClick={() => valid && onAdd({
          accountName: account.trim() || 'Cash',
          kind,
          amount: amt,
          currency,
          apyPct: kind === 'fixed' ? (parseNumber(apy) ?? 0) : 0,
          startedAt: kind === 'fixed' ? startedAt : undefined,
        })}
        disabled={!valid}
        className="btn-accent w-full rounded-full px-3 py-2 text-[12px] font-bold uppercase tracking-widest disabled:opacity-50"
        style={MONO}
      >
        save {kind === 'fixed' ? 'savings' : 'cash'}
      </button>
    </Card>
  )
}
