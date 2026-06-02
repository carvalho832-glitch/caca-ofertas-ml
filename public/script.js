const campos = {
  titulo: document.getElementById("titulo"),
  preco: document.getElementById("preco"),
  precoAntigo: document.getElementById("precoAntigo"),
  link: document.getElementById("link"),
  imagem: document.getElementById("imagem"),
  cupom: document.getElementById("cupom"),
  linkAfiliado: document.getElementById("linkAfiliado"),
  freteGratis: document.getElementById("freteGratis"),
  linkTeste: document.getElementById("linkTeste")
};

const btnManual = document.getElementById("btnManual");
const btnLink = document.getElementById("btnLink");
const statusEl = document.getElementById("status");
const resultadosEl = document.getElementById("resultados");
const debugEl = document.getElementById("debug");

btnManual.addEventListener("click", gerarOfertaManual);
btnLink.addEventListener("click", testarLink);

async function gerarOfertaManual() {
  const payload = {
    titulo: campos.titulo.value.trim(),
    preco: campos.preco.value.trim(),
    preco_antigo: campos.precoAntigo.value.trim(),
    link: campos.link.value.trim(),
    imagem: campos.imagem.value.trim(),
    cupom: campos.cupom.value.trim(),
    link_afiliado: campos.linkAfiliado.value.trim(),
    frete_gratis: campos.freteGratis.checked,
    origem: "manual_frontend"
  };

  btnManual.disabled = true;
  statusEl.textContent = "Montando oferta...";
  resultadosEl.innerHTML = "";

  try {
    const response = await fetch("/oferta-manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();

    if (!response.ok) throw new Error(data.erro || "Erro ao montar oferta.");

    statusEl.textContent = `Oferta gerada com nota ${data.oferta.nota_oferta}/100.`;
    renderizarOfertas([data.oferta], data.mensagem, data.payload_bot);
  } catch (error) {
    statusEl.textContent = `Erro: ${error.message}`;
  } finally {
    btnManual.disabled = false;
  }
}

async function testarLink() {
  const link = campos.linkTeste.value.trim();
  if (!link) {
    debugEl.textContent = "Cole um link primeiro.";
    return;
  }

  btnLink.disabled = true;
  debugEl.textContent = "Testando link...";

  try {
    const response = await fetch(`/analisar-link?url=${encodeURIComponent(link)}`);
    const data = await response.json();
    debugEl.textContent = JSON.stringify(data, null, 2);

    if (data.ok && data.oferta) {
      renderizarOfertas([data.oferta], data.mensagem, { tipo: "oferta", oferta: data.oferta, mensagem: data.mensagem });
    }
  } catch (error) {
    debugEl.textContent = `Erro: ${error.message}`;
  } finally {
    btnLink.disabled = false;
  }
}

function renderizarOfertas(ofertas, mensagem = "", payloadBot = null) {
  if (!ofertas.length) {
    resultadosEl.innerHTML = `<p class="status">Nenhuma oferta gerada.</p>`;
    return;
  }

  resultadosEl.innerHTML = ofertas.map((oferta) => criarCardOferta(oferta, mensagem, payloadBot)).join("");

  document.querySelectorAll("[data-copiar]").forEach((btn) => {
    btn.addEventListener("click", () => copiarTexto(decodeURIComponent(btn.dataset.copiar), btn));
  });
}

function criarCardOferta(oferta, mensagem, payloadBot) {
  const jsonEncoded = encodeURIComponent(JSON.stringify(oferta, null, 2));
  const mensagemEncoded = encodeURIComponent(mensagem || "");
  const payloadEncoded = encodeURIComponent(JSON.stringify(payloadBot || oferta, null, 2));
  const precoAtual = formatarMoeda(oferta.preco_atual);
  const precoAntigo = oferta.preco_antigo ? formatarMoeda(oferta.preco_antigo) : "";
  const statusClass = oferta.nota_oferta >= 75 ? "good" : oferta.nota_oferta >= 50 ? "warn" : "";

  return `
    <article class="card wide-card">
      ${oferta.imagem ? `<img src="${escaparHtml(oferta.imagem)}" alt="${escaparHtml(oferta.titulo)}" loading="lazy" />` : `<div class="image-placeholder">Sem imagem</div>`}
      <div class="card-body">
        <h3>${escaparHtml(oferta.titulo)}</h3>
        ${precoAntigo ? `<div class="old-price">De ${precoAntigo}</div>` : ""}
        <div class="price">${precoAtual}</div>
        <div class="badges">
          <span class="badge ${statusClass}">Nota ${oferta.nota_oferta}/100</span>
          <span class="badge">${escaparHtml(oferta.status)}</span>
          ${oferta.desconto_percentual ? `<span class="badge good">-${oferta.desconto_percentual}%</span>` : ""}
          ${oferta.frete_gratis ? `<span class="badge good">Frete grátis</span>` : ""}
          ${oferta.cupom ? `<span class="badge warn">Cupom ${escaparHtml(oferta.cupom)}</span>` : ""}
        </div>
        ${mensagem ? `<pre class="message-box">${escaparHtml(mensagem)}</pre>` : ""}
        <div class="card-actions triple">
          <a href="${escaparHtml(oferta.link_afiliado || oferta.link_produto)}" target="_blank" rel="noopener">Ver produto</a>
          <button data-copiar="${mensagemEncoded}">Copiar msg</button>
          <button data-copiar="${payloadEncoded}">Copiar p/ bot</button>
          <button data-copiar="${jsonEncoded}">Copiar JSON</button>
        </div>
      </div>
    </article>
  `;
}

async function copiarTexto(texto, btn) {
  await navigator.clipboard.writeText(texto);
  const original = btn.textContent;
  btn.textContent = "Copiado!";
  setTimeout(() => (btn.textContent = original), 1400);
}

function formatarMoeda(valor) {
  if (!Number.isFinite(Number(valor))) return "Preço indisponível";
  return Number(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function escaparHtml(texto) {
  return String(texto || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
