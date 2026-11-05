import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

import { connectionUrl } from './src/db/url.ts'

config({ path: ['.env.local', '.env'] })

export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    // Migreringer kan ikke gå gjennom Supabase sin transaction pooler.
    url: connectionUrl(
      process.env.POSTGRES_URL_NON_POOLING ??
        process.env.DATABASE_URL ??
        process.env.POSTGRES_URL,
    ),
  },
})
