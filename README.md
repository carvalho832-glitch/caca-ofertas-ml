# Caça Ofertas ML

Projeto separado para buscar ofertas no Mercado Livre, calcular uma nota simples da oferta e preparar os dados em JSON para integração futura com o bot de mensagens.

## Status

Primeira versão criada com:

- Backend Node.js + Express
- Painel web simples em HTML, CSS e JavaScript
- Busca pública no Mercado Livre por palavra-chave
- Cálculo de desconto
- Nota da oferta
- Botão para copiar o JSON da oferta

## Rodar localmente

```bash
npm install
npm start
```

Depois abra:

```txt
http://localhost:3000
```

## Rotas

```txt
GET /health
GET /cacar-ofertas?q=air fryer&limit=20
```

## Deploy no Render

Configuração sugerida:

```txt
Build Command: npm install
Start Command: npm start
```

Variáveis opcionais no Render:

```txt
PORT=3000
ML_SITE_ID=MLB
```

## Próximas fases

1. Melhorar filtro de ofertas.
2. Criar campo para inserir link afiliado.
3. Integrar com o bot que monta mensagens.
4. Criar fila de ofertas aprovadas.
5. Adicionar Shopee e Amazon depois que a versão Mercado Livre estiver redonda.
