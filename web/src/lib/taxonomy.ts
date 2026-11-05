export const CATEGORIES = {
  cleaning: 'Cleaning',
  maintenance: 'Maintenance',
  equipment: 'Equipment',
  indoor_climate: 'Indoor climate',
  service: 'Service and staff',
  safety: 'Safety',
  accessibility: 'Accessibility',
  praise: 'Praise',
  other: 'Other',
} as const
export type Category = keyof typeof CATEGORIES
export const CATEGORY_KEYS = Object.keys(CATEGORIES) as [Category, ...Category[]]

// Rekkefølgen er også sorteringen i databasen: viktigst først.
export const PRIORITIES = ['critical', 'high', 'medium', 'low'] as const
export type Priority = (typeof PRIORITIES)[number]
export const PRIORITY_LABELS: Record<Priority, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

export const STATUSES = [
  'new',
  'planned',
  'in_progress',
  'resolved',
  'dismissed',
] as const
export type CaseStatus = (typeof STATUSES)[number]
export const STATUS_LABELS: Record<CaseStatus, string> = {
  new: 'New',
  planned: 'Planned',
  in_progress: 'In progress',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
}
export const OPEN_STATUSES = ['new', 'planned', 'in_progress'] as const

export const SENTIMENTS = ['positive', 'neutral', 'negative'] as const
export type Sentiment = (typeof SENTIMENTS)[number]
export const SENTIMENT_LABELS = {
  positive: 'Positive',
  neutral: 'Neutral',
  negative: 'Negative',
} as const

// The case's overall rating is its most common one. A tie goes to the worse rating,
// so a problem is not hidden by praise.
export function overallSentiment(counts: Record<Sentiment, number>): Sentiment | null {
  const best = Math.max(counts.negative, counts.neutral, counts.positive)
  if (best === 0) return null
  return (['negative', 'neutral', 'positive'] as const).find(
    (sentiment) => counts[sentiment] === best,
  ) as Sentiment
}
