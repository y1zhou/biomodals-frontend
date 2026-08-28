export type EntityType = "protein" | "dna" | "rna" | "ligand"
export type LigandFormat = "ccd" | "smiles"

export interface AlphaFold3Entity {
  chainIds: string[]
  copies: number
  description: string
  id: string
  ligandFormat: LigandFormat
  sequence: string
  type: EntityType
}

export interface AlphaFold3Draft {
  entities: AlphaFold3Entity[]
  expertFilename: string
  expertJson: string
  jobName: string
  mode: "regular" | "expert"
  recycle: number
  sample: number
  searchMsa: boolean
  searchProteinTemplates: boolean
  seeds: string
}

const DATABASE_NAME = "biomodals-alphafold3"
export const MAX_ENTITY_COPIES = 5_120
export const MAX_MODEL_SEEDS = 1_000

export function newAlphaFold3Draft(): AlphaFold3Draft {
  return {
    entities: [newAlphaFold3Entity("protein")],
    expertFilename: "",
    expertJson: "",
    jobName: "",
    mode: "regular",
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

export function newAlphaFold3Entity(type: EntityType): AlphaFold3Entity {
  return {
    chainIds: ["A"],
    copies: 1,
    description: "",
    id: crypto.randomUUID(),
    ligandFormat: "ccd",
    sequence: "",
    type,
  }
}

export function resizeEntityCopies(
  entity: AlphaFold3Entity,
  copies: number
): AlphaFold3Entity {
  const bounded = Math.max(1, Math.min(MAX_ENTITY_COPIES, Math.trunc(copies) || 1))
  return { ...entity, copies: bounded }
}

export function reindexEntities(entities: AlphaFold3Entity[]) {
  let nextChainIndex = 0
  return entities.map((entity) => {
    const copies = Math.max(
      1,
      Math.min(MAX_ENTITY_COPIES, Math.trunc(entity.copies) || 1)
    )
    const chainIds = Array.from(
      { length: copies },
      () => chainId(nextChainIndex++)
    )
    return { ...entity, chainIds, copies }
  })
}

export interface PolymerRecord {
  description: string
  sequence: string
}

function normalizePolymerSequence(input: string) {
  const sequence = input.replace(/\s+/g, "").toUpperCase()
  if (!sequence) throw new Error("Enter a polymer sequence.")
  if (!/^[A-Z]+$/.test(sequence)) {
    throw new Error("Sequences may only contain letter residue codes.")
  }
  return sequence
}

export function parsePolymerRecords(input: string): PolymerRecord[] {
  const lines = input.trim().split(/\r?\n/)
  if (!lines.some((line) => line.trimStart().startsWith(">"))) {
    return [{ description: "", sequence: normalizePolymerSequence(input) }]
  }

  const records: PolymerRecord[] = []
  let description: string | null = null
  let sequenceLines: string[] = []
  function finishRecord() {
    if (description === null) return
    if (!sequenceLines.some((line) => line.trim())) {
      throw new Error("Each FASTA record must contain a sequence.")
    }
    records.push({
      description,
      sequence: normalizePolymerSequence(sequenceLines.join("")),
    })
  }

  for (const line of lines) {
    if (line.trimStart().startsWith(">")) {
      finishRecord()
      description = line.trimStart().slice(1).trim()
      sequenceLines = []
    } else if (line.trim()) {
      if (description === null) {
        throw new Error("FASTA sequence content must follow a header.")
      }
      sequenceLines.push(line)
    }
  }
  finishRecord()
  return records
}

export function expandEntityRecords(
  entities: AlphaFold3Entity[],
  index: number,
  records: PolymerRecord[]
) {
  const source = entities[index]
  if (source.type === "ligand") return reindexEntities(entities)
  const replacements = records.map((record, recordIndex) => ({
    ...source,
    chainIds: [],
    copies: records.length === 1 ? source.copies : 1,
    description: record.description,
    id: recordIndex === 0 ? source.id : crypto.randomUUID(),
    sequence: record.sequence,
  }))
  return reindexEntities([
    ...entities.slice(0, index),
    ...replacements,
    ...entities.slice(index + 1),
  ])
}

export function parseModelSeeds(input: string) {
  const seeds = new Set<number>()
  function addSeed(seed: number) {
    if (!Number.isSafeInteger(seed) || seed < 0 || seed >= 2 ** 32) {
      throw new Error("Seeds must be integers from 0 through 4,294,967,295.")
    }
    if (!seeds.has(seed) && seeds.size === MAX_MODEL_SEEDS) {
      throw new Error(`At most ${MAX_MODEL_SEEDS.toLocaleString()} model seeds are allowed.`)
    }
    seeds.add(seed)
  }
  for (const part of input.split(",").map((value) => value.trim())) {
    if (!part) continue
    const range = part.match(/^(\d+)-(\d+)$/)
    if (range) {
      const start = Number(range[1])
      const end = Number(range[2])
      if (start > end) throw new Error("Seed ranges must be ascending.")
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start < 0 ||
        end >= 2 ** 32
      ) {
        throw new Error("Seeds must be integers from 0 through 4,294,967,295.")
      }
      if (end - start + 1 > MAX_MODEL_SEEDS) {
        throw new Error(`At most ${MAX_MODEL_SEEDS.toLocaleString()} model seeds are allowed.`)
      }
      for (let seed = start; seed <= end; seed += 1) addSeed(seed)
    } else if (/^\d+$/.test(part)) {
      addSeed(Number(part))
    } else {
      throw new Error("Use comma-separated seeds or ranges, such as 1,3-5.")
    }
  }
  if (!seeds.size) throw new Error("Enter at least one model seed.")
  return [...seeds]
}

export function regularAlphaFold3Document(draft: AlphaFold3Draft) {
  const name = draft.jobName.trim()
  if (!name) throw new Error("Enter a job name.")
  let nextChainIndex = 0
  const sequences: object[] = []
  for (const entity of draft.entities) {
    if (entity.type === "ligand") {
      const id = Array.from({ length: entity.copies }, () => chainId(nextChainIndex++))
      const value = entity.sequence.trim()
      if (!value) throw new Error("Enter CCD codes or a SMILES string.")
      if (entity.ligandFormat === "smiles") {
        sequences.push({ ligand: { id, smiles: value } })
        continue
      }
      const ccdCodes = value.split(/[\s,]+/).filter(Boolean)
      if (!ccdCodes.length) throw new Error("Enter at least one CCD code.")
      sequences.push({ ligand: { ccdCodes, id } })
      continue
    }
    const records = parsePolymerRecords(entity.sequence)
    for (const record of records) {
      const copies = records.length === 1 ? entity.copies : 1
      const id = Array.from({ length: copies }, () => chainId(nextChainIndex++))
      const description = record.description || (
        records.length === 1 ? entity.description : ""
      )
      sequences.push({
        [entity.type]: {
          ...(description ? { description } : {}),
          id,
          sequence: record.sequence,
        },
      })
    }
  }
  return {
    dialect: "alphafold3",
    modelSeeds: parseModelSeeds(draft.seeds),
    name,
    sequences,
    version: 1,
  }
}

function parseExpertAlphaFold3Document(input: string) {
  let document: unknown
  try {
    document = JSON.parse(input)
  } catch {
    throw new Error("The uploaded file is not valid JSON.")
  }
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new Error("The uploaded JSON must contain one AlphaFold3 job object.")
  }
  return document as Record<string, unknown>
}

export function expertAlphaFold3ModelSeeds(input: string) {
  const seeds = parseExpertAlphaFold3Document(input).modelSeeds
  if (!Array.isArray(seeds)) {
    throw new Error("The uploaded JSON must contain a modelSeeds array.")
  }
  return parseModelSeeds(seeds.join(",")).join(",")
}

export function expertAlphaFold3Document(
  input: string,
  jobName: string,
  modelSeeds: string
) {
  const name = jobName.trim()
  if (!name) throw new Error("Enter a job name.")
  const document = parseExpertAlphaFold3Document(input)
  return { ...document, modelSeeds: parseModelSeeds(modelSeeds), name }
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

function draftKey(userId: string) {
  return `current:${userId}`
}

export function loadAlphaFold3Draft(userId: string) {
  return draftOperation<AlphaFold3Draft | undefined>("readonly", (store) =>
    store.get(draftKey(userId))
  )
}

export function saveAlphaFold3Draft(userId: string, draft: AlphaFold3Draft) {
  return draftOperation("readwrite", (store) => store.put(draft, draftKey(userId)))
}

export function clearAlphaFold3Draft(userId: string) {
  return draftOperation("readwrite", (store) => store.delete(draftKey(userId)))
}
