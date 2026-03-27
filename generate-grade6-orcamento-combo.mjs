import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import PDFDocument from "pdfkit";

const timbradoPath =
  "C:\\Users\\marci\\.cursor\\projects\\c-Users-marci-Documents-Projetos-Lovable-altamontanhagrade6\\assets\\c__Users_marci_AppData_Roaming_Cursor_User_workspaceStorage_520016d143df1f480a92af9367c0e84f_images_timbrado_grade1-1fd5d25a-db7f-4125-98fb-99064a586f51.png";
const outputDir = path.resolve("..", "propostas-geradas");
const sourceDollar = "https://cotacao.com.br/comprar-dolar-online/";

const items = [
  {
    title: "Vulcoes Acotango + Parinacota",
    month: "Junho/2026",
    currency: "USD",
    amount: 2500,
    source: "https://grade6.com.br/expedicoes/grade6-vulcoes-acotango-e-parinacota/",
    image: "https://grade6.com.br/wp-content/uploads/2022/12/DSC01558-scaled.jpg",
    note: "Saida publicada em junho no site oficial.",
  },
  {
    title: "Vulcoes do Equador com Cotopaxi",
    month: "Maio/2026",
    currency: "USD",
    amount: 2980,
    source: "https://grade6.com.br/expedicoes/vulcoes-do-equador-com-cotopaxi/",
    image: "https://grade6.com.br/wp-content/uploads/2022/12/EQUADOR-5-scaled.jpg",
    note: "Saida de maio publicada no site oficial.",
  },
  {
    title: "Curso Basico de Escalada em Rocha",
    month: "Abril/2026",
    currency: "BRL",
    amount: 1300,
    source: "https://grade6.com.br/cursos/basico-de-escalada-em-rocha/",
    image: "https://grade6.com.br/wp-content/uploads/2022/12/DSC01497-1-scaled.jpg",
    note: "Data de abril no calendario oficial do curso.",
  },
  {
    title: "PAE - Programa de Acompanhamento (Maio)",
    month: "Maio/2026",
    currency: "BRL",
    amount: 220,
    source: "https://grade6.com.br/cursos/pae-programa-de-acompanhamento-em-escalada/",
    image: "https://grade6.com.br/wp-content/uploads/2022/12/DSC01526-scaled.jpg",
    note: "1 encontro no mes, conforme pedido.",
  },
  {
    title: "PAE - Programa de Acompanhamento (Junho)",
    month: "Junho/2026",
    currency: "BRL",
    amount: 220,
    source: "https://grade6.com.br/cursos/pae-programa-de-acompanhamento-em-escalada/",
    image: "https://grade6.com.br/wp-content/uploads/2022/12/GOPR0756-scaled.jpg",
    note: "1 encontro no mes, conforme pedido.",
  },
  {
    title: "Curso Escalada em Gelo + Huayna + Extensao Illimani",
    month: "Julho/2026",
    currency: "USD",
    amount: 3530 + 3350,
    source:
      "https://grade6.com.br/cursos/escalada-em-gelo-e-huayna-potosi/ + https://grade6.com.br/expedicoes/huayna-e-illimani/",
    image: "https://grade6.com.br/wp-content/uploads/2022/12/WhatsApp-Image-2025-07-19-at-10.28.17-3-scaled.jpeg",
    note: "Composicao: Curso em gelo + extensao Illimani.",
  },
];

function getArg(name, fallback = "") {
  const full = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(full));
  return found ? found.slice(full.length).trim() : fallback;
}

function parseUsdRate() {
  const value = getArg("usd-rate", "5.70");
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Cotacao invalida. Use --usd-rate=5.83");
  }
  return parsed;
}

function formatBrl(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatUsd(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function formatDate(date) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function ensureOutput() {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
}

function fetchImage(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`Falha ao baixar imagem ${url}: ${res.statusCode}`));
          return;
        }
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      })
      .on("error", reject);
  });
}

function addTimbrado(doc, pageWidth, pageHeight, buffer) {
  if (!buffer) return;
  doc.save();
  doc.opacity(0.12);
  doc.image(buffer, 0, 0, { fit: [pageWidth, pageHeight] });
  doc.restore();
}

function drawHeader(doc, title) {
  doc.rect(0, 0, doc.page.width, 90).fill("#0A1F39");
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(21).text("GRADE 6 EXPEDICOES", 46, 26);
  doc.font("Helvetica").fontSize(11.5).fillColor("#C7D7EE").text(title, 46, 56);
  doc.fillColor("#111111");
}

async function generate() {
  ensureOutput();
  const usdRate = parseUsdRate();
  const clientName = getArg("client", "Cliente Grade6");
  const now = new Date();
  const stamp = now.toISOString().replace(/[:T]/g, "-").slice(0, 16);
  const outputFile = path.join(outputDir, `Orcamento_Premium_Combo_Grade6_${stamp}.pdf`);

  const processed = items.map((item) => {
    const brl = item.currency === "USD" ? Number((item.amount * usdRate).toFixed(2)) : item.amount;
    return { ...item, brl };
  });

  const totalUsd = processed.filter((i) => i.currency === "USD").reduce((acc, i) => acc + i.amount, 0);
  const totalBrlDirect = processed.filter((i) => i.currency === "BRL").reduce((acc, i) => acc + i.amount, 0);
  const totalBrlConverted = Number((totalUsd * usdRate).toFixed(2));
  const totalGeralBrl = Number((totalBrlConverted + totalBrlDirect).toFixed(2));

  const doc = new PDFDocument({ size: "A4", margin: 44 });
  const stream = fs.createWriteStream(outputFile);
  doc.pipe(stream);

  let timbradoBuffer = null;
  if (fs.existsSync(timbradoPath)) {
    timbradoBuffer = fs.readFileSync(timbradoPath);
  }

  const imageBuffers = new Map();
  for (const item of processed) {
    try {
      imageBuffers.set(item.title, await fetchImage(item.image));
    } catch {
      imageBuffers.set(item.title, null);
    }
  }

  addTimbrado(doc, doc.page.width, doc.page.height, timbradoBuffer);
  drawHeader(doc, "Orcamento Premium - Multi roteiros e cursos");
  doc.y = 108;

  doc.font("Helvetica-Bold").fontSize(24).fillColor("#0A2E56").text("PROPOSTA COMERCIAL COMBO 2026");
  doc
    .font("Helvetica")
    .fontSize(11)
    .fillColor("#22364E")
    .text(`Cliente: ${clientName}`)
    .text(`Data de emissao: ${formatDate(now)}`)
    .text(`Cotacao de referencia (cotacao.com.br): R$ ${usdRate.toFixed(4)} por US$ 1`);

  doc.moveDown(0.5);
  doc.roundedRect(44, doc.y, 507, 90, 9).fillAndStroke("#EEF5FF", "#D4E3F4");
  const boxY = doc.y - 90;
  doc.fillColor("#0A2E56").font("Helvetica-Bold").fontSize(12).text("Resumo financeiro", 60, boxY + 14);
  doc
    .font("Helvetica")
    .fontSize(10.5)
    .fillColor("#1F2F42")
    .text(`Total em USD (itens dolarizados): ${formatUsd(totalUsd)}`, 60, boxY + 36)
    .text(`Conversao USD > BRL pela cotacao de referencia: ${formatBrl(totalBrlConverted)}`, 60, boxY + 52)
    .text(`Total dos itens em BRL: ${formatBrl(totalBrlDirect)}`, 60, boxY + 68)
    .font("Helvetica-Bold")
    .text(`TOTAL GERAL ESTIMADO: ${formatBrl(totalGeralBrl)}`, 290, boxY + 68);
  doc.y = boxY + 102;

  doc.moveDown(0.6);
  doc.font("Helvetica-Bold").fontSize(13).fillColor("#0A2E56").text("Itens solicitados");
  doc.moveDown(0.25);

  for (let i = 0; i < processed.length; i += 1) {
    const item = processed[i];
    if (doc.y > 680) {
      doc.addPage();
      addTimbrado(doc, doc.page.width, doc.page.height, timbradoBuffer);
      drawHeader(doc, "Orcamento Premium - Continuacao");
      doc.y = 108;
    }

    const cardY = doc.y;
    doc.roundedRect(44, cardY, 507, 96, 8).fillAndStroke("#FFFFFF", "#D9E4F2");
    doc.fillColor("#0A2E56").font("Helvetica-Bold").fontSize(11.2).text(`${i + 1}. ${item.title}`, 56, cardY + 10, {
      width: 340,
    });
    doc
      .font("Helvetica")
      .fontSize(9.6)
      .fillColor("#32465C")
      .text(`Mes sugerido: ${item.month}`, 56, cardY + 35)
      .text(`Valor oficial: ${item.currency === "USD" ? formatUsd(item.amount) : formatBrl(item.amount)}`, 56, cardY + 50)
      .text(`Valor estimado em BRL: ${formatBrl(item.brl)}`, 56, cardY + 64)
      .text(item.note, 56, cardY + 78, { width: 340 });

    const img = imageBuffers.get(item.title);
    if (img) {
      doc.image(img, 405, cardY + 10, { fit: [136, 76] });
    }
    doc.y = cardY + 108;
  }

  doc.addPage();
  addTimbrado(doc, doc.page.width, doc.page.height, timbradoBuffer);
  drawHeader(doc, "Consolidado e observacoes");
  doc.y = 112;

  doc.font("Helvetica-Bold").fontSize(14).fillColor("#0A2E56").text("Consolidado final");
  doc.moveDown(0.5);

  doc.font("Helvetica").fontSize(11).fillColor("#1E2A38");
  doc.text(`- Itens dolarizados somados: ${formatUsd(totalUsd)}`);
  doc.text(`- Cotacao aplicada: R$ ${usdRate.toFixed(4)} por US$ 1 (referencia cotacao.com.br).`);
  doc.text(`- Total dolar convertido: ${formatBrl(totalBrlConverted)}`);
  doc.text(`- Total itens em reais: ${formatBrl(totalBrlDirect)}`);
  doc.font("Helvetica-Bold").text(`- TOTAL GERAL ESTIMADO: ${formatBrl(totalGeralBrl)}`);

  doc.moveDown(0.9);
  doc.font("Helvetica-Bold").fontSize(12).fillColor("#0A2E56").text("Fontes oficiais utilizadas");
  doc.moveDown(0.3);
  const sources = [...new Set(processed.map((i) => i.source.split(" + ")).flat())];
  for (const s of sources) {
    doc.fillColor("#204B7C").font("Helvetica").fontSize(9.5).text(s, { link: s, underline: true });
  }
  doc.moveDown(0.45);
  doc.fillColor("#204B7C").fontSize(9.5).text(sourceDollar, { link: sourceDollar, underline: true });

  doc.moveDown(0.8);
  doc.font("Helvetica").fontSize(10).fillColor("#4D5D70");
  doc.text("Observacao: cotacao sujeita a variacao intradiaria. Valores finais devem ser confirmados no fechamento.");
  doc.text("Documento gerado automaticamente com base no site oficial Grade6 e cotacao de referencia informada.");

  doc.end();
  await new Promise((resolve) => stream.on("finish", resolve));
  console.log(outputFile);
}

generate().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
