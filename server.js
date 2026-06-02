import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const ML_SITE_ID = process.env.ML_SITE_ID || "MLB";
const ML_CLIENT_ID = process.env.ML_CLIENT_ID || "";
const ML_CLIENT_SECRET = process.env["ML_CLIENT" + "_SECRET"] || "";
const ML_REDIRECT_URI = process.env.ML_REDIRECT_URI || "https://caca-ofertas-ml.onrender.com/auth/callback";

let appTokenCache = { token: "", expiresAt: 0 };
let userTokenCache = { token: "", renew: "", expiresAt: 0, userId: null };

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static("public"));

app.get("/", (req, res) => {
  res.json({
    app: "Caca Ofertas ML",
    status: "online",
    rotas: [
      "/health",
      "/auth/status",
      "/connect/ml",
      "/teste/ml",
      "/analisar-link?url=LINK_DO_ML",
      "POST /analisar-links",
      "/cacar-ofertas?q=air fryer&limit=20"
    ]
  });
});

app.get("/health", (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.get("/auth/status", (req, res) => {
  res.json({
    ml_site_id: ML_SITE_ID,
    client_id_configurado: Boolean(ML_CLIENT_ID),
    client_secret_configurado: Boolean(ML_CLIENT_SECRET),
    redirect_uri: ML_REDIRECT_URI,
    app_token_em_cache: Boolean(appTokenCache.token),
    conta_ml_conectada: Boolean(userTokenCache.token),
    user_id: userTokenCache.userId,
    token_conta_expira_em: userTokenCache.expiresAt ? new Date(userTokenCache.expiresAt).toISOString() : null
  });
});

app.get("/connect/ml", (req, res) => {
  if (!ML_CLIENT_ID || !ML_REDIRECT_URI) {
    return res.status(500).send("Configure ML_CLIENT_ID e ML_REDIRECT_URI no Render.");
  }

  const url = new URL("https://auth.mercadolivre.com.br/authorization");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", ML_CLIENT_ID);
  url.searchParams.set("redirect_uri", ML_REDIRECT_URI);
  res.redirect(url.toString());
});

app.get("/auth/callback", async (req, res) => {
  try {
    const code = String(req.query.code || "");
    if (!code) return res.status(400).send("Codigo nao recebido.");

    const dados = await trocarCodigoPorToken(code);
    if (!dados.ok) {
      return res.status(400).send("Falha ao conectar Mercado Livre: " + JSON.stringify(dados.detalhe));
    }

    salvarTokenConta(dados.detalhe);
    res.send(`
      <html>
        <head><meta charset="UTF-8"><title>Mercado Livre conectado</title></head>
        <body style="font-family:Arial;padding:24px;line-height:1.5;">
          <h1>Mercado Livre conectado com sucesso!</h1>
          <p>Agora volte ao painel e tente buscar uma oferta novamente.</p>
          <p><a href="/">Voltar para o Caça Ofertas</a></p>
        </body>
      </html>
    `);
  } catch (erro) {
    console.error("Erro no callback ML:", erro);
    res.status(500).send("Erro interno: " + erro.message);
  }
});

app.get("/teste/ml", async (req, res) => {
  try {
    const token = await obterMelhorToken();
    const testes = [
      { nome: "sites", url: "https://api.mercadolibre.com/sites" },
      { nome: "site_mlb", url: "https://api.mercadolibre.com/sites/MLB" },
      { nome: "categorias_mlb", url: "https://api.mercadolibre.com/sites/MLB/categories" },
      { nome: "minha_conta", url: "https://api.mercadolibre.com/users/me" },
      { nome: "busca_publica", url: "https://api.mercadolibre.com/sites/MLB/search?q=air%20fryer&limit=2" }
    ];

    const resultados = [];
    for (const teste of testes) {
      const resposta = await fetch(teste.url, { headers: montarHeaders(token) });
      const texto = await resposta.text();
      resultados.push({
        nome: teste.nome,
        status: resposta.status,
        ok: resposta.ok,
        resumo: resumirResposta(tentarJson(texto))
      });
    }

    res.json({ token_usado: Boolean(token), conta_ml_conectada: Boolean(userTokenCache.token), resultados });
  } catch (erro) {
    res.status(500).json({ erro: "Erro no teste ML", detalhe: erro.message });
  }
});

app.get("/analisar-link", async (req, res) => {
  try {
    const urlProduto = String(req.query.url || "").trim();
    if (!urlProduto) return res.status(400).json({ erro: "Informe ?url= com o link do Mercado Livre." });

    const resultado = await analisarLinkProduto(urlProduto);
    if (!resultado.ok) return res.status(400).json(resultado);

    res.json(resultado);
  } catch (erro) {
    res.status(500).json({ erro: "Erro ao analisar link", detalhe: erro.message });
  }
});

app.post("/analisar-links", async (req, res) => {
  try {
    const entrada = req.body?.links || req.body?.texto || "";
    const links = normalizarListaLinks(entrada).slice(0, 30);

    if (!links.length) {
      return res.status(400).json({ erro: "Envie links do Mercado Livre em links[] ou texto." });
    }

    const analisadas = [];
    const erros = [];

    for (const link of links) {
      const resultado = await analisarLinkProduto(link);
      if (resultado.ok) analisadas.push(resultado.oferta);
      else erros.push({ link, erro: resultado.erro, detalhe: resultado.detalhe, link_final: resultado.link_final });
    }

    analisadas.sort((a, b) => b.nota_oferta - a.nota_oferta);
    res.json({ total_recebido: links.length, total_analisado: analisadas.length, ofertas: analisadas, erros });
  } catch (erro) {
    res.status(500).json({ erro: "Erro ao analisar links", detalhe: erro.message });
  }
});

app.get("/cacar-ofertas", async (req, res) => {
  try {
    const termo = String(req.query.q || "").trim();
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);

    if (!termo) return res.status(400).json({ erro: "Informe o produto em ?q=" });

    const endpoint = `https://api.mercadolibre.com/sites/${ML_SITE_ID}/search?q=${encodeURIComponent(termo)}&limit=${limit}`;
    const token = await obterMelhorToken();
    const resposta = await fetch(endpoint, { method: "GET", headers: montarHeaders(token) });
    const texto = await resposta.text();
    const dados = tentarJson(texto);

    if (!resposta.ok) {
      console.error("Falha Mercado Livre:", resposta.status, dados);
      return res.status(resposta.status).json({
        erro: "Busca por palavra-chave bloqueada pelo Mercado Livre neste app. Use /analisar-link ou /analisar-links.",
        status_http: resposta.status,
        credenciais_configuradas: Boolean(ML_CLIENT_ID && ML_CLIENT_SECRET),
        conta_ml_conectada: Boolean(userTokenCache.token),
        token_usado: Boolean(token),
        detalhe: dados,
        alternativa: {
          analisar_um_link: "/analisar-link?url=LINK_DO_ML",
          analisar_varios_links: "POST /analisar-links"
        }
      });
    }

    const ofertas = (dados.results || []).map(normalizarOferta).sort((a, b) => b.nota_oferta - a.nota_oferta);
    res.json({ termo, total: ofertas.length, token_usado: Boolean(token), conta_ml_conectada: Boolean(userTokenCache.token), ofertas });
  } catch (erro) {
    console.error("Erro interno:", erro);
    res.status(500).json({ erro: "Erro interno", detalhe: erro.message });
  }
});

async function analisarLinkProduto(link) {
  const linkFinal = await resolverLinkFinal(link);
  const id = extrairIdProdutoML(`${link} ${linkFinal}`);

  if (!id) {
    return { ok: false, erro: "Nao consegui identificar o ID do anuncio no link.", link, link_final: linkFinal || "" };
  }

  const token = await obterMelhorToken();
  const resposta = await fetch(`https://api.mercadolibre.com/items/${id}`, { headers: montarHeaders(token) });
  const texto = await resposta.text();
  const dados = tentarJson(texto);

  if (!resposta.ok) {
    return {
      ok: false,
      erro: "Falha ao consultar item no Mercado Livre",
      status_http: resposta.status,
      id,
      link,
      link_final: linkFinal || "",
      detalhe: dados
    };
  }

  const oferta = normalizarOferta(dados);
  oferta.link_original = link;
  oferta.link_final = linkFinal || link;
  return { ok: true, id, link_final: linkFinal || link, oferta };
}

async function resolverLinkFinal(link) {
  try {
    const entrada = String(link || "").trim();
    if (!entrada.startsWith("http")) return entrada;

    const resposta = await fetch(entrada, {
      method: "GET",
      redirect: "follow",
      headers: {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent": "Mozilla/5.0 CacaOfertasML/1.0"
      }
    });

    return resposta.url || entrada;
  } catch (erro) {
    console.error("Falha ao resolver link final:", erro.message);
    return link;
  }
}

function extrairIdProdutoML(texto) {
  const entrada = String(texto || "");
  const decodificado = safeDecode(entrada);
  const base = `${entrada} ${decodificado}`;

  const wid = base.match(/[?&#]wid=(MLB\d{6,})/i);
  if (wid) return wid[1].toUpperCase();

  const itemId = base.match(/[?&#](?:item_id|itemId|item)=?(MLB\d{6,})/i);
  if (itemId) return itemId[1].toUpperCase();

  const anuncioPath = base.match(/(?:produto\.mercadolivre\.com\.br|articulo\.mercadolibre\.com)[^\s]*\/(MLB-?\d{6,})-/i);
  if (anuncioPath) return anuncioPath[1].toUpperCase().replace("-", "");

  const generico = base.match(/MLB-?\d{9,}/i);
  if (generico) return generico[0].toUpperCase().replace("-", "");

  return "";
}

function safeDecode(valor) {
  try { return decodeURIComponent(valor); } catch { return valor; }
}

function normalizarListaLinks(entrada) {
  if (Array.isArray(entrada)) return entrada.map(String).map((x) => x.trim()).filter(Boolean);

  return String(entrada || "")
    .split(/\s+/)
    .map((x) => x.trim())
    .filter((x) => x.includes("meli.la") || x.includes("mercadolivre") || x.includes("mercadolibre") || /MLB-?\d{6,}/i.test(x));
}

function montarHeaders(token) {
  const headers = { "Accept": "application/json", "User-Agent": "Mozilla/5.0 CacaOfertasML/1.0" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function resumirResposta(dados) {
  if (Array.isArray(dados)) return { tipo: "array", total: dados.length, primeiro: dados[0] || null };
  if (!dados || typeof dados !== "object") return dados;
  return {
    message: dados.message,
    error: dados.error,
    status: dados.status,
    id: dados.id,
    nickname: dados.nickname,
    name: dados.name,
    results_total: dados.paging?.total,
    results: Array.isArray(dados.results) ? dados.results.slice(0, 2) : undefined
  };
}

async function obterMelhorToken() {
  const tokenConta = await obterTokenConta();
  if (tokenConta) return tokenConta;
  return obterTokenApp();
}

async function obterTokenConta() {
  if (!userTokenCache.token) return "";
  if (userTokenCache.expiresAt > Date.now() + 60000) return userTokenCache.token;
  if (!userTokenCache.renew) return "";
  const dados = await renovarTokenConta();
  if (!dados.ok) return "";
  salvarTokenConta(dados.detalhe);
  return userTokenCache.token;
}

async function trocarCodigoPorToken(code) {
  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("client_id", ML_CLIENT_ID);
  body.set("client_" + "secret", ML_CLIENT_SECRET);
  body.set("code", code);
  body.set("redirect_uri", ML_REDIRECT_URI);
  return chamadaToken(body);
}

async function renovarTokenConta() {
  const body = new URLSearchParams();
  body.set("grant_type", "refresh_token");
  body.set("client_id", ML_CLIENT_ID);
  body.set("client_" + "secret", ML_CLIENT_SECRET);
  body.set("refresh_token", userTokenCache.renew);
  return chamadaToken(body);
}

async function obterTokenApp() {
  if (!ML_CLIENT_ID || !ML_CLIENT_SECRET) return "";
  if (appTokenCache.token && appTokenCache.expiresAt > Date.now() + 60000) return appTokenCache.token;
  const body = new URLSearchParams();
  body.set("grant_type", "client_credentials");
  body.set("client_id", ML_CLIENT_ID);
  body.set("client_" + "secret", ML_CLIENT_SECRET);
  const dados = await chamadaToken(body);
  if (!dados.ok) return "";
  appTokenCache = { token: dados.detalhe.access_token || "", expiresAt: Date.now() + Number(dados.detalhe.expires_in || 0) * 1000 };
  return appTokenCache.token;
}

async function chamadaToken(body) {
  const tokenUrl = "https://api.mercadolibre.com/" + "oauth" + "/" + "token";
  const resposta = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const texto = await resposta.text();
  const detalhe = tentarJson(texto);
  if (!resposta.ok) {
    console.error("Falha token ML:", resposta.status, detalhe);
    return { ok: false, detalhe };
  }
  return { ok: true, detalhe };
}

function salvarTokenConta(dados) {
  userTokenCache = {
    token: dados.access_token || "",
    renew: dados.refresh_token || userTokenCache.renew || "",
    expiresAt: Date.now() + Number(dados.expires_in || 0) * 1000,
    userId: dados.user_id || userTokenCache.userId || null
  };
}

function tentarJson(texto) {
  try { return JSON.parse(texto); } catch { return { mensagem: texto }; }
}

function normalizarOferta(item) {
  const precoAtual = numero(item.price);
  const precoAntigo = numero(item.original_price);
  const desconto = calcularDesconto(precoAntigo, precoAtual);
  const freteGratis = Boolean(item.shipping?.free_shipping);
  const lojaOficial = Boolean(item.official_store_name);
  const imagem = item.thumbnail || item.secure_thumbnail || item.pictures?.[0]?.secure_url || item.pictures?.[0]?.url || "";
  const nota = calcularNota({ precoAtual, precoAntigo, desconto, freteGratis, lojaOficial, condicao: item.condition, status: item.status });

  return {
    plataforma: "mercado_livre",
    id_externo: item.id || "",
    titulo: item.title || "Produto sem titulo",
    preco_atual: precoAtual,
    preco_antigo: precoAntigo,
    desconto_percentual: desconto,
    imagem: trocarHttps(imagem),
    link_produto: item.permalink || "",
    link_afiliado: "",
    frete_gratis: freteGratis,
    loja_oficial: item.official_store_name || "",
    condicao: item.condition === "new" ? "novo" : item.condition || "nao informado",
    estoque_disponivel: numero(item.available_quantity),
    vendidos: numero(item.sold_quantity),
    status_ml: item.status || "",
    nota_oferta: nota,
    status: nota >= 75 ? "boa_oferta" : nota >= 50 ? "revisar" : "descartar"
  };
}

function calcularNota({ precoAtual, precoAntigo, desconto, freteGratis, lojaOficial, condicao, status }) {
  let nota = 0;
  if (desconto >= 50) nota += 35;
  else if (desconto >= 35) nota += 30;
  else if (desconto >= 25) nota += 24;
  else if (desconto >= 15) nota += 18;
  else if (desconto >= 8) nota += 10;
  if (freteGratis) nota += 20;
  if (lojaOficial) nota += 15;
  if (condicao === "new") nota += 15;
  if (status === "active") nota += 10;
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
