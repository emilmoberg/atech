import { useRouter } from '@tanstack/react-router'

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select.tsx'
import {
  CATEGORIES,
  CATEGORY_KEYS,
  PRIORITIES,
  PRIORITY_LABELS,
  STATUSES,
  STATUS_LABELS,
} from '#/lib/taxonomy.ts'
import type { Category, CaseStatus, Priority } from '#/lib/taxonomy.ts'
import { updateCase } from '#/server/functions.ts'

type CaseRef = { facilityId: string; caseId: string }

function useUpdate(ref: CaseRef) {
  const router = useRouter()
  return async (
    change: { priority: Priority } | { status: CaseStatus } | { category: Category },
  ) => {
    await updateCase({ data: { ...ref, ...change } })
    await router.invalidate()
  }
}

function Choice<T extends string>({
  label,
  value,
  options,
  labels,
  onChange,
}: {
  label: string
  value: T
  options: readonly T[]
  labels: Record<T, string>
  onChange: (value: T) => void
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as T)}>
      <SelectTrigger size="sm" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {labels[option]}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

export function PrioritySelect(props: CaseRef & { value: Priority }) {
  const update = useUpdate(props)
  return (
    <Choice
      label="Priority"
      value={props.value}
      options={PRIORITIES}
      labels={PRIORITY_LABELS}
      onChange={(priority) => update({ priority })}
    />
  )
}

export function StatusSelect(props: CaseRef & { value: CaseStatus }) {
  const update = useUpdate(props)
  return (
    <Choice
      label="Status"
      value={props.value}
      options={STATUSES}
      labels={STATUS_LABELS}
      onChange={(status) => update({ status })}
    />
  )
}

export function CategorySelect(props: CaseRef & { value: Category }) {
  const update = useUpdate(props)
  return (
    <Choice
      label="Category"
      value={props.value}
      options={CATEGORY_KEYS}
      labels={CATEGORIES}
      onChange={(category) => update({ category })}
    />
  )
}
