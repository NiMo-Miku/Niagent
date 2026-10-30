// Real native outputs, not filter-string assertions. ffmpeg is an optional
// runtime capability; when installed, all dimensions and process lifetimes are
// verified using new synthetic files, with no external requests or accounts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {createMediaReader} from '../bundled/media-service/reader.js';

const binary=(command,args)=>{
  const r=childProcess.spawnSync(command,args,{windowsHide:true,encoding:'utf8',timeout:30000,maxBuffer:2*1024*1024});
  assert.equal(r.status,0,`${command}: ${r.error?.message||r.stderr}`);return r.stdout;
};
const haveNative=['ffmpeg','ffprobe'].every(name=>childProcess.spawnSync(name,['-version'],{windowsHide:true,timeout:5000}).status===0);
if(!haveNative){console.log('SKIP 213 native media dimensions: optional ffmpeg/ffprobe unavailable; provider/fallback tests remain in 81.');process.exit(0);}

const root=fs.mkdtempSync(path.join(os.tmpdir(),'qqa-media213-'));
const readers=[],temps=[],children=[],closed=[];let server,onSpawn=null,requests=0;
const originalSpawn=childProcess.spawn,originalMkdtemp=fs.promises.mkdtemp;
childProcess.spawn=function(command,args,options){
  assert.equal(options.windowsHide,true,'native media commands do not open windows');
  const child=originalSpawn.call(this,command,args,options),record={command,args:[...args],pid:child.pid,exited:false};children.push(record);
  closed.push(new Promise(resolve=>child.once('close',()=>{record.exited=true;resolve();})));
  const hook=onSpawn;if(hook)queueMicrotask(()=>hook(args,child));return child;
};
syncBuiltinESMExports();
fs.promises.mkdtemp=async function(prefix,...args){const dir=await originalMkdtemp.call(this,prefix,...args);if(String(prefix).includes(`qqa-media-${process.pid}-`))temps.push(dir);return dir;};
const dims=file=>{
  const info=JSON.parse(binary('ffprobe',['-v','error','-show_streams','-of','json',file]));
  const video=info.streams.find(stream=>stream.codec_type==='video');
  return{width:video.width,height:video.height,frames:Number(video.nb_frames)||0};
};
const decode=(part,name)=>{
  const data=part?.image_url?.url||part?.video_url?.url;assert.match(data,/^data:(image|video)\//);
  const file=path.join(root,name);fs.writeFileSync(file,Buffer.from(data.split(',')[1],'base64'));
  return{...dims(file),bytes:fs.statSync(file).size};
};
const noTemps=()=>{for(const dir of temps)assert.equal(fs.existsSync(dir),false,`temporary directory cleaned: ${dir}`);};
const make=(file,args)=>{binary('ffmpeg',['-y','-v','error',...args,file]);return file;};
const imageInput=file=>({file:`data:image/${path.extname(file)==='.gif'?'gif':'png'};base64,${fs.readFileSync(file).toString('base64')}`});
const gif=(name,size)=>make(path.join(root,name),['-f','lavfi','-i',`testsrc=size=${size}:rate=4:duration=1`,'-f','gif']);
const movie=(name,size)=>make(path.join(root,name),['-f','lavfi','-i',`testsrc2=size=${size}:rate=4:duration=1`,'-c:v','libx264','-pix_fmt','yuv420p']);
const picture=(name,size)=>make(path.join(root,name),['-f','lavfi','-i',`testsrc=size=${size}`,'-frames:v','1','-compression_level','0']);
try{
  const smallGif=gif('small.gif','64x48'),oddGif=gif('odd.gif','65x49'),largeGif=gif('large.gif','800x600');
  const tinyGif=path.join(root,'tiny.gif');fs.writeFileSync(tinyGif,Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64'));
  const smallPng=picture('small.png','512x384'),largePng=picture('large.png','1800x900');
  assert.ok(fs.statSync(smallPng).size>512*1024,'real uncompressed PNG enters the compression path');
  assert.ok(fs.statSync(largePng).size<5*1024*1024,'large dimensions still obey the default download limit');
  const smallVideo=movie('small.mp4','128x96'),largeVideo=movie('large.mp4','1920x1080');
  server=http.createServer((req,res)=>{requests++;res.end(fs.readFileSync(smallVideo));});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  assert.notEqual(server.address().port,15967);const url=`http://127.0.0.1:${server.address().port}/video.mp4`;
  const cfg={api:{vision:true,video:true,videoMode:'native'},security:{allowPrivateImageHosts:true},skills:{'video-frames':{enabled:true}}};let supportsGif=true;
  const capability={providers:name=>name==='image.mime-support'?[{provider:()=>supportsGif}]:[]};
  const reader=createMediaReader({cfg:()=>cfg,capability,log:{warn(){},error(){}}});readers.push(reader);
  const results={};
  for(const [name,file,expected] of [['small',smallGif,[64,48]],['odd',oddGif,[64,48]],['large',largeGif,[480,360]],['tiny',tinyGif,[2,2]]]){
    const result=await reader.imageParts(imageInput(file));assert.equal(result.converted,'gif-video');
    const output=decode(result.parts[0],`${name}-gif.mp4`);assert.deepEqual([output.width,output.height],expected);assert.ok(output.frames>0&&output.frames<=24);assert.ok(output.bytes<=8*1024*1024);results[name+'GifVideo']=output;noTemps();
  }
  console.log('✓ 213 GIF video keeps small/odd dimensions, bounds large inputs and handles the two-pixel encoder floor');
  cfg.api.video=false;supportsGif=false;
  for(const [name,file,expected] of [['small',smallGif,[64,48]],['large',largeGif,[768,576]],['tiny',tinyGif,[1,1]]]){
    const result=await reader.imageParts(imageInput(file));assert.equal(result.converted,'gif-first-frame');
    const output=decode(result.parts[0],`${name}-first.png`);assert.deepEqual([output.width,output.height],expected);assert.ok(output.bytes<=4*1024*1024);results[name+'FirstFrame']=output;noTemps();
  }
  for(const [name,file,expected] of [['small',smallPng,[512,384]],['large',largePng,[1568,784]]]){
    const result=await reader.imageParts(imageInput(file)),output=decode(result.parts[0],`${name}-compressed.jpg`);
    assert.deepEqual([output.width,output.height],expected);assert.ok(output.bytes<fs.statSync(file).size);results[name+'Image']=output;noTemps();
  }
  console.log('✓ 213 first-frame fallback and image compression never enlarge small sources and retain output byte limits');
  cfg.api.video=true;
  for(const [name,file,expected] of [['small',smallVideo,[128,96]],['large',largeVideo,[480,270]]]){
    cfg.api.videoMode='native';const result=await reader.probe({path:file,url});assert.equal(result.route,'native');
    const output=decode(result.parts[0],`${name}-native.mp4`);assert.deepEqual([output.width,output.height],expected);assert.ok(output.bytes<=20*1024*1024);results[name+'Native']=output;noTemps();
  }
  for(const [name,file,expected] of [['small',smallVideo,[128,96]],['large',largeVideo,[1568,882]]]){
    cfg.api.videoMode='frames';const result=await reader.probe({path:file},{count:2});assert.equal(result.route,'frames');assert.equal(result.parts.length,2);
    for(const [i,part] of result.parts.entries()){const output=decode(part,`${name}-frame-${i}.jpg`);assert.deepEqual([output.width,output.height],expected);assert.ok(output.bytes<=4*1024*1024);results[name+'Frame'+i]=output;}
    noTemps();
  }
  console.log('✓ 213 native video and extracted frames keep small inputs and proportionally shrink large inputs');
  const customUrl='data:image/png;base64,'+fs.readFileSync(smallPng).toString('base64');let providerCalls=0;
  const provided=createMediaReader({cfg:()=>cfg,capability:{providers:name=>name==='video.frames'?[{provider:(_media,options)=>{providerCalls++;assert.equal(options.frames,2);return{parts:[{type:'image_url',image_url:{url:customUrl}}]};}}]:[]},log:{warn(){}}});readers.push(provided);
  const before=children.length,custom=await provided.probe({path:smallVideo},{count:2});assert.equal(custom.parts[0].image_url.url,customUrl);assert.equal(providerCalls,1);assert.equal(children.slice(before).some(child=>child.args.includes('-vf')),false,'selected frame provider bypasses the native extraction default');noTemps();
  console.log('✓ 213 selected frame capability is consumed without applying the native resize default');
  const cancelReader=createMediaReader({cfg:()=>cfg,log:{warn(){}}});readers.push(cancelReader);let cancelledChild;
  onSpawn=(args,child)=>{if(args.some(arg=>String(arg).endsWith('frame-1.jpg'))){cancelledChild=child.pid;cancelReader.close();}};
  await assert.rejects(cancelReader.probe({path:smallVideo},{count:3}),/服务已关闭/);onSpawn=null;assert.ok(cancelledChild,'close cancels an actually started native frame process');noTemps();
  cfg.api.video=true;const abortedReader=createMediaReader({cfg:()=>cfg,log:{warn(){}}});readers.push(abortedReader);const controller=new AbortController();let abortedChild;
  onSpawn=(args,child)=>{if(args.some(arg=>String(arg).endsWith('gif.mp4'))){abortedChild=child.pid;controller.abort(new Error('synthetic media213 cancellation'));}};
  await assert.rejects(abortedReader.imageParts(imageInput(smallGif),{signal:controller.signal}),/synthetic media213 cancellation/);onSpawn=null;assert.ok(abortedChild);noTemps();
  await Promise.all(closed);assert.ok(children.every(child=>child.exited));assert.equal(requests,0,'path localization does not make unneeded downloads');
  console.log('✓ 213 close/AbortSignal wait for native child exit and clean every temporary directory');
  console.log(JSON.stringify({status:'passed',native:true,results,nativeChildren:children.length,childrenExited:true,tempDirectories:temps.length,tempCleaned:true,externalRequests:0}));
}finally{
  onSpawn=null;for(const reader of readers)reader.close();await Promise.all(closed);childProcess.spawn=originalSpawn;syncBuiltinESMExports();fs.promises.mkdtemp=originalMkdtemp;
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('qqa-media213-'));fs.rmSync(root,{recursive:true,force:true});
}
