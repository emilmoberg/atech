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

const PRIORITY_COLORS: Record<Priority, string> = {
  critical: 'border-red-300 bg-red-100 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300',
  high: 'border-orange-300 bg-orange-100 text-orange-800 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-300',
  medium: 'border-sky-300 bg-sky-100 text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300',
  low: 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300',
}

const STATUS_COLORS: Record<CaseStatus, string> = {
  new: 'border-violet-300 bg-violet-100 text-violet-800 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300',
  planned: 'border-blue-300 bg-blue-100 text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300',
  in_progress: 'border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300',
  resolved: 'border-green-300 bg-green-100 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300',
  dismissed: 'border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400',
}

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
  colors,
  onChange,
}: {
  label: string
  value: T
  options: readonly T[]
  labels: Record<T, string>
  colors?: Record<T, string>
  onChange: (value: T) => void
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as T)}>
      <SelectTrigger size="sm" aria-label={label} className={colors?.[value]}>
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
      colors={PRIORITY_COLORS}
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
      colors={STATUS_COLORS}
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
