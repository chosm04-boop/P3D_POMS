const https = require('https');
const url = require('url');

const WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

function sendSlack(payload) {
  if (!WEBHOOK_URL) return Promise.resolve();
  const parsed = url.parse(WEBHOOK_URL);
  const data = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: parsed.hostname, path: parsed.path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, (res) => { resolve(res.statusCode); });
    req.on('error', reject);
    req.write(data); req.end();
  });
}

function notifyStageMove(project, fromStage, toStage) {
  const N = {loi:'LOI 접수',rfq:'RFQ 분석',feasibility:'Feasibility Review',spec_nego:'Spec Negotiation',spec_freeze:'Spec Freeze',po_receipt:'PO Receipt',bom:'BOM Release',manufacturing:'Manufacturing',burnin:'Burn-in Test',qc_fat:'QC/FAT',shipping_readiness:'Shipping Readiness',delivery_acceptance:'Delivery Acceptance',commissioning:'Commissioning',stabilization:'Stabilization',project_closeout:'Project Close-out'};
  return sendSlack({blocks:[
    {type:'header',text:{type:'plain_text',text:'🚀 단계 이동',emoji:true}},
    {type:'section',fields:[{type:'mrkdwn',text:'*프로젝트:*\n'+project.name},{type:'mrkdwn',text:'*고객사:*\n'+(project.customer||'—')},{type:'mrkdwn',text:'*이전:*\n'+(N[fromStage]||fromStage)},{type:'mrkdwn',text:'*새 단계:*\n✅ '+(N[toStage]||toStage)}]},
    {type:'section',text:{type:'mrkdwn',text:'*담당:* '+(project.owner||'미지정')+'\n<https://polaris3d-poms.up.railway.app|POMS에서 확인>'}},
    {type:'divider'}
  ]});
}

function notifyAIApproved(project, stage, score, fileCount) {
  const N = {loi:'LOI',rfq:'RFQ',feasibility:'Feasibility',spec_nego:'Spec Nego',spec_freeze:'Spec Freeze',po_receipt:'PO Receipt',bom:'BOM',burnin:'Burn-in',qc_fat:'QC/FAT'};
  return sendSlack({blocks:[
    {type:'header',text:{type:'plain_text',text:'✅ AI 검수 승인',emoji:true}},
    {type:'section',fields:[{type:'mrkdwn',text:'*프로젝트:*\n'+project.name},{type:'mrkdwn',text:'*단계:*\n'+(N[stage]||stage)},{type:'mrkdwn',text:'*AI 점수:*\n*'+score+'점* 승인'},{type:'mrkdwn',text:'*서류:*\n'+fileCount+'개 파일'}]},
    {type:'context',elements:[{type:'mrkdwn',text:'담당: '+(project.owner||'—')+' | <https://polaris3d-poms.up.railway.app|POMS 열기>'}]},
    {type:'divider'}
  ]});
}

function notifyDeadlineWarning(project, stage, daysLeft, totalDays, fraction) {
  const emoji = fraction==='3/3'?'🔴':fraction==='2/3'?'🟡':'🟢';
  const urgency = fraction==='3/3'?'기한 만료!':fraction==='2/3'?'기한 임박':'진행 알림';
  return sendSlack({blocks:[
    {type:'header',text:{type:'plain_text',text:emoji+' '+urgency+' ('+fraction+')',emoji:true}},
    {type:'section',fields:[{type:'mrkdwn',text:'*프로젝트:*\n'+project.name},{type:'mrkdwn',text:'*현재 단계:*\n'+stage},{type:'mrkdwn',text:'*남은 일수:*\n'+daysLeft+'일 / '+totalDays+'일'},{type:'mrkdwn',text:'*담당:*\n'+(project.owner||'미지정')}]},
    {type:'divider'}
  ]});
}

module.exports = { sendSlack, notifyStageMove, notifyAIApproved, notifyDeadlineWarning };
