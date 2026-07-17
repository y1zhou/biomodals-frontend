import { CloudCog, ShieldCheck, UsersRound } from "lucide-react"
import { NavLink, Outlet } from "react-router"

import { cn } from "@/lib/utils"

const links = [
  { to: "/admin/users", label: "Users", icon: UsersRound },
  { to: "/admin/modal", label: "Modal", icon: CloudCog },
] as const

export default function AdminLayout() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10 lg:px-8 lg:py-14">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-lg bg-muted">
          <ShieldCheck aria-hidden="true" className="size-5" />
        </span>
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">Admin</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage Users and live service configuration.
          </p>
        </div>
      </div>

      <nav aria-label="Admin" className="mt-8 flex gap-1 border-b">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            className={({ isActive }) =>
              cn(
                "inline-flex items-center gap-2 border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground",
                isActive && "border-primary text-foreground"
              )
            }
            key={to}
            to={to}
          >
            <Icon aria-hidden="true" className="size-4" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-8">
        <Outlet />
      </div>
    </main>
  )
}
