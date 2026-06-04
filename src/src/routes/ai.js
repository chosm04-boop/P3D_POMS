const https = require('https');

const STAGE_CRITERIA = {
  loi: { name: 'LOI 접수', criteria: [
    { key: 'customer_name', label: '고객사명이 명시되어 있다', weight: 20 },
    { key: 'project_purpose', label: '프로젝트 목적이 기술되어 있다', weight: 20 },
    { key: 'order_intent', label: '발주 의향 또는 가능성이 언급되어 있다', weight: 25 },
    { key: 'scale', label: '예상 규모(수량/환경)가 파악되어 있다', weight: 20 },
    { key: 'next_action', label: '다음 액션 또는 후속 일정이 합의되어 있다', weight: 15 },
  ]},
  rfq: { name: 'RFQ 분석 — 시나리오 확인서', criteria: [
    { key: 'scenario_defined', label: '물류 동선 시나리오가 최소 1개 이상 정의되어 있다', weight: 30 },
    { key: 'amr_task', label: 'AMR이 처리할 작업 흐름이 명확하다', weight: 25 },
    { key: 'sw_requirement', label: 'SW 연동 요구사항이 파악되어 있다', weight: 20 },
    { key: 'environment', label: '운영 환경 조건이 기재되어 있다', weight: 15 },
    { key: 'customer_confirm', label: '고객사 담당자가 내용을 확인했다', weight: 10 },
  ]},
  feasibility: { name: 'Feasibility Review', criteria: [
    { key: 'based_on_scenario', label: '시나리오 기반으로 검토했다', weight: 20 },
    { key: 'feasibility_conclusion', label: '기술 구현 가능 여부 결론이 명확하다', weight: 30 },
    { key: 'risk_identified', label: '리스크 항목이 식별되어 있다', weight: 20 },
    { key: 'alternative', label: '구현 불가 항목에 대한 대안이 검토됐다', weight: 15 },
    { key: 'both_teams', label: '영업팀과 개발팀 양측이 참여했다', weight: 15 },
  ]},
  spec_nego: { name: 'Spec. Negotiation', criteria: [
    { key: 'spec_items', label: '협의된 주요 사양 항목이 기록되어 있다', weight: 30 },
    { key: 'disagreement_resolved', label: '이견 항목이 모두 해소되었다', weight: 25 },
    { key: 'customer_attended', label: '고객사 담당자가 참석했다', weight: 20 },
    { key: 'no_pending', label: '미결 사항이 없다', weight: 25 },
  ]},
  spec_freeze: { name: 'Spec. Freeze', criteria: [
    { key: 'reflects_f03', label: '내부 검토 회의록 내용이 반영되어 있다', weight: 20 },
    { key: 'reflects_f04', label: '시방서 협의 합의 내용이 반영되어 있다', weight: 20 },
    { key: 'customer_signature', label: '고객사 담당자 서명이 있다', weight: 30 },
    { key: 'cr_notice', label: '이후 변경은 CR 처리임이 명시되어 있다', weight: 15 },
    { key: 'internal_approval', label: 'Polaris3D 내부 승인이 완료됐다', weight: 15 },
  ]},
  po_receipt: { name: 'PO Receipt', criteria: [
    { key: 'amount_match', label: '발주서 금액이 견적서와 일치한다', weight: 35 },
    { key: 'quantity_match', label: '발주 수량이 사양서와 일치한다', weight: 30 },
    { key: 'deadline_match', label: '납기일이 합의된 날짜와 일치한다', weight: 25 },
    { key: 'po_original', label: '발주서 원본이 첨부되어 있다', weight: 10 },
  ]},
  bom: { name: 'BOM Release', criteria: [
    { key: 'based_on_spec', label: 'BOM이 최종 사양서 기준으로 작성되었다', weight: 30 },
    { key: 'po_match', label: 'PO 품목과 BOM이 일치한다', weight: 30 },
    { key: 'no_missing', label: '누락된 품목이 없다', weight: 25 },
    { key: 'team_lead_confirmed', label: '개발팀장이 최종 확인했다', weight: 15 },
  ]},
  burnin: { name: 'Burn-in / 입회검사', criteria: [
    { key: 'all_scenarios', label: '시나리오 전 항목이 검사되었다', weight: 30 },
    { key: 'pass_all', label: '모든 검사 항목이 합격 처리되었다', weight: 30 },
    { key: 'rework_done', label: '불합격 항목이 수정 후 재검사 통과했다', weight: 25 },
    { key: 'signed', label: '검사자 서명이 완료되었다', weight: 15 },
  ]},
  qc_fat: { name: 'QC / FAT', criteria: [
    { key: 'appearance_pass', label: '외관 검사 전 항목이 합격이다', weight: 20 },
    { key: 'function_pass', label: '기능과 성능 검사 전 항목이 합격이다', weight: 30 },
    { key: 'rework_done', label: '불합격 항목이 수정 후 재검사 통과했다', weight: 25 },
    { key: 'fat_signed', label: 'FAT 실시 시 고객사 확인 서명이 있다', weight: 25 },
  ]},
};

function httpsPost(options, bodyStr) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve({ ok: res.statusCode < 300, status: res.statusCode, body: JSON.parse(data) }); }
        catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

async function analyzeFile(fileText, stageId, projectInfo) {
  const criteria = STAGE_CRITERIA[stageId];
  if (!criteria) return { error: 'No criteria for this stage.' };

  const safeText = (fileText || '').slice(0, 8000);
  const criteriaText = criteria.criteria
    .map((c, i) => `${i+1}. [weight ${c.weight}%] ${c.label}`)
    .join('\n');

  const prompt = [
    'You are a project management AI for Polaris3D, an AMR manufacturer.',
    'Review the document below and evaluate its quality.',
    '',
    '[Project Info]',
    `Name: ${projectInfo.name}`,
    `Customer: ${projectInfo.customer || 'N/A'}`,
    `Stage: ${criteria.name}`,
    '',
    '[Document Content]',
    safeText,
    '',
    '[Evaluation Criteria (total 100%)]',
    criteriaText,
    '',
    'Score each criterion 0-100 and respond ONLY with JSON:',
    '{',
    '  "scores": {',
    criteria.criteria.map(c => `    "${c.key}": 0`).join(',\n'),
    '  },',
    '  "total_score": 0,',
    '  "passed": false,',
    '  "good_points": ["point1"],',
    '  "weak_points": ["point1"],',
    '  "missing_items": ["item1"],',
    '  "recommendation": "recommendation here",',
    '  "summary": "summary here"',
    '}',
  ].join('\n');

  const bodyObj = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  };
  const bodyStr = JSON.stringify(bodyObj);

  const result = await httpsPost({
    hostname: 'api.anthropic.com',
    path: '/v1/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(bodyStr, 'utf8'),
      'x-api-key': String(process.env.ANTHROPIC_API_KEY || ''),
      'anthropic-version': '2023-06-01',
    },
  }, bodyStr);

  if (!result.ok) throw new Error(result.body?.error?.message || 'API error');

  const text = result.body.content?.find(c => c.type === 'text')?.text || '{}';
  const clean = text.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(clean);

  let weighted = 0;
  criteria.criteria.forEach(c => {
    weighted += (parsed.scores?.[c.key] || 0) * (c.weight / 100);
  });
  parsed.total_score = Math.round(weighted);
  parsed.passed = parsed.total_score >= 90;
  parsed.criteria_detail = criteria.criteria.map(c => ({
    key: c.key, label: c.label, weight: c.weight,
    score: parsed.scores?.[c.key] || 0,
  }));

  return parsed;
}

module.exports = { analyzeFile, STAGE_CRITERIA };
