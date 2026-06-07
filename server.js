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

// Slack 기한 경고 (6시간마다)
const { notifyDeadlineWarning } = require('./src/src/services/slack');
const { pool: dbPool } = require('./src/src/database');
async function checkDeadlines() {
  try {
    const result = await dbPool.query('SELECT * FROM projects');
    const SD = {loi:7,rfq:14,feasibility:10,spec_nego:7,spec_freeze:5,po_receipt:7,bom:14,manufacturing:30,burnin:14,qc_fat:7,shipping_readiness:5,delivery_acceptance:3,commissioning:14,stabilization:30,project_closeout:7};
    const today = new Date();
    for (const row of result.rows) {
      const entered = new Date(row.stage_entered_at);
      const totalDays = SD[row.stage] || 14;
      const elapsed = Math.floor((today - entered) / 86400000);
      const third = Math.floor(totalDays / 3);
      const daysLeft = totalDays - elapsed;
      const meta = row.meta ? (typeof row.meta === 'string' ? JSON.parse(row.meta) : row.meta) : {};
      const la = meta._lastDeadlineAlert || 0;
      let fraction = null;
      if (elapsed >= totalDays && la < 3) fraction = '3/3';
      else if (elapsed >= third * 2 && la < 2) fraction = '2/3';
      else if (elapsed >= third && la < 1) fraction = '1/3';
      if (fraction) {
        const an = fraction==='1/3'?1:fraction==='2/3'?2:3;
        await notifyDeadlineWarning({name:row.name,customer:row.customer,owner:row.owner},row.stage,Math.max(0,daysLeft),totalDays,fraction).catch(()=>{});
        await dbPool.query("UPDATE projects SET meta=COALESCE(meta,'{}')::jsonb||$1::jsonb WHERE id=$2",[JSON.stringify({_lastDeadlineAlert:an}),row.id]).catch(()=>{});
      }
    }
  } catch(err){console.error('Deadline check:',err.message);}
}

async function start() {
  try {
    await initDB();
    app.listen(PORT, () => {
      console.log(`✅ POMS Server v2.0 running on port ${PORT}`);
      setTimeout(checkDeadlines, 60000);
      setInterval(checkDeadlines, 6*60*60*1000);
    });
  } catch (err) {
    console.error('❌ 서버 시작 실패:', err);
    process.exit(1);
  }
}

start();
