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
  const k=new Set(rec.map(x=>x.clave));
  const company=/Company$/.test(NotaPedido.tipologia(p.ficha).prod||'');
  const queda=x=>!k.has(x.clave)&&(!company||/^(Contenedor |Corte de contenedor|Flete$|Comisión de venta$|Amortización de planta)/.test(x.clave));
  return nota.filter(queda).concat(rec);
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
    <div class="flex-btns" style="flex-wrap:wrap"><button class="btn btn-nar btn-sm" onclick="agregarReceta()">+ Agregar a la receta</button>
      <label class="btn btn-sec btn-sm" style="cursor:pointer">📥 Importar desde la planilla<input type="file" accept=".xlsx,.xls,.ods" style="display:none" onchange="leerRecetaExcel(this)"></label></div>
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

// ── Importar una receta desde la planilla de cotización (una solapa por modelo) ──
// Lee la columna de insumos y la de cantidad; toma las filas con cantidad mayor a 0 hasta la fila
// de "COSTO". El contenedor y el flete ya salen de la nota, así que vienen destildados.
// Si entra el administrador y la solapa trae el precio unitario, también actualiza la lista de costos.
let rtImp=null; // {wb, hoja, filas:[{clave,cant,unidad,costo,usar,motivo}]}
async function leerRecetaExcel(input){
  const f=input.files[0]; input.value=''; if(!f) return;
  try{
    await cargarLib(LIB_XLSX);
    const wb=XLSX.read(await f.arrayBuffer(),{type:'array'});
    const sug=wb.SheetNames.find(n=>normTxt(n).includes(normTxt(rtSel.tipo).replace(/^modulo habitable /,'modulo ')))
      ||wb.SheetNames.find(n=>/company/i.test(n)&&/company/i.test(rtSel.tipo))||wb.SheetNames[0];
    rtImp={wb,archivo:f.name,hoja:sug,filas:[]};
    leerHojaReceta();
  }catch(e){console.error(e);toast('⚠️ No se pudo leer la planilla: '+(e.message||e));rtImp=null;}
  renderRecetas();
}
function leerHojaReceta(){
  const mat=XLSX.utils.sheet_to_json(rtImp.wb.Sheets[rtImp.hoja],{header:1,raw:true,defval:''});
  // encabezado: la fila que tiene "cant" y una columna de nombres (insumos / descripción / material)
  let cab=-1,cN=0,cC=null,cU=null;
  for(let i=0;i<Math.min(20,mat.length);i++){const h=mat[i].map(normTxt);
    const c=h.findIndex(x=>/^cant/.test(x)); if(c<0) continue;
    cab=i;cC=c;cN=Math.max(0,h.findIndex(x=>/insumo|desc|material|detalle|item/.test(x)));
    cU=h.findIndex(x=>/unitario|precio|costo u/.test(x)); if(cU<0) cU=null; break;}
  rtImp.filas=[];
  if(cab<0){rtImp.error='No encontré la columna de cantidad (CANT.) en esta solapa.';return;}
  rtImp.error='';
  for(const r of mat.slice(cab+1)){
    let nom=String(r[cN]??'').replace(/[´`]/g,'').replace(/\s+/g,' ').trim();
    // la comisión y la amortización ya van en todos los pedidos: se usan los mismos nombres para no duplicarlas
    if(/amortizaci/i.test(nom)) nom='Amortización de planta y máquinas';
    else if(/comisi[oó]n de venta/i.test(nom)) nom='Comisión de venta';
    if(!nom) continue;
    if(/^costo|^total|^margen|^precio/i.test(nom)) break;
    const cant=Number(String(r[cC]).replace(',','.'));
    if(!(cant>0)) continue;
    const costo=cU==null?null:Number(String(r[cU]).replace(',','.'));
    const deNota=/^contenedor|^flete/i.test(nom);
    rtImp.filas.push({clave:nom,cant,unidad:'c/u',costo:costo>0?costo:null,usar:!deNota,motivo:deNota?'ya sale de la nota de pedido':''});
  }
}
function importRecetaHTML(){
  const r=rtImp, n=r.filas.filter(x=>x.usar).length, ya=recetas.filter(x=>x.tipo===rtSel.tipo&&x.tam===rtSel.tam).length;
  return `<div class="card" style="border-left:5px solid var(--nar);margin-top:10px">
    <div class="card-title">📄 ${esc(r.archivo)}</div>
    <div class="fg"><label>Solapa</label><select onchange="rtImp.hoja=this.value;leerHojaReceta();renderRecetas()">${r.wb.SheetNames.map(h=>`<option ${h===r.hoja?'selected':''}>${esc(h)}</option>`).join('')}</select></div>
    ${r.error?`<div style="color:var(--rojo);font-size:13px">${esc(r.error)}</div>`:`
    <div style="font-size:12px;color:var(--gris-m);margin-bottom:6px">Se carga en <b>${esc(rtSel.tipo)}${rtSel.tam?' '+esc(rtSel.tam):' (cualquier tamaño)'}</b>${ya?` y <b>reemplaza</b> los ${ya} materiales que tiene hoy`:''}. Cantidades por unidad fabricada.${esAdmin()&&r.filas.some(x=>x.costo)?' Como sos administrador, los precios unitarios también pasan a la lista de costos.':''}</div>
    <div class="mp-lista">${r.filas.map((x,i)=>`<div class="mp-f${x.usar?'':' mp-fuera'}">
      <div class="mp-n"><label style="display:flex;gap:6px;align-items:flex-start"><input type="checkbox" ${x.usar?'checked':''} onchange="rtImp.filas[${i}].usar=this.checked;renderRecetas()"><span>${esc(x.clave)}${x.motivo?`<small>${esc(x.motivo)}</small>`:''}</span></label></div>
      <div class="mp-c">${mpFmt(x.cant)} <span>${esc(x.unidad)}</span></div></div>`).join('')}</div>
    <div class="flex-btns" style="margin-top:8px"><button class="btn btn-verde btn-sm" ${n?'':'disabled'} onclick="guardarRecetaImp(this)">✅ Cargar ${n} materiales</button>
      <button class="btn btn-sec btn-sm" onclick="rtImp=null;renderRecetas()">Cancelar</button></div>`}
  </div>`;
}
async function guardarRecetaImp(btn){
  const r=rtImp; if(!r) return;
  const filas=r.filas.filter(x=>x.usar), ya=recetas.filter(x=>x.tipo===rtSel.tipo&&x.tam===rtSel.tam);
  if(ya.length&&!await confirmar(`Se reemplazan los ${ya.length} materiales de la receta de ${rtSel.tipo}${rtSel.tam?' '+rtSel.tam:''} por ${filas.length} de la planilla. Los proyectos ya asignados no cambian. ¿Seguimos?`)) return;
  btn.disabled=true;
  try{
    if(ya.length) chk(await sb.from('recetas_tipologia').delete().eq('tipologia',rtSel.tipo).eq('tam',rtSel.tam));
    const nuevas=[...new Map(filas.map(x=>[x.clave,x])).values()].map(x=>({id:nuevoId(),tipologia:rtSel.tipo,tam:rtSel.tam,clave:x.clave,unidad:x.unidad,cant:x.cant}));
    chk(await sb.from('recetas_tipologia').insert(nuevas));
    recetas=recetas.filter(x=>!(x.tipo===rtSel.tipo&&x.tam===rtSel.tam)).concat(nuevas.map(f=>({id:f.id,tipo:f.tipologia,tam:f.tam,clave:f.clave,unidad:f.unidad,cant:f.cant})));
    let np=0;
    if(esAdmin()&&costeoListo){
      for(const x of filas.filter(y=>y.costo)){
        const prev=listaCostos[x.clave]||{};
        const fila={clave:x.clave,costo:Math.round(x.costo*100)/100,rubro:prev.rubro||rubroReceta(x.clave),unidad:prev.unidad||x.unidad};
        if(proveedoresListo) Object.assign(fila,{proveedor:'Planilla '+r.hoja.trim(),fuente:'excel',referencia:null});
        chk(await sb.from('lista_costos').upsert(fila,{onConflict:'clave'})); listaCostos[x.clave]={...prev,...fila}; np++;
      }
    }
    toast(`✅ Receta cargada: ${nuevas.length} materiales${np?` · ${np} precios en Costos`:''}`);
    rtImp=null; renderRecetas();
  }catch(e){toast(msgError(e)); btn.disabled=false;}
}
