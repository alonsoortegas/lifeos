'use client'

import { useRef, useState } from 'react'
import Card from '@/components/ui/Card'
import StatCard from '@/components/ui/StatCard'
import Sparkline from '@/components/ui/Sparkline'
import { useFinance, type AddHoldingInput } from '@/lib/finance/useFinance'
import {
  ASSET_CLASS_META,
  formatMoney,
  formatSignedPct,
  plTone,
} from '@/lib/finance'
import { parseImport } from '@/lib/finance/import'
import type { AssetClass, FinImportSource, FinTransaction } from '@/lib/types'

const MONO = { fontFamily: 'var(--font-jetbrains-mono, monospace)' }

const IMPORT_SOURCES: { value: FinImportSource; label: string }[] = [
  { value: 'csv_tr', label: 'Trade Republic' },
  { value: 'csv_revolut', label: 'Revolut' },
  { value: 'csv_crypto', label: 'Crypto' },
]

export default function FinanceTab() {
  const fin = useFinance()
  const { summary } = fin
  const [showAdd, setShowAdd] = useState(false)
  const [showImport, setShowImport] = useState(false)

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

      {/* Net-worth trend */}
      {fin.history.length >= 2 && (
        <Card className="flex items-center justify-between gap-3 p-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-dim)]">Trend</div>
            <div className="mt-1 text-[11px] text-[var(--text-faint)]" style={MONO}>
              {fin.history.length} days
            </div>
          </div>
          <Sparkline
            data={fin.history.map((h) => h.value)}
            width={180}
            height={44}
            color={summary.dayChange >= 0 ? '#00d26a' : '#fb7185'}
          />
        </Card>
      )}

      {/* Allocation */}
      {summary.byClass.length > 0 && (
        <Card className="p-4 space-y-3">
          <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-dim)]">Allocation</div>
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--ink-06)]">
            {summary.byClass.map((c) => (
              <div
                key={c.assetClass}
                style={{ width: `${c.pct}%`, background: ASSET_CLASS_META[c.assetClass].color }}
                title={`${ASSET_CLASS_META[c.assetClass].label} ${c.pct.toFixed(0)}%`}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
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

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={() => { setShowAdd((v) => !v); setShowImport(false) }}
          className="btn-accent flex-1 rounded-full px-3 py-2 text-[12px] font-bold uppercase tracking-widest"
          style={MONO}
        >
          add holding
        </button>
        <button
          onClick={() => { setShowImport((v) => !v); setShowAdd(false) }}
          className="glass flex-1 rounded-full border border-[var(--border)] px-3 py-2 text-[12px] font-bold uppercase tracking-widest text-[var(--text-dim)] transition-transform active:scale-[0.97]"
          style={MONO}
        >
          import csv
        </button>
      </div>

      {showAdd && <AddHoldingForm onAdd={async (i) => { const ok = await fin.addHolding(i); if (ok) setShowAdd(false) }} />}
      {showImport && <ImportPanel onImport={fin.importTransactions} />}

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
            return (
              <Card key={p.position.holding.id} className="flex items-center justify-between gap-3 p-3.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: meta.color }} />
                    <span className="truncate text-sm font-semibold text-[var(--text)]">{p.position.instrument.symbol}</span>
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-[var(--text-faint)]" style={MONO}>
                    {p.position.holding.quantity} @ {p.position.price != null ? formatMoney(p.position.price, p.position.instrument.currency) : '—'}
                  </div>
                </div>
                <div className="flex items-center gap-2">
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
  const [account, setAccount] = useState('Trade Republic')

  const qty = Number(quantity)
  const valid = symbol.trim().length > 0 && Number.isFinite(qty) && qty > 0

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
          inputMode="decimal" type="number" placeholder="Quantity"
          className="rounded-xl border border-[var(--border)] bg-[var(--ink-04)] px-3 py-2 text-sm text-[var(--text)]"
        />
        <input
          value={avgCost}
          onChange={(e) => setAvgCost(e.target.value)}
          inputMode="decimal" type="number" placeholder="Avg cost (optional)"
          className="rounded-xl border border-[var(--border)] bg-[var(--ink-04)] px-3 py-2 text-sm text-[var(--text)]"
        />
      </div>
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
          avgCost: avgCost ? Number(avgCost) : null,
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

// ── Import CSV ────────────────────────────────────────────────────────────────

function ImportPanel({
  onImport,
}: {
  onImport: (source: string, parsed: ReturnType<typeof parseImport>) => Promise<{ inserted: number; skipped: number } | null>
}) {
  const [source, setSource] = useState<FinImportSource>('csv_tr')
  const [status, setStatus] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const onFile = async (file: File) => {
    setStatus('parsing…')
    const text = await file.text()
    const parsed = parseImport(source, text)
    if (parsed.rows.length === 0) {
      setStatus(`No rows parsed. ${parsed.errors[0] ?? ''}`)
      return
    }
    setStatus(`importing ${parsed.rows.length} rows…`)
    const result = await onImport(source, parsed)
    if (!result) { setStatus('import failed'); return }
    setStatus(`imported ${result.inserted}, skipped ${result.skipped} duplicate${result.skipped === 1 ? '' : 's'}`)
  }

  return (
    <Card className="space-y-3 p-4">
      <select
        value={source}
        onChange={(e) => setSource(e.target.value as FinImportSource)}
        className="w-full rounded-xl border border-[var(--border)] bg-[var(--ink-04)] px-3 py-2 text-sm text-[var(--text)]"
      >
        {IMPORT_SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f) }}
        className="block w-full text-[12px] text-[var(--text-dim)] file:mr-3 file:rounded-full file:border file:border-[var(--border)] file:bg-[var(--ink-04)] file:px-3 file:py-1.5 file:text-[var(--text-dim)]"
        style={MONO}
      />
      {status && <p className="text-[11px] text-[var(--text-faint)]" style={MONO}>{status}</p>}
      <p className="text-[10px] text-[var(--text-faint)]" style={MONO}>
        Export a transactions CSV from the app and drop it here. Re-imports are de-duplicated.
      </p>
    </Card>
  )
}
