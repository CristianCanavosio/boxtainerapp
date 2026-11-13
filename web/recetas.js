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
  return Object.values(m).map(r=>({clave:r.clave,det:'',unidad:r.unidad,cant:Math.round(r.cant*t.unidades*100)/100,rubro:'mat',receta:true}));
}

function renderRecetas(){
  const el=document.getElementById('recetas-sec'); if(!el) return;
  if(MODO!=='nube'||!esOp()){el.innerHTML='';return;}
  if(!recetasListo){el.innerHTML=`<div class="card"><div style="font-size:14px;font-weight:800">📐 Receta por tipología</div>
    <div style="font-size:13px;margin-top:6px">Para activarla hay que correr la migración <b>0013_parte_diario_y_pintura.sql</b> en Supabase.</div></div>`;return;}
  const T=NotaPedido.TIPOLOGIAS, TM=NotaPedido.TAMS;
  if(!rtSel.tipo) rtSel.tipo=T[0];
  const cuenta=t=>recetas.filter(r=>r.tipo===t).length;
  const filas=recetas.filter(r=>r.tipo===rtSel.tipo&&r.tam===rtSel.tam).sort((a,b)=>a.clave.localeCompare(b.clave));
  const general=rtSel.tam?recetas.filter(r=>r.tipo===rtSel.tipo&&r.tam===''):[];
  const claves=[...new Set(recetas.map(r=>r.clave))].sort();
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
    <button class="btn btn-nar btn-sm" onclick="agregarReceta()">+ Agregar a la receta</button>
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
