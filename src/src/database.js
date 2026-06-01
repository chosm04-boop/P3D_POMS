const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        customer TEXT,
        sales_person TEXT,
        stage TEXT DEFAULT 'loi',
        stage_entered_at DATE DEFAULT CURRENT_DATE,
        po_number TEXT,
        deadline DATE,
        units JSONB DEFAULT '[]',
        pay_schedule JSONB DEFAULT '[]',
        assignments JSONB DEFAULT '{}',
        docs_status JSONB DEFAULT '{}',
        notes JSONB DEFAULT '[]',
        history JSONB DEFAULT '[]',
        crs JSONB DEFAULT '[]',
        ai_reviews JSONB DEFAULT '{}',
        draft JSONB DEFAULT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
        stage TEXT NOT NULL,
        doc_id TEXT NOT NULL,
        original_name TEXT,
        file_path TEXT,
        file_type TEXT,
        file_size INTEGER,
        extracted_text TEXT,
        ai_analysis JSONB DEFAULT NULL,
        uploaded_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS members (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        dept TEXT,
        role TEXT,
        is_admin BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS departments (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        color TEXT DEFAULT '#4d9fff',
        en TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS alert_config (
        stage_id TEXT PRIMARY KEY,
        days INTEGER DEFAULT 30
      );

      CREATE INDEX IF NOT EXISTS idx_files_project ON files(project_id);
      CREATE INDEX IF NOT EXISTS idx_files_stage ON files(project_id, stage);
    `);

    // 기본 부서 데이터 삽입
    await client.query(`
      INSERT INTO departments (id, label, color, en) VALUES
        ('sales',    '영업',   '#a78bfa', 'Sales'),
        ('dev',      '개발',   '#4d9fff', 'R&D'),
        ('mfg',      '생산',   '#7ec8e3', 'Manufacturing'),
        ('qa',       '품질',   '#ffb800', 'QC/QA'),
        ('purchase', '구매',   '#9d7fff', 'Procurement'),
        ('service',  '서비스', '#00e699', 'Field Service')
      ON CONFLICT (id) DO NOTHING;
    `);

    console.log('✅ DB 초기화 완료');
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };
