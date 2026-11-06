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
  if(costeoListo) await cargarProveedores();
}

// Líneas del costeo: lo que sale de la nota + correcciones + líneas a mano
function costeoDe(p){
  const c=costeos[p.id]||{ajustes:{},extras:[]};
  const base=esNota(p)?NotaPedido.lineasCosteo(p.ficha):[];
  const lineas=base.map(x=>{
    const k=x.clave+(x.det?' | '+x.det:'');
    const precio=listaCostos[x.clave];
    const cant=c.ajustes[k]!=null?Number(c.ajustes[k]):x.cant;
    return {...x,k,cant,cantNota:x.cant,ajustada:c.ajustes[k]!=null,
      rubro:precio?.rubro||x.rubro,unidad:precio?.unidad||x.unidad,costo:precio?precio.costo:null,
      sub:precio?cant*precio.costo:0};
  });
  const extras=(c.extras||[]).map((x,i)=>({...x,i,sub:(Number(x.cant)||0)*(Number(x.costo)||0)}));
  const por={}; Object.keys(RUBROS).forEach(r=>por[r]=0);
  lineas.forEach(x=>por[x.rubro]=(por[x.rubro]||0)+x.sub);
  extras.forEach(x=>{const r=RUBROS[x.rubro]?x.rubro:'otr';por[r]+=x.sub;});
  const total=Object.values(por).reduce((s,v)=>s+v,0);
  const sinPrecio=lineas.filter(x=>x.costo==null||x.costo===0);
  const pend=lineas.filter(x=>x.pend);
  return {lineas,extras,por,total,sinPrecio,pend,guardado:c.total};
}
const num=v=>{const n=Number(String(v).replace(',','.'));return isFinite(n)?n:0};
const fmt2=n=>(Math.round(n*100)/100).toLocaleString('es-AR');

function seccionCosteo(p){
  if(!esAdmin()) return '';
  if(!costeoListo) return `<div class="dsec"><h3>🔒 Costeo del pedido</h3><div style="font-size:13px">Para activarlo hay que correr la migración <b>0004_costeo_solo_admin.sql</b> en Supabase.</div></div>`;
  if(!esNota(p)) return `<div class="dsec"><h3>🔒 Costeo del pedido</h3><div style="font-size:13px">Este proyecto tiene la ficha anterior: el costeo automático necesita la nota de pedido nueva.</div></div>`;
  const c=costeoDe(p), id=esc(p.id), val=Number(p.val)||0;
  const margen=val?val-c.total:null;
  return `<div class="dsec costeo"><h3>🔒 Costeo del pedido <span style="font-weight:400;color:var(--gris-m);font-size:11px">solo vos lo ves</span></h3>
    ${c.sinPrecio.length?`<div class="cst-aviso">Faltan precios en ${c.sinPrecio.length} ítem${c.sinPrecio.length>1?'s':''}: cargalos acá abajo o en la pestaña Costos.</div>`:''}
    ${c.pend.length?`<div class="cst-aviso amar">Hay ítems "a confirmar" en la nota: el costo puede cambiar.</div>`:''}
    <div class="cst-tabla">
      <div class="cst-h"><span>Ítem</span><span>Cant.</span><span>Costo u.</span><span>Subtotal</span></div>
      ${c.lineas.map(x=>`<div class="cst-f ${x.costo?'':'sinp'}">
        <span>${esc(x.clave)}${x.det?`<small>${esc(x.det)}</small>`:''}</span>
        <span><input type="number" step="0.01" value="${x.cant}" onchange="ajustarCant('${id}',${esc(JSON.stringify(x.k))},this.value,${x.cantNota})">
          <small>${esc(x.unidad)}${x.ajustada?' · ajustado':''}</small></span>
        <span><input type="number" step="0.01" placeholder="USD" value="${x.costo??''}" onchange="ponerPrecio(${esc(JSON.stringify(x.clave))},this.value,'${x.rubro}','${esc(x.unidad)}','${id}')"></span>
        <span class="cst-sub">${x.costo!=null?usd(x.sub):'—'}</span></div>`).join('')}
      ${c.extras.map(x=>`<div class="cst-f extra">
        <span>${esc(x.desc)}<small>${esc(RUBROS[x.rubro]||'Otros')} · agregado a mano <a href="#" onclick="quitarExtra(event,'${id}',${x.i})">quitar</a></small></span>
        <span>${fmt2(Number(x.cant)||0)}</span><span>${usd(x.costo)}</span><span class="cst-sub">${usd(x.sub)}</span></div>`).join('')}
    </div>
    <div class="cst-add">
      <input id="cx-desc" placeholder="Agregar ítem (ej: flete Mendoza)">
      <input id="cx-cant" type="number" step="0.01" placeholder="Cant." value="1">
      <input id="cx-costo" type="number" step="0.01" placeholder="Costo u.">
      <select id="cx-rubro">${Object.entries(RUBROS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select>
      <button class="btn btn-sec btn-sm" onclick="agregarExtra('${id}')">＋</button>
    </div>
    ${Object.entries(RUBROS).map(([k,v])=>`<div class="drow"><span class="lbl">${v}</span><span class="val">${usd(c.por[k])}</span></div>`).join('')}
    <div class="drow"><span class="lbl"><b>Costo total</b></span><span class="val">${usd(c.total)}</span></div>
    <div class="drow"><span class="lbl">Valor de venta</span><span class="val">${val?usd(val):'— (sin cargar)'}</span></div>
    ${margen!=null?`<div class="drow"><span class="lbl">Margen</span><span class="val" style="color:${margen<0?'var(--rojo)':'var(--verde)'}">${usd(margen)} (${(margen/val*100).toFixed(1)}%)</span></div>`:''}
    <div class="flex-btns" style="margin-top:10px">
      <button class="btn btn-nar btn-sm" onclick="guardarCosteo('${id}')">💾 Guardar costeo</button>
      <button class="btn btn-sec btn-sm" onclick="costeoAPresupuesto('${id}')">➡️ Usar como presupuesto de obra</button>
    </div>
    ${c.guardado!=null?`<div style="font-size:11px;color:var(--gris-m);margin-top:6px">Último costeo guardado: ${usd(c.guardado)}</div>`:''}
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
async function ponerPrecio(clave,v,rubro,unidad,pid){
  const costo=num(v);
  const prev=listaCostos[clave];
  const fila={clave,costo,rubro:prev?.rubro||rubro,unidad:prev?.unidad||unidad};
  if(proveedoresListo) Object.assign(fila,{proveedor:null,fuente:'manual',referencia:null});
  try{
    chk(await sb.from('lista_costos').upsert(fila,{onConflict:'clave'}));
    listaCostos[clave]={...(prev||{}),...fila};
    toast('✅ Precio guardado en la lista de costos');
  }catch(e){toast(msgError(e));return;}
  if(pid){verDetalle(pid);} else renderCostos();
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
async function guardarCosteo(pid){await guardarFilaCosteo(pid); toast('✅ Costeo guardado'); verDetalle(pid);}
// El líder ve solo los totales por rubro como presupuesto de obra, nunca los precios unitarios
async function costeoAPresupuesto(pid){
  const p=todos[pid]; if(!p) return;
  const c=costeoDe(p);
  if(c.sinPrecio.length&&!await confirmar(`Faltan precios en ${c.sinPrecio.length} ítems. ¿Pasar igual los totales al presupuesto de obra?`)) return;
  const q=limpiar(p);
  q.presup={mat:Math.round(c.por.mat),mo:Math.round(c.por.mo),ter:Math.round(c.por.ter),otr:Math.round(c.por.otr)};
  await guardarFilaCosteo(pid);
  await guardarProyecto(q); toast('✅ Presupuesto de obra actualizado con los totales del costeo'); verDetalle(pid);
}

// ── Pestaña Costos: lista de precios unitarios ──
let filtroCostos='';
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
let costosAbierto=null;
function origenPrecio(x){
  const l=listaCostos[x.clave]; if(!l||!x.costo) return '';
  const f={excel:'Excel',pdf:'PDF',manual:'a mano',flexxus:'Flexxus'}[l.fuente]||'a mano';
  return `<small class="cst-orig">${l.proveedor?esc(l.proveedor)+' · ':''}${f}${l.referencia?` · <a href="#" onclick="verArchivoCosto(event,'${esc(l.referencia)}')">ver archivo</a>`:''}</small>`;
}
function renderCostos(){
  const el=document.getElementById('lista-costos'); if(!el) return;
  if(!esAdmin()){el.innerHTML='';return;}
  if(!costeoListo){el.innerHTML=`<div class="card">Para usar la lista de costos hay que correr la migración <b>0004_costeo_solo_admin.sql</b> en Supabase (SQL Editor).</div>`;return;}
  const f=filtroCostos.toLowerCase();
  const cat=catalogoCostos().filter(x=>!f||x.clave.toLowerCase().includes(f));
  const faltan=cat.filter(x=>!x.costo).length;
  const sueltos=preciosProv.filter(x=>!x.clave&&(!f||normTxt(x.descripcion+' '+x.proveedor).includes(normTxt(f))));
  el.innerHTML=`<div class="card" style="font-size:13px">Precio unitario de cada ítem que se elige en la nota de pedido. Con estos precios cada pedido se costea solo. <b>Solo el administrador ve esta pestaña.</b>
      ${faltan?`<div style="margin-top:6px;color:var(--rojo);font-weight:700">${faltan} ítem${faltan>1?'s':''} sin precio</div>`:''}</div>
    ${proveedoresListo?`<div class="cst-imp">
      <button class="btn btn-nar btn-sm" onclick="abrirImport('excel')">📥 Excel / CSV</button>
      <button class="btn btn-nar btn-sm" onclick="abrirImport('pdf')">📄 PDF de proveedor</button>
      <button class="btn btn-sec btn-sm" onclick="abrirImport('manual')">✍️ A mano</button></div>`
      :`<div class="card" style="font-size:12px">Para importar Excel y PDF de proveedores hay que correr la migración <b>0005_precios_de_proveedores.sql</b>.</div>`}
    <div class="fg"><input type="search" placeholder="Buscar ítem o producto…" value="${esc(filtroCostos)}" oninput="filtroCostos=this.value;renderCostos();const i=document.querySelector('#lista-costos input[type=search]');i.focus();i.setSelectionRange(i.value.length,i.value.length)"></div>
    <div class="card cst-lista">${cat.length?cat.map(x=>{const otros=proveedoresListo?preciosDeClave(x.clave):[];return `<div class="cst-li ${x.costo?'':'sinp'}">
      <div><b>${esc(x.clave)}</b><small>${esc(RUBROS[x.rubro]||'Otros')} · por ${esc(x.unidad)}${x.usos?` · en ${x.usos} pedido${x.usos>1?'s':''}`:''}</small>${origenPrecio(x)}
        ${otros.length?`<a href="#" class="cst-otros" onclick="event.preventDefault();costosAbierto=costosAbierto===${esc(JSON.stringify(x.clave))}?null:${esc(JSON.stringify(x.clave))};renderCostos()">${otros.length} precio${otros.length>1?'s':''} de proveedores</a>`:''}</div>
      <input type="number" step="0.01" placeholder="USD" value="${x.costo??''}" onchange="ponerPrecio(${esc(JSON.stringify(x.clave))},this.value,'${x.rubro}','${esc(x.unidad)}')">
    </div>${costosAbierto===x.clave?`<div class="cst-alt">${otros.map(o=>`<div><span>${esc(o.proveedor)} · ${esc(o.descripcion)}<small>${esc(o.fecha)} · ${esc(o.fuente)}${o.moneda==='ARS'?` · ARS ${Number(o.costo_original).toLocaleString('es-AR')} a ${Number(o.tipo_cambio).toLocaleString('es-AR')}`:''}</small></span>
      <b>${usd(o.costo)}</b><button class="btn btn-sec btn-sm" onclick="usarPrecioProv('${o.id}')">Usar</button></div>`).join('')}</div>`:''}`}).join(''):'<div style="font-size:13px;color:var(--gris-m)">Todavía no hay ítems: aparecen cuando ventas carga notas de pedido.</div>'}</div>
    ${sueltos.length?`<div class="sec-title" style="font-size:15px;margin-top:14px">Productos de proveedores sin vincular (${sueltos.length})</div>
      <div class="card cst-lista">${sueltos.slice(0,200).map(o=>`<div class="cst-li cst-suelto"><div><b>${esc(o.descripcion)}</b><small>${esc(o.proveedor)} · ${esc(o.fecha)} · ${usd(o.costo)}</small>
        <select onchange="vincularPrecioProv('${o.id}',this.value)">${opcionesClave('')}</select></div></div>`).join('')}
        ${sueltos.length>200?`<div style="font-size:12px;color:var(--gris-m)">Mostrando 200: usá el buscador.</div>`:''}</div>`:''}`;
}
