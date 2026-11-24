// ════════════════════════════════════════════════
// STOCK DE UTILBOX (supervisor de aberturas y supervisor de muebles)
// Cada uno carga su stock desde una planilla de Excel (pestaña Stock). La carga reemplaza todo
// el stock anterior de ese taller. En cada orden de trabajo, al lado de cada ítem, la app muestra
// cuánto hay en el stock para que la persona la chequee antes de tomarla.
// La comparación es por código o por las palabras de la descripción: es una ayuda, no un bloqueo.
// Tabla stock_taller y función cargar_stock_taller (migración 0019). Sin precios.
// ════════════════════════════════════════════════
let stockTaller=[], stListo=false, stPrevia=null, stBuscar='';
const conStockPropio=()=>['aluminio','madera'].includes(miTaller());
// al cargar los datos todavía puede no estar el usuario armado: se mira el rol del perfil
const rolCarga=()=>rol()||perfiles[myId]?.rol||'';

async function cargarStockTaller(){
  stockTaller=[]; stListo=false;
  if(!['carp_aluminio','carp_madera','admin','lider','lectura'].includes(rolCarga())) return;
  try{
    const rs=await traerSinOrden('stock_taller');
    stockTaller=rs.map(r=>({taller:r.taller,cod:r.codigo||'',desc:r.descripcion||'',cant:Number(r.cantidad)||0,unidad:r.unidad||'',en:r.cargado_en,
      tok:tokensStock((r.codigo||'')+' '+(r.descripcion||''))}));
    stListo=true;
  }catch(e){console.warn('Stock no disponible (¿falta la migración 0019?)',e);}
}

// ── comparación de un ítem de la orden con el stock ──
const ST_VACIAS=new Set(['de','del','la','el','los','las','con','sin','y','a','en','x','cm','mm','c','u','cu','para','por','confirmar','un','una','tipo','linea']);
function tokensStock(t){
  return normTxt(String(t||'').replace(/(\d)\s*[x×*]\s*(?=\d)/gi,'$1 ')).split(' ').filter(w=>w&&!ST_VACIAS.has(w));
}
function stockDeItem(it){
  const mio=stockTaller.filter(s=>s.taller===miTaller());
  if(!stListo||!mio.length) return null;
  const tk=[...new Set(tokensStock((it.desc||'').replace(/\(a confirmar\)/i,'')+' '+(it.medida||'')))];
  if(!tk.length) return null;
  let mejor=null, pm=0;
  mio.forEach(s=>{
    if(s.cod&&tk.includes(normTxt(s.cod))){if(pm<2){mejor=s;pm=2;}return;}
    const st=new Set(s.tok), n=tk.filter(w=>st.has(w)).length/tk.length;
    if(n>pm){pm=n;mejor=s;}
  });
  const nec=Number(String(it.cant||'').replace(',','.'))||0;
  if(!mejor||pm<0.75) return {c:'amar',t:'❓ No figura en tu stock',ok:false};
  const u=mejor.unidad?' '+mejor.unidad:'';
  if(mejor.cant>=nec&&mejor.cant>0) return {c:'verde',t:`✅ Hay ${fmtNum(mejor.cant)}${u}`,ok:true,s:mejor};
  if(mejor.cant>0) return {c:'amar',t:`⚠️ Hay ${fmtNum(mejor.cant)} de ${fmtNum(nec)}${u}`,ok:false,s:mejor};
  return {c:'rojo',t:'⛔ Sin stock',ok:false,s:mejor};
}
function resumenStockOrden(st){
  if(!st.some(Boolean)) return `<div class="pc-st-res" style="color:var(--gris-m);font-weight:400">🗃️ Cargá tu stock en la pestaña <a href="#" onclick="event.preventDefault();showView('stock')" style="color:var(--nar)">Stock</a> para compararla.</div>`;
  const ok=st.filter(x=>x&&x.ok).length;
  return `<div class="pc-st-res" style="color:${ok===st.length?'var(--verde)':'#8A5F00'}">🗃️ Contra tu stock: ${ok===st.length?'tenés todo':`tenés ${ok} de ${st.length} ítems`}</div>`;
}
const fmtNum=n=>Number(n).toLocaleString('es-AR',{maximumFractionDigits:2});

// ── pestaña Stock ──
function renderStockTaller(){
  const el=document.getElementById('lista-stock'); if(!el) return;
  if(!conStockPropio()){el.innerHTML='<div class="card" style="font-size:13px">El stock lo cargan el supervisor de aberturas y el de muebles de Utilbox.</div>';return;}
  if(!stListo){el.innerHTML='<div class="card" style="font-size:13px">Para activarlo hay que correr la migración <b>0019_company_y_ordenes_de_trabajo.sql</b> en Supabase.</div>';return;}
  const mio=stockTaller.filter(s=>s.taller===miTaller()), ult=mio.reduce((m,s)=>s.en&&s.en>m?s.en:m,'');
  const q=normTxt(stBuscar), vis=q?mio.filter(s=>normTxt(s.cod+' '+s.desc).includes(q)):mio;
  el.innerHTML=`<div class="card">
      <div style="font-size:13px;color:var(--gris);line-height:1.5;margin-bottom:8px">Subí la planilla de Excel con tu stock: una fila por artículo con <b>descripción</b> y <b>cantidad</b> (código y unidad, si los tenés). Cada carga <b>reemplaza</b> la anterior. Con esto, en cada orden de trabajo ves si tenés lo que se pide.</div>
      <div class="flex-btns" style="flex-wrap:wrap">
        <label class="btn btn-nar btn-sm" style="cursor:pointer">📤 Subir Excel<input type="file" accept=".xlsx,.xls,.csv,.ods" style="display:none" onchange="leerStockExcel(this)"></label>
        <button class="btn btn-sec btn-sm" onclick="planillaModeloStock()">⬇️ Planilla modelo</button>
      </div>
      ${ult?`<div style="font-size:12px;color:var(--gris-m);margin-top:6px">Última carga: ${esc(new Date(ult).toLocaleString('es-AR',{dateStyle:'short',timeStyle:'short'}))} · ${mio.length} artículos</div>`:''}
    </div>
    ${stPrevia?previaStockHTML():''}
    ${mio.length?`<div class="search-wrap"><input type="text" placeholder="Buscar en mi stock..." value="${esc(stBuscar)}" oninput="stBuscar=this.value;renderStockTaller();this.focus();this.setSelectionRange(this.value.length,this.value.length)"></div>
      <div class="card"><table class="st-tabla"><tr><th>Código</th><th>Descripción</th><th style="text-align:right">Cantidad</th></tr>
      ${vis.slice(0,300).map(s=>`<tr><td>${esc(s.cod)}</td><td>${esc(s.desc)}</td><td class="n" style="${s.cant>0?'':'color:var(--rojo)'}">${fmtNum(s.cant)} ${esc(s.unidad)}</td></tr>`).join('')}</table>
      ${vis.length>300?`<div style="font-size:12px;color:var(--gris-m);margin-top:6px">Mostrando 300 de ${vis.length}: usá el buscador.</div>`:''}</div>`
    :stPrevia?'':`<div class="empty"><div class="em">🗃️</div><h3>Todavía no cargaste tu stock</h3><p>Subí la planilla de Excel para empezar.</p></div>`}`;
}
async function leerStockExcel(input){
  const f=input.files[0]; input.value=''; if(!f) return;
  try{
    await cargarLib(LIB_XLSX);
    const wb=XLSX.read(await f.arrayBuffer(),{type:'array'});
    const mat=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:true,defval:''}).filter(r=>r.some(c=>String(c).trim()!==''));
    if(!mat.length) throw new Error('la planilla está vacía');
    // fila de encabezados: la primera con al menos 2 textos dentro de las primeras 15
    let cab=0; for(let i=0;i<Math.min(15,mat.length);i++){if(mat[i].filter(c=>typeof c==='string'&&c.trim()&&isNaN(numAR(c))).length>=2){cab=i;break}}
    const h=mat[cab].map(normTxt), busca=(re,no)=>{const i=h.findIndex((x,j)=>re.test(x)&&!(no||[]).includes(j));return i<0?null:i};
    const desc=busca(/desc|detalle|producto|material|nombre|articulo|item/)??0;
    const cant=busca(/cant|stock|existencia|disponible|saldo|unidades/,[desc]);
    const cod=busca(/cod|sku|ref|art/,[desc,cant]);
    const uni=busca(/^u$|unid|^um$|u m|medida/,[desc,cant,cod]);
    if(cant==null) throw new Error('no encontré la columna de cantidad (poné un encabezado "Cantidad")');
    const filas=mat.slice(cab+1).map(r=>({codigo:cod==null?'':String(r[cod]??'').trim(),descripcion:String(r[desc]??'').trim(),
      cantidad:(()=>{const n=numAR(r[cant]);return isNaN(n)?0:n})(),unidad:uni==null?'':String(r[uni]??'').trim()})).filter(x=>x.descripcion);
    if(!filas.length) throw new Error('no encontré filas con descripción');
    stPrevia={archivo:f.name,filas};
  }catch(e){console.error(e);toast('⚠️ No se pudo leer la planilla: '+(e.message||e));}
  renderStockTaller();
}
function previaStockHTML(){
  const p=stPrevia;
  return `<div class="card" style="border-left:5px solid var(--nar)">
    <div class="card-title">📄 ${esc(p.archivo)}: ${p.filas.length} artículos</div>
    <table class="st-tabla"><tr><th>Código</th><th>Descripción</th><th style="text-align:right">Cantidad</th></tr>
    ${p.filas.slice(0,8).map(x=>`<tr><td>${esc(x.codigo)}</td><td>${esc(x.descripcion)}</td><td class="n">${fmtNum(x.cantidad)} ${esc(x.unidad)}</td></tr>`).join('')}</table>
    ${p.filas.length>8?`<div style="font-size:12px;color:var(--gris-m);margin-top:4px">y ${p.filas.length-8} más…</div>`:''}
    <div class="flex-btns" style="margin-top:8px"><button class="btn btn-verde btn-sm" onclick="guardarStock(this)">✅ Reemplazar mi stock</button>
      <button class="btn btn-sec btn-sm" onclick="stPrevia=null;renderStockTaller()">Cancelar</button></div></div>`;
}
async function guardarStock(btn){
  if(!stPrevia) return; btn.disabled=true;
  try{
    const {data,error}=await sb.rpc('cargar_stock_taller',{filas:stPrevia.filas});
    if(error) throw error;
    stPrevia=null; toast(`✅ Stock cargado: ${data} artículos`);
    await cargarStockTaller(); renderStockTaller();
  }catch(e){toast(/cargar_stock_taller/.test(e?.message||'')?'⚠️ Falta correr la migración 0019 en Supabase':msgError(e)); btn.disabled=false;}
}
async function planillaModeloStock(){
  try{
    await cargarLib(LIB_XLSX);
    const ej=miTaller()==='madera'
      ?[['Código','Descripción','Cantidad','Unidad'],['M-001','Bajo mesada melamina blanca 120 cm',4,'c/u'],['M-002','Alacena melamina blanca 120 cm',3,'c/u'],['M-010','Puerta interior madera 70 cm',6,'c/u']]
      :[['Código','Descripción','Cantidad','Unidad'],['A-001','Ventana Módena 120 × 100',5,'c/u'],['A-002','Ventana Módena 60 × 40 baño',8,'c/u'],['A-010','Puerta exterior aluminio 90 cm',2,'c/u']];
    const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(ej),'Stock');
    XLSX.writeFile(wb,'stock-utilbox-'+(miTaller()==='madera'?'muebles':'aberturas')+'.xlsx');
  }catch(e){toast('⚠️ No se pudo armar la planilla: '+(e.message||e));}
}
