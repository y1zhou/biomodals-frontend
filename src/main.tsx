import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { createBrowserRouter, RouterProvider } from "react-router"

import { apiEvents, type serviceCapabilities } from "./api/client"
import { capabilitiesKey } from "./capabilities"
import App from "./App.tsx"
import AppErrorBoundary from "./components/AppErrorBoundary.tsx"
import "./index.css"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
    },
  },
})
apiEvents.addEventListener("remote-execution-unavailable", () => {
  const capabilities = queryClient.getQueryData<Awaited<ReturnType<typeof serviceCapabilities>>>(capabilitiesKey)
  if (capabilities?.remote_execution_enabled === false) return
  queryClient.setQueryData(capabilitiesKey, { remote_execution_enabled: false })
  void queryClient.invalidateQueries({ queryKey: capabilitiesKey })
})

const router = createBrowserRouter([
  {
    path: "*",
    element: (
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    ),
  },
])

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>
)
