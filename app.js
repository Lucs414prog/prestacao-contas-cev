const CONFIG = {
  title: "Prestação de Contas",
  organization: "Cev SÃO JOSÉ",
  spreadsheetId: "1Rl3mC-SgVbokLDOCM9yTBEJxPIu3oXQi",
  sheetName: "Planilha1",
  appsScriptUrl: "",
};

const state = {
  rows: [],
  filtered: [],
  months: [],
  categoryColors: [
    "#2a9d63",
    "#d75d3d",
    "#3d7bd9",
    "#d89f3a",
    "#8f63d8",
    "#4aa6a0",
    "#d9778e",
    "#6f9f3f",
    "#b76a3b",
    "#5c6d8c",
  ],
  charts: {
    category: null,
    monthly: null,
  },
};

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const percent = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 1,
});

const $ = (selector) => document.querySelector(selector);

function showAlert(message, type = "") {
  const box = $("#alertBox");
  box.textContent = message;
  box.className = `alert-box ${type}`.trim();
  box.classList.remove("hidden");
}

function hideAlert() {
  $("#alertBox").classList.add("hidden");
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function parseMoney(value) {
  if (value === null || value === undefined || value === "") return 0;
  const clean = String(value)
    .replace(/R\$\s?/gi, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .trim();

  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDate(value) {
  if (!value) return null;
  const text = String(value).trim();

  const matchDay = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (matchDay) {
    const [, day, month, year] = matchDay;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const matchIso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (matchIso) {
    const [, year, month, day] = matchIso;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  return null;
}

function monthKey(dateObj) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function monthLabel(monthKeyValue) {
  if (!monthKeyValue) return "Todos";
  const [year, month] = monthKeyValue.split("-");
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
}

function monthShort(monthKeyValue) {
  if (!monthKeyValue) return "";
  const [year, month] = monthKeyValue.split("-");
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("pt-BR", {
    month: "short",
    year: "2-digit",
  });
}

function parseCSV(text) {
  const rows = [];
  let currentValue = "";
  let currentRow = [];
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (insideQuotes && next === '"') {
        currentValue += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (char === "," && !insideQuotes) {
      currentRow.push(currentValue);
      currentValue = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (char === "\r" && next === "\n") i++;
      currentRow.push(currentValue);
      if (currentRow.some((cell) => String(cell).trim() !== "")) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentValue = "";
      continue;
    }

    currentValue += char;
  }

  if (currentValue.length > 0 || currentRow.length > 0) {
    currentRow.push(currentValue);
    if (currentRow.some((cell) => String(cell).trim() !== "")) {
      rows.push(currentRow);
    }
  }

  return rows;
}

function findHeaderIndex(headers, aliases) {
  return headers.findIndex((header) => {
    const normalized = normalizeText(header);
    return aliases.some((alias) => normalized === alias || normalized.includes(alias));
  });
}

function buildRow(rawRow, headers) {
  const aliases = {
    data: ["data", "data lancamento", "date", "dt"],
    descricao: ["descricao", "descrição", "nome", "detalhe", "observacao"],
    categoria: ["categoria", "classificacao", "tipo de gasto", "centro de custo"],
    tipo: ["tipo", "natureza", "movimento", "receita ou despesa"],
    valor: ["valor", "montante", "valor total", "valor (r$)"],
    comprovante: ["comprovante", "comprovante link", "link comprovante", "link"],
  };

  const indexes = {
    data: findHeaderIndex(headers, aliases.data),
    descricao: findHeaderIndex(headers, aliases.descricao),
    categoria: findHeaderIndex(headers, aliases.categoria),
    tipo: findHeaderIndex(headers, aliases.tipo),
    valor: findHeaderIndex(headers, aliases.valor),
    comprovante: findHeaderIndex(headers, aliases.comprovante),
  };

  if (indexes.data === -1 || indexes.tipo === -1 || indexes.valor === -1) {
    return null;
  }

  const data = parseDate(rawRow[indexes.data]);
  const tipoRaw = String(rawRow[indexes.tipo] ?? "").trim();
  const tipo = normalizeText(tipoRaw).startsWith("rec") ? "receita" : "despesa";
  const valor = parseMoney(rawRow[indexes.valor]);

  if (!data || !tipo || !valor) {
    return null;
  }

  return {
    date: data,
    dateText: rawRow[indexes.data].trim(),
    descricao: (rawRow[indexes.descricao] || "Sem descrição").trim(),
    categoria: (rawRow[indexes.categoria] || "Sem categoria").trim() || "Sem categoria",
    tipo,
    valor: Math.abs(valor),
    comprovante: (rawRow[indexes.comprovante] || "").trim(),
  };
}

async function loadSpreadsheetData() {
  const url = `https://docs.google.com/spreadsheets/d/${CONFIG.spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(CONFIG.sheetName)}`;

  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Não foi possível acessar a planilha.");
    }

    const csv = await response.text();
    const rows = parseCSV(csv);

    if (rows.length < 2) {
      throw new Error("A planilha está vazia ou sem cabeçalho válido.");
    }

    const headers = rows[0].map((cell) => cell.trim());
    const parsedRows = [];

    for (let i = 1; i < rows.length; i++) {
      const row = buildRow(rows[i], headers);
      if (row) parsedRows.push(row);
    }

    if (!parsedRows.length) {
      throw new Error("Nenhum lançamento válido foi encontrado na planilha.");
    }

    state.rows = parsedRows.sort((a, b) => b.date - a.date);
    state.months = [...new Set(state.rows.map((row) => monthKey(row.date)))].sort();
    populateMonthSelect();
    initializeFilters();
    render();
    hideAlert();
    $("#statusBadge").textContent = "Conectado";
  } catch (error) {
    showAlert(error.message || "Falha ao carregar os dados da planilha.", "error");
    $("#statusBadge").textContent = "Erro";
  }
}

function populateMonthSelect() {
  const monthSelect = $("#monthSelect");
  monthSelect.innerHTML = '<option value="all">Todos os meses</option>';

  state.months.forEach((month) => {
    const option = document.createElement("option");
    option.value = month;
    option.textContent = monthLabel(month);
    monthSelect.appendChild(option);
  });
}

function populateCategoryFilter() {
  const categorySelect = $("#categorySelect");
  const categories = [...new Set(state.rows.map((row) => row.categoria))].sort();

  categorySelect.innerHTML = '<option value="all">Todas</option>';
  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    categorySelect.appendChild(option);
  });
}

function getFilteredRows() {
  const monthValue = $("#monthSelect").value;
  const typeValue = $("#typeSelect").value;
  const categoryValue = $("#categorySelect").value;
  const searchValue = normalizeText($("#searchInput").value);

  return state.rows.filter((row) => {
    const monthPass = monthValue === "all" || monthKey(row.date) === monthValue;
    const typePass = typeValue === "all" || row.tipo === typeValue;
    const categoryPass = categoryValue === "all" || row.categoria === categoryValue;
    const searchPass =
      !searchValue ||
      normalizeText(row.descricao).includes(searchValue) ||
      normalizeText(row.categoria).includes(searchValue);

    return monthPass && typePass && categoryPass && searchPass;
  });
}

function renderSummary(rows) {
  const receitas = rows.filter((row) => row.tipo === "receita").reduce((sum, row) => sum + row.valor, 0);
  const despesas = rows.filter((row) => row.tipo === "despesa").reduce((sum, row) => sum + row.valor, 0);
  const saldoPeriodo = receitas - despesas;

  const historical = state.rows.filter((row) => {
    const selectedMonth = $("#monthSelect").value;
    if (selectedMonth === "all") return true;
    return monthKey(row.date) <= selectedMonth;
  });

  const receitasAcumuladas = historical.filter((row) => row.tipo === "receita").reduce((sum, row) => sum + row.valor, 0);
  const despesasAcumuladas = historical.filter((row) => row.tipo === "despesa").reduce((sum, row) => sum + row.valor, 0);
  const saldoAcumulado = receitasAcumuladas - despesasAcumuladas;

  $("#receitasValor").textContent = currency.format(receitas);
  $("#despesasValor").textContent = currency.format(despesas);
  $("#saldoPeriodoValor").textContent = currency.format(saldoPeriodo);
  $("#saldoAcumuladoValor").textContent = currency.format(saldoAcumulado);

  $("#saldoPeriodoValor").className = saldoPeriodo >= 0 ? "value-positive" : "value-negative";
  $("#saldoAcumuladoValor").className = saldoAcumulado >= 0 ? "value-positive" : "value-negative";
}

function renderCategories(rows) {
  const despesas = rows.filter((row) => row.tipo === "despesa");
  const grouped = {};

  despesas.forEach((row) => {
    grouped[row.categoria] = (grouped[row.categoria] ?? 0) + row.valor;
  });

  const entries = Object.entries(grouped).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);

  const legend = $("#categoriaLegend");
  legend.innerHTML = "";

  if (!entries.length) {
    legend.innerHTML = '<li><span>Sem despesas para este filtro.</span></li>';
  }

  entries.forEach(([label, value], index) => {
    const item = document.createElement("li");
    const dot = document.createElement("span");
    dot.className = "legend-dot";
    dot.style.background = state.categoryColors[index % state.categoryColors.length];

    const text = document.createElement("span");
    text.textContent = label;

    const amount = document.createElement("span");
    amount.className = "legend-value";
    amount.textContent = `${currency.format(value)} · ${percent.format(total ? value / total : 0)}`;

    item.appendChild(dot);
    item.appendChild(text);
    item.appendChild(amount);
    legend.appendChild(item);
  });

  if (state.charts.category) {
    state.charts.category.destroy();
  }

  state.charts.category = new Chart($("#categoriaChart"), {
    type: "doughnut",
    data: {
      labels: entries.map(([label]) => label),
      datasets: [
        {
          data: entries.map(([, value]) => value),
          backgroundColor: entries.map((_, index) => state.categoryColors[index % state.categoryColors.length]),
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => {
              const value = context.parsed;
              return ` ${context.label}: ${currency.format(value)}`;
            },
          },
        },
      },
    },
  });
}

function renderMonthlyChart(rows) {
  const monthsToShow = state.months.slice(-12);

  const receitasSeries = monthsToShow.map((month) =>
    rows
      .filter((row) => monthKey(row.date) === month && row.tipo === "receita")
      .reduce((sum, row) => sum + row.valor, 0)
  );

  const despesasSeries = monthsToShow.map((month) =>
    rows
      .filter((row) => monthKey(row.date) === month && row.tipo === "despesa")
      .reduce((sum, row) => sum + row.valor, 0)
  );

  if (state.charts.monthly) {
    state.charts.monthly.destroy();
  }

  state.charts.monthly = new Chart($("#mensalChart"), {
    type: "bar",
    data: {
      labels: monthsToShow.map((month) => monthShort(month)),
      datasets: [
        {
          label: "Receitas",
          data: receitasSeries,
          backgroundColor: "#2a9d63",
          borderRadius: 6,
        },
        {
          label: "Despesas",
          data: despesasSeries,
          backgroundColor: "#d75d3d",
          borderRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (value) => currency.format(value),
          },
        },
      },
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: (context) => ` ${context.dataset.label}: ${currency.format(context.parsed)}`,
          },
        },
      },
    },
  });
}

function renderTable(rows) {
  const tbody = $("#tbody");
  tbody.innerHTML = "";

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="6">Nenhum dado encontrado para este filtro.</td></tr>';
    $("#resultCount").textContent = "0 itens";
    return;
  }

  rows
    .slice()
    .sort((a, b) => b.date - a.date)
    .forEach((row) => {
      const tr = document.createElement("tr");

      const dateCell = document.createElement("td");
      dateCell.textContent = row.dateText;

      const descCell = document.createElement("td");
      descCell.textContent = row.descricao;

      const categoryCell = document.createElement("td");
      categoryCell.textContent = row.categoria;

      const typeCell = document.createElement("td");
      typeCell.textContent = row.tipo === "receita" ? "Receita" : "Despesa";

      const valueCell = document.createElement("td");
      valueCell.className = row.tipo === "receita" ? "value-positive" : "value-negative";
      valueCell.textContent = `${row.tipo === "receita" ? "+" : "-"} ${currency.format(row.valor)}`;

      const proofCell = document.createElement("td");
      if (row.comprovante) {
        const anchor = document.createElement("a");
        anchor.href = row.comprovante;
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        anchor.className = "link-btn";
        anchor.textContent = "Abrir";
        proofCell.appendChild(anchor);
      } else {
        proofCell.textContent = "—";
      }

      tr.appendChild(dateCell);
      tr.appendChild(descCell);
      tr.appendChild(categoryCell);
      tr.appendChild(typeCell);
      tr.appendChild(valueCell);
      tr.appendChild(proofCell);

      tbody.appendChild(tr);
    });

  $("#resultCount").textContent = `${rows.length} item${rows.length > 1 ? "s" : ""}`;
}

function render() {
  const filtered = getFilteredRows();
  state.filtered = filtered;
  renderSummary(filtered);
  renderCategories(filtered);
  renderMonthlyChart(state.rows);
  renderTable(filtered);
}

function initializeFilters() {
  populateCategoryFilter();

  $("#monthSelect").addEventListener("change", render);
  $("#typeSelect").addEventListener("change", render);
  $("#categorySelect").addEventListener("change", render);
  $("#searchInput").addEventListener("input", render);
}

function setTheme(theme) {
  document.body.classList.toggle("dark", theme === "dark");
  localStorage.setItem("theme", theme);
  $("#themeToggle").textContent = theme === "dark" ? "☀️" : "🌙";
}

function setupTheme() {
  const saved = localStorage.getItem("theme") || "light";
  setTheme(saved);
  $("#themeToggle").addEventListener("click", () => {
    const next = document.body.classList.contains("dark") ? "light" : "dark";
    setTheme(next);
  });
}

function setupModal() {
  const modal = $("#addModal");
  const openBtn = $("#openAddModal");
  const closeElements = document.querySelectorAll("[data-close-modal]");

  openBtn.addEventListener("click", () => {
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
  });

  closeElements.forEach((element) => {
    element.addEventListener("click", () => {
      modal.classList.add("hidden");
      modal.setAttribute("aria-hidden", "true");
    });
  });

  $("#addForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!CONFIG.appsScriptUrl) {
      showAlert("Configure CONFIG.appsScriptUrl para permitir o cadastro de lançamentos via formulário.", "error");
      return;
    }

    const form = new FormData(event.target);
    const payload = {
      data: form.get("data"),
      descricao: form.get("descricao"),
      categoria: form.get("categoria"),
      tipo: form.get("tipo"),
      valor: form.get("valor"),
      comprovante: form.get("comprovante") || "",
    };

    try {
      const response = await fetch(CONFIG.appsScriptUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Erro ao salvar no Google Sheets.");
      }

      showAlert("Lançamento salvo com sucesso.", "");
      event.target.reset();
      modal.classList.add("hidden");
      await loadSpreadsheetData();
    } catch (error) {
      showAlert(error.message || "Falha ao salvar o lançamento.", "error");
    }
  });
}

function exportCsv() {
  if (!state.rows.length) {
    showAlert("Não há dados para exportar.", "error");
    return;
  }

  const header = ["Data", "Descrição", "Categoria", "Tipo", "Valor", "Comprovante"];
  const rows = state.rows.map((row) => [
    row.dateText,
    row.descricao,
    row.categoria,
    row.tipo,
    row.valor.toFixed(2).replace(".", ","),
    row.comprovante,
  ]);

  const csv = [header, ...rows]
    .map((line) => line.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "prestacao-de-contas.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

function printPage() {
  window.print();
}

function setupActions() {
  $("#exportCsvBtn").addEventListener("click", exportCsv);
  $("#printBtn").addEventListener("click", printPage);
}

function initialize() {
  $("#pageTitle").textContent = CONFIG.title;
  $("#orgName").textContent = CONFIG.organization;
  document.title = CONFIG.title;

  setupTheme();
  setupModal();
  setupActions();
  loadSpreadsheetData();
}

document.addEventListener("DOMContentLoaded", initialize);

																																																																																																																																	