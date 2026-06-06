const axios = require('axios');
const fs = require('fs');
const path = require('path');
const labelsPath = path.join(__dirname, 'ai_labels.json');
const LABELS = fs.existsSync(labelsPath) ? JSON.parse(fs.readFileSync(labelsPath,'utf8')) : {};

const STAGE_CRITERIA = {
      loi:{name:'LOI',bonus:{key:'signature',points:5},criteria:[
          {key:'customer_info',weight:25},{key:'project_purpose',weight:25},
          {key:'order_intent',weight:25},{key:'scale_env',weight:20},{key:'next_action',weight:5}]},
      rfq:{name:'RFQ',bonus:{key:'signature',points:5},criteria:[
          {key:'scenario_defined',weight:30},{key:'amr_task',weight:25},
          {key:'sw_requirement',weight:20},{key:'environment',weight:15},{key:'customer_confirm',weight:10}]},
      feasibility:{name:'Feasibility',criteria:[
          {key:'based_on_scenario',weight:20},{key:'feasibility_conclusion',weight:30},
          {key:'risk_identified',weight:20},{key:'alternative',weight:15},{key:'internal_sign',weight:15}]},
      spec_nego:{name:'Spec Nego',criteria:[
          {key:'spec_items',weight:30},{key:'disagreement_resolved',weight:25},
          {key:'customer_attended',weight:20},{key:'no_pending',weight:25}]},
      spec_freeze:{name:'Spec Freeze',criteria:[
          {key:'reflects_nego',weight:20},{key:'spec_complete',weight:25},
          {key:'customer_signature',weight:30},{key:'cr_notice',weight:10},{key:'internal_approval',weight:15}]},
      po_receipt:{name:'PO Receipt',criteria:[
          {key:'po_attached',weight:35},{key:'amount_match',weight:30},
          {key:'quantity_match',weight:20},{key:'deadline_match',weight:15}]},
      bom:{name:'BOM',criteria:[
          {key:'based_on_spec',weight:30},{key:'po_match',weight:30},
          {key:'no_missing',weight:25},{key:'lead_confirmed',weight:15}]},
      burnin:{name:'Burn-in',criteria:[
          {key:'all_scenarios',weight:30},{key:'pass_all',weight:30},
          {key:'rework_done',weight:25},{key:'signed',weight:15}]},
      qc_fat:{name:'QC FAT',criteria:[
          {key:'appearance_pass',weight:20},{key:'function_pass',weight:30},
          {key:'rework_done',weight:25},{key:'fat_signed',weight:25}]},
};

              async function analyzeFile(fileText, stageId, projectInfo) {
                    const stage = STAGE_CRITERIA[stageId];
                    if (!stage) return { error: 'No criteria.' };
                    const L = LABELS[stageId] || {};
                    const safeText = (fileText || '').slice(0, 7000);
                    const criteriaLines = stage.criteria.map(function(c,i){
                            return (i+1)+'. [weight:'+c.weight+'%] '+(L.criteria&&L.criteria[c.key]&&L.criteria[c.key].label||c.key);
                    }).join('\n');
                    const bonusLine = stage.bonus&&L.bonus ? '\nBonus(no penalty if absent,+'+stage.bonus.points+' if present):'+L.bonus : '';
                    const philosophy = L.philosophy || '';
                    const prompt = 'You are a quality review AI for Polaris3D AMR. Respond ONLY in Korean.\n\n'+
                            (philosophy?'[Philosophy]\n'+philosophy+'\n\n':'')+
                            '[Project] '+projectInfo.name+' / '+(projectInfo.customer||'N/A')+' / Stage:'+stage.name+'\n\n'+
                            '[Document]\n'+safeText+'\n\n[Criteria]\n'+criteriaLines+bonusLine+'\n\n'+
                            'Score each 0-100. JSON only:\n{"scores":{'+
                            stage.criteria.map(function(c){return '"'+c.key+'":0';}).join(',')+(stage.bonus?',"bonus":0':'')+
                            '},"good_points":[],"weak_points":[],"missing_items":[],"recommendation":"","summary":""}';
                    const resp = await axios.post('https://api.anthropic.com/v1/messages',
                                                  {model:'claude-haiku-4-5-20251001',max_tokens:2000,messages:[{role:'user',content:prompt}]},
                                                  {headers:{'content-type':'application/json','x-api-key':process.env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},timeout:30000});
                    const text = resp.data.content.find(function(c){return c.type==='text';}).text||'{}';
                    const parsed = JSON.parse(text.replace(/```json|```/g,'').trim());
                    let weighted=0;
                    stage.criteria.forEach(function(c){weighted+=(parsed.scores[c.key]||0)*(c.weight/100);});
                    const bonus = stage.bonus?(parsed.scores.bonus||0):0;
                    parsed.total_score = Math.min(100,Math.round(weighted)+bonus);
                    parsed.passed = parsed.total_score>=90;
                    parsed.criteria_detail = stage.criteria.map(function(c){
                            const lc=L.criteria&&L.criteria[c.key]||{};
                            return {key:c.key,label:lc.label||c.key,weight:c.weight,score:parsed.scores[c.key]||0,action:lc.action||''};
                    });
                    if(stage.bonus){parsed.bonus_detail={label:L.bonus||stage.bonus.key,score:bonus,points:stage.bonus.points};}
                    return parsed;
              }
              module.exports = { analyzeFile, STAGE_CRITERIA };

module.exports = { analyzeFile, STAGE_CRITERIA };
