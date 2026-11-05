import { FrownIcon, MehIcon, SmileIcon } from 'lucide-react'

import { cn } from '#/lib/utils'
import { SENTIMENT_LABELS } from '#/lib/taxonomy.ts'
import type { Sentiment } from '#/lib/taxonomy.ts'

export const SENTIMENT_FACES = {
  positive: {
    Icon: SmileIcon,
    colors: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400',
  },
  neutral: {
    Icon: MehIcon,
    colors: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400',
  },
  negative: {
    Icon: FrownIcon,
    colors: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
  },
} as const

export function SentimentFace({
  sentiment,
  className,
}: {
  sentiment: Sentiment
  className?: string
}) {
  const { Icon, colors } = SENTIMENT_FACES[sentiment]
  const label = SENTIMENT_LABELS[sentiment]
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-full',
        colors,
        className,
      )}
    >
      <Icon aria-hidden className="size-5" />
    </span>
  )
}
