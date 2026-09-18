/* =========================================================
   TaskLearning v2.0 — Lógica de la aplicación
   Todo es 2do año (CUJAE · Ing. Informática).
   Datos: subjects.json (asignaturas analizadas por Kimi) +
          localStorage (asignaturas añadidas por el usuario)
   PDFs del plan temático: IndexedDB (privados, en el navegador)
   Repasos por tema: archivos PDF en /repasos/ (generados por Kimi)
   ========================================================= */

const LS_KEY = "tasklearning.subjects.v1";
const LS_NOTICE = "tasklearning.notice.dismissed";
let seedSubjects = [];
let userSubjects = [];
let filterStatus = "all";
let filterQuery = "";
let editingId = null;

/* ---------------- Iconos SVG (reutilizables) ---------------- */
const svg = (paths, size = 16) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const I = {
  cap:    svg('<path d="M22 10v6"/><path d="M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>', 18),
  check:  svg('<polyline points="20 6 9 17 4 12"/>', 13),
  copy:   svg('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>', 14),
  pencil: svg('<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>', 14),
  trash:  svg('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>', 14),
  file:   svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>', 14),
  dl:     svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>', 13),
  ul:     svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>', 13),
  zap:    svg('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>', 14),
  clock:  svg('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>', 14),
  book:   svg('<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>', 14),
  plus:   svg('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>', 15),
};

/* ---------------- Utilidades ---------------- */
function byId(id) { return document.getElementById(id); }
function esc(t) { const d = document.createElement("div"); d.textContent = t ?? ""; return d.innerHTML; }
function iaLabel(k) { return { kimi: "Kimi", chatgpt: "ChatGPT", claude: "Claude", ollama: "Ollama" }[k] || k; }
function allSubjects() { return [...seedSubjects, ...userSubjects]; }

/* ---------------- Notificaciones toast ---------------- */
function toast(msg, type = "ok") {
  document.querySelectorAll(".toast").forEach(t => t.remove());
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.innerHTML = `${type === "ok" ? I.check : I.clock}<span>${esc(msg)}</span>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 300); }, 2800);
}

/* ---------------- Carga inicial ---------------- */
async function init() {
  try {
    const res = await fetch("data/subjects.json");
    seedSubjects = (await res.json()).subjects || [];
  } catch { seedSubjects = []; }
  userSubjects = loadLocal();
  renderAll();
  bindEvents();
  // Deep-link: index.html#asignaturas / #backup abre esa vista directamente
  const h = location.hash.replace("#", "");
  if (["panel", "asignaturas", "backup"].includes(h)) switchView(h);
}

function loadLocal() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; }
  catch { return []; }
}
function saveLocal() { localStorage.setItem(LS_KEY, JSON.stringify(userSubjects)); }

/* ---------------- Render general ---------------- */
function renderAll() {
  renderStats();
  renderDistribution();
  renderSubjects();
  renderOllamaTips();
}

/* ---------------- Panel ---------------- */
function renderStats() {
  const all = allSubjects();
  const stats = [
    { icon: I.cap,    num: all.length, lbl: "Asignaturas" },
    { icon: I.book,   num: all.reduce((n, s) => n + (s.temas?.length || 0), 0), lbl: "Temas analizados" },
    { icon: I.file,   num: all.reduce((n, s) => n + (s.repasos?.length || 0), 0), lbl: "Repasos PDF" },
    { icon: I.clock,  num: all.filter(s => !s.ia).length, lbl: "Pendientes de análisis", warn: true },
  ];
  byId("stats-grid").innerHTML = stats.map(s => `
    <div class="stat-card">
      <span class="stat-icon ${s.warn ? "warn" : ""}">${s.icon}</span>
      <div><div class="num">${s.num}</div><div class="lbl">${s.lbl}</div></div>
    </div>`).join("");
}

function renderDistribution() {
  const all = allSubjects();
  const meta = {
    kimi:    { label: "Kimi Moderato", cls: "kimi",    use: "Proyectos de código, documentos largos", url: "https://kimi.moonshot.cn" },
    chatgpt: { label: "ChatGPT Free",  cls: "chatgpt", use: "Matemática, problemas paso a paso", url: "https://chat.openai.com" },
    claude:  { label: "Claude Free",   cls: "claude",  use: "Redacción académica, revisión de estilo", url: "https://claude.ai" },
  };
  const counts = Object.keys(meta).map(k => all.filter(s => s.ia === k).length);
  const max = Math.max(1, ...counts);
  byId("ai-distribution").innerHTML = Object.entries(meta).map(([k, m], i) => {
    const subs = all.filter(s => s.ia === k);
    return `<div class="ai-row">
      <div class="ai-row-head">
        <a href="${m.url}" target="_blank" rel="noopener noreferrer" class="ai-badge ${m.cls} ai-link">${m.label}</a>
        <span class="ai-count">${subs.length}</span>
      </div>
      <div class="ai-bar"><span class="${m.cls}" style="width:${(counts[i] / max) * 100}%"></span></div>
      <div class="ai-use">${m.use}</div>
      ${subs.length
        ? `<div class="ai-subjects">${subs.map(s => `<a href="#" class="ai-subject" data-id="${s.id}">${esc(s.nombre)}</a>`).join("")}</div>`
        : `<div class="ai-names">Sin asignaturas todavía</div>`}
    </div>`;
  }).join("");

  byId("ai-distribution").querySelectorAll(".ai-subject").forEach(el => {
    el.addEventListener("click", e => { e.preventDefault(); openDetail(el.dataset.id); });
  });
}

function renderOllamaTips() {
  const tips = [
    "Cuestionarios de práctica a partir de tus apuntes",
    "Resúmenes de capítulos o clases antes del examen",
    "Tarjetas de memoria (pregunta/respuesta) de cualquier tema",
    "Glosarios de términos técnicos en español",
    "Datos de ejemplo para prácticas de programación",
  ];
  byId("ollama-tips").innerHTML = tips.map(t => `<li>${I.zap}<span>${esc(t)}</span></li>`).join("");
}

/* ---------------- Tarjetas ---------------- */
function renderSubjects() {
  const grid = byId("subjects-grid");
  const q = filterQuery.toLowerCase();
  const list = allSubjects().filter(s => {
    if (filterStatus === "analyzed" && !s.ia) return false;
    if (filterStatus === "pending" && s.ia) return false;
    if (q && !(s.nombre || "").toLowerCase().includes(q)) return false;
    return true;
  });

  if (!allSubjects().length) {
    grid.innerHTML = `<div class="empty-state">
      <div class="empty-icon">${I.cap}</div>
      <p class="empty-title">Todavía no hay asignaturas</p>
      <p class="muted">Agrega la primera y Kimi analizará su plan temático.</p>
      <button class="btn btn-primary" data-action="add">${I.plus} Agregar la primera</button>
    </div>`;
    return;
  }
  if (!list.length) {
    grid.innerHTML = `<div class="empty-state">
      <div class="empty-icon">${I.book}</div>
      <p class="empty-title">Sin resultados</p>
      <p class="muted">Ninguna asignatura coincide con el filtro actual.</p>
    </div>`;
    return;
  }

  grid.innerHTML = list.map(s => {
    const isAnalyzed = !!s.ia;
    const isSeed = seedSubjects.some(x => x.id === s.id);
    const nTemas = s.temas?.length || 0;
    return `<article class="subject-card" data-id="${s.id}" tabindex="0" role="button" aria-label="${esc(s.nombre)}">
      <div class="subject-head">
        <h3>${esc(s.nombre)}</h3>
        <span class="status-tag ${isAnalyzed ? "ok" : "pending"}">${isAnalyzed ? "Analizada" : "Pendiente"}</span>
      </div>
      <p class="subject-desc">${esc(s.resumen || s.descripcion || "Sin descripción.")}</p>
      <div class="subject-meta">
        ${nTemas ? `<span>${I.book}${nTemas} tema${nTemas !== 1 ? "s" : ""}</span>` : ""}
        ${(s.repasos?.length) ? `<span>${I.file}${s.repasos.length} repaso${s.repasos.length !== 1 ? "s" : ""} PDF</span>` : ""}
      </div>
      <div class="subject-foot">
        ${isAnalyzed
          ? `<span class="ai-badge ${s.ia}">${iaLabel(s.ia)}</span>`
          : `<span class="ai-badge ollama">Sin analizar</span>`}
        <div class="subject-actions">
          ${isSeed ? "" : `
          <button class="icon-btn" data-edit="${s.id}" title="Editar" aria-label="Editar">${I.pencil}</button>
          <button class="icon-btn danger" data-del="${s.id}" title="Eliminar" aria-label="Eliminar">${I.trash}</button>`}
        </div>
      </div>
    </article>`;
  }).join("");
}

/* ---------------- Modal añadir/editar ---------------- */
function openSubjectModal(id = null) {
  editingId = id;
  const s = id ? userSubjects.find(x => x.id === id) : null;
  byId("modal-title").textContent = s ? "Editar asignatura" : "Nueva asignatura";
  byId("btn-save-subject").textContent = s ? "Guardar cambios" : "Guardar y pedir análisis";
  byId("f-nombre").value = s?.nombre || "";
  byId("f-descripcion").value = s?.descripcion || "";
  byId("modal-subject").classList.add("open");
  setTimeout(() => byId("f-nombre").focus(), 60);
}
function closeModals() { document.querySelectorAll(".modal-overlay").forEach(m => m.classList.remove("open")); }

function deleteSubject(id) {
  const s = userSubjects.find(x => x.id === id);
  if (!s) return;
  if (!confirm(`¿Eliminar "${s.nombre}"? Esta acción no se puede deshacer.`)) return;
  userSubjects = userSubjects.filter(x => x.id !== id);
  saveLocal(); renderAll();
  toast("Asignatura eliminada");
}

/* ---------------- Detalle ---------------- */
function openDetail(id) {
  const s = allSubjects().find(x => x.id === id);
  if (!s) return;
  const isAnalyzed = !!s.ia;
  const isSeed = seedSubjects.some(x => x.id === s.id);
  const instruccion = `Analiza la asignatura "${s.nombre}" (2do año, carrera Ingeniería Informática, CUJAE — contexto universidades cubanas). Breve descripción: "${s.descripcion || "sin descripción"}". Investiga su plan temático típico. Si encuentras un plan viable, entrégame: 1) resumen general de la asignatura, 2) plan temático con sus temas, 3) un repaso tipo PDF para CADA tema, 4) qué IA me conviene para consultar dudas de esta asignatura (Kimi Moderato / ChatGPT Free / Claude Free) y por qué, 5) tareas que pueda delegar en mi Ollama local. Si NO encuentras un plan viable o no estás seguro, dímelo claramente y te subo el PDF oficial del plan temático para que analices el documento directamente.`;

  byId("detail-content").innerHTML = `
    <div class="modal-head">
      <div>
        <h3>${esc(s.nombre)}</h3>
        <div class="detail-badges">
          ${isAnalyzed ? `<span class="ai-badge ${s.ia}">${iaLabel(s.ia)}</span>` : `<span class="ai-badge ollama">Sin analizar</span>`}
          <span class="status-tag ${isAnalyzed ? "ok" : "pending"}">${isAnalyzed ? "Analizada" : "Pendiente"}</span>
        </div>
      </div>
      <button class="icon-btn" data-close aria-label="Cerrar">${svg('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>')}</button>
    </div>

    <div class="detail-cta">
      <div class="detail-cta-title">${I.zap} Análisis con Kimi Work</div>
      <ol class="steps">
        <li><strong>Copia</strong> la instrucción de abajo.</li>
        <li><strong>Pégala</strong> en Kimi Work — si no encuentro un plan viable te pediré el PDF oficial.</li>
        <li><strong>Sube aquí</strong> el PDF del plan temático si lo tienes (se guarda solo en tu navegador).</li>
      </ol>
      <div class="copy-box" id="copy-box">${esc(instruccion)}</div>
      <div class="cta-actions">
        <button class="btn btn-primary btn-small" id="btn-copy">${I.copy}<span>Copiar instrucción</span></button>
        <label class="btn btn-ghost btn-small">${I.ul}<span>Subir PDF</span>
          <input type="file" id="pdf-input" accept="application/pdf" hidden>
        </label>
      </div>
      <ul class="pdf-list" id="pdf-list"></ul>
    </div>

    <div class="detail-section">
      <h4>Resumen</h4>
      <p class="muted detail-text">${esc(s.resumen || "Sin análisis todavía — sigue los pasos de arriba.")}</p>
      ${(s.temas?.length) ? `<div class="topics">${s.temas.map(t => `<span class="topic">${esc(t)}</span>`).join("")}</div>` : ""}
    </div>

    ${(s.repasos?.length) ? `
    <div class="detail-section">
      <h4>Repasos por tema (PDF)</h4>
      <ul class="pdf-list">
        ${s.repasos.map(r => `<li><span class="pdf-name">${I.file}${esc(r.tema)}</span><a class="btn btn-ghost btn-small" href="${esc(r.file)}" target="_blank" rel="noopener">${I.dl}Descargar</a></li>`).join("")}
      </ul>
    </div>` : ""}

    <div class="detail-section">
      <h4>IA sugerida para dudas</h4>
      <div class="ia-reason">${isAnalyzed ? esc(s.iaRazon) : "Pendiente — aparecerá aquí cuando Kimi analice la asignatura."}</div>
    </div>

    <div class="detail-section">
      <h4>Delegable en Ollama (gratis, local)</h4>
      <div class="ollama-tasks">
        ${(s.ollamaTasks?.length ? s.ollamaTasks : ["Cuestionarios de práctica", "Resumen de apuntes", "Tarjetas de memoria"]).map(t =>
          `<div class="ollama-task"><span>${esc(t)}</span><span class="ai-badge ollama">local</span></div>`).join("")}
      </div>
    </div>

    ${isSeed ? "" : `<div class="detail-section detail-admin">
      <button class="btn btn-ghost btn-small" id="btn-detail-edit">${I.pencil}Editar</button>
      <button class="btn btn-danger btn-small" id="btn-detail-del">${I.trash}Eliminar</button>
    </div>`}
  `;

  byId("modal-detail").classList.add("open");
  const root = byId("detail-content");

  root.querySelector("[data-close]").addEventListener("click", closeModals);
  root.querySelector("#btn-copy").addEventListener("click", ev => {
    navigator.clipboard.writeText(instruccion).then(() => {
      const b = ev.currentTarget;
      b.classList.add("copied");
      b.innerHTML = `${I.check}<span>Copiado — pégalo en Kimi Work</span>`;
      setTimeout(() => { b.classList.remove("copied"); b.innerHTML = `${I.copy}<span>Copiar instrucción</span>`; }, 2600);
    });
  });
  root.querySelector("#pdf-input").addEventListener("change", e => {
    savePdf(s.id, e.target.files[0]).then(() => toast("PDF guardado en tu navegador"));
  });
  const btnEdit = root.querySelector("#btn-detail-edit");
  if (btnEdit) btnEdit.addEventListener("click", () => { closeModals(); openSubjectModal(s.id); });
  const btnDel = root.querySelector("#btn-detail-del");
  if (btnDel) btnDel.addEventListener("click", () => { closeModals(); deleteSubject(s.id); });

  renderPdfList(s.id);
}

/* ---------------- PDFs del plan temático (IndexedDB) ---------------- */
let db;
function openDb() {
  return new Promise((resolve, reject) => {
    if (db) return resolve(db);
    const req = indexedDB.open("tasklearning", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("pdfs", { keyPath: "key" });
    req.onsuccess = () => { db = req.result; resolve(db); };
    req.onerror = reject;
  });
}
async function savePdf(subjectId, file) {
  if (!file) return;
  const d = await openDb();
  await new Promise((res, rej) => {
    const tx = d.transaction("pdfs", "readwrite");
    tx.objectStore("pdfs").put({ key: subjectId + "/" + file.name, subjectId, name: file.name, size: file.size, date: new Date().toISOString(), blob: file });
    tx.oncomplete = res; tx.onerror = rej;
  });
  renderPdfList(subjectId);
}
async function renderPdfList(subjectId) {
  const el = byId("pdf-list");
  if (!el) return;
  try {
    const d = await openDb();
    const rows = await new Promise(res => {
      const out = [];
      const cur = d.transaction("pdfs").objectStore("pdfs").openCursor();
      cur.onsuccess = () => {
        if (cur.result) { if (cur.result.value.subjectId === subjectId) out.push(cur.result.value); cur.result.continue(); }
        else res(out);
      };
    });
    el.innerHTML = rows.length
      ? rows.map(r => `<li><span class="pdf-name">${I.file}${esc(r.name)}</span><span class="muted">${(r.size / 1024).toFixed(0)} KB</span></li>`).join("")
      : `<li class="muted">Sin PDFs todavía</li>`;
  } catch { el.innerHTML = `<li class="muted">Sin PDFs todavía</li>`; }
}

/* ---------------- Eventos globales ---------------- */
function bindEvents() {
  // Navegación
  document.querySelectorAll(".nav-item[data-view]").forEach(b =>
    b.addEventListener("click", () => switchView(b.dataset.view)));

  // Alta de asignatura: un único punto de entrada (topbar)
  byId("btn-add-top").addEventListener("click", () => openSubjectModal());

  // Cierre de modales
  document.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", closeModals));
  document.querySelectorAll(".modal-overlay").forEach(m =>
    m.addEventListener("click", e => { if (e.target === m) closeModals(); }));
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeModals(); });

  // Delegación de eventos en la cuadrícula (sobrevive a re-renders)
  const grid = byId("subjects-grid");
  grid.addEventListener("click", e => {
    const add = e.target.closest('[data-action="add"]');
    if (add) { openSubjectModal(); return; }
    const edit = e.target.closest("[data-edit]");
    if (edit) { e.stopPropagation(); openSubjectModal(edit.dataset.edit); return; }
    const del = e.target.closest("[data-del]");
    if (del) { e.stopPropagation(); deleteSubject(del.dataset.del); return; }
    const card = e.target.closest(".subject-card");
    if (card) openDetail(card.dataset.id);
  });
  grid.addEventListener("keydown", e => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const card = e.target.closest(".subject-card");
    if (card) { e.preventDefault(); openDetail(card.dataset.id); }
  });

  // Filtros y búsqueda
  document.querySelectorAll(".filter-chip").forEach(c => c.addEventListener("click", () => {
    document.querySelectorAll(".filter-chip").forEach(x => x.classList.remove("active"));
    c.classList.add("active");
    filterStatus = c.dataset.filter;
    renderSubjects();
  }));
  byId("search-input").addEventListener("input", e => {
    filterQuery = e.target.value.trim();
    renderSubjects();
  });

  // Aviso descartable
  if (!localStorage.getItem(LS_NOTICE)) byId("notice").hidden = false;
  byId("notice-close").addEventListener("click", () => {
    byId("notice").hidden = true;
    localStorage.setItem(LS_NOTICE, "1");
  });

  // Formulario
  byId("form-subject").addEventListener("submit", e => {
    e.preventDefault();
    const data = {
      nombre: byId("f-nombre").value.trim(),
      descripcion: byId("f-descripcion").value.trim(),
      anno: "2",
      semestre: "",
    };
    let newId = null;
    if (editingId) {
      const s = userSubjects.find(x => x.id === editingId);
      Object.assign(s, data);
      newId = editingId;
    } else {
      newId = "u_" + Date.now();
      userSubjects.push({
        id: newId, ...data,
        resumen: "", temas: [], repasos: [], ia: null, iaRazon: "", ollamaTasks: [],
        pendienteAnalisis: true,
      });
    }
    const wasEditing = !!editingId;
    saveLocal(); renderAll(); closeModals();
    if (wasEditing) {
      toast("Cambios guardados");
    } else {
      toast("Asignatura guardada — aquí tienes la instrucción para Kimi");
      openDetail(newId); // flujo directo: sin buscar el botón a mano
    }
  });

  // Respaldo
  byId("btn-export").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ userSubjects }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "tasklearning-respaldo.json";
    a.click();
    URL.revokeObjectURL(a.href);
    toast("Respaldo descargado");
  });
  byId("import-file").addEventListener("change", e => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const j = JSON.parse(r.result);
        if (!Array.isArray(j.userSubjects)) throw new Error("formato");
        userSubjects = j.userSubjects;
        saveLocal(); renderAll();
        toast("Datos importados correctamente");
      } catch { toast("Archivo inválido", "error"); }
    };
    r.readAsText(f);
  });
}

function switchView(v) {
  document.querySelectorAll(".nav-item[data-view]").forEach(b => b.classList.toggle("active", b.dataset.view === v));
  document.querySelectorAll(".view").forEach(s => s.classList.remove("active"));
  byId("view-" + v).classList.add("active");
  const titles = {
    panel: ["Panel", "Resumen de tu 2do año"],
    asignaturas: ["Asignaturas", `${allSubjects().length} registradas · toca una tarjeta para ver el detalle`],
    backup: ["Respaldo", "Exporta o importa tus datos"],
  };
  byId("view-title").textContent = titles[v][0];
  byId("view-subtitle").textContent = titles[v][1];
}

init();
