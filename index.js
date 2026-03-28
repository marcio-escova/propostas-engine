const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.post("/api/proposals/generate", async (req, res) => {
  try {
    const { expeditionSlug, channels = ["pdf"], leadName = "Lead", language = "pt-BR" } = req.body || {};

    if (!expeditionSlug) {
      return res.status(400).json({ error: "expeditionSlug is required" });
    }

    // Resposta mínima no contrato esperado pelo app
    return res.status(200).json({
      proposalId: `prop_${Date.now()}`,
      status: "completed",
      pdfUrl: null,
      emailDraft: `Olá ${leadName}, segue proposta para ${expeditionSlug}.`,
      whatsappDraft: `Oi ${leadName}! Sua proposta de ${expeditionSlug} está pronta.`,
      socialDraft: `Nova proposta preparada para ${expeditionSlug}.`,
      language,
      channels
    });
  } catch (error) {
    return res.status(500).json({
      status: "failed",
      errorMessage: error.message || "internal error"
    });
  }
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => {
  console.log(`propostas-engine listening on port ${PORT}`);
});
