import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";

const outputDir = "C:\\Grade6-Automacoes\\propostas-geradas";
const bgPath = "C:\\Grade6-Automacoes\\propostas-engine\\assets\\timbrado_unzip\\word\\media\\image1.png";
const calibriPath = "C:\\Windows\\Fonts\\calibri.ttf";
const calibriBoldPath = "C:\\Windows\\Fonts\\calibrib.ttf";

function getArg(name, fallback = "") {
  const token = `--${name}=`;
  const arg = process.argv.find((x) => x.startsWith(token));
  return arg ? arg.slice(token.length).trim() : fallback;
}

function parseDate(yyyyMmDd) {
  const d = new Date(`${yyyyMmDd}T12:00:00`);
  if (Number.isNaN(d.getTime())) throw new Error(`Data invalida: ${yyyyMmDd}`);
  return d;
}

function parseUsdRate() {
  const raw = getArg("usd-rate", "5.62").replace(",", ".");
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) throw new Error("Cotacao invalida. Use --usd-rate=5.62");
  return num;
}

function fmtDate(date) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function fmtMonth(date) {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date);
}

function brl(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function usd(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function firstOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0);
}

function monthBefore(date) {
  return new Date(date.getFullYear(), date.getMonth() - 1, 1, 12, 0, 0);
}

function monthDiffInclusive(start, end) {
  const diff = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
  return diff < 1 ? 1 : diff;
}

function addMonthsKeepDay(baseDate, offset) {
  const day = baseDate.getDate();
  const d = new Date(baseDate.getFullYear(), baseDate.getMonth() + offset, 1, 12, 0, 0);
  const maxDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, maxDay));
  return d;
}

function buildInstallments(totalBrl, expeditionDate, requestDate) {
  const closeMonth = monthBefore(expeditionDate);
  const count = monthDiffInclusive(firstOfMonth(requestDate), closeMonth);
  const base = Math.floor((totalBrl / count) * 100) / 100;
  const schedule = [];
  let consumed = 0;
  for (let i = 0; i < count; i += 1) {
    const amount = i === count - 1 ? Number((totalBrl - consumed).toFixed(2)) : base;
    consumed = Number((consumed + amount).toFixed(2));
    schedule.push({ i: i + 1, due: addMonthsKeepDay(requestDate, i), amount });
  }
  return { schedule, closeMonth };
}

function drawBg(doc, bgBuffer) {
  doc.image(bgBuffer, 0, 0, { fit: [doc.page.width, doc.page.height] });
}

function drawHeader(doc, title, subtitle) {
  doc.fillColor("#E67F3B").font("calibriBold").fontSize(19).text("GRADE 6 EXPEDICOES", 50, 43);
  doc.fillColor("#1E1E1E").font("calibriBold").fontSize(15).text(title, 50, 66);
  doc.fillColor("#333333").font("calibri").fontSize(9.8).text(subtitle, 50, 86, { width: 500 });
  doc.moveTo(50, 101).lineTo(545, 101).lineWidth(0.8).strokeColor("#E9A476").stroke();
}

function sectionTitle(doc, title) {
  doc.moveDown(0.55);
  doc.fillColor("#D16B2D").font("calibriBold").fontSize(12.3).text(title);
  doc.moveDown(0.18);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(0.55).strokeColor("#EEC6A8").stroke();
  doc.moveDown(0.25);
}

function bulletList(doc, items, size = 10.2) {
  for (const item of items) {
    const y = doc.y;
    doc.circle(58, y + 5.2, 1.8).fill("#D97A3C");
    doc.fillColor("#1E1E1E").font("calibri").fontSize(size).text(item, 66, y, { width: 476, lineGap: 2 });
    doc.moveDown(0.2);
  }
}

function ensureRoom(doc, proposal, bgBuffer, neededHeight, pageNote) {
  if (doc.y + neededHeight < 760) return;
  doc.addPage();
  drawBg(doc, bgBuffer);
  drawHeader(doc, proposal.title, `${proposal.subtitle} | ${pageNote}`);
  doc.y = 118;
}

function addItineraryDated(doc, proposal, bgBuffer) {
  const start = parseDate(proposal.startDate);
  for (let idx = 0; idx < proposal.itineraryDays.length; idx += 1) {
    ensureRoom(doc, proposal, bgBuffer, 30, "Itinerario");
    const dayDate = new Date(start);
    dayDate.setDate(start.getDate() + idx);
    doc
      .fillColor("#2A2A2A")
      .font("calibriBold")
      .fontSize(10.1)
      .text(`${idx + 1}o dia (${fmtDate(dayDate)}):`, 52, doc.y, { continued: true });
    doc.fillColor("#1E1E1E").font("calibri").fontSize(10.1).text(` ${proposal.itineraryDays[idx]}`, { width: 492 });
    doc.moveDown(0.2);
  }
}

function addInstallments(doc, proposal, usdRate, requestDate, bgBuffer) {
  ensureRoom(doc, proposal, bgBuffer, 170, "Parcelamento");
  sectionTitle(doc, "Parcelamento ate o mes anterior da expedicao");
  const expeditionDate = parseDate(proposal.startDate);
  const totalBrl = proposal.currency === "USD" ? Number((proposal.price * usdRate).toFixed(2)) : proposal.price;
  const installment = buildInstallments(totalBrl, expeditionDate, requestDate);
  const priceLine = proposal.currency === "USD"
    ? `Valor oficial: ${usd(proposal.price)} | Cotacao referencia: R$ ${usdRate.toFixed(2)} | Total estimado: ${brl(totalBrl)}`
    : `Valor oficial em reais: ${brl(proposal.price)}`;

  doc.fillColor("#1E1E1E").font("calibri").fontSize(10.1).text(priceLine, { width: 500 });
  doc.moveDown(0.15);
  doc
    .fillColor("#1E1E1E")
    .font("calibri")
    .fontSize(10.1)
    .text(`Inicio: ${fmtDate(requestDate)} | Quitacao ate: ${fmtMonth(installment.closeMonth)}`, { width: 500 });
  doc.moveDown(0.2);
  for (const p of installment.schedule) {
    doc.font("calibri").fontSize(10).text(`${String(p.i).padStart(2, "0")} - Venc.: ${fmtDate(p.due)} - Valor: ${brl(p.amount)}`);
  }
}

async function generateOne(proposal, usdRate, bgBuffer, requestDate) {
  const now = new Date();
  const stamp = now.toISOString().replace(/[:T]/g, "-").slice(0, 16);
  const outputFile = path.join(outputDir, `${proposal.filePrefix}_${stamp}.pdf`);
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  if (fs.existsSync(calibriPath)) doc.registerFont("calibri", calibriPath);
  if (fs.existsSync(calibriBoldPath)) doc.registerFont("calibriBold", calibriBoldPath);
  const stream = fs.createWriteStream(outputFile);
  doc.pipe(stream);

  drawBg(doc, bgBuffer);
  drawHeader(doc, proposal.title, `${proposal.subtitle} | Emissao: ${fmtDate(now)}`);
  doc.y = 118;

  sectionTitle(doc, "Dados oficiais (site Grade6)");
  bulletList(doc, [
    `Referencia: ${proposal.source}`,
    `Mes solicitado: ${proposal.monthReference}`,
    `Inicio utilizado nesta proposta: ${fmtDate(parseDate(proposal.startDate))}`,
    `Duracao: ${proposal.duration}`,
    `Localizacao: ${proposal.location}`,
    `Altitude maxima: ${proposal.maxAltitude}`,
    `Dificuldade: ${proposal.difficulty}`,
  ]);

  addInstallments(doc, proposal, usdRate, requestDate, bgBuffer);
  sectionTitle(doc, "Itinerario oficial datado");
  addItineraryDated(doc, proposal, bgBuffer);

  doc.addPage();
  drawBg(doc, bgBuffer);
  drawHeader(doc, proposal.title, `${proposal.subtitle} | Inclusos e nao inclusos`);
  doc.y = 118;

  sectionTitle(doc, "Itens inclusos (conforme site)");
  bulletList(doc, proposal.included);
  sectionTitle(doc, "Nao inclusos (conforme site)");
  bulletList(doc, proposal.notIncluded);
  sectionTitle(doc, "Observacoes");
  bulletList(doc, proposal.notes, 9.8);

  doc.fillColor("#4A4A4A").font("calibri").fontSize(9).text("Fonte cambial de referencia: https://cotacao.com.br/comprar-dolar-online/", 50, 772, {
    width: 500,
  });

  doc.end();
  return new Promise((resolve) => stream.on("finish", () => resolve(outputFile)));
}

async function main() {
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  if (!fs.existsSync(bgPath)) throw new Error(`Fundo nao encontrado: ${bgPath}`);
  const bgBuffer = fs.readFileSync(bgPath);
  const usdRate = parseUsdRate();
  const requestDate = parseDate(getArg("request-date", new Date().toISOString().slice(0, 10)));

  const proposals = [
    {
      filePrefix: "Proposta_Acotango_Parinacota_Junho",
      title: "Vulcoes Acotango + Parinacota",
      subtitle: "Expedicao oficial Grade6",
      source: "https://grade6.com.br/expedicoes/grade6-vulcoes-acotango-e-parinacota/",
      monthReference: "Junho/2026",
      startDate: "2026-06-19",
      duration: "10 dias",
      location: "Bolivia",
      maxAltitude: "6.378m",
      difficulty: "Alta montanha",
      currency: "USD",
      price: 2500,
      itineraryDays: [
        "Voo Brasil / La Paz. Chegada ao aeroporto El Alto, em La Paz e transfer ao hotel. Pernoite em La Paz (3.800m).",
        "Aclimatacao em La Paz. [C] Dia de aclimatacao com caminhadas nos arredores de La Paz, ultima checagem e organizacao de equipamentos. Pernoite em hotel em La Paz.",
        "Ascensao ao Cerro Chacaltaya - 5421m [CAJ] - 7h. Pernoite no hotel em La Paz.",
        "Transfer para o Vilarejo Sajama. [CAJ] - 3h. Pernoite em refugio.",
        "Ascensao Huisalla - 5000m [CAJ] - 6h. Pernoite Hostal Sajama.",
        "Ascensao ao vulcao Acotango. [CAJ] - 10h. Pernoite em refugio.",
        "Descanso povoado Sajama [CAJ]. Pernoite Hostal Sajama.",
        "Subida Parinacota - 6.378m [CAJ]. Pernoite Hostal Sajama.",
        "Saida do povoado do Sajama e retorno a La Paz. Pernoite em La Paz.",
        "Retorno Brasil [C]. Transfer para o aeroporto.",
      ],
      included: [
        "Guia Grade6.",
        "4 pernoites em hotel em La Paz (quartos duplos) com cafe da manha.",
        "Transfer Aeroporto / Hotel / Aeroporto.",
        "Todos os traslados citados no itinerario em veiculo 4x4.",
        "Pernoites em refugio.",
        "Entrada para aguas termais.",
        "Entrada do Parque Sajama.",
      ],
      notIncluded: [
        "Passagem aerea internacional e taxas de embarque.",
        "Gorjetas, gastos pessoais e alimentacao nao descrita no itinerario.",
        "Equipamentos pessoais de escalada (bota, crampon, piqueta, saco de dormir, roupas, etc.).",
        "Gastos originados por desistencia antecipada.",
        "Seguro de viagem internacional que cubra esportes de inverno com utilizacao de cordas.",
        "Em caso de volta antecipada, os gastos serao por conta do participante.",
      ],
      notes: ["Precos, datas e disponibilidade de vagas sujeitos a mudancas sem aviso previo, conforme pagina oficial."],
    },
    {
      filePrefix: "Proposta_Vulcoes_Equador_Cotopaxi_Maio",
      title: "Vulcoes do Equador com Cotopaxi",
      subtitle: "Expedicao oficial Grade6",
      source: "https://grade6.com.br/expedicoes/vulcoes-do-equador-com-cotopaxi/",
      monthReference: "Maio/2026",
      startDate: "2026-05-15",
      duration: "9 dias",
      location: "Equador",
      maxAltitude: "5.897m",
      difficulty: "Moderada / Alta altitude",
      currency: "USD",
      price: 2980,
      itineraryDays: [
        "Chegada no Equador (2.800m). Recepcao no aeroporto e transfer ao hotel. Pernoite em Quito.",
        "Aclimatacao 4.100m - Teleferico Ruku Pichincha. [CAJ] Pernoite em Quito.",
        "Subida do Vulcao Corazon (4.790m). [CLJ] Pernoite em hotel fazenda.",
        "Subida ao refugio Nuevos Horizontes (4.700m). [CAJ] Pernoite em refugio.",
        "Escalada do Illiniza Norte (5.126m) [CLJ]. Pernoite em hotel fazenda.",
        "Descanso. [CAJ] Pernoite em hotel fazenda.",
        "Refugio Jose Ribas Cotopaxi (4.864m) [CAJ]. Pernoite no refugio.",
        "Escalada do Cotopaxi (5.897m) [CLJ]. Retorno para Quito e pernoite em hotel.",
        "Retorno ao Brasil [C]. Transfer para o aeroporto.",
      ],
      included: [
        "Guia de montanha certificado na proporcao 2 clientes para cada guia no Cotopaxi.",
        "Guia brasileiro a partir do 6o participante.",
        "Equipamentos basicos de escalada (crampons, piqueta, mosquetao, cadeirinha e capacete).",
        "Todas as alimentacoes descritas no itinerario.",
        "Todos os transfers para as montanhas.",
        "Transfer Aeroporto / Hotel / Aeroporto.",
        "2 noites de hotel em Quito com cafe da manha (quartos duplos).",
        "4 noites em hotel fazenda (quarto duplo).",
        "2 noites em refugio: Illinizas e Cotopaxi.",
        "Assistencia para compra e aluguel de equipamentos para expedicao.",
        "Ingresso para teleferico para ascensao ao Rucu Pichincha.",
        "Todas as entradas nos Parques Nacionais.",
        "Consulta online com medico com experiencia em alta montanha.",
      ],
      notIncluded: [
        "Passagem aerea, aprox: U$ 700.",
        "Gorjetas, aprox: U$ 100.",
        "Alimentacao e bebidas nao descritas no itinerario, aprox: U$ 150.",
        "Equipamentos individuais.",
        "Gastos extras por volta antecipada.",
        "Seguro saude internacional para viagem, aprox: U$ 100.",
      ],
      notes: ["Tempo de caminhada informado no site considerando ritmo leve com pausas para lanches e fotos."],
    },
    {
      filePrefix: "Proposta_Curso_Basico_Rocha_Abril",
      title: "Curso Basico de Escalada em Rocha",
      subtitle: "Curso oficial Grade6",
      source: "https://grade6.com.br/cursos/basico-de-escalada-em-rocha/",
      monthReference: "Abril/2026",
      startDate: "2026-04-18",
      duration: "2 dias",
      location: "Campinas-SP / Andradas-MG",
      maxAltitude: "913m",
      difficulty: "Fisica 4o grau | Tecnica pouca",
      currency: "BRL",
      price: 1300,
      itineraryDays: [
        "Campinas: aula teorica na Grade6 das 08h30 as 13h; pausa para almoco; pratica na parede indoor ate 18h.",
        "Saida de Campinas para Andradas as 7h; praticas em ambiente natural; retorno para Campinas as 19h30.",
      ],
      included: [
        "Apostila digital do curso para consulta.",
        "Certificado de participacao digital.",
        "Equipamentos para escalada na parte pratica.",
        "Instrutor especializado.",
        "Seguro Aventura (despesas medicas).",
        "Coffee Break na aula teorica (1o dia).",
      ],
      notIncluded: [
        "A hospedagem em Campinas nao esta inclusa no pacote.",
        "Remarcacoes voluntarias por parte do participante.",
        "Almoco no primeiro dia.",
        "Transporte para Andradas (responsabilidade dos alunos, assim como transporte do instrutor e dos equipamentos).",
      ],
      notes: ["Data de abril no calendario oficial: 18 de Abril de 2026."],
    },
    {
      filePrefix: "Proposta_PAE_Maio_Junho",
      title: "PAE - Programa de Acompanhamento em Escalada",
      subtitle: "Programa oficial Grade6 (2 encontros)",
      source: "https://grade6.com.br/cursos/pae-programa-de-acompanhamento-em-escalada/",
      monthReference: "Maio e Junho/2026",
      startDate: "2026-05-15",
      duration: "1 dia por encontro (2 encontros)",
      location: "Campinas + destino de escalada definido pelos guias",
      maxAltitude: "913m",
      difficulty: "Fisica 5o/6o grau | Tecnica baixa",
      currency: "BRL",
      price: 440,
      itineraryDays: [
        "Encontro de Maio: Grade6 Campinas pela manha, deslocamento ate local da escalada e praticas durante o dia.",
        "Encontro de Junho: repeticao do formato operacional com destino definido antecipadamente pelos guias.",
      ],
      included: ["Guias Grade6 especializados.", "Equipamentos de escalada."],
      notIncluded: [
        "Remarcacoes voluntarias por parte do participante.",
        "Transporte dos alunos, do instrutor e dos equipamentos.",
      ],
      notes: [
        "Destinos possiveis informados no site: Pedra Bela, Andradas, Maria Antonia, Cuscuzeiro e Aguas da Prata.",
        "Proposta considera 1 encontro por mes, conforme solicitado.",
      ],
    },
    {
      filePrefix: "Proposta_Curso_Gelo_Huayna_Ext_Illimani",
      title: "Curso de Escalada em Gelo + Huayna + Extensao Illimani",
      subtitle: "Composicao de dois roteiros oficiais Grade6",
      source: "https://grade6.com.br/cursos/escalada-em-gelo-e-huayna-potosi/ + https://grade6.com.br/expedicoes/huayna-e-illimani/",
      monthReference: "Julho/2026",
      startDate: "2026-07-10",
      duration: "Bloco A (15 dias) + Bloco B (15 dias)",
      location: "Bolivia",
      maxAltitude: "6.438m",
      difficulty: "Fisica pesada | Tecnica PD",
      currency: "USD",
      price: 3530 + 3350,
      itineraryDays: [
        "Bloco A dia 1: Voo Brasil - La Paz. Transfer e pernoite em hotel.",
        "Bloco A dia 2: Aclimatacao em La Paz. [C]",
        "Bloco A dia 3: Transfer para a montanha Condoriri. [CAJ]",
        "Bloco A dia 4: Aclimatacao e aulas teoricas. [CAJ]",
        "Bloco A dia 5: Exercicios no glaciar (4.750m). [CLJ]",
        "Bloco A dia 6: Exercicios no glaciar e deslocamento com cordas. [CLJ]",
        "Bloco A dia 7: Sistema de ancoragem, polias e resgate em greta. [CLJ]",
        "Bloco A dia 8: Descanso e preparacao para ataque. [CAJ]",
        "Bloco A dia 9: Ataque ao cume do Tarija (5.200m). [CL]",
        "Bloco A dia 10: Descanso em La Paz. [C]",
        "Bloco A dia 11: Transfer para base do Huayna Potosi. [CAJ]",
        "Bloco A dia 12: Acampamento avancado (5.130m). [CAJ]",
        "Bloco A dia 13: Cume do Huayna Potosi. [CL]",
        "Bloco A dia 14: Dia extra na montanha.",
        "Bloco A dia 15: La Paz - Brasil. [C]",
        "Bloco B (Huayna + Illimani): roteiro oficial de 15 dias com aclimatacao em La Paz/Condoriri e ataque ao Illimani (6.438m).",
      ],
      included: [
        "Guia Grade6.",
        "Hospedagens em La Paz conforme cada roteiro (quartos duplos com cafe da manha e internet).",
        "Transfers internos previstos nos dois roteiros.",
        "Equipamento coletivo de escalada e camping (cordas, parafusos, estacas, barracas e utensilios).",
        "Hospedagem em refugios no Huayna Potosi.",
        "Animais de carga e carregadores de altitude conforme descricao oficial.",
        "Pensao completa nos acampamentos/refugios conforme roteiro.",
        "Auxilio para compras e aluguel de equipamentos necessarios.",
        "Consulta online com medico com experiencia em alta montanha (extensao).",
      ],
      notIncluded: [
        "Passagem aerea internacional e taxas de embarque.",
        "Alimentacao e bebidas na cidade (quando nao descritas no roteiro).",
        "Equipamentos pessoais de escalada e vestuario tecnico individual.",
        "Seguro de viagem com cobertura para esportes de inverno e utilizacao de corda.",
        "Gorjetas e gastos pessoais.",
        "Em caso de volta antecipada, os gastos serao por conta do participante.",
      ],
      notes: [
        "Documento consolidado para o pacote combinado solicitado.",
        "No fechamento comercial, a Grade6 valida encaixe de calendario entre os dois blocos.",
      ],
    },
  ];

  const generated = [];
  for (const p of proposals) {
    generated.push(await generateOne(p, usdRate, bgBuffer, requestDate));
  }
  for (const file of generated) console.log(file);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
