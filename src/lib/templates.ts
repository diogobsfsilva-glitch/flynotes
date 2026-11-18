// Biblioteca de modelos de nota, organizada por categorias.
export interface BuiltinTemplate {
  id: string;
  name: string;
  icon: string;
  category: string;
  description: string;
  title: string;
  content: () => string;
}

export const TEMPLATE_CATEGORIES = ['Grupo hoteleiro', 'Gestão de projetos', 'Qualidade e melhoria contínua', 'Liderança e pessoas', 'Estratégia e finanças', 'Reuniões e gestão', 'Operações hoteleiras', 'Planeamento e produtividade', 'Pensar e decidir', 'Pessoal e família'];

const today = () => new Date().toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const shortDate = () => new Date().toLocaleDateString('pt-PT');
const todo = (...items: string[]) => `<ul data-type="taskList">${(items.length ? items : ['']).map((t) => `<li data-type="taskItem" data-checked="false"><p>${t}</p></li>`).join('')}</ul>`;
const bullets = (...items: string[]) => `<ul>${(items.length ? items : ['']).map((t) => `<li><p>${t}</p></li>`).join('')}</ul>`;
const table = (head: string[], rows = 3) =>
  `<table><tbody><tr>${head.map((h) => `<th><p>${h}</p></th>`).join('')}</tr>${Array.from({ length: rows }, () => `<tr>${head.map(() => '<td><p></p></td>').join('')}</tr>`).join('')}</tbody></table>`;
const field = (label: string, value = '') => `<p><strong>${label}:</strong> ${value}</p>`;

/** Ficha de receita: dados gerais, ingredientes, preparação e, no fim, lista de compras para marcar. */
function recipe(r: { people: string; time: string; level: string; cost: string; ingredients: string[]; steps: string[]; shopping: Record<string, string[]> }) {
  const info = `<table><tbody><tr>${['N.º pessoas', 'Tempo', 'Dificuldade', 'Custo'].map((h) => `<th><p>${h}</p></th>`).join('')}</tr><tr>${[r.people, r.time, r.level, r.cost].map((v) => `<td><p>${v}</p></td>`).join('')}</tr></tbody></table>`;
  const steps = `<ol>${r.steps.map((t) => `<li><p>${t}</p></li>`).join('')}</ol>`;
  const shop = Object.entries(r.shopping).map(([sec, items]) => `<h3>${sec}</h3>${todo(...items)}`).join('');
  return `${info}<h2>Ingredientes</h2>${bullets(...r.ingredients)}<h2>Preparação</h2>${steps}<h2>Notas e variações</h2><p></p><hr><h2>🛒 Lista de compras</h2><p><em>Marque o que já tem em casa ou o que já comprou.</em></p>${shop}`;
}


// ---------- Grupo hoteleiro (várias unidades) ----------
const HOTELS = ['Hotel A', 'Hotel B', 'Hotel C', 'Hotel D', 'Hotel E', 'Hotel F'];
const OUTLETS: [string, string][] = [
  ['Hotel A', 'Restaurante principal'], ['Hotel A', 'Bar do lobby'], ['Hotel A', 'Bar do terraço'],
  ['Hotel B', 'Restaurante'], ['Hotel B', 'Bar'],
  ['Hotel C', 'Restaurante'], ['Hotel C', 'Cafetaria'],
  ['Hotel D', 'Restaurante'], ['Hotel D', 'Bar'],
];
const hotelRows = (cols: number, extra: string[] = []) => [...HOTELS, ...extra].map((h) => `<tr><td><p><strong>${h}</strong></p></td>${'<td><p></p></td>'.repeat(cols)}</tr>`).join('');
const headRow = (cells: string[]) => `<tr>${cells.map((c) => `<th><p>${c}</p></th>`).join('')}</tr>`;
const hotelTable = (cols: string[], total = true) => `<table><tbody>${headRow(['Unidade', ...cols])}${hotelRows(cols.length, total ? ['Total grupo'] : [])}</tbody></table>`;
const hotelPick = () => `<p><strong>Unidade:</strong> ${HOTELS.map((h) => `☐ ${h}`).join('  ')}</p>`;

const HOTEL_GROUP: BuiltinTemplate[] = [
  {
    id: 'group-monthly', category: 'Grupo hoteleiro', name: 'Relatório mensal do grupo', icon: '📈', title: 'Relatório mensal do grupo — ',
    description: 'Indicadores das 6 unidades face a orçamento e ano anterior, com destaques e ações.',
    content: () => `${field('Mês')}${field('Preparado por')}<h2>Resumo executivo</h2><p></p><h2>Alojamento</h2>${hotelTable(['Ocupação %', 'ADR €', 'RevPAR €', 'vs Orç.', 'vs Ano ant.'])}<h2>Receitas</h2>${hotelTable(['Alojamento €', 'F&amp;B €', 'Outras €', 'Total €', 'vs Orç.'])}<h2>Resultados</h2>${hotelTable(['GOP €', 'GOP %', 'Custo pessoal %', 'vs Orç.'])}<h2>Satisfação dos hóspedes</h2>${hotelTable(['Booking', 'Google', 'TripAdvisor', 'Reclamações'], false)}<h2>Destaques por unidade</h2>${HOTELS.map((h) => `<h3>${h}</h3><ul><li><p></p></li></ul>`).join('')}<h2>Riscos e pontos de atenção</h2>${bullets()}<h2>Ações para o próximo mês</h2>${table(['Ação', 'Unidade', 'Responsável', 'Prazo'], 4)}`,
  },
  {
    id: 'group-gm-meeting', category: 'Grupo hoteleiro', name: 'Reunião de diretores de hotel', icon: '🏢', title: 'Reunião de diretores — ',
    description: 'Ronda pelas 6 unidades: números da semana, temas, pedidos à direção.',
    content: () => `${field('Data', today())}${field('Presentes')}<h2>Seguimento de ações anteriores</h2>${table(['Ação', 'Unidade', 'Responsável', 'Estado'], 3)}<h2>Números da semana</h2>${hotelTable(['Ocupação %', 'ADR €', 'Pickup', 'Comentário'])}<h2>Ronda pelas unidades</h2>${HOTELS.map((h) => `<h3>${h}</h3><p><strong>Destaques:</strong> </p><p><strong>Problemas:</strong> </p><p><strong>Pedidos à direção:</strong> </p>`).join('')}<h2>Temas transversais</h2>${bullets('Recursos humanos', 'Manutenção / CAPEX', 'Comercial e grupos', 'Programa de fidelização')}<h2>Decisões</h2>${bullets()}<h2>Novas ações</h2>${table(['Ação', 'Unidade', 'Responsável', 'Prazo'], 4)}`,
  },
  {
    id: 'group-visit', category: 'Grupo hoteleiro', name: 'Visita de direção a uma unidade', icon: '🔎', title: 'Visita — ',
    description: 'Ronda pela unidade com pontuação por área, restaurantes e bares, equipa e plano de ação.',
    content: () => `${hotelPick()}${field('Data', today())}${field('Recebido por')}<h2>Pontuação por área</h2><table><tbody>${headRow(['Área', 'Nota (1–5)', 'Observações'])}${['Fachada, entrada e lobby', 'Receção e concierge', 'Quartos (amostra visitada)', 'Pequeno-almoço', 'Restaurantes e bares', 'Spa / ginásio / rooftop', 'Salas de reunião', 'Áreas técnicas e back-office', 'Apresentação e farda da equipa', 'Sinalética e materiais do programa de fidelização'].map((a) => `<tr><td><p>${a}</p></td><td><p></p></td><td><p></p></td></tr>`).join('')}</tbody></table><h2>Restaurantes e bares da unidade</h2><table><tbody>${headRow(['Espaço', 'Nota (1–5)', 'Observações'])}${OUTLETS.map(([h, o]) => `<tr><td><p>${o} <em>(${h})</em></p></td><td><p></p></td><td><p></p></td></tr>`).join('')}</tbody></table><p class="muted"><em>Apague as linhas dos espaços de outras unidades.</em></p><h2>Conversa com a equipa</h2><p></p><h2>Pontos fortes</h2>${bullets()}<h2>A corrigir</h2>${bullets()}<h2>Plano de ação</h2>${table(['Ação', 'Responsável', 'Prazo', 'Feito'], 4)}`,
  },
  {
    id: 'group-revenue', category: 'Grupo hoteleiro', name: 'Revisão comercial e revenue', icon: '💶', title: 'Revisão comercial — semana ',
    description: 'Ocupação em carteira (OTB), pickup, ritmo de reservas, canais, grupos e decisões de preço.',
    content: () => `${field('Semana')}${field('Participantes')}<h2>Em carteira (on the books) — próximos 30 dias</h2>${hotelTable(['Ocupação OTB %', 'ADR OTB €', 'Pickup 7 dias', 'vs Ano ant.', 'vs Orç.'])}<h2>Mix de canais</h2>${hotelTable(['Site / direto %', 'Booking %', 'Expedia %', 'GDS / corporate %', 'Grupos / MICE %'], false)}<h2>Programa de fidelização</h2>${field('Novos membros')}${field('Estadias de membros')}${field('Receita via programa de fidelização')}<h2>Grupos e eventos em negociação</h2>${table(['Cliente', 'Unidade', 'Datas', 'Quartos', 'Estado'], 3)}<h2>Concorrência e mercado</h2><p></p><h2>Decisões de preço e restrições</h2>${table(['Unidade', 'Datas', 'Decisão', 'Responsável'], 3)}<h2>Ações</h2>${todo()}`,
  },
  {
    id: 'group-mice', category: 'Grupo hoteleiro', name: 'Ficha de grupo / MICE', icon: '🎤', title: 'Grupo — ',
    description: 'Pedido de grupo ou evento: alojamento, salas, F&B, audiovisuais, faturação e responsáveis.',
    content: () => `${hotelPick()}${field('Cliente / empresa')}${field('Contacto')}${field('Datas')}${field('N.º de participantes')}${field('Gestor do evento')}<h2>Alojamento</h2>${table(['Tipologia', 'Quartos', 'Noites', 'Tarifa €', 'Total €'], 3)}${field('Data limite da rooming list')}${field('Release')}<h2>Salas e montagem</h2>${table(['Dia', 'Sala', 'Horário', 'Montagem', 'Pessoas'], 3)}<h2>F&amp;B</h2>${table(['Dia', 'Serviço', 'Local', 'Pessoas', 'Preço €'], 4)}${field('Restrições alimentares')}<h2>Audiovisuais e extras</h2>${todo('Projetor e ecrã', 'Microfones', 'Wi-Fi dedicado', 'Sinalética', 'Transferes')}<h2>Condições comerciais</h2>${field('Valor total €')}${field('Sinal / pré-pagamento')}${field('Condições de cancelamento')}${field('Faturação para')}<h2>Checklist interna</h2>${todo('Contrato assinado', 'Sinal recebido', 'Rooming list recebida', 'Function sheet enviada aos departamentos', 'Briefing com a equipa', 'Fatura final emitida')}`,
  },
  {
    id: 'group-fb', category: 'Grupo hoteleiro', name: 'Relatório de F&B por espaço', icon: '🍽️', title: 'F&B — ',
    description: 'Couverts, receita, ticket médio e comentários dos 10 restaurantes e bares do grupo.',
    content: () => `${field('Período')}<h2>Resultados por espaço</h2><table><tbody>${headRow(['Unidade', 'Espaço', 'Couverts', 'Receita €', 'Ticket médio €', 'vs Orç.'])}${OUTLETS.map(([h, o]) => `<tr><td><p>${h}</p></td><td><p><strong>${o}</strong></p></td><td><p></p></td><td><p></p></td><td><p></p></td><td><p></p></td></tr>`).join('')}<tr><td><p><strong>Total</strong></p></td><td><p></p></td><td><p></p></td><td><p></p></td><td><p></p></td><td><p></p></td></tr></tbody></table><h2>Pequenos-almoços</h2>${hotelTable(['Pequenos-almoços servidos', 'Receita €', 'Comentários'], false)}<h2>Custo de matérias-primas</h2>${table(['Espaço', 'Custo comida %', 'Custo bebidas %'], 3)}<h2>Destaques e problemas</h2>${bullets()}<h2>Ações (cartas, preços, equipa)</h2>${todo()}`,
  },
  {
    id: 'group-complaint', category: 'Grupo hoteleiro', name: 'Reclamação e recuperação de serviço', icon: '🛎️', title: 'Reclamação — ',
    description: 'Registo da reclamação, nível no programa de fidelização, resposta, compensação e prevenção.',
    content: () => `${hotelPick()}${field('Hóspede')}${field('Quarto / reserva')}${field('Programa de fidelização', '☐ Não  ☐ Silver  ☐ Gold  ☐ Platinum')}${field('Canal', '☐ Presencial  ☐ Email  ☐ Booking  ☐ Google  ☐ TripAdvisor  ☐ Outro')}${field('Data')}<h2>O que aconteceu</h2><p></p><h2>Resposta dada ao hóspede</h2><p></p><h2>Compensação</h2><p>☐ Nenhuma  ☐ Upgrade  ☐ Amenity  ☐ Desconto  ☐ Noite oferecida  ☐ Outro: </p>${field('Valor €')}<h2>Causa</h2><p></p><h2>Prevenção</h2>${todo()}<h2>Seguimento</h2>${todo('Resposta pública à avaliação (se aplicável)', 'Contacto pós-estadia', 'Partilhar com a equipa no briefing')}`,
  },
  {
    id: 'group-vip', category: 'Grupo hoteleiro', name: 'Chegada VIP / programa de fidelização', icon: '👑', title: 'VIP — ',
    description: 'Preparação de chegada de hóspede VIP ou membro do programa de fidelização.',
    content: () => `${hotelPick()}${field('Hóspede')}${field('Datas')}${field('Quarto atribuído')}${field('Programa de fidelização', '☐ Silver (10%)  ☐ Gold (15%)  ☐ Platinum (20%)  ☐ VIP não membro')}${field('Motivo da estadia')}<h2>Preferências conhecidas</h2>${bullets('Tipo de almofada / quarto', 'Alimentação e alergias', 'Bebida preferida', 'Jornal / outros')}<h2>Preparação</h2>${todo('Upgrade verificado (sujeito a disponibilidade)', 'Amenity do programa de fidelização no quarto', 'Cartão de boas-vindas assinado pelo diretor', 'Inspeção final do quarto', 'Equipa da receção informada', 'Mesa reservada no restaurante (se pedido)')}<h2>Durante a estadia</h2><p></p><h2>Após a partida</h2>${todo('Atualizar o perfil do hóspede', 'Mensagem de agradecimento')}`,
  },
  {
    id: 'group-reviews', category: 'Grupo hoteleiro', name: 'Avaliações online da semana', icon: '⭐', title: 'Avaliações — semana ',
    description: 'Pontuações por plataforma e unidade, temas recorrentes e respostas pendentes.',
    content: () => `${field('Semana')}<h2>Pontuações</h2>${hotelTable(['Booking', 'Google', 'TripAdvisor', 'Expedia', 'N.º novas'], false)}<h2>Temas positivos recorrentes</h2>${bullets()}<h2>Temas negativos recorrentes</h2>${table(['Tema', 'Unidade', 'N.º menções', 'Ação'], 3)}<h2>Respostas pendentes</h2>${todo()}<h2>Colaboradores elogiados pelo nome</h2>${bullets()}`,
  },
  {
    id: 'group-capex', category: 'Grupo hoteleiro', name: 'Plano de manutenção e CAPEX', icon: '🏗️', title: 'CAPEX ',
    description: 'Investimentos e manutenção por unidade: prioridade, orçamento, fornecedor e estado.',
    content: () => `${field('Ano')}<h2>Resumo por unidade</h2>${hotelTable(['Orçamento €', 'Comprometido €', 'Executado €', '% execução'])}<h2>Projetos</h2>${table(['Projeto', 'Unidade', 'Prioridade', 'Orçamento €', 'Fornecedor', 'Início', 'Fim', 'Estado'], 6)}<h2>Manutenção preventiva</h2>${table(['Equipamento / sistema', 'Unidade', 'Periodicidade', 'Última', 'Próxima'], 4)}<h2>Riscos e urgências</h2>${bullets()}`,
  },
  {
    id: 'group-onboarding', category: 'Grupo hoteleiro', name: 'Acolhimento de novo colaborador', icon: '🤗', title: 'Acolhimento — ',
    description: 'Primeiros dias de um novo colaborador numa unidade do grupo.',
    content: () => `${field('Nome')}${field('Função')}${hotelPick()}${field('Data de entrada')}${field('Responsável / padrinho')}<h2>Antes do primeiro dia</h2>${todo('Contrato e documentação', 'Farda e cacifo', 'Acessos aos sistemas (PMS, email)', 'Cartão de acesso', 'Plano da primeira semana')}<h2>Primeiro dia</h2>${todo('Boas-vindas do diretor', 'Visita à unidade e aos outros departamentos', 'Apresentação dos valores e da história do grupo', 'Normas de segurança e emergência', 'Programa de fidelização: vantagens e como inscrever hóspedes')}<h2>Primeiras semanas</h2>${todo('Formação na função', 'Acompanhamento com colega experiente', 'Conversa ao fim de 15 dias', 'Avaliação ao fim do período experimental')}<h2>Notas</h2><p></p>`,
  },
  {
    id: 'group-initiative', category: 'Grupo hoteleiro', name: 'Iniciativa estratégica', icon: '🧩', title: 'Iniciativa: ',
    description: 'Ficha de uma iniciativa do plano estratégico: objetivo, impacto, investimento e marcos.',
    content: () => `${field('Pilar estratégico')}${field('Responsável')}${field('Unidades abrangidas')}<h2>Objetivo</h2><p></p><h2>Situação atual</h2><p></p><h2>Impacto esperado</h2>${table(['Indicador', 'Atual', 'Meta', 'Prazo'], 3)}<h2>Investimento e retorno</h2>${field('Investimento €')}${field('Retorno esperado')}${field('Payback')}<h2>Marcos</h2>${table(['Marco', 'Data', 'Responsável', 'Estado'], 4)}<h2>Riscos</h2>${bullets()}<h2>Próximos passos</h2>${todo()}`,
  },
];

// ---------- Métodos profissionais (texto original, baseado em métodos de gestão consagrados) ----------
const rowsOf = (labels: string[], extraCols: number) => labels.map((l) => `<tr><td><p><strong>${l}</strong></p></td>${'<td><p></p></td>'.repeat(extraCols)}</tr>`).join('');
const grid = (head: string[], labels: string[]) => `<table><tbody>${headRow(head)}${rowsOf(labels, head.length - 1)}</tbody></table>`;
const tip = (t: string) => `<blockquote><p><em>💡 ${t}</em></p></blockquote>`;

const PRO: BuiltinTemplate[] = [
  // Gestão de projetos
  {
    id: 'pm-charter', category: 'Gestão de projetos', name: 'Ficha de abertura de projeto', icon: '📜', title: 'Projeto: ',
    description: 'Documento que autoriza o projeto: objetivo, âmbito, patrocinador, orçamento, marcos e critérios de sucesso.',
    content: () => `${tip('Uma página, aprovada pelo patrocinador antes de começar. Se não cabe numa página, o âmbito ainda não está claro.')}${field('Patrocinador')}${field('Gestor do projeto')}${field('Data de aprovação')}<h2>Porquê (problema ou oportunidade)</h2><p></p><h2>Objetivo SMART</h2><p><em>Específico, mensurável, atingível, relevante e com prazo.</em></p><p></p><h2>Âmbito</h2>${grid(['', 'Descrição'], ['Inclui', 'Não inclui', 'Pressupostos', 'Restrições'])}<h2>Entregáveis e marcos</h2>${table(['Entregável / marco', 'Data', 'Responsável'], 4)}<h2>Orçamento e recursos</h2>${table(['Rubrica', 'Valor €', 'Observações'], 3)}<h2>Equipa</h2>${table(['Nome', 'Papel', 'Dedicação %'], 3)}<h2>Riscos principais</h2>${bullets()}<h2>Critérios de sucesso</h2>${todo()}<h2>Aprovação</h2>${field('Patrocinador — data e decisão')}`,
  },
  {
    id: 'pm-raci', category: 'Gestão de projetos', name: 'Matriz RACI', icon: '🧑‍🤝‍🧑', title: 'RACI — ',
    description: 'Quem é Responsável, quem Aprova, quem é Consultado e quem é Informado em cada atividade.',
    content: () => `${tip('R = executa · A = aprova e responde pelo resultado (só um por linha) · C = é consultado antes · I = é informado depois.')}<table><tbody>${headRow(['Atividade / decisão', 'Pessoa 1', 'Pessoa 2', 'Pessoa 3', 'Pessoa 4', 'Pessoa 5'])}${Array.from({ length: 6 }, () => `<tr>${'<td><p></p></td>'.repeat(6)}</tr>`).join('')}</tbody></table><h2>Verificações</h2>${todo('Cada linha tem exatamente um A', 'Cada linha tem pelo menos um R', 'Ninguém tem demasiados R', 'Os C são mesmo necessários (cada C atrasa a decisão)')}`,
  },
  {
    id: 'pm-risks', category: 'Gestão de projetos', name: 'Registo de riscos', icon: '🛡️', title: 'Riscos — ',
    description: 'Riscos com probabilidade, impacto, pontuação, resposta e responsável.',
    content: () => `${tip('Pontuação = probabilidade (1–5) × impacto (1–5). Acima de 15: tratar já; 8–15: plano de resposta; abaixo de 8: monitorizar.')}${table(['#', 'Risco (se… então…)', 'Prob.', 'Impacto', 'Pontuação', 'Resposta (evitar, mitigar, transferir, aceitar)', 'Responsável', 'Estado'], 6)}<h2>Riscos que se concretizaram (problemas)</h2>${table(['Problema', 'Ação', 'Responsável', 'Prazo'], 2)}`,
  },
  {
    id: 'pm-stakeholders', category: 'Gestão de projetos', name: 'Mapa de partes interessadas', icon: '🗺️', title: 'Partes interessadas — ',
    description: 'Quem influencia ou é afetado pelo projeto, o seu poder e interesse, e como os envolver.',
    content: () => `<h2>Matriz poder / interesse</h2><table><tbody><tr><th><p></p></th><th><p>Interesse baixo</p></th><th><p>Interesse alto</p></th></tr><tr><th><p>Poder alto</p></th><td><p><strong>Manter satisfeito</strong></p><ul><li><p></p></li></ul></td><td><p><strong>Gerir de perto</strong></p><ul><li><p></p></li></ul></td></tr><tr><th><p>Poder baixo</p></th><td><p><strong>Monitorizar</strong></p><ul><li><p></p></li></ul></td><td><p><strong>Manter informado</strong></p><ul><li><p></p></li></ul></td></tr></tbody></table><h2>Plano de envolvimento</h2>${table(['Parte interessada', 'O que lhe importa', 'Posição atual', 'Posição desejada', 'Como envolver', 'Frequência'], 4)}`,
  },
  {
    id: 'pm-status', category: 'Gestão de projetos', name: 'Relatório de estado do projeto', icon: '🚦', title: 'Estado do projeto — ',
    description: 'Semáforo de prazo, custo e âmbito, progresso, próximos passos e decisões necessárias.',
    content: () => `${field('Projeto')}${field('Período')}${field('Estado geral', '🟢 No caminho  🟡 Em risco  🔴 Fora do plano')}${grid(['Dimensão', 'Estado', 'Comentário'], ['Prazo', 'Custo', 'Âmbito', 'Qualidade', 'Equipa'])}<h2>Feito neste período</h2>${bullets()}<h2>Próximo período</h2>${todo()}<h2>Riscos e problemas</h2>${bullets()}<h2>Decisões que preciso da direção</h2><ol><li><p></p></li></ol>`,
  },
  {
    id: 'pm-change', category: 'Gestão de projetos', name: 'Pedido de alteração', icon: '🔀', title: 'Pedido de alteração — ',
    description: 'Alteração ao âmbito, prazo ou custo de um projeto, com impacto e decisão.',
    content: () => `${field('Projeto')}${field('Pedido por')}${field('Data', shortDate())}<h2>Alteração pedida</h2><p></p><h2>Justificação</h2><p></p><h2>Impacto</h2>${grid(['Dimensão', 'Impacto'], ['Prazo', 'Custo €', 'Âmbito', 'Riscos', 'Outros projetos'])}<h2>Alternativas consideradas</h2>${bullets()}<h2>Decisão</h2><p>☐ Aprovado  ☐ Aprovado com condições  ☐ Rejeitado  ☐ Adiado</p>${field('Decidido por / data')}`,
  },
  // Qualidade e melhoria contínua
  {
    id: 'q-a3', category: 'Qualidade e melhoria contínua', name: 'A3 — resolução de problemas', icon: '🧾', title: 'A3: ',
    description: 'Método lean de uma página: contexto, situação atual, objetivo, causas, contramedidas e seguimento.',
    content: () => `${tip('O A3 conta uma história do problema à solução numa única página. Partilhe o rascunho com quem é afetado antes de decidir.')}${field('Autor')}${field('Mentor')}${field('Data', shortDate())}<h2>1. Contexto — porque importa</h2><p></p><h2>2. Situação atual (factos e números)</h2><p></p><h2>3. Objetivo — o que queremos atingir e até quando</h2><p></p><h2>4. Análise das causas</h2><p><em>Use os 5 porquês ou o diagrama de causa-efeito.</em></p>${bullets()}<h2>5. Contramedidas propostas</h2>${table(['Contramedida', 'Causa que ataca', 'Esforço', 'Impacto'], 3)}<h2>6. Plano de implementação</h2>${table(['O quê', 'Quem', 'Quando', 'Estado'], 4)}<h2>7. Seguimento — como vamos medir e corrigir</h2><p></p>`,
  },
  {
    id: 'q-5why', category: 'Qualidade e melhoria contínua', name: '5 porquês', icon: '❓', title: '5 porquês — ',
    description: 'Chegar à causa de fundo perguntando "porquê?" até encontrar algo que se possa corrigir.',
    content: () => `${tip('Cada resposta tem de ser um facto verificável, não uma opinião. Pare quando chegar a uma causa que dependa de um processo, não de uma pessoa.')}<h2>Problema (o quê, onde, quando, quanto)</h2><p></p><ol><li><p><strong>Porquê?</strong> </p></li><li><p><strong>Porquê?</strong> </p></li><li><p><strong>Porquê?</strong> </p></li><li><p><strong>Porquê?</strong> </p></li><li><p><strong>Porquê?</strong> </p></li></ol><h2>Causa de fundo</h2><p></p><h2>Ação corretiva</h2>${table(['Ação', 'Responsável', 'Prazo', 'Como confirmamos que resultou'], 2)}`,
  },
  {
    id: 'q-fishbone', category: 'Qualidade e melhoria contínua', name: 'Diagrama de causa-efeito', icon: '🐟', title: 'Causa-efeito — ',
    description: 'Espinha de peixe (Ishikawa): causas possíveis agrupadas por categoria, adaptadas a hotelaria.',
    content: () => `<h2>Efeito (problema)</h2><p></p>${grid(['Categoria', 'Causas possíveis'], ['👥 Pessoas (formação, turnos, comunicação)', '📋 Métodos (procedimentos, normas)', '🧴 Materiais (amenities, consumíveis, fornecedores)', '⚙️ Equipamentos (sistemas, máquinas, PMS)', '🏢 Ambiente (espaço, ruído, sazonalidade)', '📏 Medição (indicadores, inspeções)'])}<h2>Causas mais prováveis (votar e confirmar com dados)</h2><ol><li><p></p></li><li><p></p></li><li><p></p></li></ol><h2>Próximos passos</h2>${todo()}`,
  },
  {
    id: 'q-pdca', category: 'Qualidade e melhoria contínua', name: 'Ciclo PDCA', icon: '🔁', title: 'PDCA — ',
    description: 'Planear, executar, verificar e agir: testar uma melhoria em pequena escala antes de a generalizar.',
    content: () => `<h2>Planear</h2>${field('Problema / oportunidade')}${field('Hipótese: se fizermos… então…')}${field('Indicador e meta')}${field('Onde e quanto tempo vamos testar')}<h2>Executar</h2>${todo()}${field('O que aconteceu durante o teste')}<h2>Verificar</h2>${table(['Indicador', 'Antes', 'Depois', 'Meta'], 2)}${field('A hipótese confirmou-se?')}<h2>Agir</h2><p>☐ Adotar como norma  ☐ Ajustar e repetir  ☐ Abandonar</p>${field('Próximo ciclo')}`,
  },
  {
    id: 'q-fmea', category: 'Qualidade e melhoria contínua', name: 'Análise de modos de falha (FMEA)', icon: '🧯', title: 'FMEA — ',
    description: 'Antecipar o que pode falhar num processo e priorizar pela gravidade, ocorrência e deteção.',
    content: () => `${tip('Prioridade de risco = gravidade × ocorrência × deteção (cada um de 1 a 10). Trate primeiro os valores mais altos e todas as gravidades 9–10.')}${field('Processo')}${table(['Passo', 'Modo de falha', 'Efeito no hóspede', 'Gravidade', 'Causa', 'Ocorrência', 'Controlo atual', 'Deteção', 'Prioridade', 'Ação'], 5)}`,
  },
  {
    id: 'q-sipoc', category: 'Qualidade e melhoria contínua', name: 'Mapa de processo (SIPOC)', icon: '🔗', title: 'SIPOC — ',
    description: 'Fornecedores, entradas, processo, saídas e clientes: visão geral de um processo antes de o melhorar.',
    content: () => `${field('Processo')}${field('Início e fim do processo')}<table><tbody>${headRow(['Fornecedores', 'Entradas', 'Processo (5–7 passos)', 'Saídas', 'Clientes'])}${Array.from({ length: 6 }, () => `<tr>${'<td><p></p></td>'.repeat(5)}</tr>`).join('')}</tbody></table><h2>Requisitos dos clientes</h2>${bullets()}<h2>Indicadores do processo</h2>${table(['Indicador', 'Atual', 'Meta'], 3)}`,
  },
  {
    id: 'q-kaizen', category: 'Qualidade e melhoria contínua', name: 'Sugestão de melhoria (kaizen)', icon: '🌱', title: 'Melhoria: ',
    description: 'Pequena melhoria proposta por um colaborador: antes, depois e ganho.',
    content: () => `${field('Proposto por')}${field('Departamento / unidade')}${field('Data', shortDate())}<table><tbody>${headRow(['Antes', 'Depois'])}<tr><td><p></p></td><td><p></p></td></tr></tbody></table><h2>Ganho</h2><p>☐ Tempo  ☐ Custo  ☐ Qualidade  ☐ Segurança  ☐ Satisfação do hóspede  ☐ Ambiente</p>${field('Estimativa do ganho')}<h2>Decisão</h2><p>☐ Implementar  ☐ Testar  ☐ Não avançar</p>${field('Reconhecimento ao colaborador')}`,
  },
  // Liderança e pessoas
  {
    id: 'lp-sbi', category: 'Liderança e pessoas', name: 'Preparar feedback (SBI)', icon: '💬', title: 'Feedback — ',
    description: 'Situação, comportamento e impacto: feedback concreto, sem juízos sobre a pessoa.',
    content: () => `${tip('Descreva o que observou, não o que acha que a pessoa é. Depois ouça a perspetiva dela antes de combinar o próximo passo.')}${field('Para')}${field('Tipo', '☐ Reconhecimento  ☐ Ajuste')}<h2>Situação — quando e onde</h2><p></p><h2>Comportamento — o que vi ou ouvi</h2><p></p><h2>Impacto — que efeito teve (no hóspede, na equipa, no resultado)</h2><p></p><h2>Pergunta para abrir a conversa</h2><p></p><h2>O que combinámos</h2>${todo()}`,
  },
  {
    id: 'lp-grow', category: 'Liderança e pessoas', name: 'Conversa de coaching (GROW)', icon: '🧭', title: 'Coaching — ',
    description: 'Objetivo, realidade, opções e vontade: conduzir uma conversa em que a pessoa encontra o caminho.',
    content: () => `${field('Com')}${field('Data', shortDate())}<h2>G — Objetivo</h2><p><em>O que queres conseguir com esta conversa? E a mais longo prazo?</em></p><p></p><h2>R — Realidade</h2><p><em>O que está a acontecer agora? O que já tentaste? O que te impede?</em></p><p></p><h2>O — Opções</h2><p><em>O que poderias fazer? E se não houvesse restrições? Que mais?</em></p>${bullets()}<h2>W — Vontade e próximo passo</h2><p><em>O que vais fazer, quando, e de 1 a 10 qual é o teu compromisso?</em></p>${todo()}`,
  },
  {
    id: 'lp-idp', category: 'Liderança e pessoas', name: 'Plano de desenvolvimento individual', icon: '🪜', title: 'PDI — ',
    description: 'Objetivos de carreira e competências, com ações de aprendizagem na prática, com outros e em formação.',
    content: () => `${field('Colaborador')}${field('Função atual')}${field('Função ambicionada / horizonte')}${tip('Uma regra prática: a maior parte do desenvolvimento vem de experiências no trabalho, uma parte de aprender com outros e uma parte menor de formação formal.')}<h2>Pontos fortes a potenciar</h2>${bullets()}<h2>Competências a desenvolver</h2>${table(['Competência', 'Nível atual (1–5)', 'Nível alvo', 'Como vamos medir'], 3)}<h2>Ações</h2>${grid(['Tipo', 'Ação', 'Prazo'], ['Experiência no trabalho (projeto, substituição, rotação)', 'Com outros (mentor, acompanhamento, visita a outra unidade)', 'Formação (curso, leitura, certificação)'])}<h2>Revisões</h2>${todo('3 meses', '6 meses', '12 meses')}`,
  },
  {
    id: 'lp-delegate', category: 'Liderança e pessoas', name: 'Delegar uma tarefa', icon: '🤲', title: 'Delegar: ',
    description: 'O quê, porquê, resultado esperado, nível de autonomia, recursos e pontos de controlo.',
    content: () => `${field('Tarefa / projeto')}${field('Delegado a')}${field('Prazo')}<h2>Porque é importante</h2><p></p><h2>Como sabemos que ficou bem feito</h2>${bullets()}<h2>Nível de autonomia</h2><p>☐ 1. Recolhe informação e eu decido  ☐ 2. Propõe e eu aprovo  ☐ 3. Decide e informa-me  ☐ 4. Decide e não precisa de informar</p><h2>Recursos e limites (orçamento, pessoas, o que não pode fazer)</h2><p></p><h2>Pontos de controlo</h2>${table(['Data', 'O que revemos'], 3)}`,
  },
  {
    id: 'lp-star', category: 'Liderança e pessoas', name: 'Entrevista por competências (STAR)', icon: '🎯', title: 'Entrevista STAR — ',
    description: 'Perguntas sobre situações reais e avaliação de cada resposta: situação, tarefa, ação, resultado.',
    content: () => `${field('Candidato')}${field('Função')}${field('Data', shortDate())}${tip('Peça exemplos concretos ("conte-me uma vez em que…"). Respostas no condicional ("eu faria…") valem menos do que factos.')}${['Orientação para o hóspede', 'Liderança de equipa', 'Resolução de problemas sob pressão', 'Trabalho com outros departamentos'].map((c) => `<h3>${c}</h3>${grid(['', 'Notas'], ['Pergunta', 'Situação', 'Tarefa', 'Ação', 'Resultado', 'Nota (1–5)'])}`).join('')}<h2>Recomendação</h2><p>☐ Avançar  ☐ Em espera  ☐ Não avançar</p>`,
  },
  // Estratégia e finanças
  {
    id: 'sf-premortem', category: 'Estratégia e finanças', name: 'Pre-mortem', icon: '🔮', title: 'Pre-mortem — ',
    description: 'Imaginar que o projeto falhou daqui a um ano e listar porquê, para prevenir antes de começar.',
    content: () => `${tip('Cada pessoa escreve sozinha durante alguns minutos antes de partilhar. Assim aparecem os riscos que ninguém quer dizer em voz alta.')}${field('Projeto / decisão')}${field('Data', shortDate())}<h2>Cenário</h2><p>Estamos daqui a 12 meses e o projeto falhou claramente. O que aconteceu?</p><h2>Razões da falha (uma por linha)</h2>${bullets('', '', '')}<h2>As mais prováveis e graves</h2>${table(['Razão', 'Probabilidade', 'Gravidade', 'Prevenção', 'Responsável'], 3)}<h2>O que muda no plano</h2>${todo()}`,
  },
  {
    id: 'sf-aar', category: 'Estratégia e finanças', name: 'Revisão pós-ação', icon: '🎖️', title: 'Revisão pós-ação — ',
    description: 'Quatro perguntas logo a seguir a um evento ou operação: o que era suposto, o que aconteceu, porquê, e o que fazer.',
    content: () => `${tip('Faça-a logo a seguir, com quem esteve envolvido, sem procurar culpados.')}${field('Evento / operação')}${field('Data', shortDate())}${field('Participantes')}<h2>1. O que era suposto acontecer?</h2><p></p><h2>2. O que aconteceu realmente?</h2><p></p><h2>3. Porque houve diferença?</h2>${bullets()}<h2>4. O que vamos manter e o que vamos mudar?</h2>${grid(['', 'Notas'], ['Manter', 'Mudar'])}<h2>Ações</h2>${table(['Ação', 'Responsável', 'Prazo'], 3)}`,
  },
  {
    id: 'sf-bizcase', category: 'Estratégia e finanças', name: 'Business case', icon: '💼', title: 'Business case: ',
    description: 'Justificação de investimento: opções, custos, benefícios, retorno, riscos e recomendação.',
    content: () => `${field('Proponente')}${field('Data', shortDate())}<h2>Resumo e recomendação</h2><p></p><h2>Problema ou oportunidade</h2><p></p><h2>Opções analisadas</h2>${table(['Opção', 'Investimento €', 'Benefício anual €', 'Payback', 'Risco'], 3)}<p><em>Inclua sempre a opção "não fazer nada".</em></p><h2>Custos e benefícios da opção recomendada</h2>${table(['Rubrica', 'Ano 0', 'Ano 1', 'Ano 2', 'Ano 3'], 4)}${field('VAL / TIR')}<h2>Pressupostos</h2>${bullets()}<h2>Riscos e mitigação</h2>${bullets()}<h2>Plano de implementação</h2>${table(['Marco', 'Data'], 3)}`,
  },
  {
    id: 'sf-variance', category: 'Estratégia e finanças', name: 'Análise de desvios orçamentais', icon: '📉', title: 'Desvios — ',
    description: 'Real vs orçamento por rubrica, explicação dos desvios relevantes e ações corretivas.',
    content: () => `${field('Período')}${field('Unidade / centro de custo')}${tip('Explique apenas os desvios acima de um limiar combinado (por exemplo ±5% ou ±5 000 €), separando volume, preço e eficiência.')}${grid(['Rubrica', 'Real €', 'Orçamento €', 'Desvio €', 'Desvio %', 'Explicação'], ['Receita de alojamento', 'Receita de F&B', 'Outras receitas', 'Custos com pessoal', 'Custo das mercadorias', 'Energia e água', 'Manutenção', 'Comissões e distribuição', 'Marketing', 'GOP'])}<h2>Ações corretivas</h2>${table(['Ação', 'Impacto esperado €', 'Responsável', 'Prazo'], 3)}<h2>Previsão revista para o ano</h2><p></p>`,
  },
  {
    id: 'sf-canvas', category: 'Estratégia e finanças', name: 'Modelo de negócio numa página', icon: '🧱', title: 'Modelo de negócio — ',
    description: 'Os nove blocos de um modelo de negócio: clientes, proposta de valor, canais, receitas, custos e mais.',
    content: () => grid(['Bloco', 'Notas'], ['Segmentos de clientes', 'Proposta de valor', 'Canais', 'Relação com clientes', 'Fontes de receita', 'Recursos-chave', 'Atividades-chave', 'Parcerias-chave', 'Estrutura de custos']) + `<h2>Hipóteses a validar</h2>${todo()}`,
  },
  {
    id: 'sf-pestel', category: 'Estratégia e finanças', name: 'Análise PESTEL', icon: '🌍', title: 'PESTEL — ',
    description: 'Fatores externos políticos, económicos, sociais, tecnológicos, ambientais e legais, e o seu impacto.',
    content: () => `${field('Mercado / horizonte')}${grid(['Fator', 'Tendências', 'Impacto (+/−)', 'Implicação para nós'], ['Político', 'Económico', 'Social', 'Tecnológico', 'Ambiental', 'Legal'])}<h2>Conclusões</h2>${bullets()}`,
  },
  {
    id: 'sf-compset', category: 'Estratégia e finanças', name: 'Benchmark de concorrência', icon: '🏁', title: 'Concorrência — ',
    description: 'Comparação com hotéis concorrentes: preço, avaliações, oferta e posicionamento.',
    content: () => `${field('Unidade')}${field('Data de recolha', shortDate())}${table(['Hotel', 'Categoria', 'Preço médio €', 'Booking', 'Google', 'Quartos', 'Diferenciação'], 5)}<h2>Onde estamos melhor</h2>${bullets()}<h2>Onde estamos pior</h2>${bullets()}<h2>Implicações (preço, produto, comunicação)</h2>${todo()}`,
  },
  {
    id: 'sf-memo', category: 'Estratégia e finanças', name: 'Memorando de decisão', icon: '✉️', title: 'Memorando: ',
    description: 'Texto corrido, curto e completo, para preparar uma decisão sem diapositivos.',
    content: () => `${field('Para')}${field('De')}${field('Data', shortDate())}${field('Decisão pedida até')}${tip('Escreva frases completas. Um bom memorando responde às objeções antes de serem feitas e termina com um pedido claro.')}<h2>O que proponho (em 2 frases)</h2><p></p><h2>Contexto</h2><p></p><h2>Análise</h2><p></p><h2>Alternativas e porque as afasto</h2><p></p><h2>Riscos e como os mitigamos</h2><p></p><h2>O que preciso que decidam</h2><ol><li><p></p></li></ol>`,
  },
];

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  ...HOTEL_GROUP,
  ...PRO,
  // ---------- Reuniões e gestão ----------
  {
    id: 'meeting', category: 'Reuniões e gestão', name: 'Notas de reunião', icon: '🤝', title: 'Reunião — ',
    description: 'Agenda, notas, decisões e próximos passos com responsáveis.',
    content: () => `${field('Data', today())}${field('Participantes')}${field('Objetivo')}<h2>Agenda</h2><ol><li><p></p></li></ol><h2>Notas</h2><p></p><h2>Decisões</h2>${bullets()}<h2>Próximos passos</h2>${table(['Ação', 'Responsável', 'Prazo'], 3)}`,
  },
  {
    id: 'oneonone', category: 'Reuniões e gestão', name: 'Reunião 1:1', icon: '👥', title: '1:1 — ',
    description: 'Conversa individual com um colaborador: estado, bloqueios, desenvolvimento.',
    content: () => `${field('Colaborador')}${field('Data', shortDate())}<h2>Como estás?</h2><p></p><h2>Prioridades desde a última conversa</h2>${todo()}<h2>Bloqueios e pedidos de apoio</h2>${bullets()}<h2>Feedback</h2><p><em>Do colaborador:</em> </p><p><em>Para o colaborador:</em> </p><h2>Desenvolvimento e carreira</h2><p></p><h2>Compromissos até à próxima</h2>${todo()}`,
  },
  {
    id: 'board', category: 'Reuniões e gestão', name: 'Reunião de direção', icon: '🏛️', title: 'Reunião de direção — ',
    description: 'Indicadores, pontos de decisão, riscos e seguimento de ações anteriores.',
    content: () => `${field('Data', today())}${field('Presentes')}<h2>Seguimento de ações anteriores</h2>${table(['Ação', 'Responsável', 'Estado'], 3)}<h2>Indicadores do período</h2>${table(['Indicador', 'Real', 'Orçamento', 'Desvio'], 4)}<h2>Pontos para decisão</h2><ol><li><p></p></li></ol><h2>Riscos e alertas</h2>${bullets()}<h2>Decisões tomadas</h2>${bullets()}<h2>Novas ações</h2>${table(['Ação', 'Responsável', 'Prazo'], 3)}`,
  },
  {
    id: 'weeklyreport', category: 'Reuniões e gestão', name: 'Relatório semanal', icon: '📊', title: `Relatório semanal — ${shortDate()}`,
    description: 'Resumo para a chefia ou equipa: resultados, destaques, problemas e plano.',
    content: () => `<h2>Resumo em 3 linhas</h2><p></p><h2>Resultados da semana</h2>${table(['Indicador', 'Semana', 'Objetivo', 'Variação'], 3)}<h2>Destaques</h2>${bullets()}<h2>Problemas e como estão a ser resolvidos</h2>${bullets()}<h2>Prioridades da próxima semana</h2>${todo()}<h2>Onde preciso de apoio</h2><p></p>`,
  },
  {
    id: 'interview', category: 'Reuniões e gestão', name: 'Entrevista de candidato', icon: '🧑‍💼', title: 'Entrevista — ',
    description: 'Guião e avaliação estruturada por competências.',
    content: () => `${field('Candidato')}${field('Função')}${field('Data', shortDate())}${field('Entrevistador(es)')}<h2>Percurso e motivação</h2><p></p><h2>Perguntas por competência</h2>${table(['Competência', 'Pergunta', 'Evidência', 'Nota (1–5)'], 4)}<h2>Pontos fortes</h2>${bullets()}<h2>Pontos de atenção</h2>${bullets()}<h2>Expectativas (salário, disponibilidade)</h2><p></p><h2>Recomendação</h2><p>☐ Avançar  ☐ Em espera  ☐ Não avançar</p>`,
  },
  {
    id: 'review', category: 'Reuniões e gestão', name: 'Avaliação de desempenho', icon: '⭐', title: 'Avaliação de desempenho — ',
    description: 'Objetivos, competências, feedback e plano de desenvolvimento.',
    content: () => `${field('Colaborador')}${field('Função')}${field('Período')}<h2>Objetivos do período</h2>${table(['Objetivo', 'Resultado', 'Avaliação'], 4)}<h2>Competências</h2>${table(['Competência', 'Avaliação (1–5)', 'Comentário'], 5)}<h2>Principais conquistas</h2>${bullets()}<h2>Áreas de melhoria</h2>${bullets()}<h2>Objetivos para o próximo período</h2>${todo()}<h2>Plano de desenvolvimento</h2>${table(['Ação de formação / experiência', 'Prazo'], 2)}`,
  },
  // ---------- Operações hoteleiras ----------
  {
    id: 'visit', category: 'Operações hoteleiras', name: 'Visita / auditoria de hotel', icon: '🏨', title: 'Visita — ',
    description: 'Avaliação de uma unidade com pontuação por área e plano de ação.',
    content: () => `${field('Hotel')}${field('Data', today())}${field('Acompanhado por')}<h2>Avaliação por área</h2>${table(['Área', 'Nota (1–5)', 'Observações'], 0).replace('</tbody>', ['Fachada e entrada', 'Receção', 'Quartos', 'Restauração / bar', 'Spa / piscina', 'Áreas técnicas', 'Equipa e farda'].map((a) => `<tr><td><p>${a}</p></td><td><p></p></td><td><p></p></td></tr>`).join('') + '</tbody>')}<h2>Pontos positivos</h2>${bullets()}<h2>A melhorar</h2>${bullets()}<h2>Fotografias</h2><p></p><h2>Plano de ação</h2>${table(['Ação', 'Responsável', 'Prazo'], 3)}`,
  },
  {
    id: 'roomcheck', category: 'Operações hoteleiras', name: 'Inspeção de quarto', icon: '🛏️', title: 'Inspeção quarto ',
    description: 'Checklist completa de quarto antes da entrega ao hóspede.',
    content: () => `${field('Quarto n.º')}${field('Data', shortDate())}${field('Inspetor(a)')}<h2>Entrada e geral</h2>${todo('Porta, fechadura e cartão a funcionar', 'Cheiro e temperatura adequados', 'Iluminação toda a funcionar', 'Sem pó em superfícies e rodapés')}<h2>Cama e roupa</h2>${todo('Cama feita segundo o padrão', 'Lençóis sem manchas nem cabelos', 'Almofadas e mantas extra no roupeiro')}<h2>Casa de banho</h2>${todo('Loiças e torneiras sem calcário', 'Toalhas completas e bem dobradas', 'Amenities repostos', 'Ralo e sifão limpos', 'Secador a funcionar')}<h2>Equipamentos</h2>${todo('TV e comando', 'Ar condicionado', 'Minibar reposto', 'Cofre aberto e com instruções', 'Wi-Fi com informação visível')}<h2>Anomalias para manutenção</h2>${bullets()}<p><strong>Resultado:</strong> ☐ Aprovado  ☐ Reprovado</p>`,
  },
  {
    id: 'dailybriefing', category: 'Operações hoteleiras', name: 'Briefing diário de operações', icon: '☀️', title: `Briefing — ${shortDate()}`,
    description: 'Reunião da manhã: ocupação, chegadas VIP, grupos, eventos e alertas.',
    content: () => `<h2>Números do dia</h2>${table(['Ocupação', 'Chegadas', 'Partidas', 'ADR', 'Grupos'], 1)}<h2>Hóspedes VIP e pedidos especiais</h2>${table(['Nome', 'Quarto', 'Pedido / atenção'], 3)}<h2>Eventos e grupos</h2>${bullets()}<h2>Manutenção e quartos fora de serviço</h2>${bullets()}<h2>Reclamações das últimas 24 h</h2>${bullets()}<h2>Mensagem para a equipa</h2><p></p><h2>Ações</h2>${todo()}`,
  },
  {
    id: 'incident', category: 'Operações hoteleiras', name: 'Relatório de incidente', icon: '⚠️', title: 'Incidente — ',
    description: 'Registo de ocorrência ou reclamação, com causa, resposta e prevenção.',
    content: () => `${field('Data e hora')}${field('Local')}${field('Tipo', 'Reclamação / Acidente / Segurança / Avaria / Outro')}${field('Pessoas envolvidas')}${field('Reportado por')}<h2>O que aconteceu</h2><p></p><h2>Ação imediata tomada</h2><p></p><h2>Causa provável</h2><p></p><h2>Compensação ao hóspede</h2><p></p><h2>Medidas para evitar que se repita</h2>${todo()}<h2>Fotografias / documentos</h2><p></p>`,
  },
  {
    id: 'supplier', category: 'Operações hoteleiras', name: 'Avaliação de fornecedor', icon: '🚚', title: 'Fornecedor — ',
    description: 'Contactos, condições, comparação de propostas e decisão.',
    content: () => `${field('Empresa')}${field('Contacto')}${field('Telefone / email')}${field('NIF')}<h2>O que fornece</h2><p></p><h2>Comparação de propostas</h2>${table(['Critério', 'Fornecedor A', 'Fornecedor B', 'Fornecedor C'], 0).replace('</tbody>', ['Preço', 'Prazo de entrega', 'Condições de pagamento', 'Qualidade / amostras', 'Referências', 'Sustentabilidade'].map((c) => `<tr><td><p>${c}</p></td><td><p></p></td><td><p></p></td><td><p></p></td></tr>`).join('') + '</tbody>')}<h2>Decisão e justificação</h2><p></p><h2>Próximos passos</h2>${todo('Pedir contrato', 'Validar com compras / financeiro')}`,
  },
  {
    id: 'event', category: 'Operações hoteleiras', name: 'Plano de evento / grupo', icon: '🎉', title: 'Evento — ',
    description: 'Ficha de evento: programa, espaços, F&B, montagem e faturação.',
    content: () => `${field('Cliente')}${field('Contacto')}${field('Datas')}${field('N.º de pessoas')}${field('Orçamento')}<h2>Programa</h2>${table(['Hora', 'Atividade', 'Espaço', 'Responsável'], 4)}<h2>Alojamento</h2>${table(['Tipo de quarto', 'Quantidade', 'Noites', 'Preço'], 2)}<h2>F&amp;B</h2>${bullets('Coffee breaks', 'Almoço', 'Jantar', 'Restrições alimentares')}<h2>Montagem e audiovisuais</h2>${todo()}<h2>Faturação</h2>${field('Sinal recebido')}${field('Condições de cancelamento')}`,
  },
  // ---------- Planeamento e produtividade ----------
  {
    id: 'todo', category: 'Planeamento e produtividade', name: 'Lista de tarefas', icon: '✅', title: 'Tarefas',
    description: 'Tarefas separadas por prioridade.',
    content: () => `<h2>Prioritário</h2>${todo()}<h2>Esta semana</h2>${todo()}<h2>Mais tarde</h2>${todo()}`,
  },
  {
    id: 'weekly', category: 'Planeamento e produtividade', name: 'Planeamento semanal', icon: '🗓️', title: 'Semana de ',
    description: 'Objetivos da semana e plano por dia.',
    content: () => `<h2>Objetivos da semana</h2>${todo()}${table(['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'], 1)}<h2>Revisão</h2><p></p>`,
  },
  {
    id: 'weeklyreview', category: 'Planeamento e produtividade', name: 'Revisão semanal', icon: '🔄', title: `Revisão semanal — ${shortDate()}`,
    description: 'Fechar a semana: limpar a caixa de entrada, rever projetos e planear a seguinte.',
    content: () => `<h2>1. Limpar</h2>${todo('Esvaziar o 00 INBOX e arquivar notas', 'Rever emails sinalizados', 'Recolher papéis e apontamentos soltos')}<h2>2. Rever</h2>${todo('Calendário da semana passada', 'Calendário das próximas 2 semanas', 'Tarefas em atraso', 'Projetos ativos — cada um tem um próximo passo?')}<h2>3. O que correu bem</h2>${bullets()}<h2>4. O que mudar</h2>${bullets()}<h2>5. As 3 prioridades da próxima semana</h2><ol><li><p></p></li><li><p></p></li><li><p></p></li></ol>`,
  },
  {
    id: 'project', category: 'Planeamento e produtividade', name: 'Plano de projeto', icon: '🚀', title: 'Projeto: ',
    description: 'Resumo, objetivos, marcos, riscos e tarefas.',
    content: () => `<h2>Resumo</h2><p></p><h2>Objetivos e indicadores de sucesso</h2>${bullets()}<h2>Âmbito</h2><p><strong>Inclui:</strong> </p><p><strong>Não inclui:</strong> </p><h2>Marcos</h2>${table(['Marco', 'Data', 'Responsável', 'Estado'], 3)}<h2>Orçamento</h2>${table(['Rubrica', 'Previsto', 'Real'], 3)}<h2>Riscos</h2>${table(['Risco', 'Probabilidade', 'Impacto', 'Mitigação'], 2)}<h2>Tarefas</h2>${todo()}`,
  },
  {
    id: 'okr', category: 'Planeamento e produtividade', name: 'Objetivos trimestrais (OKR)', icon: '🎯', title: 'Objetivos T',
    description: 'Objetivos com resultados-chave mensuráveis e acompanhamento.',
    content: () => `<p><em>Um objetivo diz onde queremos chegar; os resultados-chave dizem como sabemos que lá chegámos.</em></p>${[1, 2, 3].map((i) => `<h2>Objetivo ${i}: </h2>${table(['Resultado-chave', 'Ponto de partida', 'Meta', 'Atual', '%'], 3)}`).join('')}<h2>Revisão a meio do trimestre</h2><p></p>`,
  },
  {
    id: 'actionplan', category: 'Planeamento e produtividade', name: 'Plano de ação 5W2H', icon: '📋', title: 'Plano de ação — ',
    description: 'O quê, porquê, onde, quando, quem, como e quanto custa.',
    content: () => `<h2>Problema / oportunidade</h2><p></p>${table(['O quê', 'Porquê', 'Onde', 'Quando', 'Quem', 'Como', 'Quanto'], 4)}<h2>Acompanhamento</h2>${todo()}`,
  },
  {
    id: 'daily', category: 'Planeamento e produtividade', name: 'Diário', icon: '📔', title: `Diário — ${shortDate()}`,
    description: 'Gratidão, prioridades do dia e reflexão.',
    content: () => `<p><em>${today()}</em></p><h2>Gratidão</h2>${bullets()}<h2>Prioridades de hoje</h2>${todo('', '', '')}<h2>Notas</h2><p></p><h2>Reflexão</h2><p></p>`,
  },
  // ---------- Pensar e decidir ----------
  {
    id: 'decision', category: 'Pensar e decidir', name: 'Registo de decisão', icon: '⚖️', title: 'Decisão: ',
    description: 'Contexto, opções com prós e contras, decisão e quando rever.',
    content: () => `${field('Data', shortDate())}${field('Quem decide')}<h2>Contexto</h2><p></p><h2>Opções</h2>${table(['Opção', 'Prós', 'Contras', 'Custo / risco'], 3)}<h2>Decisão</h2><p></p><h2>Porquê</h2><p></p><h2>Rever em</h2><p></p>`,
  },
  {
    id: 'swot', category: 'Pensar e decidir', name: 'Análise SWOT', icon: '🧭', title: 'SWOT — ',
    description: 'Forças, fraquezas, oportunidades e ameaças, com conclusões.',
    content: () => `<table><tbody><tr><th><p>💪 Forças</p></th><th><p>⚠️ Fraquezas</p></th></tr><tr><td><ul><li><p></p></li></ul></td><td><ul><li><p></p></li></ul></td></tr><tr><th><p>🚀 Oportunidades</p></th><th><p>🌩️ Ameaças</p></th></tr><tr><td><ul><li><p></p></li></ul></td><td><ul><li><p></p></li></ul></td></tr></tbody></table><h2>Conclusões e ações</h2>${todo()}`,
  },
  {
    id: 'eisenhower', category: 'Pensar e decidir', name: 'Matriz urgente / importante', icon: '🧮', title: 'Prioridades — ',
    description: 'Separar o que fazer já, planear, delegar ou eliminar.',
    content: () => `<table><tbody><tr><th><p></p></th><th><p>Urgente</p></th><th><p>Não urgente</p></th></tr><tr><th><p>Importante</p></th><td><p><strong>Fazer já</strong></p><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p></p></li></ul></td><td><p><strong>Planear</strong></p><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p></p></li></ul></td></tr><tr><th><p>Não importante</p></th><td><p><strong>Delegar</strong></p><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p></p></li></ul></td><td><p><strong>Eliminar</strong></p><ul><li><p></p></li></ul></td></tr></tbody></table>`,
  },
  {
    id: 'retro', category: 'Pensar e decidir', name: 'Lições aprendidas', icon: '🔍', title: 'Lições aprendidas — ',
    description: 'Depois de um projeto ou evento: o que correu bem, mal e o que mudar.',
    content: () => `${field('Projeto / evento')}${field('Data', shortDate())}<h2>Objetivo inicial</h2><p></p><h2>O que aconteceu</h2><p></p><h2>✅ Correu bem — manter</h2>${bullets()}<h2>❌ Correu mal — corrigir</h2>${bullets()}<h2>💡 Fazer diferente da próxima vez</h2>${bullets()}<h2>Ações</h2>${table(['Ação', 'Responsável', 'Prazo'], 2)}`,
  },
  {
    id: 'idea', category: 'Pensar e decidir', name: 'Ideia', icon: '💡', title: 'Ideia: ',
    description: 'Problema, ideia, porque funciona e próximo passo.',
    content: () => `<h2>O problema</h2><p></p><h2>A ideia</h2><p></p><h2>Porque funciona</h2><p></p><h2>O que é preciso testar</h2>${bullets()}<h2>Próximo passo</h2>${todo()}`,
  },
  {
    id: 'book', category: 'Pensar e decidir', name: 'Resumo de livro / curso', icon: '📚', title: 'Livro: ',
    description: 'Ideias principais, citações e como aplicar.',
    content: () => `${field('Autor')}${field('Lido em', shortDate())}${field('Avaliação', '☆☆☆☆☆')}<h2>Em 3 frases</h2><p></p><h2>Ideias principais</h2><ol><li><p></p></li></ol><h2>Frases a guardar</h2><blockquote><p></p></blockquote><h2>Como vou aplicar</h2>${todo()}`,
  },
  // ---------- Pessoal e família ----------
  {
    id: 'trip', category: 'Pessoal e família', name: 'Plano de viagem', icon: '✈️', title: 'Viagem — ',
    description: 'Voos, alojamento, itinerário por dia, orçamento e documentos.',
    content: () => `${field('Destino')}${field('Datas')}${field('Viajantes')}<h2>Voos</h2>${table(['Trajeto', 'Data / hora', 'Voo', 'Reserva'], 2)}<h2>Alojamento</h2>${table(['Hotel', 'Datas', 'Morada', 'Reserva'], 2)}<h2>Itinerário</h2>${table(['Dia', 'Manhã', 'Tarde', 'Noite'], 4)}<h2>Restaurantes a experimentar</h2>${bullets()}<h2>Orçamento</h2>${table(['Rubrica', 'Previsto', 'Real'], 4)}<h2>Documentos</h2>${todo('Passaportes / CC válidos', 'Seguro de viagem', 'Cartões e moeda local', 'Cópias digitais dos documentos')}`,
  },
  {
    id: 'packing', category: 'Pessoal e família', name: 'Lista de bagagem', icon: '🧳', title: 'Bagagem — ',
    description: 'Checklist de malas para a família.',
    content: () => `<h2>Documentos</h2>${todo('Passaportes / CC', 'Cartões bancários', 'Cartas de condução', 'Reservas impressas ou no telemóvel')}<h2>Roupa</h2>${todo('Roupa interior e meias', 'Pijamas', 'Casacos', 'Fato de banho', 'Calçado')}<h2>Higiene e saúde</h2>${todo('Escovas e pasta de dentes', 'Medicamentos habituais', 'Protetor solar', 'Kit de primeiros socorros')}<h2>Eletrónica</h2>${todo('Carregadores', 'Adaptador de tomada', 'Power bank', 'Auscultadores')}<h2>Antes de sair de casa</h2>${todo('Fechar água e gás', 'Regar plantas', 'Lixo', 'Janelas e alarme')}`,
  },
  {
    id: 'familyyear', category: 'Pessoal e família', name: 'Objetivos da família para o ano', icon: '👨‍👩‍👧‍👦', title: `Objetivos família ${new Date().getFullYear()}`,
    description: 'Objetivos de cada pessoa e da família, com revisão trimestral.',
    content: () => `<h2>Objetivos da família</h2>${todo()}<h2>Por pessoa</h2>${table(['Pessoa', 'Saúde', 'Escola / trabalho', 'Lazer', 'Pessoal'], 4)}<h2>Viagens e momentos a não perder</h2>${bullets()}<h2>Orçamento anual</h2>${table(['Rubrica', 'Previsto'], 3)}<h2>Revisões</h2>${todo('Março', 'Junho', 'Setembro', 'Dezembro')}`,
  },
  {
    id: 'recipe', category: 'Pessoal e família', name: 'Receita', icon: '🍲', title: 'Receita: ',
    description: 'Ficha de receita: pessoas, tempo, dificuldade, custo, ingredientes, preparação e lista de compras.',
    content: () => recipe({ people: '', time: '', level: '', cost: '', ingredients: ['', '', ''], steps: ['', '', ''], shopping: { 'Talho e peixaria': [''], 'Frutas e legumes': [''], Laticínios: [''], Mercearia: [''] } }),
  },
  {
    id: 'recipe-bifes-cafe', category: 'Pessoal e família', name: 'Receita: Bifes com molho de café', icon: '🥩', title: 'Bifes com molho de café',
    description: 'Exemplo preenchido da ficha de receita, com a lista de compras dos produtos.',
    content: () => recipe({
      people: '4', time: '20 min.', level: 'fácil', cost: 'médio',
      ingredients: ['4 bifes de novilho', '700 g de batatas', '50 ml de azeite', '180 ml de natas', '1 café expresso', '4 ovos M', 'Salsa q.b.', 'Óleo q.b.', 'Sal e pimenta q.b.'],
      steps: [
        'Aqueça o azeite numa frigideira e frite os bifes temperados com sal e pimenta, de ambos os lados. Retire os bifes e reserve. Na mesma frigideira, adicione as natas, o café e a salsa picada. Deixe ferver, até obter uma textura cremosa. Retire e reserve.',
        'Descasque e corte as batatas em rodelas e frite em óleo bem quente. Retire e escorra sobre papel absorvente.',
        'Estrele os ovos, coloque sobre os bifes e regue com o molho, acompanhe com as batatas fritas e sirva.',
      ],
      shopping: {
        'Talho': ['Bifes de novilho — 4'],
        'Frutas e legumes': ['Batatas — 700 g', 'Salsa — 1 molho'],
        'Laticínios e ovos': ['Natas — 1 pacote (200 ml)', 'Ovos M — 4 (meia dúzia)'],
        'Mercearia': ['Azeite', 'Óleo para fritar', 'Café (1 expresso)', 'Sal', 'Pimenta'],
      },
    }),
  },
  {
    id: 'shopping', category: 'Pessoal e família', name: 'Lista de compras', icon: '🛒', title: 'Compras',
    description: 'Lista por secções do supermercado.',
    content: () => `<h2>Frescos</h2>${todo()}<h2>Talho e peixaria</h2>${todo()}<h2>Mercearia</h2>${todo()}<h2>Laticínios</h2>${todo()}<h2>Limpeza e higiene</h2>${todo()}`,
  },
  {
    id: 'health', category: 'Pessoal e família', name: 'Consulta médica', icon: '🩺', title: 'Consulta — ',
    description: 'Sintomas, perguntas a fazer, diagnóstico e medicação.',
    content: () => `${field('Pessoa')}${field('Médico / especialidade')}${field('Data', shortDate())}<h2>Sintomas e desde quando</h2><p></p><h2>Perguntas a fazer</h2>${todo()}<h2>Diagnóstico</h2><p></p><h2>Medicação</h2>${table(['Medicamento', 'Dose', 'Horário', 'Até'], 2)}<h2>Exames e próxima consulta</h2>${todo()}`,
  },
  {
    id: 'home', category: 'Pessoal e família', name: 'Obra / manutenção da casa', icon: '🛠️', title: 'Obra — ',
    description: 'Orçamentos, fornecedores, pagamentos e acompanhamento.',
    content: () => `${field('Local')}${field('Início previsto')}${field('Fim previsto')}<h2>O que fazer</h2>${todo()}<h2>Orçamentos</h2>${table(['Empresa', 'Valor', 'Prazo', 'Contacto'], 3)}<h2>Pagamentos</h2>${table(['Data', 'Descrição', 'Valor', 'Pago'], 3)}<h2>Acompanhamento</h2>${table(['Data', 'Ponto de situação'], 3)}<h2>Garantias e documentos</h2><p></p>`,
  },
];
