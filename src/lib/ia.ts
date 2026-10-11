import { STEPS, visibleFields } from '../data/steps'
import type { StudyType, Values } from '../data/types'
import type { ProposedStage } from './cronograma'

export interface TitleSuggestion {
  titulo: string
  motivo: string
}

export interface Review {
  revisado: string
  observacoes: string[]
}

async function post<T>(path: string, body: unknown, fallbackError: string): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error('Sem conexão com o servidor. Verifique a internet e tente de novo.')
  }
  const data = (await response.json().catch(() => ({}))) as T & { erro?: string }
  if (!response.ok) throw new Error(data.erro ?? fallbackError)
  return data
}

const first = (v: Values, ...ids: string[]) => ids.map((id) => (v[id] ?? '').trim()).find(Boolean) ?? ''

export async function suggestTitles(
  kind: 'cientifico' | 'publico',
  draft: string,
  values: Values,
  studyTypeName: string | undefined,
): Promise<TitleSuggestion[]> {
  const context = {
    tipoEstudo: studyTypeName ?? '',
    desenho: first(values, 'pb_desenho', 'met_desenho'),
    objetivo: first(values, 'pb_objetivo_primario', 'intro_objetivo'),
    area: first(values, 'pb_area_saude'),
    descritores: first(values, 'pb_descritores', 'palavras_chave'),
    populacao: first(values, 'pb_inclusao'),
    desfecho: first(values, 'pb_desfecho_primario'),
  }
  const data = await post<{ sugestoes?: TitleSuggestion[] }>(
    '/api/titulos',
    { kind, draft, context },
    'Não foi possível gerar sugestões agora.',
  )
  if (!data.sugestoes?.length) throw new Error('Não foi possível gerar sugestões agora.')
  return data.sugestoes
}

interface FieldRequest {
  field: string
  help: string
  step: string
  studyType?: string
  guideline?: string
  plainLanguage: boolean
}

export function reviewText(request: FieldRequest & { text: string }): Promise<Review> {
  return post<Review>('/api/revisar', request, 'Não foi possível revisar o texto agora.')
}

export interface GeneratedDraft {
  texto: string
  pendencias: string[]
}

export function draftText(request: FieldRequest & { example?: string; context: string }): Promise<GeneratedDraft> {
  return post<GeneratedDraft>('/api/gerar', request, 'Não foi possível gerar o rascunho agora.')
}

export interface Introduction {
  texto: string
  referencias: string[]
  pendencias: string[]
  fontes: number
}

export function draftIntroduction(request: {
  role: 'completa' | 'contexto' | 'justificativa'
  field: string
  studyType?: string
  context: string
  existingRefs: string[]
}): Promise<Introduction> {
  return post<Introduction>('/api/introducao', request, 'Não foi possível escrever a introdução agora.')
}

export interface SampleParameters {
  tipo: string
  motivo: string
  valores: Record<string, number | string>
  base: string
  referencias: string[]
  avisos: string[]
}

export function suggestSampleParameters(request: {
  kind: string
  context: string
  existingRefs: string[]
}): Promise<SampleParameters> {
  return post<SampleParameters>('/api/parametros', request, 'Não foi possível buscar os valores na literatura agora.')
}

export interface ProposedSchedule {
  etapas: ProposedStage[]
  pendencias: string[]
}

export function suggestSchedule(request: { studyType?: string; context: string }): Promise<ProposedSchedule> {
  return post<ProposedSchedule>('/api/cronograma', request, 'Não foi possível montar o cronograma agora.')
}

const MAX_CONTEXT_FIELD = 1500
const MAX_CONTEXT = 15000

/** Tudo o que o pesquisador já preencheu, para a IA escrever com base no estudo real. */
export function studyContext(values: Values, type: StudyType | null, exceptId: string): string {
  const parts: string[] = []
  let size = 0
  for (const step of STEPS) {
    for (const field of visibleFields(step.id, type, values)) {
      const value = (values[field.id] ?? '').trim()
      if (field.id === exceptId || !value || field.kind === 'check') continue
      const part = `${field.label}: ${value.slice(0, MAX_CONTEXT_FIELD)}`
      if (size + part.length > MAX_CONTEXT) return parts.join('\n')
      parts.push(part)
      size += part.length
    }
  }
  return parts.join('\n')
}
