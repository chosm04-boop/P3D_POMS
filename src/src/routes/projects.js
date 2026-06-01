const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const { v4: uuidv4 } = require('uuid');
const { requireAdmin } = require('../middleware/auth');

// 전체 프로젝트 조회
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM projects ORDER BY updated_at DESC'
    );
    res.json(result.rows.map(dbToProject));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 단일 프로젝트 조회
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM projects WHERE id = $1', [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: '프로젝트 없음' });
    res.json(dbToProject(result.rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 프로젝트 생성
router.post('/', async (req, res) => {
  try {
    const p = req.body;
    const id = p.id || uuidv4();
    const today = new Date().toISOString().slice(0, 10);
    await pool.query(`
      INSERT INTO projects
        (id, name, customer, sales_person, stage, stage_entered_at,
         po_number, deadline, units, pay_schedule, assignments,
         docs_status, notes, history, crs, ai_reviews, draft)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
    `, [
      id, p.name, p.customer || '', p.salesPerson || '',
      p.stage || 'loi', p.stageEnteredAt || today,
      p.poNumber || '', p.deadline || null,
      JSON.stringify(p.units || []),
      JSON.stringify(p.paySchedule || []),
      JSON.stringify(p.assignments || {}),
      JSON.stringify(p.docs || {}),
      JSON.stringify(p.notes || []),
      JSON.stringify(p.history || []),
      JSON.stringify(p.crs || []),
      JSON.stringify(p.aiReviews || {}),
      JSON.stringify(p.draft || null),
    ]);
    const created = await pool.query('SELECT * FROM projects WHERE id = $1', [id]);
    res.status(201).json(dbToProject(created.rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 프로젝트 수정
router.put('/:id', async (req, res) => {
  try {
    const p = req.body;
    const existing = await pool.query('SELECT * FROM projects WHERE id = $1', [req.params.id]);
    if (!existing.rows[0]) return res.status(404).json({ error: '프로젝트 없음' });

    const old = dbToProject(existing.rows[0]);
    const stageChanged = p.stage && p.stage !== old.stage;
    const today = new Date().toISOString().slice(0, 10);

    // 단계 변경 이력 추가
    let history = old.history || [];
    if (stageChanged) {
      history = [...history, {
        date: new Date().toLocaleString('ko-KR'),
        from: old.stage,
        to: p.stage,
        note: p._note || '',
        changedBy: req.headers['x-member-name'] || '',
      }];
    }

    await pool.query(`
      UPDATE projects SET
        name = $1, customer = $2, sales_person = $3,
        stage = $4, stage_entered_at = $5,
        po_number = $6, deadline = $7,
        units = $8, pay_schedule = $9, assignments = $10,
        docs_status = $11, notes = $12, history = $13,
        crs = $14, ai_reviews = $15, draft = $16,
        updated_at = NOW()
      WHERE id = $17
    `, [
      p.name ?? old.name,
      p.customer ?? old.customer,
      p.salesPerson ?? old.salesPerson,
      p.stage ?? old.stage,
      stageChanged ? today : old.stageEnteredAt,
      p.poNumber ?? old.poNumber,
      p.deadline ?? old.deadline,
      JSON.stringify(p.units ?? old.units),
      JSON.stringify(p.paySchedule ?? old.paySchedule),
      JSON.stringify(p.assignments ?? old.assignments),
      JSON.stringify(p.docs ?? old.docs),
      JSON.stringify(p.notes ?? old.notes),
      JSON.stringify(history),
      JSON.stringify(p.crs ?? old.crs),
      JSON.stringify(p.aiReviews ?? old.aiReviews),
      JSON.stringify(p.draft ?? old.draft),
      req.params.id,
    ]);

    const updated = await pool.query('SELECT * FROM projects WHERE id = $1', [req.params.id]);
    res.json(dbToProject(updated.rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 관리자 전용 — 강제 단계 이동
router.post('/:id/force-move', requireAdmin, async (req, res) => {
  try {
    const { stage, reason } = req.body;
    const existing = await pool.query('SELECT * FROM projects WHERE id = $1', [req.params.id]);
    if (!existing.rows[0]) return res.status(404).json({ error: '프로젝트 없음' });

    const old = dbToProject(existing.rows[0]);
    const today = new Date().toISOString().slice(0, 10);
    const history = [...(old.history || []), {
      date: new Date().toLocaleString('ko-KR'),
      from: old.stage,
      to: stage,
      note: `[관리자 강제 이동] ${reason || ''}`,
      changedBy: req.admin.name,
      isForced: true,
    }];

    await pool.query(
      'UPDATE projects SET stage=$1, stage_entered_at=$2, history=$3, updated_at=NOW() WHERE id=$4',
      [stage, today, JSON.stringify(history), req.params.id]
    );

    const updated = await pool.query('SELECT * FROM projects WHERE id = $1', [req.params.id]);
    res.json(dbToProject(updated.rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 임시저장
router.post('/:id/draft', async (req, res) => {
  try {
    await pool.query(
      'UPDATE projects SET draft=$1, updated_at=NOW() WHERE id=$2',
      [JSON.stringify(req.body), req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 프로젝트 삭제
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM projects WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DB row → 프론트 객체 변환
function dbToProject(row) {
  return {
    id: row.id,
    name: row.name,
    customer: row.customer,
    salesPerson: row.sales_person,
    stage: row.stage,
    stageEnteredAt: row.stage_entered_at,
    poNumber: row.po_number,
    deadline: row.deadline,
    units: row.units || [],
    paySchedule: row.pay_schedule || [],
    assignments: row.assignments || {},
    docs: row.docs_status || {},
    notes: row.notes || [],
    history: row.history || [],
    crs: row.crs || [],
    aiReviews: row.ai_reviews || {},
    draft: row.draft,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = router;
