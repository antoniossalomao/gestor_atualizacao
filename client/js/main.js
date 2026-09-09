import { ApiClient } from "./api/ApiClient.js";
import { App } from "./core/App.js";
import { iniciarTema } from "./core/theme.js";
import { iniciarAparencia } from "./core/appearance.js";

// Ponto de entrada do front-end: aplica o tema salvo, cria o cliente de API e
// a aplicação, e manda ela decidir o que mostrar (login ou o app principal).
// Equivalente do antigo "App(DB_PATH).mainloop()" em Atualizacao.py -- só que
// aqui não existe "mainloop": o navegador já fica reagindo a eventos sozinho.
//
// O tema vem PRIMEIRO, antes de qualquer coisa ser desenhada: aplicar depois
// faria a tela piscar no tema errado por um quadro ("flash of wrong theme").
iniciarTema();
// Densidade das tabelas, pelo mesmo motivo e no mesmo momento: é um atributo
// no <html> que o CSS lê, e aplicá-lo depois faria as linhas nascerem numa
// altura e pularem para outra.
iniciarAparencia();

const api = new ApiClient();
const app = new App(document.getElementById("app"), api);
app.start();
