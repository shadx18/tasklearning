const OpenAI = require('openai');

let client = null;
let ollamaAvailable = null;

async function checkOllama() {
  if (ollamaAvailable !== null) return ollamaAvailable;
  try {
    const res = await fetch((process.env.AI_BASE_URL || 'http://localhost:11434/v1') + '/models', {
      signal: AbortSignal.timeout(3000)
    });
    ollamaAvailable = res.ok;
  } catch {
    ollamaAvailable = false;
  }
  console.log('[AI] Ollama disponible:', ollamaAvailable);
  return ollamaAvailable;
}

function getClient() {
  if (!client) {
    client = new OpenAI({
      baseURL: process.env.AI_BASE_URL || 'http://localhost:11434/v1',
      apiKey: process.env.AI_API_KEY || 'ollama'
    });
  }
  return client;
}

async function callLLM(systemPrompt, userPrompt, maxTokens = 4000) {
  const ai = getClient();
  const model = process.env.AI_MODEL || 'llama3.2:3b';
  const response = await ai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    max_tokens: maxTokens,
    temperature: 0.3
  });
  return response.choices[0].message.content;
}

function parseJSON(text) {
  const match = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[1] || match[0]); } catch { return null; }
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function extractTopicsFromText(fullText) {
  const lines = fullText.split(/\n+/).map(l => l.trim()).filter(l => l.length > 3);
  const topics = [];
  const seen = new Set();
  const addTopic = (t) => {
    const clean = t.replace(/\s+/g, ' ').trim();
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
  ];
  const structPatterns = [
    /^(tema|capitulo|unidad|modulo|seccion|parte|clase|practica|taller|laboratorio)\s+\d+[\.\:\-]?\s*(.+)/i,
    /^(tema|capitulo|unidad|modulo|seccion)\s*[\:\-]\s*(.+)/i,
  ];
  lines.forEach((line) => {
    for (const pat of numPatterns) {
      const m = line.match(pat);
      if (m) { addTopic(m[2] || m[1]); break; }
    }
    for (const pat of structPatterns) {
      const m = line.match(pat);
      if (m) { addTopic(m[2] || m[0]); break; }
    }
  });
  if (topics.length < 4) {
    const sentences = fullText.split(/[\.!?]+/).map(s => s.trim()).filter(s => s.length > 25 && s.length < 180);
    const kw = ['tema','capitulo','unidad','modulo','seccion','concepto','definicion','importante','fundamental'];
    sentences.forEach(s => {
      if (topics.length >= 15) return;
      if (kw.some(k => s.toLowerCase().includes(k))) addTopic(s.split(':').pop().trim().substring(0, 90));
    });
  }
  if (topics.length < 4) {
    const sentences = fullText.split(/[\.!?]+/).map(s => s.trim()).filter(s => s.length > 20 && s.length < 150);
    [...new Set(sentences)].slice(0, 10).forEach(s => addTopic(s));
  }
  return topics.slice(0, 20);
}

function extractContext(fullText, topic) {
  const lower = fullText.toLowerCase();
  const idx = lower.indexOf(topic.toLowerCase().substring(0, 25));
  if (idx !== -1) return fullText.substring(Math.max(0, idx - 200), Math.min(fullText.length, idx + 800));
  return fullText.substring(0, 1000);
}

function generateQuestionsLocal(topic, context) {
  const sentences = context.split(/[\.!\n]+/).map(s => s.trim()).filter(s => s.length > 20);
  const questions = [];
  const numQ = Math.min(5, Math.max(3, sentences.length));
  for (let i = 0; i < numQ; i++) {
    const base = sentences[i % sentences.length] || topic;
    const words = base.split(/\s+/).filter(w => w.length > 4);
    const correct = base.substring(0, 130);
    const wrong1 = words.slice(0, 4).join(' ') + ' ' + words.slice(-2).join(' ');
    const wrong2 = 'La definicion de ' + topic + ' en otro contexto';
    const wrong3 = words.slice(2, 6).join(' ');
    if (i % 3 === 1) {
      const tfOpts = shuffleArray(['Verdadero', 'Falso']);
      questions.push({ type: 'true_false', question_text: 'Es correcto que: ' + correct.substring(0, 100), options: tfOpts, correct_answer: 'Verdadero', explanation: 'Basado en el contenido del tema.' });
    } else {
      const opciones = shuffleArray([correct, wrong1, wrong2, wrong3]);
      questions.push({ type: 'multiple_choice', question_text: 'Sobre "' + topic + '", cual afirmacion es correcta?', options: opciones, correct_answer: correct, explanation: 'Respuesta basada en el texto del documento.' });
    }
  }
  return questions;
}

function generateFlashcardsLocal(topic, context) {
  const sentences = context.split(/[\.!\n]+/).map(s => s.trim()).filter(s => s.length > 20 && s.length < 200);
  const cards = [];
  const count = Math.min(5, Math.max(2, sentences.length));
  for (let i = 0; i < count; i++) {
    const s = sentences[i % sentences.length];
    cards.push({ front: topic + ' (punto ' + (i + 1) + ')', back: s.charAt(0).toUpperCase() + s.slice(1), difficulty: Math.min(3, i + 1) });
  }
  return cards;
}

function generateExerciseLocal(topic, context) {
  const sentences = context.split(/[\.!\n]+/).filter(l => l.trim().length > 15);
  const ref = (sentences[0] || topic).substring(0, 120);
  return { statement: 'Analiza y desarrolla un ejercicio sobre "' + topic + '". Base: ' + ref, solution: 'Paso 1: Identificar datos y condiciones.\nPaso 2: Aplicar definiciones relevantes.\nPaso 3: Desarrollar solucion paso a paso.\nPaso 4: Verificar resultado.', type: 'practical' };
}

function generateReviewLocal(topic, context) {
  const sentences = context.split(/[\.!\n]+/).map(s => s.trim()).filter(s => s.length > 15);
  const points = sentences.slice(0, 5).map((s, i) => (i + 1) + '. ' + s.charAt(0).toUpperCase() + s.slice(1) + '.');
  return { content: 'Repaso: ' + topic + '\n\n' + points.join('\n') + '\n\nPuntos clave: domina definiciones, practica ejemplos.', study_tips: 'Crea mapa conceptual. Practica ejercicios. Repasa definiciones.' };
}

function analyzeLocally(fullText, docName) {
  console.log('[Local] Analizando:', fullText.length, 'chars');
  const topics = extractTopicsFromText(fullText);
  console.log('[Local] Temas:', topics.length);
  const units = [];
  const topicsPerUnit = Math.max(1, Math.ceil(topics.length / 3));
  for (let u = 0; u < Math.ceil(topics.length / topicsPerUnit); u++) {
    const unitTopics = topics.slice(u * topicsPerUnit, (u + 1) * topicsPerUnit);
    if (unitTopics.length === 0) continue;
    const topicObjects = unitTopics.map(t => {
      const ctx = extractContext(fullText, t);
      return {
        name: t, description: 'Tema del documento', summary: ctx.split(/[\.!\n]+/).filter(s => s.length > 20).slice(0, 3).join('. ').substring(0, 300) || 'Contenido del tema ' + t,
        objectives: ['Comprender ' + t], concepts: [],
        questions: generateQuestionsLocal(t, ctx), flashcards: generateFlashcardsLocal(t, ctx),
        exercises: [generateExerciseLocal(t, ctx)], reviews: [generateReviewLocal(t, ctx)]
      };
    });
    units.push({ name: 'Unidad ' + (u + 1), description: unitTopics.length + ' tema(s)', topics: topicObjects });
  }
  if (units.length === 0) {
    units.push({ name: 'Contenido General', description: 'Automatico', topics: [{ name: docName, description: 'Documento', summary: fullText.substring(0, 300), objectives: ['Comprender'], concepts: [], questions: generateQuestionsLocal(docName, fullText.substring(0, 1000)), flashcards: generateFlashcardsLocal(docName, fullText.substring(0, 1000)), exercises: [generateExerciseLocal(docName, fullText.substring(0, 1000))], reviews: [generateReviewLocal(docName, fullText.substring(0, 1000))] }] });
  }
  return { units };
}

const ANALYSIS_SYSTEM_PROMPT = 'Eres un analista academico experto. Analiza el contenido educativo y extrae una estructura organizada.\nResponde UNICAMENTE con JSON valido (sin markdown) con esta estructura:\n{"units":[{"name":"Unidad","description":"Desc","topics":[{"name":"Tema","description":"Desc","summary":"Resumen","objectives":["obj"],"concepts":[{"name":"Concepto","definition":"Def"}],"questions":[{"type":"multiple_choice","question_text":"Pregunta?","options":["A","B","C","D"],"correct_answer":"A","explicacion":"Por que"}],"flashcards":[{"front":"Pregunta","back":"Respuesta","difficulty":1}],"exercises":[{"statement":"Enunciado","solution":"Solucion","type":"practical"}],"reviews":[{"content":"Repaso","study_tips":"Tips"}]}]}]}\nGenera al menos 3 preguntas, 3 flashcards, 1 ejercicio y 1 repaso por tema.\nDificultad flashcards: 1-5.';

async function analyzeWithAI(chunks, docName) {
  const MAX_CHARS = 12000;
  const batches = [];
  let current = '';
  for (const chunk of chunks) {
    const sep = current ? '\n\n' : '';
    if ((current + sep + chunk.content).length > MAX_CHARS && current) { batches.push(current); current = chunk.content; }
    else { current = current ? current + sep + chunk.content : chunk.content; }
  }
  if (current) batches.push(current);
  const allUnits = [];
  if (batches.length === 1) {
    const r = await callLLM(ANALYSIS_SYSTEM_PROMPT, 'Analiza "' + docName + '":\n\n' + batches[0], 8000);
    const p = parseJSON(r);
    if (p && p.units) return p;
  } else {
    for (let i = 0; i < batches.length; i++) {
      try {
        const r = await callLLM(ANALYSIS_SYSTEM_PROMPT, 'Parte ' + (i+1) + '/' + batches.length + ' de "' + docName + '":\n\n' + batches[i], 8000);
        const p = parseJSON(r);
        if (p && p.units) allUnits.push(...p.units);
      } catch (e) { console.error('[AI] Error tanda', i+1, e.message); }
    }
    if (allUnits.length > 0) return { units: allUnits };
  }
  throw new Error('No se pudo parsear respuesta IA');
}

async function analyzeDocument(chunks, docName) {
  const hasAI = await checkOllama();
  if (hasAI) {
    try { console.log('[AI] Usando Ollama...'); return await analyzeWithAI(chunks, docName); }
    catch (e) { console.warn('[AI] Ollama fallo, local:', e.message); }
  } else { console.log('[AI] Sin Ollama, analisis local'); }
  const fullText = chunks.map(c => c.content).join('\n\n');
  return analyzeLocally(fullText, docName);
}

async function answerQuestion(question, contextChunks, docName) {
  const hasAI = await checkOllama();
  const context = contextChunks.map((c, i) => '[Fuente ' + (i+1) + ': Pag ' + c.page_number + ']\n' + c.content).join('\n\n---\n\n');
  if (hasAI) {
    try {
      return await callLLM('Eres un tutor academico. Responde usando SOLO el contexto. Indica fuentes.', 'Materiales de "' + docName + '":\n' + context + '\nPregunta: ' + question, 2000);
    } catch (e) { console.warn('[AI] Tutor fallback:', e.message); }
  }
  return 'Respuesta basada en "' + docName + '":\n\n' + contextChunks.map((c, i) => '[Fuente ' + (i+1) + ', Pag ' + c.page_number + ']: ' + c.content.substring(0, 200)).join('\n\n') + '\n\n(Analisis local - para IA completa, instala Ollama)';
}

module.exports = { getClient, callLLM, analyzeDocument, answerQuestion };
