export interface ScheduleRow {
  etapa: string
  inicio: string
  fim: string
}

export interface ProposedStage {
  etapa: string
  inicioSemana: number
  duracaoSemanas: number
}

const SEPARATOR = ' | '
const BR_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** O campo guarda uma etapa por linha, no formato "Etapa | DD/MM/AAAA | DD/MM/AAAA". */
export function parseSchedule(text: string): ScheduleRow[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [etapa = '', inicio = '', fim = ''] = line.split('|').map((p) => p.trim())
      return { etapa, inicio, fim }
    })
}

export function formatSchedule(rows: ScheduleRow[]): string {
  return rows
    .filter((r) => r.etapa.trim() || r.inicio || r.fim)
    .map((r) => [r.etapa.trim(), r.inicio, r.fim].join(SEPARATOR))
    .join('\n')
}

export function brToIso(date: string): string {
  const m = BR_DATE.exec(date)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : ''
}

export function isoToBr(date: string): string {
  const m = ISO_DATE.exec(date)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}

const toUtc = (iso: string) => {
  const m = ISO_DATE.exec(iso)
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : NaN
}

const DAY = 24 * 60 * 60 * 1000

const utcToBr = (time: number) => isoToBr(new Date(time).toISOString().slice(0, 10))

export function todayIso(): string {
  const now = new Date()
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())).toISOString().slice(0, 10)
}

/** Converte as etapas propostas pela IA (em semanas a partir da submissão) em datas. */
export function datedSchedule(stages: ProposedStage[], submissionIso: string): ScheduleRow[] {
  const start = toUtc(submissionIso)
  if (Number.isNaN(start)) return []
  return stages.map((s) => {
    const begin = start + s.inicioSemana * 7 * DAY
    return { etapa: s.etapa, inicio: utcToBr(begin), fim: utcToBr(begin + (s.duracaoSemanas * 7 - 1) * DAY) }
  })
}

const PARTICIPANTS = /colet|recrut|inclus|entrevist|aplica|interven|seguimento|acompanhamento|exame|avalia[çc][ãa]o (cl[íi]nica|dos participantes)/i
const ETHICS = /\bCEP\b|[ée]tica|Plataforma Brasil/i

/** Problemas que fariam o CEP devolver o cronograma. */
export function scheduleWarnings(rows: ScheduleRow[]): string[] {
  const warnings: string[] = []
  const time = (br: string) => toUtc(brToIso(br))
  for (const r of rows) {
    if (!r.etapa.trim()) continue
    if (!r.inicio || !r.fim) warnings.push(`"${r.etapa}": falta a data de ${!r.inicio ? 'início' : 'término'}.`)
    else if (time(r.fim) < time(r.inicio)) warnings.push(`"${r.etapa}": o término está antes do início.`)
  }
  const ethicsEnd = Math.max(...rows.filter((r) => ETHICS.test(r.etapa) && r.fim).map((r) => time(r.fim)))
  if (Number.isFinite(ethicsEnd)) {
    for (const r of rows) {
      if (PARTICIPANTS.test(r.etapa) && !ETHICS.test(r.etapa) && r.inicio && time(r.inicio) <= ethicsEnd) {
        warnings.push(`"${r.etapa}" começa antes do fim da apreciação pelo CEP: a coleta só pode começar após a aprovação.`)
      }
    }
  }
  return warnings
}
