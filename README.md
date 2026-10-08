# Projeto: Prestação de Contas

Este projeto é um dashboard público em HTML + CSS + JavaScript para acompanhar receitas, despesas e gráficos mensais usando uma planilha do Google Sheets como base de dados.

## Funcionalidades

- Dashboard financeiro com resumo mensal
- Gráficos de categoria e evolução mensal
- Tabela de lançamentos
- Filtros por período, tipo e categoria
- Busca por descrição ou categoria
- Troca de tema claro/escuro
- Exportação para CSV
- Modal para adicionar lançamento (opcional, via Apps Script)

## Requisitos

- Navegador moderno
- Acesso público à planilha Google Sheets
- Opcional: Apps Script para cadastrar lançamentos no site

## Configuração rápida

1. Abra o arquivo `index.html` no navegador ou publique em GitHub Pages.
2. Ajuste o bloco `CONFIG` em `app.js` com os dados da planilha:

```js
const CONFIG = {
  title: "Prestação de Contas",
  organization: "Cev SÃO JOSÉ",
  spreadsheetId: "1Rl3mC-SgVbokLDOCM9yTBEJxPIu3oXQi",
  sheetName: "Planilha1",
  appsScriptUrl: "",
};
```

3. Confirme que a planilha está compartilhada como pública ou com link de leitura.
4. Se quiser inserir lançamentos pelo site, configure `appsScriptUrl` com um Google Apps Script que grave os dados na planilha.

## Estrutura dos dados da planilha

A planilha deve conter cabeçalhos como:

- Data
- Descrição
- Categoria
- Tipo
- Valor
- Comprovante

Exemplo:

| Data | Descrição | Categoria | Tipo | Valor | Comprovante |
|---|---|---|---|---|---|
| 05/08/2026 | Doações do mês | Doações | Receita | 3200,00 |  |
| 12/08/2026 | Compra de materiais | Materiais | Despesa | 850,50 | https://... |

## Apps Script (opcional)

Para permitir o cadastro via formulário, crie uma função Apps Script que receba um JSON POST e grave a linha na planilha. Exemplo de estrutura esperada:

```js
function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Planilha1');
  sheet.appendRow([
    data.data,
    data.descricao,
    data.categoria,
    data.tipo,
    data.valor,
    data.comprovante,
  ]);

  return ContentService.createTextOutput(JSON.stringify({ ok: true }));
}
```

Depois, publique como Web App e use a URL em `CONFIG.appsScriptUrl`.

## Publicação

Você pode publicar em GitHub Pages, Netlify ou Vercel.

## Observação

A leitura da planilha é feita pelo CSV público do Google Sheets, então o dashboard fica atualizado sempre que a planilha for alterada.

																																																																																				