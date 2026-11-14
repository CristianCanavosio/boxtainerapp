#!/usr/bin/env node
// Graba los videos de la pestaña Recursos: abre la app con una base de prueba (mock-supabase.js + datos.js),
// sigue el guion de cada rol (carpeta guiones), y arma un MP4 con subtítulos y voz en español.
//
// Uso:   node tools/videos/grabar.js            (todos)
//        node tools/videos/grabar.js ventas lider   (solo esos)
// Requiere: Node 18+, Playwright con Chromium, ffmpeg con libass, y Piper para la voz (pip install piper-tts).
// La voz se baja sola la primera vez (ver VOZ_URL). Con SIN_VOZ=1 sale solo con subtítulos.
// Los MP4 quedan en web/recursos/videos/<clave>.mp4, que es lo que muestra la pestaña Recursos.
const fs=require('fs'), path=require('path'), crypto=require('crypto'), {execFileSync}=require('child_process');
const {chromium}=require('playwright');
const datos=require('./datos');

const RAIZ=path.resolve(__dirname,'../..'), WEB=path.join(RAIZ,'web'), SALIDA=path.join(WEB,'recursos/videos');
const TMP=path.join(__dirname,'.tmp'), CACHE=path.join(__dirname,'.cache');
const VOZ_URL='https://github.com/rhasspy/piper/releases/download/v0.0.2/voice-es-mls_10246-low.tar.gz';
const VOZ_ONNX=path.join(CACHE,'voz','es-mls_10246-low.onnx');
const ANCHO=390, ALTO=780, ESCALA=2, BANDA=250;      // celular de 390×780 px; banda de subtítulos abajo
const ORIGEN='https://app.prueba';   // https: la app usa crypto.randomUUID, que pide contexto seguro
const CDN_SUPABASE=/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js/;
[SALIDA,TMP,CACHE].forEach(d=>fs.mkdirSync(d,{recursive:true}));

// ── voz ──
function prepararVoz(){
  if(process.env.SIN_VOZ) return false;
  if(!fs.existsSync(VOZ_ONNX)){
    const dir=path.dirname(VOZ_ONNX); fs.mkdirSync(dir,{recursive:true});
    console.log('Bajando la voz de Piper…');
    execFileSync('curl',['-sSL','-o',path.join(dir,'v.tgz'),VOZ_URL]);
    execFileSync('tar',['xzf','v.tgz'],{cwd:dir});
  }
  return true;
}
function duracion(f){return Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',f]).toString().trim());}
function sintetizar(texto){
  const h=crypto.createHash('sha1').update(texto).digest('hex').slice(0,16), f=path.join(CACHE,h+'.wav');
  if(!fs.existsSync(f)) execFileSync('python3',['-m','piper','-m',VOZ_ONNX,'--length_scale','0.92','-f',f],{input:texto});
  return {archivo:f,dur:duracion(f)};
}
// La voz lee mejor sin emojis ni comillas
const paraVoz=t=>t.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}]/gu,'').replace(/["“”]/g,'').replace(/\s+/g,' ').trim();

// ── archivos de la app ──
const TIPOS={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.mp4':'video/mp4','.json':'application/json','.pdf':'application/pdf'};
async function rutas(page){
  await page.route('**/*',async route=>{
    const u=route.request().url();
    if(u.startsWith(ORIGEN)){
      let p=decodeURIComponent(new URL(u).pathname); if(p==='/') p='/index.html';
      const f=path.join(WEB,p);
      if(!f.startsWith(WEB)||!fs.existsSync(f)) return route.fulfill({status:404,body:''});
      return route.fulfill({status:200,body:fs.readFileSync(f),headers:{'content-type':TIPOS[path.extname(f)]||'application/octet-stream'}});
    }
    if(CDN_SUPABASE.test(u)) return route.fulfill({status:200,body:fs.readFileSync(path.join(__dirname,'mock-supabase.js')),headers:{'content-type':'application/javascript'}});
    return route.abort();
  });
}
// Punto que muestra dónde se toca
const CURSOR=`(()=>{const css=document.createElement('style');css.textContent=\`
#__dedo{position:fixed;z-index:2147483647;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50%;background:rgba(255,120,0,.35);border:2px solid rgba(255,120,0,.9);pointer-events:none;left:50%;top:110%;transition:left .45s ease,top .45s ease,transform .15s}
#__dedo.toca{transform:scale(.6);background:rgba(255,120,0,.7)}\`;
addEventListener('DOMContentLoaded',()=>{document.head.appendChild(css);const d=document.createElement('div');d.id='__dedo';document.body.appendChild(d);});})();`;

// ── subtítulos (ASS) ──
function tiempoASS(s){s=Math.max(0,s);const h=Math.floor(s/3600),m=Math.floor(s/60)%60,x=(s%60).toFixed(2).padStart(5,'0');return `${h}:${String(m).padStart(2,'0')}:${x}`;}
function armarASS(subs,titulo){
  const W=ANCHO*ESCALA, H=ALTO*ESCALA+BANDA;
  const esc=t=>t.replace(/\\/g,'').replace(/[{}]/g,'').replace(/\n/g,'\\N');
  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sub,DejaVu Sans,36,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,0,0,5,40,40,0,1
Style: Tit,DejaVu Sans,30,&H0000A5FF,&H0000A5FF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,0,0,8,40,40,${ALTO*ESCALA+14},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,${tiempoASS(0)},${tiempoASS(9999)},Tit,,0,0,0,,${esc(titulo)}
${subs.map(s=>`Dialogue: 0,${tiempoASS(s.ini)},${tiempoASS(s.fin)},Sub,,0,0,0,,{\\pos(${W/2},${ALTO*ESCALA+BANDA/2+18})}${esc(s.texto)}`).join('\n')}
`;
}

// ── lo que usan los guiones ──
function crearG(page,voz){
  const subs=[]; let t0=null;
  const ahora=()=>(Date.now()-t0)/1000;
  const g={
    page, U:datos.U, P:datos.P,
    empezar(){t0=Date.now();},
    // Muestra el subtítulo y lo dice. Si se pasa una función, la ejecuta mientras habla.
    async decir(texto,mientras){
      if(process.env.DEBUG) console.log('  ·',texto.slice(0,70));
      if(t0===null) g.empezar();
      const v=voz?sintetizar(paraVoz(texto)):{dur:Math.max(2.2,texto.length/14)};
      const ini=ahora(); subs.push({ini,fin:ini+v.dur+0.35,texto,audio:v.archivo});
      const espera=new Promise(r=>setTimeout(r,v.dur*1000+350));
      if(mientras) await mientras();
      await espera;
    },
    async pausa(ms){await page.waitForTimeout(ms??700);},
    loc(s){return typeof s==='string'?page.locator(s+' >> visible=true').first():s;},
    async mostrar(s){const l=g.loc(s); await l.scrollIntoViewIfNeeded(); await page.waitForTimeout(200);
      const b=await l.boundingBox(); if(b) await page.evaluate(([x,y])=>{const d=document.getElementById('__dedo');if(d){d.style.left=x+'px';d.style.top=y+'px';}},[b.x+b.width/2,b.y+b.height/2]);
      await page.waitForTimeout(450); return l;},
    async tocar(s,{espera=550}={}){
      const l=await g.mostrar(s);
      await page.evaluate(()=>{const d=document.getElementById('__dedo');if(d){d.classList.add('toca');setTimeout(()=>d.classList.remove('toca'),180);}});
      await l.click(); await page.waitForTimeout(espera);
    },
    async escribir(s,texto){const l=await g.mostrar(s); await l.click(); await l.pressSequentially(texto,{delay:28}); await page.waitForTimeout(300);},
    async valor(s,v){const l=await g.mostrar(s); await l.fill(v); await page.waitForTimeout(400);},
    async elegir(s,v){const l=await g.mostrar(s); await l.selectOption(v); await page.waitForTimeout(500);},
    async deslizar(px){await page.mouse.wheel(0,px); await page.waitForTimeout(600);},
    async arriba(sel){await page.evaluate(s=>{const e=s?document.querySelector(s):document.scrollingElement;if(e)e.scrollTo({top:0,behavior:'smooth'});},sel||null); await page.waitForTimeout(500);},
    async pestana(v){await g.tocar(`.nav-btn[data-view="${v}"]`);},
    // opción de la nota de pedido (botones .op)
    async op(k,v,o){await g.tocar(`#nota .op[data-k="${k}"][data-v="${v}"]`,o);},
    async siguiente(){
      const antes=await page.textContent('#np-h-sub');
      await g.tocar('#np-b-sig',{espera:900});
      if(await page.textContent('#np-h-sub')===antes) throw new Error('La nota no avanzó: '+(await page.locator('#np-app .err').allTextContents()).join(' | '));
      await g.arriba('#np-app');},
    async abrirProyecto(id){await g.pestana('proyectos'); await g.tocar(`#view-proyectos [onclick*="verDetalle('${id}')"]`,{espera:1000});},
    async cerrar(m='m-det'){await g.tocar(`#${m} button[onclick="closeOverlay('${m}')"]`);},
    // toca el botón que abre el selector de archivos y elige el archivo
    async subir(s,archivo){const [fc]=await Promise.all([page.waitForEvent('filechooser'),g.tocar(s,{espera:300})]); await fc.setFiles(archivo); await page.waitForTimeout(800);},
    archivos:{},
    dia(n){const d=new Date();d.setDate(d.getDate()+n);return d.toISOString().slice(0,10);},
    subs, inicio:()=>t0,
  };
  return g;
}

// Archivos que se suben en los videos: un plano de ejemplo (PDF) y un video cualquiera
async function archivosDePrueba(browser){
  const plano=path.join(TMP,'Plano Constructora Demo.pdf');
  if(!fs.existsSync(plano)){
    const p=await browser.newPage();
    await p.setContent(`<div style="font:16px sans-serif;padding:40px"><h2>Plano de ejemplo · Oficina 20 DV</h2>
      <svg width="600" height="260" style="border:2px solid #333"><rect x="10" y="10" width="580" height="240" fill="none" stroke="#333" stroke-width="3"/>
      <line x1="380" y1="10" x2="380" y2="250" stroke="#333" stroke-width="3"/><text x="150" y="135">Oficina</text><text x="460" y="135">Baño</text></svg>
      <p>Datos de prueba para el video.</p></div>`);
    await p.pdf({path:plano,format:'A4',landscape:true}); await p.close();
  }
  const video=path.join(TMP,'video-nuevo.mp4');
  if(!fs.existsSync(video)) execFileSync('ffmpeg',['-y','-v','error','-f','lavfi','-i','color=c=0xE8750A:s=360x640:d=2','-c:v','libx264','-pix_fmt','yuv420p',video]);
  return {plano,video};
}

// Graba la pantalla con el screencast de Chrome a resolución completa (el video de Playwright
// sale a la mitad de resolución). Cada cuadro se guarda con la hora en que llegó.
async function filmar(ctx,page,nombre){
  const dir=path.join(TMP,'cuadros-'+nombre); fs.rmSync(dir,{recursive:true,force:true}); fs.mkdirSync(dir);
  const cdp=await ctx.newCDPSession(page), lista=[];
  cdp.on('Page.screencastFrame',ev=>{
    const f=path.join(dir,String(lista.length).padStart(6,'0')+'.jpg');
    fs.writeFileSync(f,Buffer.from(ev.data,'base64')); lista.push({f,t:Date.now()});
    cdp.send('Page.screencastFrameAck',{sessionId:ev.sessionId}).catch(()=>{});
  });
  await cdp.send('Page.startScreencast',{format:'jpeg',quality:90,maxWidth:ANCHO*ESCALA,maxHeight:ALTO*ESCALA,everyNthFrame:1});
  // fuerza un cuadro de arranque
  await page.evaluate(()=>{document.body.style.outline='1px solid transparent';}); await page.waitForTimeout(300);
  return {async terminar(t0,total){
    await cdp.send('Page.stopScreencast').catch(()=>{});
    // lista para ffmpeg (concat): cada cuadro dura hasta el siguiente; arranca en t0
    const fin=t0+total*1000; let txt='', previo=null;
    const usados=lista.filter(x=>x.t<fin);
    const iniIdx=Math.max(0,usados.findLastIndex(x=>x.t<=t0));
    const sel=usados.slice(iniIdx);
    sel.forEach((x,i)=>{const desde=Math.max(x.t,t0), hasta=i+1<sel.length?Math.max(sel[i+1].t,t0):fin;
      txt+=`file '${x.f}'\nduration ${((hasta-desde)/1000).toFixed(3)}\n`; previo=x.f;});
    if(previo) txt+=`file '${previo}'\n`;
    const out=path.join(dir,'lista.txt'); fs.writeFileSync(out,txt); return out;
  }};
}

async function grabar(nombre,voz){
  const guion=require('./guiones/'+nombre);
  const user=datos.U[guion.usuario];
  // la voz se genera antes de grabar, para que no queden pausas en el video
  if(voz){const src=fs.readFileSync(require.resolve('./guiones/'+nombre),'utf8');
    for(const m of src.matchAll(/g\.decir\('((?:[^'\\]|\\.)*)'/g)) sintetizar(paraVoz(m[1].replace(/\\'/g,"'")));}
  const db=datos(); if(guion.preparar) guion.preparar(db,datos);
  const browser=await chromium.launch({args:['--lang=es-AR']});
  const ctx=await browser.newContext({viewport:{width:ANCHO,height:ALTO},deviceScaleFactor:ESCALA,locale:'es-AR',timezoneId:'America/Argentina/Cordoba',
    hasTouch:false});
  await ctx.addInitScript(([db,me])=>{window.__MOCK_DB=db;window.__MOCK_ME=me;},[db,{id:user.id,email:user.email,nombre:user.nombre}]);
  await ctx.addInitScript(CURSOR);
  const page=await ctx.newPage();
  page.setDefaultTimeout(15000);
  page.on('dialog',d=>d.accept());
  page.on('pageerror',e=>console.warn('  [error en la página]',e.message));
  await rutas(page);
  await page.goto(ORIGEN+'/');
  await page.waitForSelector('#screen-app',{state:'visible',timeout:15000});
  await page.waitForTimeout(1500);
  const g=crearG(page,voz);
  g.archivos=await archivosDePrueba(browser);
  if(guion.antes) await guion.antes(g);
  const cuadros=await filmar(ctx,page,nombre);
  g.empezar();
  await guion.guion(g);
  await page.waitForTimeout(1200);
  const total=(Date.now()-g.inicio())/1000;
  const video=await cuadros.terminar(g.inicio(),total);
  await ctx.close(); await browser.close();
  // ── armado final: recorta la carga, agrega la banda con subtítulos y la voz ──
  const ass=path.join(TMP,nombre+'.ass'); fs.writeFileSync(ass,armarASS(g.subs,guion.titulo));
  const conAudio=g.subs.filter(s=>s.audio);
  const args=['-y','-v','error','-f','concat','-safe','0','-i',video];
  conAudio.forEach(s=>args.push('-i',s.audio));
  const fondo='0x1F2937';
  let filtro=`[0:v]scale=${ANCHO*ESCALA}:${ALTO*ESCALA},setsar=1,pad=${ANCHO*ESCALA}:${ALTO*ESCALA+BANDA}:0:0:color=${fondo},ass='${ass.replace(/'/g,"\\'")}',scale=720:-2,fps=20,format=yuv420p[v]`;
  if(conAudio.length){
    filtro+=';'+conAudio.map((s,i)=>`[${i+1}:a]adelay=${Math.round(s.ini*1000)}:all=1[a${i}]`).join(';')
      +';'+conAudio.map((_,i)=>`[a${i}]`).join('')+`amix=inputs=${conAudio.length}:normalize=0,apad,atrim=0:${total.toFixed(2)},aresample=44100[a]`;
  }
  const out=path.join(SALIDA,nombre+'.mp4');
  args.push('-filter_complex',filtro,'-map','[v]');
  if(conAudio.length) args.push('-map','[a]','-c:a','aac','-b:a','64k','-ac','1');
  args.push('-c:v','libx264','-preset','slow','-crf','30','-movflags','+faststart',out);
  execFileSync('ffmpeg',args,{stdio:'inherit'});
  fs.rmSync(path.dirname(video),{recursive:true,force:true});
  console.log(`✔ ${nombre}: ${total.toFixed(0)} s, ${(fs.statSync(out).size/1048576).toFixed(1)} MB → ${path.relative(RAIZ,out)}`);
}

(async()=>{
  const todos=fs.readdirSync(path.join(__dirname,'guiones')).filter(f=>f.endsWith('.js')).map(f=>f.slice(0,-3));
  const pedidos=process.argv.slice(2), lista=pedidos.length?pedidos:todos;
  const voz=prepararVoz();
  for(const n of lista){
    if(!todos.includes(n)){console.error('No existe el guion',n);process.exitCode=1;continue;}
    try{await grabar(n,voz);}catch(e){console.error('✘',n,e.message.split('\n')[0]);process.exitCode=1;}
  }
})();
