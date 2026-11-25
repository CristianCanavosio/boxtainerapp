// ════════════════════════════════════════════════
// MAESTRO DE INSUMOS (migración 0025) y solapa única "Materiales y costos"
// - Un solo lugar para la plata: el maestro de insumos (código, nombre, rubro, unidad, costo USD),
//   las tipologías del cotizador con su receta y su margen, y los parámetros (tipo de cambio, margen
//   por defecto, IVA, validez). Hoy se carga con la planilla "Cotizador Boxtainer.xlsx"; mañana lo puede
//   alimentar Flexxus (cada insumo tiene código externo y fuente; ver cot_actualizar_costos en la base).
// - Decisión de Cristian 25/11: el costeo de los proyectos también sale del maestro. Cada ítem de la nota
//   de pedido (o de la receta de obra) se arma con uno o más insumos y un factor ("Ítems de proyectos").
//   Si un ítem todavía no está emparejado, se usa el precio viejo de la lista de costos y se avisa.
// - La plata la ven solo el administrador (y el líder de ventas, que la lee para autorizar precios).
//   El líder de operaciones y el supervisor ven en esta solapa lo de siempre, sin costos.
// ════════════════════════════════════════════════
const mae={listo:false,ins:{},tip:[],rec:[],par:{},eq:{},sub:'',busca:'',tipSel:'',eqAbierto:null,eqBorr:null,imp:null};

async function cargarMaestro(){
  mae.listo=false; mae.ins={}; mae.tip=[]; mae.rec=[]; mae.par={}; mae.eq={};
  if(!['admin','lider_ventas'].includes(perfiles[myId]?.rol)) return;
  try{
    const [i,t,r,p,e]=await Promise.all(['cot_insumos','cot_tipologias','cot_recetas','cot_parametros','cot_equivalencias'].map(traerSinOrden));
    i.forEach(x=>mae.ins[x.codigo]={...x,costo:x.costo_usd==null?null:Number(x.costo_usd)});
    mae.tip=t.sort((a,b)=>(a.orden-b.orden)||String(a.nombre).localeCompare(b.nombre));
    mae.rec=r.map(x=>({...x,cant:Number(x.cant)}));
    p.forEach(x=>mae.par[x.clave]=Number(x.valor));
    e.forEach(x=>mae.eq[x.clave]=(x.composicion||[]).map(c=>({insumo:c.insumo,factor:Number(c.factor)||0})));
    mae.listo=true;
  }catch(err){console.warn('Maestro de insumos no disponible (¿falta la migración 0025?)',err);}
}

// Costo unitario de un ítem de la app (nota de pedido o receta de obra), en USD.
// Primero el maestro (suma de insumos × factor); si no está emparejado, la lista de costos vieja.
function precioItem(clave){
  const e=mae.listo&&mae.eq[clave];
  if(e&&e.length){
    let s=0;
    for(const c of e){const i=mae.ins[c.insumo]; if(!i||i.costo==null) return {costo:null,fuente:'maestro',falta:i?i.nombre:c.insumo}; s+=i.costo*c.factor;}
    return {costo:Math.round(s*100)/100,fuente:'maestro'};
  }
  const l=typeof listaCostos!=='undefined'&&listaCostos[clave];
  return l&&l.costo?{costo:l.costo,fuente:'viejo',rubro:l.rubro,unidad:l.unidad}:null;
}
const costoDe=clave=>{const p=precioItem(clave);return p&&p.costo!=null?p.costo:null;};
const maeNombre=c=>mae.ins[c]?.nombre||c;
const maeNum=v=>{if(String(v??'').trim()==='') return NaN; const n=numAR(v); return isFinite(n)?n:NaN;};
const maePct=v=>v==null||isNaN(v)?'':String(Math.round(v*1000)/10).replace('.',',');

// ════════════════ SOLAPA "MATERIALES Y COSTOS" ════════════════
function subsMateriales(){
  const r=rol(), s=[];
  if(r==='admin') s.push(['insumos','📦 Insumos'],['tipologias','🧩 Tipologías'],['equiv','🔗 Ítems de proyectos'],['parametros','⚙️ Parámetros']);
  if(esOp()) s.push(['recetas','📐 Recetas de obra'],['aberturas','🪟 Aberturas']);
  s.push(['compras','🛒 Compras']);
  return s;
}
function renderMaterialesTab(){
  const subs=subsMateriales();
  if(!subs.some(x=>x[0]===mae.sub)) mae.sub=subs[0][0];
  const chips=document.getElementById('mat-subs');
  if(chips) chips.innerHTML=subs.length>1?`<div class="chips" style="margin-bottom:10px">${subs.map(([k,t])=>`<button class="chip${mae.sub===k?' active':''}" onclick="mae.sub='${k}';renderMaterialesTab()">${t}</button>`).join('')}</div>`:'';
  const ver=(id,on)=>{const el=document.getElementById(id); if(el) el.style.display=on?'':'none';};
  ver('mae-sec',['insumos','tipologias','equiv','parametros'].includes(mae.sub));
  ver('recetas-sec',mae.sub==='recetas'); ver('limites-abert-sec',mae.sub==='aberturas'); ver('compras-sec',mae.sub==='compras');
  if(mae.sub==='recetas') renderRecetas();
  else if(mae.sub==='aberturas') renderLimitesAberturas();
  else if(mae.sub==='compras'){updMatSel();renderMateriales();}
  else renderMaestro();
}
function renderMaestro(){
  const el=document.getElementById('mae-sec'); if(!el) return;
  if(rol()!=='admin'){el.innerHTML='';return;}
  if(!mae.listo){el.innerHTML=`<div class="card">Para usar el maestro de insumos y el cotizador hay que correr la migración <b>0025_cotizador_de_ventas.sql</b> en Supabase (SQL Editor).</div>`;return;}
  el.innerHTML=mae.sub==='tipologias'?maeTipologiasHTML():mae.sub==='equiv'?maeEquivHTML():mae.sub==='parametros'?maeParametrosHTML():maeInsumosHTML();
}
function maeFoco(sel){const i=document.querySelector(sel);if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length);}}

// ── Insumos ──
function maeInsumosHTML(){
  const l=Object.values(mae.ins), f=normTxt(mae.busca);
  const vis=l.filter(x=>!f||normTxt(x.nombre+' '+x.codigo+' '+(x.rubro||'')).includes(f))
    .sort((a,b)=>((a.costo==null?0:1)-(b.costo==null?0:1))||String(a.rubro).localeCompare(b.rubro)||a.nombre.localeCompare(b.nombre));
  const sin=l.filter(x=>x.costo==null&&x.activo).length;
  const ult=l.map(x=>x.costo_actualizado_en).filter(Boolean).sort().pop();
  return `<div class="card" style="font-size:13px">
      <b>Maestro de insumos</b>: el costo de cada insumo en USD. De acá salen el precio del cotizador de ventas y el costeo de los proyectos. <b>Solo vos ves los costos.</b>
      <div style="margin-top:6px;color:var(--gris-m);font-size:12px">${l.length} insumos${ult?` · última actualización ${crmFecha(ult.slice(0,10))}`:''}${sin?` · <b style="color:var(--rojo)">${sin} sin costo</b>`:''}</div>
      <div class="flex-btns" style="margin-top:8px;flex-wrap:wrap">
        <label class="btn btn-nar btn-sm" style="cursor:pointer">📥 Importar planilla del cotizador<input type="file" accept=".xlsx,.xls,.ods" style="display:none" onchange="maeLeerPlanilla(this)"></label>
        <button class="btn btn-sec btn-sm" onclick="maeBajarPlanilla()">⬇️ Bajar el maestro en Excel</button></div>
      <div style="margin-top:6px;font-size:12px;color:var(--gris)">La planilla lleva las hojas Insumos_Maestra, Tipologias_DB, Receta_Tipologias y Parametros (como "Cotizador Boxtainer.xlsx"). Cuando conectemos Flexxus, los costos van a llegar solos y esta importación queda como respaldo.</div></div>
    ${mae.imp?maeImpHTML():''}
    <div class="fg"><input type="search" id="mae-busca" placeholder="🔍 Buscar insumo, código o rubro…" value="${esc(mae.busca)}" oninput="mae.busca=this.value;renderMaestro();maeFoco('#mae-busca')"></div>
    <div class="card cst-lista">${vis.map(x=>`<div class="cst-li ${x.costo==null?'sinp':''}" style="${x.activo?'':'opacity:.5'}">
      <div><b>${esc(x.nombre)}</b><small>${esc(x.codigo)} · ${esc(x.rubro||'Sin rubro')} · por ${esc(x.unidad||'u')}${x.fuente&&x.fuente!=='planilla'?' · '+esc(x.fuente==='flexxus'?'Flexxus':'a mano'):''}</small>
        <label style="font-size:12px;color:var(--gris-m);display:flex;gap:6px;align-items:center;margin-top:4px"><input type="checkbox" ${x.para_vendedor?'checked':''} onchange="maeSetIns('${esc(x.codigo)}',{para_vendedor:this.checked})"> el vendedor lo puede agregar como adicional</label></div>
      <input type="number" step="0.01" min="0" placeholder="USD" value="${x.costo??''}" onchange="maeCosto('${esc(x.codigo)}',this.value)" aria-label="Costo USD de ${esc(x.nombre)}">
    </div>`).join('')||'<div style="font-size:13px;color:var(--gris-m)">No hay insumos. Importá la planilla del cotizador.</div>'}</div>
    <details class="card" style="font-size:13px"><summary style="cursor:pointer;font-weight:700">➕ Agregar un insumo</summary>
      <div class="form-2" style="margin-top:8px"><div class="fg"><label>Código</label><input id="mi-cod" placeholder="INS-094"></div><div class="fg"><label>Nombre</label><input id="mi-nom"></div></div>
      <div class="form-2"><div class="fg"><label>Rubro</label><input id="mi-rub" list="mi-rubros"><datalist id="mi-rubros">${[...new Set(l.map(x=>x.rubro).filter(Boolean))].sort().map(r=>`<option value="${esc(r)}">`).join('')}</datalist></div>
        <div class="fg"><label>Unidad</label><input id="mi-uni" placeholder="UN, M2, ML…"></div></div>
      <div class="fg"><label>Costo USD</label><input id="mi-cos" type="number" step="0.01" min="0"></div>
      <button class="btn btn-nar btn-sm" onclick="maeNuevoIns()">+ Agregar</button></details>`;
}
async function maeSetIns(cod,cambios){
  try{chk(await sb.from('cot_insumos').update(cambios).eq('codigo',cod)); Object.assign(mae.ins[cod],cambios); toast('✅ Guardado');}
  catch(e){toast(msgError(e));renderMaestro();}
}
async function maeCosto(cod,v){
  const n=maeNum(v);
  if(v!==''&&(isNaN(n)||n<0)){toast('⚠️ Costo inválido');renderMaestro();return;}
  const c=v===''?null:n;
  await maeSetIns(cod,{costo_usd:c,fuente:'manual',costo_actualizado_en:new Date().toISOString()});
  mae.ins[cod].costo=c; renderMaestro();
}
async function maeNuevoIns(){
  const g=id=>document.getElementById(id).value.trim();
  const fila={codigo:g('mi-cod'),nombre:g('mi-nom'),rubro:g('mi-rub')||null,unidad:g('mi-uni')||null,fuente:'manual'};
  if(!fila.codigo||!fila.nombre){toast('⚠️ Poné código y nombre');return;}
  if(mae.ins[fila.codigo]){toast('⚠️ Ya hay un insumo con ese código');return;}
  const c=maeNum(g('mi-cos')); if(g('mi-cos')!==''&&!isNaN(c)){fila.costo_usd=c;fila.costo_actualizado_en=new Date().toISOString();}
  try{const r=await sb.from('cot_insumos').insert(fila).select().single(); if(r.error) throw r.error;
    mae.ins[fila.codigo]={...r.data,costo:r.data.costo_usd==null?null:Number(r.data.costo_usd)}; toast('✅ Insumo agregado'); renderMaestro();}
  catch(e){toast(msgError(e));}
}

// ── Importar la planilla del cotizador ──
function maeHoja(wb,re){const n=wb.SheetNames.find(x=>re.test(normTxt(x)));return n?XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,raw:true,defval:''}):null;}
function maeFilas(m){ // primera fila = encabezados; devuelve objetos con claves normalizadas
  if(!m||!m.length) return [];
  const h=m[0].map(x=>normTxt(x).replace(/[^a-z0-9]+/g,'_'));
  return m.slice(1).map(r=>{const o={};h.forEach((k,i)=>o[k]=r[i]);return o;});
}
const maeCol=(o,...re)=>{for(const k of Object.keys(o)) if(re.some(r=>r.test(k))) return o[k]; return '';};
async function maeLeerPlanilla(input){
  const f=input.files[0]; input.value=''; if(!f) return;
  try{
    await cargarLib(LIB_XLSX);
    const wb=XLSX.read(await f.arrayBuffer(),{type:'array'});
    const I=maeFilas(maeHoja(wb,/insumo/)), T=maeFilas(maeHoja(wb,/tipolog/)), R=maeFilas(maeHoja(wb,/receta/)), P=maeHoja(wb,/parametro/);
    if(!I.length) throw new Error('no encontré la hoja de insumos (Insumos_Maestra)');
    const num=v=>{if(v===''||v==null) return null; const n=typeof v==='number'?v:numAR(v); return isNaN(n)?null:n;};
    const ins=I.map(o=>({codigo:String(maeCol(o,/^id/,/codigo/)).trim(),nombre:String(maeCol(o,/nombre/)).trim(),rubro:String(maeCol(o,/rubro/)).trim(),
      unidad:String(maeCol(o,/unidad/)).trim(),costo:num(maeCol(o,/costo/))})).filter(x=>x.codigo&&x.nombre);
    const tip=T.map((o,i)=>({codigo:String(maeCol(o,/^id/)).trim(),nombre:String(maeCol(o,/nombre/)).trim(),pies:num(maeCol(o,/pies/)),m2:num(maeCol(o,/^m2/)),
      margen:num(maeCol(o,/margen/)),orden:i})).filter(x=>x.codigo&&x.nombre);
    const rec=R.map(o=>({tipologia:String(maeCol(o,/id_tipolog/)).trim(),insumo:String(maeCol(o,/id_insumo/)).trim(),cant:num(maeCol(o,/cantidad/))}))
      .filter(x=>x.tipologia&&x.insumo&&x.cant!=null&&x.cant>=0);
    const par={};
    (P||[]).slice(1).forEach(r=>{const k=normTxt(r[0]),v=num(r[1]); if(v==null) return;
      if(/cambio/.test(k)) par.tipo_cambio=v; else if(/margen/.test(k)) par.margen_default=v; else if(/iva/.test(k)) par.iva=v; else if(/validez/.test(k)) par.validez_dias=v;});
    // margen escrito como 30 en vez de 0,30
    tip.forEach(t=>{if(t.margen!=null&&t.margen>=1) t.margen=t.margen/100;});
    if(par.margen_default>=1) par.margen_default/=100; if(par.iva>=1) par.iva/=100;
    const cambian=ins.filter(x=>x.costo!=null&&mae.ins[x.codigo]&&Math.abs((mae.ins[x.codigo].costo??-1)-x.costo)>=0.005);
    const nuevos=ins.filter(x=>!mae.ins[x.codigo]);
    mae.imp={archivo:f.name,ins,tip,rec,par,cambian,nuevos,sinCosto:ins.filter(x=>x.costo==null).length,
      recMal:R.length-rec.length};
    renderMaestro();
  }catch(e){toast('⚠️ No pude leer la planilla: '+(e.message||e));}
}
function maeImpHTML(){
  const m=mae.imp;
  return `<div class="card" style="border-left:5px solid var(--nar);font-size:13px"><div class="card-title">📥 ${esc(m.archivo)}</div>
    <div>${m.ins.length} insumos (${m.nuevos.length} nuevos, ${m.cambian.length} cambian de costo${m.sinCosto?`, ${m.sinCosto} sin costo`:''}) · ${m.tip.length} tipologías · ${m.rec.length} líneas de receta</div>
    ${Object.keys(m.par).length?`<div>Parámetros: ${m.par.tipo_cambio!=null?'tipo de cambio '+crmNum(m.par.tipo_cambio):''}${m.par.margen_default!=null?' · margen por defecto '+maePct(m.par.margen_default)+'%':''}${m.par.iva!=null?' · IVA '+maePct(m.par.iva)+'%':''}</div>`:''}
    ${m.cambian.length?`<details style="margin-top:6px"><summary style="cursor:pointer">Ver qué cambia</summary>${m.cambian.slice(0,60).map(x=>`<div class="crm-n">${esc(x.nombre)}: ${usd(mae.ins[x.codigo].costo)} → <b>${usd(x.costo)}</b></div>`).join('')}</details>`:''}
    <div style="margin-top:6px;color:var(--gris-m);font-size:12px">Las recetas de las tipologías de la planilla se reemplazan enteras.</div>
    <div class="flex-btns" style="margin-top:8px"><button class="btn btn-sec btn-sm" onclick="mae.imp=null;renderMaestro()">Cancelar</button>
      <button class="btn btn-nar btn-sm" id="mae-imp-ok" onclick="maeImportar()">✅ Importar</button></div></div>`;
}
async function maeImportar(){
  const m=mae.imp; if(!m) return;
  const b=document.getElementById('mae-imp-ok'); if(b){if(b.disabled)return;b.disabled=true;}
  try{
    const r=await sb.rpc('cot_importar',{p_insumos:m.ins,p_tipologias:m.tip,p_recetas:m.rec,p_parametros:m.par});
    if(r.error) throw r.error;
    mae.imp=null; await cargarMaestro(); if(typeof cot!=='undefined') cot.cat=null;
    toast(`✅ Importado: ${r.data.insumos} insumos, ${r.data.tipologias} tipologías, ${r.data.recetas} líneas de receta`);
    renderMaestro();
  }catch(e){toast(msgError(e));if(b)b.disabled=false;}
}
async function maeBajarPlanilla(){
  try{
    await cargarLib(LIB_XLSX);
    const wb=XLSX.utils.book_new();
    const add=(n,a,w)=>{const s=XLSX.utils.aoa_to_sheet(a);s['!cols']=w.map(x=>({wch:x}));XLSX.utils.book_append_sheet(wb,s,n);};
    add('Insumos_Maestra',[['ID_Insumo','Nombre_Insumo','Rubro','Unidad_Medida','Costo_Unitario_USD','Codigo_Flexxus'],
      ...Object.values(mae.ins).sort((a,b)=>a.codigo.localeCompare(b.codigo)).map(x=>[x.codigo,x.nombre,x.rubro||'',x.unidad||'',x.costo??'',x.codigo_externo||''])],[11,60,16,12,12,14]);
    add('Tipologias_DB',[['ID_Tipologia','Nombre_Tipologia','Pies','M2','Margen_Objetivo_%'],...mae.tip.map(t=>[t.codigo,t.nombre,t.pies??'',t.m2??'',t.margen??''])],[16,44,6,6,14]);
    add('Receta_Tipologias',[['ID_Receta','ID_Tipologia','ID_Insumo','Cantidad_Estandar','Nombre_Insumo'],
      ...mae.rec.map((r,i)=>['REC-'+String(i+1).padStart(3,'0'),r.tipologia,r.insumo,r.cant,maeNombre(r.insumo)])],[10,16,10,12,50]);
    add('Parametros',[['Parametro','Valor'],['Tipo_Cambio_USD',mae.par.tipo_cambio??''],['Margen_Default_%',mae.par.margen_default??''],['IVA_%',mae.par.iva??''],['Validez_Dias',mae.par.validez_dias??'']],[20,10]);
    XLSX.writeFile(wb,'maestro-insumos-boxtainer.xlsx');
  }catch(e){toast('⚠️ No se pudo armar la planilla: '+(e.message||e));}
}

// ── Tipologías del cotizador: margen y receta ──
function maeTipologiasHTML(){
  if(!mae.tip.length) return `<div class="card" style="font-size:13px">Todavía no hay tipologías. Importá la planilla del cotizador en <b>📦 Insumos</b>.</div>`;
  if(!mae.tip.some(t=>t.codigo===mae.tipSel)) mae.tipSel=mae.tip[0].codigo;
  const t=mae.tip.find(x=>x.codigo===mae.tipSel);
  const filas=mae.rec.filter(r=>r.tipologia===t.codigo).map(r=>({...r,i:mae.ins[r.insumo]})).sort((a,b)=>String(a.i?.rubro).localeCompare(b.i?.rubro)||maeNombre(a.insumo).localeCompare(maeNombre(b.insumo)));
  const costo=filas.reduce((s,r)=>s+(r.i?.costo||0)*r.cant,0), m=t.margen??mae.par.margen_default??0;
  const sin=filas.filter(r=>r.cant>0&&r.i?.costo==null).length;
  return `<div class="fg"><select onchange="mae.tipSel=this.value;renderMaestro()">${mae.tip.map(x=>`<option value="${esc(x.codigo)}" ${x.codigo===t.codigo?'selected':''}>${esc(x.nombre)}${x.activo?'':' (desactivada)'}</option>`).join('')}</select></div>
    <div class="card">
      <div class="drow"><span class="lbl">Costo de la receta</span><span class="val">${usd(costo)}</span></div>
      <div class="drow"><span class="lbl">Margen</span><span class="val"><input type="text" inputmode="decimal" style="width:70px;text-align:right" value="${maePct(t.margen)}" placeholder="${maePct(mae.par.margen_default)}" onchange="maeMargen('${esc(t.codigo)}',this.value)"> %</span></div>
      <div class="drow"><span class="lbl"><b>Precio de lista</b> <small>(sin IVA)</small></span><span class="val"><b>${usd(Math.round(costo*(1+m)))}</b></span></div>
      ${sin?`<div class="cst-aviso">${sin} insumo${sin>1?'s':''} sin costo: el vendedor no puede enviar esta cotización hasta que lo cargues.</div>`:''}
      <div style="font-size:12px;color:var(--gris-m);margin-top:6px">Precio = costo × (1 + margen). Vacío = el margen por defecto de Parámetros (${maePct(mae.par.margen_default)}%).</div>
      <label style="font-size:13px;display:flex;gap:6px;align-items:center;margin-top:8px"><input type="checkbox" ${t.activo?'checked':''} onchange="maeSetTip('${esc(t.codigo)}',{activo:this.checked})"> La ofrece el cotizador</label></div>
    <div class="card"><div class="card-title">Receta (por unidad)</div>
      <div class="mp-lista">${filas.map(r=>`<div class="mp-f"><div class="mp-n">${esc(maeNombre(r.insumo))}<small style="display:block;color:var(--gris-m)">${r.i?.costo!=null?usd(r.i.costo)+' × '+fmt2(r.cant)+' = '+usd(r.i.costo*r.cant):'<b style="color:var(--rojo)">sin costo</b>'}</small></div>
        <div class="mp-c"><input type="number" step="0.01" min="0" value="${r.cant}" onchange="maeCantRec('${esc(t.codigo)}','${esc(r.insumo)}',this.value)"> <span>${esc(r.i?.unidad||'')}</span></div>
        <div class="mp-s"><button class="mp-b" onclick="maeQuitarRec('${esc(t.codigo)}','${esc(r.insumo)}')" aria-label="Quitar">✕</button></div></div>`).join('')}</div>
      <div class="form-2" style="margin-top:8px"><div class="fg"><label>Insumo</label><input id="mr-ins" list="mae-ins-dl" placeholder="Buscar insumo"></div>
        <div class="fg"><label>Cantidad</label><input id="mr-cant" type="number" step="0.01" min="0" value="1"></div></div>
      ${maeInsDatalist()}
      <button class="btn btn-nar btn-sm" onclick="maeAgregarRec('${esc(t.codigo)}')">+ Agregar a la receta</button></div>`;
}
function maeInsDatalist(){return `<datalist id="mae-ins-dl">${Object.values(mae.ins).filter(x=>x.activo).sort((a,b)=>a.nombre.localeCompare(b.nombre)).map(x=>`<option value="${esc(x.nombre+' · '+x.codigo)}">`).join('')}</datalist>`;}
function maeInsDeTexto(v){
  v=String(v||'').trim(); const m=v.match(/·\s*([^·]+)$/); const cod=m?m[1].trim():v;
  if(mae.ins[cod]) return cod;
  const n=normTxt(v); return Object.values(mae.ins).find(x=>normTxt(x.nombre)===n)?.codigo||null;
}
async function maeSetTip(cod,cambios){
  try{chk(await sb.from('cot_tipologias').update(cambios).eq('codigo',cod)); Object.assign(mae.tip.find(t=>t.codigo===cod),cambios); if(typeof cot!=='undefined') cot.cat=null; toast('✅ Guardado'); renderMaestro();}
  catch(e){toast(msgError(e));}
}
function maeMargen(cod,v){
  if(String(v).trim()==='') return maeSetTip(cod,{margen:null});
  const n=maeNum(v); if(isNaN(n)||n<=-100||n>500){toast('⚠️ Margen inválido');renderMaestro();return;}
  maeSetTip(cod,{margen:Math.round(n*100)/10000});
}
async function maeCantRec(tip,ins,v){
  const n=maeNum(v); if(isNaN(n)||n<0){toast('⚠️ Cantidad inválida');renderMaestro();return;}
  try{chk(await sb.from('cot_recetas').update({cant:n}).eq('tipologia',tip).eq('insumo',ins)); mae.rec.find(r=>r.tipologia===tip&&r.insumo===ins).cant=n; if(typeof cot!=='undefined') cot.cat=null; renderMaestro();}
  catch(e){toast(msgError(e));}
}
async function maeQuitarRec(tip,ins){
  if(!await confirmar('¿Sacar '+maeNombre(ins)+' de la receta?')) return;
  try{chk(await sb.from('cot_recetas').delete().eq('tipologia',tip).eq('insumo',ins)); mae.rec=mae.rec.filter(r=>!(r.tipologia===tip&&r.insumo===ins)); if(typeof cot!=='undefined') cot.cat=null; renderMaestro();}
  catch(e){toast(msgError(e));}
}
async function maeAgregarRec(tip){
  const ins=maeInsDeTexto(document.getElementById('mr-ins').value), n=maeNum(document.getElementById('mr-cant').value);
  if(!ins){toast('⚠️ Elegí un insumo de la lista');return;}
  if(isNaN(n)||n<0){toast('⚠️ Cantidad inválida');return;}
  try{chk(await sb.from('cot_recetas').upsert({tipologia:tip,insumo:ins,cant:n}));
    const r=mae.rec.find(x=>x.tipologia===tip&&x.insumo===ins); if(r) r.cant=n; else mae.rec.push({tipologia:tip,insumo:ins,cant:n});
    if(typeof cot!=='undefined') cot.cat=null; toast('✅ Agregado'); renderMaestro();}
  catch(e){toast(msgError(e));}
}

// ── Parámetros ──
function maeParametrosHTML(){
  const P=[['tipo_cambio','Tipo de cambio','Pesos por dólar, para mostrar el precio en pesos',''],['margen_default','Margen por defecto','Para tipologías sin margen propio','%'],
    ['iva','IVA','Se suma al precio de lista','%'],['validez_dias','Validez de la cotización','Días','días']];
  return `<div class="card">${P.map(([k,t,d,u])=>`<div class="fg"><label>${t} <small>${d}</small></label>
    <div style="display:flex;gap:6px;align-items:center"><input type="text" inputmode="decimal" value="${u==='%'?maePct(mae.par[k]):mae.par[k]??''}" onchange="maePar('${k}',this.value,${u==='%'})"> ${u}</div></div>`).join('')}
    <div style="font-size:12px;color:var(--gris-m)">El vendedor ve solo el precio final. El margen y los costos los ven vos y el líder de ventas.</div></div>`;
}
async function maePar(k,v,esPct){
  let n=maeNum(v); if(isNaN(n)||n<0){toast('⚠️ Valor inválido');renderMaestro();return;}
  if(esPct) n=n/100;
  try{chk(await sb.from('cot_parametros').upsert({clave:k,valor:n,actualizado_en:new Date().toISOString()})); mae.par[k]=n; if(typeof cot!=='undefined') cot.cat=null; toast('✅ Guardado'); renderMaestro();}
  catch(e){toast(msgError(e));}
}

// ── Ítems de proyectos: de qué insumos del maestro sale el costo de cada ítem de la nota de pedido ──
function maeClavesProyectos(){
  const k={};
  (typeof catalogoCostos==='function'?catalogoCostos():[]).forEach(x=>k[x.clave]={clave:x.clave,unidad:x.unidad,usos:x.usos||0});
  (typeof recetas!=='undefined'?recetas:[]).forEach(r=>{if(!k[r.clave]) k[r.clave]={clave:r.clave,unidad:r.unidad,usos:0,receta:true};});
  Object.keys(mae.eq).forEach(c=>{if(!k[c]) k[c]={clave:c,unidad:'',usos:0};});
  return Object.values(k);
}
function maeEquivHTML(){
  const f=normTxt(mae.busca);
  const l=maeClavesProyectos().map(x=>({...x,p:precioItem(x.clave),eq:mae.eq[x.clave]||[]}))
    .filter(x=>!f||normTxt(x.clave).includes(f))
    .sort((a,b)=>((a.eq.length?1:0)-(b.eq.length?1:0))||(b.usos-a.usos)||a.clave.localeCompare(b.clave));
  const sinEq=l.filter(x=>!x.eq.length&&x.usos).length;
  return `<div class="card" style="font-size:13px">Cada ítem que sale de la nota de pedido (o de la receta de obra) toma su costo del maestro: uno o más insumos, cada uno con un factor.
      Ej.: Lavamatic = lavamanos + monocomando; Aislación (m²) = Isover ÷ 9,4 → factor 0,1064; Pintura (tacho 20 l) = litro × 20.
      ${sinEq?`<div style="margin-top:6px;color:var(--rojo);font-weight:700">${sinEq} ítem${sinEq>1?'s':''} usado${sinEq>1?'s':''} en pedidos sin emparejar: usan el precio viejo de la lista de costos.</div>`:''}</div>
    <div class="fg"><input type="search" id="mae-busca" placeholder="🔍 Buscar ítem…" value="${esc(mae.busca)}" oninput="mae.busca=this.value;renderMaestro();maeFoco('#mae-busca')"></div>
    <div class="card cst-lista">${l.map(x=>{const ab=mae.eqAbierto===x.clave;return `<div class="cst-li ${x.eq.length?'':'sinp'}" style="display:block">
      <div style="display:flex;justify-content:space-between;gap:8px;cursor:pointer" onclick="maeEqAbrir(${esc(JSON.stringify(x.clave))})">
        <div style="min-width:0"><b>${esc(x.clave)}</b><small>${x.unidad?'por '+esc(x.unidad):''}${x.usos?` · en ${x.usos} pedido${x.usos>1?'s':''}`:''}${x.receta?' · receta de obra':''}</small>
          <small>${x.eq.length?x.eq.map(c=>esc(maeNombre(c.insumo))+(c.factor!==1?' × '+fmt2(c.factor):'')).join(' + '):(x.p?'Sin emparejar · precio viejo':'Sin emparejar')}</small></div>
        <b style="white-space:nowrap">${x.p&&x.p.costo!=null?usd(x.p.costo):x.p&&x.p.falta?'<span style="color:var(--rojo)">falta costo</span>':'—'}</b></div>
      ${ab?maeEqEditorHTML(x.clave):''}</div>`;}).join('')}</div>`;
}
function maeEqAbrir(clave){
  if(mae.eqAbierto===clave){mae.eqAbierto=null;mae.eqBorr=null;}
  else{mae.eqAbierto=clave;mae.eqBorr=(mae.eq[clave]||[]).map(c=>({...c}));if(!mae.eqBorr.length) mae.eqBorr=maeSugerir(clave);}
  renderMaestro();
}
// sugerencia por nombre parecido (la misma lógica de "emparejar nombres" de Costos)
function maeSugerir(clave){
  if(typeof puntajeEmp!=='function') return [];
  let mejor=null,pm=0;
  Object.values(mae.ins).forEach(x=>{const p=puntajeEmp(clave,x.nombre); if(p>pm){pm=p;mejor=x;}});
  return mejor&&pm>=0.5?[{insumo:mejor.codigo,factor:1,sug:true}]:[];
}
function maeEqEditorHTML(clave){
  const b=mae.eqBorr||[];
  const tot=b.reduce((s,c)=>s+(mae.ins[c.insumo]?.costo||0)*c.factor,0);
  return `<div style="margin-top:8px;border-top:1px solid var(--borde);padding-top:8px">
    ${b.map((c,i)=>`<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">
      <input style="flex:1;min-width:0" list="mae-ins-dl" value="${esc(c.insumo?maeNombre(c.insumo)+' · '+c.insumo:'')}" onchange="maeEqSet(${i},'insumo',this.value)" placeholder="Insumo">
      <span>×</span><input style="width:80px" type="text" inputmode="decimal" value="${String(c.factor).replace('.',',')}" onchange="maeEqSet(${i},'factor',this.value)" aria-label="Factor">
      <button class="mp-b" onclick="mae.eqBorr.splice(${i},1);renderMaestro()" aria-label="Quitar">✕</button></div>
      ${c.sug?'<div class="crm-n" style="margin:-4px 0 6px">Sugerido por el nombre: revisalo.</div>':''}`).join('')}
    ${maeInsDatalist()}
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
      <button class="btn btn-sec btn-sm" onclick="mae.eqBorr.push({insumo:'',factor:1});renderMaestro()">+ Insumo</button>
      <span style="flex:1;text-align:right;font-size:13px">Costo: <b>${usd(tot)}</b></span></div>
    <div class="flex-btns" style="margin-top:8px"><button class="btn btn-sec btn-sm" onclick="mae.eqAbierto=null;renderMaestro()">Cancelar</button>
      <button class="btn btn-nar btn-sm" onclick="maeEqGuardar(${esc(JSON.stringify(clave))})">Guardar</button></div></div>`;
}
function maeEqSet(i,k,v){
  const c=mae.eqBorr[i]; if(!c) return; delete c.sug;
  if(k==='insumo'){const cod=maeInsDeTexto(v); if(!cod){toast('⚠️ Elegí un insumo de la lista');} c.insumo=cod||'';}
  else{const n=maeNum(v); if(isNaN(n)||n<0){toast('⚠️ Factor inválido');} else c.factor=n;}
  renderMaestro();
}
async function maeEqGuardar(clave){
  const comp=(mae.eqBorr||[]).filter(c=>c.insumo&&c.factor>0).map(c=>({insumo:c.insumo,factor:c.factor}));
  try{
    if(comp.length) chk(await sb.from('cot_equivalencias').upsert({clave,composicion:comp,actualizado_en:new Date().toISOString()}));
    else chk(await sb.from('cot_equivalencias').delete().eq('clave',clave));
    if(comp.length) mae.eq[clave]=comp; else delete mae.eq[clave];
    mae.eqAbierto=null; mae.eqBorr=null; toast('✅ Guardado: los proyectos se costean con esto'); renderMaestro();
  }catch(e){toast(msgError(e));}
}
