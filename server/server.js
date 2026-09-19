require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { getDB, closeDB } = require('./db/connection');
const { initDB } = require('./db/init');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos estaticos del frontend
app.use(express.static(path.join(__dirname, '..')));

// Servir uploads
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// API Routes
app.use('/api/subjects', require('./routes/subjects'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/analysis', require('./routes/analysis'));
app.use('/api/tutor', require('./routes/tutor'));

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const db = await getDB();
    const result = db.exec('SELECT 1 as ok');
    res.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ status: 'error', database: 'disconnected', error: err.message });
  }
});

// Fallback SPA
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
  }
});

// Manejo de errores
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Archivo demasiado grande (max 50MB)' });
  }
  if (err.message === 'Solo se aceptan archivos PDF') {
    return res.status(400).json({ error: err.message });
  }
  res.status(500).json({ error: 'Error interno del servidor' });
});

// Iniciar
async function start() {
  await initDB();
  const server = app.listen(PORT, () => {
    console.log(`TaskLearning API: http://localhost:${PORT}`);
    console.log(`Frontend: http://localhost:${PORT}/`);
    console.log(`Health: http://localhost:${PORT}/api/health`);
  });

  process.on('SIGINT', () => { closeDB(); server.close(() => process.exit(0)); });
  process.on('SIGTERM', () => { closeDB(); server.close(() => process.exit(0)); });
}

start().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
