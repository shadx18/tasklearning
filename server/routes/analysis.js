const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDB, saveDB } = require('../db/connection');
const { all, get: dbGet, run } = require('../db/helpers');
const { processDocument } = require('../services/documentProcessor');

const router = express.Router();

router.post('/process/:docId', async (req, res) => {
  try {
    const db = await getDB();
    const doc = dbGet(db, 'SELECT * FROM documents WHERE id = ?', [req.params.docId]);
    if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });

    if (doc.status === 'PROCESSING') {
      return res.status(409).json({ error: 'Ya se esta procesando' });
    }

    run(db, 'UPDATE documents SET status = ? WHERE id = ?', ['PROCESSING', doc.id]);

    const jobId = uuidv4();
    run(db, 'INSERT INTO ai_jobs (id, subject_id, document_id, type, status, started_at) VALUES (?, ?, ?, ?, ?, datetime("now"))',
      [jobId, doc.subject_id, doc.id, 'process_document', 'PROCESSING']);
    saveDB();

    res.json({ job_id: jobId, status: 'PROCESSING' });

    processDocument(doc.id, jobId).catch(err => {
      console.error('Error procesando documento:', err);
      getDB().then(db => {
        run(db, 'UPDATE documents SET status = ?, error_message = ? WHERE id = ?', ['FAILED', err.message, doc.id]);
        run(db, 'UPDATE ai_jobs SET status = ?, error_message = ?, completed_at = datetime("now") WHERE id = ?', ['FAILED', err.message, jobId]);
        saveDB();
      });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/status/:docId', async (req, res) => {
  try {
    const db = await getDB();
    const doc = dbGet(db, 'SELECT id, status, page_count, chunk_count, error_message, processed_at FROM documents WHERE id = ?', [req.params.docId]);
    if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });

    const job = dbGet(db, 'SELECT * FROM ai_jobs WHERE document_id = ? ORDER BY created_at DESC LIMIT 1', [doc.id]);

    res.json({ document: doc, job: job || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/units/:subjectId', async (req, res) => {
  try {
    const db = await getDB();
    const units = all(db, 'SELECT * FROM units WHERE subject_id = ? ORDER BY sort_order', [req.params.subjectId]);
    for (const unit of units) {
      unit.topics = all(db, 'SELECT * FROM topics WHERE unit_id = ? ORDER BY sort_order', [unit.id]);
    }
    res.json(units);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/topics/:unitId', async (req, res) => {
  try {
    const db = await getDB();
    const topics = all(db, 'SELECT * FROM topics WHERE unit_id = ? ORDER BY sort_order', [req.params.unitId]);
    res.json(topics);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
