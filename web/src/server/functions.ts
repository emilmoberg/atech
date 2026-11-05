import { createServerFn } from '@tanstack/react-start'
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  ne,
  or,
  sql,
} from 'drizzle-orm'

import { db } from '#/db/index.ts'
import { cases, clips } from '#/db/schema.ts'
import {
  CATEGORIES,
  OPEN_STATUSES,
  PRIORITIES,
  STATUSES,
} from '#/lib/taxonomy.ts'
import type { Sentiment } from '#/lib/taxonomy.ts'
import type { Category, CaseStatus, Priority } from '#/lib/taxonomy.ts'
import {
  adminFacilities,
  currentUser,
  requireFacility,
  supabase,
} from './auth.server.ts'
import { processClip } from './process.server.ts'

export type CaseFilters = {
  q?: string
  category?: Category
  // Uten verdi vises alle åpne saker.
  status?: CaseStatus | 'all'
  priority?: Priority
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

const sentimentCount = (value: Sentiment) =>
  sql<number>`count(*) filter (where ${clips.sentiment} = ${value})`.mapWith(Number)

const clipFields = {
  id: clips.id,
  sampleRate: clips.sampleRate,
  samples: clips.samples,
  missingChunks: clips.missingChunks,
  status: clips.status,
  transcript: clips.transcript,
  summary: clips.summary,
  sentiment: clips.sentiment,
  error: clips.error,
  createdAt: clips.createdAt,
}

export const getSession = createServerFn().handler(async () => {
  const user = await currentUser()
  if (!user) return null
  return { email: user.email, facilities: await adminFacilities(user.id) }
})

export const login = createServerFn({ method: 'POST' })
  .validator((data: { email: string; password: string }) => ({
    email: String(data.email),
    password: String(data.password),
  }))
  .handler(async ({ data }) => {
    const { error } = await supabase().auth.signInWithPassword(data)
    return { ok: !error }
  })

export const logout = createServerFn({ method: 'POST' }).handler(async () => {
  await supabase().auth.signOut()
})

function searchCondition(q: string) {
  const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`
  // Fulltekst finner bøyninger («dusjene»), ILIKE finner deler av ord («dusj» i «dusjrom»).
  return or(
    ilike(cases.title, pattern),
    sql`exists (
      select 1 from ${clips}
      where ${clips.caseId} = ${cases.id}
        and (
          ${clips.transcript} ilike ${pattern}
          or ${clips.summary} ilike ${pattern}
          or to_tsvector('english', coalesce(${clips.transcript}, '') || ' ' || coalesce(${clips.summary}, ''))
            @@ websearch_to_tsquery('english', ${q})
        )
    )`,
    sql`to_tsvector('english', ${cases.title}) @@ websearch_to_tsquery('english', ${q})`,
  )
}

export const getOverview = createServerFn()
  .validator((data: { facilityId: string; filters: CaseFilters }) => data)
  .handler(async ({ data: { facilityId, filters } }) => {
    await requireFacility(facilityId)
    const inFacility = eq(cases.facilityId, facilityId)
    const isOpen = inArray(cases.status, [...OPEN_STATUSES])
    const q = filters.q?.trim()

    const statusCondition =
      filters.status === 'all'
        ? undefined
        : filters.status
          ? eq(cases.status, filters.status)
          : isOpen
    const searchFilter = q ? searchCondition(q) : undefined

    const feedbackCount = count(clips.id)
    const [caseRows, categoryRows, [stats], [recent], withoutCase] =
      await Promise.all([
        db
          .select({
            id: cases.id,
            title: cases.title,
            category: cases.category,
            priority: cases.priority,
            status: cases.status,
            lastFeedbackAt: cases.lastFeedbackAt,
            feedbackCount,
            positive: sentimentCount('positive'),
            neutral: sentimentCount('neutral'),
            negative: sentimentCount('negative'),
          })
          .from(cases)
          .leftJoin(clips, eq(clips.caseId, cases.id))
          .where(
            and(
              inFacility,
              statusCondition,
              searchFilter,
              filters.category
                ? eq(cases.category, filters.category)
                : undefined,
              filters.priority
                ? eq(cases.priority, filters.priority)
                : undefined,
            ),
          )
          .groupBy(cases.id)
          .orderBy(
            asc(cases.priority),
            desc(feedbackCount),
            desc(cases.lastFeedbackAt),
          )
          .limit(200),
        // Kategoritallene følger søk og status, men ikke valgt kategori.
        db
          .select({ category: cases.category, cases: count() })
          .from(cases)
          .where(and(inFacility, statusCondition, searchFilter))
          .groupBy(cases.category)
          .orderBy(desc(count())),
        db
          .select({
            open: sql<number>`count(*) filter (where ${isOpen})`.mapWith(Number),
            urgent:
              sql<number>`count(*) filter (where ${isOpen} and ${cases.priority} in ('critical', 'high'))`.mapWith(
                Number,
              ),
            unhandled:
              sql<number>`count(*) filter (where ${cases.status} = 'new')`.mapWith(
                Number,
              ),
          })
          .from(cases)
          .where(inFacility),
        db
          .select({
            feedback: count(),
            positive: sentimentCount('positive'),
            neutral: sentimentCount('neutral'),
            negative: sentimentCount('negative'),
          })
          .from(clips)
          .where(
            and(
              eq(clips.facilityId, facilityId),
              gte(clips.createdAt, new Date(Date.now() - WEEK_MS)),
            ),
          ),
        db
          .select(clipFields)
          .from(clips)
          .where(and(eq(clips.facilityId, facilityId), isNull(clips.caseId)))
          .orderBy(desc(clips.createdAt))
          .limit(20),
      ])

    return {
      cases: caseRows,
      categories: categoryRows,
      stats: { ...stats, feedbackThisWeek: recent.feedback },
      moodThisWeek: {
        positive: recent.positive,
        neutral: recent.neutral,
        negative: recent.negative,
      },
      withoutCase,
    }
  })

export const getCase = createServerFn()
  .validator((data: { facilityId: string; caseId: string }) => data)
  .handler(async ({ data: { facilityId, caseId } }) => {
    await requireFacility(facilityId)
    const [found] = await db
      .select()
      .from(cases)
      .where(and(eq(cases.id, caseId), eq(cases.facilityId, facilityId)))
    if (!found) return null
    const feedback = await db
      .select(clipFields)
      .from(clips)
      .where(eq(clips.caseId, caseId))
      .orderBy(desc(clips.createdAt))
    return { case: found, feedback }
  })

export const updateCase = createServerFn({ method: 'POST' })
  .validator(
    (data: {
      facilityId: string
      caseId: string
      priority?: Priority
      status?: CaseStatus
      category?: Category
    }) => {
      if (data.priority && !PRIORITIES.includes(data.priority)) {
        throw new Error('Invalid priority')
      }
      if (data.status && !STATUSES.includes(data.status)) {
        throw new Error('Invalid status')
      }
      if (data.category && !(data.category in CATEGORIES)) {
        throw new Error('Invalid category')
      }
      return data
    },
  )
  .handler(async ({ data }) => {
    await requireFacility(data.facilityId)
    await db
      .update(cases)
      .set({
        ...(data.priority
          ? { priority: data.priority, priorityManual: true }
          : {}),
        ...(data.status ? { status: data.status } : {}),
        ...(data.category ? { category: data.category } : {}),
      })
      .where(
        and(eq(cases.id, data.caseId), eq(cases.facilityId, data.facilityId)),
      )
  })

type ClipRef = { facilityId: string; clipId: string }

export const retryClip = createServerFn({ method: 'POST' })
  .validator((data: ClipRef) => data)
  .handler(async ({ data }) => {
    await requireFacility(data.facilityId)
    const [clip] = await db
      .select({ id: clips.id })
      .from(clips)
      .where(
        and(
          eq(clips.id, data.clipId),
          eq(clips.facilityId, data.facilityId),
          ne(clips.status, 'done'),
        ),
      )
    if (clip) await processClip(clip.id)
  })

export const deleteClip = createServerFn({ method: 'POST' })
  .validator((data: ClipRef) => data)
  .handler(async ({ data }) => {
    await requireFacility(data.facilityId)
    const [deleted] = await db
      .delete(clips)
      .where(
        and(eq(clips.id, data.clipId), eq(clips.facilityId, data.facilityId)),
      )
      .returning({ caseId: clips.caseId })
    if (!deleted?.caseId) return { caseDeleted: false }

    // En sak uten tilbakemeldinger har ikke lenger noe grunnlag.
    const [remaining] = await db
      .select({ value: count() })
      .from(clips)
      .where(eq(clips.caseId, deleted.caseId))
    if (remaining.value > 0) return { caseDeleted: false }
    await db.delete(cases).where(eq(cases.id, deleted.caseId))
    return { caseDeleted: true }
  })
