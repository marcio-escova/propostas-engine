import fs from "node:fs";
import path from "node:path";
import {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

const outputDir = "C:\\Grade6-Automacoes\\propostas-geradas";
const bgPath = "C:\\Grade6-Automacoes\\propostas-engine\\assets\\timbrado_unzip\\word\\media\\image1.png";

function getArg(name, fallback = "") {
  const token = `--${name}=`;
  const arg = process.argv.find((x) => x.startsWith(token));
  return arg ? arg.slice(token.length).trim() : fallback;
}

function parseDate(value) {
  const d = new Date(`${value}T12:00:00`);
  if (Number.isNaN(d.getTime())) throw new Error(`Data inválida: ${value}`);
  return d;
}

function parseUsdRate() {
  const n = Number(getArg("usd-rate", "5.62").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) throw new Error("Cotação inválida.");
  return n;
}

function fmtDate(d) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

function fmtMonthYear(d) {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(d);
}

function brl(v) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function usd(v) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
}

function monthStart(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 12, 0, 0);
}

function monthBefore(d) {
  return new Date(d.getFullYear(), d.getMonth() - 1, 1, 12, 0, 0);
}

function monthDiffInclusive(a, b) {
  const diff = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1;
  return diff < 1 ? 1 : diff;
}

function addMonthsKeepDay(base, offset) {
  const day = base.getDate();
  const d = new Date(base.getFullYear(), base.getMonth() + offset, 1, 12, 0, 0);
  const maxDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, maxDay));
  return d;
}

function nextMonth(base) {
  return new Date(base.getFullYear(), base.getMonth() + 1, 1, 12, 0, 0);
}

function buildOptionA(totalBrl, requestDate, expeditionStart) {
  const reserve = Number((totalBrl * 0.1).toFixed(2));
  const remaining = Number((totalBrl - reserve).toFixed(2));
  const close = monthBefore(expeditionStart);
  const firstInstallmentMonth = nextMonth(requestDate);
  const count = monthDiffInclusive(firstInstallmentMonth, close);
  const base = Math.floor((remaining / count) * 100) / 100;
  const schedule = [];
  let used = 0;
  for (let i = 0; i < count; i += 1) {
    const amount = i === count - 1 ? Number((remaining - used).toFixed(2)) : base;
    used = Number((used + amount).toFixed(2));
    schedule.push({ parcela: i + 1, due: addMonthsKeepDay(requestDate, i + 1), amount });
  }
  return { reserve, remaining, close, schedule };
}

function buildOptionB(totalBrl, requestDate, expeditionStart) {
  const close = monthBefore(expeditionStart);
  const futureCount = monthDiffInclusive(nextMonth(requestDate), close);
  const totalCount = futureCount + 1;
  const value = Number((totalBrl / totalCount).toFixed(2));
  const schedule = [];
  for (let i = 0; i < totalCount; i += 1) {
    const due = i === 0 ? requestDate : addMonthsKeepDay(requestDate, i);
    schedule.push({ parcela: i + 1, due, amount: value });
  }
  const adjustedTotal = Number((value * totalCount).toFixed(2));
  const delta = Number((totalBrl - adjustedTotal).toFixed(2));
  if (delta !== 0) schedule[schedule.length - 1].amount = Number((schedule[schedule.length - 1].amount + delta).toFixed(2));
  return { close, schedule };
}

function H2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 260, after: 120 },
    children: [new TextRun({ text, color: "D16B2D", bold: true })],
  });
}

function P(text, after = 90, bold = false) {
  return new Paragraph({ spacing: { after }, children: [new TextRun({ text, bold })] });
}

function B(text) {
  return new Paragraph({ text, bullet: { level: 0 }, spacing: { after: 70 } });
}

function toItineraryParagraphs(days, startDate) {
  return days.map((text, idx) => {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + idx);
    return new Paragraph({
      spacing: { after: 80 },
      children: [new TextRun({ text: `${idx + 1}º dia (${fmtDate(d)}): `, bold: true }), new TextRun({ text })],
    });
  });
}

function installmentTable(rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({ children: [P("Parcela", 20, true)] }),
          new TableCell({ children: [P("Vencimento", 20, true)] }),
          new TableCell({ children: [P("Valor", 20, true)] }),
        ],
      }),
      ...rows.map(
        (r) =>
          new TableRow({
            children: [
              new TableCell({ children: [P(`${String(r.parcela).padStart(2, "0")}`, 20)] }),
              new TableCell({ children: [P(fmtDate(r.due), 20)] }),
              new TableCell({ children: [P(brl(r.amount), 20)] }),
            ],
          })
      ),
    ],
  });
}

async function generateOne(proposal, usdRate, requestDate, bgBuffer) {
  const now = new Date();
  const stamp = now.toISOString().replace(/[:T]/g, "-").slice(0, 16);
  const expeditionStart = parseDate(proposal.startDate);
  const totalBrl = proposal.currency === "USD" ? Number((proposal.price * usdRate).toFixed(2)) : proposal.price;
  const optA = buildOptionA(totalBrl, requestDate, expeditionStart);
  const optB = buildOptionB(totalBrl, requestDate, expeditionStart);

  const outputFile = path.join(outputDir, `${proposal.filePrefix}_${stamp}.docx`);

  const children = [
    new Paragraph({
      children: [new ImageRun({ data: bgBuffer, transformation: { width: 520, height: 740 } })],
      spacing: { after: 120 },
    }),
    new Paragraph({
      children: [new TextRun({ text: "GRADE 6 EXPEDIÇÕES", bold: true, color: "E67F3B", size: 34 })],
      spacing: { after: 50 },
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 120 },
      children: [new TextRun({ text: proposal.title, bold: true, size: 32, color: "1E1E1E" })],
    }),
    P(`${proposal.subtitle} | Emissão: ${fmtDate(now)}`),
    P(`Referência oficial: ${proposal.source}`),

    H2("Dados oficiais"),
    B(`Mês solicitado: ${proposal.monthReference}`),
    B(`Data de saída adotada para o itinerário datado: ${fmtDate(expeditionStart)}`),
    B(`Duração: ${proposal.duration}`),
    B(`Localização: ${proposal.location}`),
    B(`Altitude máxima: ${proposal.maxAltitude}`),
    B(`Dificuldade: ${proposal.difficulty}`),

    H2("Investimento"),
    P(
      proposal.currency === "USD"
        ? `Valor oficial: ${usd(proposal.price)} por pessoa. Cotação de referência (cotacao.com.br): R$ ${usdRate.toFixed(
            2
          )} por US$ 1. Valor estimado em reais: ${brl(totalBrl)}.`
        : `Valor oficial: ${brl(proposal.price)} por pessoa.`
    ),

    H2("Opção A – Reserva de 10% + saldo parcelado"),
    P(
      `Reserva no ato: ${brl(optA.reserve)}. Saldo restante: ${brl(optA.remaining)}. Parcelamento com vencimentos mensais até ${fmtMonthYear(
        optA.close
      )}.`
    ),
    installmentTable(optA.schedule),

    H2("Opção B – 100% parcelado (sem entrada de 10%)"),
    P(
      `Sem reserva adicional. O valor total é dividido em parcelas iguais; a parcela da reserva já é a primeira parcela. Quitação até ${fmtMonthYear(
        optB.close
      )}.`
    ),
    installmentTable(optB.schedule),

    H2("Itinerário oficial datado"),
    ...toItineraryParagraphs(proposal.itineraryDays, expeditionStart),

    H2("Itens inclusos (site)"),
    ...proposal.included.map((x) => B(x)),
    H2("Não inclusos (site)"),
    ...proposal.notIncluded.map((x) => B(x)),
    H2("Observações"),
    ...proposal.notes.map((x) => B(x)),
    P("Fonte cambial de referência: https://cotacao.com.br/comprar-dolar-online/"),
  ];

  const doc = new Document({ sections: [{ properties: {}, children }] });
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputFile, buffer);
  return outputFile;
}

async function main() {
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  if (!fs.existsSync(bgPath)) throw new Error(`Fundo não encontrado: ${bgPath}`);
  const bgBuffer = fs.readFileSync(bgPath);
  const usdRate = parseUsdRate();
  const requestDate = parseDate(getArg("request-date", new Date().toISOString().slice(0, 10)));

  const proposals = [
    {
      filePrefix: "Proposta_Acotango_Parinacota_Junho_EDITAVEL_V2",
      title: "Vulcões Acotango + Parinacota",
      subtitle: "Expedição oficial Grade6",
      source: "https://grade6.com.br/expedicoes/grade6-vulcoes-acotango-e-parinacota/",
      monthReference: "Junho/2026",
      startDate: "2026-06-19",
      duration: "10 dias",
      location: "Bolívia",
      maxAltitude: "6.378m",
      difficulty: "Alta montanha",
      currency: "USD",
      price: 2500,
      itineraryDays: [
        "Voo Brasil / La Paz. Chegada ao aeroporto El Alto, em La Paz, e transfer ao hotel. Pernoite em La Paz (3.800m).",
        "Aclimatação em La Paz [C]. Caminhadas nos arredores, checagem e organização de equipamentos. Pernoite em hotel em La Paz.",
        "Ascensão ao Cerro Chacaltaya (5.421m) [CAJ] – 7h. Vista do Huayna Potosí e da Cordilheira Real. Pernoite em La Paz.",
        "Transfer para o vilarejo Sajama [CAJ] – 3h. Deslocamento em 4x4, visita cultural e chegada ao alojamento. Pernoite em refúgio.",
        "Ascensão ao Huisalla (5.000m) [CAJ] – 6h. Caminhada de aclimatação em ritmo lento. Pernoite em Hostal Sajama.",
        "Ascensão ao vulcão Acotango (6.052m) [CAJ] – 10h. Saída de madrugada, ataque ao cume e retorno. Pernoite em refúgio.",
        "Descanso no povoado Sajama [CAJ]. Possibilidade de visitar termas e geysers. Pernoite em Hostal Sajama.",
        "Subida ao Parinacota (6.378m) [CAJ]. Caminhada em areia, rocha, campos de neve e penitentes. Pernoite em Hostal Sajama.",
        "Saída de Sajama para La Paz. Organização de pertences e pernoite em La Paz.",
        "Retorno ao Brasil [C]. Transfer para o aeroporto.",
      ],
      included: [
        "Guia Grade6.",
        "4 pernoites em hotel em La Paz (quartos duplos) com café da manhã.",
        "Transfer Aeroporto / Hotel / Aeroporto.",
        "Todos os traslados citados no itinerário em veículo 4x4.",
        "Pernoites em refúgio.",
        "Entrada para águas termais.",
        "Entrada do Parque Sajama.",
      ],
      notIncluded: [
        "Passagem aérea internacional e taxas de embarque.",
        "Gorjetas, gastos pessoais e alimentação não descrita no itinerário.",
        "Equipamentos pessoais de escalada (bota, crampon, piqueta, saco de dormir, roupas etc.).",
        "Gastos originados por desistência antecipada.",
        "Seguro de viagem internacional com cobertura para esportes de inverno e uso de corda.",
        "Em caso de volta antecipada, os gastos serão por conta do participante.",
      ],
      notes: ["Preços, datas e disponibilidade sujeitos a mudanças sem aviso prévio, conforme o site oficial."],
    },
    {
      filePrefix: "Proposta_Vulcoes_Equador_Cotopaxi_Maio_EDITAVEL_V2",
      title: "Vulcões do Equador com Cotopaxi",
      subtitle: "Expedição oficial Grade6",
      source: "https://grade6.com.br/expedicoes/vulcoes-do-equador-com-cotopaxi/",
      monthReference: "Maio/2026",
      startDate: "2026-05-15",
      duration: "9 dias",
      location: "Equador",
      maxAltitude: "5.897m",
      difficulty: "Moderada / alta altitude",
      currency: "USD",
      price: 2980,
      itineraryDays: [
        "Chegada no Equador (2.800m). Recepção no aeroporto e transfer ao hotel (aprox. 50 min). Pernoite em Quito.",
        "Aclimatação 4.100m – Teleférico Ruku Pichincha [CAJ]. Caminhada de exposição à altitude. Pernoite em Quito.",
        "Subida do vulcão Corazón (4.790m) [CLJ] – 8h. Trecho em campos de altitude e escalaminhada. Pernoite em hotel fazenda.",
        "Subida ao refúgio Nuevos Horizontes (4.700m) [CAJ] – 4h. Acesso por 4x4 e ascensão íngreme ao refúgio. Pernoite em refúgio.",
        "Escalada do Illiniza Norte (5.126m) [CLJ] – 8h. Trechos técnicos de rocha. Retorno e pernoite em hotel fazenda.",
        "Dia de descanso [CAJ]. Recuperação física e pernoite em hotel fazenda.",
        "Refúgio José Ribas Cotopaxi (4.864m) [CAJ]. Subida ao refúgio e preparo para o ataque ao cume.",
        "Escalada do Cotopaxi (5.897m) [CLJ] – 10h. Ataque de madrugada, cume e descida. Retorno a Quito e pernoite em hotel.",
        "Retorno ao Brasil [C]. Transfer para o aeroporto e fim dos serviços.",
      ],
      included: [
        "Guia de montanha certificado na proporção de 2 clientes por guia no Cotopaxi.",
        "Guia brasileiro a partir do 6º participante.",
        "Equipamentos básicos de escalada (crampons, piqueta, mosquetão, cadeirinha e capacete).",
        "Todas as alimentações descritas no itinerário.",
        "Todos os transfers para as montanhas.",
        "Transfer Aeroporto / Hotel / Aeroporto.",
        "2 noites de hotel em Quito com café da manhã (quartos duplos).",
        "4 noites em hotel fazenda (quarto duplo).",
        "2 noites em refúgio: Illinizas e Cotopaxi.",
        "Assistência para compra e aluguel de equipamentos para expedição.",
        "Ingresso para teleférico para ascensão ao Rucu Pichincha.",
        "Todas as entradas nos Parques Nacionais.",
        "Consulta online com médico com experiência em alta montanha.",
      ],
      notIncluded: [
        "Passagem aérea (aprox.: U$ 700).",
        "Gorjetas (aprox.: U$ 100).",
        "Alimentação e bebidas não descritas no itinerário (aprox.: U$ 150).",
        "Equipamentos individuais.",
        "Gastos extras por volta antecipada.",
        "Seguro saúde internacional para viagem (aprox.: U$ 100).",
      ],
      notes: ["O tempo de caminhada é indicado em horas e considera ritmo leve com pausas para lanches e fotos."],
    },
    {
      filePrefix: "Proposta_Curso_Basico_Rocha_Abril_EDITAVEL_V2",
      title: "Curso Básico de Escalada em Rocha",
      subtitle: "Curso oficial Grade6",
      source: "https://grade6.com.br/cursos/basico-de-escalada-em-rocha/",
      monthReference: "Abril/2026",
      startDate: "2026-04-18",
      duration: "2 dias",
      location: "Campinas-SP / Andradas-MG",
      maxAltitude: "913m",
      difficulty: "Física 4º grau (rocha) / técnica baixa",
      currency: "BRL",
      price: 1300,
      itineraryDays: [
        "1º dia – Campinas: aula teórica na Grade6 das 08h30 às 13h, pausa para almoço das 13h às 14h30 e prática na parede indoor até 18h.",
        "2º dia – Saída de Campinas para Andradas às 7h, práticas em ambiente natural durante o dia e retorno para Campinas às 19h30.",
      ],
      included: [
        "Apostila digital do curso para consulta.",
        "Certificado de participação digital.",
        "Equipamentos para escalada na parte prática.",
        "Instrutor especializado.",
        "Seguro Aventura (despesas médicas).",
        "Coffee break na aula teórica (1º dia).",
      ],
      notIncluded: [
        "Hospedagem em Campinas.",
        "Remarcações voluntárias por parte do participante.",
        "Almoço no primeiro dia.",
        "Transporte para Andradas (responsabilidade dos alunos, incluindo transporte do instrutor e dos equipamentos).",
      ],
      notes: ["Data oficial no calendário para abril de 2026: 18 de abril."],
    },
    {
      filePrefix: "Proposta_PAE_Maio_Junho_EDITAVEL_V2",
      title: "PAE – Programa de Acompanhamento em Escalada",
      subtitle: "Programa oficial Grade6 (2 encontros)",
      source: "https://grade6.com.br/cursos/pae-programa-de-acompanhamento-em-escalada/",
      monthReference: "Maio e Junho/2026",
      startDate: "2026-05-15",
      duration: "1 dia por encontro (2 encontros)",
      location: "Campinas + destinos definidos pelos guias",
      maxAltitude: "913m",
      difficulty: "Física 5º/6º grau (rocha) / técnica baixa",
      currency: "BRL",
      price: 440,
      itineraryDays: [
        "Encontro de maio: reunião na Grade6 pela manhã, deslocamento ao local de escalada e práticas durante todo o dia.",
        "Encontro de junho: repetição do formato com novo setor definido antecipadamente pelos guias.",
      ],
      included: ["Guias Grade6 especializados.", "Equipamentos de escalada."],
      notIncluded: [
        "Remarcações voluntárias por parte do participante.",
        "Transporte dos alunos, do instrutor e dos equipamentos.",
      ],
      notes: [
        "Destinos possíveis informados no site: Pedra Bela, Andradas, Maria Antônia, Cuscuzeiro e Águas da Prata.",
        "Esta proposta considera 1 encontro por mês, conforme solicitado.",
      ],
    },
    {
      filePrefix: "Proposta_Curso_Gelo_Huayna_Ext_Illimani_EDITAVEL_V2",
      title: "Curso de Escalada em Gelo + Huayna + Extensão Illimani",
      subtitle: "Composição de dois roteiros oficiais Grade6",
      source: "https://grade6.com.br/cursos/escalada-em-gelo-e-huayna-potosi/ + https://grade6.com.br/expedicoes/huayna-e-illimani/",
      monthReference: "Julho/2026",
      startDate: "2026-07-10",
      duration: "Bloco A (15 dias) + Bloco B (15 dias)",
      location: "Bolívia",
      maxAltitude: "6.438m",
      difficulty: "Física pesada / técnica PD",
      currency: "USD",
      price: 3530 + 3350,
      itineraryDays: [
        "Bloco A dia 1: Voo Brasil – La Paz. Transfer e pernoite em hotel.",
        "Bloco A dia 2: Aclimatação em La Paz [C], com exercícios em terreno de rocha.",
        "Bloco A dia 3: Transfer para a montanha Condoriri [CAJ] e pernoite em barraca.",
        "Bloco A dia 4: Aclimatação [CAJ], revisão de equipamento e aulas teóricas.",
        "Bloco A dia 5: Exercícios no glaciar (4.750m) [CLJ] com técnicas de crampon e piqueta.",
        "Bloco A dia 6: Exercícios no glaciar [CLJ], deslocamento em corda e técnicas de segurança.",
        "Bloco A dia 7: Exercícios no glaciar [CLJ], ancoragem, polias e resgate em greta.",
        "Bloco A dia 8: Descanso e aulas teóricas [CAJ], preparação para ataque ao cume.",
        "Bloco A dia 9: Ataque ao cume do Tarija (5.200m) [CL] e retorno.",
        "Bloco A dia 10: Descanso em La Paz [C].",
        "Bloco A dia 11: Transfer para a base do Huayna Potosí (4.700m) [CAJ].",
        "Bloco A dia 12: Subida ao acampamento avançado (5.130m) [CAJ].",
        "Bloco A dia 13: Cume do Huayna Potosí [CL] e retorno a La Paz.",
        "Bloco A dia 14: Dia extra na montanha.",
        "Bloco A dia 15: La Paz – Brasil [C].",
        "Bloco B (roteiro Huayna + Illimani): sequência oficial com aclimatação em La Paz e Condoriri, ataque ao Huayna e progressão ao Illimani (6.438m).",
      ],
      included: [
        "Guia Grade6.",
        "Hospedagens em La Paz conforme cada roteiro (quartos duplos com café da manhã e internet).",
        "Transfers internos previstos nos dois roteiros.",
        "Equipamentos coletivos de escalada e camping (cordas, parafusos, estacas, barracas e utensílios).",
        "Hospedagem em refúgios no Huayna Potosí.",
        "Animais de carga e carregadores de altitude conforme descrição oficial.",
        "Pensão completa nos acampamentos e refúgios conforme roteiro.",
        "Auxílio para compras e aluguel de equipamentos necessários.",
        "Consulta online com médico com experiência em alta montanha (extensão).",
      ],
      notIncluded: [
        "Passagem aérea internacional e taxas de embarque.",
        "Alimentação e bebidas na cidade, quando não descritas no roteiro.",
        "Equipamentos pessoais de escalada e vestuário técnico individual.",
        "Seguro de viagem com cobertura para esportes de inverno e utilização de corda.",
        "Gorjetas e gastos pessoais.",
        "Em caso de volta antecipada, os gastos serão por conta do participante.",
      ],
      notes: [
        "Documento consolidado para o pacote combinado solicitado.",
        "No fechamento comercial, a Grade6 valida o encaixe de calendário entre os dois blocos.",
      ],
    },
  ];

  const generated = [];
  for (const p of proposals) generated.push(await generateOne(p, usdRate, requestDate, bgBuffer));
  for (const file of generated) console.log(file);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
