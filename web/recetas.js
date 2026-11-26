// ════════════════════════════════════════════════
// RECETA DE MATERIALES POR TIPOLOGÍA
// El líder (o el admin) carga una vez qué materiales lleva cada tipología (Oficina, Sanitario,
// Pañol...) y, si cambia según el contenedor, por tamaño. La cantidad es por unidad fabricada.
// Al asignar un proyecto, la receta se suma a lo que sale de la nota de pedido y queda fija como
// lo planificado: el supervisor controla el uso real contra la receta de lo que está fabricando.
// Sin precios: la plata la sigue viendo solo el admin (migración 0013).
// ════════════════════════════════════════════════
let recetas=[];            // filas de recetas_tipologia
let recetasListo=false;    // false si todavía no se corrió la migración 0013
let rtSel={tipo:'',tam:''};

async function cargarRecetas(){
  recetasListo=false; recetas=[];
  try{
    recetas=(await traer('recetas_tipologia')).map(r=>({id:r.id,tipo:r.tipologia,tam:r.tam||'',clave:r.clave,unidad:r.unidad||'c/u',cant:Number(r.cant)||0}));
    recetasListo=true;
  }catch(e){console.warn('Recetas por tipología no disponibles (¿falta la migración 0013?)',e);}
}

// Líneas de la receta que corresponden a un proyecto: las de su tipología (cualquier tamaño)
// más las de su tamaño. Si un material está en las dos, manda la del tamaño.
function lineasReceta(p){
  if(!recetasListo||!esNota(p)) return [];
  const t=NotaPedido.tipologia(p.ficha); if(!t.prod) return [];
  const m={};
  recetas.filter(r=>r.tipo===t.prod&&r.tam==='').forEach(r=>m[r.clave]=r);
  recetas.filter(r=>r.tipo===t.prod&&r.tam&&r.tam===t.tam).forEach(r=>m[r.clave]=r);
  return Object.values(m).map(r=>({clave:r.clave,det:'',unidad:r.unidad,cant:Math.round(r.cant*t.unidades*100)/100,rubro:rubroReceta(r.clave),receta:true}));
}
// La receta no guarda el rubro: lo que no es material (mano de obra, instalación, comisión…) se reconoce por el nombre
function rubroReceta(clave){
  const c=normTxt(clave);
  if(/mano de obra|colocar|colocacion|instalacion electrica/.test(c)) return 'mo';
  if(/flete/.test(c)) return 'ter';
  if(/comision|amortizacion/.test(c)) return 'otr';
  return 'mat';
}
// Lo que se costea y se controla de un proyecto: la nota de pedido + la receta de su tipología.
// Si un material está en las dos, manda la receta. Los productos Company son producción estándar:
// si su tipología tiene receta, manda la receta completa y de la nota quedan solo el contenedor,
// el corte, el flete, la comisión y la amortización (pedido de Cristian 19/11).
function baseConReceta(p,nota,rec){
  if(!rec.length) return nota;
  // mano de obra por regla de tres (0028): si la nota la trae por m², la de la receta no se suma
  if(nota.some(x=>x.clave==='Mano de obra general')) rec=rec.filter(x=>!/^mano de obra/i.test(x.clave));
  const k=new Set(rec.map(x=>x.clave));
  const company=/Company$/.test(NotaPedido.tipologia(p.ficha).prod||'');
  const queda=x=>!k.has(x.clave)&&(!company||/^(Contenedor |Corte de contenedor|Flete$|Comisión de venta$|Amortización de planta|Mano de obra general$)/.test(x.clave));
  return nota.filter(queda).concat(rec);
}

function renderRecetas(){
  const el=document.getElementById('recetas-sec'); if(!el) return;
  if(!esOp()){el.innerHTML='';return;}
  if(!recetasListo){el.innerHTML=`<div class="card"><div style="font-size:14px;font-weight:800">📐 Receta por tipología</div>
    <div style="font-size:13px;margin-top:6px">Para activarla hay que correr la migración <b>0013_parte_diario_y_pintura.sql</b> en Supabase.</div></div>`;return;}
  const T=NotaPedido.TIPOLOGIAS, TM=NotaPedido.TAMS;
  if(!rtSel.tipo) rtSel.tipo=T[0];
  const cuenta=t=>recetas.filter(r=>r.tipo===t).length;
  const filas=recetas.filter(r=>r.tipo===rtSel.tipo&&r.tam===rtSel.tam).sort((a,b)=>a.clave.localeCompare(b.clave));
  const general=rtSel.tam?recetas.filter(r=>r.tipo===rtSel.tipo&&r.tam===''):[];
  // también los insumos del maestro (solo el admin los ve): un material con el mismo nombre toma su costo solo
  const insMae=typeof mae!=='undefined'&&mae.listo?Object.values(mae.ins).filter(x=>x.activo).map(x=>cotLindoRec(x.nombre)):[];
  const claves=[...new Set([...recetas.map(r=>r.clave),...insMae])].sort();
  el.innerHTML=`<div class="card">
    <div style="font-size:14px;font-weight:800">📐 Receta por tipología</div>
    <div style="font-size:12px;color:var(--gris-m);margin:4px 0 10px">Qué materiales lleva cada tipología, por unidad. Al asignar un proyecto se suman a los de la nota y el supervisor controla lo usado contra eso. Si algo cambia según el contenedor, cargalo en el tamaño.</div>
    <div class="form-2"><div class="fg"><label>Tipología</label><select onchange="rtSel.tipo=this.value;renderRecetas()">
      ${T.map(t=>`<option value="${esc(t)}" ${t===rtSel.tipo?'selected':''}>${esc(t)}${cuenta(t)?` (${cuenta(t)})`:''}</option>`).join('')}</select></div>
    <div class="fg"><label>Tamaño</label><select onchange="rtSel.tam=this.value;renderRecetas()">
      <option value="" ${rtSel.tam===''?'selected':''}>Cualquier tamaño</option>
      ${TM.map(t=>`<option value="${esc(t)}" ${t===rtSel.tam?'selected':''}>Solo ${esc(t)}</option>`).join('')}</select></div></div>
    ${general.length?`<div style="font-size:12px;color:var(--gris-m);margin-bottom:6px">También lleva los ${general.length} materiales de "cualquier tamaño". Si cargás uno acá con el mismo nombre, manda este.</div>`:''}
    ${filas.length?`<div class="mp-lista">${filas.map(r=>`<div class="mp-f">
        <div class="mp-n">${esc(r.clave)}</div>
        <div class="mp-c"><input type="number" step="0.01" min="0" value="${r.cant}" onchange="cantReceta('${esc(r.id)}',this.value)"> <span>${esc(r.unidad)}</span></div>
        <div class="mp-s"><button class="mp-b" onclick="quitarReceta('${esc(r.id)}')">✕</button></div></div>`).join('')}</div>`
      :`<div style="font-size:13px;color:var(--gris-m);margin-bottom:6px">Todavía no hay materiales para ${esc(rtSel.tipo)}${rtSel.tam?' '+esc(rtSel.tam):''}.</div>`}
    <datalist id="rt-claves">${claves.map(c=>`<option value="${esc(c)}">`).join('')}</datalist>
    <div class="form-2" style="margin-top:8px"><div class="fg"><label>Material</label><input id="rt-nom" list="rt-claves" placeholder="Ej: Lana de vidrio 50 mm"></div>
      <div class="fg"><label>Unidad</label><input id="rt-uni" placeholder="c/u, m², rollo, kg"></div></div>
    <div class="fg"><label>Cantidad por unidad fabricada</label><input type="number" step="0.01" min="0" id="rt-cant"></div>
    <div class="flex-btns" style="flex-wrap:wrap"><button class="btn btn-nar btn-sm" onclick="agregarReceta()">+ Agregar a la receta</button>
      <button class="btn btn-sec btn-sm" onclick="planillaModeloRecetas()">⬇️ Planilla modelo</button>
      <label class="btn btn-sec btn-sm" style="cursor:pointer">📥 Importar todas las recetas de la planilla<input type="file" accept=".xlsx,.xls,.ods" style="display:none" onchange="leerRecetaExcel(this)"></label></div>
    ${rtImp?importRecetaHTML():''}
  </div>`;
}
async function agregarReceta(){
  const nom=document.getElementById('rt-nom').value.trim(), uni=document.getElementById('rt-uni').value.trim()||'c/u';
  const cant=mpNum(document.getElementById('rt-cant').value);
  if(nom.length<2){toast('⚠️ Poné el nombre del material');return;}
  if(!cant){toast('⚠️ Poné la cantidad por unidad');return;}
  const fila={id:nuevoId(),tipologia:rtSel.tipo,tam:rtSel.tam,clave:nom,unidad:uni,cant};
  try{chk(await sb.from('recetas_tipologia').insert(fila));}
  catch(e){toast('⚠️ No se pudo agregar: '+(String(e.message||'').includes('duplicate')?'ya está en esta receta':e.message||'error'));return;}
  recetas.push({id:fila.id,tipo:fila.tipologia,tam:fila.tam,clave:nom,unidad:uni,cant});
  toast('✅ Agregado a la receta'); renderRecetas();
}
async function cantReceta(id,v){
  const r=recetas.find(x=>x.id===id), n=mpNum(v); if(!r) return;
  if(!n){toast('⚠️ Cantidad inválida');renderRecetas();return;}
  try{chk(await sb.from('recetas_tipologia').update({cant:n}).eq('id',id));r.cant=n;}
  catch(e){toast('⚠️ No se pudo guardar: '+(e.message||'error'));}
  renderRecetas();
}
async function quitarReceta(id){
  const r=recetas.find(x=>x.id===id); if(!r) return;
  if(!await confirmar(`¿Sacar "${r.clave}" de la receta? Los proyectos ya asignados no cambian.`)) return;
  try{chk(await sb.from('recetas_tipologia').delete().eq('id',id));recetas=recetas.filter(x=>x.id!==id);}
  catch(e){toast('⚠️ No se pudo sacar: '+(e.message||'error'));}
  renderRecetas();
}

// ── Importar todas las recetas de la planilla de cotización de una vez ──
// Cada solapa con columna de cantidad (CANT.) es la receta de un modelo. La app propone a qué
// tipología va cada una (por el nombre de la solapa, o por lo que se eligió la última vez) y deja
// sin importar las que no reconoce. Toma las filas con cantidad mayor a 0 hasta la fila "COSTO";
// el contenedor y el flete quedan afuera porque salen de la nota. Cada receta importada reemplaza
// la que había para esa tipología y tamaño. Si entra el administrador, los precios unitarios pasan
// a la lista de costos vieja (la usan solo los ítems que todavía no están emparejados con el maestro de
// insumos); cuando un insumo tiene precios distintos (entre solapas o con esa lista) se elige cuál vale.
let rtImp=null; // {archivo, hojas:[{nombre,tipo,tam,filas,error}], precios:{clave:{vals:{solapa:precio},ant,elegido}}}
const RT_MAPA_KEY='rt_mapa_solapas';
function mapaSolapas(){try{return JSON.parse(localStorage.getItem(RT_MAPA_KEY)||'{}')}catch(e){return {}}}
// propuesta de tipología para una solapa: lo elegido antes, o reglas por nombre
function tipoDeSolapa(nombre){
  // solapas de la planilla modelo: "R · <tipología>" o "R · <tipología> <tamaño>"
  if(/^R · /.test(nombre.trim())){
    const n=normTxt(nombre.trim().slice(4));
    for(const t of NotaPedido.TIPOLOGIAS){
      if(normTxt(t)===n) return {tipo:t,tam:''};
      const tm=NotaPedido.TAMS.find(z=>normTxt(t+' '+z)===n); if(tm) return {tipo:t,tam:tm};
    }
    return {tipo:'',tam:''};
  }
  const m=mapaSolapas()[nombre.trim()]; if(m) return m;
  const n=normTxt(nombre);
  if(/company/.test(n)&&/modulo/.test(n)) return {tipo:'Módulo habitable Company',tam:''};
  if(/^oficina company$|^oficina$/.test(n)) return {tipo:'Oficina Company',tam:''};
  const t=NotaPedido.TIPOLOGIAS.find(x=>normTxt(x)===n); if(t) return {tipo:t,tam:''};
  return {tipo:'',tam:''};
}
async function leerRecetaExcel(input){
  const f=input.files[0]; input.value=''; if(!f) return;
  try{
    await cargarLib(LIB_XLSX);
    const wb=XLSX.read(await f.arrayBuffer(),{type:'array'});
    const hojas=wb.SheetNames.map(nombre=>{const r=leerHojaReceta(wb.Sheets[nombre]);return r?{nombre,...tipoDeSolapa(nombre),filas:r}:null;}).filter(Boolean);
    if(!hojas.length) throw new Error('ninguna solapa tiene columna de cantidad (CANT.)');
    rtImp={archivo:f.name,hojas}; armarPrecios();
  }catch(e){console.error(e);toast('⚠️ No se pudo leer la planilla: '+(e.message||e));rtImp=null;}
  renderRecetas();
}
// filas de receta de una solapa, o null si la solapa no es una receta
function leerHojaReceta(ws){
  const mat=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:''});
  let cab=-1,cN=0,cC=null,cU=null;
  for(let i=0;i<Math.min(20,mat.length);i++){const h=mat[i].map(normTxt);
    const c=h.findIndex(x=>/^cant/.test(x)); if(c<0) continue;
    cab=i;cC=c;cN=Math.max(0,h.findIndex(x=>/insumo|desc|material|detalle|item/.test(x)));
    cU=h.findIndex(x=>/unitario|precio|costo u/.test(x)); if(cU<0) cU=null; break;}
  if(cab<0) return null;
  const filas=[];
  for(const r of mat.slice(cab+1)){
    let nom=String(r[cN]??'').replace(/[´`]/g,'').replace(/\s+/g,' ').trim();
    if(!nom) continue;
    if(/^costo|^total|^margen|^precio/i.test(nom)) break;
    // la comisión y la amortización ya van en todos los pedidos: se usan los mismos nombres para no duplicarlas
    if(/amortizaci/i.test(nom)) nom='Amortización de planta y máquinas';
    else if(/comisi[oó]n de venta/i.test(nom)) nom='Comisión de venta';
    const cant=Number(String(r[cC]).replace(',','.'));
    if(!(cant>0)) continue;
    const costo=cU==null?null:Number(String(r[cU]).replace(',','.'));
    if(/^contenedor|^flete/i.test(nom)) continue; // salen de la nota de pedido
    filas.push({clave:nom,cant,unidad:'c/u',costo:costo>0?Math.round(costo*100)/100:null});
  }
  return filas.length?filas:null;
}
// precios por insumo en las solapas elegidas, y si chocan entre sí o con la lista de costos
function armarPrecios(){
  const prev=rtImp.precios||{}, P={};
  rtImp.hojas.filter(h=>h.tipo).forEach(h=>h.filas.forEach(x=>{if(!x.costo) return;
    const p=P[x.clave]||(P[x.clave]={vals:{},ant:typeof listaCostos!=='undefined'&&listaCostos[x.clave]?Number(listaCostos[x.clave].costo)||null:null});
    p.vals[h.nombre.trim()]=x.costo;}));
  Object.entries(P).forEach(([k,p])=>{
    const distintos=[...new Set(Object.values(p.vals))];
    p.choca=distintos.length>1||(p.ant>0&&!distintos.includes(p.ant));
    // por defecto: se mantiene el de la lista de costos; si no hay, el único o el más repetido
    const cuenta={};Object.values(p.vals).forEach(v=>cuenta[v]=(cuenta[v]||0)+1);
    p.elegido=prev[k]?.elegido??(p.ant>0?p.ant:Number(Object.entries(cuenta).sort((a,b)=>b[1]-a[1])[0][0]));
  });
  rtImp.precios=P;
}
function rtElegirTipo(i,v){const h=rtImp.hojas[i];h.tipo=v;armarPrecios();renderRecetas();}
function importRecetaHTML(){
  const r=rtImp, T=NotaPedido.TIPOLOGIAS, TM=NotaPedido.TAMS;
  const elegidas=r.hojas.filter(h=>h.tipo);
  const dup={};elegidas.forEach(h=>{const k=h.tipo+'|'+h.tam;dup[k]=(dup[k]||0)+1;});
  const choques=esAdmin()?Object.entries(r.precios||{}).filter(([k,p])=>p.choca):[];
  return `<div class="card" style="border-left:5px solid var(--nar);margin-top:10px">
    <div class="card-title">📄 ${esc(r.archivo)}: ${r.hojas.length} solapas con receta</div>
    <div style="font-size:12px;color:var(--gris-m);margin-bottom:8px">Revisá a qué tipología va cada solapa. Las que no reconocí quedan en "No importar": elegiles la tipología o dejalas así. Cada receta reemplaza la que hay hoy para esa tipología y tamaño. El contenedor y el flete no se importan porque salen de la nota.</div>
    ${r.hojas.map((h,i)=>{const ya=h.tipo?recetas.filter(x=>x.tipo===h.tipo&&x.tam===h.tam).length:0, d=h.tipo&&dup[h.tipo+'|'+h.tam]>1;
      return `<div class="rt-hoja${h.tipo?'':' rt-off'}">
        <div class="rt-hn"><b>${esc(h.nombre.trim())}</b><small>${h.filas.length} insumos${!h.tipo?' · <span style="color:#8A5F00">⚠️ no la reconocí</span>':ya?` · reemplaza ${ya} que hay hoy`:''}${d?' · <span style="color:var(--rojo)">otra solapa va a la misma tipología</span>':''}</small>
          <details><summary>ver insumos</summary><div class="rt-ins">${h.filas.map(x=>`${esc(x.clave)} × ${mpFmt(x.cant)}`).join('<br>')}</div></details></div>
        <div class="rt-hs"><select onchange="rtElegirTipo(${i},this.value)"><option value="">No importar</option>${T.map(t=>`<option ${t===h.tipo?'selected':''}>${esc(t)}</option>`).join('')}</select>
          ${h.tipo?`<select onchange="rtImp.hojas[${i}].tam=this.value;renderRecetas()"><option value="">Cualquier tamaño</option>${TM.map(t=>`<option ${t===h.tam?'selected':''}>${esc(t)}</option>`).join('')}</select>`:''}</div>
      </div>`;}).join('')}
    ${choques.length?`<div class="sec-title" style="font-size:14px;margin-top:10px">⚠️ ${choques.length} precio${choques.length>1?'s':''} que no coinciden</div>
      <div style="font-size:12px;color:var(--gris-m);margin-bottom:6px">Cada insumo tiene un solo precio en la lista de costos. Elegí cuál vale. Los ítems emparejados con el maestro de insumos (Materiales y costos → Ítems de proyectos) toman el costo del maestro, no este.</div>
      ${choques.map(([k,p])=>{const ops=[...new Set([...(p.ant>0?[p.ant]:[]),...Object.values(p.vals)])];
        return `<div class="rt-pr"><span>${esc(k)}<small>${p.ant>0?`Lista: ${usd(p.ant)} · `:''}${Object.entries(p.vals).map(([s,v])=>`${esc(s)}: ${usd(v)}`).join(' · ')}</small></span>
          <select onchange="rtImp.precios[${esc(JSON.stringify(k))}].elegido=Number(this.value)">${ops.map(v=>`<option value="${v}" ${v===p.elegido?'selected':''}>${usd(v)}${v===p.ant?' (el de la lista)':''}</option>`).join('')}</select></div>`;}).join('')}`:''}
    <div class="flex-btns" style="margin-top:10px"><button class="btn btn-verde btn-sm" ${elegidas.length?'':'disabled'} onclick="guardarRecetaImp(this)">✅ Importar ${elegidas.length} receta${elegidas.length===1?'':'s'}</button>
      <button class="btn btn-sec btn-sm" onclick="rtImp=null;renderRecetas()">Cancelar</button></div>
  </div>`;
}
async function guardarRecetaImp(btn){
  const r=rtImp; if(!r) return;
  const elegidas=r.hojas.filter(h=>h.tipo);
  const claves={};elegidas.forEach(h=>{const k=h.tipo+'|'+h.tam;(claves[k]=claves[k]||[]).push(h.nombre.trim());});
  const rep=Object.entries(claves).filter(([k,v])=>v.length>1);
  if(rep.length){toast('⚠️ Dos solapas van a la misma tipología: '+rep.map(([k,v])=>v.join(' y ')).join('; ')+'. Cambiá una.');return;}
  if(!await confirmar(`Se importan ${elegidas.length} recetas:\n\n${elegidas.map(h=>`• ${h.nombre.trim()} → ${h.tipo}${h.tam?' '+h.tam:''} (${h.filas.length} insumos)`).join('\n')}\n\nCada una reemplaza la receta que había. Los proyectos ya asignados no cambian.`)) return;
  btn.disabled=true;
  try{
    for(const h of elegidas){
      chk(await sb.from('recetas_tipologia').delete().eq('tipologia',h.tipo).eq('tam',h.tam));
      const nuevas=[...new Map(h.filas.map(x=>[x.clave,x])).values()].map(x=>({id:nuevoId(),tipologia:h.tipo,tam:h.tam,clave:x.clave,unidad:x.unidad,cant:x.cant}));
      chk(await sb.from('recetas_tipologia').insert(nuevas));
      recetas=recetas.filter(x=>!(x.tipo===h.tipo&&x.tam===h.tam)).concat(nuevas.map(f=>({id:f.id,tipo:f.tipologia,tam:f.tam,clave:f.clave,unidad:f.unidad,cant:f.cant})));
    }
    // se recuerda a qué tipología va cada solapa para la próxima vez
    const m=mapaSolapas(); r.hojas.forEach(h=>{m[h.nombre.trim()]={tipo:h.tipo,tam:h.tam};});
    try{localStorage.setItem(RT_MAPA_KEY,JSON.stringify(m));}catch(e){}
    let np=0;
    if(esAdmin()&&costeoListo){
      for(const [k,p] of Object.entries(r.precios||{})){
        const v=p.elegido; if(!(v>0)||v===p.ant) continue;
        const prev=listaCostos[k]||{};
        const fila={clave:k,costo:v,rubro:prev.rubro||rubroReceta(k),unidad:prev.unidad||'c/u'};
        Object.assign(fila,{proveedor:'Planilla '+r.archivo.replace(/\.\w+$/,''),fuente:'excel',referencia:null});
        chk(await sb.from('lista_costos').upsert(fila,{onConflict:'clave'})); listaCostos[k]={...prev,...fila}; np++;
      }
    }
    toast(`✅ ${elegidas.length} recetas importadas${np?` · ${np} precios actualizados en la lista de costos`:''}`);
    rtImp=null; renderRecetas();
  }catch(e){toast(msgError(e)); btn.disabled=false;}
}

// ── Planilla modelo: una solapa por tipología con el formato que la app lee ──
// Trae lo que ya está cargado (receta y, solo para el administrador, el precio de la lista de costos) para
// completarla y volver a subirla con "Importar". Si una tipología cambia según el contenedor, se
// copia la solapa y se le agrega el tamaño al nombre (ej: "R · Oficina Company 40 HC").
async function planillaModeloRecetas(){
  try{
    await cargarLib(LIB_XLSX);
    const admin=esAdmin()&&costeoListo, wb=XLSX.utils.book_new();
    const inst=[['Planilla modelo de recetas · BoxTainer'],[''],
      ['1. Cada solapa que empieza con "R · " es la receta de una tipología. No cambies ese nombre.'],
      ['2. Una fila por insumo: nombre, cantidad por unidad fabricada y unidad'+(admin?', y el costo unitario en USD (solo lo ve el administrador).':'.')],
      ['3. Si la receta cambia según el contenedor, copiá la solapa y agregale el tamaño al nombre: "R · Oficina Company 40 HC" (tamaños: '+NotaPedido.TAMS.join(', ')+').'],
      ['4. No hace falta poner el contenedor ni el flete: salen de la nota de pedido. Comisión de venta y amortización van en todos los pedidos.'],
      ['5. Usá siempre el mismo nombre para el mismo insumo en todas las solapas: así tiene un solo precio.'],
      ['6. Guardala y subila en Materiales → Receta → "Importar todas las recetas de la planilla".']];
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(inst),'Instrucciones');
    const cab=['INSUMOS','CANT.','UNIDAD',...(admin?['UNITARIO USD']:[])];
    const grupos=[];
    NotaPedido.TIPOLOGIAS.forEach(t=>{
      grupos.push({t,tam:''});
      [...new Set(recetas.filter(r=>r.tipo===t&&r.tam).map(r=>r.tam))].forEach(tam=>grupos.push({t,tam}));
    });
    grupos.forEach(({t,tam})=>{
      const filas=recetas.filter(r=>r.tipo===t&&r.tam===tam).sort((a,b)=>a.clave.localeCompare(b.clave))
        .map(r=>[r.clave,r.cant,r.unidad,...(admin?[listaCostos[r.clave]?.costo??'']:[])]);
      const ws=XLSX.utils.aoa_to_sheet([cab,...(filas.length?filas:[['',null,'c/u']])]);
      ws['!cols']=[{wch:50},{wch:8},{wch:8},{wch:13}];
      XLSX.utils.book_append_sheet(wb,ws,('R · '+t+(tam?' '+tam:'')).slice(0,31));
    });
    XLSX.writeFile(wb,'recetas-boxtainer.xlsx');
  }catch(e){toast('⚠️ No se pudo armar la planilla: '+(e.message||e));}
}

// "MESA PLEGABLE" → "Mesa plegable" (la base compara sin importar mayúsculas)
function cotLindoRec(n){n=String(n||'').trim();return n===n.toUpperCase()?n.charAt(0)+n.slice(1).toLowerCase():n;}
