// A small, bounded chart: no frame loop or animation per bar. Values are
// updated in place, so polling does not discard keyboard focus or a hover.
const NS='http://www.w3.org/2000/svg';
const svgNode=(tag,attrs={})=>{const node=document.createElementNS(NS,tag);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));return node;};
const number=value=>Number.isFinite(Number(value))?Number(value):0;
export function usageSeries(data,key){
  let rows=data.mode==='today'?(data.hours||[]):(data.days||[]);
  if(data.mode!=='today'){
    if(data.mode==='all')rows=rows.slice(-30);
    while(rows.length>1&&!['exactCalls','runs','cost','promptTokens','completionTokens','searchCount'].some(field=>number(rows[0][field])>0))rows=rows.slice(1);
  }
  if(!rows.length)rows=[{...data.totals,searchCount:data.searchCount,label:data.rangeLabel||'当前区间'}];
  return rows.map(row=>({label:row.label??(data.mode==='today'?`${String(row.hour).padStart(2,'0')}:00`:String(row.day??row.date??'')),value:key==='cacheHitRate'?Math.max(0,Math.min(1,number(row.cacheHitRate??(row.promptTokens?row.cachedTokens/row.promptTokens:0)))):Math.max(0,number(row[key]))}));
}
export function createSpark({key,label,valueNode,subNode,format}){
  const host=document.createElement('div');host.className='spark';host.dataset.sparkKey=key;host.tabIndex=0;host.setAttribute('role','group');host.setAttribute('aria-label',`${label}趋势`);host.setAttribute('aria-describedby','spark-help');
  const svg=svgNode('svg',{role:'img','aria-label':`${label}趋势柱图`,preserveAspectRatio:'none'}),title=svgNode('title');svg.append(title);host.append(svg);
  let points=[],bars=[],active=-1,baseValue='—',baseSub='',signature='';
  function show(index){active=Math.max(0,Math.min(points.length-1,index));for(const [i,bar] of bars.entries())bar.classList.toggle('is-active',i===active);if(points[active]){valueNode.textContent=format(points[active].value);subNode.textContent=points[active].label;}}
  function restore(){active=-1;for(const bar of bars)bar.classList.remove('is-active');valueNode.textContent=baseValue;subNode.textContent=baseSub;}
  host.addEventListener('pointerover',event=>{const point=event.target.closest?.('[data-spark-index]');if(point&&host.contains(point))show(Number(point.dataset.sparkIndex));});
  host.addEventListener('pointerleave',restore);
  host.addEventListener('blur',restore);
  host.addEventListener('keydown',event=>{let index;if(event.key==='Home')index=0;else if(event.key==='End')index=points.length-1;else if(event.key==='ArrowLeft')index=(active<0?points.length:active)-1;else if(event.key==='ArrowRight')index=(active<0?-1:active)+1;else if(event.key==='Escape'){restore();return;}else return;event.preventDefault();show(index);});
  return {host,update(next,value,sub){
    baseValue=String(value);baseSub=String(sub);points=next;
    const nextSignature=JSON.stringify(points);
    if(signature!==nextSignature){
      signature=nextSignature;svg.setAttribute('viewBox',`0 0 ${Math.max(1,points.length)*10} 36`);title.textContent=points.map(point=>`${point.label} ${format(point.value)}`).join('；');
      while(bars.length>points.length)bars.pop().remove();
      while(bars.length<points.length){const group=svgNode('g'),bar=svgNode('rect',{class:'spark-bar',rx:1}),hit=svgNode('rect',{class:'spark-hit',y:0,width:10,height:36});group.append(bar,hit);svg.append(group);bars.push(group);}
      const max=Math.max(...points.map(point=>point.value),0)||1;
      for(const [index,point] of points.entries()){
        const group=bars[index],height=Math.max(2,point.value/max*30);
        group.dataset.sparkIndex=String(index);group.dataset.sparkValue=String(point.value);group.dataset.sparkLabel=point.label;group.classList.toggle('is-last',index===points.length-1);
        const [bar,hit]=group.children;bar.setAttribute('x',index*10+1);bar.setAttribute('width',8);bar.setAttribute('y',36-height);bar.setAttribute('height',height);hit.setAttribute('x',index*10);
      }
    }
    if(active>=0)show(active);else restore();
  },restore};
}
