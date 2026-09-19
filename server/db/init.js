const { getDB, saveDB } = require('./connection');

async function initDB() {
  const db = await getDB();

  db.exec(`
    CREATE TABLE IF NOT EXISTS subjects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      subject_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT DEFAULT 'otro',
      file_path TEXT NOT NULL,
      status TEXT DEFAULT 'PENDING',
      page_count INTEGER DEFAULT 0,
      chunk_count INTEGER DEFAULT 0,
      error_message TEXT,
      processed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      metadata TEXT DEFAULT '{}',
      FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      page_number INTEGER NOT NULL,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      token_count INTEGER DEFAULT 0,
      metadata TEXT DEFAULT '{}',
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS units (
      id TEXT PRIMARY KEY,
      subject_id TEXT NOT NULL,
      document_id TEXT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS topics (
      id TEXT PRIMARY KEY,
      unit_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      content_summary TEXT DEFAULT '',
      objectives TEXT DEFAULT '[]',
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS concepts (
      id TEXT PRIMARY KEY,
      topic_id TEXT NOT NULL,
      name TEXT NOT NULL,
      definition TEXT DEFAULT '',
      relationships TEXT DEFAULT '{}',
      source_refs TEXT DEFAULT '[]',
      FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS summaries (
      id TEXT PRIMARY KEY,
      topic_id TEXT NOT NULL,
      content TEXT NOT NULL,
      source_refs TEXT DEFAULT '[]',
      generated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      topic_id TEXT NOT NULL,
      type TEXT DEFAULT 'multiple_choice',
      question_text TEXT NOT NULL,
      options TEXT DEFAULT '[]',
      correct_answer TEXT NOT NULL,
      explanation TEXT DEFAULT '',
      source_refs TEXT DEFAULT '[]',
      FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS flashcards (
      id TEXT PRIMARY KEY,
      topic_id TEXT NOT NULL,
      front TEXT NOT NULL,
      back TEXT NOT NULL,
      difficulty INTEGER DEFAULT 1,
      source_refs TEXT DEFAULT '[]',
      FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS exercises (
      id TEXT PRIMARY KEY,
      topic_id TEXT NOT NULL,
      statement TEXT NOT NULL,
      solution TEXT DEFAULT '',
      type TEXT DEFAULT 'practical',
      source_refs TEXT DEFAULT '[]',
      FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      topic_id TEXT NOT NULL,
      content TEXT NOT NULL,
      study_tips TEXT DEFAULT '',
      source_refs TEXT DEFAULT '[]',
      FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ai_jobs (
      id TEXT PRIMARY KEY,
      subject_id TEXT,
      document_id TEXT,
      type TEXT NOT NULL,
      status TEXT DEFAULT 'PENDING',
      input_data TEXT DEFAULT '{}',
      output_data TEXT DEFAULT '{}',
      error_message TEXT,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL
    );
  `);

  /* Migraciones: añadir columnas faltantes a tablas existentes */
  try {
    db.run("ALTER TABLE units ADD COLUMN document_id TEXT");
  } catch (e) { /* ya existe */ }

  saveDB();
  console.log('Base de datos inicializada:', require('path').join(__dirname, 'tasklearning.db'));
}

module.exports = { initDB };

// Si se ejecuta directamente
if (require.main === module) {
  initDB().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}
