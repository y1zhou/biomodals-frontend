// Reject malformed imports atomically; row content remains editable afterward.
export function parseCsv(content: string, header: readonly string[]): string[][] {
  const text = content.replace(/^\uFEFF/, "")
  const rows: string[][] = []
  let row: string[] = []
  let value = ""
  let quoted = false
  let closed = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { value += '"'; i++ }
        else { quoted = false; closed = true }
      } else value += char
    } else if (char === '"') {
      if (value || closed) throw new Error("Malformed CSV quotation. The batch was not changed.")
      quoted = true
    } else if (char === "," || char === "\n" || char === "\r") {
      row.push(value); value = ""; closed = false
      if (char !== ",") {
        rows.push(row); row = []
        if (char === "\r" && text[i + 1] === "\n") i++
      }
    } else {
      if (closed) throw new Error("Unexpected text after a quoted CSV field. The batch was not changed.")
      value += char
    }
  }
  if (quoted) throw new Error("Unclosed CSV quotation. The batch was not changed.")
  if (value || closed || row.length) rows.push([...row, value])
  if (rows[0]?.join(",") !== header.join(",") || rows[0]?.length !== header.length) {
    throw new Error(`CSV must start with exactly ${header.join(",")}. The batch was not changed.`)
  }
  if (rows.length < 2) throw new Error("CSV has no data rows. The batch was not changed.")
  return rows.slice(1).map((fields, index) => {
    if (fields.length !== header.length) throw new Error(`CSV row ${index + 2} must have ${header.length} fields. The batch was not changed.`)
    return fields
  })
}
