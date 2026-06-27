'use client'

import FinanceTab from '@/components/tabs/FinanceTab'

/** Desktop finances view — reuses the mobile tab inside a centered column so
 *  the portfolio, allocation and holdings read comfortably on a wide screen. */
export default function FinanceDesktop() {
  return (
    <div className="mx-auto w-full max-w-3xl px-2">
      <FinanceTab />
    </div>
  )
}
