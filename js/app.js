/* =========================================================
   TaskLearning v4.0 — Plataforma de análisis con Backend
   Subes PDFs → backend procesa con IA local (Ollama) →
   genera plan, repasos, tests, resúmenes y ejercicios.
   ========================================================= */

const LS_KEY = "tasklearning.subjects.v1";
const LS_NOTICE = "tasklearning.notice.dismissed";
const LS_SCORES = "tasklearning.scores.v1";
const API_BASE = location.origin + "/api";
let backendAvailable = false;
let seedSubjects = [];
let userSubjects = [];
let testScores = {};
let filterStatus = "all";
let filterQuery = "";
let editingId = null;

/* ---------------- Iconos SVG ---------------- */
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
  list:   svg('<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>', 14),
  quiz:   svg('<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>', 14),
  edit:   svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>', 14),
  back:   svg('<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>', 16),
  server: svg('<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>', 14),
};

/* ---------------- Utilidades ---------------- */
function byId(id) { return document.getElementById(id); }
function esc(t) { const d = document.createElement("div"); d.textContent = t ?? ""; return d.innerHTML; }
function iaLabel(k) { return { kimi: "Kimi", chatgpt: "ChatGPT", claude: "Claude", ollama: "Ollama Local" }[k] || k; }
function allSubjects() { return [...seedSubjects, ...userSubjects]; }

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------------- Backend API helpers ---------------- */
async function apiFetch(path, opts = {}) {
  const url = API_BASE + path;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...opts.headers },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

async function checkBackend() {
  try {
    const data = await apiFetch("/health");
    backendAvailable = data.status === "ok";
  } catch {
    backendAvailable = false;
  }
  updateBackendBadge();
  return backendAvailable;
}

function updateBackendBadge() {
  let badge = byId("backend-badge");
  if (!badge) {
    badge = document.createElement("span");
    badge.id = "backend-badge";
    badge.style.cssText = "font-size:11px;padding:3px 8px;border-radius:10px;margin-left:8px;font-weight:500;vertical-align:middle;";
    const header = document.querySelector(".app-header h1") || document.querySelector("h1");
    if (header) header.appendChild(badge);
  }
  if (backendAvailable) {
    badge.style.background = "rgba(34,197,94,0.15)";
    badge.style.color = "#22c55e";
    badge.textContent = "Backend ON";
  } else {
    badge.style.background = "rgba(234,179,8,0.15)";
    badge.style.color = "#eab308";
    badge.textContent = "Offline (localStorage)";
  }
}

async function uploadToBackend(files, subjectName) {
  /* 1. Crear asignatura en backend */
  const subject = await apiFetch("/subjects", {
    method: "POST",
    body: JSON.stringify({ name: subjectName, description: `Análisis de ${files.length} PDF(s)` }),
  });

  /* 2. Subir archivos */
  const formData = new FormData();
  formData.append("subject_id", subject.id);
  files.forEach(f => formData.append("files", f));

  const uploadRes = await fetch(`${API_BASE}/documents`, { method: "POST", body: formData });
  if (!uploadRes.ok) throw new Error("Error subiendo archivos");
  const uploadData = await uploadRes.json();

  /* 3. Disparar procesamiento para cada documento */
  for (const doc of uploadData.documents) {
    await apiFetch(`/analysis/process/${doc.id}`, { method: "POST" });
  }

  return { subject, docs: uploadData.documents };
}

async function pollProcessingStatus(docId, onProgress) {
  let attempts = 0;
  const maxAttempts = 120; /* 2 minutos max */
  while (attempts < maxAttempts) {
    await new Promise(r => setTimeout(r, 1500));
    attempts++;
    try {
      const data = await apiFetch(`/analysis/status/${docId}`);
      const pct = Math.min(90, 30 + (attempts / maxAttempts) * 60);
      onProgress(pct, `Procesando... (${data.document.status})`);

      if (data.document.status === "COMPLETED") return data;
      if (data.document.status === "FAILED") throw new Error(data.document.error_message || "Error procesando");
    } catch (e) {
      if (attempts > 5) throw e;
    }
  }
  throw new Error("Timeout: el procesamiento tardó demasiado");
}

async function fetchSubjectFromBackend(subjectId) {
  const data = await apiFetch(`/subjects/${subjectId}`);
  return mapBackendSubject(data);
}

function mapBackendSubject(s) {
  const rawUnits = (s.units || []).map(u => ({
    name: u.name,
    description: u.description || "",
    topics: (u.topics || []).map(t => ({
      name: t.name,
      content_summary: t.content_summary || t.description || "",
      description: t.description || "",
      objectives: tryParse(t.objectives),
      concepts: (t.concepts || []).map(c => ({ name: c.name, definition: c.definition })),
      questions: (t.questions || []).map(q => ({
        type: q.type,
        question_text: q.question_text,
        options: tryParse(q.options),
        correct_answer: q.correct_answer,
        explanation: q.explanation,
      })),
      flashcards: (t.flashcards || []).map(f => ({ front: f.front, back: f.back, difficulty: f.difficulty })),
      exercises: (t.exercises || []).map(e => ({ statement: e.statement, solution: e.solution, type: e.type })),
      reviews: (t.reviews || []).map(r => ({ content: r.content, study_tips: r.study_tips })),
    }))
  }));

  const topics = rawUnits.flatMap(u => u.topics.map(t => t.name));
  const resumenes = rawUnits.flatMap(u => u.topics.map(t => ({ tema: t.name, contenido: t.content_summary || t.description || "" })));
  const repasos = rawUnits.flatMap(u => u.topics.flatMap(t => (t.reviews || []).map(r => ({ tema: t.name, contenido: r.content }))));
  const tests = rawUnits.flatMap(u => u.topics.filter(t => t.questions?.length).map(t => ({
    tema: t.name,
    preguntas: t.questions.map(q => ({
      pregunta: q.question_text,
      options: q.options || [],
      opciones: q.options || [],
      respuesta: q.options ? q.options.indexOf(q.correct_answer) : 0,
      correct_answer: q.correct_answer,
      explicacion: q.explanation || "",
    })),
  })));
  const ejercicios = rawUnits.flatMap(u => u.topics.flatMap(t => (t.exercises || []).map(e => ({
    enunciado: e.statement, statement: e.statement, solucion: e.solution, solution: e.solution,
  }))));
  const flashcards = rawUnits.flatMap(u => u.topics.flatMap(t => t.flashcards || []));

  return {
    id: s.id,
    nombre: s.name,
    descripcion: s.description || "",
    resumen: resumenes.length ? resumenes.slice(0, 3).map(r => r.contenido).join(" | ") : `Asignatura: ${s.name}`,
    temas: topics,
    repasos,
    tests,
    ejercicios,
    resumenes,
    flashcards,
    ia: "ollama",
    iaRazon: "Procesado con Ollama local (IA sin conexion a internet)",
    pendienteAnalisis: false,
    documents: s.documents || [],
    _rawUnits: rawUnits,
  };
}

function tryParse(s) {
  try { return JSON.parse(s); } catch { return s; }
}

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
  /* Chequear backend */
  await checkBackend();

  /* Cargar subjects del backend o localStorage */
  if (backendAvailable) {
    try {
      const apiSubjects = await apiFetch("/subjects");
      userSubjects = apiSubjects.map(s => ({
        id: s.id,
        nombre: s.name,
        descripcion: s.description || "",
        resumen: "",
        temas: [],
        repasos: [],
        tests: [],
        ejercicios: [],
        resumenes: [],
        ia: null,
        iaRazon: "",
        pendienteAnalisis: true,
      }));
      /* Cargar detalle de cada subject */
      for (const s of userSubjects) {
        try {
          const detail = await fetchSubjectFromBackend(s.id);
          Object.assign(s, detail);
        } catch (e) {
          console.warn("Error cargando detalle de", s.nombre, e);
        }
      }
    } catch (e) {
      console.warn("Error cargando desde API, usando localStorage:", e);
      userSubjects = loadLocal();
    }
  } else {
    userSubjects = loadLocal();
  }

  try {
    const res = await fetch("data/subjects.json");
    seedSubjects = (await res.json()).subjects || [];
  } catch { seedSubjects = []; }

  testScores = loadScores();
  renderAll();
  bindEvents();
  initAnalyzer();
  renderSidebarSubjects();
  const h = location.hash.replace("#", "");
  if (["panel", "asignaturas"].includes(h)) switchView(h);
}

function loadLocal() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; }
  catch { return []; }
}
function saveLocal() { localStorage.setItem(LS_KEY, JSON.stringify(userSubjects)); }

function loadScores() {
  try { return JSON.parse(localStorage.getItem(LS_SCORES)) || {}; }
  catch { return {}; }
}
function saveScores() { localStorage.setItem(LS_SCORES, JSON.stringify(testScores)); }

/* ---------------- Render general ---------------- */
function renderAll() {
  renderStats();
  renderDistribution();
  renderSubjects();
  renderSidebarSubjects();
}

/* ---------------- Sidebar: asignaturas analizadas ---------------- */
function renderSidebarSubjects() {
  const existing = byId("sidebar-subjects");
  if (existing) existing.remove();
  const analyzed = allSubjects().filter(s => s.temas?.length);
  if (!analyzed.length) return;

  const container = document.createElement("div");
  container.id = "sidebar-subjects";
  container.innerHTML = `
    <h4 class="legend-title" style="margin-top:18px">Mis asignaturas</h4>
    <ul class="sidebar-subjects-list">
      ${analyzed.map(s => `
        <li class="sidebar-subject-item" data-id="${s.id}">
          <span class="dot ${s.ia || 'pending'}"></span>
          <span>${esc(s.nombre)}</span>
        </li>`).join("")}
    </ul>`;

  const footer = byId("sidebar-subjects-placeholder");
  if (footer) footer.parentNode.insertBefore(container, footer);
  else byId("sidebar-footer-placeholder").parentNode.appendChild(container);

  container.querySelectorAll(".sidebar-subject-item").forEach(el =>
    el.addEventListener("click", () => {
      switchView("asignaturas");
      setTimeout(() => openDetail(el.dataset.id), 100);
    })
  );
}

/* ---------------- Panel ---------------- */
function renderStats() {
  const all = allSubjects();
  const stats = [
    { icon: I.cap,   num: all.length, lbl: "Asignaturas" },
    { icon: I.book,  num: all.reduce((n, s) => n + (s.temas?.length || 0), 0), lbl: "Temas" },
    { icon: I.quiz,  num: all.reduce((n, s) => n + (s.tests?.length || 0), 0), lbl: "Tests generados" },
    { icon: I.clock, num: all.filter(s => !s.temas?.length).length, lbl: "Pendientes", warn: true },
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
    ollama:  { label: "Ollama Local",  cls: "ollama",  use: "IA local, sin internet, privada", url: "#" },
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
        : `<div class="ai-names">Sin asignaturas todavia</div>`}
    </div>`;
  }).join("");

  byId("ai-distribution").querySelectorAll(".ai-subject").forEach(el => {
    el.addEventListener("click", e => { e.preventDefault(); openDetail(el.dataset.id); });
  });
}

/* ---------------- Tarjetas ---------------- */
function renderSubjects() {
  const grid = byId("subjects-grid");
  const q = filterQuery.toLowerCase();
  const list = allSubjects().filter(s => {
    if (filterStatus === "analyzed" && !s.temas?.length) return false;
    if (filterStatus === "pending" && s.temas?.length) return false;
    if (q && !(s.nombre || "").toLowerCase().includes(q)) return false;
    return true;
  });

  if (!allSubjects().length) {
    grid.innerHTML = `<div class="empty-state">
      <div class="empty-icon">${I.cap}</div>
      <p class="empty-title">Todavia no hay asignaturas</p>
      <p class="muted">Sube un PDF en el Panel para comenzar.</p>
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
    const analyzed = !!s.temas?.length;
    const nTemas = s.temas?.length || 0;
    const nTests = s.tests?.length || 0;
    return `<article class="subject-card" data-id="${s.id}" tabindex="0" role="button" aria-label="${esc(s.nombre)}">
      <div class="subject-head">
        <h3>${esc(s.nombre)}</h3>
        <span class="status-tag ${analyzed ? "ok" : "pending"}">${analyzed ? "Analizada" : "Pendiente"}</span>
      </div>
      <p class="subject-desc">${esc(s.resumen || s.descripcion || "Sin descripcion.")}</p>
      <div class="subject-meta">
        ${nTemas ? `<span>${I.book}${nTemas} tema${nTemas !== 1 ? "s" : ""}</span>` : ""}
        ${nTests ? `<span>${I.quiz}${nTests} test${nTests !== 1 ? "s" : ""}</span>` : ""}
      </div>
      <div class="subject-foot">
        ${analyzed
          ? `<span class="ai-badge ${s.ia}">${iaLabel(s.ia)}</span>`
          : `<span class="ai-badge pending-badge">Sin analizar</span>`}
        <div class="subject-actions">
          <button class="icon-btn danger" data-del="${s.id}" title="Eliminar" aria-label="Eliminar">${I.trash}</button>
        </div>
      </div>
    </article>`;
  }).join("");
}

/* ---------------- Modal anyadir/editar ---------------- */
function openSubjectModal(id = null) {
  editingId = id;
  const s = id ? userSubjects.find(x => x.id === id) : null;
  byId("modal-title").textContent = s ? "Editar asignatura" : "Nueva asignatura";
  byId("btn-save-subject").textContent = s ? "Guardar cambios" : "Guardar";
  byId("f-nombre").value = s?.nombre || "";
  byId("f-descripcion").value = s?.descripcion || "";
  byId("modal-subject").classList.add("open");
  setTimeout(() => byId("f-nombre").focus(), 60);
}
function closeModals() { document.querySelectorAll(".modal-overlay").forEach(m => m.classList.remove("open")); }

function deleteSubject(id) {
  const s = userSubjects.find(x => x.id === id);
  if (!s) return;
  if (!confirm(`¿Eliminar "${s.nombre}"? Esta accion no se puede deshacer.`)) return;

  /* Eliminar del backend si esta disponible */
  if (backendAvailable) {
    apiFetch(`/subjects/${id}`, { method: "DELETE" }).catch(e => console.warn("Error eliminando del backend:", e));
  }

  userSubjects = userSubjects.filter(x => x.id !== id);
  delete testScores[id];
  saveScores();
  saveLocal(); renderAll();
  toast("Asignatura eliminada");
}

/* =========================================================
   DETALLE / LANDING DE ASIGNATURA — VISTA COMPLETA
   ========================================================= */
function openDetail(id) {
  const s = allSubjects().find(x => x.id === id);
  if (!s) return;
  const analyzed = !!s.temas?.length;

  /* Guardar ID actual para navegacion */
  window._currentDetailId = id;

  /* Switch to detail view */
  document.querySelectorAll(".nav-item[data-view]").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  byId("view-detail").classList.add("active");
  byId("view-title").textContent = s.nombre;
  byId("view-subtitle").textContent = analyzed ? `${s.temas?.length || 0} temas · ${s.tests?.length || 0} tests` : "Pendiente de analisis";

  renderDetailView(s);
}

function renderDetailView(s) {
  const analyzed = !!s.temas?.length;
  const header = byId("detail-header");
  const toc = byId("detail-toc");
  const content = byId("detail-content-scroll");

  /* Header */
  header.innerHTML = `
    <button class="btn btn-ghost detail-back" id="btn-detail-back">
      ${I.back} Volver a Asignaturas
    </button>
    <div class="detail-title-row">
      <h2>${esc(s.nombre)}</h2>
      <div class="detail-badges">
        ${analyzed ? `<span class="ai-badge ${s.ia}">${iaLabel(s.ia)}</span>` : `<span class="ai-badge pending-badge">Sin analizar</span>`}
        <span class="status-tag ${analyzed ? "ok" : "pending"}">${analyzed ? "Analizada" : "Pendiente"}</span>
      </div>
    </div>
    ${s.resumen ? `<p class="detail-resumen-text">${esc(s.resumen).substring(0, 300)}</p>` : ""}
  `;

  byId("btn-detail-back").addEventListener("click", () => switchView("asignaturas"));

  if (!analyzed) {
    toc.innerHTML = "";
    content.innerHTML = `
      <div class="detail-empty">
        <div class="empty-icon">${I.book}</div>
        <p class="empty-title">Sin contenido aun</p>
        <p class="muted">Sube el PDF de esta asignatura en el Panel para generar el plan de estudio automaticamente.</p>
        <button class="btn btn-primary" onclick="switchView('panel')">Ir al Panel</button>
      </div>`;
    return;
  }

  /* Agrupar temas por unidad (si hay unidades) */
  const units = groupTopicsByUnit(s);

  /* Construir indice (TOC) */
  let tocHtml = `<h4>Indice</h4><ul class="toc-list">`;
  units.forEach((unit, ui) => {
    tocHtml += `<li class="toc-unit"><a href="#unit-${ui}" class="toc-link">${esc(unit.name)}</a>`;
    if (unit.topics.length > 0) {
      tocHtml += `<ul>`;
      unit.topics.forEach((t, ti) => {
        tocHtml += `<li><a href="#topic-${ui}-${ti}" class="toc-link toc-sub">${esc(t.nombre)}</a></li>`;
      });
      tocHtml += `</ul>`;
    }
    tocHtml += `</li>`;
  });
  tocHtml += `</ul>`;
  toc.innerHTML = tocHtml;

  /* Construir contenido */
  let contentHtml = "";

  /* Tabs superiores */
  contentHtml += `
    <div class="detail-view-tabs" id="detail-view-tabs">
      <button class="dtab active" data-dtab="resumenes">Resumenes</button>
      <button class="dtab" data-dtab="plan">Plan Completo</button>
      <button class="dtab" data-dtab="tests">Tests</button>
      <button class="dtab" data-dtab="ejercicios">Ejercicios</button>
      ${s.flashcards?.length ? `<button class="dtab" data-dtab="flashcards">Flashcards</button>` : ""}
      <button class="dtab" data-dtab="repasos">Repasos</button>
    </div>
    <div id="detail-view-content"></div>`;

  content.innerHTML = contentHtml;

  /* Renderizar tab inicial (resumenes) */
  renderDetailTab("resumenes", s, units);

  /* Bind tabs */
  content.querySelectorAll(".dtab").forEach(tab => {
    tab.addEventListener("click", () => {
      content.querySelectorAll(".dtab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      renderDetailTab(tab.dataset.dtab, s, units);
      /* Scroll to top of content */
      content.scrollTop = 0;
    });
  });

  /* Bind TOC links - scroll suave */
  toc.querySelectorAll(".toc-link").forEach(link => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const target = content.querySelector(link.getAttribute("href"));
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function groupTopicsByUnit(s) {
  /* Si el backend ya tiene unidades agrupadas, usarlas */
  if (s._rawUnits && s._rawUnits.length > 0) {
    return s._rawUnits.map(u => ({
      name: u.name,
      description: u.description || "",
      topics: (u.topics || []).map(t => ({
        nombre: t.name,
        contenido: t.content_summary || t.description || "",
        summary: t.content_summary || "",
        objectives: tryParse(t.objectives) || [],
        questions: (t.questions || []).map(q => ({
          type: q.type, question_text: q.question_text,
          options: tryParse(q.options), correct_answer: q.correct_answer, explanation: q.explanation,
        })),
        flashcards: (t.flashcards || []).map(f => ({ front: f.front, back: f.back, difficulty: f.difficulty })),
        exercises: (t.exercises || []).map(e => ({ statement: e.statement, solution: e.solution, type: e.type })),
        reviews: (t.reviews || []).map(r => ({ content: r.content, study_tips: r.study_tips })),
      }))
    }));
  }

  /* Fallback: agrupar topics planos en unidades de ~5 */
  const topicsPerUnit = 5;
  const units = [];
  const allTopics = (s.temas || []).map((t, i) => {
    if (typeof t === "string") return { nombre: t, contenido: "", questions: [], flashcards: [], exercises: [], reviews: [] };
    return t;
  });

  for (let i = 0; i < allTopics.length; i += topicsPerUnit) {
    const chunk = allTopics.slice(i, i + topicsPerUnit);
    units.push({
      name: `Seccion ${Math.floor(i / topicsPerUnit) + 1}`,
      description: `${chunk.length} temas`,
      topics: chunk,
    });
  }
  return units.length > 0 ? units : [{ name: "Contenido", description: "", topics: allTopics }];
}

function renderDetailTab(tab, s, units) {
  const container = byId("detail-view-content");
  if (!container) return;

  switch (tab) {
    case "resumenes":
      container.innerHTML = units.map((unit, ui) => `
        <div class="unit-section" id="unit-${ui}">
          <h3 class="unit-title">${esc(unit.name)}</h3>
          ${unit.description ? `<p class="unit-desc">${esc(unit.description)}</p>` : ""}
          ${unit.topics.map((topic, ti) => `
            <div class="topic-card" id="topic-${ui}-${ti}">
              <h4 class="topic-title">${esc(topic.nombre)}</h4>
              <div class="topic-summary">
                ${renderTopicSummary(topic, s)}
              </div>
            </div>
          `).join("")}
        </div>
      `).join("");
      break;

    case "plan":
      container.innerHTML = units.map((unit, ui) => `
        <div class="unit-section" id="unit-${ui}">
          <h3 class="unit-title">${esc(unit.name)}</h3>
          <ol class="plan-full-list">
            ${unit.topics.map(t => `
              <li class="plan-full-item">
                <strong>${esc(t.nombre)}</strong>
                ${t.contenido ? `<p class="muted">${esc(t.contenido)}</p>` : ""}
                ${t.objectives?.length ? `<div class="topic-obj">${t.objectives.map(o => `<span class="obj-tag">${esc(o)}</span>`).join("")}</div>` : ""}
              </li>
            `).join("")}
          </ol>
        </div>
      `).join("");
      break;

    case "tests": {
      const savedScores = testScores[s.id] || {};
      let testIdx = 0;
      container.innerHTML = units.map((unit, ui) => {
        const unitTests = unit.topics.filter(t => t.questions?.length);
        if (!unitTests.length) return "";
        return `
          <div class="unit-section" id="unit-${ui}">
            <h3 class="unit-title">${esc(unit.name)}</h3>
            ${unitTests.map(topic => {
              const currentIdx = testIdx++;
              return `
                <div class="test-full-card" data-test="${currentIdx}">
                  <h4 class="test-topic-name">${esc(topic.nombre)}</h4>
                  ${topic.questions.map((q, qi) => `
                    <div class="test-question-full">
                      <p class="test-q-text"><strong>${qi + 1}.</strong> ${esc(q.question_text)}</p>
                      <div class="test-options-full">
                        ${(q.options || []).map((op, oi) => `
                          <label class="test-option-full" data-q="${currentIdx}-${qi}" data-o="${oi}">
                            <input type="radio" name="t${currentIdx}_q${qi}" value="${oi}">
                            <span>${esc(op)}</span>
                          </label>
                        `).join("")}
                      </div>
                    </div>
                  `).join("")}
                  <button class="btn btn-primary btn-small btn-check-full-test" data-test="${currentIdx}" data-unit="${ui}">Verificar</button>
                  <div class="test-result-full" id="test-result-full-${currentIdx}"></div>
                </div>`;
            }).join("")}
          </div>`;
      }).join("");

      /* Bind test verification */
      container.querySelectorAll(".btn-check-full-test").forEach(btn => {
        btn.addEventListener("click", () => {
          const testEl = btn.closest(".test-full-card");
          const allQuestions = testEl.querySelectorAll(".test-question-full");
          let correct = 0;
          let total = allQuestions.length;

          allQuestions.forEach((qEl, qi) => {
            const selected = qEl.querySelector("input:checked");
            const options = qEl.querySelectorAll(".test-option-full");
            /* Find the correct answer from the topic data */
            let topicData = null;
            for (const u of units) {
              for (const t of u.topics) {
                if (t.questions?.[qi]) { topicData = t; break; }
              }
            }
            const correctAnswer = topicData?.questions?.[qi]?.correct_answer || "";
            options.forEach(opt => {
              opt.classList.remove("test-correct", "test-wrong");
              const opText = opt.querySelector("span")?.textContent || "";
              if (opText === correctAnswer) opt.classList.add("test-correct");
              if (selected && +selected.value === +opt.dataset.o && opText !== correctAnswer) opt.classList.add("test-wrong");
            });
            if (selected) {
              const selectedText = options[+selected.value]?.querySelector("span")?.textContent || "";
              if (selectedText === correctAnswer) correct++;
            }
          });

          const pct = Math.round((correct / total) * 100);
          const resultEl = byId("test-result-full-" + btn.dataset.test);
          resultEl.innerHTML = `
            <div class="test-score ${pct >= 70 ? "pass" : "fail"}">
              ${correct}/${total} correctas (${pct}%) ${pct >= 70 ? " - Aprobado" : " - Necesitas repasar"}
            </div>`;
        });
      });
      break;
    }

    case "ejercicios":
      container.innerHTML = units.map((unit, ui) => {
        const allEx = unit.topics.flatMap(t => (t.exercises || []).map(e => ({ ...e, topic: t.nombre })));
        if (!allEx.length) return "";
        return `
          <div class="unit-section" id="unit-${ui}">
            <h3 class="unit-title">${esc(unit.name)}</h3>
            ${allEx.map((ex, i) => `
              <div class="exercise-full-card">
                <span class="ex-topic-tag">${esc(ex.topic)}</span>
                <h5>Ejercicio ${i + 1}</h5>
                <p class="exercise-stmt-full">${esc(ex.statement || "")}</p>
                <button class="btn btn-ghost btn-small btn-show-ex-sol" data-ex="${ui}-${i}">Ver solucion</button>
                <div class="exercise-sol-full" id="ex-sol-${ui}-${i}" hidden>
                  <p>${esc(ex.solution || "").replace(/\n/g, "<br>")}</p>
                </div>
              </div>
            `).join("")}
          </div>`;
      }).join("");

      container.querySelectorAll(".btn-show-ex-sol").forEach(btn => {
        btn.addEventListener("click", () => {
          const sol = byId("ex-sol-" + btn.dataset.ex);
          sol.hidden = !sol.hidden;
          btn.textContent = sol.hidden ? "Ver solucion" : "Ocultar";
        });
      });
      break;

    case "flashcards": {
      const allFC = units.flatMap(u => u.topics.flatMap(t => (t.flashcards || []).map(f => ({ ...f, topic: t.nombre }))));
      container.innerHTML = `
        <div class="flashcards-full-grid">
          ${allFC.map((f, i) => `
            <div class="flashcard-full" data-fc="${i}">
              <div class="fc-front">${esc(f.front || "")}</div>
              <div class="fc-back" hidden>${esc(f.back || "")}</div>
              <div class="fc-topic">${esc(f.topic)}</div>
              <button class="btn btn-ghost btn-small btn-flip-full" data-fc="${i}">Voltear</button>
            </div>
          `).join("")}
        </div>`;

      container.querySelectorAll(".btn-flip-full").forEach(btn => {
        btn.addEventListener("click", () => {
          const card = btn.closest(".flashcard-full");
          const back = card.querySelector(".fc-back");
          back.hidden = !back.hidden;
          btn.textContent = back.hidden ? "Voltear" : "Ocultar";
        });
      });
      break;
    }

    case "repasos":
      container.innerHTML = units.map((unit, ui) => {
        const allRev = unit.topics.flatMap(t => (t.reviews || []).map(r => ({ ...r, topic: t.nombre })));
        if (!allRev.length) return "";
        return `
          <div class="unit-section" id="unit-${ui}">
            <h3 class="unit-title">${esc(unit.name)}</h3>
            ${allRev.map(r => `
              <div class="review-full-card">
                <h5>${esc(r.topic)}</h5>
                <div class="review-full-content">${esc(r.content || "").replace(/\n/g, "<br>")}</div>
                ${r.study_tips ? `<div class="review-tips"><strong>Consejos:</strong> ${esc(r.study_tips)}</div>` : ""}
              </div>
            `).join("")}
          </div>`;
      }).join("");
      break;
  }
}

function renderTopicSummary(topic, s) {
  /* Si tiene resumen del backend, usarlo */
  if (topic.summary) {
    return `<p class="summary-text">${esc(topic.summary).replace(/\n/g, "<br>")}</p>`;
  }
  if (topic.contenido) {
    return `<p class="summary-text">${esc(topic.contenido).replace(/\n/g, "<br>")}</p>`;
  }

  /* Fallback: buscar en resumenes del subject */
  const resumen = (s.resumenes || []).find(r => r.tema === topic.nombre);
  if (resumen) {
    return `<p class="summary-text">${esc(resumen.contenido).replace(/\n/g, "<br>")}</p>`;
  }

  return `<p class="summary-text muted">Tema del plan de estudios.</p>`;
}

function bindTabContentEvents(s) {
  /* Legacy function - detail view now handles its own events */
}

/* =========================================================
   ANALIZADOR DE ASIGNATURAS
   ========================================================= */
let analyzerFiles = [];

function initAnalyzer() {
  const dz = byId("dropzone");
  const fi = byId("analyzer-files");
  const btn = byId("btn-analyze");
  const nameInput = byId("analyzer-name");

  const updateBtnState = () => {
    btn.disabled = !analyzerFiles.length || !nameInput.value.trim();
  };

  dz.addEventListener("click", () => fi.click());
  dz.addEventListener("dragover", e => { e.preventDefault(); dz.classList.add("dragover"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("dragover"));
  dz.addEventListener("drop", e => {
    e.preventDefault(); dz.classList.remove("dragover");
    const files = Array.from(e.dataTransfer.files).filter(f => f.type === "application/pdf");
    if (files.length === 0) { toast("Solo se aceptan archivos PDF", "error"); return; }
    addAnalyzerFiles(files);
  });
  fi.addEventListener("change", () => { addAnalyzerFiles(Array.from(fi.files)); fi.value = ""; });
  nameInput.addEventListener("input", updateBtnState);
  btn.addEventListener("click", runAnalysis);
}

function addAnalyzerFiles(files) {
  files.forEach(f => {
    if (!analyzerFiles.some(x => x.name === f.name)) analyzerFiles.push(f);
  });
  renderAnalyzerFileList();
}

function renderAnalyzerFileList() {
  const fl = byId("analyzer-file-list");
  const btn = byId("btn-analyze");
  fl.innerHTML = analyzerFiles.map((f, i) =>
    `<span class="file-tag">${esc(f.name)} <button class="file-remove" data-idx="${i}" aria-label="Quitar">&times;</button></span>`
  ).join("");
  fl.querySelectorAll(".file-remove").forEach(b =>
    b.addEventListener("click", () => { analyzerFiles.splice(+b.dataset.idx, 1); renderAnalyzerFileList(); })
  );
  btn.disabled = !analyzerFiles.length || !byId("analyzer-name").value.trim();
}

function setProgress(pct, msg) {
  byId("analyzer-progress").hidden = false;
  byId("progress-fill").style.width = pct + "%";
  byId("progress-text").textContent = msg;
}

/* =========================================================
   EJECUCION DEL ANALISIS — Backend API o fallback local
   ========================================================= */
async function runAnalysis() {
  const name = byId("analyzer-name").value.trim();
  if (!name) { toast("Escribe el nombre de la asignatura", "error"); return; }
  if (!analyzerFiles.length) { toast("Selecciona al menos un PDF", "error"); return; }

  const btn = byId("btn-analyze");
  btn.disabled = true;
  const originalBtnHtml = btn.innerHTML;
  btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Analizando...`;

  try {
    if (backendAvailable) {
      /* ===== MODO BACKEND ===== */
      setProgress(10, "Conectando con el servidor...");
      await new Promise(r => setTimeout(r, 200));

      setProgress(20, "Subiendo PDFs al servidor...");
      const { subject, docs } = await uploadToBackend(analyzerFiles, name);

      setProgress(40, `Procesando ${docs.length} documento(s) con IA local...`);

      /* Polling de estado para el primer documento */
      if (docs.length > 0) {
        await pollProcessingStatus(docs[0].id, (pct, msg) => setProgress(pct, msg));
      }

      setProgress(95, "Cargando resultados...");
      const detail = await fetchSubjectFromBackend(subject.id);

      /* Actualizar o crear subject local */
      let localSubject = userSubjects.find(s => s.id === subject.id);
      if (!localSubject) {
        localSubject = { id: subject.id, nombre: subject.name, descripcion: `Analisis de ${analyzerFiles.length} PDF(s)` };
        userSubjects.push(localSubject);
      }
      Object.assign(localSubject, detail);

      saveLocal();
      renderAll();

      setProgress(100, "Completado.");
      analyzerFiles = [];
      renderAnalyzerFileList();
      byId("analyzer-name").value = "";

      const nTopics = detail.temas?.length || 0;
      const nTests = detail.tests?.length || 0;
      toast(`"${name}": ${nTopics} temas, ${nTests} tests — IA: Ollama Local`);
      setTimeout(() => { byId("analyzer-progress").hidden = true; }, 1500);
      openDetail(subject.id);

    } else {
      /* ===== MODO OFFLINE (fallback local, como antes) ===== */
      let fullText = "";
      for (let i = 0; i < analyzerFiles.length; i++) {
        setProgress(((i + 1) / analyzerFiles.length) * 55, `Leyendo PDF ${i + 1}/${analyzerFiles.length}: ${analyzerFiles[i].name}`);
        try {
          const text = await extractPdfText(analyzerFiles[i]);
          fullText += text + "\n\n";
        } catch (pdfErr) {
          console.error(`Error leyendo ${analyzerFiles[i].name}:`, pdfErr);
          toast(`Error leyendo "${analyzerFiles[i].name}": ${pdfErr.message}`, "error");
        }
      }

      if (!fullText.trim()) {
        toast("No se pudo extraer texto de los PDFs.", "error");
        return;
      }

      setProgress(60, "Analizando contenido (modo local)...");
      await new Promise(r => setTimeout(r, 200));

      let result;
      try {
        result = analyzeText(fullText, name);
      } catch (analyzeErr) {
        toast("Error al analizar: " + analyzeErr.message, "error");
        return;
      }

      setProgress(80, "Generando tests y ejercicios...");
      await new Promise(r => setTimeout(r, 200));

      let subject = userSubjects.find(s => s.nombre.toLowerCase() === name.toLowerCase());
      if (!subject) {
        subject = { id: "u_" + Date.now(), nombre: name, descripcion: `Analisis de ${analyzerFiles.length} PDF(s)`, anno: "2", semestre: "" };
        userSubjects.push(subject);
      }

      Object.assign(subject, {
        resumen: result.resumen,
        temas: result.topics,
        repasos: result.repasos,
        tests: result.tests,
        ejercicios: result.ejercicios,
        resumenes: result.resumenes,
        ia: result.ia,
        iaRazon: result.iaRazon,
        pendienteAnalisis: false,
      });

      setProgress(92, "Guardando...");
      await new Promise(r => setTimeout(r, 150));

      saveLocal();
      renderAll();

      setProgress(100, "Completado.");
      analyzerFiles = [];
      renderAnalyzerFileList();
      byId("analyzer-name").value = "";

      const nTopics = result.topics.length;
      const nTests = result.tests.length;
      const nExercises = result.ejercicios.length;
      toast(`"${name}": ${nTopics} temas, ${nTests} tests, ${nExercises} ejercicios — IA: ${iaLabel(result.ia)}`);
      setTimeout(() => { byId("analyzer-progress").hidden = true; }, 1500);
      openDetail(subject.id);
    }
  } catch (err) {
    toast("Error inesperado: " + err.message, "error");
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalBtnHtml;
    btn.disabled = !analyzerFiles.length || !byId("analyzer-name").value.trim();
  }
}

/* ---------------- Fallback: extraccion PDF en cliente (solo modo offline) ---------------- */
async function extractPdfText(file) {
  if (!window._pdfWorkerReady) {
    try {
      pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      window._pdfWorkerReady = true;
    } catch (e) {
      console.warn("PDF.js worker no disponible, usando modo sin worker");
    }
  }

  const buf = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: buf });
  const pdf = await loadingTask.promise;
  let text = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const items = content.items;
    let lastY = null;
    let lineText = "";

    for (const item of items) {
      const y = Math.round(item.transform[5]);
      if (lastY !== null && Math.abs(y - lastY) > 5) {
        text += lineText.trim() + "\n";
        lineText = "";
      }
      lineText += (lineText && !lineText.endsWith(" ") ? " " : "") + item.str;
      lastY = y;
    }
    if (lineText.trim()) text += lineText.trim() + "\n";
  }
  return text;
}

/* =========================================================
   ANALISIS LOCAL (fallback cuando no hay backend)
   ========================================================= */
function analyzeText(fullText, subjectName) {
  const lines = fullText.split(/\n+/).map(l => l.trim()).filter(l => l.length > 3);
  const lower = fullText.toLowerCase();

  const mathKw = ["ecuacion","integral","derivada","funcion","teorema","demostracion","limite","serie","matriz","determinante","polinomio","raiz","calculo","algebra","estadistica","probabilidad","combinatoria","proposicional","logica","conjunto","relacion","vector","espacio","transformada","factorial","recursion","congruencia","primo","divisibilidad"];
  const progKw = ["codigo","programa","algoritmo","clase","metodo","objeto","array","lista","puntero","memoria","compilador","return","for","while","if","herencia","interface","tipo","dato","estructura","base de datos","sql","red","protocolo","funcion","recursion","complejidad","orden","pila","cola","arbol","grafo","hash","archivo","excepcion","objeto","polimorfismo","encapsulamiento","abstraccion"];
  const redaccionKw = ["ensayo","parrafo","redaccion","argumento","tesis","introduccion","conclusion","bibliografia","cita","referencia","texto","lectura","comprension","analisis","critica","paradigma","teoria","concepto","definicion","contexto","historico","social","cultura","educacion","filosofia"];

  const score = (kws) => kws.reduce((n, kw) => n + (lower.includes(kw) ? 1 : 0), 0);
  const scores = { math: score(mathKw), prog: score(progKw), redaccion: score(redaccionKw) };
  const maxScore = Math.max(1, ...Object.values(scores));

  let topics = detectTopics(lines, fullText);
  const resumen = generateIntelligentSummary(fullText, subjectName, scores);

  const repasos = topics.slice(0, 15).map(t => ({
    tema: t,
    contenido: generateReview(t, fullText, scores),
  }));

  const tests = topics.slice(0, 10).map(t => ({
    tema: t,
    preguntas: generateQuestions(t, fullText, scores),
  })).filter(t => t.preguntas.length >= 3);

  const ejercicios = topics.slice(0, 10).map(t => generateExercise(t, fullText, scores)).filter(Boolean);

  const resumenes = topics.slice(0, 15).map(t => ({
    tema: t,
    contenido: generateTopicSummary(t, fullText),
  }));

  let ia = "kimi", iaRazon = "";
  if (scores.math / maxScore > 0.35) {
    ia = "chatgpt";
    iaRazon = "Contiene conceptos matematicos/analiticos. ChatGPT resuelve problemas paso a paso.";
  } else if (scores.prog / maxScore > 0.35) {
    ia = "kimi";
    iaRazon = "Contiene temas de programacion/sistemas. Kimi analiza codigo y genera implementaciones.";
  } else if (scores.redaccion / maxScore > 0.25) {
    ia = "claude";
    iaRazon = "Contiene temas de redaccion/teoria. Claude redige ensayos y revisa estilo academico.";
  } else {
    ia = "kimi";
    iaRazon = "Tema mixto. Kimi trabaja bien con documentos largos y planes de estudio generales.";
  }

  return { resumen, topics, repasos, tests, ejercicios, resumenes, ia, iaRazon };
}

/* Deteccion de temas */
function detectTopics(lines, fullText) {
  const topics = [];
  const seen = new Set();

  const addTopic = (t) => {
    const clean = t.replace(/\s+/g, " ").trim();
    if (clean.length < 5 || clean.length > 120) return;
    const key = clean.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    topics.push(clean);
  };

  const numPatterns = [
    /^(\d{1,2})\.\s+([A-ZAEIOU].{5,100})/,
    /^(\d{1,2}\.\d{1,2})\.\s+(.{5,100})/,
    /^([IVX]+)\.\s+([A-ZAEIOU].{5,100})/,
    /^([A-Z])\.\s+([A-ZAEIOU].{5,100})/,
  ];

  const structPatterns = [
    /^(tema|capitulo|unidad|modulo|seccion|parte|clase|practica|taller|laboratorio)\s+\d+[\.\:\-]?\s*(.+)/i,
    /^(tema|capitulo|unidad|modulo|seccion)\s*[\:\-]\s*(.+)/i,
  ];

  const titlePattern = /^[A-ZAEIOU\s]{8,60}$/;

  lines.forEach((line, idx) => {
    for (const pat of numPatterns) {
      const m = line.match(pat);
      if (m) { addTopic(m[2] || m[1]); break; }
    }
    for (const pat of structPatterns) {
      const m = line.match(pat);
      if (m) { addTopic(m[2] || m[0]); break; }
    }
    if (titlePattern.test(line) && topics.length < 20) {
      const prev = lines[idx - 1] || "";
      if (prev.length < 10) addTopic(line.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()));
    }
  });

  if (topics.length < 4) {
    const sentences = fullText.split(/[\.!\?]+/).map(s => s.trim()).filter(s => s.length > 25 && s.length < 180);
    const kw = ["tema","capitulo","unidad","modulo","seccion","parte","practica","ejercicio","taller","laboratorio","concepto","definicion","importante","fundamental","basico","avanzado"];
    sentences.forEach(s => {
      if (topics.length >= 15) return;
      if (kw.some(k => s.toLowerCase().includes(k))) {
        addTopic(s.split(":").pop().trim().substring(0, 90));
      }
    });
  }

  if (topics.length < 4) {
    const sentences = fullText.split(/[\.!\?]+/).map(s => s.trim()).filter(s => s.length > 20 && s.length < 150);
    const unique = [...new Set(sentences)];
    unique.slice(0, Math.min(10, unique.length)).forEach(s => addTopic(s));
  }

  return topics.slice(0, 20);
}

function generateIntelligentSummary(fullText, subjectName, scores) {
  const sentences = fullText.split(/[\.!\?]+/).map(s => s.trim()).filter(s => s.length > 20 && s.length < 250);
  const importantWords = extractImportantWords(fullText);

  const scored = sentences.map(s => {
    let score = 0;
    const sl = s.toLowerCase();
    importantWords.forEach(w => { if (sl.includes(w)) score += 2; });
    if (sl.includes("es una") || sl.includes("es un") || sl.includes("se define") || sl.includes("consiste en")) score += 3;
    if (sl.includes("importante") || sl.includes("fundamental") || sl.includes("basico") || sl.includes("clave")) score += 2;
    if (s.length > 60) score += 1;
    return { text: s, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 6).map(s => s.text);

  if (top.length === 0) {
    return `${subjectName}: Asignatura del plan de estudios que requiere estudio detallado.`;
  }

  let summary = `${subjectName}: ${top[0]}`;
  if (top.length > 1) summary += ` ${top[1]}`;
  if (top.length > 2) summary += ` ${top[2]}`;

  const typeLabel = scores.math > scores.prog && scores.math > scores.redaccion ? "matematica"
    : scores.prog > scores.redaccion ? "de programacion/sistemas"
    : scores.redaccion > 0 ? "teorica/redaccion" : "mixta";
  summary += `\n\nTipo: ${typeLabel}. Se recomienda practicar con ejercicios y revisar definiciones clave.`;

  return summary.substring(0, 600);
}

function extractImportantWords(text) {
  const lower = text.toLowerCase();
  const words = lower.split(/\W+/).filter(w => w.length > 4);
  const freq = {};
  words.forEach(w => { freq[w] = (freq[w] || 0) + 1; });
  return Object.entries(freq)
    .filter(([w, c]) => c >= 2 && !["para","como","mas","pero","este","esta","todo","otro","otra","desde","hasta","cuando","donde","porque","segun","todos","ellas","ellos","tiene","puede","sobre","otras","estos","estas","cada","ello","otro","ella","nos","les","dos","uno","una","las","los","que","sin","con","por","sino","muy","tan","solo","aqui","ahi","alli","asi","luego","despues","antes","ese","esa","eso","aquel","esto"].includes(w))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([w]) => w);
}

function generateTopicSummary(topic, fullText) {
  const lower = fullText.toLowerCase();
  const topicLower = topic.toLowerCase().substring(0, 25);
  const idx = lower.indexOf(topicLower);
  let context = "";
  if (idx !== -1) context = fullText.substring(Math.max(0, idx - 200), Math.min(fullText.length, idx + 800));

  const sentences = context.split(/[\.!\n]+/).map(s => s.trim()).filter(s => s.length > 20);

  if (sentences.length === 0) {
    return `Tema "${topic}": Concepto del plan de estudios. Revisar definiciones y aplicaciones practicas.`;
  }

  const scored = sentences.map(s => {
    let sc = 0;
    const sl = s.toLowerCase();
    if (sl.includes("es una") || sl.includes("es un") || sl.includes("se define") || sl.includes("consiste")) sc += 3;
    if (sl.includes(topic.toLowerCase().substring(0, 15))) sc += 2;
    if (s.length > 40) sc += 1;
    return { text: s, score: sc };
  }).sort((a, b) => b.score - a.score);

  const top = scored.slice(0, 4).map(s => s.text);
  let summary = `Resumen de ${topic}:\n\n`;
  summary += top.map(p => `- ${p.charAt(0).toUpperCase() + p.slice(1)}.`).join("\n");
  summary += `\n\nPuntos clave: domina definiciones, practica ejemplos, revisa relacion con otros temas.`;
  return summary.substring(0, 400);
}

function generateReview(topic, fullText, scores) {
  const lower = fullText.toLowerCase();
  const topicLower = topic.toLowerCase().substring(0, 25);
  const idx = lower.indexOf(topicLower);
  let context = "";
  if (idx !== -1) context = fullText.substring(Math.max(0, idx - 200), Math.min(fullText.length, idx + 900));

  const sentences = context.split(/[\.!\n]+/).map(s => s.trim()).filter(s => s.length > 15);
  const points = sentences.slice(0, 8).map(s => s.charAt(0).toUpperCase() + s.slice(1));

  if (points.length === 0) {
    points.push(
      "Definicion y conceptos fundamentales del tema.",
      "Propiedades y caracteristicas principales.",
      "Aplicacion practica y ejemplos tipicos.",
      "Relacion con otros temas del plan de estudios.",
      "Preguntas frecuentes de examenes anteriores."
    );
  }

  let studyTips = "";
  if (scores.math > scores.prog && scores.math > scores.redaccion) {
    studyTips = "\n\nConsejos de estudio:\n- Resuelve al menos 5 ejercicios de cada tipo\n- Domina las demostraciones paso a paso\n- Revisa formulas y teoremas fundamentales";
  } else if (scores.prog > scores.redaccion) {
    studyTips = "\n\nConsejos de estudio:\n- Implementa cada algoritmo en codigo\n- Dibuja diagramas de flujo y estructuras de datos\n- Analiza la complejidad temporal y espacial";
  } else {
    studyTips = "\n\nConsejos de estudio:\n- Elabora mapas conceptuales del tema\n- Redacta ensayos cortos sobre los conceptos clave\n- Analiza las relaciones causa-efecto";
  }

  let review = `Repaso: ${topic}\n\n`;
  review += points.slice(0, 5).map((p, i) => `${i + 1}. ${p}.`).join("\n");
  review += studyTips;
  return review;
}

function generateQuestions(topic, fullText, scores) {
  const lower = fullText.toLowerCase();
  const topicLower = topic.toLowerCase().substring(0, 25);
  const idx = lower.indexOf(topicLower);
  let context = "";
  if (idx !== -1) context = fullText.substring(Math.max(0, idx - 300), Math.min(fullText.length, idx + 1000));

  const sentences = context.split(/[\.!\n]+/).map(s => s.trim()).filter(s => s.length > 20);
  const questions = [];
  const numQ = Math.min(5, Math.max(3, Math.min(sentences.length, 5)));

  for (let i = 0; i < numQ; i++) {
    const base = sentences[i % sentences.length] || topic;
    const words = base.split(/\s+/).filter(w => w.length > 4);
    let correct, wrong1, wrong2, wrong3, pregunta;

    if (scores.math > scores.prog && scores.math > scores.redaccion) {
      correct = base.substring(0, 130);
      wrong1 = words.slice(0, 4).join(" ") + " " + words.slice(-2).join(" ");
      wrong2 = `La definicion de ${topic} en un contexto no relacionado`;
      wrong3 = words.slice(2, 6).join(" ");
      pregunta = `¿Cual de las siguientes afirmaciones sobre "${topic}" es correcta?`;
    } else if (scores.prog > scores.redaccion) {
      correct = `En ${topic}: ${base.substring(0, 120)}`;
      wrong1 = `${topic} solo se aplica en bases de datos relacionales`;
      wrong2 = `No existe implementacion practica de ${topic}`;
      wrong3 = `${topic} es exclusivo de un solo lenguaje de programacion`;
      pregunta = `Sobre "${topic}", ¿cual afirmacion es correcta?`;
    } else {
      correct = base.substring(0, 130);
      wrong1 = `${topic} no tiene relacion con el contenido principal`;
      wrong2 = `El concepto es opuesto a lo descrito en el plan`;
      wrong3 = `${topic} solo aplica en contextos no academicos`;
      pregunta = `¿Que describe correctamente "${topic}"?`;
    }

    const opciones = shuffle([correct, wrong1, wrong2, wrong3]);
    const respuesta = opciones.indexOf(correct);

    questions.push({
      pregunta,
      opciones,
      respuesta,
      explicacion: `La respuesta correcta es: "${correct.substring(0, 100)}..."`,
    });
  }
  return questions;
}

function generateExercise(topic, fullText, scores) {
  const lower = fullText.toLowerCase();
  const topicLower = topic.toLowerCase().substring(0, 25);
  const idx = lower.indexOf(topicLower);
  let context = "";
  if (idx !== -1) context = fullText.substring(Math.max(0, idx - 150), Math.min(fullText.length, idx + 700));

  const lines = context.split(/[\.!\n]+/).filter(l => l.trim().length > 15);
  const ref = lines[0]?.substring(0, 120) || topic;

  if (scores.math > scores.prog && scores.redaccion) {
    return {
      enunciado: `Resuelva o demuestre un problema relacionado con "${topic}". Base teorica: ${ref}.`,
      solucion: `Paso 1: Identificar datos y condiciones.\nPaso 2: Aplicar definicion o teorema.\nPaso 3: Desarrollar solucion paso a paso.\nPaso 4: Verificar resultado.`,
    };
  } else if (scores.prog > scores.redaccion) {
    return {
      enunciado: `Implemente un modulo o funcion que aplique "${topic}". Considere: ${ref}.`,
      solucion: `Paso 1: Definir estructura de datos.\nPaso 2: Implementar logica con pseudocodigo.\nPaso 3: Probar con 3 casos de prueba.\nPaso 4: Analizar complejidad y documentar.`,
    };
  } else {
    return {
      enunciado: `Desarrolle un analisis o ensayo sobre "${topic}". Fundamente con: ${ref}.`,
      solucion: `Paso 1: Investigar al menos 3 fuentes.\nPaso 2: Estructurar introduccion con tesis.\nPaso 3: Desarrollar argumentos con evidencias.\nPaso 4: Redactar conclusion.`,
    };
  }
}

/* ---------------- Eventos globales ---------------- */
function bindEvents() {
  document.querySelectorAll(".nav-item[data-view]").forEach(b =>
    b.addEventListener("click", () => switchView(b.dataset.view)));

  byId("btn-add-top").addEventListener("click", () => openSubjectModal());

  document.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", closeModals));
  document.querySelectorAll(".modal-overlay").forEach(m =>
    m.addEventListener("click", e => { if (e.target === m) closeModals(); }));
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeModals(); });

  const grid = byId("subjects-grid");
  grid.addEventListener("click", e => {
    const add = e.target.closest('[data-action="add"]');
    if (add) { openSubjectModal(); return; }
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

  if (!localStorage.getItem(LS_NOTICE)) byId("notice").hidden = false;
  byId("notice-close").addEventListener("click", () => {
    byId("notice").hidden = true;
    localStorage.setItem(LS_NOTICE, "1");
  });

  byId("form-subject").addEventListener("submit", e => {
    e.preventDefault();
    const data = { nombre: byId("f-nombre").value.trim(), descripcion: byId("f-descripcion").value.trim(), anno: "2", semestre: "" };
    if (editingId) {
      Object.assign(userSubjects.find(x => x.id === editingId), data);
      /* Actualizar en backend tambien */
      if (backendAvailable) {
        apiFetch(`/subjects/${editingId}`, { method: "PUT", body: JSON.stringify({ name: data.nombre, description: data.descripcion }) }).catch(e => console.warn("Error actualizando backend:", e));
      }
      toast("Cambios guardados");
    } else {
      const newId = "u_" + Date.now();
      const newSubject = { id: newId, ...data, resumen: "", temas: [], repasos: [], tests: [], ejercicios: [], resumenes: [], ia: null, iaRazon: "" };
      userSubjects.push(newSubject);
      /* Crear en backend */
      if (backendAvailable) {
        apiFetch("/subjects", { method: "POST", body: JSON.stringify({ name: data.nombre, description: data.descripcion }) })
          .then(s => { newSubject.id = s.id; })
          .catch(e => console.warn("Error creando en backend:", e));
      }
      toast("Asignatura guardada");
    }
    saveLocal(); renderAll(); closeModals();
  });
}

function switchView(v) {
  document.querySelectorAll(".nav-item[data-view]").forEach(b => b.classList.toggle("active", b.dataset.view === v));
  document.querySelectorAll(".view").forEach(s => s.classList.remove("active"));
  byId("view-" + v).classList.add("active");
  const titles = {
    panel: ["Panel", "Resumen de tu semestre"],
    asignaturas: ["Asignaturas", `${allSubjects().length} registradas - toca una tarjeta para ver el detalle`],
    detail: [window._currentDetailId ? allSubjects().find(x => x.id === window._currentDetailId)?.nombre || "Detalle" : "Detalle", ""],
  };
  byId("view-title").textContent = titles[v]?.[0] || v;
  byId("view-subtitle").textContent = titles[v]?.[1] || "";
}

init();
