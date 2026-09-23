export async function copyText(value: string) {
  if (navigator.clipboard) return navigator.clipboard.writeText(value)

  const textarea = document.createElement("textarea")
  textarea.value = value
  textarea.style.position = "fixed"
  textarea.style.opacity = "0"
  const focused = document.activeElement
  // A modal makes the rest of the document inert, including a body-level field.
  const container = focused?.closest("dialog[open]") ?? document.body
  container.append(textarea)
  try {
    textarea.select()
    if (!document.execCommand("copy")) throw new Error("Copy was not permitted")
  } finally {
    textarea.remove()
    if (focused instanceof HTMLElement && focused.isConnected) focused.focus()
  }
}
