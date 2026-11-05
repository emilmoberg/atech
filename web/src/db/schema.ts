import {
  boolean,
  customType,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

import { PRIORITIES, SENTIMENTS, STATUSES } from '#/lib/taxonomy.ts'

const bytea = customType<{ data: Buffer }>({
  dataType: () => 'bytea',
})

const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).notNull().defaultNow()

export const clipStatus = pgEnum('clip_status', [
  'transcribing',
  'categorizing',
  'done',
  'failed',
])
export const casePriority = pgEnum('case_priority', PRIORITIES)
export const caseStatus = pgEnum('case_status', STATUSES)
export const sentiment = pgEnum('sentiment', SENTIMENTS)

// RLS uten policyer stenger alle tabellene for Supabase sitt offentlige REST-API.
// Appen kobler til som eieren av tabellene og sjekker tilgang i serverkoden.
export const facilities = pgTable('facilities', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull().unique(),
  createdAt: createdAt(),
}).enableRLS()

export const devices = pgTable('devices', {
  id: text().primaryKey(),
  facilityId: uuid('facility_id')
    .notNull()
    .references(() => facilities.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
}).enableRLS()

export const facilityAdmins = pgTable(
  'facility_admins',
  {
    // ID fra Supabase Auth.
    userId: uuid('user_id').notNull(),
    facilityId: uuid('facility_id')
      .notNull()
      .references(() => facilities.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.userId, table.facilityId] })],
).enableRLS()

export const cases = pgTable(
  'cases',
  {
    id: uuid().primaryKey().defaultRandom(),
    facilityId: uuid('facility_id')
      .notNull()
      .references(() => facilities.id, { onDelete: 'cascade' }),
    title: text().notNull(),
    category: text().notNull(),
    priority: casePriority().notNull(),
    // Når en admin har satt prioritet, overstyrer ikke modellen den lenger.
    priorityManual: boolean('priority_manual').notNull().default(false),
    status: caseStatus().notNull().default('new'),
    lastFeedbackAt: timestamp('last_feedback_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: createdAt(),
  },
  (table) => [index('cases_facility_idx').on(table.facilityId, table.status)],
).enableRLS()

export const clips = pgTable(
  'clips',
  {
    id: uuid().primaryKey(),
    deviceId: text('device_id').notNull(),
    deviceClip: integer('device_clip').notNull(),
    // Settes ved mottak og følger ikke enheten om den flyttes senere.
    facilityId: uuid('facility_id').references(() => facilities.id, {
      onDelete: 'cascade',
    }),
    caseId: uuid('case_id').references(() => cases.id, {
      onDelete: 'set null',
    }),
    sampleRate: integer('sample_rate').notNull(),
    samples: integer().notNull(),
    missingChunks: integer('missing_chunks').notNull().default(0),
    // Ubrukt: lyd lagres ikke lenger. Holder bare lyd fra gamle klipp til kolonnen fjernes.
    audio: bytea(),
    status: clipStatus().notNull().default('transcribing'),
    transcript: text(),
    summary: text(),
    sentiment: sentiment(),
    error: text(),
    createdAt: createdAt(),
  },
  (table) => [
    index('clips_facility_idx').on(table.facilityId, table.createdAt),
    index('clips_case_idx').on(table.caseId),
  ],
).enableRLS()
