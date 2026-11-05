import { useState } from 'react'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'

import { Button } from '#/components/ui/button.tsx'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '#/components/ui/field.tsx'
import { Input } from '#/components/ui/input.tsx'
import { getSession, login } from '#/server/functions.ts'

export const Route = createFileRoute('/login')({
  beforeLoad: async () => {
    if (await getSession()) throw redirect({ to: '/' })
  },
  component: Login,
})

function Login() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    const { ok } = await login({ data: { email, password } })
    setBusy(false)
    setFailed(!ok)
    if (ok) {
      await router.invalidate()
      await router.navigate({ to: '/' })
    }
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-6 p-4">
      <h1 className="text-2xl font-semibold">Feedback</h1>
      <form onSubmit={submit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              autoFocus
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <Field data-invalid={failed || undefined}>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              aria-invalid={failed || undefined}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            {failed && <FieldError>Wrong email or password</FieldError>}
          </Field>
          <Button type="submit" disabled={busy}>
            Sign in
          </Button>
        </FieldGroup>
      </form>
    </main>
  )
}
