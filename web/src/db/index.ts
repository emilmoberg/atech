import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import * as schema from './schema.ts'
import { connectionUrl } from './url.ts'

const pool = new Pool({
  connectionString: connectionUrl(
    process.env.DATABASE_URL ?? process.env.POSTGRES_URL,
  ),
  max: 3,
})

export const db = drizzle(pool, { schema })
