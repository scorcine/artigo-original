import { useState } from 'react'
import type { Field, StudyType, Values } from './data/types'
import {
  brToIso,
  datedSchedule,
  formatSchedule,
  isoToBr,
  parseSchedule,
  scheduleWarnings,
  todayIso,
  type ScheduleRow,
} from './lib/cronograma'
import { studyContext, suggestSchedule } from './lib/ia'

const EMPTY_ROW: ScheduleRow = { etapa: '', inicio: '', fim: '' }

interface Proposal {
  rows: ScheduleRow[]
  notes: string[]
}

export function ScheduleTable({
  field,
  values,
  type,
  onChange,
}: {
  field: Field
  values: Values
  type: StudyType | null
  onChange: (id: string, value: string) => void
}) {
  const value = values[field.id] ?? ''
  const [rows, setRows] = useState<ScheduleRow[]>(() => withBlank(parseSchedule(value)))
  const [synced, setSynced] = useState(value)
  const [submission, setSubmission] = useState(todayIso)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [undo, setUndo] = useState<string | null>(null)

  if (value !== synced) {
    setSynced(value)
    if (formatSchedule(rows) !== value) setRows(withBlank(parseSchedule(value)))
  }

  const save = (next: ScheduleRow[]) => {
    setRows(withBlank(next))
    const text = formatSchedule(next)
    setSynced(text)
    onChange(field.id, text)
  }

  const edit = (index: number, change: Partial<ScheduleRow>) =>
    save(rows.map((r, i) => (i === index ? { ...r, ...change } : r)))

  const generate = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await suggestSchedule({ studyType: type?.name, context: studyContext(values, type, field.id) })
      setProposal({ rows: datedSchedule(data.etapas, submission), notes: data.pendencias })
    } catch (e) {
      setProposal(null)
      setError(e instanceof Error ? e.message : 'Não foi possível montar o cronograma agora.')
    } finally {
      setLoading(false)
    }
  }

  const accept = () => {
    if (!proposal) return
    if (value.trim() && !window.confirm('Substituir o cronograma atual por este?')) return
    setUndo(value)
    save(proposal.rows)
    setProposal(null)
  }

  const warnings = scheduleWarnings(rows)

  return (
    <div className="schedule">
      <table className="schedule-table">
        <thead>
          <tr>
            <th>Identificação da etapa</th>
            <th>Início</th>
            <th>Término</th>
            <th aria-label="Remover" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td>
                <textarea
                  rows={1}
                  aria-label={`Etapa ${i + 1}`}
                  placeholder={i === rows.length - 1 ? 'Nova etapa…' : ''}
                  value={row.etapa}
                  onChange={(e) => edit(i, { etapa: e.target.value.replace(/[\r\n|]+/g, ' ') })}
                />
              </td>
              <td>
                <input
                  type="date"
                  aria-label={`Início da etapa ${i + 1}`}
                  value={brToIso(row.inicio)}
                  onChange={(e) => edit(i, { inicio: isoToBr(e.target.value) })}
                />
              </td>
              <td>
                <input
                  type="date"
                  aria-label={`Término da etapa ${i + 1}`}
                  value={brToIso(row.fim)}
                  min={brToIso(row.inicio) || undefined}
                  onChange={(e) => edit(i, { fim: isoToBr(e.target.value) })}
                />
              </td>
              <td>
                {i < rows.length - 1 && (
                  <button
                    type="button"
                    className="link"
                    aria-label={`Remover etapa ${i + 1}`}
                    onClick={() => save(rows.filter((_, j) => j !== i))}
                  >
                    Remover
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {warnings.length > 0 && (
        <ul className="schedule-warnings">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      <div className="schedule-ai">
        <label className="calc-input">
          <span>Data prevista de submissão na Plataforma Brasil</span>
          <input type="date" value={submission} onChange={(e) => setSubmission(e.target.value)} />
          <span className="calc-help">As datas das etapas são contadas a partir dela.</span>
        </label>
        <div className="text-review-actions">
          <button type="button" className="suggest" onClick={generate} disabled={loading || !submission}>
            {loading ? 'Montando o cronograma…' : 'Gerar etapas com IA (a partir da metodologia)'}
          </button>
          {undo !== null && (
            <button
              type="button"
              className="link"
              onClick={() => {
                onChange(field.id, undo)
                setUndo(null)
              }}
            >
              Desfazer
            </button>
          )}
        </div>
      </div>
      {error && <p className="suggest-error">{error}</p>}

      {proposal && (
        <div className="review-box">
          <p className="review-heading">Cronograma proposto</p>
          <table className="schedule-table preview">
            <thead>
              <tr>
                <th>Identificação da etapa</th>
                <th>Início</th>
                <th>Término</th>
              </tr>
            </thead>
            <tbody>
              {proposal.rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.etapa}</td>
                  <td>{r.inicio}</td>
                  <td>{r.fim}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {proposal.notes.length > 0 && (
            <>
              <p className="review-heading">Você precisa confirmar</p>
              <ul>
                {proposal.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </>
          )}
          <p className="help">
            As etapas com participantes começam só depois do prazo previsto para a aprovação do CEP. Ajuste as datas na tabela
            se precisar.
          </p>
          <div className="text-review-actions">
            <button type="button" onClick={accept}>
              Usar este cronograma
            </button>
            <button type="button" className="secondary" onClick={() => setProposal(null)}>
              Descartar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function withBlank(rows: ScheduleRow[]): ScheduleRow[] {
  const last = rows[rows.length - 1]
  return !last || last.etapa || last.inicio || last.fim ? [...rows, EMPTY_ROW] : rows
}
