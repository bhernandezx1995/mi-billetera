"use strict";

const clave = "mi-billetera-v1";
const categoriasPorTipo = {
  gasto: ["Alimentación", "Transporte", "Vivienda", "Servicios", "Salud", "Educación", "Entretenimiento", "Compras", "Otros"],
  ingreso: ["Salario", "Trabajo independiente", "Ventas", "Regalos", "Otros"]
};
const moneda = new Intl.NumberFormat("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatoMes = new Intl.DateTimeFormat("es-GT", { month: "long", year: "numeric", timeZone: "UTC" });
const formatoFecha = new Intl.DateTimeFormat("es-GT", { dateStyle: "medium", timeZone: "UTC" });
const porId = (id) => document.getElementById(id);

const estado = porId("estado");
const selectorMes = porId("mes");
const filtro = porId("filtro");
const limite = porId("limite");
const editor = porId("editor");
const formulario = porId("form-movimiento");
const tipo = porId("tipo");
const monto = porId("monto");
const fecha = porId("fecha");
const categoria = porId("categoria");
const descripcion = porId("descripcion");
const confirmacion = porId("confirmacion");
const archivoRespaldo = porId("archivo-respaldo");
const restauracion = porId("restauracion");
const estadoRespaldo = porId("estado-respaldo");
let copiaPendiente = null;
let idEnEdicion = null;
let idParaEliminar = null;
let mesActivo = hoyLocal().slice(0, 7);
let datos = cargarDatos();

// Los importes se guardan en centavos enteros para evitar errores al sumar.
function quetzales(centavos) {
  const signo = centavos < 0 ? "−" : "";
  return signo + "Q " + moneda.format(Math.abs(centavos) / 100);
}

function hoyLocal() {
  const hoy = new Date();
  const mes = String(hoy.getMonth() + 1).padStart(2, "0");
  const dia = String(hoy.getDate()).padStart(2, "0");
  return hoy.getFullYear() + "-" + mes + "-" + dia;
}

function avisar(mensaje, error = false) {
  estado.textContent = mensaje;
  estado.classList.toggle("error", error);
  estado.hidden = !mensaje;
}

// Se confirma la escritura antes de actualizar el panel.
function cargarDatos() {
  try {
    const guardado = localStorage.getItem(clave);
    if (guardado) return JSON.parse(guardado);
  } catch {
    avisar("No se pudieron leer los datos guardados en este navegador.", true);
  }
  return { movimientos: [], presupuestos: {} };
}

function guardarDatos(siguientesDatos) {
  try {
    localStorage.setItem(clave, JSON.stringify(siguientesDatos));
  } catch {
    avisar("No se pudo guardar. Revisa el almacenamiento de este navegador e inténtalo de nuevo.", true);
    return false;
  }
  datos = siguientesDatos;
  return true;
}

function actualizarPanel() {
  const delMes = datos.movimientos.filter((movimiento) => movimiento.fecha.startsWith(mesActivo + "-"));
  const ingresos = delMes.filter((m) => m.tipo === "ingreso").reduce((total, m) => total + m.centavos, 0);
  const gastos = delMes.filter((m) => m.tipo === "gasto").reduce((total, m) => total + m.centavos, 0);
  const saldo = datos.movimientos.reduce((total, m) => total + (m.tipo === "ingreso" ? m.centavos : -m.centavos), 0);

  porId("saldo").textContent = quetzales(saldo);
  porId("ingresos").textContent = quetzales(ingresos);
  porId("gastos").textContent = quetzales(gastos);
  porId("mes-visible").textContent = formatoMes.format(new Date(mesActivo + "-01T00:00:00Z"));
  actualizarGrafica(ingresos, gastos);
  actualizarPresupuesto(gastos);
  actualizarHistorial(delMes);
  actualizarCategorias(delMes, gastos);
}

function actualizarGrafica(ingresos, gastos) {
  const escala = Math.max(ingresos, gastos, 1);
  porId("barra-ingresos").style.height = 100 * ingresos / escala + "%";
  porId("barra-gastos").style.height = 100 * gastos / escala + "%";
  porId("grafica").setAttribute("aria-label", "Ingresos: " + quetzales(ingresos) + ". Gastos: " + quetzales(gastos) + ".");
}

function actualizarPresupuesto(gastos) {
  const presupuesto = datos.presupuestos[mesActivo] ?? 0;
  const progreso = porId("progreso");
  const restante = porId("restante");
  const diferencia = presupuesto - gastos;
  const excedido = presupuesto > 0 && diferencia < 0;

  progreso.hidden = presupuesto === 0;
  progreso.value = presupuesto ? Math.min(100, 100 * gastos / presupuesto) : 0;
  progreso.classList.toggle("over", excedido);
  restante.classList.toggle("over", excedido);
  porId("detalle-presupuesto").textContent = presupuesto
    ? quetzales(gastos) + " utilizados de " + quetzales(presupuesto)
    : "Define cuánto quieres gastar este mes.";
  restante.textContent = presupuesto
    ? (excedido ? "Excedido por " : "Disponible: ") + quetzales(Math.abs(diferencia))
    : "";
}

// Se usa textContent para mostrar las descripciones como texto.
function crearElemento(etiqueta, clase, contenido) {
  const elemento = document.createElement(etiqueta);
  elemento.className = clase;
  elemento.textContent = contenido;
  return elemento;
}

function actualizarHistorial(delMes) {
  const visibles = delMes
    .filter((m) => filtro.value === "todos" || m.tipo === filtro.value)
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creado - a.creado);
  const vacio = porId("sin-movimientos");
  vacio.hidden = visibles.length > 0;
  vacio.textContent = delMes.length ? "No hay movimientos de este tipo." : "Todavía no hay movimientos en este período.";
  porId("conteo").textContent = visibles.length + (visibles.length === 1 ? " movimiento" : " movimientos");
  porId("movimientos").replaceChildren(...visibles.map(crearFila));
}

function crearFila(movimiento) {
  const fila = crearElemento("li", "movement", "");
  const detalle = document.createElement("div");
  const dia = formatoFecha.format(new Date(movimiento.fecha + "T00:00:00Z"));
  detalle.append(
    crearElemento("span", "", movimiento.descripcion),
    crearElemento("small", "", movimiento.categoria + " · " + dia)
  );
  const ingreso = movimiento.tipo === "ingreso";
  const importe = crearElemento("strong", ingreso ? "inflow" : "outflow", (ingreso ? "+" : "−") + quetzales(movimiento.centavos));
  const acciones = crearElemento("div", "actions", "");
  const editar = crearElemento("button", "secondary", "Editar");
  const eliminar = crearElemento("button", "secondary", "Eliminar");
  editar.setAttribute("aria-label", "Editar " + movimiento.descripcion);
  eliminar.setAttribute("aria-label", "Eliminar " + movimiento.descripcion);
  editar.addEventListener("click", () => abrirEditor(movimiento));
  eliminar.addEventListener("click", () => abrirConfirmacion(movimiento));
  acciones.append(editar, eliminar);
  fila.append(detalle, importe, acciones);
  return fila;
}

function actualizarCategorias(delMes, gastos) {
  const subtotales = new Map();
  for (const movimiento of delMes) {
    if (movimiento.tipo === "gasto") {
      const acumulado = subtotales.get(movimiento.categoria) ?? 0;
      subtotales.set(movimiento.categoria, acumulado + movimiento.centavos);
    }
  }
  const filas = [...subtotales].sort((a, b) => b[1] - a[1]).map(([nombre, subtotal]) => {
    const fila = crearElemento("li", "category-row", "");
    const valores = crearElemento("div", "category-values", "");
    valores.append(crearElemento("span", "", nombre), crearElemento("strong", "", quetzales(subtotal)));
    const proporcion = document.createElement("progress");
    proporcion.max = gastos;
    proporcion.value = subtotal;
    proporcion.setAttribute("aria-label", "Proporción de gastos en " + nombre);
    fila.append(valores, proporcion);
    return fila;
  });
  porId("sin-categorias").hidden = filas.length > 0;
  porId("categorias").replaceChildren(...filas);
}

function elegirMes(mes) {
  mesActivo = mes;
  selectorMes.value = mes;
  const guardado = datos.presupuestos[mes] ?? 0;
  limite.value = guardado ? (guardado / 100).toFixed(2) : "";
}

function cargarCategorias(seleccion) {
  categoria.replaceChildren(...categoriasPorTipo[tipo.value].map((nombre) => new Option(nombre, nombre)));
  if (seleccion) categoria.value = seleccion;
}

function abrirEditor(movimiento) {
  formulario.reset();
  descripcion.setCustomValidity("");
  formulario.querySelector(".form-error").hidden = true;
  idEnEdicion = movimiento?.id ?? null;
  porId("titulo-editor").textContent = movimiento ? "Editar movimiento" : "Nuevo movimiento";
  tipo.value = movimiento?.tipo ?? "gasto";
  monto.value = movimiento ? (movimiento.centavos / 100).toFixed(2) : "";
  const hoy = hoyLocal();
  fecha.value = movimiento?.fecha ?? (hoy.startsWith(mesActivo) ? hoy : mesActivo + "-01");
  descripcion.value = movimiento?.descripcion ?? "";
  cargarCategorias(movimiento?.categoria);
  editor.showModal();
}

function abrirConfirmacion(movimiento) {
  idParaEliminar = movimiento.id;
  confirmacion.querySelector(".form-error").hidden = true;
  porId("detalle-eliminar").textContent = "¿Quieres eliminar «" + movimiento.descripcion + "» por " + quetzales(movimiento.centavos) + "?";
  confirmacion.showModal();
}

function mostrarErrorDialogo(dialogo) {
  dialogo.querySelector(".form-error").hidden = false;
}

// La copia incluye una versión para distinguir formatos de futuras versiones.
function exportarCopia() {
  const copia = { aplicacion: "mi-billetera", version: 1, datos };
  const archivo = new Blob([JSON.stringify(copia, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(archivo);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = "mi-billetera-" + hoyLocal() + ".json";
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  avisarRespaldo("Guarda el archivo en un lugar privado. Contiene tus movimientos y presupuestos.");
}

function avisarRespaldo(mensaje, error = false) {
  estadoRespaldo.textContent = mensaje;
  estadoRespaldo.classList.toggle("error", error);
  estadoRespaldo.hidden = !mensaje;
}

function esMontoValido(centavos) {
  return Number.isSafeInteger(centavos) && centavos > 0 && centavos <= 99999999999;
}

function esObjeto(valor) {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor);
}

function esFechaValida(fecha) {
  if (typeof fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha.startsWith("0000")) return false;
  const dia = new Date(fecha + "T00:00:00Z");
  return Number.isFinite(dia.getTime()) && dia.toISOString().slice(0, 10) === fecha;
}

// Se valida el archivo completo antes de ofrecer reemplazar la billetera.
function validarCopia(copia) {
  const contenido = copia?.datos;
  if (copia?.aplicacion !== "mi-billetera" || copia.version !== 1 || !esObjeto(contenido)
      || !Array.isArray(contenido.movimientos) || !esObjeto(contenido.presupuestos)) {
    return null;
  }
  const ids = new Set();
  for (const m of contenido.movimientos) {
    if (!esObjeto(m) || typeof m.id !== "string" || !m.id || ids.has(m.id)
        || !Number.isSafeInteger(m.creado) || !esMontoValido(m.centavos)
        || !esFechaValida(m.fecha) || typeof m.descripcion !== "string"
        || !m.descripcion.trim() || m.descripcion.length > 100
        || (m.tipo !== "gasto" && m.tipo !== "ingreso")
        || !categoriasPorTipo[m.tipo].includes(m.categoria)) return null;
    ids.add(m.id);
  }
  for (const [mes, centavos] of Object.entries(contenido.presupuestos)) {
    if (!esFechaValida(mes + "-01") || !esMontoValido(centavos)) return null;
  }
  return { movimientos: contenido.movimientos, presupuestos: contenido.presupuestos };
}

archivoRespaldo.addEventListener("change", async () => {
  const archivo = archivoRespaldo.files[0];
  archivoRespaldo.value = "";
  if (!archivo) return;

  const botonImportar = porId("importar");
  botonImportar.disabled = true;
  try {
    copiaPendiente = validarCopia(JSON.parse(await archivo.text()));
    if (!copiaPendiente) throw new Error("Formato de respaldo inválido");
  } catch {
    avisarRespaldo("El archivo no es una copia válida de Mi Billetera. Tus datos siguen guardados.", true);
    return;
  } finally {
    botonImportar.disabled = false;
  }
  avisarRespaldo("");
  porId("error-restauracion").hidden = true;
  const movimientos = copiaPendiente.movimientos.length;
  const presupuestos = Object.keys(copiaPendiente.presupuestos).length;
  porId("detalle-restauracion").textContent = "Movimientos: " + movimientos + ". Presupuestos: " + presupuestos + ".";
  restauracion.showModal();
});

porId("exportar").addEventListener("click", exportarCopia);
porId("importar").addEventListener("click", () => archivoRespaldo.click());
porId("cancelar-restauracion").addEventListener("click", () => restauracion.close());
restauracion.addEventListener("close", () => {
  copiaPendiente = null;
  porId("importar").focus({ preventScroll: true });
});
porId("restaurar").addEventListener("click", () => {
  if (!copiaPendiente) return;
  if (!guardarDatos(copiaPendiente)) {
    porId("error-restauracion").hidden = false;
    return;
  }
  restauracion.close();
  elegirMes(mesActivo);
  actualizarPanel();
  avisar("");
  avisarRespaldo("Copia restaurada correctamente.");
});

selectorMes.addEventListener("change", () => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(selectorMes.value) || selectorMes.value.startsWith("0000")) {
    selectorMes.value = mesActivo;
    avisar("Escribe un mes válido con el formato AAAA-MM.", true);
    return;
  }
  elegirMes(selectorMes.value);
  avisar("");
  actualizarPanel();
});
filtro.addEventListener("change", actualizarPanel);
porId("nuevo").addEventListener("click", () => abrirEditor());
porId("cancelar").addEventListener("click", () => editor.close());
porId("conservar").addEventListener("click", () => confirmacion.close());
tipo.addEventListener("change", () => cargarCategorias());
descripcion.addEventListener("input", () => descripcion.setCustomValidity(""));

formulario.addEventListener("submit", (evento) => {
  evento.preventDefault();
  const texto = descripcion.value.trim();
  if (!texto) {
    descripcion.setCustomValidity("Escribe una descripción.");
    descripcion.reportValidity();
    return;
  }
  const anterior = datos.movimientos.find((m) => m.id === idEnEdicion);
  const creado = anterior?.creado ?? Date.now();
  const movimiento = {
    id: anterior?.id ?? (creado + "-" + Math.random().toString(36).slice(2)),
    creado,
    tipo: tipo.value,
    centavos: Math.round(monto.valueAsNumber * 100),
    fecha: fecha.value,
    categoria: categoria.value,
    descripcion: texto
  };
  const movimientos = anterior
    ? datos.movimientos.map((m) => m.id === anterior.id ? movimiento : m)
    : [...datos.movimientos, movimiento];
  if (!guardarDatos({ ...datos, movimientos })) {
    mostrarErrorDialogo(editor);
    return;
  }

  editor.close();
  elegirMes(movimiento.fecha.slice(0, 7));
  if (filtro.value !== movimiento.tipo) filtro.value = "todos";
  actualizarPanel();
  porId("nuevo").focus({ preventScroll: true });
  avisar(anterior ? "Movimiento actualizado." : "Movimiento guardado.");
});

porId("eliminar").addEventListener("click", () => {
  const movimientos = datos.movimientos.filter((m) => m.id !== idParaEliminar);
  if (!guardarDatos({ ...datos, movimientos })) {
    mostrarErrorDialogo(confirmacion);
    return;
  }
  confirmacion.close();
  actualizarPanel();
  filtro.focus({ preventScroll: true });
  avisar("Movimiento eliminado.");
});

porId("form-presupuesto").addEventListener("submit", (evento) => {
  evento.preventDefault();
  const centavos = Math.round(limite.valueAsNumber * 100);
  const presupuestos = { ...datos.presupuestos };
  if (centavos === 0) delete presupuestos[mesActivo];
  else presupuestos[mesActivo] = centavos;
  if (!guardarDatos({ ...datos, presupuestos })) return;

  elegirMes(mesActivo);
  actualizarPanel();
  avisar(centavos ? "Presupuesto guardado." : "Límite mensual eliminado.");
});

elegirMes(mesActivo);
actualizarPanel();
