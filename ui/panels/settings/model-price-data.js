export function priceCatalogue(providers,prices=[],stored=[]){
  const rows=new Map();const add=(id,vendor,name)=>{if(!id)return;const row=rows.get(id)??{id,names:[],vendors:[]};if(name&&!row.names.includes(name))row.names.push(name);if(vendor&&!row.vendors.includes(vendor))row.vendors.push(vendor);rows.set(id,row);};
  for(const provider of providers??[])for(const model of provider.models??[]){const id=typeof model==='string'?model:model?.id;add(id,provider.displayName||provider.id,provider.modelNames?.[id]||(typeof model==='object'?(model.name||model.displayName):''));}
  for(const entry of stored)add(entry.id,'自定义');for(const price of prices)add(price.id,'价格目录');return[...rows.values()];
}
