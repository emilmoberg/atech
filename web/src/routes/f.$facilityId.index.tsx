import { useEffect, useState } from 'react'
import {
  Link,
  createFileRoute,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { InboxIcon, SearchIcon } from 'lucide-react'

import { ClipItem } from '#/components/clip-item.tsx'
import { SENTIMENT_FACES, SentimentFace } from '#/components/sentiment-face.tsx'
import { PrioritySelect, StatusSelect } from '#/components/case-controls.tsx'
import { Badge } from '#/components/ui/badge.tsx'
import { Button } from '#/components/ui/button.tsx'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card.tsx'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#/components/ui/empty.tsx'
import { Input } from '#/components/ui/input.tsx'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select.tsx'
import { formatTime } from '#/lib/format.ts'
import {
  CATEGORIES,
  PRIORITIES,
  PRIORITY_LABELS,
  SENTIMENTS,
  SENTIMENT_LABELS,
  STATUSES,
  STATUS_LABELS,
  overallSentiment,
} from '#/lib/taxonomy.ts'
import type { Category, CaseStatus, Priority } from '#/lib/taxonomy.ts'
import { getOverview } from '#/server/functions.ts'
import type { CaseFilters } from '#/server/functions.ts'

const POLL_MS = 15000
const SEARCH_DELAY_MS = 300
const OPEN = 'open'
const ANY = 'any'
const BY_PRIORITY = 'priority'

const oneOf = <T extends string>(list: readonly T[], value: unknown) =>
  list.includes(value as T) ? (value as T) : undefined

export const Route = createFileRoute('/f/$facilityId/')({
  validateSearch: (search: Record<string, unknown>): CaseFilters => ({
    q: typeof search.q === 'string' && search.q ? search.q : undefined,
    category: oneOf(Object.keys(CATEGORIES) as Category[], search.category),
    status:
      search.status === 'all'
        ? 'all'
        : oneOf(STATUSES, search.status),
    priority: oneOf(PRIORITIES, search.priority),
    sort: search.sort === 'recent' ? 'recent' : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ params, deps }) =>
    getOverview({ data: { facilityId: params.facilityId, filters: deps } }),
  component: Overview,
})

function Stat({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color: string
}) {
  return (
    <Card className="gap-2 py-4">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className={`text-2xl tabular-nums ${color}`}>{value}</CardTitle>
      </CardHeader>
    </Card>
  )
}

function Overview() {
  const { facilityId } = Route.useParams()
  const filters = Route.useSearch()
  const data = Route.useLoaderData()
  const router = useRouter()
  const navigate = useNavigate({ from: Route.fullPath })
  const [query, setQuery] = useState(filters.q ?? '')

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void router.invalidate()
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [router])

  function setFilter(change: Partial<CaseFilters>) {
    void navigate({
      search: (previous) => ({ ...previous, ...change }),
      replace: true,
    })
  }

  useEffect(() => {
    const value = query.trim() || undefined
    if (value === filters.q) return
    const timer = setTimeout(() => setFilter({ q: value }), SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [query])

  const filtered = Boolean(
    filters.q || filters.category || filters.status || filters.priority,
  )

  return (
    <main className="flex flex-col gap-6">
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Open cases" value={data.stats.open} color="text-primary" />
        <Stat
          label="Critical and high"
          value={data.stats.urgent}
          color="text-red-600 dark:text-red-400"
        />
        <Stat
          label="Unhandled"
          value={data.stats.unhandled}
          color="text-orange-600 dark:text-orange-400"
        />
        <Stat
          label="Feedback, 7 days"
          value={data.stats.feedbackThisWeek}
          color="text-sky-600 dark:text-sky-400"
        />
      </section>

      <section aria-label="Ratings, 7 days" className="grid grid-cols-3 gap-3">
        {SENTIMENTS.map((sentiment) => (
          <div
            key={sentiment}
            className={`flex items-center gap-3 rounded-xl p-3 ${SENTIMENT_FACES[sentiment].colors}`}
          >
            <SentimentFace sentiment={sentiment} className="bg-transparent dark:bg-transparent" />
            <div className="min-w-0">
              <p className="text-2xl leading-none font-semibold tabular-nums">
                {data.moodThisWeek[sentiment]}
              </p>
              <p className="truncate text-sm">{SENTIMENT_LABELS[sentiment]}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <div className="relative">
          <SearchIcon
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            aria-label="Search cases and feedback"
            placeholder="Search cases and feedback"
            className="pl-9"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={filters.status ?? OPEN}
            onValueChange={(value) =>
              setFilter({
                status:
                  value === OPEN ? undefined : (value as CaseStatus | 'all'),
              })
            }
          >
            <SelectTrigger size="sm" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={OPEN}>All open</SelectItem>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select
            value={filters.priority ?? ANY}
            onValueChange={(value) =>
              setFilter({
                priority: value === ANY ? undefined : (value as Priority),
              })
            }
          >
            <SelectTrigger size="sm" aria-label="Filter by priority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={ANY}>All priorities</SelectItem>
                {PRIORITIES.map((priority) => (
                  <SelectItem key={priority} value={priority}>
                    {PRIORITY_LABELS[priority]}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select
            value={filters.sort ?? BY_PRIORITY}
            onValueChange={(value) =>
              setFilter({ sort: value === 'recent' ? 'recent' : undefined })
            }
          >
            <SelectTrigger size="sm" aria-label="Sort cases" className="sm:ml-auto">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={BY_PRIORITY}>Sort by priority</SelectItem>
                <SelectItem value="recent">Sort by most recent</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        {data.categories.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {data.categories.map((row) => {
              const category = row.category as Category
              const active = filters.category === category
              return (
                <Button
                  key={category}
                  size="sm"
                  variant={active ? 'default' : 'outline'}
                  aria-pressed={active}
                  onClick={() =>
                    setFilter({ category: active ? undefined : category })
                  }
                >
                  {CATEGORIES[category] ?? category}
                  <span className="tabular-nums opacity-70">{row.cases}</span>
                </Button>
              )
            })}
          </div>
        )}
      </section>

      {data.cases.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <InboxIcon />
            </EmptyMedia>
            <EmptyTitle>
              {filtered ? 'No results' : 'No open cases'}
            </EmptyTitle>
            <EmptyDescription>
              {filtered
                ? 'Try another search or clear the filters.'
                : 'New feedback from your devices will appear here.'}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="flex flex-col divide-y">
          {data.cases.map((item) => {
            const sentiment = overallSentiment(item)
            return (
            <li
              key={item.id}
              className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center"
            >
              {sentiment && <SentimentFace sentiment={sentiment} />}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Link
                  to="/f/$facilityId/cases/$caseId"
                  params={{ facilityId, caseId: item.id }}
                  className="font-medium text-pretty hover:underline"
                >
                  {item.title}
                </Link>
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="secondary">
                    {CATEGORIES[item.category as Category] ?? item.category}
                  </Badge>
                  <span>
                    {item.feedbackCount}{' '}
                    feedback
                  </span>
                  <span>· {formatTime(item.lastFeedbackAt)}</span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <PrioritySelect
                  facilityId={facilityId}
                  caseId={item.id}
                  value={item.priority}
                />
                <StatusSelect
                  facilityId={facilityId}
                  caseId={item.id}
                  value={item.status}
                />
              </div>
            </li>
            )
          })}
        </ul>
      )}

      {data.withoutCase.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Without a case</CardTitle>
            <CardDescription>
              Clips being processed, clips that failed and recordings without
              feedback.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y">
              {data.withoutCase.map((clip) => (
                <ClipItem key={clip.id} clip={clip} facilityId={facilityId} />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </main>
  )
}
