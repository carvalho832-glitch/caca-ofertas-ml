const input = document.getElementById("termo");
const btnBuscar = document.getElementById("btnBuscar");
const statusEl = document.getElementById("status");
const resultadosEl = document.getElementById("resultados");

btnBuscar.addEventListener("click", buscarOfertas);
input.addEventListener("keydown", (event) => {
  if (event.key === "Enter") buscarOfertas();
});

async function buscarOfertas() {
  const termo = input.value.trim();

  if (!termo) {
    statusEl.textContent = "Digite o nome de um produto primeiro.";
    return;
  }

  btnBuscar.disabled = true;
  statusEl.textContent = "Caçando ofertas...";
  resultadosEl.innerHTML = "";

  try {
    const response = await fetch(`/cacar-ofertas?q=${encodeURIComponent(termo)}&limit=20`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.erro || "Erro ao buscar ofertas.");
    }

    statusEl.textContent = `${data.total} ofertas encontradas para: ${data.termo}`;
    renderizarOfertas(data.ofertas || []);
  } catch (error) {
    statusEl.textContent = `Erro: ${error.message}`;
  } finally {
    btnBuscar.disabled = false;
  }
}

function renderizarOfertas(ofertas) {
  if (!ofertas.length) {
    resultadosEl.innerHTML = `<p class="status">Nenhuma oferta encontrada.</p>`;
    return;
  }

  resultadosEl.innerHTML = ofertas.map((oferta) => criarCardOferta(oferta)).join("");

  document.querySelectorAll("[data-copiar]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const oferta = JSON.parse(decodeURIComponent(btn.dataset.copiar));
      navigator.clipboard.writeText(JSON.stringify(oferta, null, 2));
      btn.textContent = "Copiado!";
      setTimeout(() => (btn.textContent = "Copiar JSON"), 1400);
    });
  });
}

function criarCardOferta(oferta) {
  const ofertaEncoded = encodeURIComponent(JSON.stringify(oferta));
  const precoAtual = formatarMoeda(oferta.preco_atual);
  const precoAntigo = oferta.preco_antigo ? formatarMoeda(oferta.preco_antigo) : "";
  const statusClass = oferta.nota_oferta >= 75 ? "good" : oferta.nota_oferta >= 50 ? "warn" : "";

  return `
    <article class="card">
      <img src="${oferta.imagem || ""}" alt="${escaparHtml(oferta.titulo)}" loading="lazy" />
      <div class="card-body">
        <h3>${escaparHtml(oferta.titulo)}</h3>
        ${precoAntigo ? `<div class="old-price">De ${precoAntigo}</div>` : ""}
        <div class="price">${precoAtual}</div>
        <div class="badges">
          <span class="badge ${statusClass}">Nota ${oferta.nota_oferta}/100</span>
          <span class="badge">${oferta.status}</span>
          ${oferta.desconto_percentual ? `<span class="badge good">-${oferta.desconto_percentual}%</span>` : ""}
          ${oferta.frete_gratis ? `<span class="badge good">Frete grátis</span>` : ""}
          ${oferta.loja_oficial ? `<span class="badge">Loja oficial</span>` : ""}
        </div>
        <div class="card-actions">
          <a href="${oferta.link_produto}" target="_blank" rel="noopener">Ver produto</a>
          <button data-copiar="${ofertaEncoded}">Copiar JSON</button>
        </div>
      </div>
    </article>
  `;
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
