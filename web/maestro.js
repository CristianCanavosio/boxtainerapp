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
    if(clave===MO_M2) s/=maeMoRef();   // mano de obra por m²: módulo de referencia ÷ sus m²
    return {costo:Math.round(s*100)/100,fuente:'maestro'};
  }
  // sin emparejar: el insumo del maestro que se llama igual (o tiene ese código) manda sobre el precio viejo
  const i=maeInsIgual(clave);
  if(i) return i.costo==null?{costo:null,fuente:'nombre',falta:i.nombre,insumo:i.codigo}:{costo:i.costo,fuente:'nombre',insumo:i.codigo};
  const l=typeof listaCostos!=='undefined'&&listaCostos[clave];
  return l&&l.costo?{costo:l.costo,fuente:'viejo',rubro:l.rubro,unidad:l.unidad}:null;
}
// Mano de obra por regla de tres (migración 0028): "Mano de obra general" (m² de piso) cuesta el módulo de referencia ÷ sus m²
const MO_M2='Mano de obra general';
const maeMoRef=()=>Number(mae.par.mo_m2_referencia)>0?Number(mae.par.mo_m2_referencia):29.74;
// Instalación eléctrica por m² (migración 0030): lo eléctrico suelto (tomas, luces, tablero, disyuntor, térmicas…)
// queda incluido en un solo ítem por m². Mismo criterio que _cot_es_electrico en la base.
const ELEC_M2='Instalación eléctrica';
const ELEC_RE=/^(instalacion electrica|tablero|toma|luz|plafon|tubo led|disyuntor|termica|llave termica|interruptor|cable|caja de luz|punto de luz|portalampara|lampara|disyuntores|termicas|tomas)/;
const esElectrico=clave=>ELEC_RE.test(String(clave||'').trim().toLowerCase().replace(/[áéíóú]/g,c=>'aeiou'['áéíóú'.indexOf(c)]));
// Ventanas por m² (migración 0031): un solo costo por m² (MO+MAT) + adicional por m² si el vidrio es DVH.
// Cada ventana suelta ("Ventana Módena · 100 × 100"…) queda incluida, con costo 0. Mismo criterio que _cot_es_ventana en la base.
const VENT_M2='Aberturas: ventanas por m² (MO+MAT)', DVH_M2='Aberturas: adicional vidrio DVH por m²';
const esVentana=clave=>/^ventana/i.test(String(clave||'').trim());
// mismo criterio que la base (_cot_costo_item, migración 0028): código exacto o nombre igual sin importar mayúsculas
function maeInsIgual(clave){
  if(!mae.listo) return null;
  const k=String(clave||'').trim(), n=k.toLowerCase();
  if(mae.ins[k]?.activo) return mae.ins[k];
  return Object.values(mae.ins).filter(x=>x.activo&&String(x.nombre||'').trim().toLowerCase()===n).sort((a,b)=>a.codigo.localeCompare(b.codigo))[0]||null;
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
      <div style="margin-top:6px;font-size:12px;color:var(--gris)">Se importa apenas la elegís y te muestra el resultado. La planilla lleva las hojas Insumos_Maestra, Tipologias_DB, Receta_Tipologias y Parametros (como "Cotizador Boxtainer.xlsx"). Cuando conectemos Flexxus, los costos van a llegar solos y esta importación queda como respaldo.</div></div>
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
      <div class="fg"><label>¿Se suma a un ítem de la nota de pedido? (opcional)</label><input id="mi-item" list="mi-items" placeholder="Ej: Sanitario · Inodoro">
        <datalist id="mi-items">${maeClavesProyectos().map(x=>`<option value="${esc(x.clave)}">`).join('')}</datalist>
        <div style="font-size:12px;color:var(--gris-m);margin-top:4px">Si lo elegís, el costo de ese ítem pasa a incluir este insumo. Si lo vas a usar en una receta de obra con el mismo nombre, no hace falta. Los presupuestos abiertos se recalculan al instante.</div></div>
      <button class="btn btn-nar btn-sm" onclick="maeNuevoIns()">+ Agregar</button></details>`;
}
async function maeSetIns(cod,cambios){
  try{chk(await sb.from('cot_insumos').update(cambios).eq('codigo',cod)); Object.assign(mae.ins[cod],cambios); toast('✅ Guardado'); return true;}
  catch(e){toast(msgError(e));renderMaestro();return false;}
}
async function maeCosto(cod,v){
  const n=maeNum(v);
  if(v!==''&&(isNaN(n)||n<0)){toast('⚠️ Costo inválido');renderMaestro();return;}
  const c=v===''?null:n;
  // si no se pudo guardar, la pantalla vuelve al costo que hay en la base
  if(!await maeSetIns(cod,{costo_usd:c,fuente:'manual',costo_actualizado_en:new Date().toISOString()})) return;
  mae.ins[cod].costo=c; renderMaestro();
}
async function maeNuevoIns(){
  const g=id=>document.getElementById(id).value.trim();
  const fila={codigo:g('mi-cod'),nombre:g('mi-nom'),rubro:g('mi-rub')||null,unidad:g('mi-uni')||null,fuente:'manual'};
  if(!fila.codigo||!fila.nombre){toast('⚠️ Poné código y nombre');return;}
  if(mae.ins[fila.codigo]){toast('⚠️ Ya hay un insumo con ese código');return;}
  const c=maeNum(g('mi-cos')); if(g('mi-cos')!==''&&!isNaN(c)){fila.costo_usd=c;fila.costo_actualizado_en=new Date().toISOString();}
  const item=g('mi-item');
  try{const r=await sb.from('cot_insumos').insert(fila).select().single(); if(r.error) throw r.error;
    mae.ins[fila.codigo]={...r.data,costo:r.data.costo_usd==null?null:Number(r.data.costo_usd)};
    if(item){
      // se suma a lo que ya tenía el ítem (si no tenía equivalencia, queda solo este insumo)
      const comp=[...(mae.eq[item]||[]).filter(c=>c.insumo!==fila.codigo),{insumo:fila.codigo,factor:1}];
      chk(await sb.from('cot_equivalencias').upsert({clave:item,composicion:comp,actualizado_en:new Date().toISOString()}));
      mae.eq[item]=comp;
    }
    toast(item?`✅ Insumo agregado y sumado a "${item}": los presupuestos abiertos ya tienen el precio nuevo`:'✅ Insumo agregado'); renderMaestro();}
  catch(e){toast(msgError(e));renderMaestro();}
}

// ── Importar la planilla del cotizador ──
function maeHoja(wb,re){const n=wb.SheetNames.find(x=>re.test(normTxt(x)));return n?XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,raw:true,defval:''}):null;}
function maeFilas(m){ // primera fila = encabezados; devuelve objetos con claves normalizadas
  if(!m||!m.length) return [];
  const h=m[0].map(x=>normTxt(x).replace(/[^a-z0-9]+/g,'_'));
  return m.slice(1).map(r=>{const o={};h.forEach((k,i)=>o[k]=r[i]);return o;});
}
const maeCol=(o,...re)=>{for(const k of Object.keys(o)) if(re.some(r=>r.test(k))) return o[k]; return '';};
// Pedido de Cristian 26/11: al subir la planilla se importa de una vez y queda a la vista un resultado claro
// (qué se cargó, qué cambió de costo y qué no se pudo leer). Si algo falla, el aviso queda en pantalla.
async function maeLeerPlanilla(input){
  const f=input.files[0]; input.value=''; if(!f) return;
  mae.imp={estado:'leyendo',archivo:f.name}; renderMaestro();
  let m;
  try{
    await cargarLib(LIB_XLSX);
    const wb=XLSX.read(await f.arrayBuffer(),{type:'array'});
    const hojas=wb.SheetNames.join(', ');
    const I=maeFilas(maeHoja(wb,/insumo/)), T=maeFilas(maeHoja(wb,/tipolog/)), R=maeFilas(maeHoja(wb,/receta/)), P=maeHoja(wb,/parametro/);
    if(!I.length) throw new Error('no encontré la hoja de insumos (Insumos_Maestra). Hojas del archivo: '+hojas);
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
    const avisos=[];
    if(!T.length) avisos.push('No encontré la hoja de tipologías (Tipologias_DB): el cotizador no va a tener productos para elegir.');
    else if(!tip.length) avisos.push('La hoja de tipologías no tiene filas con ID y nombre.');
    if(!R.length) avisos.push('No encontré la hoja de recetas (Receta_Tipologias).');
    else if(R.length>rec.length) avisos.push(`${R.length-rec.length} fila${R.length-rec.length>1?'s':''} de receta sin tipología, insumo o cantidad: no se cargaron.`);
    const codIns=new Set([...ins.map(x=>x.codigo),...Object.keys(mae.ins)]), codTip=new Set([...tip.map(x=>x.codigo),...mae.tip.map(x=>x.codigo)]);
    const recSueltas=rec.filter(r=>!codIns.has(r.insumo)||!codTip.has(r.tipologia));
    if(recSueltas.length) avisos.push(`${recSueltas.length} línea${recSueltas.length>1?'s':''} de receta con un código de insumo o tipología que no existe: no se cargaron.`);
    const sinCosto=ins.filter(x=>x.costo==null);
    if(sinCosto.length) avisos.push(`${sinCosto.length} insumo${sinCosto.length>1?'s':''} sin costo: ${sinCosto.slice(0,5).map(x=>x.nombre).join(', ')}${sinCosto.length>5?'…':''}.`);
    m={archivo:f.name,ins,tip,rec,par,avisos,
      cambian:ins.filter(x=>x.costo!=null&&mae.ins[x.codigo]&&Math.abs((mae.ins[x.codigo].costo??-1)-x.costo)>=0.005).map(x=>({...x,antes:mae.ins[x.codigo].costo})),
      nuevos:ins.filter(x=>!mae.ins[x.codigo]).length};
  }catch(e){mae.imp={estado:'error',archivo:f.name,error:'No pude leer la planilla: '+(e.message||e)};renderMaestro();return;}
  mae.imp={estado:'subiendo',archivo:f.name}; renderMaestro();
  try{
    const r=await sb.rpc('cot_importar',{p_insumos:m.ins,p_tipologias:m.tip,p_recetas:m.rec,p_parametros:m.par});
    if(r.error) throw r.error;
    await cargarMaestro(); if(typeof cot!=='undefined') cot.cat=null;
    // se controla contra lo que quedó en la base, no contra lo que se mandó
    const tipOk=mae.tip.filter(t=>t.activo).length, recOk=mae.rec.length;
    if(m.tip.length&&!tipOk) m.avisos.unshift('Las tipologías no quedaron guardadas en la base. Avisale a Claude.');
    mae.imp={estado:'ok',...m,res:r.data,tipOk,recOk,insOk:Object.keys(mae.ins).length,cuando:new Date()};
    toast(tipOk?'✅ Planilla subida: materiales y costos actualizados':'⚠️ Planilla subida, pero el cotizador no tiene tipologías');
  }catch(e){mae.imp={estado:'error',archivo:f.name,error:'No se pudo guardar en la base: '+(msgError(e)||'').replace(/^⚠️\s*/,'')};toast('⚠️ No se pudo subir la planilla');}
  renderMaestro();
  document.getElementById('mae-imp')?.scrollIntoView({behavior:'smooth',block:'center'});
}
function maeImpHTML(){
  const m=mae.imp, cerrar=`<button class="btn btn-sec btn-sm" style="margin-top:8px" onclick="mae.imp=null;renderMaestro()">Cerrar</button>`;
  if(m.estado==='leyendo'||m.estado==='subiendo') return `<div class="card" id="mae-imp" style="border-left:5px solid var(--azul);font-size:14px">⏳ ${m.estado==='leyendo'?'Leyendo':'Guardando'} <b>${esc(m.archivo)}</b>…</div>`;
  if(m.estado==='error') return `<div class="card" id="mae-imp" style="border-left:5px solid var(--rojo);font-size:14px"><div class="card-title" style="color:var(--rojo)">❌ No se subió la planilla</div>
    <div><b>${esc(m.archivo)}</b>: ${esc(m.error)}</div><div class="crm-n" style="margin-top:6px">No se cambió nada en la base.</div>${cerrar}</div>`;
  const ok=!m.avisos.length;
  return `<div class="card" id="mae-imp" style="border-left:5px solid ${ok?'var(--verde)':'var(--amarillo)'};font-size:14px">
    <div class="card-title" style="color:${ok?'var(--verde)':'var(--amarillo)'}">${ok?'✅ La planilla se subió correctamente':'✅ La planilla se subió, con avisos'}</div>
    <div class="crm-n">${esc(m.archivo)} · ${m.cuando.toLocaleString('es-AR',{dateStyle:'short',timeStyle:'short'})}</div>
    <div style="margin-top:8px;line-height:1.6">
      📦 <b>${m.ins.length} insumos</b> con su costo (${m.nuevos} nuevos, ${m.cambian.length} cambiaron de costo)<br>
      🧩 <b>${m.tipOk} tipologías</b> disponibles en el cotizador<br>
      📋 <b>${m.recOk} líneas de receta</b><br>
      ${Object.keys(m.par).length?`⚙️ Parámetros: ${[m.par.tipo_cambio!=null?'dólar '+crmNum(m.par.tipo_cambio):'',m.par.margen_default!=null?'margen '+maePct(m.par.margen_default)+'%':'',m.par.iva!=null?'IVA '+maePct(m.par.iva)+'%':''].filter(Boolean).join(' · ')}<br>`:''}
      🔗 Los costos de los proyectos y los precios del cotizador ya usan estos valores.</div>
    ${m.avisos.length?`<div class="cst-aviso amar" style="margin-top:8px">${m.avisos.map(esc).join('<br>')}</div>`:''}
    ${m.cambian.length?`<details style="margin-top:6px"><summary style="cursor:pointer">Ver los ${m.cambian.length} costos que cambiaron</summary>${m.cambian.slice(0,80).map(x=>`<div class="crm-n">${esc(x.nombre)}: ${x.antes==null?'sin costo':usd(x.antes)} → <b>${usd(x.costo)}</b></div>`).join('')}</details>`:''}
    ${cerrar}</div>`;
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
    ['iva','IVA','Se suma al precio de lista','%'],['validez_dias','Validez de la cotización','Días','días'],
    ['mo_m2_referencia','m² del módulo de referencia de la mano de obra','La mano de obra de cada presupuesto = m² del módulo ÷ estos m² × el costo de "Mano de obra general" (Ítems de proyectos). 40 pies = 29,74 m²','m²']];
  return `<div class="card">${P.map(([k,t,d,u])=>`<div class="fg"><label>${t} <small>${d}</small></label>
    <div style="display:flex;gap:6px;align-items:center"><input type="text" inputmode="decimal" value="${u==='%'?maePct(mae.par[k]):mae.par[k]??''}" onchange="maePar('${k}',this.value,${u==='%'})"> ${u}</div></div>`).join('')}
    <div style="font-size:12px;color:var(--gris-m)">El vendedor ve solo el precio final. El margen y los costos los ven vos y el líder de ventas.</div></div>`;
}
async function maePar(k,v,esPct){
  let n=maeNum(v); if(isNaN(n)||n<0||(k==='mo_m2_referencia'&&n===0)){toast('⚠️ Valor inválido');renderMaestro();return;}
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
    .sort((a,b)=>((a.eq.length||a.p?.fuente==='nombre'?1:0)-(b.eq.length||b.p?.fuente==='nombre'?1:0))||(b.usos-a.usos)||a.clave.localeCompare(b.clave));
  const sinEq=l.filter(x=>!x.eq.length&&x.usos&&x.p?.fuente!=='nombre').length;
  return `<div class="card" style="font-size:13px">Cada ítem que sale de la nota de pedido (o de la receta de obra) toma su costo del maestro: uno o más insumos, cada uno con un factor.
      Ej.: Lavamatic = lavamanos + monocomando; Aislación (m²) = Isover ÷ 9,4 → factor 0,1064; Pintura (tacho 20 l) = litro × 20.
      <div style="margin-top:6px">Si un ítem se llama igual que un insumo, lo toma solo: no hace falta emparejarlo. Cualquier cambio acá o en Insumos recalcula al instante los presupuestos abiertos; los que el cliente ya aceptó conservan su precio.</div>
      ${sinEq?`<div style="margin-top:6px;color:var(--rojo);font-weight:700">${sinEq} ítem${sinEq>1?'s':''} usado${sinEq>1?'s':''} en pedidos sin emparejar: usan el precio viejo de la lista de costos.</div>`:''}</div>
    <div class="fg"><input type="search" id="mae-busca" placeholder="🔍 Buscar ítem…" value="${esc(mae.busca)}" oninput="mae.busca=this.value;renderMaestro();maeFoco('#mae-busca')"></div>
    <div class="card cst-lista">${l.map(x=>{const ab=mae.eqAbierto===x.clave;return `<div class="cst-li ${x.eq.length||x.p?.fuente==='nombre'?'':'sinp'}" style="display:block">
      <div style="display:flex;justify-content:space-between;gap:8px;cursor:pointer" onclick="maeEqAbrir(${esc(JSON.stringify(x.clave))})">
        <div style="min-width:0"><b>${esc(x.clave)}</b><small>${x.unidad?'por '+esc(x.unidad):''}${x.usos?` · en ${x.usos} pedido${x.usos>1?'s':''}`:''}${x.receta?' · receta de obra':''}</small>
          <small>${x.eq.length?x.eq.map(c=>esc(maeNombre(c.insumo))+(c.factor!==1?' × '+fmt2(c.factor):'')).join(' + '):(x.p&&x.p.fuente==='nombre'?'Toma el insumo '+esc(maeNombre(x.p.insumo))+' (mismo nombre)':x.p?'Sin emparejar · precio viejo':'Sin emparejar')}</small></div>
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
  // ítem sin costo (ej. "Armado de oficina"): se carga el costo directo y queda como insumo con el mismo nombre
  const directo=!(mae.eq[clave]||[]).length&&!maeInsIgual(clave);
  return `<div style="margin-top:8px;border-top:1px solid var(--borde);padding-top:8px">
    ${directo?`<div style="background:var(--fondo,#F6F7F9);border-radius:10px;padding:8px;margin-bottom:8px">
      <div style="font-size:13px;font-weight:700">Cargar el costo directo</div>
      <div style="font-size:12px;color:var(--gris-m);margin:2px 0 6px">Crea el insumo "${esc(clave)}" en Insumos con este costo. Los presupuestos abiertos se recalculan al instante.</div>
      <div style="display:flex;gap:6px;align-items:center"><input id="mae-dir-cos" type="text" inputmode="decimal" placeholder="USD" style="flex:1;min-width:0">
        <button class="btn btn-nar btn-sm" onclick="maeCostoDirecto(${esc(JSON.stringify(clave))})">Guardar costo</button></div>
      <div style="font-size:12px;color:var(--gris-m);margin-top:6px">O armalo con insumos que ya existen:</div></div>`:''}
    ${b.map((c,i)=>`<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">
      <input style="flex:1;min-width:0" list="mae-ins-dl" value="${esc(c.insumo?maeNombre(c.insumo)+' · '+c.insumo:'')}" onchange="maeEqSet(${i},'insumo',this.value)" placeholder="Insumo">
      <span>×</span><input style="width:80px" type="text" inputmode="decimal" value="${String(c.factor).replace('.',',')}" onchange="maeEqSet(${i},'factor',this.value)" aria-label="Factor">
      <button class="mp-b" onclick="mae.eqBorr.splice(${i},1);renderMaestro()" aria-label="Quitar">✕</button></div>
      ${c.sug?'<div class="crm-n" style="margin:-4px 0 6px">Sugerido por el nombre: revisalo.</div>':''}`).join('')}
    ${maeInsDatalist()}
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
      <button class="btn btn-sec btn-sm" onclick="mae.eqBorr.push({insumo:'',factor:1});renderMaestro()">+ Insumo</button>
      <span style="flex:1;text-align:right;font-size:13px">Costo: <b>${usd(tot)}</b>${clave===MO_M2?` del módulo de referencia → <b>${usd(tot/maeMoRef())}</b> por m² (÷ ${fmt2(maeMoRef())} m², se cambia en Parámetros)`:''}</span></div>
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
    mae.eqAbierto=null; mae.eqBorr=null; toast('✅ Guardado: los proyectos y los presupuestos abiertos ya usan este costo'); renderMaestro();
  }catch(e){toast(msgError(e));}
}

// Costo directo para un ítem de la nota que no tiene insumo: crea el insumo con el mismo nombre (lo toma solo, 0028)
async function maeCostoDirecto(clave){
  const n=maeNum(document.getElementById('mae-dir-cos')?.value);
  if(isNaN(n)||n<0){toast('⚠️ Poné el costo en USD');return;}
  const nums=Object.keys(mae.ins).map(c=>/^INS-(\d+)$/.exec(c)).filter(Boolean).map(m=>Number(m[1]));
  let k=(nums.length?Math.max(...nums):0)+1, cod;
  do{cod='INS-'+String(k++).padStart(3,'0');}while(mae.ins[cod]);
  const fila={codigo:cod,nombre:clave,rubro:typeof rubroReceta==='function'&&rubroReceta(clave)==='mo'?'Mano de obra':null,
    unidad:null,costo_usd:n,para_vendedor:false,fuente:'manual',costo_actualizado_en:new Date().toISOString()};
  try{const r=await sb.from('cot_insumos').insert(fila).select().single(); if(r.error) throw r.error;
    mae.ins[cod]={...r.data,costo:Number(r.data.costo_usd)};
    mae.eqAbierto=null; mae.eqBorr=null;
    toast(`✅ "${clave}" cuesta ${usd(n)}: los presupuestos abiertos ya tienen el precio nuevo`); renderMaestro();}
  catch(e){toast(msgError(e));}
}
