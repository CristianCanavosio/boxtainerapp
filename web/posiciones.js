// ════════════════════════════════════════════════
// POSICIONES EN PLANTA (P1 a P8) — proyectos a medida
// La zona de proyectos a medida tiene posiciones pintadas en el piso, tipo "boxes", con los
// materiales a mano. Al asignar un proyecto que no es Company, el líder elige su posición.
// Una posición tiene un solo proyecto activo; se libera cuando el proyecto se finaliza.
// La tabla posiciones_planta ya tiene lugar para la cámara de cada posición (a futuro).
// Sin la migración 0021 la app funciona igual y no pide posición.
// ════════════════════════════════════════════════
let POSICIONES=[];        // [{cod,nombre}]
let posListo=false;       // false si todavía no se corrió la migración 0021

async function cargarPosiciones(){
  posListo=false;
  try{
    const rs=await traerSinOrden('posiciones_planta');
    POSICIONES=rs.filter(r=>r.activa!==false).sort((a,b)=>(a.orden||0)-(b.orden||0)||a.codigo.localeCompare(b.codigo))
      .map(r=>({cod:r.codigo,nombre:r.nombre||''}));
    posListo=POSICIONES.length>0;
  }catch(e){console.warn('Posiciones en planta no disponibles (¿falta la migración 0021?)',e);}
}

// ¿Este proyecto ocupa su posición ahora? (en ejecución y no finalizado)
function ocupaPosicion(p){return !!(p&&p.pos&&etapaDe(p)==='ejecucion'&&p.estado!=='finalizado');}
// Proyecto activo que está en esa posición (menos el que se indica)
function ocupanteDe(cod,exceptoId){
  return Object.values(todos).find(p=>p.pos===cod&&ocupaPosicion(p)&&String(p.id)!==String(exceptoId))||null;
}
// ¿Lleva posición? Solo los proyectos a medida (no Company)
function llevaPosicion(p){return posListo&&!esCompany(p);}

// Mapa de las posiciones.
// Modo "elegir": pid = proyecto a ubicar, sel = posición elegida; las ocupadas no se pueden tocar.
// Modo "ver": cada posición ocupada abre su proyecto.
function mapaPosicionesHTML(o={}){
  const elegir=!!o.elegir;
  return `<div class="pos-mapa">${POSICIONES.map(x=>{
    const oc=ocupanteDe(x.cod,elegir?o.pid:null), sel=elegir&&o.sel===x.cod;
    const cls='pos-box'+(oc?' ocupada':' libre')+(sel?' elegida':'');
    let click='';
    if(elegir&&!oc) click=`onclick="elegirPosicion('${esc(x.cod)}')"`;
    else if(!elegir&&oc) click=`onclick="verDetalle('${esc(oc.id)}')"`;
    const desv=oc&&esDesviado(oc);
    return `<div class="${cls}${desv?' desviada':''}" ${click} role="button" aria-label="${esc(x.cod)} ${oc?'ocupada':'libre'}">
      <div class="pos-cod">${esc(x.cod)}${sel?' ✓':''}</div>
      ${oc?`<div class="pos-proy">${esc((oc.nombre||'').slice(0,26))}</div>
        <div class="pos-det">${oc.avance||0}%${supNombre(oc)?' · '+esc(supNombre(oc).split(' ')[0]):''}${desv?' ⚠️':''}</div>`
        :`<div class="pos-det">${sel?'Elegida':'Libre'}</div>`}
      ${x.nombre?`<div class="pos-nom">${esc(x.nombre)}</div>`:''}
    </div>`;}).join('')}</div>`;
}
function libresCount(exceptoId){return POSICIONES.filter(x=>!ocupanteDe(x.cod,exceptoId)).length;}

// ── Al asignar (etapa "Por asignar") ──
function bloquePosicionAsignar(p){
  if(!llevaPosicion(p)) return '';
  const sel=p.pos&&!ocupanteDe(p.pos,p.id)?p.pos:'';
  const libres=libresCount(p.id);
  return `<div class="fg" id="as-pos-box"><label>📍 Posición en planta <span style="font-weight:400;color:var(--gris-m)">(proyecto a medida · ${libres} libre${libres===1?'':'s'} de ${POSICIONES.length})</span></label>
    <input type="hidden" id="as-pos" value="${esc(sel)}">
    <div id="as-pos-mapa">${mapaPosicionesHTML({elegir:true,pid:p.id,sel})}</div>
    ${libres?'':'<p style="color:var(--rojo);font-size:12px;margin-top:6px">Todas las posiciones están ocupadas: hay que finalizar un proyecto para liberar una.</p>'}
  </div>`;
}
let posModalPid=null;
function elegirPosicion(cod){
  const inp=document.getElementById(posModalPid?'mp-pos':'as-pos'); if(!inp) return;
  inp.value=cod;
  const pid=posModalPid||detalleId;
  const box=document.getElementById(posModalPid?'mp-pos-mapa':'as-pos-mapa');
  if(box) box.innerHTML=mapaPosicionesHTML({elegir:true,pid,sel:cod});
}
// Devuelve la posición elegida o null (y avisa) si falta o está ocupada
function posicionElegida(p){
  if(!llevaPosicion(p)) return '';
  const v=(document.getElementById('as-pos')||{}).value||'';
  if(!v){toast('⚠️ Elegí la posición en planta (P1 a P'+POSICIONES.length+')');return null;}
  const oc=ocupanteDe(v,p.id);
  if(oc){toast('⚠️ '+v+' está ocupada por '+oc.nombre+'. Elegí otra');return null;}
  return v;
}

// ── Cambiar la posición de un proyecto en curso (líder / admin) ──
function abrirCambiarPosicion(id){
  const p=todos[id]; if(!p) return;
  posModalPid=id;
  document.getElementById('mp-titulo').textContent='📍 Posición de '+(p.nombre||'');
  document.getElementById('mp-pos').value=p.pos||'';
  document.getElementById('mp-pos-mapa').innerHTML=mapaPosicionesHTML({elegir:true,pid:id,sel:p.pos||''});
  openOverlay('m-pos');
}
function cerrarCambiarPosicion(){posModalPid=null;closeOverlay('m-pos');}
async function guardarCambioPosicion(){
  const id=posModalPid, p=limpiar(todos[id]); if(!p) return;
  const v=document.getElementById('mp-pos').value;
  if(!v){toast('⚠️ Elegí una posición');return;}
  if(v===p.pos){cerrarCambiarPosicion();return;}
  const oc=ocupanteDe(v,id); if(oc){toast('⚠️ '+v+' está ocupada por '+oc.nombre);return;}
  const antes=p.pos;
  p.pos=v;
  try{await guardarProyectoOError(p);}catch(e){return;}
  cerrarCambiarPosicion(); verDetalle(id); refrescar();
  toast('📍 '+(antes?'Movido de '+antes+' a '+v:'Ubicado en '+v));
}

// ── Inicio del líder: mapa de la planta ──
function bloquePlantaHoy(){
  if(!posListo) return '';
  const oc=POSICIONES.length-libresCount(null);
  const sinPos=Object.values(todos).filter(p=>etapaDe(p)==='ejecucion'&&p.estado!=='finalizado'&&!esCompany(p)&&!p.pos).length;
  return `<div class="sec-title">🏁 Posiciones en planta <span class="sec-sub">${oc} ocupada${oc===1?'':'s'} · ${POSICIONES.length-oc} libre${POSICIONES.length-oc===1?'':'s'}</span></div>
    ${mapaPosicionesHTML()}
    ${sinPos?`<p style="font-size:12px;color:var(--gris-m);margin:-4px 0 12px">${sinPos} proyecto${sinPos>1?'s':''} a medida en curso sin posición (asignados antes de esta función). Ubicalos desde el proyecto → ⋯ Más → 📍 Posición en planta.</p>`:''}`;
}
