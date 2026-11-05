import { createHash, timingSafeEqual } from 'node:crypto'
import { createServerClient } from '@supabase/ssr'
import { getCookies, setCookie } from '@tanstack/react-start/server'
import { and, asc, eq } from 'drizzle-orm'

import { db } from '#/db/index.ts'
import { facilities, facilityAdmins } from '#/db/schema.ts'

export function supabase() {
  return createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () =>
          Object.entries(getCookies()).map(([name, value]) => ({
            name,
            value,
          })),
        setAll: (cookies) => {
          for (const { name, value, options } of cookies) {
            setCookie(name, value, options)
          }
        },
      },
    },
  )
}

export async function currentUser() {
  const { data } = await supabase().auth.getUser()
  return data.user
}

export async function adminFacilities(userId: string) {
  return db
    .select({ id: facilities.id, name: facilities.name })
    .from(facilityAdmins)
    .innerJoin(facilities, eq(facilities.id, facilityAdmins.facilityId))
    .where(eq(facilityAdmins.userId, userId))
    .orderBy(asc(facilities.name))
}

export async function canAccessFacility(facilityId: string) {
  const user = await currentUser()
  if (!user) return false
  const [row] = await db
    .select({ userId: facilityAdmins.userId })
    .from(facilityAdmins)
    .where(
      and(
        eq(facilityAdmins.userId, user.id),
        eq(facilityAdmins.facilityId, facilityId),
      ),
    )
  return Boolean(row)
}

export async function requireFacility(facilityId: string) {
  if (!(await canAccessFacility(facilityId))) throw new Error('No access')
}

export function hasIngestToken(request: Request) {
  const token = process.env.INGEST_TOKEN
  if (!token) return false
  const hash = (value: string) => createHash('sha256').update(value).digest()
  return timingSafeEqual(
    hash(request.headers.get('authorization') ?? ''),
    hash(`Bearer ${token}`),
  )
}
