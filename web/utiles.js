// ════════════════════════════════════════════════
// UTILIDADES COMPARTIDAS
// Cargar librerías (Excel), normalizar texto, leer números escritos a la argentina y comparar
// nombres parecidos (lo usan el maestro de insumos, las recetas, el stock de los talleres y el cotizador).
// ════════════════════════════════════════════════
const LIB_XLSX='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
function cargarLib(src){return new Promise((ok,mal)=>{if(document.querySelector(`script[src="${src}"]`)){ok();return}
  const s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=()=>mal(new Error('No se pudo cargar '+src));document.head.appendChild(s)})}

// ── texto y números ──
const normTxt=t=>String(t||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
// "1.234,56" / "1,234.56" / "1234.5" / "$ 12.000" -> número
function numAR(v){
  if(typeof v==='number') return v;
  let t=String(v||'').replace(/[^\d.,-]/g,''); if(!t) return NaN;
  const c=t.lastIndexOf(','), p=t.lastIndexOf('.');
  if(c>p) t=t.replace(/\./g,'').replace(',','.');           // formato argentino
  else if(p>c&&c>=0) t=t.replace(/,/g,'');                  // formato inglés con miles
  else if(c<0&&(t.match(/\./g)||[]).length>1) t=t.replace(/\./g,'');
  else if(c<0&&/\.\d{3}$/.test(t)) t=t.replace('.','');     // "12.000" = doce mil
  return Number(t);
}
// ── Emparejar nombres: la app dice "Sanitario · Inodoro", la planilla "INODORO ANDINA LARGO" ──
// Cada ítem de la app tiene una parte general (antes del "·": Sanitario, Cocina, Luz, Piso…) y una
// parte que lo identifica (Inodoro). Se compara sobre todo la parte que lo identifica, sin tildes,
// en singular y con algunos sinónimos.
const SINON={aa:'aire',acondicionado:'aire',split:'aire',ac:'aire',led:'led',tubo:'tubo',plafon:'plafon',termotanque:'termotanque',
  calefon:'termotanque',deposito:'tanque',mochila:'inodoro',vanitory:'bacha',lavatorio:'bacha',pileta:'bacha',griferia:'canilla',
  monocomando:'canilla',tomacorriente:'toma',enchufe:'toma',llave:'llave',pvc:'pvc',melamina:'melamina',aberturas:'ventana'};
const VACIAS_EMP=new Set(['de','del','la','el','los','las','con','sin','y','a','en','x','por','para','un','una','c','u','cm','mm','m2','m','lts','l','tipo','linea','company','medida','especial','fg','w']);
function palabrasEmp(t){
  return normTxt(String(t||'').replace(/(\d)\.(\d{3})(?!\d)/g,'$1$2').replace(/(\d)\s*[x×*]\s*(?=\d)/gi,'$1 ')).split(' ')
    .filter(w=>w&&!VACIAS_EMP.has(w))
    .map(w=>/ces$/.test(w)?w.slice(0,-3)+'z':/ones$/.test(w)?w.slice(0,-2):w.length>3&&/s$/.test(w)?w.slice(0,-1):w)
    .map(w=>SINON[w]||w);
}
// 0 a 1: qué tanto el producto del proveedor (desc) corresponde al ítem de la app (clave).
// Pesan menos las palabras generales (Sanitario, Cocina, Luz…) y los números (medidas).
const GENERALES=new Set(['sanitario','cocina','luz','piso','revestimiento','interior','exterior','armado','instalacion','general','ambiente']);
const pesoEmp=w=>GENERALES.has(w)?0.25:/^\d+$/.test(w)?0.4:1;
function puntajeEmp(clave,desc){
  const td=new Set(palabrasEmp(desc)); if(!td.size) return 0;
  const pc=[...new Set(palabrasEmp(clave))]; if(!pc.length) return 0;
  const tot=pc.reduce((s,w)=>s+pesoEmp(w),0), ok=pc.filter(w=>td.has(w)).reduce((s,w)=>s+pesoEmp(w),0);
  // si el producto nombra otro ambiente (dice "cocina" y el ítem es de "sanitario"), baja
  const otro=[...td].some(w=>GENERALES.has(w)&&!pc.includes(w))&&pc.some(w=>GENERALES.has(w));
  return Math.round(ok/tot*(otro?0.7:1)*100)/100;
}
