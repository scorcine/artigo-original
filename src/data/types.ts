export interface Field {
  id: string
  label: string
  help: string
  example?: string
  optional?: boolean
  singleLine?: boolean
  rows?: number
  /** Subtítulo usado no manuscrito final. */
  heading?: string
  /** Rótulo em linha no manuscrito, como "Objetivo:" no resumo estruturado. */
  inlineLabel?: string
  /** Vai para a seção "Tabelas e figuras", no fim do manuscrito. */
  atEnd?: boolean
}

export interface StudyType {
  id: string
  name: string
  description: string
  guideline: string
  designHint: string
  methods: Field[]
  resultsBefore: Field[]
  resultsAfter: Field[]
  mainResultHint?: string
  mainResultHeading?: string
  wordLimit?: { max: number; note: string }
}
