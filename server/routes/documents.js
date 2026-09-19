const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { getDB, saveDB } = require('../db/connection');
const { all, get: dbGet, run } = require('../db/helpers');

const router = express.Router();

const uploadDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`)
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Solo se aceptan archivos PDF'));
  }
});

router.post('/', upload.array('files', 10), async (req, res) => {
  try {
    const db = await getDB();
    const { subject_id } = req.body;

    if (!subject_id) return res.status(400).json({ error: 'subject_id es requerido' });

    const subject = dbGet(db, 'SELECT * FROM subjects WHERE id = ?', [subject_id]);
    if (!subject) return res.status(404).json({ error: 'Asignatura no encontrada' });

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No se subieron archivos' });
    }

    const docs = [];
    for (const file of req.files) {
      const docId = uuidv4();
      const jobId = uuidv4();
      run(db, 'INSERT INTO documents (id, subject_id, name, type, file_path, status) VALUES (?, ?, ?, ?, ?, ?)',
        [docId, subject_id, file.originalname, 'otro', file.filename, 'PENDING']);
      run(db, 'INSERT INTO ai_jobs (id, subject_id, document_id, type, status) VALUES (?, ?, ?, ?, ?)',
        [jobId, subject_id, docId, 'process_document', 'PENDING']);
      docs.push({ id: docId, name: file.originalname, status: 'PENDING', job_id: jobId });
    }

    saveDB();
    res.status(201).json({ documents: docs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const db = await getDB();
    const { subject_id } = req.query;
    let docs;
    if (subject_id) {
      docs = all(db, 'SELECT * FROM documents WHERE subject_id = ? ORDER BY created_at DESC', [subject_id]);
    } else {
      docs = all(db, 'SELECT * FROM documents ORDER BY created_at DESC');
    }
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const db = await getDB();
    const doc = dbGet(db, 'SELECT * FROM documents WHERE id = ?', [req.params.id]);
    if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });

    doc.chunks = all(db, 'SELECT * FROM chunks WHERE document_id = ? ORDER BY page_number, chunk_index', [doc.id]);
    doc.jobs = all(db, 'SELECT * FROM ai_jobs WHERE document_id = ? ORDER BY created_at', [doc.id]);

    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const db = await getDB();
    const doc = dbGet(db, 'SELECT * FROM documents WHERE id = ?', [req.params.id]);
    if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });

    /* Bug fix #3: Eliminar chunks asociados */
    run(db, 'DELETE FROM chunks WHERE document_id = ?', [req.params.id]);

    /* Eliminar archivo del disco */
    const filePath = path.join(uploadDir, doc.file_path);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    run(db, 'DELETE FROM documents WHERE id = ?', [req.params.id]);
    saveDB();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
