require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// src 폴더 경로 자동 감지
const srcPath = fs.existsSync(path.join(__dirname, 'src/database.js'))
  ? path.join(__dirname, 'src')
  : path.join(__dirname, 'src/src');

const { initDB } = require(path.join(srcPath, 'database'));
app.use('/api/projects', require(path.join(srcPath, 'routes/projects')));
app.use('/api/files',    require(path.join(srcPath, 'routes/files')));
app.use('/api/settings', require(path.join(srcPath, 'routes/settings')));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '2.0.0', time: new Date().toISOString() });
});

// index.html 경로 자동 감지
const indexPath = fs.existsSync(path.join(__dirname, 'public/index.html'))
  ? path.join(__dirname, 'public/index.html')
  : path.join(__dirname, 'index.html');

app.use(express.static(path.dirname(indexPath)));
app.get('*', (req, res) => res.sendFile(indexPath));

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await initDB();
    app.listen(PORT, () => {
      console.log(`✅ POMS Server v2.0 running on port ${PORT}`);
    });
  } catch (err) {
    console.error('❌ 서버 시작 실패:', err);
    process.exit(1);
  }
}

start();
