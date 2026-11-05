import { useEffect, useState } from 'react'
import {
  Link,
  createFileRoute,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { InboxIcon, SearchIcon } from 'lucide-react'

import { ClipItem } from '#/components/clip-item.tsx'
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
  STATUSES,
  STATUS_LABELS,
} from '#/lib/taxonomy.ts'
import type { Category, CaseStatus, Priority } from '#/lib/taxonomy.ts'
import { getOverview } from '#/server/functions.ts'
import type { CaseFilters } from '#/server/functions.ts'

const POLL_MS = 15000
const SEARCH_DELAY_MS = 300
const OPEN = 'open'
const ANY = 'any'

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
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ params, deps }) =>
    getOverview({ data: { facilityId: params.facilityId, filters: deps } }),
  component: Overview,
})

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="gap-2 py-4">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
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
        <Stat label="Open cases" value={data.stats.open} />
        <Stat label="Critical and high" value={data.stats.urgent} />
        <Stat label="Unhandled" value={data.stats.unhandled} />
        <Stat label="Feedback, 7 days" value={data.stats.feedbackThisWeek} />
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
          {data.cases.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center"
            >
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
          ))}
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
