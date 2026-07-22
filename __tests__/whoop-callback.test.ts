import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '../app/api/whoop-callback/route'

describe('WHOOP callback', () => {
  it('shows the provider error description', async () => {
    const req = new NextRequest(
      'https://lifeos.example/api/whoop-callback?error=request_forbidden&error_description=Client%20is%20not%20approved',
    )

    const response = await GET(req)

    expect(response.status).toBe(400)
    await expect(response.text()).resolves.toContain('Client is not approved')
  })
})
