// Fills a facility with made-up cases and feedback. Safe to run again: it replaces its own earlier data.
//   npm run db:seed                           # adds test data to "Testfasilitet"
//   npm run db:seed -- --name "Bygg A"        # another existing facility
//   npm run db:seed -- --remove               # removes the test data
import { randomUUID } from 'node:crypto'
import { parseArgs } from 'node:util'
import { config } from 'dotenv'
import { and, eq, inArray } from 'drizzle-orm'

import type { CaseStatus, Category, Priority, Sentiment } from '../src/lib/taxonomy.ts'

config({ path: ['.env.local', '.env'] })

const { values } = parseArgs({
  options: {
    name: { type: 'string', default: 'Testfasilitet' },
    remove: { type: 'boolean', default: false },
  },
})

// Imported after dotenv, because the database connection reads the environment.
const { db } = await import('../src/db/index.ts')
const { cases, clips, facilities } = await import('../src/db/schema.ts')

// Marks every clip as test data, so it can be told apart from real recordings.
const SEED_DEVICE = 'seed-test-data'
const HOUR_MS = 60 * 60 * 1000

type Feedback = [hoursAgo: number, sentiment: Sentiment, transcript: string, summary: string]
type SeedCase = {
  title: string
  category: Category
  priority: Priority
  status: CaseStatus
  feedback: Feedback[]
}

const SEED: SeedCase[] = [
  {
    title: 'Broken glass by the pool entrance',
    category: 'safety',
    priority: 'critical',
    status: 'new',
    feedback: [
      [2, 'negative', 'There is broken glass on the floor right by the pool entrance. Someone is going to get hurt.', 'Broken glass on the floor by the pool entrance.'],
      [3, 'negative', 'My kid almost stepped on glass near the pool door. Please clean this up now.', 'A child nearly stepped on glass by the pool door.'],
    ],
  },
  {
    title: 'Shower 3 has no hot water',
    category: 'maintenance',
    priority: 'high',
    status: 'in_progress',
    feedback: [
      [5, 'negative', 'Shower three in the men\'s changing room only has cold water.', 'Shower 3 only has cold water.'],
      [20, 'negative', 'No hot water in the third shower again. This is the second time this week.', 'Shower 3 has repeatedly had no hot water.'],
      [46, 'neutral', 'Just so you know, shower number three takes forever to get warm, if it gets warm at all.', 'Shower 3 is slow to heat up.'],
    ],
  },
  {
    title: 'Changing room floor is dirty',
    category: 'cleaning',
    priority: 'medium',
    status: 'planned',
    feedback: [
      [9, 'negative', 'The floor in the women\'s changing room is really dirty, there is hair everywhere.', 'The women\'s changing room floor is dirty.'],
      [31, 'negative', 'It smells bad in the changing room and the floor has not been washed.', 'The changing room smells and has not been washed.'],
    ],
  },
  {
    title: 'Treadmill 2 stops mid-run',
    category: 'equipment',
    priority: 'high',
    status: 'new',
    feedback: [
      [12, 'negative', 'Treadmill two shut off while I was running. I nearly fell.', 'Treadmill 2 stopped suddenly during a run.'],
    ],
  },
  {
    title: 'Gym is too warm in the evening',
    category: 'indoor_climate',
    priority: 'medium',
    status: 'new',
    feedback: [
      [26, 'negative', 'It is way too hot in the gym after six. The air feels really stuffy.', 'The gym is hot and stuffy in the evening.'],
      [72, 'neutral', 'Could you turn up the ventilation a little in the evenings? It gets pretty warm.', 'Asks for more ventilation in the evening.'],
    ],
  },
  {
    title: 'No step-free route to the sauna',
    category: 'accessibility',
    priority: 'medium',
    status: 'planned',
    feedback: [
      [50, 'neutral', 'I use a wheelchair and I cannot reach the sauna because of the two steps. Is a ramp planned?', 'Asks whether a ramp to the sauna is planned.'],
    ],
  },
  {
    title: 'Longer opening hours at weekends',
    category: 'other',
    priority: 'low',
    status: 'new',
    feedback: [
      [60, 'neutral', 'It would be nice if you stayed open a bit longer on Sundays.', 'Suggests longer opening hours on Sundays.'],
      [120, 'neutral', 'Is it possible to open earlier on Saturdays?', 'Asks for earlier opening on Saturdays.'],
    ],
  },
  {
    title: 'Friendly and helpful reception staff',
    category: 'praise',
    priority: 'low',
    status: 'new',
    feedback: [
      [7, 'positive', 'The woman at the reception was so kind and helped me find my lost keys. Thank you!', 'Thanks reception staff for help finding lost keys.'],
      [40, 'positive', 'Great service today, the staff are always smiling.', 'Praises the service and friendly staff.'],
      [96, 'positive', 'I just want to say the people at the front desk are fantastic.', 'Praises the front desk staff.'],
    ],
  },
  {
    title: 'New yoga room is great',
    category: 'praise',
    priority: 'low',
    status: 'new',
    feedback: [
      [16, 'positive', 'I love the new yoga room. It is calm, clean and has really nice light.', 'Loves the new yoga room.'],
      [84, 'positive', 'The yoga room is the best thing you have done in years.', 'Very happy with the yoga room.'],
    ],
  },
  {
    title: 'Vending machine takes money without giving a drink',
    category: 'equipment',
    priority: 'low',
    status: 'resolved',
    feedback: [
      [150, 'negative', 'The vending machine took my money and gave me nothing.', 'The vending machine kept the money without giving a drink.'],
    ],
  },
  {
    title: 'Towels in the sauna area were clean today',
    category: 'cleaning',
    priority: 'low',
    status: 'dismissed',
    feedback: [
      [200, 'positive', 'Nice and clean towels in the sauna today, good job.', 'Praises the clean towels in the sauna.'],
    ],
  },
]

// Finishing here shows what the "Without a case" section looks like.
const WITHOUT_CASE = [
  { hoursAgo: 1, transcript: 'Testing, testing, one two three.', summary: 'Microphone test.', status: 'done' as const, error: null },
  { hoursAgo: 4, transcript: 'The lights in the corridor keep flickering.', summary: null, status: 'failed' as const, error: 'Empty response from categorization' },
]

const [facility] = await db.select().from(facilities).where(eq(facilities.name, values.name))
if (!facility) throw new Error(`Facility not found: ${values.name}`)

const seeded = () => and(eq(clips.facilityId, facility.id), eq(clips.deviceId, SEED_DEVICE))
const clipAt = (hoursAgo: number, transcript: string) => ({
  id: randomUUID(),
  deviceId: SEED_DEVICE,
  deviceClip: 0,
  facilityId: facility.id,
  sampleRate: 8000,
  // About 2.5 words per second of speech.
  samples: Math.round((transcript.split(' ').length / 2.5) * 8000),
  createdAt: new Date(Date.now() - hoursAgo * HOUR_MS),
})

await db.transaction(async (tx) => {
  const earlier = await tx.select({ caseId: clips.caseId }).from(clips).where(seeded())
  const caseIds = [...new Set(earlier.flatMap((row) => row.caseId ?? []))]
  await tx.delete(clips).where(seeded())
  // A real clip that was merged into a test case keeps its row, but loses the case.
  if (caseIds.length) await tx.delete(cases).where(inArray(cases.id, caseIds))
  if (values.remove) return

  for (const { feedback, ...item } of SEED) {
    const newest = Math.min(...feedback.map(([hoursAgo]) => hoursAgo))
    const oldest = Math.max(...feedback.map(([hoursAgo]) => hoursAgo))
    const [created] = await tx
      .insert(cases)
      .values({
        ...item,
        facilityId: facility.id,
        lastFeedbackAt: new Date(Date.now() - newest * HOUR_MS),
        createdAt: new Date(Date.now() - oldest * HOUR_MS),
      })
      .returning({ id: cases.id })
    await tx.insert(clips).values(
      feedback.map(([hoursAgo, sentiment, transcript, summary]) => ({
        ...clipAt(hoursAgo, transcript),
        caseId: created.id,
        status: 'done' as const,
        transcript,
        summary,
        sentiment,
      })),
    )
  }
  await tx.insert(clips).values(
    WITHOUT_CASE.map(({ hoursAgo, ...clip }) => ({ ...clipAt(hoursAgo, clip.transcript), ...clip })),
  )
})

console.log(
  values.remove
    ? `Removed test data from ${facility.name}`
    : `Added ${SEED.length} cases to ${facility.name}`,
)
process.exit(0)
