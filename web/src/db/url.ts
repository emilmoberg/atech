export function connectionUrl(raw: string | undefined) {
  if (!raw) throw new Error('DATABASE_URL mangler')
  // node-postgres tolker sslmode=require som full sertifikatsjekk, og det feiler mot
  // Supabase sitt egne CA. Tilkoblingen er fortsatt kryptert.
  return raw.replace('sslmode=require', 'sslmode=no-verify')
}
