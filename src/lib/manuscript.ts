import { getStepFields, STEPS, type StepId } from '../data/steps'
import type { Field, StudyType } from '../data/types'

export interface Block {
  heading?: string
  label?: string
  text: string
}

export interface Section {
  title: string
  blocks: Block[]
}

export interface Manuscript {
  title: string
  front: Block[]
  sections: Section[]
}

const SECTION_TITLES: Partial<Record<StepId, string>> = {
  resumo: 'Resumo',
  introducao: 'Introdução',
  metodos: 'Métodos',
  resultados: 'Resultados',
  discussao: 'Discussão',
  conclusao: 'Conclusão',
}

function toBlock(field: Field, values: Record<string, string>): Block | null {
  const text = (values[field.id] ?? '').trim()
  if (!text) return null
  return { heading: field.heading, label: field.inlineLabel, text }
}

export function buildManuscript(type: StudyType | null, values: Record<string, string>): Manuscript {
  const title = (values.titulo ?? '').trim()
  const front = getStepFields('identificacao', type)
    .filter((f) => f.id !== 'titulo')
    .map((f) => toBlock(f, values))
    .filter((b): b is Block => b !== null)

  const sections: Section[] = []
  const atEnd: Block[] = []

  for (const step of STEPS) {
    const sectionTitle = SECTION_TITLES[step.id]
    const fields = getStepFields(step.id, type)

    if (sectionTitle) {
      const blocks: Block[] = []
      for (const field of fields) {
        const block = toBlock(field, values)
        if (!block) continue
        if (field.atEnd) atEnd.push({ text: block.text })
        else blocks.push(block)
      }
      if (blocks.length) sections.push({ title: sectionTitle, blocks })
    } else if (step.id === 'finais') {
      for (const field of fields) {
        const block = toBlock(field, values)
        if (block) sections.push({ title: field.heading ?? field.label, blocks: [{ text: block.text }] })
      }
    }
  }

  if (atEnd.length) sections.push({ title: 'Tabelas e figuras', blocks: atEnd })

  return { title, front, sections }
}

export function lines(text: string): string[] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
}

export function countWords(m: Manuscript): number {
  const all = [m.title, ...m.front.map((b) => b.text), ...m.sections.flatMap((s) => s.blocks.map((b) => b.text))]
  return all.join(' ').split(/\s+/).filter(Boolean).length
}

export function toMarkdown(m: Manuscript): string {
  const out: string[] = [`# ${m.title || 'Sem título'}`, '']
  for (const b of m.front) {
    out.push(...lines(b.text).map((l, i) => (i === 0 && b.label ? `**${b.label}:** ${l}` : l)), '')
  }
  for (const s of m.sections) {
    out.push(`## ${s.title}`, '')
    for (const b of s.blocks) {
      if (b.heading) out.push(`### ${b.heading}`, '')
      for (const [i, l] of lines(b.text).entries()) {
        out.push(i === 0 && b.label ? `**${b.label}:** ${l}` : l, '')
      }
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function wrapHtmlDocument(title: string, body: string): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.5; }
h1 { font-size: 14pt; text-align: center; }
h2 { font-size: 12pt; text-transform: uppercase; margin-top: 18pt; }
h3 { font-size: 12pt; font-style: italic; }
p { margin: 0 0 6pt; text-align: justify; }
</style>
</head>
<body>
${body}
</body>
</html>
`
}

export function blockHtml(b: Block): string {
  return lines(b.text)
    .map((l, i) => `<p>${i === 0 && b.label ? `<b>${escapeHtml(b.label)}:</b> ` : ''}${escapeHtml(l)}</p>`)
    .join('\n')
}

export function toHtmlDocument(m: Manuscript): string {
  const body: string[] = [`<h1>${escapeHtml(m.title || 'Sem título')}</h1>`]
  for (const b of m.front) body.push(blockHtml(b))
  for (const s of m.sections) {
    body.push(`<h2>${escapeHtml(s.title)}</h2>`)
    for (const b of s.blocks) {
      if (b.heading) body.push(`<h3>${escapeHtml(b.heading)}</h3>`)
      body.push(blockHtml(b))
    }
  }
  return wrapHtmlDocument(m.title || 'Manuscrito', body.join('\n'))
}
