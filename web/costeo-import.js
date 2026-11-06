// ════════════════════════════════════════════════
// PRECIOS DE PROVEEDORES: importar Excel/CSV, PDF o cargar a mano (solo administrador)
// Cada fila importada queda en el catálogo del proveedor (precios_proveedor). Si se vincula
// a un ítem de la lista de costos, ese ítem toma el precio. Los vínculos se recuerdan:
// la próxima lista del mismo proveedor actualiza sola los ítems ya vinculados.
// ════════════════════════════════════════════════
let preciosProv=[];          // filas de precios_proveedor
let proveedoresListo=false;  // false si falta la migración 0005
const LIB_XLSX='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
const LIB_PDF='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const LIB_PDF_W='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

async function cargarProveedores(){
  preciosProv=[]; proveedoresListo=false;
  if(perfiles[myId]?.rol!=='admin') return;
  try{preciosProv=await traerSinOrden('precios_proveedor'); proveedoresListo=true;}
  catch(e){console.warn('Precios de proveedores no disponibles (¿falta la migración 0005?)',e);}
}
function cargarLib(src){return new Promise((ok,mal)=>{if(document.querySelector(`script[src="${src}"]`)){ok();return}
  const s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=()=>mal(new Error('No se pudo cargar '+src));document.head.appendChild(s)})}

// ── texto y números ──
const normTxt=t=>String(t||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
// "1.234,56" / "1,234.56" / "1234.5" / "$ 12.000" -> número
function numAR(v){
  if(typeof v==='number') return v;
  let t=String(v||'').replace(/[^\d.,-]/g,''); if(!t) return NaN;
  const c=t.lastIndexOf(','), p=t.lastIndexOf('.');
  if(c>p) t=t.replace(/\./g,'').replace(',','.');           // formato argentino
  else if(p>c&&c>=0) t=t.replace(/,/g,'');                  // formato inglés con miles
  else if(c<0&&(t.match(/\./g)||[]).length>1) t=t.replace(/\./g,'');
  else if(c<0&&/\.\d{3}$/.test(t)) t=t.replace('.','');     // "12.000" = doce mil
  return Number(t);
}
// sugiere el ítem de la lista más parecido a una descripción de proveedor
function sugerirClave(desc,prov,codigo){
  const prev=preciosProv.filter(x=>x.clave&&x.proveedor===prov&&((codigo&&x.codigo===codigo)||normTxt(x.descripcion)===normTxt(desc)))
    .sort((a,b)=>String(b.creado_en).localeCompare(String(a.creado_en)))[0];
  if(prev) return {clave:prev.clave,por:'vínculo anterior'};
  const td=new Set(normTxt(desc).split(' ').filter(w=>w.length>1));
  let mejor=null, pm=0;
  catalogoCostos().forEach(it=>{
    const tc=normTxt(it.clave).split(' ').filter(w=>w.length>1); if(!tc.length) return;
    const s=tc.filter(w=>td.has(w)).length/tc.length;
    if(s>pm){pm=s;mejor=it.clave;}
  });
  return pm>=0.6?{clave:mejor,por:'parecido'}:null;
}

// ── pantalla de importación ──
let imp=null; // {fuente, archivo:File|null, filas:[{desc,codigo,unidad,costo,usar,clave}], cols, matriz}
function modalImport(){
  let m=document.getElementById('m-import');
  if(!m){m=document.createElement('div');m.className='overlay';m.id='m-import';m.style.zIndex='260';
    m.innerHTML='<div class="modal" id="m-import-body"></div>';document.body.appendChild(m);}
  return m;
}
function abrirImport(fuente){
  if(!proveedoresListo){toast('⚠️ Primero hay que correr la migración 0005 en Supabase');return;}
  imp={fuente,archivo:null,filas:fuente==='manual'?[{desc:'',codigo:'',unidad:'c/u',costo:'',usar:true,clave:''}]:[],
    prov:'',moneda:'USD',tc:'',fecha:hoyISO(),cols:null,matriz:null};
  modalImport().classList.add('active'); pintarImport();
}
function cerrarImport(){const m=document.getElementById('m-import'); if(m) m.classList.remove('active'); imp=null;}
function opcionesClave(sel){
  return '<option value="">— Sin vincular (queda en el catálogo del proveedor) —</option>'+
    catalogoCostos().map(x=>`<option value="${esc(x.clave)}" ${x.clave===sel?'selected':''}>${esc(x.clave)}</option>`).join('');
}
function pintarImport(){
  const b=document.getElementById('m-import-body'); if(!b||!imp) return;
  const tit={excel:'📥 Importar Excel o CSV',pdf:'📄 Importar PDF de proveedor',manual:'✍️ Cargar precios a mano'}[imp.fuente];
  const cols=imp.cols, mat=imp.matriz;
  b.innerHTML=`<div class="modal-handle"></div><div class="modal-title">${tit}</div>
    <div class="form-2">
      <div class="fg"><label>Proveedor *</label><input id="im-prov" value="${esc(imp.prov)}" placeholder="Ej: Corralón Norte" list="im-provs">
        <datalist id="im-provs">${[...new Set(preciosProv.map(x=>x.proveedor))].map(p=>`<option value="${esc(p)}">`).join('')}</datalist></div>
      <div class="fg"><label>Fecha del presupuesto</label><input type="date" id="im-fecha" value="${esc(imp.fecha)}"></div>
      <div class="fg"><label>Moneda</label><select id="im-mon"><option ${imp.moneda==='USD'?'selected':''}>USD</option><option ${imp.moneda==='ARS'?'selected':''}>ARS</option></select></div>
      <div class="fg" style="${imp.moneda==='ARS'?'':'display:none'}"><label>Dólar (ARS por USD) *</label><input type="number" id="im-tc" value="${esc(imp.tc)}" placeholder="Ej: 1450"></div>
    </div>
    ${imp.fuente!=='manual'&&!imp.archivo?`<label class="btn btn-nar" style="cursor:pointer;display:flex">${imp.fuente==='pdf'?'📄 Elegir PDF':'📥 Elegir Excel o CSV'}
      <input type="file" accept="${imp.fuente==='pdf'?'application/pdf':'.xlsx,.xls,.csv,.ods'}" style="display:none" onchange="leerArchivoImport(this)"></label>
      <div style="font-size:12px;color:var(--gris-m);margin-top:6px">${imp.fuente==='pdf'?'Se lee el texto del PDF y se proponen las líneas que terminan en un precio. Revisalas antes de guardar. Si el PDF es una foto escaneada no tiene texto: cargalo a mano.':'Necesita una columna con la descripción y otra con el precio. Código y unidad son opcionales.'}</div>`:''}
    ${imp.archivo?`<div class="auto-np">📎 ${esc(imp.archivo.name)} · se guarda como respaldo del precio</div>`:''}
    ${cols&&mat?`<div class="im-cols">${['desc','costo','codigo','unidad'].map(k=>`<div class="fg"><label>${{desc:'Columna descripción *',costo:'Columna precio *',codigo:'Columna código',unidad:'Columna unidad'}[k]}</label>
      <select onchange="imp.cols['${k}']=this.value===''?null:+this.value;filasDesdeMatriz();pintarImport()"><option value="">—</option>${mat[imp.cols.cab].map((h,i)=>`<option value="${i}" ${cols[k]===i?'selected':''}>${esc(String(h||'Columna '+(i+1)).slice(0,30))}</option>`).join('')}</select></div>`).join('')}</div>`:''}
    ${imp.filas.length?`<div class="im-res">${imp.filas.filter(f=>f.usar).length} de ${imp.filas.length} filas · ${imp.filas.filter(f=>f.usar&&f.clave).length} vinculadas a la lista de costos</div>
    <div class="im-filas">${imp.filas.map((f,i)=>`<div class="im-f ${f.usar?'':'off'}">
      <label class="im-chk"><input type="checkbox" ${f.usar?'checked':''} onchange="imp.filas[${i}].usar=this.checked;pintarImport()"></label>
      <div class="im-d">
        ${imp.fuente==='excel'?`<b>${esc(f.desc)}</b><small>${f.codigo?'Cód. '+esc(f.codigo)+' · ':''}${esc(f.unidad||'')}</small>`
          :`<input value="${esc(f.desc)}" placeholder="Descripción" onchange="imp.filas[${i}].desc=this.value">`}
        <select onchange="imp.filas[${i}].clave=this.value;imp.filas[${i}].por='';pintarImport()">${opcionesClave(f.clave)}</select>
        ${f.clave&&f.por?`<small style="color:var(--verde)">Sugerido por ${esc(f.por)}</small>`:''}
      </div>
      <input class="im-p" type="number" step="0.01" value="${esc(f.costo)}" placeholder="Precio" onchange="imp.filas[${i}].costo=this.value">
    </div>`).join('')}</div>`:''}
    ${imp.fuente==='manual'?`<button class="btn btn-sec btn-sm" onclick="imp.filas.push({desc:'',codigo:'',unidad:'c/u',costo:'',usar:true,clave:''});pintarImport()">＋ Otra fila</button>`:''}
    <div class="flex-btns" style="margin-top:12px"><button class="btn btn-sec" onclick="cerrarImport()">Cancelar</button>
      <button class="btn btn-nar" id="im-ok" onclick="guardarImport()">💾 Guardar precios</button></div>`;
  b.querySelector('#im-prov').oninput=e=>{imp.prov=e.target.value};
  b.querySelector('#im-fecha').onchange=e=>{imp.fecha=e.target.value};
  b.querySelector('#im-mon').onchange=e=>{imp.moneda=e.target.value;pintarImport()};
  b.querySelector('#im-tc').oninput=e=>{imp.tc=e.target.value};
}
async function leerArchivoImport(input){
  const f=input.files[0]; if(!f) return;
  imp.prov=document.getElementById('im-prov').value.trim()||imp.prov;
  try{
    if(imp.fuente==='pdf') await leerPDF(f); else await leerExcel(f);
    imp.archivo=f;
    if(!imp.filas.length) toast(imp.fuente==='pdf'?'⚠️ No se encontraron líneas con precio en el PDF (¿es una foto?). Cargalo a mano.':'⚠️ No se encontraron filas con precio');
  }catch(e){console.error(e);toast('⚠️ No se pudo leer el archivo: '+e.message);}
  pintarImport();
}
async function leerExcel(f){
  await cargarLib(LIB_XLSX);
  const wb=XLSX.read(await f.arrayBuffer(),{type:'array'});
  const hoja=wb.Sheets[wb.SheetNames[0]];
  const mat=XLSX.utils.sheet_to_json(hoja,{header:1,raw:true,defval:''}).filter(r=>r.some(c=>String(c).trim()!==''));
  // fila de encabezados: la primera con al menos 2 textos dentro de las primeras 15
  let cab=0; for(let i=0;i<Math.min(15,mat.length);i++){if(mat[i].filter(c=>typeof c==='string'&&c.trim()&&isNaN(numAR(c))).length>=2){cab=i;break}}
  const h=mat[cab].map(normTxt), busca=re=>{const i=h.findIndex(x=>re.test(x));return i<0?null:i};
  imp.matriz=mat;
  imp.cols={cab,desc:busca(/desc|detalle|articulo|producto|item|concepto|nombre/),costo:busca(/precio|costo|importe|unit|valor|p u/),
    codigo:busca(/cod|sku|ref/),unidad:busca(/^u$|unid|u m|medida/)};
  if(imp.cols.desc==null) imp.cols.desc=0;
  if(imp.cols.costo==null){ // la última columna con números
    for(let i=mat[cab].length-1;i>=0;i--) if(mat.slice(cab+1,cab+6).some(r=>!isNaN(numAR(r[i]))&&String(r[i]).trim()!=='')){imp.cols.costo=i;break}}
  filasDesdeMatriz();
}
function filasDesdeMatriz(){
  const c=imp.cols, prov=imp.prov;
  imp.filas=imp.matriz.slice(c.cab+1).map(r=>{
    const desc=String(r[c.desc]??'').trim(), costo=numAR(r[c.costo]);
    if(!desc||!(costo>0)) return null;
    const codigo=c.codigo!=null?String(r[c.codigo]??'').trim():'', unidad=c.unidad!=null?String(r[c.unidad]??'').trim():'';
    const s=sugerirClave(desc,prov,codigo);
    return {desc,codigo,unidad,costo:Math.round(costo*100)/100,usar:true,clave:s?.clave||'',por:s?.por||''};
  }).filter(Boolean);
}
async function leerPDF(f){
  await cargarLib(LIB_PDF);
  pdfjsLib.GlobalWorkerOptions.workerSrc=LIB_PDF_W;
  const pdf=await pdfjsLib.getDocument({data:new Uint8Array(await f.arrayBuffer())}).promise;
  const lineas=[];
  for(let n=1;n<=pdf.numPages;n++){
    const tc=await (await pdf.getPage(n)).getTextContent();
    const porY={};
    tc.items.forEach(it=>{if(!it.str.trim())return;const y=Math.round(it.transform[5]/3);(porY[y]=porY[y]||[]).push({x:it.transform[4],t:it.str})});
    Object.keys(porY).sort((a,b)=>b-a).forEach(y=>lineas.push(porY[y].sort((a,b)=>a.x-b.x).map(z=>z.t).join(' ').replace(/\s+/g,' ').trim()));
  }
  // Cada línea: descripción + números al final (cantidad, unitario, total). Se toma el unitario:
  // el anteúltimo si hay 3 o más números, si no el último.
  const esNum=t=>/^\$?-?[\d.,]*\d[\d.,]*$/.test(t)||t==='$'||/^(u\$s|usd|ars)$/i.test(t);
  imp.filas=lineas.map(l=>{
    const tk=l.split(' '); let i=tk.length;
    while(i>0&&esNum(tk[i-1])) i--;
    const nums=tk.slice(i).map(numAR).filter(v=>v>0);
    const desc=tk.slice(0,i).join(' ').replace(/[\s$|:-]+$/,'').trim();
    if(!nums.length||desc.replace(/[^a-záéíóúñ]/gi,'').length<4||/^(sub)?total|iva|fecha|cuit|tel|p[aá]gina|bonif|descuento/i.test(desc)) return null;
    const precio=nums.length>=3?nums[nums.length-2]:nums[nums.length-1];
    const s=sugerirClave(desc,imp.prov,'');
    return {desc,codigo:'',unidad:'',costo:Math.round(precio*100)/100,usar:true,clave:s?.clave||'',por:s?.por||''};
  }).filter(Boolean);
}
async function guardarImport(){
  if(!imp) return;
  imp.prov=document.getElementById('im-prov').value.trim();
  if(!imp.prov){toast('⚠️ Poné el nombre del proveedor');return;}
  const tc=numAR(imp.tc);
  if(imp.moneda==='ARS'&&!(tc>0)){toast('⚠️ Poné el valor del dólar para pasar los precios a USD');return;}
  const filas=imp.filas.filter(f=>f.usar&&String(f.desc).trim()&&numAR(f.costo)>0);
  if(!filas.length){toast('⚠️ No hay filas con descripción y precio');return;}
  const ok=document.getElementById('im-ok'); ok.disabled=true; ok.textContent='Guardando…';
  try{
    let ruta=null;
    if(imp.archivo){
      const seguro=imp.archivo.name.normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^\w.\-]+/g,'_').slice(-80);
      ruta=`proveedores/${nuevoId()}-${seguro}`;
      chk(await sb.storage.from('costos').upload(ruta,imp.archivo,{contentType:imp.archivo.type||'application/octet-stream'}));
    }
    const usd=v=>imp.moneda==='ARS'?Math.round(numAR(v)/tc*100)/100:Math.round(numAR(v)*100)/100;
    const nuevas=filas.map(f=>({id:nuevoId(),proveedor:imp.prov,codigo:f.codigo||null,descripcion:String(f.desc).trim(),unidad:f.unidad||null,
      costo:usd(f.costo),costo_original:numAR(f.costo),moneda:imp.moneda,tipo_cambio:imp.moneda==='ARS'?tc:null,
      fuente:imp.fuente,archivo:ruta,fecha:imp.fecha||hoyISO(),clave:f.clave||null}));
    chk(await sb.from('precios_proveedor').insert(nuevas));
    preciosProv.push(...nuevas.map(x=>({...x,creado_en:new Date().toISOString()})));
    // los vinculados pasan a la lista de costos
    const vinc=nuevas.filter(x=>x.clave);
    for(const x of vinc){
      const prev=listaCostos[x.clave];
      const fila={clave:x.clave,costo:x.costo,rubro:prev?.rubro||catalogoCostos().find(c=>c.clave===x.clave)?.rubro||'mat',
        unidad:prev?.unidad||catalogoCostos().find(c=>c.clave===x.clave)?.unidad||'c/u',proveedor:x.proveedor,fuente:x.fuente,referencia:x.archivo};
      chk(await sb.from('lista_costos').upsert(fila,{onConflict:'clave'}));
      listaCostos[x.clave]={...(prev||{}),...fila};
    }
    toast(`✅ ${nuevas.length} precios guardados de ${imp.prov}${vinc.length?` · ${vinc.length} ítems de la lista actualizados`:''}`);
    cerrarImport(); renderCostos();
  }catch(e){toast(msgError(e)); ok.disabled=false; ok.textContent='💾 Guardar precios';}
}

// ── usar el precio de otro proveedor para un ítem ──
function preciosDeClave(clave){return preciosProv.filter(x=>x.clave===clave).sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha))||String(b.creado_en).localeCompare(String(a.creado_en)))}
async function usarPrecioProv(id){
  const x=preciosProv.find(y=>y.id===id); if(!x) return;
  const prev=listaCostos[x.clave]||{};
  const fila={clave:x.clave,costo:Number(x.costo),rubro:prev.rubro||'mat',unidad:prev.unidad||'c/u',proveedor:x.proveedor,fuente:x.fuente,referencia:x.archivo};
  try{chk(await sb.from('lista_costos').upsert(fila,{onConflict:'clave'}));listaCostos[x.clave]={...prev,...fila};toast('✅ Ahora usa el precio de '+x.proveedor);}
  catch(e){toast(msgError(e));return;}
  renderCostos();
}
async function vincularPrecioProv(id,clave){
  const x=preciosProv.find(y=>y.id===id); if(!x) return;
  try{chk(await sb.from('precios_proveedor').update({clave:clave||null}).eq('id',id)); x.clave=clave||null;}catch(e){toast(msgError(e));return;}
  if(clave) await usarPrecioProv(id); else renderCostos();
}
async function verArchivoCosto(ev,ruta){
  ev.preventDefault();
  const w=window.open('','_blank');
  const {data,error}=await sb.storage.from('costos').createSignedUrl(ruta,600);
  if(error||!data){if(w)w.close();toast('⚠️ No se pudo abrir el archivo');return;}
  if(w) w.location=data.signedUrl; else location.href=data.signedUrl;
}
