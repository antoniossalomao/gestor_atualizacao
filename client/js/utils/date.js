/** Data de hoje no formato dd/mm/aaaa, usada para pré-preencher formulários. */
export function todayBR() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Digitação numérica progressiva: 21092026 vira 21/09/2026. */
export function mascaraDataBR(valor) {
  const numeros = String(valor || "").replace(/\D/g, "").slice(0, 8);
  if (numeros.length <= 2) return numeros;
  if (numeros.length <= 4) return `${numeros.slice(0, 2)}/${numeros.slice(2)}`;
  return `${numeros.slice(0, 2)}/${numeros.slice(2, 4)}/${numeros.slice(4)}`;
}

/**
 * True se `texto` estiver vazio ou for uma data real no formato dd/mm/aaaa.
 * Mesma regra do backend (server/src/shared/validation.js) -- checada de
 * novo aqui só para dar feedback instantâneo no formulário, sem esperar a
 * viagem até o servidor. A validação que realmente importa (a que decide se o
 * registro é salvo) continua sendo a do backend.
 */
export function isValidDateBR(texto) {
  if (!texto) return true;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto);
  if (!m) return false;
  const [, diaStr, mesStr, anoStr] = m;
  const dia = Number(diaStr);
  const mes = Number(mesStr);
  const ano = Number(anoStr);
  const d = new Date(ano, mes - 1, dia);
  return d.getFullYear() === ano && d.getMonth() === mes - 1 && d.getDate() === dia;
}

/** ISO -> "19/08/2026 11:56" no fuso do navegador. */
export function formatarDataHora(valor) {
  if (!valor) return "—";
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(d);
}

/**
 * Tempo relativo em português ("agora", "há 5 min", "há 3 dias").
 *
 * Num painel de monitoramento, "12/08 03:14" obriga a pessoa a fazer a conta
 * de cabeça para saber se aquilo é recente. "há 4 minutos" responde na hora.
 * Os dois convivem: o relativo no texto, o absoluto no `title`.
 */
export function tempoRelativo(valor) {
  if (!valor) return "nunca";
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return "nunca";

  const segundos = Math.floor((Date.now() - d.getTime()) / 1000);
  if (segundos < 45) return "agora";
  if (segundos < 90) return "há 1 min";

  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `há ${minutos} min`;

  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas} h`;

  const dias = Math.floor(horas / 24);
  if (dias === 1) return "ontem";
  if (dias < 30) return `há ${dias} dias`;

  const meses = Math.floor(dias / 30);
  if (meses < 12) return `há ${meses} ${meses === 1 ? "mês" : "meses"}`;

  const anos = Math.floor(meses / 12);
  return `há ${anos} ${anos === 1 ? "ano" : "anos"}`;
}

/** Bytes em unidade legível ("24,3 MB") -- usado no peso dos pacotes. */
export function formatarBytes(bytes) {
  if (!bytes || Number.isNaN(Number(bytes))) return "—";
  const unidades = ["B", "KB", "MB", "GB"];
  let valor = Number(bytes);
  let i = 0;
  while (valor >= 1024 && i < unidades.length - 1) {
    valor /= 1024;
    i += 1;
  }
  return `${valor.toFixed(i === 0 ? 0 : 1).replace(".", ",")} ${unidades[i]}`;
}

/** Duração em ms -> "1 min 12 s" / "820 ms". */
export function formatarDuracao(ms) {
  if (!ms || Number.isNaN(Number(ms))) return "—";
  const total = Number(ms);
  if (total < 1000) return `${total} ms`;
  const segundos = Math.round(total / 1000);
  if (segundos < 60) return `${segundos} s`;
  const minutos = Math.floor(segundos / 60);
  return `${minutos} min ${segundos % 60} s`;
}
