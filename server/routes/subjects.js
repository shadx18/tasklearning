const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../db/connection');
const { all, get: dbGet, run } = require('../db/helpers');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const db = await getDB();
    const subjects = all(db, `
      SELECT s.*,
        (SELECT COUNT(*) FROM documents WHERE subject_id = s.id) as doc_count,
        (SELECT COUNT(*) FROM documents WHERE subject_id = s.id AND status = 'COMPLETED') as processed_docs
      FROM subjects s
      ORDER BY s.created_at DESC
    `);
    res.json(subjects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const db = await getDB();
    const { name, description } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'El nombre es requerido' });
    }
    const id = uuidv4();
    run(db, 'INSERT INTO subjects (id, name, description) VALUES (?, ?, ?)', [id, name.trim(), (description || '').trim()]);
    const { saveDB } = require('../db/connection');
    saveDB();
    const subject = dbGet(db, 'SELECT * FROM subjects WHERE id = ?', [id]);
    res.status(201).json(subject);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const db = await getDB();
    const subject = dbGet(db, 'SELECT * FROM subjects WHERE id = ?', [req.params.id]);
    if (!subject) return res.status(404).json({ error: 'Asignatura no encontrada' });

    subject.documents = all(db, 'SELECT * FROM documents WHERE subject_id = ? ORDER BY created_at', [subject.id]);
    subject.units = all(db, 'SELECT * FROM units WHERE subject_id = ? ORDER BY sort_order', [subject.id]);

    for (const unit of subject.units) {
      unit.topics = all(db, 'SELECT * FROM topics WHERE unit_id = ? ORDER BY sort_order', [unit.id]);
      for (const topic of unit.topics) {
        topic.concepts = all(db, 'SELECT * FROM concepts WHERE topic_id = ?', [topic.id]);
        topic.summaries = all(db, 'SELECT * FROM summaries WHERE topic_id = ?', [topic.id]);
        topic.questions = all(db, 'SELECT * FROM questions WHERE topic_id = ?', [topic.id]);
        topic.flashcards = all(db, 'SELECT * FROM flashcards WHERE topic_id = ?', [topic.id]);
        topic.exercises = all(db, 'SELECT * FROM exercises WHERE topic_id = ?', [topic.id]);
        topic.reviews = all(db, 'SELECT * FROM reviews WHERE topic_id = ?', [topic.id]);
      }
    }

    res.json(subject);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const db = await getDB();
    const existing = dbGet(db, 'SELECT * FROM subjects WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Asignatura no encontrada' });

    const { name, description } = req.body;
    run(db, 'UPDATE subjects SET name = ?, description = ?, updated_at = datetime("now") WHERE id = ?',
      [name || existing.name, description ?? existing.description, req.params.id]);
    const { saveDB } = require('../db/connection');
    saveDB();

    const updated = dbGet(db, 'SELECT * FROM subjects WHERE id = ?', [req.params.id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const db = await getDB();
    const existing = dbGet(db, 'SELECT * FROM subjects WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Asignatura no encontrada' });

    /* Bug fix #2: Eliminar archivos PDF del disco */
    const uploadDir = path.join(__dirname, '..', '..', 'uploads');
    const docs = all(db, 'SELECT file_path FROM documents WHERE subject_id = ?', [req.params.id]);
    for (const doc of docs) {
      const filePath = path.join(uploadDir, doc.file_path);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    run(db, 'DELETE FROM subjects WHERE id = ?', [req.params.id]);
    const { saveDB } = require('../db/connection');
    saveDB();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
