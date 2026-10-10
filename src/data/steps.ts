import type { Field, StudyType } from './types'

export type StepId =
  | 'tipo'
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
  title: string
  intro: string
}

export const STEPS: Step[] = [
  {
    id: 'tipo',
    title: 'Tipo de estudo',
    intro: 'Escolha a variação do artigo original. Ela define o que será pedido nos Métodos e nos Resultados.',
  },
  {
    id: 'identificacao',
    title: 'Título e autores',
    intro: 'A página de rosto: título, autores, afiliações e contato.',
  },
  {
    id: 'resumo',
    title: 'Resumo',
    intro: 'Resumo estruturado. Muitos autores escrevem esta parte por último; você pode pular e voltar depois.',
  },
  {
    id: 'introducao',
    title: 'Introdução',
    intro: 'Do geral para o específico: o que se sabe, o que falta saber e o que este estudo pretende responder.',
  },
  {
    id: 'metodos',
    title: 'Métodos',
    intro: 'Descreva o que foi feito com detalhe suficiente para que outra equipe consiga repetir o estudo.',
  },
  {
    id: 'resultados',
    title: 'Resultados',
    intro: 'Apresente o que foi encontrado, na mesma ordem dos Métodos, sem interpretar.',
  },
  {
    id: 'discussao',
    title: 'Discussão',
    intro: 'Interprete os resultados, compare com a literatura e reconheça as limitações.',
  },
  {
    id: 'conclusao',
    title: 'Conclusão',
    intro: 'A resposta ao objetivo, apoiada apenas nos seus resultados.',
  },
  {
    id: 'finais',
    title: 'Declarações e referências',
    intro: 'Financiamento, conflitos de interesse, contribuições e a lista de referências.',
  },
  {
    id: 'revisao',
    title: 'Revisão e exportação',
    intro: 'Confira o que falta, leia o manuscrito montado e exporte.',
  },
]

const identificacao: Field[] = [
  {
    id: 'titulo',
    label: 'Título',
    singleLine: true,
    help: 'Diga o que foi estudado, em quem e com qual desenho. Evite abreviações.',
    example: 'Efeito do treinamento resistido sobre a força muscular em idosos: ensaio clínico randomizado',
  },
  {
    id: 'titulo_curto',
    label: 'Título resumido',
    singleLine: true,
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
    singleLine: true,
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
    help: 'Aprovação pelo Comitê de Ética em Pesquisa (CEP) ou pela Comissão de Ética no Uso de Animais (CEUA), número do parecer e forma de obtenção do consentimento. Se não se aplicar, explique por quê.',
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
    default:
      return []
  }
}

export function isFilled(values: Record<string, string>, id: string): boolean {
  return (values[id] ?? '').trim().length > 0
}

export function stepProgress(stepId: StepId, type: StudyType | null, values: Record<string, string>) {
  const required = getStepFields(stepId, type).filter((f) => !f.optional)
  return { done: required.filter((f) => isFilled(values, f.id)).length, total: required.length }
}
