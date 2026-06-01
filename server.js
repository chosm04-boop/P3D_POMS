require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDB } = require('./src/database');

const app = express();

// ── 미들웨어 ─────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── API 라우트 ────────────────────────────────────────
app.use('/api/projects', require('./src/routes/projects'));
app.use('/api/files',    require('./src/routes/files'));
app.use('/api/settings', require('./src/routes/settings'));

// ── 헬스체크 ─────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '2.0.0', time: new Date().toISOString() });
});

// ── 정적 파일 (프론트엔드) ────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── 서버 시작 ─────────────────────────────────────────
const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await initDB();
    app.listen(PORT, () => {
      console.log(`✅ POMS Server v2.0 running on port ${PORT}`);
      console.log(`   API: http://localhost:${PORT}/api`);
      console.log(`   App: http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('❌ 서버 시작 실패:', err);
    process.exit(1);
  }
}

start();
