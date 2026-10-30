const sources={custom:'自定义',local:'自定义',remote:'远程价格',builtin:'内置参考价',official:'参考价',manual:'手填单价',none:'未设置'};
const sourceLabel=row=>sources[row?.origin]||sources[row?.source]||row?.origin||row?.source||'未提供';
const rate=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?String(value):'—';

function imageDescription(image){
  if(!image||typeof image!=='object')return '';
  const parts=[];
  if(image.mode==='capped'&&Number.isFinite(image.maxTokensPerImage))parts.push(`每张图片最多 ${image.maxTokensPerImage} Token`);
  else if(image.mode==='pixel'){
    if(Number.isFinite(image.divisor))parts.push(`图片 Token = 像素数 ÷ ${image.divisor}${Number.isFinite(image.base)?` + ${image.base}`:''}`);
    if(Number.isFinite(image.maxPixels))parts.push(`每张最多 ${image.maxPixels.toLocaleString('zh-CN')} 像素`);
  }
  if(typeof image.note==='string'&&image.note)parts.push(image.note);
  return parts.join('；')||'未提供图片计费规则';
}

// Display the selected price adapter's snapshot without reproducing billing rules.
export function createPriceTable({request,doc=document}){
  const node=(tag,cls,value)=>{const el=doc.createElement(tag);if(cls)el.className=cls;if(value!==undefined)el.textContent=value;return el;};
  const element=node('section','price-table-view'),head=node('div','price-table-head'),title=node('h4','','当前价格表'),unit=node('p','muted','单位：元 / 百万 Token'),search=node('input'),count=node('p','muted price-table-count'),status=node('p','price-table-status'),meta=node('p','muted price-table-meta'),current=node('p','price-table-current'),scroll=node('div','price-table-scroll'),table=node('table','price-table'),thead=node('thead'),tbody=node('tbody');
  let snapshot=null,ticket=0,disposed=false;
  element.hidden=true;head.append(title,unit);search.type='search';search.placeholder='搜索模型 ID 或说明';search.setAttribute('aria-label','搜索价格表');
  status.setAttribute('role','status');count.setAttribute('role','status');scroll.tabIndex=0;scroll.setAttribute('role','region');scroll.setAttribute('aria-label','模型价格表，可横向滚动');
  const labels=node('tr');for(const label of ['模型 ID','输入','输出','缓存输入','来源','说明']){const th=node('th','',label);th.scope='col';labels.append(th);}thead.append(labels);table.append(thead,tbody);scroll.append(table);element.append(head,status,meta,current,search,count,scroll);
  function renderRows(){
    const query=search.value.trim().toLowerCase(),rows=(snapshot?.prices||[]).filter(row=>row&&typeof row.id==='string');
    const matching=rows.filter(row=>[row.id,row.note,sourceLabel(row),imageDescription(row.image)].some(value=>String(value||'').toLowerCase().includes(query)));
    count.textContent=query?`找到 ${matching.length} / ${rows.length} 个模型`:`共 ${rows.length} 个模型`;
    const currentId=snapshot?.current?.matched;
    matching.sort((a,b)=>Number(b.id===currentId)-Number(a.id===currentId)||a.id.localeCompare(b.id,'zh-CN',{numeric:true}));
    tbody.replaceChildren();
    for(const row of matching){
      const tr=node('tr');tr.dataset.priceModel=row.id;
      const identity=node('th','price-table-model',row.id);identity.scope='row';
      if(row.id===currentId)identity.append(node('span','price-table-current-tag','当前模型'));
      tr.append(identity);
      for(const key of ['in','out','cached']){
        const cell=node('td','price-table-rate'),normal=node('span','',key==='cached'&&row[key]==null?'随输入计价':rate(row[key]));cell.append(normal);
        if(row.peak){const peak=row.peak[key];cell.append(node('small','muted',`高峰 ${key==='cached'&&peak==null?'随输入计价':rate(peak)}`));}
        tr.append(cell);
      }
      const source=node('td');source.append(node('span','price-table-source',sourceLabel(row)));if(row.src==='derived')source.append(node('small','muted','推算参考'));tr.append(source);
      const notes=node('td','price-table-notes'),image=imageDescription(row.image);
      if(row.note||image){const detail=node('details'),summary=node('summary','','查看说明');detail.append(summary);if(row.note)detail.append(node('p','',String(row.note)));if(image)detail.append(node('p','',`图片计费：${image}`));notes.append(detail);}else notes.textContent='—';
      tr.append(notes);tbody.append(tr);
    }
    if(!matching.length){const row=node('tr'),empty=node('td','price-table-empty',rows.length?'没有匹配的模型':'暂无价格条目');empty.colSpan=6;row.append(empty);tbody.append(row);}
  }
  function renderSnapshot(){
    const remote=snapshot.remote||{},parts=[];
    if(snapshot.builtin?.capturedAt)parts.push(`内置参考价快照：${snapshot.builtin.capturedAt}`);
    const stamp=Number(remote.fetchedAt);if(stamp>0&&Number.isFinite(new Date(stamp).getTime()))parts.push(`${remote.source==='remote'?'远程更新':'远程缓存'}：${new Date(stamp).toLocaleString('zh-CN',{hour12:false})}`);
    meta.textContent=parts.join(' · ');meta.hidden=!parts.length;
    const quote=snapshot.current;current.hidden=!quote;
    if(quote){const model=quote.id||quote.matched;current.textContent=`当前${model?`模型 ${model}`:''}计价（${sourceLabel(quote)}）：输入 ${rate(quote.in)} · 输出 ${rate(quote.out)} · 缓存输入 ${quote.cached==null?'随输入计价':rate(quote.cached)}`;}
    search.hidden=count.hidden=scroll.hidden=false;renderRows();
  }
  async function load({refresh=false}={}){
    if(disposed)return;const version=++ticket;element.hidden=false;element.setAttribute('aria-busy','true');status.classList.remove('is-error');status.textContent=refresh?'正在更新价格表…':'正在读取价格表…';
    if(!snapshot)search.hidden=count.hidden=scroll.hidden=meta.hidden=current.hidden=true;
    try{
      const result=await request(refresh?'POST':'GET',refresh?'/api/model-prices/refresh':'/api/model-prices',...(refresh?[{}]:[]));
      if(disposed||version!==ticket)return;
      if(!Array.isArray(result?.prices))throw new Error('未返回可展示的价格表');
      snapshot=result;renderSnapshot();
      const failed=result.ok===false||result.remote?.ok===false;status.classList.toggle('is-error',failed);
      status.textContent=failed?`更新失败：${result.remote?.error||result.error||'价格源暂不可用'}；正在显示可用价格。`:refresh?'价格表已更新。':'';
    }catch(error){if(disposed||version!==ticket)return;status.classList.add('is-error');status.textContent=`${refresh?'更新':'读取'}失败：${error.message}${snapshot?'；已保留上次价格表。':''}`;}
    finally{if(!disposed&&version===ticket)element.setAttribute('aria-busy','false');}
  }
  search.addEventListener('input',renderRows);
  return {element,load,dispose(){disposed=true;++ticket;}};
}
