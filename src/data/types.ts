export type Values = Record<string, string>

export type FieldKind = 'text' | 'textarea' | 'check' | 'choice'

export interface Field {
  id: string
  label: string
  help: string
  example?: string
  optional?: boolean
  kind?: FieldKind
  options?: string[]
  rows?: number
  /** Subtítulo usado no manuscrito final. */
  heading?: string
  /** Rótulo em linha no manuscrito, como "Objetivo:" no resumo estruturado. */
  inlineLabel?: string
  /** Vai para a seção "Tabelas e figuras", no fim do manuscrito. */
  atEnd?: boolean
  showIf?: (values: Values) => boolean
}

export type Phase = 0 | 1 | 2

export type StepId =
  | 'tipo'
  | 'pb_preliminares'
  | 'pb_area'
  | 'pb_desenho'
  | 'pb_detalhamento'
  | 'pb_outras'
  | 'pb_tcle'
  | 'pb_envio'
  | 'identificacao'
  | 'resumo'
  | 'introducao'
  | 'metodos'
  | 'resultados'
  | 'discussao'
  | 'conclusao'
  | 'finais'
  | 'revisao'

export interface Step {
  id: StepId
  phase: Phase
  title: string
  intro: string
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
  /** Aviso mostrado em todas as etapas da Fase 1. */
  ethicsNote?: string
}
