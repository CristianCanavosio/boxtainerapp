// ════════════════════════════════════════════════
// INDICADORES POR ÁREA (pestaña Reportes)
// 3 indicadores por área: Ventas, Producción, Compras y Finanzas. Se calculan con lo que ya
// guarda la app; los que necesitan Flexxus quedan marcados hasta que esté la conexión.
// Quién ve qué: el administrador ve todo (y es el único que ve plata); el líder y solo lectura
// ven Producción y Compras; ventas ve Ventas, sin montos y solo con sus notas (la base ya
// le entrega solo las suyas).
// Cada indicador tiene una meta que el administrador edita (migración 0020): con meta se pinta
// verde (cumple), amarillo (a menos de un 10 % de la meta) o rojo.
// ════════════════════════════════════════════════
let METAS={};              // clave -> número
let metasListo=false;      // false si todavía no se corrió la migración 0020
let indPeriodo='mes', indEmpresa='', indEditando=false;

async function cargarMetas(){
  METAS={}; metasListo=false;
  try{
    const rs=await traerSinOrden('metas_indicadores');
    rs.forEach(r=>{if(r.meta!=null) METAS[r.clave]=Number(r.meta);});
    metasListo=true;
  }catch(e){console.warn('Metas de indicadores no disponibles (¿falta la migración 0020?)',e);}
}

// ── qué áreas ve cada rol ──
const IND_AREAS={
  ventas:{t:'💼 Ventas'}, produccion:{t:'🔨 Producción'}, compras:{t:'🛒 Compras'}, finanzas:{t:'💰 Finanzas'},
};
function areasVisibles(){
  const r=rol();
  if(r==='admin') return ['ventas','produccion','compras','finanzas'];
  if(r==='lider'||r==='lectura') return ['produccion','compras'];
  if(r==='ventas') return ['ventas'];
  return [];
}

// ── período ──
const IND_PERIODOS={mes:'Este mes',mes_ant:'Mes anterior','3m':'Últimos 3 meses',anio:'Este año',todo:'Todo'};
function rangoPeriodo(k){
  const h=new Date(), y=h.getFullYear(), m=h.getMonth();
  if(k==='mes') return [new Date(y,m,1).getTime(),new Date(y,m+1,1).getTime()];
  if(k==='mes_ant') return [new Date(y,m-1,1).getTime(),new Date(y,m,1).getTime()];
  if(k==='3m') return [new Date(y,m-2,1).getTime(),new Date(y,m+1,1).getTime()];
  if(k==='anio') return [new Date(y,0,1).getTime(),new Date(y+1,0,1).getTime()];
  return [0,Infinity];
}
const enRango=(t,[a,b])=>t!=null&&t>=a&&t<b;
const finDelDia=iso=>iso?new Date(iso+'T23:59:59').getTime():null;
const DIA=86400000;

// ── fechas clave de un proyecto ──
// venta: cuando ventas envió la nota (primera versión); si no hay versiones, cuando se cargó
function fechaVenta(p){
  if(etapaDe(p)==='ventas') return null;
  const v=(p.versiones||[]).find(x=>x.tipo==='enviada')||(p.versiones||[])[0];
  return v&&v.ts?v.ts:p.creadoTs||null;
}
// terminado: el primer parte con estado "finalizado"
function fechaFin(p){
  const h=(p.historial||[]).filter(x=>x.est==='finalizado'&&x.ts).sort((a,b)=>a.ts-b.ts)[0];
  return h?h.ts:null;
}
// pedido a Utilbox / técnicos terminado: cuando quedó listo (o recibido, si saltearon "listo")
function fechaListoPC(x){
  const h=x.hist||[];
  const e=h.find(y=>y.estado==='listo')||h.find(y=>y.estado==='entregado');
  return e&&e.en?ts(e.en):null;
}

// ── cálculo de los 12 indicadores ──
// Cada uno: {clave, area, t (nombre), dir ('min' = cuanto más mejor, 'max' = cuanto menos mejor),
//   unidad, valor (null = sin datos), detalle (html), flexxus (true = espera la conexión)}
function calcularIndicadores(){
  const R=rangoPeriodo(indPeriodo), admin=esAdmin();
  const ps=proyectos.filter(p=>!indEmpresa||(indEmpresa==='-'?!p.emp:p.emp===indEmpresa));
  const pct=(a,b)=>b?a/b*100:null;
  const out={};
  const fila=(l,v)=>`<div class="drow"><span class="lbl">${l}</span><span class="val">${v}</span></div>`;
  const tabla=(cab,filas)=>filas.length?`<table class="tcost" style="margin-top:6px"><tr>${cab.map(c=>`<th>${c}</th>`).join('')}</tr>${filas.map(f=>`<tr>${f.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</table>`:'';

  // ═══ VENTAS ═══
  const vendidos=ps.filter(p=>enRango(fechaVenta(p),R));
  {
    const porV={}; let u=0, monto=0;
    vendidos.forEach(p=>{const v=p.vend||'Sin vendedor'; porV[v]=porV[v]||{n:0,u:0,m:0}; porV[v].n++; porV[v].u+=unidadesDe(p); porV[v].m+=Number(p.val)||0; u+=unidadesDe(p); monto+=Number(p.val)||0;});
    out.ventas_cant={area:'ventas',t:'Ventas del período',dir:'min',unidad:'notas',valor:vendidos.length,
      detalle:fila('Unidades vendidas',u)+(admin?fila('Monto vendido',usd(monto)):'')
        +tabla(['Vendedor','Notas','Unid.',...(admin?['Monto']:[])],Object.entries(porV).sort((a,b)=>b[1].n-a[1].n).map(([v,x])=>[esc(v),x.n,x.u,...(admin?[usd(x.m)]:[])])),
      ayuda:'Notas de pedido que ventas envió en el período.'};
  }
  {
    const conCorr=vendidos.filter(p=>(p.versiones||[]).some(v=>v.tipo==='cambio')||(p.incidencias||[]).some(x=>x.origen==='ventas'));
    out.ventas_sin_corr={area:'ventas',t:'Notas sin correcciones',dir:'min',unidad:'%',valor:pct(vendidos.length-conCorr.length,vendidos.length),
      detalle:fila('Notas con cambios o errores de ventas',`${conCorr.length} de ${vendidos.length}`)
        +(conCorr.length?`<div style="font-size:12px;color:var(--gris-m);margin-top:4px">${conCorr.slice(0,8).map(p=>esc((p.nombre||'').slice(0,24))).join(' · ')}</div>`:''),
      ayuda:'De las notas del período, las que llegaron a obra sin cambios después de confirmadas y sin errores de medidas o planos atribuidos a ventas.'};
  }
  {
    const hs=[]; ps.forEach(p=>(p.consultas||[]).forEach(c=>{if(c.para==='ventas'&&c.respuesta&&enRango(c.respTs,R)) hs.push(horasDesde(c.ts,c.respTs));}));
    const pr=hs.length?hs.reduce((s,x)=>s+x,0)/hs.length:null;
    out.ventas_conversion={area:'ventas',t:'Conversión de presupuestos',dir:'min',unidad:'%',valor:null,flexxus:true,
      detalle:fila('Mientras tanto: ventas responde consultas de obra en',pr==null?'—':`${fmtHoras(pr)} (${hs.length})`),
      ayuda:'Presupuestos que se convierten en venta sobre presupuestos emitidos. La app no registra presupuestos perdidos: sale de Flexxus.'};
  }

  // ═══ PRODUCCIÓN ═══
  {
    const fin=ps.filter(p=>enRango(fechaFin(p),R)&&p.entrega);
    const tarde=fin.filter(p=>fechaFin(p)>finDelDia(p.entrega));
    const atraso=tarde.length?tarde.reduce((s,p)=>s+(fechaFin(p)-finDelDia(p.entrega))/DIA,0)/tarde.length:null;
    const vencidos=ps.filter(p=>etapaDe(p)==='ejecucion'&&p.estado!=='finalizado'&&p.entrega&&finDelDia(p.entrega)<Date.now());
    out.prod_a_tiempo={area:'produccion',t:'Entregas a tiempo',dir:'min',unidad:'%',valor:pct(fin.length-tarde.length,fin.length),
      detalle:fila('Terminados en el período',`${fin.length} (${tarde.length} tarde)`)
        +fila('Atraso promedio de los tardíos',atraso==null?'—':Math.ceil(atraso)+' días')
        +fila('En obra con la entrega ya vencida (hoy)',vencidos.length?`<span style="color:var(--rojo)">${vencidos.length}</span>`:'0'),
      ayuda:'Proyectos terminados (el supervisor marcó "finalizado") en o antes de la fecha de entrega.'};
  }
  {
    const items=[]; let plata=0, sinPrecio=0;
    ps.forEach(p=>(p.mats||[]).forEach(m=>{
      if(m.usada==null||!(m.plan>0)) return;
      if(!enRango(m.usadaTs||ts(m.usadaEn),R)) return;
      items.push({p,m,d:(m.usada-m.plan)/m.plan*100});
      if(admin){const c=typeof costoDe==='function'?costoDe(m.clave):listaCostos[m.clave]?.costo; if(c!=null) plata+=(m.usada-m.plan)*c; else sinPrecio++;}
    }));
    const prom=items.length?items.reduce((s,x)=>s+x.d,0)/items.length:null;
    const porClave={}; items.forEach(x=>{const k=x.m.clave; porClave[k]=porClave[k]||[]; porClave[k].push(x.d);});
    const peores=Object.entries(porClave).map(([k,a])=>[k,a.reduce((s,x)=>s+x,0)/a.length,a.length]).sort((a,b)=>b[1]-a[1]).slice(0,5).filter(x=>x[1]>0);
    out.prod_desvio_mat={area:'produccion',t:'Desvío de materiales',dir:'max',unidad:'%',valor:prom,
      detalle:fila('Ítems con consumo cargado',items.length)
        +(admin?fila('Desvío en plata',`${usd(plata)}${sinPrecio?` <small>(${sinPrecio} sin precio)</small>`:''}`):'')
        +(peores.length?`<div style="font-size:12px;color:var(--gris-m);margin-top:6px">Más consumidos de lo planificado:</div>`
          +tabla(['Material','Desvío','Veces'],peores.map(([k,d,n])=>[esc(k),'+'+Math.round(d)+' %',n])):''),
      ayuda:'(Cantidad usada − planificada) / planificada, promedio de los ítems donde el supervisor cargó lo usado en el período. Positivo = se usó de más.'};
  }
  {
    const fin=ps.filter(p=>enRango(fechaFin(p),R));
    const porT={}; let hhT=0, uT=0;
    fin.forEach(p=>{
      const hh=(p.historial||[]).reduce((s,h)=>s+horasParte(h),0);
      if(!hh) return;
      const u=unidadesDe(p), t=p.tipo||'Sin tipo';
      porT[t]=porT[t]||{hh:0,u:0,n:0}; porT[t].hh+=hh; porT[t].u+=u; porT[t].n++; hhT+=hh; uT+=u;
    });
    out.prod_hh_unidad={area:'produccion',t:'Horas-hombre por unidad',dir:'max',unidad:'h',valor:uT?hhT/uT:null,
      detalle:fila('Proyectos terminados con partes diarios',Object.values(porT).reduce((s,x)=>s+x.n,0)+' de '+fin.length)
        +tabla(['Tipología','Proy.','HH / unidad'],Object.entries(porT).sort((a,b)=>b[1].u-a[1].u).map(([t,x])=>[esc(t),x.n,Math.round(x.hh/x.u)])),
      ayuda:'Suma de personas × (horas + horas extras) de los partes diarios, dividida por las unidades, de los proyectos terminados en el período.'};
  }

  // ═══ COMPRAS ═══
  {
    const enObra=ps.filter(p=>etapaDe(p)==='ejecucion'&&((p.historial||[]).some(h=>enRango(h.ts,R))||(p.faltantes||[]).some(f=>enRango(f.ts,R))));
    const falt=[]; ps.forEach(p=>(p.faltantes||[]).forEach(f=>{if(enRango(f.ts,R)) falt.push(f);}));
    const conF=enObra.filter(p=>(p.faltantes||[]).some(f=>enRango(f.ts,R)));
    const res=falt.filter(f=>f.resuelto&&f.resTs);
    const hRes=res.length?res.reduce((s,f)=>s+horasDesde(f.ts,f.resTs),0)/res.length:null;
    out.compras_sin_falt={area:'compras',t:'Obras sin faltantes',dir:'min',unidad:'%',valor:pct(enObra.length-conF.length,enObra.length),
      detalle:fila('Obras con faltantes',`${conF.length} de ${enObra.length}`)
        +fila('Faltantes que frenaron la obra',falt.filter(f=>f.frena).length)
        +fila('Tiempo promedio para resolver',hRes==null?'—':fmtHoras(hRes))
        +fila('Sin resolver',falt.filter(f=>!f.resuelto).length),
      ayuda:'De los proyectos con actividad en obra en el período, los que no reportaron faltantes de material.'};
  }
  {
    const pcs=(typeof pedidosCarp!=='undefined'?pedidosCarp:[]).filter(x=>{
      if(!indEmpresa) return true; const p=todos[x.pid]; return !!p&&(indEmpresa==='-'?!p.emp:p.emp===indEmpresa);});
    const hechos=pcs.map(x=>({x,f:fechaListoPC(x),c:finDelDia(x.comp||x.para)})).filter(y=>enRango(y.f,R)&&y.c);
    const porT={};
    hechos.forEach(({x,f,c})=>{const t=x.taller; porT[t]=porT[t]||{n:0,ok:0,at:0}; porT[t].n++; if(f<=c) porT[t].ok++; else porT[t].at+=(f-c)/DIA;});
    const ok=hechos.filter(y=>y.f<=y.c).length;
    out.compras_proveedores={area:'compras',t:'Cumplimiento de proveedores',dir:'min',unidad:'%',valor:pct(ok,hechos.length),
      detalle:fila('Órdenes terminadas',`${hechos.length} (${hechos.length-ok} tarde)`)
        +tabla(['Proveedor','Órdenes','A tiempo','Atraso prom.'],Object.entries(porT).map(([t,y])=>[esc(TALLER[t]?.corto||t),y.n,Math.round(y.ok/y.n*100)+' %',y.n>y.ok?Math.ceil(y.at/(y.n-y.ok))+' días':'—'])),
      ayuda:'Órdenes a Utilbox (aberturas y muebles) y a los técnicos de aire que quedaron listas en o antes de la fecha comprometida (o la que pidió la obra).'};
  }
  out.compras_precios={area:'compras',t:'Variación de precios de compra',dir:'max',unidad:'%',valor:null,flexxus:true,
    detalle:'',ayuda:'Aumento del costo de los materiales principales mes contra mes, y compra real contra lista de costos. La app guarda solo el último precio: el historial sale de Flexxus.'};

  // ═══ FINANZAS (solo admin) ═══
  if(admin){
    const conVal=vendidos.filter(p=>Number(p.val)>0);
    let v=0,c=0; const porE={}, sinCosto=[];
    conVal.forEach(p=>{
      const tot=typeof costeoDe==='function'&&costeoListo?costeoDe(p).total:0;
      if(!(tot>0)){sinCosto.push(p);return;}
      const e=p.emp||'Sin empresa'; porE[e]=porE[e]||{v:0,c:0,n:0}; porE[e].v+=Number(p.val); porE[e].c+=tot; porE[e].n++;
      v+=Number(p.val); c+=tot;
    });
    out.fin_margen={area:'finanzas',t:'Margen por proyecto',dir:'min',unidad:'%',valor:v?(v-c)/v*100:null,
      detalle:fila('Venta / costo estimado',`${usd(v)} / ${usd(c)}`)
        +(sinCosto.length?fila('Ventas sin costeo (no cuentan)',sinCosto.length):'')
        +tabla(['Empresa','Proy.','Margen'],Object.entries(porE).map(([e,x])=>[esc(e),x.n,Math.round((x.v-x.c)/x.v*100)+' %'])),
      ayuda:'(Valor de venta − costo) / valor de venta de las notas del período. Hoy usa el costo estimado del costeo; con Flexxus pasará al costo real.'};
    out.fin_cobro={area:'finanzas',t:'Días de cobro y deuda vencida',dir:'max',unidad:'días',valor:null,flexxus:true,detalle:'',
      ayuda:'Días promedio entre factura y cobro, y saldo a cobrar vencido por empresa.'};
    out.fin_facturacion={area:'finanzas',t:'Facturación y cobranza',dir:'min',unidad:'USD',valor:null,flexxus:true,detalle:'',
      ayuda:'Facturado y cobrado por mes y por razón social, contra objetivo.'};
  }
  Object.entries(out).forEach(([k,x])=>x.clave=k);
  return out;
}

// ── semáforo ──
function semaforo(x){
  const m=METAS[x.clave];
  if(x.valor==null||m==null||!isFinite(m)) return {c:'',t:m==null?'Sin meta':''};
  const ok=x.dir==='min'?x.valor>=m:x.valor<=m;
  if(ok) return {c:'verde',t:'Cumple'};
  const cerca=x.dir==='min'?x.valor>=m-Math.abs(m)*0.1:x.valor<=m+Math.max(Math.abs(m)*0.1,x.unidad==='%'?1:0);
  return cerca?{c:'amar',t:'Cerca'}:{c:'rojo',t:'Lejos'};
}
function fmtValor(x,v){
  if(v==null) return '—';
  if(x.unidad==='%') return (Math.round(v*10)/10).toLocaleString('es-AR')+' %';
  if(x.unidad==='USD') return usd(v);
  if(x.unidad==='h') return Math.round(v).toLocaleString('es-AR')+' h';
  const n=Math.round(v);
  return n.toLocaleString('es-AR')+(x.unidad?' '+(n===1&&x.unidad==='notas'?'nota':x.unidad):'');
}

function htmlIndicadores(){
  const areas=areasVisibles(); if(!areas.length) return '';
  const I=calcularIndicadores(), admin=esAdmin();
  const COL={verde:'var(--verde)',amar:'var(--amarillo)',rojo:'var(--rojo)'};
  const tarjeta=x=>{
    const s=semaforo(x), m=METAS[x.clave];
    const color=x.flexxus?'var(--gris-m)':COL[s.c]||'var(--nar)';
    const meta=x.flexxus?'<span class="badge b-gris">🔌 Espera Flexxus</span>'
      :`<span style="font-size:12px;color:var(--gris-m)">Meta: ${m==null?'sin definir':(x.dir==='min'?'≥ ':'≤ ')+fmtValor(x,m)}</span>${s.c?` <span class="ind-pill" style="background:${COL[s.c]}">${s.t}</span>`:''}`;
    const editar=indEditando&&admin&&!x.flexxus?`<div style="display:flex;gap:6px;align-items:center;margin-top:6px">
      <span style="font-size:12px">${x.dir==='min'?'Mínimo':'Máximo'}</span>
      <input type="number" step="any" class="ind-meta" data-k="${x.clave}" value="${m==null?'':m}" placeholder="sin meta" style="width:110px;padding:6px;border:1px solid var(--borde);border-radius:8px">
      <span style="font-size:12px">${esc(x.unidad)}</span></div>`:'';
    return `<div class="ind-kpi" style="border-left:4px solid ${color}">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline">
        <div style="font-weight:700;font-size:14px">${esc(x.t)}</div>
        <div style="font-size:24px;font-weight:800;color:${color};white-space:nowrap">${x.flexxus?'—':fmtValor(x,x.valor)}</div>
      </div>
      <div>${meta}</div>${editar}
      ${x.detalle?`<div style="margin-top:6px">${x.detalle}</div>`:''}
      <details style="margin-top:4px"><summary style="font-size:12px;color:var(--gris-m);cursor:pointer">¿Cómo se calcula?</summary>
        <div style="font-size:12px;color:var(--gris-m)">${esc(x.ayuda)}</div></details>
    </div>`;
  };
  const sel=(id,opts,v,fn)=>`<select id="${id}" onchange="${fn}(this.value)" style="padding:8px;border:1px solid var(--borde);border-radius:10px;background:#fff;font-size:14px">${opts.map(([k,t])=>`<option value="${esc(k)}" ${k===v?'selected':''}>${esc(t)}</option>`).join('')}</select>`;
  const empresas=[['','🏢 Todas las empresas'],...NotaPedido.EMPRESAS.map(e=>[e,e]),['-','Sin empresa cargada']];
  const barra=`<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px">
    ${sel('ind-per',Object.entries(IND_PERIODOS),indPeriodo,'setIndPeriodo')}
    ${rol()==='ventas'?'':sel('ind-emp',empresas,indEmpresa,'setIndEmpresa')}
    ${admin?(indEditando?`<button class="btn btn-verde" style="width:auto;padding:8px 14px" onclick="guardarMetas()">💾 Guardar metas</button>
        <button class="btn btn-sec" style="width:auto;padding:8px 14px" onclick="indEditando=false;renderReportes()">Cancelar</button>`
      :`<button class="btn btn-sec" style="width:auto;padding:8px 14px" onclick="editarMetas()">🎯 Metas</button>`):''}
  </div>
  ${admin&&!metasListo?`<div class="card" style="font-size:13px;border-left:4px solid var(--amarillo)">Para guardar metas falta correr la migración <b>0020_metas_de_indicadores.sql</b> en Supabase. Mientras tanto los indicadores se ven sin semáforo.</div>`:''}`;
  return `<div class="sec-title" style="font-size:16px">🎯 Indicadores por área</div>${barra}
    ${areas.map(a=>`<div class="card"><div class="card-title" style="margin-bottom:10px">${IND_AREAS[a].t}</div>
      ${Object.values(I).filter(x=>x.area===a).map(tarjeta).join('')}</div>`).join('')}
    ${indEditando&&admin?`<button class="btn btn-verde" style="margin-bottom:12px" onclick="guardarMetas()">💾 Guardar metas</button>`:''}`;
}
function setIndPeriodo(v){indPeriodo=v;renderReportes();}
function setIndEmpresa(v){indEmpresa=v;renderReportes();}
function editarMetas(){
  if(!metasListo){toast('⚠️ Falta correr la migración 0020 en Supabase');return;}
  indEditando=true; renderReportes();
}
async function guardarMetas(){
  if(!esAdmin()) return;
  const filas=[...document.querySelectorAll('.ind-meta')].map(i=>{
    const v=i.value.trim(); return {clave:i.dataset.k,meta:v===''?null:Number(v.replace(',','.'))};});
  if(filas.some(f=>f.meta!=null&&!isFinite(f.meta))){toast('⚠️ Revisá las metas: tienen que ser números');return;}
  try{
    const {error}=await sb.from('metas_indicadores').upsert(filas,{onConflict:'clave'});
    if(error) throw error;
    filas.forEach(f=>{if(f.meta==null) delete METAS[f.clave]; else METAS[f.clave]=f.meta;});
    indEditando=false; renderReportes(); toast('✅ Metas guardadas');
  }catch(e){toast(msgError(e));}
}
