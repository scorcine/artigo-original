import { useState, type ReactNode } from 'react'
import { STEPS, visibleFields } from './data/steps'
import type { Phase, StudyType, Values } from './data/types'
import {
  analyzeQuality,
  checkPlagiarism,
  fixProblem,
  type PlagiarismCheck,
  type ProblemFix,
  type ProjectText,
  type QualityAnalysis,
  type QualityProblem,
  type SimilarityLevel,
} from './lib/ia'
import { lines } from './lib/manuscript'

/** Campos que não são texto corrido: dados de contato, listas de referências, tabelas e valores. */
const SKIP = new Set([
  'pb_bibliografia',
  'fin_referencias',
  'pb_orcamento',
  'tcle_contato_pesquisador',
  'tcle_contato_cep',
  'autores',
  'afiliacoes',
  'correspondente',
  'fin_agradecimentos',
  'fin_contribuicoes',
])

const MIN_TEXT_FIELD = 30

interface Part {
  id: string
  titulo: string
  texto: string
}

function projectParts(phase: Phase, type: StudyType | null, values: Values): Part[] {
  const parts: Part[] = []
  for (const step of STEPS.filter((s) => s.phase === phase)) {
    for (const field of visibleFields(step.id, type, values)) {
      const text = (values[field.id] ?? '').trim()
      if (!text || SKIP.has(field.id) || field.schedule || field.kind === 'check' || field.kind === 'choice') continue
      if (field.kind === 'text' && text.length < MIN_TEXT_FIELD) continue
      parts.push({ id: field.id, titulo: `${step.title} › ${field.label}`, texto: text })
    }
  }
  return parts
}

interface PanelProps {
  phase: Phase
  type: StudyType | null
  values: Values
  onChange: (id: string, value: string) => void
}

type Saved<T> = T & { data: string }

function readSaved<T>(raw: string | undefined): Saved<T> | null {
  try {
    return raw ? (JSON.parse(raw) as Saved<T>) : null
  } catch {
    return null
  }
}

function projectText(phase: Phase, type: StudyType | null, values: Values): ProjectText {
  return {
    fase: phase,
    studyType: type?.name,
    guideline: type?.guideline,
    partes: projectParts(phase, type, values),
    referencias: lines(values[phase === 1 ? 'pb_bibliografia' : 'fin_referencias'] ?? ''),
  }
}

/** Busca, guarda no rascunho e devolve o último resultado salvo. */
function useSavedRun<T>(storeId: string, { phase, type, values, onChange }: PanelProps, call: (r: ProjectText) => Promise<T>) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const parts = projectParts(phase, type, values)
  const run = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await call(projectText(phase, type, values))
      onChange(storeId, JSON.stringify({ ...result, data: new Date().toLocaleString('pt-BR') }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível concluir agora.')
    } finally {
      setLoading(false)
    }
  }
  return { loading, error, parts, run, saved: readSaved<T>(values[storeId]) }
}

/** Botão que troca o trecho pela sugestão no campo, ou desfaz a troca. */
function FixButton({
  values,
  onChange,
  campo,
  trecho,
  sugestao,
}: {
  values: Values
  onChange: (id: string, value: string) => void
  campo: string
  trecho: string
  sugestao: string
}) {
  const current = values[campo] ?? ''
  if (!sugestao) return null
  if (current.includes(trecho)) {
    return (
      <button type="button" onClick={() => onChange(campo, current.replace(trecho, sugestao))}>
        Aplicar no texto
      </button>
    )
  }
  if (current.includes(sugestao)) {
    return (
      <span className="analysis-applied">
        Aplicada.{' '}
        <button type="button" className="link" onClick={() => onChange(campo, current.replace(sugestao, trecho))}>
          Desfazer
        </button>
      </span>
    )
  }
  return <span className="help">O trecho já foi alterado no texto.</span>
}

function PanelHeader({
  title,
  description,
  what,
  label,
  loading,
  error,
  savedAt,
  disabled,
  loadingText,
  onRun,
}: {
  title: string
  description: ReactNode
  what: string
  label: string
  loading: boolean
  error: string
  savedAt?: string
  disabled: boolean
  loadingText: string
  onRun: () => void
}) {
  return (
    <>
      <h3>{title}</h3>
      <p className="help">{description}</p>
      <div className="text-review-actions">
        <button type="button" className="suggest strong" onClick={onRun} disabled={loading || disabled}>
          {loading ? 'Analisando…' : savedAt ? 'Analisar de novo' : label}
        </button>
        {savedAt && !loading && <span className="help">Última análise: {savedAt}</span>}
      </div>
      {disabled && <p className="help">Preencha o {what} antes de pedir a análise.</p>}
      {loading && <p className="help">{loadingText}</p>}
      {error && <p className="suggest-error">{error}</p>}
    </>
  )
}

const scoreClass = (n: number) => (n >= 8 ? 'good' : n >= 6 ? 'fair' : 'poor')

function ProblemCard({
  problem,
  titles,
  request,
  values,
  onChange,
  onResolved,
}: {
  problem: QualityProblem
  titles: Map<string, string>
  request: () => ProjectText
  values: Values
  onChange: (id: string, value: string) => void
  onResolved: (choice: string | undefined) => void
}) {
  const [choice, setChoice] = useState<number | 'outra' | null>(null)
  const [custom, setCustom] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fix, setFix] = useState<ProblemFix | null>(null)
  const [undo, setUndo] = useState<Record<string, string> | null>(null)

  const chosen =
    choice === 'outra'
      ? custom.trim()
      : choice !== null
        ? `${problem.opcoes[choice].rotulo}. ${problem.opcoes[choice].efeito}`
        : ''
  const label = choice === 'outra' ? custom.trim() : choice !== null ? problem.opcoes[choice].rotulo : ''

  const run = async () => {
    setLoading(true)
    setError('')
    setFix(null)
    try {
      const { criterio, problema, campos } = problem
      setFix(await fixProblem({ ...request(), problema: { criterio, problema, campos }, escolha: chosen }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível aplicar a correção agora.')
    } finally {
      setLoading(false)
    }
  }

  const apply = () => {
    if (!fix) return
    const previous: Record<string, string> = {}
    for (const c of fix.alteracoes) {
      previous[c.campo] = values[c.campo] ?? ''
      onChange(c.campo, c.texto)
    }
    setUndo(previous)
    setFix(null)
    onResolved(label)
  }

  const revert = () => {
    if (!undo) return
    for (const [campo, text] of Object.entries(undo)) onChange(campo, text)
    setUndo(null)
    onResolved(undefined)
  }

  return (
    <div className={`analysis-item problem${problem.resolvido ? ' resolved' : ''}`}>
      <p className="analysis-where">
        {problem.criterio} · {problem.campos.map((c) => titles.get(c)?.split(' › ').pop() ?? c).join(', ')}
      </p>
      <p>{problem.problema}</p>

      {problem.resolvido ? (
        <p className="analysis-applied">
          Corrigido: {problem.resolvido}.{' '}
          {undo && (
            <button type="button" className="link" onClick={revert}>
              Desfazer
            </button>
          )}
        </p>
      ) : (
        <>
          <p className="review-heading">Como você quer corrigir?</p>
          <div className="problem-options" role="radiogroup" aria-label="Forma de correção">
            {problem.opcoes.map((o, i) => (
              <button
                key={o.rotulo}
                type="button"
                role="radio"
                aria-checked={choice === i}
                className={`problem-option${choice === i ? ' selected' : ''}`}
                onClick={() => setChoice(i)}
              >
                <strong>{o.rotulo}</strong>
                {o.efeito && <span>{o.efeito}</span>}
              </button>
            ))}
            <button
              type="button"
              role="radio"
              aria-checked={choice === 'outra'}
              className={`problem-option${choice === 'outra' ? ' selected' : ''}`}
              onClick={() => setChoice('outra')}
            >
              <strong>Outra forma</strong>
              <span>Descreva como você quer corrigir.</span>
            </button>
          </div>
          {choice === 'outra' && (
            <textarea
              rows={2}
              value={custom}
              placeholder="Ex.: manter a tirzepatida como variável de estratificação e tirar os agonistas de GLP-1 dos critérios de exclusão."
              onChange={(e) => setCustom(e.target.value)}
            />
          )}
          <div className="text-review-actions">
            <button type="button" onClick={run} disabled={!chosen || loading}>
              {loading ? 'Corrigindo…' : 'Corrigir automaticamente'}
            </button>
          </div>
          {error && <p className="suggest-error">{error}</p>}
        </>
      )}

      {fix && (
        <div className="problem-fix">
          {fix.resumo && <p>{fix.resumo}</p>}
          {fix.alteracoes.map((c) => (
            <div key={c.campo} className="problem-change">
              <p className="analysis-where">{titles.get(c.campo) ?? c.campo}</p>
              <details>
                <summary>Ver texto atual</summary>
                <p className="analysis-old">{values[c.campo]}</p>
              </details>
              <p className="analysis-new">{c.texto}</p>
            </div>
          ))}
          {fix.pendencias.length > 0 && (
            <>
              <p className="review-heading">Você ainda precisa conferir</p>
              <ul>
                {fix.pendencias.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </>
          )}
          <div className="text-review-actions">
            <button type="button" onClick={apply}>
              Aplicar no texto
            </button>
            <button type="button" className="link" onClick={() => setFix(null)}>
              Descartar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function QualityPanel(props: PanelProps) {
  const { phase, type, values, onChange } = props
  const what = phase === 1 ? 'projeto' : 'artigo'
  const storeId = `qualidade_fase${phase}`
  const { loading, error, parts, run, saved } = useSavedRun<QualityAnalysis>(storeId, props, analyzeQuality)
  const titles = new Map(parts.map((p) => [p.id, p.titulo]))
  const problems = saved?.problemas ?? []

  const markResolved = (index: number, choice: string | undefined) => {
    if (!saved) return
    const problemas = problems.map((p, i) => (i === index ? { ...p, resolvido: choice } : p))
    onChange(storeId, JSON.stringify({ ...saved, problemas }))
  }

  return (
    <section className="analysis">
      <PanelHeader
        title="Análise da qualidade do texto"
        description={`A IA lê todo o ${what}, dá uma nota de 0 a 10 para cada critério de qualidade e aponta correções que podem ser aplicadas direto no texto. Leva cerca de 1 minuto.`}
        what={what}
        label="Analisar a qualidade do texto"
        loading={loading}
        error={error}
        savedAt={saved?.data}
        disabled={parts.length === 0}
        loadingText={`Lendo o ${what}…`}
        onRun={run}
      />
      {saved && (
        <>
          <div className="analysis-summary">
            <div className={`analysis-score ${scoreClass(saved.nota)}`}>
              <span className="analysis-big">{saved.nota.toLocaleString('pt-BR')}</span>
              <span>Nota geral (0 a 10)</span>
            </div>
          </div>
          <ul className="analysis-criteria">
            {saved.criterios.map((c) => (
              <li key={c.nome}>
                <span className={`analysis-pill ${scoreClass(c.nota)}`}>{c.nota.toLocaleString('pt-BR')}</span>
                <span>
                  <strong>{c.nome}.</strong> {c.comentario}
                </span>
              </li>
            ))}
          </ul>
          {saved.pontosFortes.length > 0 && (
            <>
              <h4>Pontos fortes</h4>
              <ul className="analysis-strengths">
                {saved.pontosFortes.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </>
          )}
          {problems.length > 0 && (
            <>
              <h4>Problemas para corrigir ({problems.filter((p) => !p.resolvido).length})</h4>
              <p className="help">
                Escolha como quer corrigir cada um. A IA reescreve os campos envolvidos e mostra o resultado antes de mudar
                qualquer coisa.
              </p>
              {problems.map((p, i) => (
                <ProblemCard
                  key={`${i}-${p.problema}`}
                  problem={p}
                  titles={titles}
                  request={() => projectText(phase, type, values)}
                  values={values}
                  onChange={onChange}
                  onResolved={(choice) => markResolved(i, choice)}
                />
              ))}
            </>
          )}

          <h4>Correções pontuais ({saved.correcoes.length})</h4>
          {saved.correcoes.length === 0 && <p className="help">Nenhuma correção importante encontrada.</p>}
          {saved.correcoes.map((c, i) => (
            <div key={i} className="analysis-item">
              <p className="analysis-where">{titles.get(c.campo) ?? c.campo}</p>
              <p>
                <strong>Problema:</strong> {c.problema}
              </p>
              <p className="analysis-old">{c.trecho}</p>
              <p className="analysis-new">{c.sugestao}</p>
              <FixButton values={values} onChange={onChange} {...c} />
            </div>
          ))}
        </>
      )}
    </section>
  )
}

const LEVEL_LABELS: Record<SimilarityLevel, string> = { baixo: 'Baixa', moderado: 'Moderada', alto: 'Alta' }

const LEVEL_TEXT: Record<SimilarityLevel, string> = {
  baixo: 'Poucos ou nenhum trecho parecido demais.',
  moderado: 'Há trechos parecidos demais: reescreva os apontados abaixo.',
  alto: 'Boa parte do texto segue de perto outras fontes: reescreva os trechos antes de submeter.',
}

function LevelCard({ title, level, percent, note }: { title: string; level?: SimilarityLevel; percent?: number; note: string }) {
  return (
    <div className={`analysis-score ${level ? `level-${level}` : ''}`}>
      <span className="analysis-big">{level ? LEVEL_LABELS[level] : 'Não verificado'}</span>
      <span>
        {title}
        {level && percent !== undefined && ` (cerca de ${percent.toLocaleString('pt-BR')}% do texto)`}
      </span>
      <span className="help">{note}</span>
    </div>
  )
}

export function PlagiarismPanel(props: PanelProps) {
  const { phase, values, onChange } = props
  const what = phase === 1 ? 'projeto' : 'artigo'
  const { loading, error, parts, run, saved } = useSavedRun<PlagiarismCheck>(`plagio_fase${phase}`, props, checkPlagiarism)
  const titles = new Map(parts.map((p) => [p.id, p.titulo]))
  const web = saved?.internet
  const cited = saved?.citadas

  return (
    <section className="analysis">
      <PanelHeader
        title="Verificação de plágio"
        description={
          <>
            Duas verificações: <strong>na internet</strong> (a IA pesquisa no Google frases do texto e o site confere se elas
            aparecem nas páginas encontradas) e <strong>nos artigos citados</strong> (compara com os resumos do PubMed, inclusive
            traduções ao pé da letra). Leva de 1 a 2 minutos.
          </>
        }
        what={what}
        label="Verificar plágio"
        loading={loading}
        error={error}
        savedAt={saved?.data}
        disabled={parts.length === 0}
        loadingText="Pesquisando na internet e comparando com os artigos citados…"
        onRun={run}
      />
      {saved && web && cited && (
        <>
          <div className="analysis-summary">
            <LevelCard
              title="Semelhança com a internet"
              level={web.status === 'ok' ? web.nivel : undefined}
              percent={web.status === 'ok' ? web.percentual : undefined}
              note={
                web.status === 'ok'
                  ? `${web.frasesPesquisadas} frases pesquisadas, ${web.paginasVerificadas} páginas conferidas.`
                  : web.status === 'erro'
                    ? 'A pesquisa na internet falhou desta vez. Tente de novo.'
                    : web.status === 'sem_cota'
                      ? 'A pesquisa no Google exige o plano pago da IA do Google (faturamento ativado no Google AI Studio). Enquanto isso, use o CopySpider abaixo.'
                      : 'Disponível só com a IA do Google (Gemini).'
              }
            />
            <LevelCard
              title="Semelhança com os artigos citados"
              level={cited.status === 'ok' ? cited.nivel : undefined}
              percent={cited.status === 'ok' ? cited.percentual : undefined}
              note={
                cited.status === 'ok'
                  ? `${cited.fontesComparadas} de ${cited.referencias} referências comparadas.`
                  : cited.status === 'erro'
                    ? 'A comparação falhou desta vez. Tente de novo.'
                    : 'Nenhuma referência com DOI encontrada no PubMed.'
              }
            />
          </div>

          {web.status === 'ok' && (
            <>
              <h4>Trechos encontrados na internet</h4>
              <p className="help">{LEVEL_TEXT[web.nivel]}</p>
              {web.trechos.map((t, i) => (
                <div key={i} className="analysis-item">
                  <p className="analysis-where">
                    {titles.get(t.campo) ?? t.campo} · {t.semelhanca}% igual
                  </p>
                  <p className="analysis-old">{t.trecho}</p>
                  <p className="help">
                    Encontrado em:{' '}
                    <a href={t.url} target="_blank" rel="noreferrer">
                      {t.titulo || t.url}
                    </a>
                  </p>
                  {t.sugestao && <p className="analysis-new">{t.sugestao}</p>}
                  <FixButton values={values} onChange={onChange} {...t} />
                </div>
              ))}
            </>
          )}

          {cited.status === 'ok' && (
            <>
              <h4>Trechos parecidos com os artigos citados</h4>
              <p className="help">{LEVEL_TEXT[cited.nivel]}</p>
              {cited.trechos.map((t, i) => (
                <div key={i} className="analysis-item">
                  <p className="analysis-where">
                    {titles.get(t.campo) ?? t.campo} · {t.tipo}
                  </p>
                  <p className="analysis-old">{t.trecho}</p>
                  {t.fonte && <p className="help">Parecido com: {t.fonte}</p>}
                  <p className="analysis-new">{t.sugestao}</p>
                  <FixButton values={values} onChange={onChange} {...t} />
                </div>
              ))}
            </>
          )}

          <div className="notice warning">
            A pesquisa na internet confere uma amostra de frases e só lê páginas abertas (não lê PDFs nem bases fechadas). Para
            a verificação completa, use também o CopySpider, logo abaixo.
          </div>
        </>
      )}

      <CopySpider phase={phase} parts={parts} values={values} onChange={onChange} />
    </section>
  )
}

const COPYSPIDER_LEVELS = ['Baixa', 'Moderada', 'Alta']

function CopySpider({
  phase,
  parts,
  values,
  onChange,
}: {
  phase: Phase
  parts: Part[]
  values: Values
  onChange: (id: string, value: string) => void
}) {
  const storeId = `copyspider_fase${phase}`
  let record: { nivel?: string; indice?: string; data?: string } = {}
  try {
    record = JSON.parse(values[storeId] ?? '{}')
  } catch {
    record = {}
  }
  const save = (change: typeof record) =>
    onChange(storeId, JSON.stringify({ ...record, ...change, data: new Date().toLocaleDateString('pt-BR') }))

  const downloadText = () => {
    const text = parts.map((p) => `${p.titulo.split(' › ').pop()}\n\n${p.texto}`).join('\n\n\n')
    const url = URL.createObjectURL(new Blob(['\ufeff', text], { type: 'text/plain;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = phase === 1 ? 'projeto-para-copyspider.txt' : 'artigo-para-copyspider.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="copyspider">
      <h4>Verificação completa com o CopySpider</h4>
      <p className="help">
        O CopySpider é um programa gratuito, instalado no computador, que compara o texto com documentos da
        internet. Ele não pode ser aberto dentro do site, mas o arquivo para ele sai daqui, e o resultado fica registrado aqui.
      </p>
      <ol className="copyspider-steps">
        <li>
          <button type="button" className="suggest" onClick={downloadText} disabled={parts.length === 0}>
            Baixar o texto para o CopySpider (.txt)
          </button>{' '}
          <span className="help">Só o texto, sem a lista de referências, que o programa contaria como semelhança.</span>
        </li>
        <li>
          Se ainda não tem o programa,{' '}
          <a href="https://copyspider.com.br/main/" target="_blank" rel="noreferrer">
            baixe o CopySpider
          </a>{' '}
          e cadastre seu e-mail no site dele.
        </li>
        <li>
          Abra o programa, informe o e-mail, escolha o modo <strong>Busca em arquivos da internet</strong>, clique em{' '}
          <strong>Ad. arquivo</strong>, selecione o arquivo baixado e clique em <strong>Iniciar</strong>.
        </li>
        <li>
          Ao terminar, abra o relatório. Trechos marcados que sejam citações com referência estão corretos; reescreva os que
          forem cópia sem citação.
        </li>
        <li>Registre o resultado:</li>
      </ol>
      <div className="copyspider-result">
        <div className="calc-input">
          <span>Semelhança indicada pelo CopySpider</span>
          <div className="choices small">
            {COPYSPIDER_LEVELS.map((level) => (
              <button
                key={level}
                type="button"
                className={`choice${record.nivel === level ? ' selected' : ''}`}
                onClick={() => save({ nivel: level })}
              >
                {level}
              </button>
            ))}
          </div>
        </div>
        <label className="calc-input">
          <span>Índice de similaridade (Si)</span>
          <span className="calc-value">
            <input type="text" inputMode="decimal" value={record.indice ?? ''} onChange={(e) => save({ indice: e.target.value })} />
            <span className="calc-suffix">%</span>
          </span>
        </label>
      </div>
      {record.nivel && (
        <p className={`copyspider-verdict ${record.nivel.toLowerCase()}`}>
          {record.nivel === 'Baixa'
            ? 'Semelhança baixa (menos de 10%): em geral, sem problemas. Confira mesmo assim os trechos agrupados.'
            : record.nivel === 'Moderada'
              ? 'Semelhança moderada (10% a 30%): veja no relatório se os trechos são citações com referência; reescreva os que não forem.'
              : 'Semelhança alta (30% ou mais): reescreva os trechos apontados antes de submeter e rode a verificação de novo.'}
          {record.data && ` Registrado em ${record.data}.`}
        </p>
      )}
    </div>
  )
}
