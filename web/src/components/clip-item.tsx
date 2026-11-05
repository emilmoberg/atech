import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { RotateCwIcon, Trash2Icon } from 'lucide-react'

import { Alert, AlertDescription } from '#/components/ui/alert.tsx'
import { SentimentFace } from '#/components/sentiment-face.tsx'
import { Badge } from '#/components/ui/badge.tsx'
import { Button } from '#/components/ui/button.tsx'
import { formatTime } from '#/lib/format.ts'
import { SENTIMENT_LABELS } from '#/lib/taxonomy.ts'
import { deleteClip, retryClip } from '#/server/functions.ts'

// Stopper en serverfunksjon midt i behandlingen, blir status stående.
const STUCK_AFTER_MS = 5 * 60 * 1000

export type ClipData = {
  id: string
  sampleRate: number
  samples: number
  missingChunks: number
  status: 'transcribing' | 'categorizing' | 'done' | 'failed'
  transcript: string | null
  summary: string | null
  sentiment: keyof typeof SENTIMENT_LABELS | null
  error: string | null
  createdAt: Date
}

export function ClipItem({
  clip,
  facilityId,
  onCaseDeleted,
}: {
  clip: ClipData
  facilityId: string
  onCaseDeleted?: () => void
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const seconds = (clip.samples / clip.sampleRate).toFixed(1)
  const working = clip.status === 'transcribing' || clip.status === 'categorizing'
  const stuck =
    working && Date.now() - new Date(clip.createdAt).getTime() > STUCK_AFTER_MS
  const canRetry = clip.status === 'failed' || stuck

  async function retry() {
    setBusy(true)
    try {
      await retryClip({ data: { facilityId, clipId: clip.id } })
      await router.invalidate()
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!window.confirm('Delete this feedback?')) return
    setBusy(true)
    try {
      const { caseDeleted } = await deleteClip({
        data: { facilityId, clipId: clip.id },
      })
      if (caseDeleted) onCaseDeleted?.()
      else await router.invalidate()
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="flex flex-col gap-3 py-5">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        {clip.sentiment && <SentimentFace sentiment={clip.sentiment} />}
        <time dateTime={new Date(clip.createdAt).toISOString()}>
          {formatTime(clip.createdAt)}
        </time>
        <span>· {seconds} s</span>
        {working && !stuck && <Badge variant="secondary">Processing</Badge>}
        {canRetry && <Badge variant="destructive">Failed</Badge>}
        {clip.missingChunks > 0 && (
          <Badge variant="outline">Gaps in audio</Badge>
        )}
      </div>

      {clip.status === 'done' && !clip.transcript && (
        <p className="text-muted-foreground">No speech found</p>
      )}
      {clip.transcript && <p className="text-pretty">{clip.transcript}</p>}
      {clip.error && (
        <Alert variant="destructive">
          <AlertDescription>{clip.error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {canRetry && (
          <Button variant="outline" size="sm" disabled={busy} onClick={retry}>
            <RotateCwIcon data-icon="inline-start" />
            Try again
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Delete feedback"
          disabled={busy}
          onClick={remove}
        >
          <Trash2Icon />
        </Button>
      </div>
    </li>
  )
}
