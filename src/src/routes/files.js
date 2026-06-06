const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../database');
const { extractText } = require('../services/fileParser');
const { analyzeFile } = require('../services/ai');

// 업로드 설정
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
          const dir = path.join(__dirname, '../../../uploads', req.params.projectId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.docx', '.doc', '.txt', '.jpg', '.jpeg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('지원하지 않는 파일 형식입니다.'));
  },
});

// 파일 업로드 + 텍스트 추출
router.post('/:projectId/upload', upload.single('file'), async (req, res) => {
  try {
    const { stage, docId } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ error: '파일이 없습니다.' });

    // 텍스트 추출
    const { text, pages, isImage } = await extractText(file.path, file.mimetype);

    const fileId = uuidv4();
    await pool.query(`
      INSERT INTO files
        (id, project_id, stage, doc_id, original_name, file_path,
         file_type, file_size, extracted_text)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    `, [
      fileId, req.params.projectId, stage, docId,
      Buffer.from(file.originalname, 'latin1').toString('utf8'), file.path, file.mimetype,
      file.size, text,
    ]);

    res.json({
      id: fileId,
      originalName: Buffer.from(file.originalname, 'latin1').toString('utf8'),
      fileType: file.mimetype,
      fileSize: file.size,
      pages,
      isImage,
      hasText: !isImage && text.length > 50,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 단계별 업로드된 파일 목록
router.get('/:projectId/stage/:stage', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, doc_id, original_name, file_type, file_size, ai_analysis, uploaded_at
       FROM files WHERE project_id=$1 AND stage=$2 ORDER BY uploaded_at DESC`,
      [req.params.projectId, req.params.stage]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// AI 분석 실행
router.post('/:projectId/analyze/:stage', async (req, res) => {
  try {
    // 해당 단계 전체 파일 텍스트 합치기
    const files = await pool.query(
      'SELECT extracted_text, original_name FROM files WHERE project_id=$1 AND stage=$2',
      [req.params.projectId, req.params.stage]
    );

    if (files.rows.length === 0) {
      return res.status(400).json({ error: '분석할 파일이 없습니다. 먼저 파일을 업로드하세요.' });
    }

    const combinedText = files.rows
      .map(f => `=== ${f.original_name} ===\n${f.extracted_text}`)
      .join('\n\n');

    // 프로젝트 정보 가져오기
    const proj = await pool.query('SELECT name, customer FROM projects WHERE id=$1', [req.params.projectId]);
    const projectInfo = proj.rows[0] || { name: '미입력', customer: '미입력' };

    // AI 분석
    const analysis = await analyzeFile(combinedText, req.params.stage, projectInfo);

    // 분석 결과 저장
    await pool.query(
      `UPDATE projects SET
        ai_reviews = ai_reviews || $1::jsonb,
        updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify({ [req.params.stage]: { ...analysis, analyzedAt: new Date().toISOString() } }),
       req.params.projectId]
    );

    // 파일별 분석 결과도 저장
    for (const file of files.rows) {
      await pool.query(
        'UPDATE files SET ai_analysis=$1 WHERE project_id=$2 AND stage=$3',
        [JSON.stringify(analysis), req.params.projectId, req.params.stage]
      );
    }

    res.json(analysis);
  } catch (err) {
    console.error('AI 분석 오류:', err);
    res.status(500).json({ error: err.message });
  }
});

// 파일 삭제
router.delete('/:projectId/file/:fileId', async (req, res) => {
  try {
    const file = await pool.query('SELECT file_path FROM files WHERE id=$1', [req.params.fileId]);
    if (file.rows[0]?.file_path) {
      fs.unlink(file.rows[0].file_path, () => {});
    }
    await pool.query('DELETE FROM files WHERE id=$1', [req.params.fileId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 양식 다운로드 (서버에서 서빙)
router.get('/template/:stageId', (req, res) => {
  const stageFileMap = {
    'cr':          'CR-YJM-2026-001_CR양식.docx',
    'loi':         '01_LOI접수_미팅회의록.docx',
    'rfq':         '02_RFQ분석_시나리오확인서.docx',
    'feasibility': '03_FeasibilityReview_내부검토회의록.docx',
    'spec_nego':   '04_SpecNegotiation_시방서협의회의록.docx',
    'spec_freeze': '05_SpecFreeze_최종사양서.docx',
    'po_receipt':  '06_POReceipt_발주서검토서.docx',
    'bom':         '07_BOMRelease_BOM확정서.docx',
    'burnin':      '09_입회검사_시나리오기능검사표.docx',
    'qc_fat':      '10_QC_FAT_품질검사표.docx',
  };
  const filename = stageFileMap[req.params.stageId];
  if (!filename) return res.status(404).json({ error: '양식 없음' });
  const filePath = path.join(__dirname, '../../../', filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: '파일 없음' });
  // 한글 파일명 인코딩 처리
  const encodedFilename = encodeURIComponent(filename);
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFilename}`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.sendFile(filePath);
});

module.exports = router;
