import {createConditionalMotion} from './conditional-motion.js';

const sourceNames={builtin:'内置参考价',remote:'远程价格',custom:'自定义价格',manual:'手填单价',none:'未设置',official:'参考价'};
const sourceName=quote=>{const key=quote?.origin||quote?.source;return Object.hasOwn(sourceNames,key)?sourceNames[key]:key||'未提供';};
const rate=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?String(value):'—';

// Keep the original controls and their save/validation bindings; only change
// presentation. Effective prices are supplied by the selected backend adapter.
export function mountCostView({parent,read,write,ready,request,doc=parent.ownerDocument}){
  const visibility=createConditionalMotion(doc);
  const node=(tag,cls,value)=>{const el=doc.createElement(tag);if(cls)el.className=cls;if(value!==undefined)el.textContent=value;return el;};
  const element=node('div','cost-view full'),toggle=node('button','cost-price-toggle','使用远程价格表及内置参考价'),state=node('div','cost-view-state'),manual=node('div','cost-manual-fields'),summary=node('section','cost-price-summary'),head=node('div','cost-price-head'),heading=node('strong','','当前模型价格'),unit=node('span','muted','元 / 百万 Token'),identity=node('p','muted cost-price-identity'),rates=node('dl','cost-price-rates'),feedback=node('p','muted cost-price-feedback');
  let disposed=false,ticket=0,lastKey=null,lastReady=false;
  const values=new Map();
  for(const[key,label]of [['in','输入'],['out','输出'],['cached','缓存输入']]){const item=node('div'),term=node('dt','',label),value=node('dd','','—');value.dataset.costRate=key;item.append(term,value);rates.append(item);values.set(key,value);}
  toggle.type='button';toggle.setAttribute('role','switch');toggle.setAttribute('aria-checked','false');toggle.setAttribute('aria-controls','cost-price-summary');
  toggle.addEventListener('click',()=>write(read('api.useOfficialPrice')!==true));
  state.hidden=true;state.append(parent.querySelector('.setting-field[data-path="api.useOfficialPrice"]'));
  for(const key of ['priceInputPerM','priceOutputPerM','priceCachedPerM'])manual.append(parent.querySelector(`.setting-field[data-path="api.${key}"]`));
  // Each alternate view gets its own collapsing flow slot. A cross-fade in
  // one shared overlay would paint the old inputs over the incoming quote.
  const stack=node('div','cost-view-stack'),manualSlot=node('div','cost-view-slot'),summarySlot=node('div','cost-view-slot');
  manualSlot.append(manual);summarySlot.append(summary);stack.append(manualSlot,summarySlot);
  summary.id='cost-price-summary';summary.setAttribute('aria-label','当前模型价格');feedback.setAttribute('role','status');head.append(heading,unit);summary.append(head,identity,rates,feedback);element.append(toggle,state,stack);parent.prepend(element);
  function clearRates(){for(const value of values.values())value.textContent='—';}
  async function load(version,model){
    summary.setAttribute('aria-busy','true');feedback.classList.remove('field-error');feedback.textContent='正在读取当前模型价格…';
    try{
      const result=await request('GET','/api/model-prices',undefined,{model});
      if(disposed||ticket!==version)return;
      const quote=result?.current;if(!quote)throw new Error('暂未提供当前模型价格');
      for(const[key,value]of values)value.textContent=key==='cached'&&quote[key]==null?'随输入计价':rate(quote[key]);
      identity.textContent=`${model||'尚未选择模型'} · ${sourceName(quote)}`;feedback.textContent='';
    }catch(error){if(disposed||ticket!==version)return;clearRates();feedback.classList.add('field-error');feedback.textContent=`价格读取失败：${error.message}`;}
    finally{if(!disposed&&ticket===version)summary.setAttribute('aria-busy','false');}
  }
  function refresh({force=false}={}){
    if(disposed)return;
    const enabled=read('api.useOfficialPrice')===true,model=String(read('api.model')||''),settled=ready();
    toggle.setAttribute('aria-checked',String(enabled));visibility.set(summary,enabled);visibility.set(manual,!enabled);
    const key=JSON.stringify([enabled,model,read('api.provider'),read('api.modelPrices'),read('api.priceInputPerM'),read('api.priceOutputPerM'),read('api.priceCachedPerM')]);
    if(!force&&key===lastKey&&settled===lastReady)return;
    lastKey=key;lastReady=settled;const version=++ticket;clearRates();summary.setAttribute('aria-busy','false');feedback.classList.remove('field-error');
    identity.textContent=model||'尚未选择模型';
    if(!enabled)return;
    if(!settled){feedback.textContent='当前设置尚未保存，保存后显示价格。';return;}
    void load(version,model);
  }
  refresh();return{element,refresh,dispose(){disposed=true;++ticket;visibility.dispose();}};
}
