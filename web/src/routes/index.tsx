import { createFileRoute, redirect } from '@tanstack/react-router'

import { getSession } from '#/server/functions.ts'

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const session = await getSession()
    if (!session) throw redirect({ to: '/login' })
    const [first] = session.facilities
    if (first) {
      throw redirect({
        to: '/f/$facilityId',
        params: { facilityId: first.id },
      })
    }
  },
  component: NoFacility,
})

function NoFacility() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      Your user is not linked to a facility yet.
    </main>
  )
}
