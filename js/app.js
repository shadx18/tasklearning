/* =========================================================
   TaskLearning v3.0 — Plataforma de análisis de asignaturas
   Subes PDFs → plataforma genera plan, repasos, tests,
   resúmenes y ejercicios automáticamente.
   ========================================================= */

const LS_KEY = "tasklearning.subjects.v1";
const LS_NOTICE = "tasklearning.notice.dismissed";
let seedSubjects = [];
let userSubjects = [];
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
};

/* ---------------- Utilidades ---------------- */
function byId(id) { return document.getElementById(id); }
function esc(t) { const d = document.createElement("div"); d.textContent = t ?? ""; return d.innerHTML; }
function iaLabel(k) { return { kimi: "Kimi", chatgpt: "ChatGPT", claude: "Claude" }[k] || k; }
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
  initAnalyzer();
  renderSidebarSubjects();
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
      <p class="empty-title">Todavía no hay asignaturas</p>
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
      <p class="subject-desc">${esc(s.resumen || s.descripcion || "Sin descripción.")}</p>
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

/* ---------------- Modal añadir/editar ---------------- */
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
  if (!confirm(`¿Eliminar "${s.nombre}"? Esta acción no se puede deshacer.`)) return;
  userSubjects = userSubjects.filter(x => x.id !== id);
  saveLocal(); renderAll();
  toast("Asignatura eliminada");
}

/* =========================================================
   DETALLE / LANDING DE ASIGNATURA
   ========================================================= */
function openDetail(id) {
  const s = allSubjects().find(x => x.id === id);
  if (!s) return;
  const analyzed = !!s.temas?.length;

  byId("detail-content").innerHTML = `
    <div class="modal-head">
      <div>
        <h3>${esc(s.nombre)}</h3>
        <div class="detail-badges">
          ${analyzed ? `<span class="ai-badge ${s.ia}">${iaLabel(s.ia)}</span>` : `<span class="ai-badge pending-badge">Sin analizar</span>`}
          <span class="status-tag ${analyzed ? "ok" : "pending"}">${analyzed ? "Analizada" : "Pendiente"}</span>
        </div>
      </div>
      <button class="icon-btn" data-close aria-label="Cerrar">${svg('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>')}</button>
    </div>

    ${analyzed ? `
    <div class="detail-tabs" id="detail-tabs">
      <button class="detail-tab active" data-tab="resumen">${I.book} Resumen</button>
      <button class="detail-tab" data-tab="plan">${I.list} Plan Temático</button>
      <button class="detail-tab" data-tab="repasos">${I.file} Repasos</button>
      <button class="detail-tab" data-tab="tests">${I.quiz} Tests</button>
      <button class="detail-tab" data-tab="ejercicios">${I.edit} Ejercicios</button>
    </div>

    <div class="detail-tab-content" id="detail-tab-content">
      ${renderDetailTab("resumen", s)}
    </div>

    <div class="detail-section" style="margin-top:18px">
      <h4>IA sugerida para dudas</h4>
      <div class="ia-reason">${esc(s.iaRazon || "No determinada.")}</div>
    </div>
    ` : `
    <div class="detail-section">
      <p class="muted">Esta asignatura aún no ha sido analizada. Sube sus PDFs en el Panel para generar el contenido automáticamente.</p>
    </div>
    `}
  `;

  byId("modal-detail").classList.add("open");
  const root = byId("detail-content");

  root.querySelector("[data-close]").addEventListener("click", closeModals);

  if (analyzed) {
    root.querySelectorAll(".detail-tab").forEach(tab =>
      tab.addEventListener("click", () => {
        root.querySelectorAll(".detail-tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        byId("detail-tab-content").innerHTML = renderDetailTab(tab.dataset.tab, s);
        bindTabContentEvents(s);
      })
    );
    bindTabContentEvents(s);
  }
}

function renderDetailTab(tab, s) {
  switch (tab) {
    case "resumen":
      return `<div class="detail-section">
        <p class="detail-text">${esc(s.resumen || "Sin resumen.")}</p>
        ${s.temas?.length ? `<div class="topics">${s.temas.map(t => `<span class="topic">${esc(typeof t === "string" ? t : t.nombre)}</span>`).join("")}</div>` : ""}
      </div>`;

    case "plan":
      return `<div class="detail-section">
        ${s.temas?.length
          ? `<ol class="plan-list">${s.temas.map((t, i) => {
              const name = typeof t === "string" ? t : t.nombre;
              const content = typeof t === "object" ? t.contenido : "";
              return `<li class="plan-item">
                <strong>${esc(name)}</strong>
                ${content ? `<p class="muted">${esc(content)}</p>` : ""}
              </li>`;
            }).join("")}</ol>`
          : `<p class="muted">No se detectaron temas.</p>`}
      </div>`;

    case "repasos":
      return `<div class="detail-section">
        ${s.repasos?.length
          ? s.repasos.map(r => `
            <div class="review-card">
              <h5>${esc(r.tema)}</h5>
              <div class="review-content">${esc(r.contenido).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>")}</div>
            </div>`).join("")
          : `<p class="muted">No hay repasos generados.</p>`}
      </div>`;

    case "tests":
      return `<div class="detail-section">
        ${s.tests?.length
          ? `<div id="test-container">${renderTest(s, 0)}</div>`
          : `<p class="muted">No hay tests generados.</p>`}
      </div>`;

    case "ejercicios":
      return `<div class="detail-section">
        ${s.ejercicios?.length
          ? s.ejercicios.map((ex, i) => `
            <div class="exercise-card">
              <h5>Ejercicio ${i + 1}</h5>
              <p class="exercise-stmt">${esc(ex.enunciado)}</p>
              <button class="btn btn-ghost btn-small btn-show-solution" data-idx="${i}">Ver solución</button>
              <div class="exercise-solution" id="sol-${i}" hidden>
                <p>${esc(ex.solucion).replace(/\n/g, "<br>")}</p>
              </div>
            </div>`).join("")
          : `<p class="muted">No hay ejercicios generados.</p>`}
      </div>`;

    default:
      return "";
  }
}

function renderTest(s, testIdx) {
  const test = s.tests[testIdx];
  if (!test) return `<p class="muted">No hay más tests.</p>`;
  return `
    <div class="test-card" data-test="${testIdx}">
      <h5>Test ${testIdx + 1}: ${esc(test.tema)}</h5>
      ${test.preguntas.map((pq, qi) => `
        <div class="test-question">
          <p><strong>${qi + 1}.</strong> ${esc(pq.pregunta)}</p>
          <div class="test-options">
            ${pq.opciones.map((op, oi) => `
              <label class="test-option" data-q="${qi}" data-o="${oi}">
                <input type="radio" name="q${testIdx}_${qi}" value="${oi}">
                <span>${esc(op)}</span>
              </label>`).join("")}
          </div>
        </div>`).join("")}
      <button class="btn btn-primary btn-small btn-check-test" data-test="${testIdx}">Verificar respuestas</button>
      <div class="test-result" id="test-result-${testIdx}" hidden></div>
    </div>`;
}

function bindTabContentEvents(s) {
  byId("detail-content").querySelectorAll(".btn-show-solution").forEach(btn =>
    btn.addEventListener("click", () => {
      const sol = byId("sol-" + btn.dataset.idx);
      sol.hidden = !sol.hidden;
      btn.textContent = sol.hidden ? "Ver solución" : "Ocultar solución";
    })
  );

  byId("detail-content").querySelectorAll(".btn-check-test").forEach(btn =>
    btn.addEventListener("click", () => {
      const testIdx = +btn.dataset.test;
      const test = s.tests[testIdx];
      let correct = 0;
      test.preguntas.forEach((pq, qi) => {
        const selected = byId("detail-content").querySelector(`input[name="q${testIdx}_${qi}"]:checked`);
        const options = byId("detail-content").querySelectorAll(`[data-q="${qi}"]`);
        options.forEach((opt, oi) => {
          opt.classList.remove("test-correct", "test-wrong");
          if (oi === pq.respuesta) opt.classList.add("test-correct");
          if (selected && +selected.value === oi && oi !== pq.respuesta) opt.classList.add("test-wrong");
        });
        if (selected && +selected.value === pq.respuesta) correct++;
      });
      const result = byId("test-result-" + testIdx);
      result.hidden = false;
      const pct = Math.round((correct / test.preguntas.length) * 100);
      result.innerHTML = `
        <div class="test-score ${pct >= 70 ? "pass" : "fail"}">
          ${correct}/${test.preguntas.length} correctas (${pct}%)
          ${pct >= 70 ? " — ¡Aprobado!" : " — Necesitas repasar"}
        </div>
        ${test.preguntas.map((pq, qi) => pq.explicacion ? `<div class="test-explain"><strong>${qi + 1}.</strong> ${esc(pq.explicacion)}</div>` : "").join("")}`;
    })
  );
}

/* =========================================================
   ANALIZADOR DE ASIGNATURAS
   ========================================================= */
let analyzerFiles = [];

function initAnalyzer() {
  const dz = byId("dropzone");
  const fi = byId("analyzer-files");
  const btn = byId("btn-analyze");

  dz.addEventListener("click", () => fi.click());
  dz.addEventListener("dragover", e => { e.preventDefault(); dz.classList.add("dragover"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("dragover"));
  dz.addEventListener("drop", e => {
    e.preventDefault(); dz.classList.remove("dragover");
    addAnalyzerFiles(Array.from(e.dataTransfer.files).filter(f => f.type === "application/pdf"));
  });
  fi.addEventListener("change", () => { addAnalyzerFiles(Array.from(fi.files)); fi.value = ""; });
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

async function extractPdfText(file) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(it => it.str).join(" ") + "\n";
  }
  return text;
}

function setProgress(pct, msg) {
  byId("analyzer-progress").hidden = false;
  byId("progress-fill").style.width = pct + "%";
  byId("progress-text").textContent = msg;
}

/* =========================================================
   ANÁLISIS DE CONTENIDO — genera todo automáticamente
   ========================================================= */
function analyzeText(fullText, subjectName) {
  const lines = fullText.split(/\n+/).map(l => l.trim()).filter(l => l.length > 3);
  const lower = fullText.toLowerCase();

  // --- Detectar tipo ---
  const mathKw = ["ecuación","integral","derivada","función","teorema","demostración","límite","serie","matriz","determinante","polinomio","raíz","cálculo","álgebra","estadística","probabilidad","combinatoria","proposicional","lógica","conjunto","relación"];
  const progKw = ["código","programa","algoritmo","clase","método","objeto","array","lista","puntero","memoria","compilador","return","for","while","if","herencia","interface","tipo","dato","estructura","base de datos","sql","red","protocolo"];
  const redaccionKw = ["ensayo","párrafo","redacción","argumento","tesis","introducción","conclusión","bibliografía","cita","referencia","texto","lectura","comprensión","análisis","crítica","paradigma"];

  const score = (kws) => kws.reduce((n, kw) => n + (lower.includes(kw) ? 1 : 0), 0);
  const scores = { math: score(mathKw), prog: score(progKw), redaccion: score(redaccionKw) };
  const maxScore = Math.max(1, ...Object.values(scores));

  // --- Detectar temas ---
  const topicPatterns = [
    /^[\dIVX]+[\.\)\-:]\s+(.+)/,
    /^tema\s*\d+[\.\:\-]?\s*(.+)/i,
    /^cap[ií]tulo\s*\d+[\.\:\-]?\s*(.+)/i,
    /^unidad\s*\d+[\.\:\-]?\s*(.+)/i,
    /^m[oó]dulo\s*\d+[\.\:\-]?\s*(.+)/i,
    /^secci[oó]n\s*\d+[\.\:\-]?\s*(.+)/i,
    /^[\d]+[\.\)]\s+[A-ZÁÉÍÓÚÜ].{10,}/,
  ];

  let topics = [];
  lines.forEach(line => {
    for (const pat of topicPatterns) {
      const m = line.match(pat);
      if (m) { topics.push(m[1] ? m[1].trim() : line.trim()); break; }
    }
  });

  if (topics.length < 3) {
    const sentences = fullText.split(/[\.!\?]+/).map(s => s.trim()).filter(s => s.length > 20 && s.length < 200);
    const kw = ["tema","capítulo","unidad","módulo","sección","parte","práctica","ejercicio","taller","laboratorio"];
    sentences.forEach(s => {
      if (kw.some(k => s.toLowerCase().includes(k)) && topics.length < 15)
        topics.push(s.split(":").pop().trim().substring(0, 80));
    });
  }
  if (topics.length < 3) {
    const sentences = fullText.split(/[\.!\?]+/).map(s => s.trim()).filter(s => s.length > 15 && s.length < 150);
    topics = sentences.slice(0, Math.min(10, sentences.length));
  }
  topics = [...new Set(topics.map(t => t.replace(/\s+/g, " ").trim()))].slice(0, 20);

  // --- Resumen ---
  const firstParagraphs = lines.filter(l => l.length > 30).slice(0, 5).join(". ");
  const resumen = firstParagraphs.substring(0, 500) + (firstParagraphs.length > 500 ? "..." : "");

  // --- Repasos ---
  const repasos = topics.map(t => ({
    tema: t,
    contenido: generateReview(t, fullText),
  }));

  // --- Tests ---
  const tests = topics.map(t => ({
    tema: t,
    preguntas: generateQuestions(t, fullText, scores),
  })).filter(t => t.preguntas.length > 0);

  // --- Ejercicios ---
  const ejercicios = topics.map(t => generateExercise(t, fullText, scores)).filter(Boolean);

  // --- Resúmenes ---
  const resumenes = topics.map(t => ({
    tema: t,
    contenido: generateSummary(t, fullText),
  }));

  // --- IA recomendada ---
  let ia = "kimi", iaRazon = "";
  if (scores.math / maxScore > 0.4) {
    ia = "chatgpt";
    iaRazon = "Contiene conceptos matemáticos/analíticos. ChatGPT resuelve problemas paso a paso y demostraciones.";
  } else if (scores.prog / maxScore > 0.4) {
    ia = "kimi";
    iaRazon = "Contiene temas de programación/sistemas. Kimi analiza código y genera proyectos.";
  } else if (scores.redaccion / maxScore > 0.3) {
    ia = "claude";
    iaRazon = "Contiene temas de redacción/teoría. Claude redige ensayos y revisa estilo académico.";
  } else {
    ia = "kimi";
    iaRazon = "Tema mixto. Kimi trabaja bien con documentos largos y planes de estudio generales.";
  }

  return { resumen, topics, repasos, tests, ejercicios, resumenes, ia, iaRazon };
}

function generateReview(topic, fullText) {
  const lower = fullText.toLowerCase();
  const idx = lower.indexOf(topic.toLowerCase().substring(0, 20));
  let context = "";
  if (idx !== -1) context = fullText.substring(Math.max(0, idx - 100), Math.min(fullText.length, idx + 600));

  const pts = context.split(/[\.!\n]+/).filter(l => l.trim().length > 15).slice(0, 5).map(l => l.trim());
  if (pts.length === 0) {
    pts.push(
      `Definición y conceptos fundamentales.`,
      `Aplicación práctica y ejemplos.`,
      `Relación con otros temas del plan.`,
      `Preguntas frecuentes de examen.`
    );
  }

  let review = `Repaso: ${topic}\n\n`;
  review += pts.map((p, i) => `${i + 1}. ${p.charAt(0).toUpperCase() + p.slice(1)}.`).join("\n");
  review += `\n\nPuntos clave para el examen:\n`;
  review += `- Domina la definición y diferencia con conceptos similares.\n`;
  review += `- Practica al menos 3 ejercicios de cada tipo.\n`;
  review += `- Revisa ejercicios de parciales anteriores.`;
  return review;
}

function generateQuestions(topic, fullText, scores) {
  const lower = fullText.toLowerCase();
  const idx = lower.indexOf(topic.toLowerCase().substring(0, 20));
  let context = "";
  if (idx !== -1) context = fullText.substring(Math.max(0, idx - 200), Math.min(fullText.length, idx + 800));

  const sentences = context.split(/[\.!\n]+/).map(s => s.trim()).filter(s => s.length > 15);
  const questions = [];

  // Generar 3-5 preguntas por tema
  const numQ = Math.min(5, Math.max(3, sentences.length));

  for (let i = 0; i < numQ; i++) {
    const base = sentences[i % sentences.length] || topic;
    const words = base.split(/\s+/).filter(w => w.length > 4);

    if (scores.math > scores.prog && scores.math > scores.redaccion) {
      // Preguntas matemáticas
      const correct = base.substring(0, 120);
      const wrong1 = words.slice(0, 5).join(" ") + " " + words.slice(-3).join(" ");
      const wrong2 = "Definición de " + topic + " en un contexto diferente";
      const wrong3 = words.slice(2, 7).join(" ");
      questions.push({
        pregunta: `¿Cuál de las siguientes afirmaciones sobre "${topic}" es correcta?`,
        opciones: [correct, wrong1, wrong2, wrong3].sort(() => Math.random() - 0.5),
        respuesta: 0,
        explicacion: `La respuesta correcta se refiere directamente a: "${correct.substring(0, 80)}..."`,
      });
    } else if (scores.prog > scores.redaccion) {
      const correct = `Implementar ${topic} requiere considerar: ${base.substring(0, 100)}`;
      const wrong1 = `${topic} solo se usa en bases de datos`;
      const wrong2 = `No existe implementación de ${topic}`;
      const wrong3 = `${topic} es exclusivo de lenguajes orientados a objetos`;
      questions.push({
        pregunta: `Sobre la implementación de "${topic}", ¿cuál es correcta?`,
        opciones: [correct, wrong1, wrong2, wrong3].sort(() => Math.random() - 0.5),
        respuesta: 0,
        explicacion: correct.substring(0, 120),
      });
    } else {
      const correct = base.substring(0, 120);
      const wrong1 = `${topic} no tiene relación con el contenido principal`;
      const wrong2 = `El concepto es opuesto a lo descrito`;
      const wrong3 = `Solo aplica en contextos no académicos`;
      questions.push({
        pregunta: `¿Qué describe correctamente "${topic}"?`,
        opciones: [correct, wrong1, wrong2, wrong3].sort(() => Math.random() - 0.5),
        respuesta: 0,
        explicacion: `La descripción correcta es: "${correct.substring(0, 80)}..."`,
      });
    }
  }
  return questions;
}

function generateExercise(topic, fullText, scores) {
  const lower = fullText.toLowerCase();
  const idx = lower.indexOf(topic.toLowerCase().substring(0, 20));
  let context = "";
  if (idx !== -1) context = fullText.substring(Math.max(0, idx - 100), Math.min(fullText.length, idx + 600));

  const lines = context.split(/[\.!\n]+/).filter(l => l.trim().length > 15);

  if (scores.math > scores.prog && scores.math > scores.redaccion) {
    return {
      enunciado: `Demuestre o resuelva un problema relacionado con "${topic}". Base teórica: ${lines[0]?.substring(0, 100) || topic}.`,
      solucion: `Paso 1: Identificar los datos del problema.\nPaso 2: Aplicar la definición/teorema de ${topic}.\nPaso 3: Desarrollar la solución paso a paso.\nPaso 4: Verificar el resultado.`,
    };
  } else if (scores.prog > scores.redaccion) {
    return {
      enunciado: `Implemente un programa/módulo que aplique "${topic}". Considere: ${lines[0]?.substring(0, 100) || topic}.`,
      solucion: `Paso 1: Definir la estructura de datos necesaria.\nPaso 2: Implementar la lógica de ${topic}.\nPaso 3: Probar con datos de ejemplo.\nPaso 4: Optimizar y documentar el código.`,
    };
  } else {
    return {
      enunciado: `Desarrolle un ensayo o análisis sobre "${topic}". Fundamente con: ${lines[0]?.substring(0, 100) || topic}.`,
      solucion: `Paso 1: Investigar las fuentes principales de ${topic}.\nPaso 2: Estructurar la introducción con la tesis.\nPaso 3: Desarrollar los argumentos con evidencias.\nPaso 4: Redactar la conclusión.`,
    };
  }
}

function generateSummary(topic, fullText) {
  const lower = fullText.toLowerCase();
  const idx = lower.indexOf(topic.toLowerCase().substring(0, 20));
  let context = "";
  if (idx !== -1) context = fullText.substring(Math.max(0, idx - 150), Math.min(fullText.length, idx + 500));

  const pts = context.split(/[\.!\n]+/).filter(l => l.trim().length > 15).slice(0, 6).map(l => l.trim());

  if (pts.length === 0) {
    return `Resumen de ${topic}: Concepto fundamental del plan de estudios que requiere atención especial para el examen. Revisar definiciones, aplicaciones y ejemplos prácticos.`;
  }

  let summary = `Resumen de ${topic}:\n\n`;
  summary += pts.map(p => `• ${p.charAt(0).toUpperCase() + p.slice(1)}.`).join("\n");
  summary += `\n\nConceptos clave: definición, aplicación práctica, relación con otros temas.`;
  return summary;
}

/* =========================================================
   EJECUCIÓN DEL ANÁLISIS
   ========================================================= */
async function runAnalysis() {
  const name = byId("analyzer-name").value.trim();
  if (!name || !analyzerFiles.length) return;

  const btn = byId("btn-analyze");
  btn.disabled = true;
  btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Analizando...`;

  try {
    let fullText = "";
    for (let i = 0; i < analyzerFiles.length; i++) {
      setProgress((i / analyzerFiles.length) * 60, `Leyendo PDF ${i + 1}/${analyzerFiles.length}: ${analyzerFiles[i].name}`);
      const text = await extractPdfText(analyzerFiles[i]);
      fullText += text + "\n\n";
    }

    if (!fullText.trim()) {
      toast("No se pudo extraer texto. Pueden ser imágenes escaneadas.", "error");
      return;
    }

    setProgress(70, "Analizando contenido...");
    await new Promise(r => setTimeout(r, 300));

    const result = analyzeText(fullText, name);

    setProgress(85, "Generando tests y ejercicios...");
    await new Promise(r => setTimeout(r, 300));

    let subject = userSubjects.find(s => s.nombre.toLowerCase() === name.toLowerCase());
    if (!subject) {
      subject = { id: "u_" + Date.now(), nombre: name, descripcion: `Análisis de ${analyzerFiles.length} PDF(s)`, anno: "2", semestre: "" };
      userSubjects.push(subject);
    }

    Object.assign(subject, {
      resumen: result.resumen, temas: result.topics, repasos: result.repasos,
      tests: result.tests, ejercicios: result.ejercicios, resumenes: result.resumenes,
      ia: result.ia, iaRazon: result.iaRazon, pendienteAnalisis: false,
    });

    setProgress(95, "Guardando...");
    await new Promise(r => setTimeout(r, 200));

    saveLocal(); renderAll();
    setProgress(100, "Completado.");
    analyzerFiles = [];
    renderAnalyzerFileList();
    byId("analyzer-name").value = "";

    toast(`"${name}": ${result.topics.length} temas, ${result.tests.length} tests, ${result.ejercicios.length} ejercicios`);
    setTimeout(() => { byId("analyzer-progress").hidden = true; }, 2000);

    openDetail(subject.id);
  } catch (err) {
    toast("Error: " + err.message, "error");
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> Analizar asignatura`;
    btn.disabled = !analyzerFiles.length || !byId("analyzer-name").value.trim();
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
      toast("Cambios guardados");
    } else {
      const newId = "u_" + Date.now();
      userSubjects.push({ id: newId, ...data, resumen: "", temas: [], repasos: [], tests: [], ejercicios: [], resumenes: [], ia: null, iaRazon: "" });
      toast("Asignatura guardada");
    }
    saveLocal(); renderAll(); closeModals();
  });

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
        toast("Datos importados");
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
    panel: ["Panel", "Resumen de tu semestre"],
    asignaturas: ["Asignaturas", `${allSubjects().length} registradas · toca una tarjeta para ver el detalle`],
    backup: ["Respaldo", "Exporta o importa tus datos"],
  };
  byId("view-title").textContent = titles[v][0];
  byId("view-subtitle").textContent = titles[v][1];
}

init();
