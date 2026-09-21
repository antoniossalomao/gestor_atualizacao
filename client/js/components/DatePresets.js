const pad = (n) => String(n).padStart(2, "0");
const br = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

export function intervaloPreset(chave, agora = new Date()) {
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const inicio = new Date(hoje);
  let fim = new Date(hoje);
  if (chave === "ontem") inicio.setDate(inicio.getDate() - 1), (fim = new Date(inicio));
  if (chave === "semana") inicio.setDate(inicio.getDate() - ((inicio.getDay() + 6) % 7));
  if (chave === "mes") inicio.setDate(1);
  if (chave === "30dias") inicio.setDate(inicio.getDate() - 29);
  return { desde: br(inicio), ate: br(fim) };
}

/** Monta os atalhos de período e devolve uma função para atualizar o ativo. */
export function montarPresets(container, aoEscolher) {
  const opcoes = [
    ["hoje", "Hoje"], ["ontem", "Ontem"], ["semana", "Esta semana"],
    ["mes", "Este mês"], ["30dias", "Últimos 30 dias"], ["custom", "Personalizado"],
  ];
  container.innerHTML = opcoes.map(([key, label]) => `<button type="button" class="btn btn--preset" data-range="${key}">${label}</button>`).join("");
  container.addEventListener("click", (e) => {
    const botao = e.target.closest("[data-range]");
    if (!botao) return;
    aoEscolher(botao.dataset.range, botao.dataset.range === "custom" ? null : intervaloPreset(botao.dataset.range));
  });
  return (chave = "") => {
    for (const botao of container.querySelectorAll("[data-range]")) botao.classList.toggle("is-active", botao.dataset.range === chave);
  };
}
