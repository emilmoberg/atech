import {
  Link,
  Outlet,
  createFileRoute,
  notFound,
  redirect,
  useRouter,
} from '@tanstack/react-router'
import { LogOutIcon } from 'lucide-react'

import { Button } from '#/components/ui/button.tsx'
import { getSession, logout } from '#/server/functions.ts'

export const Route = createFileRoute('/f/$facilityId')({
  beforeLoad: async ({ params }) => {
    const session = await getSession()
    if (!session) throw redirect({ to: '/login' })
    const facility = session.facilities.find(
      (item) => item.id === params.facilityId,
    )
    if (!facility) throw notFound()
    return { facility, facilities: session.facilities }
  },
  component: FacilityLayout,
})

function FacilityLayout() {
  const { facility, facilities } = Route.useRouteContext()
  const router = useRouter()

  async function signOut() {
    await logout()
    await router.navigate({ to: '/login' })
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Link
            to="/f/$facilityId"
            params={{ facilityId: facility.id }}
            className="text-xl font-semibold"
          >
            {facility.name}
          </Link>
          {facilities
            .filter((item) => item.id !== facility.id)
            .map((item) => (
              <Link
                key={item.id}
                to="/f/$facilityId"
                params={{ facilityId: item.id }}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                {item.name}
              </Link>
            ))}
        </div>
        <Button variant="ghost" size="sm" onClick={signOut}>
          <LogOutIcon data-icon="inline-start" />
          Sign out
        </Button>
      </header>
      <Outlet />
    </div>
  )
}
