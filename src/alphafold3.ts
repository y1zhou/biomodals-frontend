export type PolymerType = "protein" | "dna" | "rna"

export interface PolymerEntity {
  chainIds: string[]
  copies: number
  id: string
  sequence: string
  type: PolymerType
}

export interface AlphaFold3Draft {
  entities: PolymerEntity[]
  expertFilename: string
  expertJson: string
  jobName: string
  mode: "regular" | "expert"
  nextChainIndex: number
  recycle: number
  sample: number
  searchMsa: boolean
  searchProteinTemplates: boolean
  seeds: string
}

const DRAFT_KEY = "current"
const DATABASE_NAME = "biomodals-alphafold3"

export function newAlphaFold3Draft(): AlphaFold3Draft {
  return {
    entities: [newPolymerEntity("protein", 0)],
    expertFilename: "",
    expertJson: "",
    jobName: "",
    mode: "regular",
    nextChainIndex: 1,
    recycle: 10,
    sample: 5,
    searchMsa: true,
    searchProteinTemplates: true,
    seeds: "1",
  }
}

export function chainId(index: number) {
  let value = index + 1
  let result = ""
  while (value > 0) {
    value -= 1
    result = String.fromCharCode(65 + (value % 26)) + result
    value = Math.floor(value / 26)
  }
  return result
}

export function newPolymerEntity(
  type: PolymerType,
  chainIndex: number
): PolymerEntity {
  return {
    chainIds: [chainId(chainIndex)],
    copies: 1,
    id: crypto.randomUUID(),
    sequence: "",
    type,
  }
}

export function resizeEntityCopies(
  entity: PolymerEntity,
  copies: number,
  nextChainIndex: number
) {
  const bounded = Math.max(1, Math.min(99, Math.trunc(copies) || 1))
  if (bounded <= entity.chainIds.length) {
    return {
      entity: {
        ...entity,
        copies: bounded,
        chainIds: entity.chainIds.slice(0, bounded),
      },
      nextChainIndex,
    }
  }
  const added = Array.from(
    { length: bounded - entity.chainIds.length },
    (_, index) => chainId(nextChainIndex + index)
  )
  return {
    entity: {
      ...entity,
      copies: bounded,
      chainIds: [...entity.chainIds, ...added],
    },
    nextChainIndex: nextChainIndex + added.length,
  }
}

export function parsePolymerSequence(input: string) {
  const lines = input.trim().split(/\r?\n/)
  const headers = lines.filter((line) => line.trimStart().startsWith(">"))
  if (headers.length > 1) {
    throw new Error("Paste one sequence or one FASTA record at a time.")
  }
  const sequence = lines
    .filter((line) => !line.trimStart().startsWith(">"))
    .join("")
    .replace(/\s+/g, "")
    .toUpperCase()
  if (!sequence) throw new Error("Enter a polymer sequence.")
  if (!/^[A-Z]+$/.test(sequence)) {
    throw new Error("Sequences may only contain letter residue codes.")
  }
  return sequence
}

export function parseModelSeeds(input: string) {
  const seeds: number[] = []
  for (const part of input.split(",").map((value) => value.trim())) {
    if (!part) continue
    const range = part.match(/^(\d+)-(\d+)$/)
    if (range) {
      const start = Number(range[1])
      const end = Number(range[2])
      if (start > end) throw new Error("Seed ranges must be ascending.")
      for (let seed = start; seed <= end; seed += 1) seeds.push(seed)
    } else if (/^\d+$/.test(part)) {
      seeds.push(Number(part))
    } else {
      throw new Error("Use comma-separated seeds or ranges, such as 1,3-5.")
    }
  }
  const unique = [...new Set(seeds)]
  if (!unique.length || unique.some((seed) => seed < 0 || seed >= 2 ** 32)) {
    throw new Error("Seeds must be integers from 0 through 4,294,967,295.")
  }
  return unique
}

export function regularAlphaFold3Document(draft: AlphaFold3Draft) {
  const name = draft.jobName.trim()
  if (!name) throw new Error("Enter a job name.")
  const sequences = draft.entities.map((entity) => {
    const sequence = parsePolymerSequence(entity.sequence)
    return {
      [entity.type]: {
        id: entity.chainIds,
        sequence,
      },
    }
  })
  return {
    dialect: "alphafold3",
    modelSeeds: parseModelSeeds(draft.seeds),
    name,
    sequences,
    version: 1,
  }
}

export function expertAlphaFold3Document(input: string, jobName: string) {
  const name = jobName.trim()
  if (!name) throw new Error("Enter a job name.")
  let document: unknown
  try {
    document = JSON.parse(input)
  } catch {
    throw new Error("The uploaded file is not valid JSON.")
  }
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new Error("The uploaded JSON must contain one AlphaFold3 job object.")
  }
  return { ...document, name }
}

export function formatSequence(sequence: string) {
  return sequence.replace(/(.{10})/g, "$1 ").trim()
}

function openDraftDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore("drafts")
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function draftOperation<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>
) {
  const database = await openDraftDatabase()
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = operation(database.transaction("drafts", mode).objectStore("drafts"))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  } finally {
    database.close()
  }
}

export function loadAlphaFold3Draft() {
  return draftOperation<AlphaFold3Draft | undefined>("readonly", (store) =>
    store.get(DRAFT_KEY)
  )
}

export function saveAlphaFold3Draft(draft: AlphaFold3Draft) {
  return draftOperation("readwrite", (store) => store.put(draft, DRAFT_KEY))
}

export function clearAlphaFold3Draft() {
  return draftOperation("readwrite", (store) => store.delete(DRAFT_KEY))
}
