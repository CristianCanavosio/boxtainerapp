// ════════════════════════════════════════════════
// LIMITACIONES TÉCNICAS DE ABERTURAS
// Qué tipologías de puertas y ventanas se ofrecen en la nota de pedido y sus medidas máximas (mm).
// La nota no deja avanzar si una abertura pasa el máximo de su tipología.
// Las edita el líder o el admin (Materiales). Tabla limites_aberturas, migración 0022.
// Sin la migración, la nota usa la tabla inicial que trae nota.js.
// ════════════════════════════════════════════════
let limAbert=[];            // filas de limites_aberturas
let limAbertListo=false;    // false si todavía no se corrió la migración 0022

async function cargarLimitesAberturas(){
  limAbertListo=false; limAbert=[];
  try{
    limAbert=(await traerSinOrden('limites_aberturas')).sort((a,b)=>(a.orden||0)-(b.orden||0)||a.tipologia.localeCompare(b.tipologia));
    limAbertListo=true;
  }catch(e){console.warn('Limitaciones de aberturas no disponibles (¿falta la migración 0022?)',e);}
  NotaPedido.setLimites(limAbertListo?limAbert:null);
}

const laMm=v=>{const s=String(v??'').replace(/\./g,'').trim();if(s==='')return null;const n=Math.round(Number(s));return n>0?n:NaN;};
const laTxt=n=>n?Number(n).toLocaleString('es-AR'):'';

function renderLimitesAberturas(){
  const el=document.getElementById('limites-abert-sec'); if(!el) return;
  if(MODO!=='nube'||!esOp()){el.innerHTML='';return;}
  const filas=limAbertListo?limAbert:NotaPedido.LIM_DEF;
  const fila=(r,i)=>`<div class="mp-f" style="flex-wrap:wrap;gap:6px">
      <div class="mp-n" style="min-width:150px">${esc(r.tipologia)} <span style="font-size:11px;color:var(--gris-m)">${r.clase==='puerta'?'puerta':'ventana'}</span></div>
      <div class="mp-c" style="gap:4px"><span style="font-size:11px">Ancho máx.</span><input type="text" inputmode="numeric" style="width:78px" placeholder="sin límite" value="${laTxt(r.ancho_max_mm)}" ${limAbertListo?`onchange="guardarLimAbert(${i},'ancho_max_mm',this.value)"`:'disabled'}> <span>mm</span></div>
      <div class="mp-c" style="gap:4px"><span style="font-size:11px">Alto máx.</span><input type="text" inputmode="numeric" style="width:78px" placeholder="sin límite" value="${laTxt(r.alto_max_mm)}" ${limAbertListo?`onchange="guardarLimAbert(${i},'alto_max_mm',this.value)"`:'disabled'}> <span>mm</span></div>
      ${limAbertListo?`<div class="mp-s"><button class="mp-b" title="Sacar de la nota" onclick="quitarLimAbert(${i})">✕</button></div>`:''}</div>`;
  el.innerHTML=`<div class="card">
    <div style="font-size:14px;font-weight:800">📏 Limitaciones de aberturas</div>
    <div style="font-size:12px;color:var(--gris-m);margin:4px 0 10px">Tipologías de puertas y ventanas que ofrece la nota de pedido y su medida máxima. Si ventas carga una abertura más grande, la nota no deja avanzar y le explica por qué. Vacío = sin límite.</div>
    ${limAbertListo?'':`<div style="font-size:13px;margin-bottom:8px;border-left:4px solid var(--amarillo);padding-left:8px">La nota ya controla estos límites. Para poder cambiarlos o sumar tipologías falta correr la migración <b>0022_limitaciones_de_aberturas.sql</b> en Supabase.</div>`}
    <div class="mp-lista">${filas.map(fila).join('')}</div>
    ${limAbertListo?`<div class="form-2" style="margin-top:10px"><div class="fg"><label>Nueva tipología</label><input id="la-nom" placeholder="Ej: Puerta doble hoja"></div>
      <div class="fg"><label>Es</label><select id="la-clase"><option value="ventana">Ventana</option><option value="puerta">Puerta</option></select></div></div>
    <div class="form-2"><div class="fg"><label>Ancho máximo (mm)</label><input id="la-an" inputmode="numeric" placeholder="sin límite"></div>
      <div class="fg"><label>Alto máximo (mm)</label><input id="la-al" inputmode="numeric" placeholder="sin límite"></div></div>
    <button class="btn btn-nar btn-sm" onclick="agregarLimAbert()">+ Agregar tipología</button>`:''}
  </div>`;
}

async function guardarLimAbert(i,campo,v){
  const r=limAbert[i]; if(!r) return;
  const n=laMm(v);
  if(Number.isNaN(n)){toast('⚠️ Poné la medida en mm, solo números (o dejalo vacío)');renderLimitesAberturas();return;}
  try{chk(await sb.from('limites_aberturas').update({[campo]:n}).eq('tipologia',r.tipologia));r[campo]=n;toast('✅ Guardado');}
  catch(e){toast('⚠️ No se pudo guardar: '+(e.message||'error'));}
  NotaPedido.setLimites(limAbert); renderLimitesAberturas();
}

async function agregarLimAbert(){
  const nom=document.getElementById('la-nom').value.trim(), clase=document.getElementById('la-clase').value;
  const an=laMm(document.getElementById('la-an').value), al=laMm(document.getElementById('la-al').value);
  if(nom.length<2){toast('⚠️ Poné el nombre de la tipología');return;}
  if(nom===('Original del contenedor')){toast('⚠️ Ese nombre ya existe');return;}
  if(Number.isNaN(an)||Number.isNaN(al)){toast('⚠️ Las medidas van en mm, solo números');return;}
  const fila={tipologia:nom,clase,ancho_max_mm:an,alto_max_mm:al,orden:Math.max(0,...limAbert.map(x=>x.orden||0))+1};
  try{chk(await sb.from('limites_aberturas').insert(fila));}
  catch(e){toast('⚠️ No se pudo agregar: '+(String(e.message||'').includes('duplicate')?'ya existe':e.message||'error'));return;}
  limAbert.push(fila); NotaPedido.setLimites(limAbert);
  toast('✅ Agregada: ya aparece en la nota de pedido'); renderLimitesAberturas();
}

async function quitarLimAbert(i){
  const r=limAbert[i]; if(!r) return;
  if(!await confirmar(`¿Sacar "${r.tipologia}" de la nota de pedido? Las notas ya cargadas no cambian.`)) return;
  try{chk(await sb.from('limites_aberturas').delete().eq('tipologia',r.tipologia));limAbert.splice(i,1);}
  catch(e){toast('⚠️ No se pudo sacar: '+(e.message||'error'));}
  NotaPedido.setLimites(limAbert); renderLimitesAberturas();
}
