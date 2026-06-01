const { pool } = require('../database');

// 관리자 확인 미들웨어
async function requireAdmin(req, res, next) {
  const memberName = req.headers['x-member-name'];
  if (!memberName) {
    return res.status(401).json({ error: '로그인이 필요합니다.' });
  }
  try {
    const result = await pool.query(
      'SELECT * FROM members WHERE name = $1 AND is_admin = TRUE',
      [memberName]
    );
    if (result.rows.length === 0) {
      return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
    }
    req.admin = result.rows[0];
    next();
  } catch (err) {
    res.status(500).json({ error: '권한 확인 오류' });
  }
}

module.exports = { requireAdmin };
