import { PROPRIO } from '../data/plataformaBrasil'
import type { StudyType, Values } from '../data/types'
import { formatSchedule, parseSchedule } from './cronograma'
import { blockHtml, escapeHtml, wrapHtmlDocument, type Block, type Section } from './manuscript'

const get = (v: Values, id: string) => (v[id] ?? '').trim()

function joinLabeled(v: Values, parts: [string, string][]): string {
  return parts
    .map(([label, id]) => (get(v, id) ? `${label}: ${get(v, id)}` : ''))
    .filter(Boolean)
    .join('\n')
}

function financingText(v: Values): string {
  const tipo = get(v, 'pb_financiamento')
  if (!tipo) return ''
  if (tipo === PROPRIO) return 'Este estudo foi realizado com recursos próprios dos pesquisadores.'
  return get(v, 'pb_financiador')
}

function consentText(v: Values): string {
  if (v.pb_dispensa_tcle === 'Sim') {
    return 'A obtenção do Termo de Consentimento Livre e Esclarecido foi dispensada pelo Comitê de Ética, conforme justificativa apresentada.'
  }
  return 'Todos os participantes assinaram o Termo de Consentimento Livre e Esclarecido.'
}

function ethicsText(v: Values): string {
  const caae = get(v, 'pb_caae')
  if (!caae) return ''
  const cep = get(v, 'pb_cep') || 'Comitê de Ética em Pesquisa'
  const parecer = get(v, 'pb_parecer')
  return `O estudo foi aprovado pelo ${cep} (CAAE ${caae}${parecer ? `; parecer ${parecer}` : ''}). ${consentText(v)}`
}

const participants = (v: Values) =>
  joinLabeled(v, [
    ['Critérios de inclusão', 'pb_inclusao'],
    ['Critérios de exclusão', 'pb_exclusao'],
  ])

const outcomes = (v: Values) =>
  joinLabeled(v, [
    ['Desfecho primário', 'pb_desfecho_primario'],
    ['Desfechos secundários', 'pb_desfecho_secundario'],
  ])

export interface Source {
  from: string
  get: (v: Values) => string
}

const field = (id: string, from: string): Source => ({ from, get: (v) => get(v, id) })

/** Campos que podem ser preenchidos com o que já foi escrito em uma etapa anterior. */
export const SOURCES: Record<string, Source> = {
  tcle_riscos: field('pb_riscos', 'Riscos do projeto'),
  tcle_beneficios: field('pb_beneficios', 'Benefícios do projeto'),

  titulo: field('pb_titulo', 'Título principal (Fase 1)'),
  palavras_chave: field('pb_descritores', 'Descritores (Fase 1)'),
  resumo_objetivo: field('pb_objetivo_primario', 'Objetivo primário (Fase 1)'),
  intro_contexto: field('pb_introducao', 'Introdução do projeto (Fase 1)'),
  intro_objetivo: field('pb_objetivo_primario', 'Objetivo primário (Fase 1)'),
  intro_hipotese: field('pb_hipotese', 'Hipótese (Fase 1)'),
  met_desenho: field('pb_desenho', 'Desenho do estudo (Fase 1)'),
  met_analise: field('pb_analise', 'Análise de dados (Fase 1)'),
  cb_metodos: field('pb_metodologia', 'Metodologia proposta (Fase 1)'),
  ec_participantes: { from: 'Critérios de inclusão e exclusão (Fase 1)', get: participants },
  obs_participantes: { from: 'Critérios de inclusão e exclusão (Fase 1)', get: participants },
  dx_participantes: { from: 'Critérios de inclusão e exclusão (Fase 1)', get: participants },
  ql_participantes: { from: 'Critérios de inclusão e exclusão (Fase 1)', get: participants },
  ec_amostra: field('pb_amostra', 'Tamanho da amostra (Fase 1)'),
  obs_tamanho: field('pb_amostra', 'Tamanho da amostra (Fase 1)'),
  dx_amostra: field('pb_amostra', 'Tamanho da amostra (Fase 1)'),
  ec_desfechos: { from: 'Desfechos (Fase 1)', get: outcomes },
  met_etica: { from: 'CAAE e parecer (Fase 1)', get: ethicsText },
  fin_financiamento: { from: 'Financiamento (Fase 1)', get: financingText },
  fin_referencias: field('pb_bibliografia', 'Bibliografia (Fase 1)'),
}

function sectionsToHtml(title: string, front: Block[], sections: Section[]): string {
  const body: string[] = [`<h1>${escapeHtml(title)}</h1>`]
  for (const b of front) body.push(blockHtml(b))
  for (const s of sections) {
    body.push(`<h2>${escapeHtml(s.title)}</h2>`)
    for (const b of s.blocks) {
      if (b.heading) body.push(`<h3>${escapeHtml(b.heading)}</h3>`)
      body.push(blockHtml(b))
    }
  }
  return wrapHtmlDocument(title, body.join('\n'))
}

function blocks(v: Values, items: [string | undefined, string][]): Block[] {
  return items.filter(([, id]) => get(v, id)).map(([heading, id]) => ({ heading, text: get(v, id) }))
}

function scheduleBlocks(v: Values): Block[] {
  const rows = parseSchedule(get(v, 'pb_cronograma'))
  if (rows.length === 0) return []
  const table = [['Identificação da etapa', 'Início', 'Término'], ...rows.map((r) => [r.etapa, r.inicio, r.fim])]
  return [{ text: formatSchedule(rows), table }]
}

function labeled(v: Values, items: [string, string][]): Block[] {
  return items.filter(([, id]) => get(v, id)).map(([label, id]) => ({ label, text: get(v, id) }))
}

export function buildProject(type: StudyType | null, v: Values) {
  const title = get(v, 'pb_titulo') || 'Projeto de pesquisa'
  const front = labeled(v, [['Título público', 'pb_titulo_publico']])

  const resolucoes =
    type?.id === 'qualitativo' ? 'nas Resoluções CNS 466/2012 e 510/2016' : 'na Resolução CNS 466/2012'
  const etica: Block[] = [
    ...blocks(v, [
      ['Riscos', 'pb_riscos'],
      ['Benefícios', 'pb_beneficios'],
    ]),
    {
      heading: 'Consentimento',
      text:
        v.pb_dispensa_tcle === 'Sim'
          ? `Solicita-se a dispensa do Termo de Consentimento Livre e Esclarecido. ${get(v, 'pb_dispensa_justificativa')}`
          : 'Os participantes serão convidados a assinar o Termo de Consentimento Livre e Esclarecido, em duas vias.',
    },
  ]
  if (v.pb_fontes_secundarias === 'Sim') {
    etica.push({
      heading: 'Uso de dados secundários',
      text: 'Serão utilizadas fontes secundárias de dados, mediante Termo de Compromisso de Utilização de Dados.',
    })
  }
  if (v.pb_material_biologico === 'Sim') {
    etica.push({
      heading: 'Material biológico',
      text: 'Haverá armazenamento de material biológico, conforme regulamento do biobanco ou biorrepositório.',
    })
  }
  etica.push({
    text: `O estudo seguirá as diretrizes previstas ${resolucoes}. A coleta de dados só começará após a aprovação do Comitê de Ética em Pesquisa.`,
  })

  const financiamento = financingText(v)
  const sections: Section[] = [
    { title: 'Resumo', blocks: blocks(v, [[undefined, 'pb_resumo']]) },
    { title: 'Introdução', blocks: blocks(v, [[undefined, 'pb_introducao']]) },
    { title: 'Hipótese', blocks: blocks(v, [[undefined, 'pb_hipotese']]) },
    {
      title: 'Objetivos',
      blocks: blocks(v, [
        ['Objetivo primário', 'pb_objetivo_primario'],
        ['Objetivos secundários', 'pb_objetivo_secundario'],
      ]),
    },
    {
      title: 'Metodologia',
      blocks: blocks(v, [
        ['Desenho do estudo', 'pb_desenho'],
        ['Procedimentos', 'pb_metodologia'],
        ['Critérios de inclusão', 'pb_inclusao'],
        ['Critérios de exclusão', 'pb_exclusao'],
        ['Tamanho da amostra', 'pb_amostra'],
        ['Desfecho primário', 'pb_desfecho_primario'],
        ['Desfechos secundários', 'pb_desfecho_secundario'],
        ['Análise dos dados', 'pb_analise'],
      ]),
    },
    { title: 'Aspectos éticos', blocks: etica },
    { title: 'Financiamento', blocks: financiamento ? [{ text: financiamento }] : [] },
    { title: 'Cronograma', blocks: scheduleBlocks(v) },
    { title: 'Orçamento', blocks: blocks(v, [[undefined, 'pb_orcamento']]) },
    { title: 'Referências', blocks: blocks(v, [[undefined, 'pb_bibliografia']]) },
  ].filter((s) => s.blocks.length > 0)

  return { title, html: sectionsToHtml(title, front, sections) }
}

const placeholder = (what: string) => `[preencher: ${what}]`

export function buildTcle(v: Values): string {
  const val = (id: string, what: string) => get(v, id) || SOURCES[id]?.get(v) || placeholder(what)
  const title = 'Termo de Consentimento Livre e Esclarecido'
  const pesquisador = get(v, 'tcle_contato_pesquisador').split('\n')[0] || placeholder('pesquisador responsável')

  const sections: Section[] = [
    {
      title: 'Convite',
      blocks: [
        {
          text: `Você está sendo convidado(a) a participar da pesquisa "${val('pb_titulo', 'título do projeto')}", sob a responsabilidade de ${pesquisador}. Leia este termo com calma e pergunte o que não entender antes de decidir.`,
        },
      ],
    },
    { title: 'Por que esta pesquisa está sendo feita', blocks: [{ text: val('tcle_justificativa', 'justificativa e objetivo') }] },
    { title: 'O que você vai fazer', blocks: [{ text: val('tcle_procedimentos', 'procedimentos, duração e local') }] },
    { title: 'Riscos e desconfortos', blocks: [{ text: val('tcle_riscos', 'riscos e como serão reduzidos') }] },
    { title: 'Benefícios', blocks: [{ text: val('tcle_beneficios', 'benefícios') }] },
    { title: 'Acompanhamento e assistência', blocks: [{ text: val('tcle_assistencia', 'assistência oferecida') }] },
    { title: 'Ressarcimento e indenização', blocks: [{ text: val('tcle_ressarcimento', 'ressarcimento e indenização') }] },
    {
      title: 'Seus direitos',
      blocks: [
        {
          text: 'Sua participação é voluntária. Você pode recusar-se a participar ou retirar seu consentimento a qualquer momento, sem nenhuma penalização ou prejuízo.\nSeus dados serão mantidos em sigilo. Os resultados serão divulgados de forma que não seja possível identificar você.\nVocê não terá nenhum custo por participar e não receberá pagamento pela participação.',
        },
      ],
    },
    {
      title: 'Contatos',
      blocks: [
        { label: 'Pesquisador responsável', text: val('tcle_contato_pesquisador', 'nome, endereço, telefone e e-mail') },
        {
          label: 'Comitê de Ética em Pesquisa',
          text: `${val('tcle_contato_cep', 'nome, endereço, telefone, e-mail e horário do CEP')}\nO Comitê de Ética em Pesquisa (CEP) é um grupo que defende os interesses dos participantes de pesquisa. Procure-o se tiver dúvidas sobre seus direitos como participante.`,
        },
      ],
    },
    {
      title: 'Consentimento',
      blocks: [
        {
          text: 'Este termo é feito em duas vias, rubricadas em todas as páginas e assinadas pelo participante e pelo pesquisador. Uma via fica com você.\nDeclaro que fui informado(a) sobre a pesquisa, tive a oportunidade de fazer perguntas e concordo em participar.\nNome do participante: ________________________________________\nAssinatura: ________________________________________ Data: ____/____/______\nPesquisador responsável: ________________________________________\nAssinatura: ________________________________________ Data: ____/____/______',
        },
      ],
    },
  ]

  return sectionsToHtml(title, [], sections)
}
