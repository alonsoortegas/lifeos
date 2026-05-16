// No-op stub for `server-only` used in Vitest. The package uses Next.js
// bundler export conditions to enforce server-only imports at build time;
// those conditions don't apply in the Node.js test runtime so we stub it out.
export {}
