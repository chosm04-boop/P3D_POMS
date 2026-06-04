const axios = require('axios');

const STAGE_CRITERIA = {
    loi: { name: 'LOI', criteria: [
      { key: 'customer_name', label: 'Customer name is specified', weight: 20 },
      { key: 'project_purpose', label: 'Project purpose is described', weight: 20 },
      { key: 'order_intent', label: 'Order intent is mentioned', weight: 25 },
      { key: 'scale', label: 'Expected scale is identified', weight: 20 },
      { key: 'next_action', label: 'Next action is agreed', weight: 15 },
        ]},
    rfq: { name: 'RFQ', criteria: [
      { key: 'scenario_defined', label: 'Logistics scenario is defined', weight: 30 },
      { key: 'amr_task', label: 'AMR task flow is defined', weight: 25 },
      { key: 'sw_requirement', label: 'SW integration requirements identified', weight: 20 },
      { key: 'environment', label: 'Operating environment documented', weight: 15 },
      { key: 'customer_confirm', label: 'Customer confirmed the content', weight: 10 },
        ]},
    feasibility: { name: 'Feasibility', criteria: [h
      { key: 'based_on_scenario', label: 'Review based on scenario', weight: 20 },
      { key: 'feasibility_conclusion', label: 'Feasibility conclusion is clear', weight: 30 },
      { key: 'risk_identified', label: 'Risks are identified', weight: 20 },
      { key: 'alternative', label: 'Alternatives reviewed', weight: 15 },
      { key: 'both_teams', label: 'Both teams participated', weight: 15 },
        ]},
    spec_nego: { name: 'Spec Nego', criteria: [
      { key: 'spec_items', label: 'Spec items are recorded', weight: 30 },
      { key: 'disagreement_resolved', label: 'Disagreements resolved', weight: 25 },
      { key: 'customer_attended', label: 'Customer attended', weight: 20 },
      { key: 'no_pending', label: 'No pending items', weight: 25 },
        ]},
    spec_freeze: { name: 'Spec Freeze', criteria: [
      { key: 'reflects_f03', label: 'Internal review reflected', weight: 20 },
      { key: 'reflects_f04', label: 'Negotiation agreements reflected', weight: 20 },
      { key: 'customer_signature', label: 'Customer signature present', weight: 30 },
      { key: 'cr_notice', label: 'CR process noted', weight: 15 },
      { key: 'internal_approval', label: 'Internal approval completed', weight: 15 },
        ]},
    po_receipt: { name: 'PO Receipt', criteria: [
      { key: 'amount_match', label: 'PO amount matches quotation', weight: 35 },
      { key: 'quantity_match', label: 'PO quantity matches spec', weight: 30 },
      { key: 'deadline_match', label: 'Delivery date matches', weight: 25 },
      { key: 'po_original', label: 'Original PO attached', weight: 10 },
        ]},
    bom: { name: 'BOM', criteria: [
      { key: 'based_on_spec', label: 'BOM based on final spec', weight: 30 },
      { key: 'po_match', label: 'BOM matches PO items', weight: 30 },
      { key: 'no_missing', label: 'No missing items', weight: 25 },
      { key: 'team_lead_confirmed', label: 'Lead confirmed', weight: 15 },
        ]},
    burnin: { name: 'Burn-in', criteria: [
      { key: 'all_scenarios', label: 'All scenarios tested', weight: 30 },
      { key: 'pass_all', label: 'All items passed', weight: 30 },
      { key: 'rework_done', label: 'Failed items reworked', weight: 25 },
      { key: 'signed', label: 'Inspector signed', weight: 15 },
        ]},
    qc_fat: { name: 'QC FAT', criteria: [
      { key: 'appearance_pass', label: 'Appearance passed', weight: 20 },
      { key: 'function_pass', label: 'Function and performance passed', weight: 30 },
      { key: 'rework_done', label: 'Failed items reworked', weight: 25 },
      { key: 'fat_signed', label: 'FAT customer signed', weight: 25 },
        ]},
};

async function analyzeFile(fileText, stageId, projectInfo) {
    const criteria = STAGE_CRITERIA[stageId];
    if (!criteria) return { error: 'No criteria for this stage.' };

  const safeText = (fileText || '').slice(0, 6000);
    const criteriaList = criteria.criteria
      .map((c, i) => (i+1) + '. [weight:' + c.weight + '%] ' + c.label)
      .join('\n');

  const prompt = 'You are a quality review AI for Polaris3D AMR projects.\n' +
        'Project: ' + projectInfo.name + ', Customer: ' + (projectInfo.customer || 'N/A') + ', Stage: ' + criteria.name + '\n\n' +
        'Document:\n' + safeText + '\n\n' +
        'Criteria:\n' + criteriaList + '\n\n' +
        'Respond JSON only: {"scores":{' +
        criteria.criteria.map(function(c){ return '"' + c.key + '":0'; }).join(',') +
        '},"total_score":0,"passed":false,"good_points":[],"weak_points":[],"missing_items":[],"recommendation":"","summary":""}';

  const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
    {
                                        model: 'claude-haiku-4-5-20251001',
            max_tokens: 2000,
            messages: [{ role: 'user', content: prompt }],
    },
    {
            headers: {
                      'content-type': 'application/json',
                      'x-api-key': process.env.ANTHROPIC_API_KEY,
                      'anthropic-version': '2023-06-01',
            },
            timeout: 30000,
    }
      );

  const text = response.data.content.find(function(c){ return c.type === 'text'; }).text || '{}';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

  let weighted = 0;
    criteria.criteria.forEach(function(c) {
          weighted += (parsed.scores[c.key] || 0) * (c.weight / 100);
    });
    parsed.total_score = Math.round(weighted);
    parsed.passed = parsed.total_score >= 90;
    parsed.criteria_detail = criteria.criteria.map(function(c) {
          return { key: c.key, label: c.label, weight: c.weight, score: parsed.scores[c.key] || 0 };
    });

  return parsed;
}

module.exports = { analyzeFile, STAGE_CRITERIA };
