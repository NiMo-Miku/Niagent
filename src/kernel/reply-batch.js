import {replyModelReference} from './reply-rescue.js';
import {sanitizeSdkValue} from './sdk-services.js';

// Only this wake's copied trigger DTOs are exposed, never a store or model key.
// Bounds describe this optional extension contract, not the model context size.
export function replyBatchPayload({api, entries, calls, results, beforeSent, allSent, searched, session, round, remaining}) {
  const triggers = (Array.isArray(entries) ? entries : []).slice(0,200).map(entry => {
    const out = {};
    for (const key of ['id','mid','ts','senderId','senderName','text','self','isPoke','atMe']) {
      const value = entry?.[key];
      if (['string','number','boolean'].includes(typeof value) || value === null) out[key] = typeof value === 'string' ? value.slice(0,key==='text'?8000:200) : value;
    }
    out.media = (Array.isArray(entry?.media)?entry.media:[]).slice(0,20).map(item => ({type:String(item?.type??'').slice(0,40)}));
    return out;
  });
  const receipts = sanitizeSdkValue(Array.isArray(allSent)?allSent:[]);
  return {phase:'after-tool-batch',api:replyModelReference(api),entries:triggers,
    batch:{calls:sanitizeSdkValue(calls),results:sanitizeSdkValue(results),newSent:receipts.slice(beforeSent),allSent:receipts,searched:searched===true},
    session:sanitizeSdkValue(session),round,remaining};
}
