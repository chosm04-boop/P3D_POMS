const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const { v4: uuidv4 } = require('uuid');
const { requireAdmin } = require('../middleware/auth');

// ── 팀원 ──────────────────────────────────────────────
router.get('/members', async (req, res) => {
  const r = await pool.query('SELECT * FROM members ORDER BY name');
  res.json(r.rows);
});

router.post('/members', async (req, res) => {
  const { name, dept, role } = req.body;
  const r = await pool.query(
    'INSERT INTO members (id,name,dept,role) VALUES ($1,$2,$3,$4) RETURNING *',
    [uuidv4(), name, dept, role]
  );
  res.json(r.rows[0]);
});

// 관리자 지정 — 관리자만 가능
router.put('/members/:id/admin', requireAdmin, async (req, res) => {
  const r = await pool.query(
    'UPDATE members SET is_admin=$1 WHERE id=$2 RETURNING *',
    [req.body.isAdmin, req.params.id]
  );
  res.json(r.rows[0]);
});

router.delete('/members/:id', async (req, res) => {
  await pool.query('DELETE FROM members WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// ── 부서 ──────────────────────────────────────────────
router.get('/departments', async (req, res) => {
  const r = await pool.query('SELECT * FROM departments ORDER BY label');
  res.json(r.rows.map(d => ({ id: d.id, label: d.label, color: d.color, en: d.en })));
});

router.post('/departments', async (req, res) => {
  const { label, color, en } = req.body;
  const r = await pool.query(
    'INSERT INTO departments (id,label,color,en) VALUES ($1,$2,$3,$4) RETURNING *',
    [uuidv4(), label, color || '#4d9fff', en]
  );
  res.json(r.rows[0]);
});

router.put('/departments/:id', async (req, res) => {
  const { label, color, en } = req.body;
  const r = await pool.query(
    'UPDATE departments SET label=$1,color=$2,en=$3 WHERE id=$4 RETURNING *',
    [label, color, en, req.params.id]
  );
  res.json(r.rows[0]);
});

router.delete('/departments/:id', async (req, res) => {
  await pool.query('DELETE FROM departments WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// ── 알람 설정 ─────────────────────────────────────────
router.get('/alerts', async (req, res) => {
  const r = await pool.query('SELECT * FROM alert_config');
  const cfg = {};
  r.rows.forEach(row => { cfg[row.stage_id] = row.days; });
  res.json(cfg);
});

router.put('/alerts', async (req, res) => {
  const updates = req.body; // { stage_id: days, ... }
  for (const [stageId, days] of Object.entries(updates)) {
    await pool.query(
      'INSERT INTO alert_config(stage_id,days) VALUES($1,$2) ON CONFLICT(stage_id) DO UPDATE SET days=$2',
      [stageId, days]
    );
  }
  res.json({ ok: true });
});

module.exports = router;
