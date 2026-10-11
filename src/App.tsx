import { useEffect, useMemo, useState } from 'react'
import { STUDY_TYPES, getStudyType } from './data/studyTypes'
import { PHASE_TITLES, STEPS, missingFields, stepProgress, visibleFields } from './data/steps'
import type { Field, Phase, Step, StepId, StudyType, Values } from './data/types'
import { buildManuscript, countWords, lines, toHtmlDocument, toMarkdown } from './lib/manuscript'
import { SOURCES, buildProject, buildTcle } from './lib/phase1'
import { emptyDraft, loadDraft, saveDraft, type Draft } from './lib/storage'
import { draftText, reviewText, studyContext, suggestTitles, type TitleSuggestion } from './lib/ia'
import { hasNewVersion } from './lib/updates'

const UPDATE_CHECK_MS = 2 * 60 * 1000

function useNewVersion(): boolean {
  const [available, setAvailable] = useState(false)

  useEffect(() => {
    const check = async () => {
      if (await hasNewVersion()) {
        if (document.visibilityState === 'visible') setAvailable(true)
        else window.location.reload()
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        hasNewVersion().then((isNew) => isNew && window.location.reload())
      }
    }
    const timer = window.setInterval(check, UPDATE_CHECK_MS)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return available
}

const PHASES: Phase[] = [1, 2]

export default function App() {
  const [draft, setDraft] = useState<Draft>(loadDraft)
  const newVersion = useNewVersion()

  useEffect(() => {
    saveDraft(draft)
  }, [draft])

  const type = getStudyType(draft.typeId)
  const found = STEPS.findIndex((s) => s.id === draft.stepId)
  const stepIndex = found >= 0 ? found : 0
  const step = STEPS[stepIndex]
  const phaseSteps = STEPS.filter((s) => s.phase === step.phase)

  const goTo = (id: StepId) => {
    setDraft((d) => ({ ...d, stepId: id }))
    window.scrollTo({ top: 0 })
  }

  const setValue = (id: string, value: string) =>
    setDraft((d) => ({ ...d, values: { ...d.values, [id]: value } }))

  const chooseType = (typeId: string) => setDraft((d) => ({ ...d, typeId }))

  const reset = () => {
    if (window.confirm('Apagar o rascunho atual (Fase 1 e Fase 2) e começar de novo? Esta ação não pode ser desfeita.')) {
      setDraft(emptyDraft())
    }
  }

  const next = STEPS[stepIndex + 1]
  const nextLabel =
    next && next.phase !== step.phase ? `Ir para a ${PHASE_TITLES[next.phase].split(' · ')[0]}` : 'Avançar'
  const showTypePicker = step.id === 'tipo' || ((step.id === 'metodos' || step.id === 'resultados') && !type)

  return (
    <div className="app">
      {newVersion && (
        <div className="update-bar" role="status">
          Há uma versão nova do site. Seu rascunho continua salvo.
          <button type="button" onClick={() => window.location.reload()}>
            Atualizar agora
          </button>
        </div>
      )}
      <header className="topbar">
        <div>
          <h1>Artigo Original</h1>
          <p>
            Pesquisa com seres humanos na área da saúde, do Comitê de Ética ao manuscrito. O rascunho fica salvo apenas
            neste navegador.
          </p>
        </div>
        <div className="topbar-side">
          {type && <span className="type-badge">{type.name}</span>}
          <span className="version">Versão de {__BUILD_TIME__}</span>
        </div>
      </header>

      <div className="layout">
        <nav className="steps" aria-label="Etapas">
          {PHASES.map((phase) => (
            <div key={phase} className="phase-group">
              <p className="phase-title">{PHASE_TITLES[phase]}</p>
              <ol>
                {STEPS.filter((s) => s.phase === phase).map((s) => {
                  const { done, total } = stepProgress(s.id, type, draft.values)
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        className={s.id === step.id ? 'active' : ''}
                        onClick={() => goTo(s.id)}
                      >
                        <span className={`step-dot${total > 0 && done === total ? ' complete' : ''}`} />
                        <span className="step-title">{s.title}</span>
                        {total > 0 && (
                          <span className={`step-count${done === total ? ' complete' : ''}`}>
                            {done}/{total}
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ol>
            </div>
          ))}
        </nav>

        <main className="content">
          <p className="step-kicker">
            {PHASE_TITLES[step.phase]} · Etapa {phaseSteps.indexOf(step) + 1} de {phaseSteps.length}
          </p>
          <h2>{step.title}</h2>
          <p className="step-intro">{step.intro}</p>

          {showTypePicker && (
            <div className="field">
              {step.id !== 'tipo' && (
                <p className="help">Escolha o tipo de estudo para ver os campos desta etapa.</p>
              )}
              <TypePicker selected={draft.typeId} onChoose={chooseType} />
            </div>
          )}

          {step.phase === 1 && type?.ethicsNote && <div className="notice warning">{type.ethicsNote}</div>}

          {step.id === 'pb_area' && (
            <div className="notice">
              Para submeter o projeto, o pesquisador precisa estar cadastrado na{' '}
              <a href="https://plataformabrasil.saude.gov.br/" target="_blank" rel="noreferrer">
                Plataforma Brasil
              </a>
              .
            </div>
          )}

          {step.id === 'metodos' && type && (
            <div className="notice">
              Para <strong>{type.name.toLowerCase()}</strong>, a referência de relato é: {type.guideline}. As listas
              completas estão na{' '}
              <a href="https://www.equator-network.org/" target="_blank" rel="noreferrer">
                rede EQUATOR
              </a>
              .
            </div>
          )}

          {step.id === 'pb_tcle' && draft.values.pb_dispensa_tcle === 'Sim' && (
            <div className="notice">
              Você indicou que vai pedir a dispensa do TCLE, então não é preciso escrever o termo. A justificativa da
              dispensa fica na etapa "Outras informações".
            </div>
          )}

          {step.id !== 'revisao' && (
            <div className="fields">
              {visibleFields(step.id, type, draft.values).map((field) => (
                <FieldInput
                  key={field.id}
                  field={field}
                  values={draft.values}
                  type={type}
                  step={step}
                  onChange={setValue}
                />
              ))}
            </div>
          )}

          {step.id === 'pb_envio' && <Phase1Review type={type} values={draft.values} onGoTo={goTo} />}

          {step.id === 'revisao' && <Review type={type} values={draft.values} onGoTo={goTo} onReset={reset} />}

          <div className="pager">
            <button
              type="button"
              className="secondary"
              disabled={stepIndex === 0}
              onClick={() => goTo(STEPS[stepIndex - 1].id)}
            >
              Voltar
            </button>
            {next && (
              <button type="button" onClick={() => goTo(next.id)}>
                {nextLabel}
              </button>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

function TypePicker({ selected, onChoose }: { selected: string | null; onChoose: (id: string) => void }) {
  return (
    <div className="type-grid" role="radiogroup" aria-label="Tipo de estudo">
      {STUDY_TYPES.map((t) => (
        <button
          key={t.id}
          type="button"
          role="radio"
          aria-checked={selected === t.id}
          className={`type-card${selected === t.id ? ' selected' : ''}`}
          onClick={() => onChoose(t.id)}
        >
          <span className="type-name">{t.name}</span>
          <span className="type-desc">{t.description}</span>
          <span className="type-guideline">Relato: {t.guideline}</span>
        </button>
      ))}
    </div>
  )
}

function FieldInput({
  field,
  values,
  type,
  step,
  onChange,
}: {
  field: Field
  values: Values
  type: StudyType | null
  step: Step
  onChange: (id: string, value: string) => void
}) {
  const inputId = `campo-${field.id}`
  const value = values[field.id] ?? ''
  const source = SOURCES[field.id]
  const sourceText = source?.get(values) ?? ''
  const canImport = sourceText !== '' && sourceText !== value.trim()

  if (field.kind === 'check') {
    return (
      <label className="field check-field" htmlFor={inputId}>
        <input
          id={inputId}
          type="checkbox"
          checked={value === 'sim'}
          onChange={(e) => onChange(field.id, e.target.checked ? 'sim' : '')}
        />
        <span>
          <span className="check-label">
            {field.label}
            {field.optional && <span className="optional">opcional</span>}
          </span>
          {field.help && <span className="help">{field.help}</span>}
        </span>
      </label>
    )
  }

  return (
    <div className="field">
      <label htmlFor={field.kind === 'choice' ? undefined : inputId} id={`${inputId}-label`}>
        {field.label}
        {field.optional && <span className="optional">opcional</span>}
      </label>
      {field.help && <p className="help">{field.help}</p>}
      {field.example && (
        <details className="example">
          <summary>Ver exemplo</summary>
          <p>{field.example}</p>
        </details>
      )}
      {canImport && (
        <button
          type="button"
          className="import"
          onClick={() => {
            if (!value.trim() || window.confirm('Substituir o texto atual por este?')) onChange(field.id, sourceText)
          }}
        >
          Trazer de: {source.from}
        </button>
      )}
      {field.kind === 'choice' ? (
        <div className="choices" role="radiogroup" aria-labelledby={`${inputId}-label`}>
          {field.options?.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={value === option}
              className={`choice${value === option ? ' selected' : ''}`}
              onClick={() => onChange(field.id, option)}
            >
              {option}
            </button>
          ))}
        </div>
      ) : field.kind === 'text' ? (
        <input id={inputId} type="text" value={value} onChange={(e) => onChange(field.id, e.target.value)} />
      ) : (
        <>
          <textarea id={inputId} rows={field.rows ?? 4} value={value} onChange={(e) => onChange(field.id, e.target.value)} />
          <TextAssist field={field} value={value} values={values} type={type} step={step} onChange={onChange} />
        </>
      )}
      {field.suggestTitle && (
        <TitleSuggestions
          kind={field.suggestTitle}
          draft={value}
          values={values}
          studyTypeName={type?.name}
          onUse={(title) => onChange(field.id, title)}
        />
      )}
    </div>
  )
}

const MIN_REVIEW_CHARS = 40

/** Campos que dependem de dados reais (resultados, nomes, contatos, referências): a IA não escreve do zero. */
const NO_GENERATE = new Set([
  'pb_bibliografia',
  'fin_referencias',
  'tcle_contato_pesquisador',
  'tcle_contato_cep',
  'autores',
  'afiliacoes',
  'correspondente',
  'fin_agradecimentos',
  'fin_contribuicoes',
])

interface Suggestion {
  mode: 'gerar' | 'revisar'
  text: string
  notes: string[]
}

function TextAssist({
  field,
  value,
  values,
  type,
  step,
  onChange,
}: {
  field: Field
  value: string
  values: Values
  type: StudyType | null
  step: Step
  onChange: (id: string, value: string) => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null)
  const [previous, setPrevious] = useState<string | null>(null)

  const canReview = value.trim().length >= MIN_REVIEW_CHARS
  const canGenerate = !canReview && step.id !== 'resultados' && !NO_GENERATE.has(field.id)
  if (!canReview && !canGenerate && !suggestion && previous === null) return null

  const run = async (mode: Suggestion['mode']) => {
    setLoading(true)
    setError('')
    setPrevious(null)
    const request = {
      field: field.label,
      help: field.help,
      step: step.title,
      studyType: type?.name,
      guideline: type?.guideline,
      plainLanguage: field.id.startsWith('tcle_'),
    }
    try {
      if (mode === 'revisar') {
        const review = await reviewText({ ...request, text: value })
        setSuggestion({ mode, text: review.revisado, notes: review.observacoes })
      } else {
        const draft = await draftText({ ...request, example: field.example, context: studyContext(values, type, field.id) })
        setSuggestion({ mode, text: draft.texto, notes: draft.pendencias })
      }
    } catch (e) {
      setSuggestion(null)
      setError(e instanceof Error ? e.message : 'Não foi possível falar com a IA agora.')
    } finally {
      setLoading(false)
    }
  }

  const accept = () => {
    if (!suggestion) return
    setPrevious(value)
    onChange(field.id, suggestion.text)
    setSuggestion(null)
  }

  const generating = suggestion?.mode === 'gerar'

  return (
    <div className="text-review">
      <div className="text-review-actions">
        {canReview ? (
          <button type="button" className="suggest" onClick={() => run('revisar')} disabled={loading}>
            {loading ? 'Revisando…' : 'Revisar com IA'}
          </button>
        ) : (
          canGenerate && (
            <button type="button" className="suggest" onClick={() => run('gerar')} disabled={loading}>
              {loading ? 'Escrevendo rascunho…' : 'Gerar com IA'}
            </button>
          )
        )}
        {previous !== null && (
          <button
            type="button"
            className="link"
            onClick={() => {
              onChange(field.id, previous)
              setPrevious(null)
            }}
          >
            Desfazer
          </button>
        )}
      </div>
      {error && <p className="suggest-error">{error}</p>}
      {suggestion && (
        <div className="review-box">
          <p className="review-heading">{generating ? 'Rascunho gerado' : 'Texto revisado'}</p>
          <p className="review-text">{suggestion.text}</p>
          {suggestion.notes.length > 0 && (
            <>
              <p className="review-heading">{generating ? 'Você precisa completar ou decidir' : 'O que pode faltar'}</p>
              <ul>
                {suggestion.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </>
          )}
          <p className="help">
            {generating
              ? 'É um ponto de partida escrito com o que você já preencheu. Substitua cada [COMPLETAR: …] pela informação real do seu estudo e confira tudo antes de submeter.'
              : 'Confira se o sentido foi mantido. A IA não deve acrescentar dados nem referências: se aparecer algo que você não escreveu, não use.'}
          </p>
          <div className="text-review-actions">
            <button type="button" onClick={accept}>
              {generating ? 'Usar este rascunho' : 'Usar texto revisado'}
            </button>
            <button type="button" className="secondary" onClick={() => setSuggestion(null)}>
              Descartar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function TitleSuggestions({
  kind,
  draft,
  values,
  studyTypeName,
  onUse,
}: {
  kind: 'cientifico' | 'publico'
  draft: string
  values: Values
  studyTypeName: string | undefined
  onUse: (title: string) => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [suggestions, setSuggestions] = useState<TitleSuggestion[]>([])

  const run = async () => {
    setLoading(true)
    setError('')
    try {
      setSuggestions(await suggestTitles(kind, draft, values, studyTypeName))
    } catch (e) {
      setSuggestions([])
      setError(e instanceof Error ? e.message : 'Não foi possível gerar sugestões agora.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="title-suggestions">
      <button type="button" className="suggest" onClick={run} disabled={loading}>
        {loading ? 'Gerando sugestões…' : suggestions.length ? 'Gerar outras sugestões' : 'Sugerir títulos melhores'}
      </button>
      {error && <p className="suggest-error">{error}</p>}
      {suggestions.length > 0 && (
        <ul>
          {suggestions.map((s) => (
            <li key={s.titulo}>
              <div>
                <p className="suggest-title">{s.titulo}</p>
                {s.motivo && <p className="help">{s.motivo}</p>}
              </div>
              <button type="button" className="secondary" onClick={() => onUse(s.titulo)}>
                Usar este título
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function slugify(text: string, fallback: string): string {
  const slug = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
  return slug || fallback
}

function download(filename: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob(['\ufeff', content], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function MissingList({
  phase,
  type,
  values,
  onGoTo,
  doneMessage,
}: {
  phase: Phase
  type: StudyType | null
  values: Values
  onGoTo: (id: StepId) => void
  doneMessage: string
}) {
  const missing = STEPS.filter((s) => s.phase === phase)
    .map((s) => ({ step: s, fields: missingFields(s.id, type, values) }))
    .filter((m) => m.fields.length > 0)

  if (missing.length === 0) return <div className="notice success">{doneMessage}</div>

  return (
    <div className="missing">
      <h3>Ainda falta preencher</h3>
      <ul>
        {missing.map((m) => (
          <li key={m.step.id}>
            <button type="button" className="link" onClick={() => onGoTo(m.step.id)}>
              {m.step.title}
            </button>
            : {m.fields.map((f) => f.label).join(', ')}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Phase1Review({
  type,
  values,
  onGoTo,
}: {
  type: StudyType | null
  values: Values
  onGoTo: (id: StepId) => void
}) {
  const project = buildProject(type, values)
  const name = slugify(project.title, 'projeto')

  return (
    <div className="review phase-review">
      <h3>Revisão da Fase 1</h3>
      <MissingList
        phase={1}
        type={type}
        values={values}
        onGoTo={onGoTo}
        doneMessage="Tudo pronto para a submissão. Depois de enviar, anote acima o CAAE e, quando sair, o parecer."
      />
      <div className="actions">
        <button type="button" onClick={() => download(`projeto-${name}.doc`, project.html, 'application/msword')}>
          Baixar projeto detalhado (.doc)
        </button>
        {values.pb_dispensa_tcle !== 'Sim' && (
          <button
            type="button"
            className="secondary"
            onClick={() => download(`tcle-${name}.doc`, buildTcle(values), 'application/msword')}
          >
            Baixar TCLE (.doc)
          </button>
        )}
      </div>
      <p className="help">
        Os arquivos abrem no Word. Revise, ajuste ao modelo exigido pelo seu CEP, salve em PDF e anexe na plataforma.
        Trechos entre colchetes, como [preencher: ...], indicam o que ainda falta.
      </p>
    </div>
  )
}

function Review({
  type,
  values,
  onGoTo,
  onReset,
}: {
  type: StudyType | null
  values: Values
  onGoTo: (id: StepId) => void
  onReset: () => void
}) {
  const [copied, setCopied] = useState(false)
  const manuscript = useMemo(() => buildManuscript(type, values), [type, values])
  const words = countWords(manuscript)
  const name = slugify(manuscript.title, 'artigo-original')

  const copy = async () => {
    await navigator.clipboard.writeText(toMarkdown(manuscript))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="review">
      <div className="stats">
        <span>
          <strong>{words.toLocaleString('pt-BR')}</strong> palavras
        </span>
        {type?.wordLimit && <span className={words > type.wordLimit.max ? 'over' : ''}>{type.wordLimit.note}</span>}
      </div>

      <MissingList
        phase={2}
        type={type}
        values={values}
        onGoTo={onGoTo}
        doneMessage="Todas as partes obrigatórias do artigo estão preenchidas."
      />

      <div className="actions">
        <button type="button" onClick={() => download(`${name}.doc`, toHtmlDocument(manuscript), 'application/msword')}>
          Baixar para o Word (.doc)
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => download(`${name}.md`, toMarkdown(manuscript), 'text/markdown')}
        >
          Baixar texto (.md)
        </button>
        <button type="button" className="secondary" onClick={copy}>
          {copied ? 'Copiado' : 'Copiar texto'}
        </button>
        <button type="button" className="danger" onClick={onReset}>
          Começar de novo
        </button>
      </div>

      <article className="manuscript">
        <h1>{manuscript.title || 'Sem título'}</h1>
        {manuscript.front.map((b, i) => (
          <BlockView key={i} block={b} />
        ))}
        {manuscript.sections.map((s) => (
          <section key={s.title}>
            <h2>{s.title}</h2>
            {s.blocks.map((b, i) => (
              <BlockView key={i} block={b} />
            ))}
          </section>
        ))}
      </article>
    </div>
  )
}

function BlockView({ block }: { block: { heading?: string; label?: string; text: string } }) {
  return (
    <>
      {block.heading && <h3>{block.heading}</h3>}
      {lines(block.text).map((l, i) => (
        <p key={i}>
          {i === 0 && block.label && <strong>{block.label}: </strong>}
          {l}
        </p>
      ))}
    </>
  )
}
