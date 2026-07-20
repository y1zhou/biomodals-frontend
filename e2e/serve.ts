import { build, preview } from "vite"

const port = Number(process.env.BIOMODALS_BROWSER_FRONTEND_PORT)
if (!Number.isInteger(port) || port < 1) {
  throw new Error("BIOMODALS_BROWSER_FRONTEND_PORT is missing")
}

await build({ mode: "test" })
const server = await preview({
  mode: "test",
  preview: {
    host: "127.0.0.1",
    port,
    strictPort: true,
  },
})
server.printUrls()
