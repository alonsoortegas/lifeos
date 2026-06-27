import { describe, it, expect } from 'vitest'
import {
  parseCsv,
  parseNumber,
  parseTradeRepublic,
  parseRevolut,
  parseCrypto,
} from '@/lib/finance/import'

describe('parseNumber', () => {
  it('parses Anglo formatting', () => {
    expect(parseNumber('1,234.56')).toBeCloseTo(1234.56)
  })
  it('parses European formatting', () => {
    expect(parseNumber('1.234,56')).toBeCloseTo(1234.56)
    expect(parseNumber('12,50 €')).toBeCloseTo(12.5)
  })
  it('returns null on garbage', () => {
    expect(parseNumber('')).toBeNull()
    expect(parseNumber('n/a')).toBeNull()
  })
})

describe('parseCsv', () => {
  it('detects semicolon delimiter and honors quotes', () => {
    const rows = parseCsv('A;B\n"hello;world";2')
    expect(rows).toEqual([{ a: 'hello;world', b: '2' }])
  })
})

describe('parseRevolut (Anglo, comma-delimited)', () => {
  const csv = [
    'Date,Ticker,Type,Quantity,Price per share,Total Amount,Currency',
    '2026-06-20,AAPL,BUY,5,180.50,902.50,USD',
    '2026-06-21,MSFT,SELL,2,410.00,820.00,USD',
  ].join('\n')

  it('parses rows with normalized types and numbers', () => {
    const { rows, errors } = parseRevolut(csv)
    expect(errors).toHaveLength(0)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      tradedAt: '2026-06-20', symbol: 'AAPL', type: 'buy',
      quantity: 5, price: 180.5, amount: 902.5, currency: 'USD', assetClass: 'stock',
    })
    expect(rows[1].type).toBe('sell')
  })

  it('produces stable, source-prefixed external ids for idempotency', () => {
    const a = parseRevolut(csv).rows[0].externalId
    const b = parseRevolut(csv).rows[0].externalId
    expect(a).toBe(b)
    expect(a.startsWith('csv_revolut:')).toBe(true)
  })
})

describe('parseTradeRepublic (European, semicolon-delimited)', () => {
  const csv = [
    'Datum;Wertpapier;ISIN;Art;Anzahl;Kurs;Gebühr;Betrag;Währung',
    '20.06.2026;Core MSCI World;IE00B4L5Y983;Kauf;1,5;95,20;1,00;142,80;EUR',
  ].join('\n')

  it('parses German headers, dates and decimals', () => {
    const { rows, errors } = parseTradeRepublic(csv)
    expect(errors).toHaveLength(0)
    expect(rows[0]).toMatchObject({
      tradedAt: '2026-06-20', type: 'buy', isin: 'IE00B4L5Y983',
      quantity: 1.5, price: 95.2, fee: 1, amount: 142.8, currency: 'EUR', assetClass: 'etf',
    })
  })
})

describe('parseCrypto', () => {
  const csv = [
    'Date,Symbol,Type,Quantity,Price',
    '2026-06-22,BTC,buy,0.05,58000',
  ].join('\n')

  it('defaults asset class to crypto', () => {
    const { rows } = parseCrypto(csv)
    expect(rows[0]).toMatchObject({ symbol: 'BTC', assetClass: 'crypto', quantity: 0.05, price: 58000 })
  })
})

describe('error handling', () => {
  it('reports skipped rows missing date or symbol', () => {
    const csv = 'Date,Ticker,Quantity\n,AAPL,5\n2026-06-20,,3'
    const { rows, errors } = parseRevolut(csv)
    expect(rows).toHaveLength(0)
    expect(errors).toHaveLength(2)
  })
})
