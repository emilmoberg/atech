import { Link, createFileRoute, notFound, useNavigate } from '@tanstack/react-router'
import { ArrowLeftIcon } from 'lucide-react'

import { ClipItem } from '#/components/clip-item.tsx'
import {
  CategorySelect,
  PrioritySelect,
  StatusSelect,
} from '#/components/case-controls.tsx'
import type { Category } from '#/lib/taxonomy.ts'
import { getCase } from '#/server/functions.ts'

export const Route = createFileRoute('/f/$facilityId/cases/$caseId')({
  loader: async ({ params }) => {
    const data = await getCase({ data: params })
    if (!data) throw notFound()
    return data
  },
  component: CaseDetail,
})

function CaseDetail() {
  const { facilityId, caseId } = Route.useParams()
  const { case: item, feedback } = Route.useLoaderData()
  const navigate = useNavigate()
  const ref = { facilityId, caseId }

  return (
    <main className="flex flex-col gap-4">
      <Link
        to="/f/$facilityId"
        params={{ facilityId }}
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon aria-hidden className="size-4" />
        All cases
      </Link>
      <h1 className="text-2xl font-semibold text-pretty">{item.title}</h1>
      <div className="flex flex-wrap gap-2">
        <PrioritySelect {...ref} value={item.priority} />
        <StatusSelect {...ref} value={item.status} />
        <CategorySelect {...ref} value={item.category as Category} />
      </div>
      <h2 className="mt-2 font-medium">
        {feedback.length} feedback
      </h2>
      <ul className="flex flex-col divide-y">
        {feedback.map((clip) => (
          <ClipItem
            key={clip.id}
            clip={clip}
            facilityId={facilityId}
            onCaseDeleted={() =>
              navigate({ to: '/f/$facilityId', params: { facilityId } })
            }
          />
        ))}
      </ul>
    </main>
  )
}
