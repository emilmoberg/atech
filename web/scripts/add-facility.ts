// Oppretter eller oppdaterer en fasilitet, kobler til enheter og gir adminer tilgang.
//   npm run facility:add -- --name "Bygg A" --device <enhets-id> --admin navn@eksempel.no
import { randomBytes } from 'node:crypto'
import { parseArgs } from 'node:util'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { and, eq, isNull } from 'drizzle-orm'

config({ path: ['.env.local', '.env'] })

const { values } = parseArgs({
  options: {
    name: { type: 'string' },
    device: { type: 'string', multiple: true, default: [] },
    admin: { type: 'string', multiple: true, default: [] },
  },
})
if (!values.name) throw new Error('--name mangler')
const name = values.name

// Importeres etter dotenv, fordi databasetilkoblingen leser miljøvariablene.
const { db } = await import('../src/db/index.ts')
const { clips, devices, facilities, facilityAdmins } = await import(
  '../src/db/schema.ts'
)

await db.insert(facilities).values({ name }).onConflictDoNothing()
const [facility] = await db
  .select()
  .from(facilities)
  .where(eq(facilities.name, name))
console.log(`Facility: ${facility.name} (${facility.id})`)

for (const id of values.device) {
  await db
    .insert(devices)
    .values({ id, facilityId: facility.id })
    .onConflictDoUpdate({
      target: devices.id,
      set: { facilityId: facility.id },
    })
  // Klipp mottatt før koblingen venter i «Uten sak» og kan prøves igjen derfra.
  const moved = await db
    .update(clips)
    .set({ facilityId: facility.id })
    .where(and(eq(clips.deviceId, id), isNull(clips.facilityId)))
    .returning({ id: clips.id })
  console.log(`Device: ${id} (${moved.length} waiting clips)`)
}

const auth = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false } },
).auth.admin

for (const email of values.admin) {
  const password = randomBytes(18).toString('base64url')
  const created = await auth.createUser({
    email,
    password,
    email_confirm: true,
  })
  let userId = created.data.user?.id
  if (userId) {
    console.log(`New admin: ${email}, temporary password: ${password}`)
  } else {
    const { data, error } = await auth.listUsers({ perPage: 1000 })
    if (error) throw error
    userId = data.users.find((user) => user.email === email)?.id
    if (!userId) throw created.error ?? new Error(`Fant ikke ${email}`)
    console.log(`Existing admin: ${email}`)
  }
  await db
    .insert(facilityAdmins)
    .values({ userId, facilityId: facility.id })
    .onConflictDoNothing()
}

process.exit(0)
