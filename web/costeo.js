// ════════════════════════════════════════════════
// COSTEO DEL PEDIDO (solo administrador)
// La base solo entrega estas tablas al administrador (migración 0004). La app además
// no dibuja nada de esto para otros roles.
// ════════════════════════════════════════════════
let listaCostos={};      // clave -> {id,clave,rubro,unidad,costo}
let costeos={};          // proyecto_id -> {ajustes:{}, extras:[], total}
let costeoListo=false;   // false si todavía no se corrió la migración 0004
const esAdmin=()=>rol()==='admin';

async function cargarCosteo(){
  listaCostos={}; costeos={}; costeoListo=false;
  if(perfiles[myId]?.rol!=='admin') return;
  try{
    const [l,c]=await Promise.all([traerSinOrden('lista_costos'),traerSinOrden('costeos')]);
    l.forEach(r=>listaCostos[r.clave]={id:r.id,clave:r.clave,rubro:r.rubro,unidad:r.unidad,costo:Number(r.costo)||0,proveedor:r.proveedor||null,fuente:r.fuente||'manual',referencia:r.referencia||null});
    c.forEach(r=>costeos[r.proyecto_id]={ajustes:r.ajustes||{},extras:r.extras||[],total:r.total});
    costeoListo=true;
  }catch(e){console.warn('Costeo no disponible (¿falta la migración 0004?)',e);}
}

// Líneas del costeo: lo que sale de la nota + correcciones + líneas a mano
function costeoDe(p){
  const c=costeos[p.id]||{ajustes:{},extras:[]};
  // lo de la nota + la receta de su tipología (si un material está en las dos, manda la receta)
  let base=esNota(p)?NotaPedido.lineasCosteo(p.ficha):[];
  const rec=typeof lineasReceta==='function'?lineasReceta(p):[];
  base=typeof baseConReceta==='function'?baseConReceta(p,base,rec):base;
  // instalación eléctrica por m² (migración 0030): lo eléctrico suelto queda incluido, con costo 0 (menos en Company)
  const company=/Company$/.test(NotaPedido.tipologia(p.ficha||{}).prod||'');
  if(company&&typeof ELEC_M2!=='undefined') base=base.filter(x=>x.clave!==ELEC_M2);   // Company sigue con lo eléctrico de su receta
  const elec=typeof esElectrico==='function'&&!company&&base.some(x=>x.clave===ELEC_M2);
  const lineas=base.map(x=>{
    const k=x.clave+(x.det?' | '+x.det:'');
    // costo: del maestro de insumos (migración 0025); si el ítem no está emparejado, la lista de costos vieja
    const precio=elec&&x.clave!==ELEC_M2&&esElectrico(x.clave)?{costo:0,fuente:'incluido'}:typeof precioItem==='function'?precioItem(x.clave):listaCostos[x.clave];
    const cant=c.ajustes[k]!=null?Number(c.ajustes[k]):x.cant;
    return {...x,k,cant,cantNota:x.cant,ajustada:c.ajustes[k]!=null,
      rubro:precio?.rubro||x.rubro,unidad:precio?.unidad||x.unidad,costo:precio?precio.costo:null,fuente:precio?.fuente||'',
      sub:precio&&precio.costo!=null?cant*precio.costo:0};
  });
  const extras=(c.extras||[]).map((x,i)=>({...x,i,sub:(Number(x.cant)||0)*(Number(x.costo)||0)}));
  const por={}; Object.keys(RUBROS).forEach(r=>por[r]=0);
  lineas.forEach(x=>por[x.rubro]=(por[x.rubro]||0)+x.sub);
  extras.forEach(x=>{const r=RUBROS[x.rubro]?x.rubro:'otr';por[r]+=x.sub;});
  const total=Object.values(por).reduce((s,v)=>s+v,0);
  const sinPrecio=lineas.filter(x=>(x.costo==null||x.costo===0)&&x.fuente!=='incluido');
  const pend=lineas.filter(x=>x.pend);
  return {lineas,extras,por,total,sinPrecio,pend,guardado:c.total};
}
// costo de la nota para las tarjetas y el resumen (solo administrador)
function costoNota(p){if(!esAdmin()||!costeoListo||!esNota(p)) return null; return costeoDe(p);}
const num=v=>{const n=Number(String(v).replace(',','.'));return isFinite(n)?n:0};
const fmt2=n=>(Math.round(n*100)/100).toLocaleString('es-AR');

function seccionCosteo(p){
  if(!esAdmin()) return '';
  if(!costeoListo) return `<div class="dsec"><h3>🔒 Costeo del pedido</h3><div style="font-size:13px">Para activarlo hay que correr la migración <b>0004_costeo_solo_admin.sql</b> en Supabase.</div></div>`;
  if(!esNota(p)) return `<div class="dsec"><h3>🔒 Costeo del pedido</h3><div style="font-size:13px">Este proyecto tiene la ficha anterior: el costeo automático necesita la nota de pedido nueva.</div></div>`;
  const c=costeoDe(p), id=esc(p.id), val=Number(p.val)||0;
  const margen=val?val-c.total:null;
  // el total queda guardado solo (para reportes), sin botón
  if(c.guardado==null||Math.abs((Number(c.guardado)||0)-c.total)>=0.5) setTimeout(()=>guardarFilaCosteo(p.id),0);
  return `<div class="dsec costeo"><h3>🔒 Costeo del pedido <span style="font-weight:400;color:var(--gris-m);font-size:11px">solo vos lo ves</span></h3>
    <div style="font-size:12px;color:var(--gris-m);margin-bottom:8px">Se calcula solo: cantidades de la nota de pedido y de la receta de la tipología, por el costo de cada ítem en el maestro de insumos (Materiales y costos).</div>
    ${c.lineas.some(x=>x.fuente==='viejo')?`<div class="cst-aviso amar">${c.lineas.filter(x=>x.fuente==='viejo').length} ítem(s) todavía usan el precio viejo de la lista de costos: emparejalos con el maestro en Materiales y costos → Ítems de proyectos.</div>`:''}
    ${c.sinPrecio.length?`<div class="cst-aviso">Faltan precios en ${c.sinPrecio.length} ítem${c.sinPrecio.length>1?'s':''}: ${esc(c.sinPrecio.slice(0,3).map(x=>x.clave).join(', '))}${c.sinPrecio.length>3?'…':''}.
      <button class="btn btn-sec btn-sm" style="margin-top:6px" onclick="closeOverlay('m-det');mae.sub='equiv';mae.busca='';showView('materiales')">Emparejarlos con el maestro</button></div>`:''}
    ${c.pend.length?`<div class="cst-aviso amar">Hay ítems "a confirmar" en la nota: el costo puede cambiar.</div>`:''}
    <div class="cst-tabla">
      <div class="cst-h"><span>Ítem</span><span>Cant.</span><span>Costo u.</span><span>Subtotal</span></div>
      ${c.lineas.map(x=>`<div class="cst-f ${x.costo||x.fuente==='incluido'?'':'sinp'}">
        <span>${esc(x.clave)}${x.det?`<small>${esc(x.det)}</small>`:''}</span>
        <span><input type="number" step="0.01" value="${x.cant}" title="Cantidad calculada de la nota: corregila solo si hace falta" onchange="ajustarCant('${id}',${esc(JSON.stringify(x.k))},this.value,${x.cantNota})">
          <small>${esc(x.unidad)}${x.ajustada?' · corregido':''}${x.receta?' · receta':''}</small></span>
        <span class="cst-pu">${x.fuente==='incluido'?'<small>incluido en instalación eléctrica</small>':x.costo?usd(x.costo)+(x.fuente==='viejo'?'<small>precio viejo</small>':''):'<b style="color:var(--rojo)">sin precio</b>'}</span>
        <span class="cst-sub">${x.costo!=null?usd(x.sub):'—'}</span></div>`).join('')}
      ${c.extras.map(x=>`<div class="cst-f extra">
        <span>${esc(x.desc)}<small>${esc(RUBROS[x.rubro]||'Otros')} · agregado a mano <a href="#" onclick="quitarExtra(event,'${id}',${x.i})">quitar</a></small></span>
        <span>${fmt2(Number(x.cant)||0)}</span><span>${usd(x.costo)}</span><span class="cst-sub">${usd(x.sub)}</span></div>`).join('')}
    </div>

    ${Object.entries(RUBROS).map(([k,v])=>`<div class="drow"><span class="lbl">${v}</span><span class="val">${usd(c.por[k])}</span></div>`).join('')}
    <div class="drow"><span class="lbl"><b>Costo total</b></span><span class="val">${usd(c.total)}</span></div>
    <div class="drow"><span class="lbl">Valor de venta</span><span class="val">${val?usd(val):'— (sin cargar)'}</span></div>
    ${margen!=null?`<div class="drow"><span class="lbl">Margen</span><span class="val" style="color:${margen<0?'var(--rojo)':'var(--verde)'}">${usd(margen)} (${(margen/val*100).toFixed(1)}%)</span></div>`:''}
    <details style="margin-top:8px;font-size:12px"><summary style="cursor:pointer;color:var(--gris-m)">➕ Agregar un costo que no está en la nota (flete, extra)</summary>
    <div class="cst-add" style="margin-top:6px">
      <input id="cx-desc" placeholder="Agregar ítem (ej: flete Mendoza)">
      <input id="cx-cant" type="number" step="0.01" placeholder="Cant." value="1">
      <input id="cx-costo" type="number" step="0.01" placeholder="Costo u.">
      <select id="cx-rubro">${Object.entries(RUBROS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select>
      <button class="btn btn-sec btn-sm" onclick="agregarExtra('${id}')">＋</button>
    </div>
    </details>
  </div>`;
}

async function guardarFilaCosteo(pid){
  const c=costeos[pid]||(costeos[pid]={ajustes:{},extras:[]});
  const p=todos[pid]; c.total=p?costeoDe(p).total:null;
  try{chk(await sb.from('costeos').upsert({proyecto_id:pid,ajustes:c.ajustes,extras:c.extras,total:c.total}));}
  catch(e){toast(msgError(e));}
}
async function ajustarCant(pid,k,v,cantNota){
  const c=costeos[pid]||(costeos[pid]={ajustes:{},extras:[]});
  const n=num(v);
  if(v===''||Math.abs(n-cantNota)<0.005) delete c.ajustes[k]; else c.ajustes[k]=n;
  await guardarFilaCosteo(pid); verDetalle(pid);
}
async function agregarExtra(pid){
  const desc=document.getElementById('cx-desc').value.trim();
  if(!desc){toast('⚠️ Escribí qué es el ítem');return;}
  const c=costeos[pid]||(costeos[pid]={ajustes:{},extras:[]});
  c.extras=(c.extras||[]); c.extras.push({desc,cant:num(document.getElementById('cx-cant').value)||1,
    costo:num(document.getElementById('cx-costo').value),rubro:document.getElementById('cx-rubro').value});
  await guardarFilaCosteo(pid); verDetalle(pid);
}
async function quitarExtra(ev,pid,i){
  ev.preventDefault();
  const c=costeos[pid]; if(!c) return;
  c.extras.splice(i,1); await guardarFilaCosteo(pid); verDetalle(pid);
}
// ── Ítems que salen de las notas de pedido (para emparejarlos con el maestro de insumos) ──
function catalogoCostos(){
  // todos los ítems que aparecen en las notas cargadas + los que ya tienen precio
  const items={};
  Object.values(listaCostos).forEach(x=>items[x.clave]={...x,usos:0});
  Object.values(todos).forEach(p=>{if(!esNota(p))return;
    const vistos=new Set();
    NotaPedido.lineasCosteo(p.ficha).forEach(l=>{
      const it=items[l.clave]||(items[l.clave]={clave:l.clave,rubro:l.rubro,unidad:l.unidad,costo:null,usos:0});
      if(!vistos.has(l.clave)){it.usos++;vistos.add(l.clave);}
    });});
  return Object.values(items).sort((a,b)=>((a.costo?1:0)-(b.costo?1:0))||a.clave.localeCompare(b.clave));
}
