import type { Field, StudyType } from './types'

const analiseEstatistica: Field = {
  id: 'met_analise',
  label: 'Análise estatística',
  heading: 'Análise estatística',
  help: 'Como os dados foram descritos, que teste foi usado para cada objetivo, como foram tratados os dados ausentes, o nível de significância e o software com a versão.',
  example:
    'Variáveis contínuas foram descritas como média e desvio padrão. A comparação entre grupos foi feita por teste t de Student. Adotou-se nível de significância de 5%. As análises foram realizadas no R, versão 4.4.',
}

export const STUDY_TYPES: StudyType[] = [
  {
    id: 'experimental',
    name: 'Experimental / laboratorial',
    description: 'Estudos in vitro, de bancada ou laboratoriais, com condições controladas pelo pesquisador.',
    guideline: 'Sem diretriz única: descreva o suficiente para outro laboratório repetir o experimento',
    designHint: 'Diga que se trata de um estudo experimental (in vitro, laboratorial ou de bancada) e qual comparação ele faz.',
    methods: [
      {
        id: 'exp_amostras',
        label: 'Material e amostras',
        heading: 'Material e amostras',
        help: 'Origem do material (linhagem celular, tecido, reagente, amostra ambiental), como foi preparado e quantas amostras e replicatas foram usadas.',
      },
      {
        id: 'exp_grupos',
        label: 'Grupos e condições experimentais',
        heading: 'Grupos e condições experimentais',
        help: 'Grupos controle e tratados, doses ou concentrações, tempo de exposição e como as amostras foram distribuídas entre os grupos.',
      },
      {
        id: 'exp_procedimentos',
        label: 'Procedimentos e equipamentos',
        heading: 'Procedimentos',
        help: 'Cada procedimento na ordem em que foi feito, com equipamentos (marca, modelo), reagentes (fabricante, lote quando relevante) e condições.',
      },
      {
        id: 'exp_variaveis',
        label: 'Variáveis medidas',
        heading: 'Variáveis analisadas',
        help: 'O que foi medido, com qual método e em que momento.',
      },
      analiseEstatistica,
    ],
    resultsBefore: [],
    resultsAfter: [],
    mainResultHint:
      'Os resultados de cada comparação experimental, com média ou mediana, medida de dispersão, número de replicatas e valor de p. Não interprete aqui.',
  },
  {
    id: 'ensaio-clinico',
    name: 'Ensaio clínico',
    description: 'Participantes alocados pelo pesquisador para receber uma intervenção ou um controle.',
    guideline: 'CONSORT',
    designHint:
      'Informe o tipo de ensaio (paralelo, cruzado, fatorial), a razão de alocação e se é de superioridade, não inferioridade ou equivalência.',
    methods: [
      {
        id: 'ec_registro',
        label: 'Registro do ensaio',
        heading: 'Registro',
        help: 'Base de registro (ReBEC, ClinicalTrials.gov) e número, e onde o protocolo pode ser consultado.',
        example: 'Ensaio registrado no Registro Brasileiro de Ensaios Clínicos (ReBEC) sob o número RBR-xxxxxx.',
      },
      {
        id: 'ec_participantes',
        label: 'Participantes',
        heading: 'Participantes',
        help: 'Critérios de inclusão e exclusão, como e onde os participantes foram recrutados.',
      },
      {
        id: 'ec_intervencoes',
        label: 'Intervenções',
        heading: 'Intervenções',
        help: 'O que cada grupo recebeu, com detalhe suficiente para replicar: dose, frequência, duração, quem aplicou e onde.',
      },
      {
        id: 'ec_desfechos',
        label: 'Desfechos',
        heading: 'Desfechos',
        help: 'Desfecho primário e secundários, como e quando foram medidos.',
      },
      {
        id: 'ec_amostra',
        label: 'Tamanho da amostra',
        heading: 'Tamanho da amostra',
        help: 'Como o tamanho da amostra foi calculado: diferença esperada, variabilidade, poder, nível de significância e perdas previstas.',
      },
      {
        id: 'ec_randomizacao',
        label: 'Randomização e sigilo da alocação',
        heading: 'Randomização',
        help: 'Como a sequência aleatória foi gerada, o tipo de randomização (simples, em blocos, estratificada) e como a alocação foi mantida em sigilo.',
      },
      {
        id: 'ec_cegamento',
        label: 'Cegamento',
        heading: 'Cegamento',
        help: 'Quem não sabia a qual grupo cada participante pertencia (participantes, profissionais, avaliadores de desfecho) e como isso foi garantido.',
      },
      analiseEstatistica,
    ],
    resultsBefore: [
      {
        id: 'ec_fluxo',
        label: 'Fluxo de participantes',
        heading: 'Fluxo de participantes',
        help: 'Quantos foram avaliados, randomizados, receberam a intervenção e foram analisados em cada grupo, com perdas e motivos. Inclua as datas de recrutamento e seguimento.',
      },
      {
        id: 'ec_basais',
        label: 'Características iniciais',
        heading: 'Características iniciais',
        help: 'Dados demográficos e clínicos de cada grupo no início do estudo, de preferência em tabela.',
      },
    ],
    resultsAfter: [
      {
        id: 'ec_adversos',
        label: 'Eventos adversos',
        heading: 'Eventos adversos',
        help: 'Danos ou efeitos indesejados em cada grupo. Se não houve, diga isso.',
      },
    ],
    mainResultHint:
      'Para o desfecho primário e os secundários: o resultado de cada grupo e a medida de efeito com intervalo de confiança de 95%.',
    mainResultHeading: 'Desfechos',
  },
  {
    id: 'observacional',
    name: 'Observacional',
    description: 'Coorte, caso-controle ou transversal: o pesquisador observa, sem intervir.',
    guideline: 'STROBE',
    designHint:
      'Informe se é coorte (prospectiva ou retrospectiva), caso-controle ou transversal, e por que esse desenho responde à pergunta.',
    methods: [
      {
        id: 'obs_participantes',
        label: 'Participantes',
        heading: 'Participantes',
        help: 'Critérios de elegibilidade, fontes e métodos de seleção. Na coorte, o seguimento; no caso-controle, como casos e controles foram definidos e escolhidos.',
      },
      {
        id: 'obs_variaveis',
        label: 'Variáveis',
        heading: 'Variáveis',
        help: 'Exposição, desfecho, possíveis fatores de confusão e modificadores de efeito, com a definição de cada um.',
      },
      {
        id: 'obs_fontes',
        label: 'Fontes de dados e mensuração',
        heading: 'Fontes de dados e mensuração',
        help: 'De onde vieram os dados de cada variável (prontuário, questionário, exame) e como foram medidos.',
      },
      {
        id: 'obs_vieses',
        label: 'Controle de vieses',
        heading: 'Controle de vieses',
        help: 'Que vieses poderiam afetar o estudo (seleção, informação, confusão) e o que foi feito para reduzi-los.',
      },
      {
        id: 'obs_tamanho',
        label: 'Tamanho do estudo',
        heading: 'Tamanho do estudo',
        help: 'Como se chegou ao número de participantes: cálculo amostral ou população disponível.',
      },
      analiseEstatistica,
    ],
    resultsBefore: [
      {
        id: 'obs_fluxo',
        label: 'Participantes',
        heading: 'Participantes',
        help: 'Número de pessoas em cada etapa (potencialmente elegíveis, incluídas, com seguimento completo, analisadas) e motivos de perda.',
      },
      {
        id: 'obs_descritivos',
        label: 'Características dos participantes',
        heading: 'Características dos participantes',
        help: 'Características demográficas e clínicas, de preferência em tabela, e quantidade de dados ausentes por variável.',
      },
    ],
    resultsAfter: [],
    mainResultHint:
      'Os desfechos e as associações principais: estimativas brutas e ajustadas (por exemplo, razão de chances ou razão de riscos) com intervalo de confiança de 95%, e as variáveis usadas no ajuste.',
    mainResultHeading: 'Desfechos e associações',
  },
  {
    id: 'diagnostico',
    name: 'Acurácia diagnóstica',
    description: 'Compara um teste com um padrão de referência para saber quão bem ele identifica uma condição.',
    guideline: 'STARD',
    designHint:
      'Informe que é um estudo de acurácia diagnóstica, se a coleta foi prospectiva ou retrospectiva e qual é a condição-alvo.',
    methods: [
      {
        id: 'dx_participantes',
        label: 'Participantes',
        heading: 'Participantes',
        help: 'Critérios de elegibilidade, cenário de atendimento e como os participantes foram selecionados (amostra consecutiva, aleatória ou de conveniência).',
      },
      {
        id: 'dx_teste',
        label: 'Teste índice',
        heading: 'Teste índice',
        help: 'O teste avaliado, como foi realizado e o ponto de corte usado para considerar o resultado positivo.',
      },
      {
        id: 'dx_referencia',
        label: 'Padrão de referência',
        heading: 'Padrão de referência',
        help: 'O padrão de referência, por que foi escolhido e o intervalo de tempo entre ele e o teste índice.',
      },
      {
        id: 'dx_cegamento',
        label: 'Cegamento dos avaliadores',
        heading: 'Cegamento',
        help: 'Se quem interpretou o teste índice conhecia o resultado do padrão de referência, e vice-versa.',
      },
      {
        id: 'dx_amostra',
        label: 'Tamanho da amostra',
        heading: 'Tamanho da amostra',
        help: 'Como o número de participantes foi definido.',
      },
      analiseEstatistica,
    ],
    resultsBefore: [
      {
        id: 'dx_fluxo',
        label: 'Participantes',
        heading: 'Participantes',
        help: 'Quantos foram elegíveis, quantos fizeram o teste índice e o padrão de referência, e os motivos de não realização. Inclua as características clínicas.',
      },
    ],
    resultsAfter: [],
    mainResultHint:
      'A tabela 2×2 do teste índice contra o padrão de referência, com sensibilidade, especificidade e valores preditivos, cada um com intervalo de confiança de 95%.',
    mainResultHeading: 'Acurácia do teste',
  },
  {
    id: 'qualitativo',
    name: 'Qualitativo',
    description: 'Investiga experiências, percepções e significados a partir de falas, observações ou documentos.',
    guideline: 'SRQR ou COREQ',
    ethicsNote:
      'Pesquisas em Ciências Humanas e Sociais seguem também a Resolução CNS 510/2016, que admite outras formas de registro do consentimento além do termo escrito, como a gravação em áudio.',
    designHint: 'Informe que é um estudo qualitativo e a pergunta que orienta a investigação.',
    methods: [
      {
        id: 'ql_abordagem',
        label: 'Abordagem e referencial',
        heading: 'Abordagem metodológica',
        help: 'O referencial adotado (fenomenologia, teoria fundamentada, etnografia, análise de conteúdo, etc.) e por que ele serve à pergunta.',
      },
      {
        id: 'ql_pesquisador',
        label: 'Pesquisadores e reflexividade',
        heading: 'Características dos pesquisadores',
        help: 'Quem conduziu a coleta, sua formação e relação com os participantes, e como isso pode ter influenciado o estudo.',
      },
      {
        id: 'ql_participantes',
        label: 'Participantes e amostragem',
        heading: 'Participantes',
        help: 'Como os participantes foram escolhidos (amostragem intencional, bola de neve), quantos foram e o critério para encerrar a inclusão, como a saturação.',
      },
      {
        id: 'ql_coleta',
        label: 'Coleta de dados',
        heading: 'Coleta de dados',
        help: 'Técnica (entrevista, grupo focal, observação), roteiro, local, duração, forma de registro e transcrição.',
      },
      {
        id: 'ql_analise',
        label: 'Análise dos dados',
        heading: 'Análise dos dados',
        help: 'Como os dados foram codificados e organizados em categorias ou temas, quem fez a análise e o software usado, se houver.',
      },
      {
        id: 'ql_rigor',
        label: 'Rigor e credibilidade',
        heading: 'Rigor metodológico',
        help: 'Estratégias para dar confiabilidade aos achados: triangulação, codificação por mais de um pesquisador, validação com participantes.',
      },
    ],
    resultsBefore: [
      {
        id: 'ql_caracterizacao',
        label: 'Caracterização dos participantes',
        heading: 'Caracterização dos participantes',
        help: 'Quem participou, sem identificar ninguém: perfil, número e, se for útil, um quadro resumo.',
      },
    ],
    resultsAfter: [],
    mainResultHint:
      'Os temas ou categorias que emergiram, cada um descrito e ilustrado com trechos das falas, identificados por código (por exemplo, P3).',
    mainResultHeading: 'Temas e categorias',
  },
  {
    id: 'mistos',
    name: 'Métodos mistos',
    description: 'Combina um componente quantitativo e um qualitativo e integra os dois.',
    guideline: 'GRAMMS',
    designHint: 'Informe que é um estudo de métodos mistos e por que a pergunta pede as duas abordagens.',
    methods: [
      {
        id: 'mm_desenho',
        label: 'Desenho de métodos mistos',
        heading: 'Desenho de métodos mistos',
        help: 'Convergente, sequencial explanatório ou sequencial exploratório; qual componente tem prioridade e em que ordem foram realizados.',
      },
      {
        id: 'mm_quanti',
        label: 'Componente quantitativo',
        heading: 'Componente quantitativo',
        help: 'Participantes, instrumentos, variáveis e análise estatística da parte quantitativa.',
      },
      {
        id: 'mm_quali',
        label: 'Componente qualitativo',
        heading: 'Componente qualitativo',
        help: 'Participantes, coleta e método de análise da parte qualitativa.',
      },
      {
        id: 'mm_integracao',
        label: 'Integração',
        heading: 'Integração dos dados',
        help: 'Em que momento e de que forma os dois componentes foram integrados (por exemplo, quadro de exibição conjunta).',
      },
    ],
    resultsBefore: [
      {
        id: 'mm_quanti_res',
        label: 'Resultados quantitativos',
        heading: 'Resultados quantitativos',
        help: 'Os achados da parte quantitativa, com os números principais.',
      },
      {
        id: 'mm_quali_res',
        label: 'Resultados qualitativos',
        heading: 'Resultados qualitativos',
        help: 'Os temas ou categorias da parte qualitativa, com trechos ilustrativos.',
      },
    ],
    resultsAfter: [],
    mainResultHint:
      'Como os achados quantitativos e qualitativos se confirmam, se complementam ou divergem, e o que se conclui da combinação deles.',
    mainResultHeading: 'Integração dos resultados',
  },
  {
    id: 'animal',
    name: 'Pesquisa com animais',
    description: 'Estudos experimentais in vivo com animais de laboratório.',
    guideline: 'ARRIVE',
    ethicsNote:
      'Pesquisas com animais não são submetidas à Plataforma Brasil: elas são avaliadas pela Comissão de Ética no Uso de Animais (CEUA) da instituição. Você pode ir direto para a Fase 2.',
    designHint: 'Informe que é um estudo experimental com animais, a unidade experimental e a comparação principal.',
    methods: [
      {
        id: 'an_animais',
        label: 'Animais',
        heading: 'Animais',
        help: 'Espécie, linhagem, sexo, idade, peso e origem dos animais.',
      },
      {
        id: 'an_alojamento',
        label: 'Alojamento e manejo',
        heading: 'Alojamento e manejo',
        help: 'Condições de alojamento (animais por caixa, temperatura, ciclo claro-escuro), dieta, água e enriquecimento ambiental.',
      },
      {
        id: 'an_grupos',
        label: 'Grupos experimentais e controles',
        heading: 'Grupos experimentais',
        help: 'Os grupos, o que cada um recebeu e o número de animais por grupo.',
      },
      {
        id: 'an_amostra',
        label: 'Tamanho da amostra',
        heading: 'Tamanho da amostra',
        help: 'Como o número de animais foi definido, com o cálculo quando houver.',
      },
      {
        id: 'an_alocacao',
        label: 'Alocação aleatória e cegamento',
        heading: 'Alocação e cegamento',
        help: 'Como os animais foram distribuídos entre os grupos e quem sabia a alocação em cada fase.',
      },
      {
        id: 'an_procedimentos',
        label: 'Procedimentos experimentais',
        heading: 'Procedimentos experimentais',
        help: 'O que foi feito com os animais, quando e onde, incluindo anestesia, analgesia e método de eutanásia.',
      },
      {
        id: 'an_desfechos',
        label: 'Desfechos',
        heading: 'Desfechos',
        help: 'O que foi medido, como e quando, indicando o desfecho primário.',
      },
      analiseEstatistica,
    ],
    resultsBefore: [
      {
        id: 'an_exclusoes',
        label: 'Animais incluídos e excluídos',
        heading: 'Animais analisados',
        help: 'Número de animais analisados por grupo e, se algum foi excluído, quantos e por quê.',
      },
    ],
    resultsAfter: [
      {
        id: 'an_adversos',
        label: 'Eventos adversos',
        heading: 'Eventos adversos',
        help: 'Eventos adversos em cada grupo e o que foi feito. Se não houve, diga isso.',
      },
    ],
    mainResultHint:
      'Para cada desfecho, o resultado de cada grupo com medida de dispersão e a medida de efeito com intervalo de confiança.',
  },
  {
    id: 'computacional',
    name: 'Computacional / in silico',
    description: 'Modelos, simulações, algoritmos ou análises de grandes bases de dados.',
    guideline: 'TRIPOD para modelos preditivos; para os demais, boas práticas de reprodutibilidade',
    ethicsNote:
      'Estudos que usam apenas informações de acesso público ou bancos de dados agregados, sem possibilidade de identificar as pessoas, não são avaliados pelo sistema CEP/Conep (Resolução CNS 510/2016, art. 1º, parágrafo único). Se houver dados identificáveis, a submissão é necessária. Na dúvida, consulte o CEP da instituição.',
    designHint:
      'Informe o tipo de estudo (desenvolvimento de modelo, simulação, análise de dados secundários) e a pergunta computacional.',
    methods: [
      {
        id: 'cp_dados',
        label: 'Fontes de dados',
        heading: 'Fontes de dados',
        help: 'Bases usadas, versão, data de acesso, critérios de seleção e pré-processamento.',
      },
      {
        id: 'cp_modelo',
        label: 'Modelo ou algoritmo',
        heading: 'Modelo',
        help: 'O modelo, algoritmo ou simulação, seus parâmetros e por que foram escolhidos.',
      },
      {
        id: 'cp_implementacao',
        label: 'Implementação',
        heading: 'Implementação',
        help: 'Linguagem, bibliotecas e versões, e o hardware usado quando for relevante.',
      },
      {
        id: 'cp_validacao',
        label: 'Validação e métricas',
        heading: 'Validação',
        help: 'Como o desempenho foi avaliado: divisão treino/teste, validação cruzada, validação externa e métricas.',
      },
      {
        id: 'cp_reprodutibilidade',
        label: 'Disponibilidade de código e dados',
        heading: 'Disponibilidade de código',
        help: 'Onde o código e os dados podem ser acessados (repositório, DOI) ou por que não estão disponíveis.',
      },
      { ...analiseEstatistica, optional: true },
    ],
    resultsBefore: [],
    resultsAfter: [
      {
        id: 'cp_comparacao',
        label: 'Comparação com abordagens existentes',
        heading: 'Comparação com outras abordagens',
        help: 'Como o modelo se compara a métodos de referência ou já publicados, nas mesmas métricas.',
        optional: true,
      },
    ],
    mainResultHint: 'O desempenho do modelo ou o resultado da simulação, nas métricas definidas nos Métodos e com a incerteza.',
  },
  {
    id: 'comunicacao-breve',
    name: 'Comunicação breve',
    description: 'Um artigo original curto, para achados pontuais ou preliminares.',
    guideline: 'A diretriz do desenho original, em versão resumida',
    designHint: 'Uma frase com o tipo de estudo.',
    methods: [
      {
        id: 'cb_metodos',
        label: 'Métodos resumidos',
        help: 'Participantes ou amostras, intervenção ou exposição, procedimentos principais e desfechos, em poucos parágrafos.',
      },
      analiseEstatistica,
    ],
    resultsBefore: [],
    resultsAfter: [],
    wordLimit: {
      max: 2500,
      note: 'Comunicações breves costumam ter de 1.500 a 2.500 palavras, até 2 tabelas ou figuras e poucas referências. Confira as normas da revista.',
    },
  },
]

export function getStudyType(id: string | null): StudyType | null {
  return STUDY_TYPES.find((t) => t.id === id) ?? null
}
