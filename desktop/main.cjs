/**
 * main.cjs — Contífico POS Lab como app de escritorio.
 *
 * Igual que Mesita Caja: doble clic y listo. Arranca el server Express del POS
 * EN ESTE MISMO proceso (modo CONTIFICO_LAB, puerto propio 4611 para no chocar
 * con el dev server 4090) y abre la pantalla del mesero. El botón
 * "🔌 Verificar Bridge" de la pantalla trae todo lo necesario para conectar
 * Mesita Caja (host/puerto/base/usuario del MySQL simulado + checks en verde).
 */

process.env.CONTIFICO_LAB = "1";
process.env.PORT = process.env.PORT || "4611";
process.env.NODE_ENV = process.env.NODE_ENV || "production";

const { app, BrowserWindow, shell } = require("electron");
const path = require("path");

const URL = `http://127.0.0.1:${process.env.PORT}/contifico-lab.html`;
let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    title: "Contífico POS — Lab",
    backgroundColor: "#F3F7F9",
    icon: path.join(__dirname, "..", "public", "favicon.png"),
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.removeMenu?.();
  cargar();
  // links externos → navegador del sistema
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
  win.on("closed", () => { win = null; });
}

function cargar(intento = 0) {
  if (!win) return;
  win.loadURL(URL).catch(() => {
    if (intento < 40) setTimeout(() => cargar(intento + 1), 500); // el server aún levanta
  });
}
// si el server todavía no escucha, reintenta solo
app.on("web-contents-created", (_e, wc) => {
  wc.on("did-fail-load", () => setTimeout(() => cargar(1), 600));
});

app.whenReady().then(async () => {
  // El server del POS corre dentro de la app (no hay terminal que abrir).
  const server = require(path.join(__dirname, "..", "src", "app.js"));
  server.start();
  createWindow();
  app.on("activate", () => { if (!win) createWindow(); });
});

app.on("window-all-closed", () => app.quit());
