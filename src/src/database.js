const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL 환경변수가 없습니다!');
  console.error('현재 환경변수:', JSON.stringify(Object.keys(process.env)));
  process.exit(1);
}

// DATABASE_URL을 개별 파라미터로 분해 (connectionString + SSL 충돌 방지)
const dbUrlClean = process.env.DATABASE_URL.replace(/[?&]sslmode=[^&]*/g, '');
const parsed = new URL(dbUrlClean);

const pool = new Pool({
  host: parsed.hostname,
  port: parsed.port ? Number(parsed.port) : 5432,
  user: decodeURIComponent(parsed.username),
  password: decodeURIComponent(parsed.password),
  database: parsed.pathname.slice(1),
  ssl: { rejectUnauthorized: false },
  keepAlive: true,
  connectionTimeoutMillis: 20000,
  idleTimeoutMillis: 30000,
  max: 3,
});

console.log('DB 연결 대상:', parsed.hostname, '포트:', parsed.port || 5432, 'DB:', parsed.pathname.slice(1));

pool.on('error', (err) => {
  console.error('Pool error (무시하고 계속):', err.message);
});

async function connectWithRetry(retries = 5) {
  for (let i = 0; i < retries; i++) {
    try {
      return await pool.connect();
    } catch (err) {
      console.log(`DB 연결 시도 ${i+1}/${retries} 실패: ${err.message}. 3초 후 재시도...`);
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

async function initDB() {
  const client = await connectWithRetry();
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
    `);
    await client.query(`
      INSERT INTO departments (id, label, color, en) VALUES
        ('sales','영업','#a78bfa','Sales'),
        ('dev','개발','#4d9fff','R&D'),
        ('mfg','생산','#7ec8e3','Manufacturing'),
        ('qa','품질','#ffb800','QC/QA'),
        ('purchase','구매','#9d7fff','Procurement'),
        ('service','서비스','#00e699','Field Service')
      ON CONFLICT (id) DO NOTHING;
    `);
    console.log('✅ DB 초기화 완료');
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };
