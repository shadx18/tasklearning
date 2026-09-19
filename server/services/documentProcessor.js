const fs = require('fs');
const path = require('path');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const { v4: uuidv4 } = require('uuid');
const { getDB, saveDB } = require('../db/connection');
const { all, get: dbGet, run } = require('../db/helpers');
const { analyzeDocument } = require('./aiService');

const uploadDir = path.join(__dirname, '..', '..', 'uploads');

function splitIntoChunks(text, pageCount) {
  const chunks = [];
  const words = text.split(/\s+/);
  const TARGET_TOKENS = 500;
  const TOKENS_PER_WORD = 1.3;
  const wordsPerChunk = Math.floor(TARGET_TOKENS / TOKENS_PER_WORD);
  let chunkIndex = 0;

  for (let i = 0; i < words.length; i += wordsPerChunk) {
    const chunkWords = words.slice(i, i + wordsPerChunk);
    const content = chunkWords.join(' ').trim();
    if (!content) continue;
    const tokens = Math.ceil(chunkWords.length * TOKENS_PER_WORD);
    const page = Math.min(Math.ceil((i / words.length) * pageCount), pageCount);
    chunks.push({ page, index: chunkIndex++, content, tokens });
  }
  return chunks;
}

async function extractPdfText(buffer) {
  const data = new Uint8Array(buffer);
  const doc = await pdfjsLib.getDocument({ data }).promise;
  let text = '';

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const items = content.items;
    let lastY = null;
    let lineText = '';

    for (const item of items) {
      const y = Math.round(item.transform ? item.transform[5] : 0);
      if (lastY !== null && Math.abs(y - lastY) > 5) {
        text += lineText.trim() + '\n';
        lineText = '';
      }
      lineText += (lineText && !lineText.endsWith(' ') ? ' ' : '') + item.str;
      lastY = y;
    }
    if (lineText.trim()) text += lineText.trim() + '\n';
  }

  return { text, numPages: doc.numPages };
}

async function processDocument(docId, jobId) {
  const db = await getDB();
  const doc = dbGet(db, 'SELECT * FROM documents WHERE id = ?', [docId]);
  if (!doc) throw new Error('Documento no encontrado');

  console.log('[Worker] Procesando:', doc.name);

  const filePath = path.join(uploadDir, doc.file_path);
  if (!fs.existsSync(filePath)) throw new Error('Archivo no encontrado en disco');

  const buffer = fs.readFileSync(filePath);
  console.log('[Worker] Buffer:', buffer.length, 'bytes');

  const pdfData = await extractPdfText(buffer);
  const pageCount = pdfData.numPages;
  const fullText = pdfData.text;
  console.log('[Worker] Extraido:', pageCount, 'paginas,', fullText.length, 'caracteres');

  if (!fullText.trim()) {
    throw new Error('No se pudo extraer texto del PDF (puede ser imagen escaneada)');
  }

  const chunks = splitIntoChunks(fullText, pageCount);
  console.log('[Worker] Generados:', chunks.length, 'chunks');

  for (const chunk of chunks) {
    run(db, 'INSERT INTO chunks (id, document_id, page_number, chunk_index, content, token_count) VALUES (?, ?, ?, ?, ?, ?)',
      [uuidv4(), docId, chunk.page, chunk.index, chunk.content, chunk.tokens]);
  }

  run(db, 'UPDATE documents SET page_count = ?, chunk_count = ?, status = ? WHERE id = ?',
    [pageCount, chunks.length, 'ANALYZING', docId]);
  saveDB();

  console.log('[Worker] Enviando a IA para analisis...');
  const analysis = await analyzeDocument(chunks, doc.name);

  /* Bug fix #1: Solo eliminar units de ESTE documento, no de toda la asignatura */
  const subjectId = doc.subject_id;
  const existingUnits = all(db, 'SELECT id FROM units WHERE subject_id = ? AND document_id = ?', [subjectId, docId]);
  for (const u of existingUnits) {
    run(db, 'DELETE FROM units WHERE id = ?', [u.id]);
  }

  let unitOrder = 0;
  for (const unit of analysis.units || []) {
    const unitId = uuidv4();
    run(db, 'INSERT INTO units (id, subject_id, document_id, name, description, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
      [unitId, subjectId, docId, unit.name, unit.description || '', unitOrder++]);

    let topicOrder = 0;
    for (const topic of unit.topics || []) {
      const topicId = uuidv4();
      run(db, 'INSERT INTO topics (id, unit_id, name, description, content_summary, objectives, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [topicId, unitId, topic.name, topic.description || '', topic.summary || '', JSON.stringify(topic.objectives || []), topicOrder++]);

      for (const c of topic.concepts || []) {
        run(db, 'INSERT INTO concepts (id, topic_id, name, definition, source_refs) VALUES (?, ?, ?, ?, ?)',
          [uuidv4(), topicId, c.name, c.definition || '', JSON.stringify(c.source_refs || [])]);
      }
      for (const s of topic.summaries || []) {
        run(db, 'INSERT INTO summaries (id, topic_id, content, source_refs) VALUES (?, ?, ?, ?)',
          [uuidv4(), topicId, s.content || '', JSON.stringify(s.source_refs || [])]);
      }
      for (const q of topic.questions || []) {
        run(db, 'INSERT INTO questions (id, topic_id, type, question_text, options, correct_answer, explanation, source_refs) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [uuidv4(), topicId, q.type || 'multiple_choice', q.question_text || '', JSON.stringify(q.options || []), q.correct_answer || '', q.explanation || '', JSON.stringify(q.source_refs || [])]);
      }
      for (const f of topic.flashcards || []) {
        run(db, 'INSERT INTO flashcards (id, topic_id, front, back, difficulty, source_refs) VALUES (?, ?, ?, ?, ?, ?)',
          [uuidv4(), topicId, f.front || '', f.back || '', f.difficulty || 1, JSON.stringify(f.source_refs || [])]);
      }
      for (const e of topic.exercises || []) {
        run(db, 'INSERT INTO exercises (id, topic_id, statement, solution, type, source_refs) VALUES (?, ?, ?, ?, ?, ?)',
          [uuidv4(), topicId, e.statement || '', e.solution || '', e.type || 'practical', JSON.stringify(e.source_refs || [])]);
      }
      for (const r of topic.reviews || []) {
        run(db, 'INSERT INTO reviews (id, topic_id, content, study_tips, source_refs) VALUES (?, ?, ?, ?, ?)',
          [uuidv4(), topicId, r.content || '', r.study_tips || '', JSON.stringify(r.source_refs || [])]);
      }
    }
  }

  run(db, 'UPDATE documents SET status = ?, processed_at = datetime("now") WHERE id = ?', ['COMPLETED', docId]);
  run(db, 'UPDATE ai_jobs SET status = ?, completed_at = datetime("now") WHERE id = ?', ['COMPLETED', jobId]);
  saveDB();
  console.log('[Worker] Completado:', doc.name);
}

module.exports = { processDocument };
