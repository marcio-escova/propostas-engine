import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import PDFDocument from "pdfkit";

const expeditionUsdPrice = 4350;
const departureDateDefault = "2026-08-07";
const sourceUrl = "https://grade6.com.br/expedicoes/expedicao-monte-elbrus/";
const dollarSourceUrlDefault = "https://cotacao.com.br/comprar-dolar-online/";
const heroImageUrl = "https://grade6.com.br/wp-content/uploads/2022/12/IMG_6542-scaled.jpg";

function getArg(name, fallback = "") {
  const full = `--${name}=`;
  const entry = process.argv.find((arg) => arg.startsWith(full));
  if (!entry) return fallback;
  return entry.slice(full.length).trim();
}

function parseRequiredRate() {
  const value = getArg("usd-rate");
  if (!value) {
    throw new Error("Informe a cotacao com --usd-rate=5.74");
  }
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Cotacao invalida em --usd-rate");
  }
  return parsed;
}

function parseDateInput(value) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Data invalida: ${value}`);
  }
  return date;
}

function monthBefore(date) {
  return new Date(date.getFullYear(), date.getMonth() - 1, 1, 12, 0, 0);
}

function firstDayOfCurrentMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0);
}

function monthsDiffInclusive(startMonth, endMonth) {
  const diff = (endMonth.getFullYear() - startMonth.getFullYear()) * 12 + (endMonth.getMonth() - startMonth.getMonth()) + 1;
  return Math.max(1, diff);
}

function addMonthsKeepingDay(baseDate, monthOffset) {
  const day = baseDate.getDate();
  const candidate = new Date(baseDate.getFullYear(), baseDate.getMonth() + monthOffset, 1, 12, 0, 0);
  const maxDay = new Date(candidate.getFullYear(), candidate.getMonth() + 1, 0).getDate();
  candidate.setDate(Math.min(day, maxDay));
  return candidate;
}

function buildInstallments(totalBrl, parcelCount) {
  const now = new Date();
  const base = Math.floor((totalBrl / parcelCount) * 100) / 100;
  const installments = [];
  let running = 0;
  for (let i = 0; i < parcelCount; i += 1) {
    const amount = i === parcelCount - 1 ? Number((totalBrl - running).toFixed(2)) : base;
    running = Number((running + amount).toFixed(2));
    installments.push({
      index: i + 1,
      dueDate: addMonthsKeepingDay(now, i),
      amount,
    });
  }
  return installments;
}

function formatDatePtBr(date) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function formatMonthYear(date) {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date);
}

function formatCurrencyBrl(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatCurrencyUsd(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function safeSlug(input) {
  return input.replace(/[^a-zA-Z0-9_-]+/g, "-");
}

function ensureOutputDir(outputDir) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
}

function fetchImageBuffer(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`Falha ao baixar imagem: ${res.statusCode}`));
          return;
        }
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      })
      .on("error", reject);
  });
}

function drawHeader(doc, title, subtitle) {
  doc.rect(0, 0, doc.page.width, 98).fill("#061A33");
  doc.fillColor("#FFFFFF").fontSize(22).font("Helvetica-Bold").text("GRADE 6 EXPEDICOES", 48, 28);
  doc.fontSize(13).font("Helvetica").fillColor("#C3D4EB").text(title, 48, 58);
  doc.fontSize(10).text(subtitle, 48, 76);
  doc.fillColor("#000000");
}

function sectionTitle(doc, title) {
  doc.moveDown(0.65);
  doc.font("Helvetica-Bold").fontSize(13.5).fillColor("#0A2D54").text(title);
  const y = doc.y + 4;
  doc.moveTo(48, y).lineTo(548, y).lineWidth(1).strokeColor("#D5E2F1").stroke();
  doc.moveDown(0.65);
  doc.fillColor("#111111");
}

function bullet(doc, text) {
  const y = doc.y + 1;
  doc.circle(58, y + 5, 1.8).fill("#1E5AA0");
  doc.fillColor("#111111").font("Helvetica").fontSize(10.3).text(text, 68, y, { width: 476, lineGap: 2 });
  doc.moveDown(0.28);
}

async function generate() {
  const usdRate = parseRequiredRate();
  const departureDate = parseDateInput(getArg("departure-date", departureDateDefault));
  const clientName = getArg("client", "Cliente Grade6");
  const capturedAt = parseDateInput(getArg("captured-at", new Date().toISOString().slice(0, 10)));
  const dollarSourceUrl = getArg("dollar-source-url", dollarSourceUrlDefault);

  const closeMonth = monthBefore(departureDate);
  const parcelCount = monthsDiffInclusive(firstDayOfCurrentMonth(), closeMonth);
  const totalBrl = Number((expeditionUsdPrice * usdRate).toFixed(2));
  const installments = buildInstallments(totalBrl, parcelCount);
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
  const outputDir = path.resolve("..", "propostas-geradas");
  const outputName = `Proposta_Premium_Monte_Elbrus_${safeSlug(clientName)}_${stamp}.pdf`;
  const outputFile = path.join(outputDir, outputName);

  ensureOutputDir(outputDir);

  const doc = new PDFDocument({ size: "A4", margin: 48 });
  const stream = fs.createWriteStream(outputFile);
  doc.pipe(stream);

  drawHeader(doc, "Proposta Premium - Monte Elbrus", `Cliente: ${clientName}`);
  doc.y = 112;

  doc.font("Helvetica-Bold").fontSize(24).fillColor("#0A2D54").text("EXPEDICAO MONTE ELBRUS");
  doc.moveDown(0.3);
  doc
    .font("Helvetica")
    .fontSize(11.6)
    .fillColor("#22364E")
    .text("Roteiro premium com foco em seguranca, aclimatacao eficiente e maior previsibilidade operacional.");

  try {
    const image = await fetchImageBuffer(heroImageUrl);
    doc.moveDown(0.5);
    const y = doc.y;
    doc.image(image, 48, y, { fit: [500, 172], align: "center" });
    doc.y = y + 182;
  } catch {
    doc.moveDown(0.8);
  }

  const cardY = doc.y;
  doc.roundedRect(48, cardY, 500, 116, 10).fillAndStroke("#F2F7FD", "#D6E3F2");
  doc.fillColor("#0A2D54").font("Helvetica-Bold").fontSize(12).text("Investimento e cambio", 64, cardY + 14);
  doc
    .font("Helvetica")
    .fontSize(10.6)
    .fillColor("#22364E")
    .text(`Valor da expedicao: ${formatCurrencyUsd(expeditionUsdPrice)}`, 64, cardY + 38)
    .text(`Cotacao informada (cotacao.com.br): R$ ${usdRate.toFixed(4)} por US$ 1`, 64, cardY + 56)
    .text(`Total convertido: ${formatCurrencyBrl(totalBrl)}`, 64, cardY + 74)
    .text(`Quitacao prevista ate: ${formatMonthYear(closeMonth)}`, 64, cardY + 92);
  doc.y = cardY + 126;

  sectionTitle(doc, "Resumo comercial");
  bullet(doc, "Duracao: 8 dias | Localizacao: Balkaria, Russia | Altitude maxima: 5.642m");
  bullet(doc, "Dificuldade fisica: moderada | Dificuldade tecnica: PD (pouco dificil)");
  bullet(doc, "Atividade diaria estimada: 6 a 8 horas");
  bullet(doc, "Investimento original em dolar: US$ 4.350 por pessoa (grupo minimo de 6).");

  sectionTitle(doc, "Parcelamento sugerido (sem juros)");
  doc
    .font("Helvetica")
    .fontSize(10.2)
    .fillColor("#22364E")
    .text(
      `A proposta considera pagamento mensal iniciado na data da solicitacao da proposta e ultima parcela no mes anterior a saida (${formatMonthYear(closeMonth)}).`,
      { lineGap: 2 }
    );
  doc.moveDown(0.35);
  doc.font("Helvetica-Bold").fontSize(10.2).fillColor("#0A2D54").text("Parcela | Vencimento | Valor");
  doc.moveDown(0.22);
  for (const item of installments) {
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#111111")
      .text(`${String(item.index).padStart(2, "0")} de ${String(parcelCount).padStart(2, "0")} | ${formatDatePtBr(item.dueDate)} | ${formatCurrencyBrl(item.amount)}`);
  }

  doc.addPage();
  drawHeader(doc, "Confiabilidade da informacao", "Base oficial Grade6 + cambio informado do cotacao.com.br");
  doc.y = 116;

  sectionTitle(doc, "Fontes e premissas");
  bullet(doc, `Fonte oficial do roteiro e valor em dolar: ${sourceUrl}`);
  bullet(doc, `Fonte de cotacao em BRL indicada para referencia: ${dollarSourceUrl}`);
  bullet(doc, `Data de captura da cotacao informada: ${formatDatePtBr(capturedAt)}`);
  bullet(doc, "A cotacao pode variar ao longo do dia. O fechamento comercial final deve considerar a confirmacao no momento da contratacao.");

  sectionTitle(doc, "Politica de pagamento sugerida");
  bullet(doc, "Entrada no ato da confirmacao comercial para reserva de vaga.");
  bullet(doc, "Parcelas mensais fixas em reais ate o mes anterior ao embarque.");
  bullet(doc, "Saldo integral quitado antes do inicio do mes da expedicao.");
  bullet(doc, "Ajustes de valor podem ocorrer se houver revisao de cambio entre proposta e fechamento.");

  sectionTitle(doc, "Dados da expedicao (resumo)");
  bullet(doc, "1o dia: chegada em Mineralnye Vody e transfer para o Vale Baksan.");
  bullet(doc, "2o ao 5o dia: aclimatacao progressiva e descanso estrategico.");
  bullet(doc, "6o dia: ataque ao cume (5.642m), condicionado a janela climatica.");
  bullet(doc, "7o dia: dia reserva para contingencia de clima.");
  bullet(doc, "8o dia: retorno e transfer para o aeroporto.");

  doc.moveDown(1.2);
  doc.font("Helvetica").fontSize(9.2).fillColor("#4A5A6C").text(`Gerado em ${formatDatePtBr(new Date())} | Proposta premium automatizada.`);
  doc.text("Validade sugerida da proposta: 7 dias corridos (devido variacao cambial).");

  doc.end();
  await new Promise((resolve) => stream.on("finish", resolve));
  console.log(outputFile);
}

generate().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
