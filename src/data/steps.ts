import { PB_FIELDS } from './plataformaBrasil'
import type { Field, Phase, Step, StepId, StudyType, Values } from './types'

export type { Step, StepId }

export const PHASE_TITLES: Record<Phase, string> = {
  1: 'Fase 1 · Plataforma Brasil',
  2: 'Fase 2 · Artigo original',
}

export const STEPS: Step[] = [
  {
    id: 'tipo',
    phase: 1,
    title: 'Tipo de estudo',
    intro: 'Escolha o tipo de estudo. Todas as opções são pesquisas com seres humanos na área da saúde; a escolha orienta os campos da Plataforma Brasil e, na Fase 2, os Métodos e Resultados do artigo.',
  },
  {
    id: 'pb_area',
    phase: 1,
    title: 'Área de estudo',
    intro: 'Títulos, área do conhecimento e se o projeto está em área temática especial.',
  },
  {
    id: 'pb_desenho',
    phase: 1,
    title: 'Desenho e financiamento',
    intro: 'O desenho do estudo e quem vai pagar as despesas.',
  },
  {
    id: 'pb_detalhamento',
    phase: 1,
    title: 'Detalhamento do estudo',
    intro: 'O núcleo do projeto. Cada campo corresponde a um campo da plataforma: escreva aqui e depois copie para lá.',
  },
  {
    id: 'pb_outras',
    phase: 1,
    title: 'Outras informações',
    intro: 'Uso de dados, consentimento, cronograma, orçamento e bibliografia.',
  },
  {
    id: 'pb_tcle',
    phase: 1,
    title: 'TCLE',
    intro: 'O Termo de Consentimento Livre e Esclarecido é o convite ao participante. Escreva em linguagem simples; o site monta o termo com os itens exigidos pela Resolução CNS 466/2012.',
  },
  {
    id: 'pb_envio',
    phase: 1,
    title: 'Documentos e envio',
    intro: 'Os anexos da submissão, o projeto e o TCLE prontos para baixar, e o registro da aprovação.',
  },
  {
    id: 'identificacao',
    phase: 2,
    title: 'Título e autores',
    intro: 'A página de rosto: título, autores, afiliações e contato.',
  },
  {
    id: 'resumo',
    phase: 2,
    title: 'Resumo',
    intro: 'Resumo estruturado. Muitos autores escrevem esta parte por último; você pode pular e voltar depois.',
  },
  {
    id: 'introducao',
    phase: 2,
    title: 'Introdução',
    intro: 'Do geral para o específico: o que se sabe, o que falta saber e o que este estudo pretende responder.',
  },
  {
    id: 'metodos',
    phase: 2,
    title: 'Métodos',
    intro: 'Descreva o que foi feito com detalhe suficiente para que outra equipe consiga repetir o estudo.',
  },
  {
    id: 'resultados',
    phase: 2,
    title: 'Resultados',
    intro: 'Apresente o que foi encontrado, na mesma ordem dos Métodos, sem interpretar.',
  },
  {
    id: 'discussao',
    phase: 2,
    title: 'Discussão',
    intro: 'Interprete os resultados, compare com a literatura e reconheça as limitações.',
  },
  {
    id: 'conclusao',
    phase: 2,
    title: 'Conclusão',
    intro: 'A resposta ao objetivo, apoiada apenas nos seus resultados.',
  },
  {
    id: 'finais',
    phase: 2,
    title: 'Declarações e referências',
    intro: 'Financiamento, conflitos de interesse, contribuições e a lista de referências.',
  },
  {
    id: 'revisao',
    phase: 2,
    title: 'Revisão e exportação',
    intro: 'Confira o que falta, leia o manuscrito montado e exporte.',
  },
]

const identificacao: Field[] = [
  {
    id: 'titulo',
    label: 'Título',
    kind: 'text',
    help: 'Diga o que foi estudado, em quem e com qual desenho. Evite abreviações.',
    suggestTitle: 'cientifico',
    example: 'Efeito do treinamento resistido sobre a força muscular em idosos: ensaio clínico randomizado',
  },
  {
    id: 'titulo_curto',
    label: 'Título resumido',
    kind: 'text',
    optional: true,
    inlineLabel: 'Título resumido',
    help: 'Versão curta para o cabeçalho, se a revista pedir (em geral até 50 caracteres).',
    example: 'Treinamento resistido em idosos',
  },
  {
    id: 'autores',
    label: 'Autores',
    rows: 3,
    help: 'Nome completo de cada autor, um por linha, na ordem de autoria. Indique o número da afiliação ao lado.',
    example: 'Ana Souza¹\nCarlos Lima²',
  },
  {
    id: 'afiliacoes',
    label: 'Afiliações',
    rows: 3,
    help: 'Uma afiliação por linha: departamento, instituição, cidade, estado e país.',
    example: '¹ Departamento de Fisioterapia, Universidade Federal X, Cidade, UF, Brasil',
  },
  {
    id: 'correspondente',
    label: 'Autor correspondente',
    rows: 2,
    inlineLabel: 'Autor correspondente',
    help: 'Nome, endereço institucional e e-mail.',
  },
]

const resumo: Field[] = [
  {
    id: 'resumo_objetivo',
    label: 'Objetivo',
    inlineLabel: 'Objetivo',
    rows: 2,
    help: 'Uma frase com o objetivo do estudo.',
  },
  {
    id: 'resumo_metodos',
    label: 'Métodos',
    inlineLabel: 'Métodos',
    help: 'Desenho, participantes ou amostras, intervenção ou exposição, desfechos e análise principal.',
  },
  {
    id: 'resumo_resultados',
    label: 'Resultados',
    inlineLabel: 'Resultados',
    help: 'Os principais números, com medida de efeito e intervalo de confiança ou valor de p.',
  },
  {
    id: 'resumo_conclusao',
    label: 'Conclusão',
    inlineLabel: 'Conclusão',
    rows: 2,
    help: 'A resposta direta ao objetivo, sem extrapolar os dados.',
  },
  {
    id: 'palavras_chave',
    label: 'Palavras-chave',
    inlineLabel: 'Palavras-chave',
    kind: 'text',
    help: 'De 3 a 6 termos, de preferência do DeCS ou MeSH, separados por ponto e vírgula.',
    example: 'Treinamento de força; Idoso; Força muscular',
  },
]

const introducao: Field[] = [
  {
    id: 'intro_contexto',
    label: 'Contexto',
    rows: 6,
    help: 'O que já se sabe sobre o tema e por que ele importa, com referências.',
  },
  {
    id: 'intro_lacuna',
    label: 'Lacuna',
    help: 'O que ainda não se sabe ou não foi resolvido e que este estudo pretende responder.',
    example: 'Embora estudos anteriores tenham avaliado..., não há dados sobre... em...',
  },
  {
    id: 'intro_objetivo',
    label: 'Objetivo',
    rows: 2,
    help: 'O objetivo, com verbo no infinitivo. Deve coincidir com o do resumo.',
    example: 'O objetivo deste estudo foi avaliar o efeito de... sobre... em...',
  },
  {
    id: 'intro_hipotese',
    label: 'Hipótese',
    rows: 2,
    optional: true,
    help: 'A hipótese testada, se houver.',
  },
]

const metodosInicio: Field[] = [
  {
    id: 'met_desenho',
    label: 'Desenho do estudo',
    heading: 'Desenho do estudo',
    rows: 2,
    help: '',
  },
  {
    id: 'met_local',
    label: 'Local e período',
    heading: 'Local e período',
    rows: 2,
    help: 'Onde e quando o estudo foi realizado: instituição, cidade, país e datas de coleta.',
  },
]

const metodosFim: Field[] = [
  {
    id: 'met_etica',
    label: 'Aspectos éticos',
    heading: 'Aspectos éticos',
    help: 'Aprovação pelo Comitê de Ética em Pesquisa (CEP), número do CAAE e do parecer, e como o consentimento dos participantes foi obtido.',
    example:
      'O estudo foi aprovado pelo Comitê de Ética em Pesquisa da Universidade X (CAAE 00000000.0.0000.0000). Todos os participantes assinaram o Termo de Consentimento Livre e Esclarecido.',
  },
]

const resultadoPrincipal: Field = {
  id: 'res_principal',
  label: 'Resultado principal',
  rows: 6,
  help: 'O achado que responde ao objetivo, com números: medida de efeito, intervalo de confiança e valor de p quando houver. Não interprete aqui.',
}

const resultadosFim: Field[] = [
  {
    id: 'res_secundarios',
    label: 'Resultados secundários',
    optional: true,
    help: 'Demais análises, na mesma ordem em que aparecem nos Métodos.',
  },
  {
    id: 'res_tabelas',
    label: 'Tabelas e figuras',
    optional: true,
    atEnd: true,
    help: 'Título e legenda de cada tabela ou figura, uma por linha. No texto, cite-as em ordem (Tabela 1, Figura 1).',
    example: 'Tabela 1. Características dos participantes no início do estudo (n = 120).',
  },
]

const discussao: Field[] = [
  {
    id: 'disc_principal',
    label: 'Achado principal',
    help: 'Comece pela resposta ao objetivo, em linguagem direta, sem repetir todos os números.',
    example: 'Neste estudo, o treinamento resistido aumentou a força muscular de idosos em comparação com o grupo controle.',
  },
  {
    id: 'disc_literatura',
    label: 'Comparação com a literatura',
    rows: 6,
    help: 'Onde seus resultados concordam ou divergem de estudos anteriores e as possíveis explicações.',
  },
  {
    id: 'disc_forcas',
    label: 'Pontos fortes',
    optional: true,
    help: 'O que o estudo tem de mais sólido: desenho, tamanho, qualidade dos dados.',
  },
  {
    id: 'disc_limitacoes',
    label: 'Limitações',
    help: 'Vieses possíveis, tamanho da amostra, generalização, e como podem ter afetado os resultados.',
  },
  {
    id: 'disc_implicacoes',
    label: 'Implicações',
    help: 'O que os achados significam para a prática, para políticas ou para pesquisas futuras.',
  },
]

const conclusao: Field[] = [
  {
    id: 'conclusao',
    label: 'Conclusão',
    help: 'A resposta ao objetivo, em poucas frases, apoiada apenas nos resultados apresentados. Não traga dados novos.',
  },
]

const finais: Field[] = [
  {
    id: 'fin_agradecimentos',
    label: 'Agradecimentos',
    heading: 'Agradecimentos',
    optional: true,
    help: 'Pessoas ou instituições que contribuíram sem preencher os critérios de autoria.',
  },
  {
    id: 'fin_financiamento',
    label: 'Financiamento',
    heading: 'Financiamento',
    rows: 2,
    help: 'Agência e número do processo, ou a declaração de que não houve financiamento.',
    example: 'Este estudo foi financiado pela Fundação X (processo nº 0000/0000).',
  },
  {
    id: 'fin_conflitos',
    label: 'Conflitos de interesse',
    heading: 'Conflitos de interesse',
    rows: 2,
    help: 'Declare os conflitos ou informe que não há.',
    example: 'Os autores declaram não haver conflitos de interesse.',
  },
  {
    id: 'fin_contribuicoes',
    label: 'Contribuições dos autores',
    heading: 'Contribuições dos autores',
    optional: true,
    help: 'O papel de cada autor, por exemplo pela taxonomia CRediT.',
    example: 'AS: concepção, coleta de dados e redação. CL: análise estatística e revisão crítica.',
  },
  {
    id: 'fin_dados',
    label: 'Disponibilidade de dados',
    heading: 'Disponibilidade de dados',
    optional: true,
    help: 'Onde os dados podem ser acessados, ou em que condições serão disponibilizados.',
  },
  {
    id: 'fin_referencias',
    label: 'Referências',
    heading: 'Referências',
    rows: 10,
    help: 'Uma referência por linha, no estilo exigido pela revista (Vancouver, ABNT, APA).',
  },
]

export function getStepFields(stepId: StepId, type: StudyType | null): Field[] {
  switch (stepId) {
    case 'identificacao':
      return identificacao
    case 'resumo':
      return resumo
    case 'introducao':
      return introducao
    case 'metodos': {
      if (!type) return []
      const [desenho, local] = metodosInicio
      return [{ ...desenho, help: type.designHint }, local, ...type.methods, ...metodosFim]
    }
    case 'resultados': {
      if (!type) return []
      const principal: Field = {
        ...resultadoPrincipal,
        help: type.mainResultHint ?? resultadoPrincipal.help,
        heading: type.mainResultHeading,
      }
      return [...type.resultsBefore, principal, ...type.resultsAfter, ...resultadosFim]
    }
    case 'discussao':
      return discussao
    case 'conclusao':
      return conclusao
    case 'finais':
      return finais
    case 'pb_desenho': {
      const [desenho, ...rest] = PB_FIELDS.pb_desenho
      return [{ ...desenho, help: type?.designHint ?? 'O tipo de estudo.' }, ...rest]
    }
    default:
      return PB_FIELDS[stepId] ?? []
  }
}

export function visibleFields(stepId: StepId, type: StudyType | null, values: Values): Field[] {
  return getStepFields(stepId, type).filter((f) => !f.showIf || f.showIf(values))
}

export function isFilled(values: Values, id: string): boolean {
  return (values[id] ?? '').trim().length > 0
}

export function missingFields(stepId: StepId, type: StudyType | null, values: Values): Field[] {
  return visibleFields(stepId, type, values).filter((f) => !f.optional && !isFilled(values, f.id))
}

export function stepProgress(stepId: StepId, type: StudyType | null, values: Values) {
  const required = visibleFields(stepId, type, values).filter((f) => !f.optional)
  return { done: required.filter((f) => isFilled(values, f.id)).length, total: required.length }
}
