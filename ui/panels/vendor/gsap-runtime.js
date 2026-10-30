// The pinned publisher build is UMD and must run as a classic script: importing
// it as strict ESM attempts to assign Window.window. Keep its bytes unchanged.
export let gsap=null;
export const gsapReady=typeof document==='undefined'||typeof document.createElement!=='function'||!document.head?Promise.resolve(null):new Promise(resolve=>{
  const script=document.createElement('script');script.src=new URL('./gsap-3.13.0.min.js',import.meta.url).href;
  let timer,done=false;
  function finish(value){if(done)return;done=true;clearTimeout(timer);script.remove();gsap=value;resolve(value);}
  script.onload=()=>finish(globalThis.gsap??null);
  script.onerror=()=>finish(null);
  timer=setTimeout(()=>finish(null),5000);
  document.head.append(script);
});
