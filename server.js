import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const ML_SITE_ID = process.env.ML_SITE_ID || "MLB";

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

app.get("/", (req, res) => {
  res.json({
    app: "Caca Ofertas ML",
    status: "online",
    rotas: ["/health", "/cacar-ofertas?q=air fryer&limit=20"]
  });
});

app.get("/health", (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.get("/cacar-ofertas", async (req, res) => {
  try {
    const termo = String(req.query.q || "").trim();
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);

    if (!termo) {
      return res.status(400).json({ erro: "Informe o produto em ?q=" });
    }

    const endpoint = `https://api.mercadolibre.com/sites/${ML_SITE_ID}/search?q=${encodeURIComponent(termo)}&limit=${limit}`;
    const resposta = await fetch(endpoint);
    const dados = await resposta.json();

    if (!resposta.ok) {
      return res.status(resposta.status).json({ erro: "Falha na busca", detalhe: dados });
    }

    const ofertas = (dados.results || [])
      .map(normalizarOferta)
      .sort((a, b) => b.nota_oferta - a.nota_oferta);

    res.json({ termo, total: ofertas.length, ofertas });
  } catch (erro) {
    res.status(500).json({ erro: "Erro interno", detalhe: erro.message });
  }
});

function normalizarOferta(item) {
  const precoAtual = numero(item.price);
  const precoAntigo = numero(item.original_price);
  const desconto = calcularDesconto(precoAntigo, precoAtual);
  const freteGratis = Boolean(item.shipping?.free_shipping);
  const lojaOficial = Boolean(item.official_store_name);
  const nota = calcularNota({ precoAtual, precoAntigo, desconto, freteGratis, lojaOficial, condicao: item.condition });

  return {
    plataforma: "mercado_livre",
    id_externo: item.id || "",
    titulo: item.title || "Produto sem titulo",
    preco_atual: precoAtual,
    preco_antigo: precoAntigo,
    desconto_percentual: desconto,
    imagem: trocarHttps(item.thumbnail || ""),
    link_produto: item.permalink || "",
    link_afiliado: "",
    frete_gratis: freteGratis,
    loja_oficial: item.official_store_name || "",
    condicao: item.condition === "new" ? "novo" : item.condition || "nao informado",
    nota_oferta: nota,
    status: nota >= 75 ? "boa_oferta" : nota >= 50 ? "revisar" : "descartar"
  };
}

function calcularNota({ precoAtual, precoAntigo, desconto, freteGratis, lojaOficial, condicao }) {
  let nota = 0;

  if (desconto >= 50) nota += 35;
  else if (desconto >= 35) nota += 30;
  else if (desconto >= 25) nota += 24;
  else if (desconto >= 15) nota += 18;
  else if (desconto >= 8) nota += 10;

  if (freteGratis) nota += 20;
  if (lojaOficial) nota += 15;
  if (condicao === "new") nota += 15;

  if (precoAtual && precoAtual <= 50) nota += 15;
  else if (precoAtual && precoAtual <= 150) nota += 12;
  else if (precoAtual && precoAtual <= 300) nota += 8;
  else if (precoAtual && precoAtual <= 600) nota += 5;

  if (!precoAntigo || desconto === 0) nota = Math.min(nota, 72);
  return Math.max(0, Math.min(100, Math.round(nota)));
}

function calcularDesconto(precoAntigo, precoAtual) {
  if (!precoAntigo || !precoAtual || precoAntigo <= precoAtual) return 0;
  return Math.round(((precoAntigo - precoAtual) / precoAntigo) * 100);
}

function numero(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

function trocarHttps(url) {
  return String(url || "").replace("http://", "https://");
}

app.listen(PORT, () => {
  console.log(`Caca Ofertas ML rodando na porta ${PORT}`);
});
