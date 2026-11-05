import { and, desc, eq, inArray } from 'drizzle-orm'
import OpenAI, { toFile } from 'openai'

import { db } from '#/db/index.ts'
import { cases, clips } from '#/db/schema.ts'
import { OPEN_STATUSES, PRIORITIES } from '#/lib/taxonomy.ts'
import type { Priority } from '#/lib/taxonomy.ts'
import { categorize } from './categorize.server.ts'

const MAX_OPEN_CASES = 100

export async function transcribe(id: string, audio: Buffer) {
  const result = await new OpenAI().audio.transcriptions.create({
    file: await toFile(audio, `${id}.wav`, { type: 'audio/wav' }),
    model: process.env.WHISPER_MODEL || 'whisper-1',
    language: process.env.WHISPER_LANGUAGE || undefined,
  })
  return result.text.trim()
}

const isHigher = (a: Priority, b: Priority) =>
  PRIORITIES.indexOf(a) < PRIORITIES.indexOf(b)

// Kategoriserer et lagret transkript. Feil lagres på klippet og kan prøves igjen fra UI-et.
export async function processClip(id: string) {
  try {
    const [clip] = await db.select().from(clips).where(eq(clips.id, id))
    if (!clip) return

    const transcript = clip.transcript
    if (transcript === null) {
      throw new Error('The clip has no transcript, and audio is not stored')
    }

    if (!transcript) {
      await db
        .update(clips)
        .set({ status: 'done', error: null })
        .where(eq(clips.id, id))
      return
    }
    const facilityId = clip.facilityId
    if (!facilityId) {
      throw new Error(`Device ${clip.deviceId} is not linked to a facility`)
    }

    await db
      .update(clips)
      .set({ status: 'categorizing', error: null })
      .where(eq(clips.id, id))

    const openCases = await db
      .select({
        id: cases.id,
        title: cases.title,
        category: cases.category,
        priority: cases.priority,
        priorityManual: cases.priorityManual,
      })
      .from(cases)
      .where(
        and(
          eq(cases.facilityId, facilityId),
          inArray(cases.status, [...OPEN_STATUSES]),
        ),
      )
      .orderBy(desc(cases.lastFeedbackAt))
      .limit(MAX_OPEN_CASES)

    const result = await categorize(transcript, openCases)

    if (!result.isFeedback) {
      await db
        .update(clips)
        .set({ status: 'done', summary: result.summary, error: null })
        .where(eq(clips.id, id))
      return
    }

    await db.transaction(async (tx) => {
      const existing =
        result.existingCase === null ? null : openCases[result.existingCase]
      let caseId: string
      if (existing) {
        caseId = existing.id
        await tx
          .update(cases)
          .set({
            lastFeedbackAt: new Date(),
            ...(!existing.priorityManual &&
            isHigher(result.priority, existing.priority)
              ? { priority: result.priority }
              : {}),
          })
          .where(eq(cases.id, caseId))
      } else {
        const [created] = await tx
          .insert(cases)
          .values({
            facilityId,
            title: result.title,
            category: result.category,
            priority: result.priority,
          })
          .returning({ id: cases.id })
        caseId = created.id
      }
      await tx
        .update(clips)
        .set({
          status: 'done',
          caseId,
          summary: result.summary,
          sentiment: result.sentiment,
          error: null,
        })
        .where(eq(clips.id, id))
    })
  } catch (error) {
    console.error(`behandling feilet for ${id}`, error)
    await db
      .update(clips)
      .set({
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      .where(eq(clips.id, id))
  }
}
