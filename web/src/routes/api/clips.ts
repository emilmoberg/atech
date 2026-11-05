import { createFileRoute } from '@tanstack/react-router'

import { eq } from 'drizzle-orm'

import { db } from '#/db/index.ts'
import { clips, devices } from '#/db/schema.ts'
import { hasIngestToken } from '#/server/auth.server.ts'
import { processClip, transcribe } from '#/server/process.server.ts'

// 15 s lyd ved 8 kHz er rundt 240 kB. Vercel avviser uansett alt over 4,5 MB.
const MAX_AUDIO_BYTES = 2 * 1024 * 1024
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function intField(form: FormData, name: string, min: number) {
  const value = Number(form.get(name))
  return Number.isInteger(value) && value >= min ? value : null
}

export const Route = createFileRoute('/api/clips')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!hasIngestToken(request)) {
          return Response.json({ error: 'unauthorized' }, { status: 401 })
        }

        const form = await request.formData().catch(() => null)
        const file = form?.get('file')
        const id = form?.get('id')
        const deviceId = form?.get('deviceId')
        if (
          !form ||
          !(file instanceof File) ||
          typeof id !== 'string' ||
          !UUID.test(id) ||
          typeof deviceId !== 'string' ||
          !deviceId
        ) {
          return Response.json({ error: 'invalid clip' }, { status: 400 })
        }
        if (file.size > MAX_AUDIO_BYTES) {
          return Response.json({ error: 'too large' }, { status: 413 })
        }

        const deviceClip = intField(form, 'deviceClip', 0)
        const sampleRate = intField(form, 'sampleRate', 1)
        const samples = intField(form, 'samples', 1)
        const missingChunks = intField(form, 'missingChunks', 0)
        const audio = Buffer.from(await file.arrayBuffer())
        if (
          deviceClip === null ||
          sampleRate === null ||
          samples === null ||
          missingChunks === null ||
          audio.subarray(0, 4).toString('latin1') !== 'RIFF'
        ) {
          return Response.json({ error: 'invalid clip' }, { status: 400 })
        }

        // Proxyen prøver på nytt hvis den ikke får svar, så samme ID kan komme to ganger.
        const [existing] = await db
          .select({ id: clips.id })
          .from(clips)
          .where(eq(clips.id, id))
        if (existing) return Response.json({ id, duplicate: true })

        // Lyden lagres ikke. Feiler Whisper, beholder proxyen lyden og prøver igjen.
        let transcript: string
        try {
          transcript = await transcribe(id, audio)
        } catch (error) {
          console.error(`transkribering feilet for ${id}`, error)
          return Response.json({ error: 'transcription failed' }, { status: 503 })
        }

        const [device] = await db
          .select({ facilityId: devices.facilityId })
          .from(devices)
          .where(eq(devices.id, deviceId))

        const inserted = await db
          .insert(clips)
          .values({
            id,
            deviceId,
            deviceClip,
            facilityId: device?.facilityId,
            sampleRate,
            samples,
            missingChunks,
            transcript,
            status: 'categorizing',
          })
          .onConflictDoNothing()
          .returning({ id: clips.id })
        if (inserted.length === 0) {
          return Response.json({ id, duplicate: true })
        }

        await processClip(id)
        return Response.json({ id }, { status: 201 })
      },
    },
  },
})
