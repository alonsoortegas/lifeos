export function configuredWhoopRedirectUri(): string | null {
  const uri = process.env.NEXT_PUBLIC_WHOOP_REDIRECT_URI?.trim()
  return uri ? uri : null
}

export function whoopRedirectUri(origin: string): string {
  const configured = configuredWhoopRedirectUri()
  if (configured) return configured

  return `${origin.replace(/\/$/, '')}/api/whoop-callback`
}
