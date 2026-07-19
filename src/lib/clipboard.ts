export async function copyText(value: string) {
  if (navigator.clipboard) return navigator.clipboard.writeText(value)

  const textarea = document.createElement("textarea")
  textarea.value = value
  textarea.style.position = "fixed"
  textarea.style.opacity = "0"
  document.body.append(textarea)
  try {
    textarea.select()
    if (!document.execCommand("copy")) throw new Error("Copy was not permitted")
  } finally {
    textarea.remove()
  }
}
