import { clip } from './_ia.js'

export interface Part {
  id?: string
  titulo?: string
  texto?: string
}

export interface ProjectBody {
  fase?: number
  studyType?: string
  guideline?: string
  partes?: Part[]
  referencias?: string[]
}

export interface Project {
  parts: Map<string, string>
  titles: Map<string, string>
  /** Todos os campos, marcados com <<campo id="..." titulo="...">>, para a IA. */
  document: string
}

const MAX_PARTS = 60
const MAX_PART = 8000
const MAX_TOTAL = 70000

export const str = (v: unknown, max: number) => (typeof v === 'string' ? clip(v.trim(), max) : '')
export const collapse = (s: string) => s.replace(/\s+/g, ' ').trim()
export const countWords = (s: string) => s.split(/\s+/).filter(Boolean).length

export function readProject(body: ProjectBody): Project {
  const parts = new Map<string, string>()
  const titles = new Map<string, string>()
  let total = 0
  for (const p of (body.partes ?? []).slice(0, MAX_PARTS)) {
    const id = str(p.id, 80)
    const text = str(p.texto, MAX_PART)
    if (!id || !text || total + text.length > MAX_TOTAL) continue
    parts.set(id, text)
    titles.set(id, str(p.titulo, 200) || id)
    total += text.length
  }
  const document = [...parts].map(([id, text]) => `<<campo id="${id}" titulo="${titles.get(id)}">>\n${text}`).join('\n\n')
  return { parts, titles, document }
}

export type Finding = { campo: string; trecho: string; sugestao: string } & Record<string, string>

/** Mantém só os trechos que existem de fato no campo indicado, para a correção poder ser aplicada. */
export function findings(raw: unknown, parts: Map<string, string>, extra: string[]): Finding[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      const r = (item ?? {}) as Record<string, unknown>
      const out: Record<string, string> = {
        campo: str(r.campo, 80),
        trecho: str(r.trecho, 1500),
        sugestao: str(r.sugestao, 2500),
      }
      for (const key of extra) out[key] = str(r[key], 600)
      return out as Finding
    })
    .filter((f) => f.trecho && f.sugestao && collapse(parts.get(f.campo) ?? '').includes(collapse(f.trecho)))
}

export const level = (percent: number) => (percent <= 5 ? 'baixo' : percent <= 15 ? 'moderado' : 'alto')
