const express = require('express');
const { getDB } = require('../db/connection');
const { all, get: dbGet } = require('../db/helpers');
const { answerQuestion } = require('../services/aiService');

const router = express.Router();

router.post('/ask', async (req, res) => {
  try {
    const db = await getDB();
    const { subject_id, question } = req.body;

    if (!subject_id || !question) {
      return res.status(400).json({ error: 'subject_id y question son requeridos' });
    }

    const subject = dbGet(db, 'SELECT * FROM subjects WHERE id = ?', [subject_id]);
    if (!subject) return res.status(404).json({ error: 'Asignatura no encontrada' });

    const keywords = question.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    let chunks = [];

    if (keywords.length > 0) {
      const conditions = keywords.map(() => 'LOWER(content) LIKE ?').join(' OR ');
      const params = keywords.map(k => `%${k}%`);
      chunks = all(db, `
        SELECT c.*, d.name as doc_name
        FROM chunks c
        JOIN documents d ON c.document_id = d.id
        WHERE d.subject_id = ? AND (${conditions})
        LIMIT 5
      `, [subject_id, ...params]);
    }

    if (chunks.length === 0) {
      chunks = all(db, `
        SELECT c.*, d.name as doc_name
        FROM chunks c
        JOIN documents d ON c.document_id = d.id
        WHERE d.subject_id = ?
        ORDER BY c.page_number
        LIMIT 5
      `, [subject_id]);
    }

    if (chunks.length === 0) {
      return res.json({
        answer: 'No hay materiales procesados en esta asignatura todavia. Sube un PDF y procesalo primero.',
        sources: []
      });
    }

    const answer = await answerQuestion(question, chunks, subject.name);
    const sources = chunks.map(c => ({
      document: c.doc_name,
      page: c.page_number,
      chunk_index: c.chunk_index
    }));

    res.json({ answer, sources });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
