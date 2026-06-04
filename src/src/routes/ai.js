const fs = require('fs');
const path = require('path');

// 단계별 AI 검수 기준 정의
const STAGE_CRITERIA = {
  loi: {
    name: 'LOI 접수',
    criteria: [
      { key: 'customer_name', label: '고객사명이 명시되어 있다', weight: 20 },
      { key: 'project_purpose', label: '프로젝트 목적이 기술되어 있다', weight: 20 },
      { key: 'order_intent', label: '발주 의향 또는 가능성이 언급되어 있다', weight: 25 },
      { key: 'scale', label: '예상 규모(수량/환경)가 파악되어 있다', weight: 20 },
      { key: 'next_action', label: '다음 액션 또는 후속 일정이 합의되어 있다', weight: 15 },
    ]
  },
  rfq: {
    name: 'RFQ 분석 — 시나리오 확인서',
    criteria: [
      { key: 'scenario_defined', label: '물류 동선 시나리오가 최소 1개 이상 정의되어 있다', weight: 30 },
      { key: 'amr_task', label: 'AMR이 처리할 작업 흐름(출발지→목적지)이 명확하다', weight: 25 },
      { key: 'sw_requirement', label: 'SW 연동 요구사항이 파악되어 있다', weight: 20 },
      { key: 'environment', label: '운영 환경 조건(통로폭, 바닥 등)이 기재되어 있다', weight: 15 },
      { key: 'customer_confirm', label: '고객사 담당자가 내용을 확인했다', weight: 10 },
    ]
  },
  feasibility: {
    name: 'Feasibility Review — 내부 검토 회의록',
    criteria: [
      { key: 'based_on_scenario', label: '시나리오 확인서(F02) 기반으로 검토했다', weight: 20 },
      { key: 'feasibility_conclusion', label: '기술 구현 가능 여부 결론이 명확하다', weight: 30 },
      { key: 'risk_identified', label: '리스크 항목이 식별되어 있다', weight: 20 },
      { key: 'alternative', label: '구현 불가 항목에 대한 대안이 검토됐다', weight: 15 },
      { key: 'both_teams', label: '영업팀과 개발팀 양측이 참여했다', weight: 15 },
    ]
  },
  spec_nego: {
    name: 'Spec. Negotiation — 시방서 협의 회의록',
    criteria: [
      { key: 'spec_items', label: '협의된 주요 사양 항목이 기록되어 있다', weight: 30 },
      { key: 'disagreement_resolved', label: '이견 항목이 모두 해소되었다', weight: 25 },
      { key: 'customer_attended', label: '고객사 담당자가 참석했다', weight: 20 },
      { key: 'no_pending', label: '미결 사항이 없다', weight: 25 },
    ]
  },
  spec_freeze: {
    name: 'Spec. Freeze — 최종 사양서',
    criteria: [
      { key: 'reflects_f03', label: '내부 검토 회의록(F03) 내용이 반영되어 있다', weight: 20 },
      { key: 'reflects_f04', label: '시방서 협의 회의록(F04) 합의 내용이 반영되어 있다', weight: 20 },
      { key: 'customer_signature', label: '고객사 담당자 서명이 있다', weight: 30 },
      { key: 'cr_notice', label: '이후 변경은 CR 처리임이 명시되어 있다', weight: 15 },
      { key: 'internal_approval', label: 'Polaris3D 내부 승인(개발팀장 이상)이 완료됐다', weight: 15 },
    ]
  },
  po_receipt: {
    name: 'PO Receipt — 발주서 검토서',
    criteria: [
      { key: 'amount_match', label: '발주서 금액이 견적서와 일치한다', weight: 35 },
      { key: 'quantity_match', label: '발주 수량이 사양서와 일치한다', weight: 30 },
      { key: 'deadline_match', label: '납기일이 합의된 날짜와 일치한다', weight: 25 },
      { key: 'po_original', label: '발주서 원본이 첨부/보관되어 있다', weight: 10 },
    ]
  },
  bom: {
    name: 'BOM Release — BOM 확정서',
    criteria: [
      { key: 'based_on_spec', label: 'BOM이 최종 사양서(F05) 기준으로 작성되었다', weight: 30 },
      { key: 'po_match', label: 'PO 품목·수량과 BOM이 일치한다', weight: 30 },
      { key: 'no_missing', label: '누락된 품목이 없다', weight: 25 },
      { key: 'team_lead_confirmed', label: '개발팀장이 최종 확인했다', weight: 15 },
    ]
  },
  burnin: {
    name: '입회검사 — 시나리오 기능 검사표',
    criteria: [
      { key: 'all_scenarios', label: '시나리오 확인서(F02)의 전 항목이 검사되었다', weight: 30 },
      { key: 'pass_all', label: '모든 검사 항목이 합격 처리되었다', weight: 30 },
      { key: 'rework_done', label: '불합격 항목이 수정 후 재검사 통과했다', weight: 25 },
      { key: 'signed', label: '검사자 서명이 완료되었다', weight: 15 },
    ]
  },
  qc_fat: {
    name: 'QC / FAT — 품질 검사표',
    criteria: [
      { key: 'appearance_pass', label: '외관 검사 전 항목이 합격이다', weight: 20 },
      { key: 'function_pass', label: '기능·성능 검사 전 항목이 합격이다', weight: 30 },
      { key: 'rework_done', label: '불합격 항목이 수정 후 재검사 통과했다', weight: 25 },
      { key: 'fat_signed', label: 'FAT 실시 시 고객사 확인 서명이 있다', weight: 25 },
    ]
  },
};

async function analyzeFile(fileText, stageId, projectInfo) {
  const criteria = STAGE_CRITERIA[stageId];
  if (!criteria) {
    return { error: '해당 단계의 검수 기준이 정의되지 않았습니다.' };
  }

  const criteriaText = criteria.criteria
    .map((c, i) => `${i+1}. [가중치 ${c.weight}%] ${c.label}`)
    .join('\n');

  const prompt = `당신은 AMR(자율이동로봇) 전문 제조사 Polaris3D의 프로젝트 관리 AI입니다.
아래 서류를 검토하고 품질 평가를 수행해주세요.

[프로젝트 정보]
- 프로젝트명: ${projectInfo.name}
- 고객사: ${projectInfo.customer || '미입력'}
- 검토 단계: ${criteria.name}

[서류 내용]
${safeText.slice(0, 8000)}

[검수 기준 (총 100%)]
${criteriaText}

각 기준에 대해 0~100점으로 평가하고, 아래 JSON 형식으로만 응답하세요. 다른 텍스트 없이 JSON만:
{
  "scores": {
    ${criteria.criteria.map(c => `"${c.key}": 점수(0-100)`).join(',\n    ')}
  },
  "total_score": 가중평균점수(0-100, 정수),
  "passed": true 또는 false (90점 이상이면 true),
  "good_points": ["잘된 점 1", "잘된 점 2", "잘된 점 3"],
  "weak_points": ["미흡한 점 1", "미흡한 점 2"],
  "missing_items": ["누락된 항목 1", "누락된 항목 2"],
  "recommendation": "종합 권고사항 (구체적이고 실무적으로)",
  "summary": "한 줄 평가 요약 (30자 이내)"
}`;

  // 한글/특수문자 안전 처리
  const safeText = Buffer.from(fileText, 'utf8').toString('utf8');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'API 오류');

  const text = data.content?.find(c => c.type === 'text')?.text || '{}';
  const clean = text.replace(/```json|```/g, '').trim();
  const result = JSON.parse(clean);

  // 가중평균 재계산 (검증)
  let weighted = 0;
  criteria.criteria.forEach(c => {
    weighted += (result.scores[c.key] || 0) * (c.weight / 100);
  });
  result.total_score = Math.round(weighted);
  result.passed = result.total_score >= 90;
  result.criteria_detail = criteria.criteria.map(c => ({
    key: c.key,
    label: c.label,
    weight: c.weight,
    score: result.scores[c.key] || 0,
  }));

  return result;
}

module.exports = { analyzeFile, STAGE_CRITERIA };
