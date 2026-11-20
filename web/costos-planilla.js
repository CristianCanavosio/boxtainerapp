// ════════════════════════════════════════════════
// PLANILLA DE COSTOS (solo admin)
// Pedido de Cristian 20/11: en vez de vincular en la app cada producto del proveedor con un ítem
// (y que ese vínculo quede guardado para siempre), los productos se agrupan en el Excel.
// La planilla trae una fila por cada ítem de la app con su nombre exacto. El admin pone el costo
// (si un ítem junta varios productos, pone el total) y la sube: la app toma el costo de cada fila
// por el nombre exacto del ítem. No se guarda ningún vínculo: lo que vale es la última planilla.
// La planilla subida queda como respaldo ("ver archivo" en cada ítem).
// ════════════════════════════════════════════════
let cpImp=null; // {archivo, filas:[{clave,costo,ant,proveedor,detalle}], desconocidos:[nombre], sinCosto:n}
const CP_COLS=['ÍTEM DE LA APP (no cambiar)','RUBRO','UNIDAD','COSTO USD','PROVEEDOR','QUÉ INCLUYE (productos agrupados)'];

async function planillaModeloCostos(){
  try{
    await cargarLib(LIB_XLSX);
    const orden={mat:0,mo:1,ter:2,otr:3};
    const cat=catalogoCostos().slice().sort((a,b)=>(orden[a.rubro]??9)-(orden[b.rubro]??9)||a.clave.localeCompare(b.clave));
    const filas=[CP_COLS,...cat.map(x=>[x.clave,RUBROS[x.rubro]||'Otros',x.unidad||'c/u',x.costo??'',listaCostos[x.clave]?.proveedor||'',''])];
    const wb=XLSX.utils.book_new();
    const ins=XLSX.utils.aoa_to_sheet([
      ['Planilla de costos · BoxTainer'],[''],
      ['1. Hay una fila por cada ítem de la app. No cambies el nombre de la columna "ÍTEM DE LA APP": así la app sabe a qué ítem va cada costo.'],
      ['2. Poné el COSTO USD por unidad. Si un ítem junta varios productos (por ejemplo "Sanitario · Inodoro" = inodoro + mochila + flexible), sumalos en la planilla y poné el total.'],
      ['3. En "QUÉ INCLUYE" anotá qué productos agrupaste. Es para vos: la app guarda la planilla como respaldo.'],
      ['4. Las filas con el costo vacío no cambian el precio que ya tiene la app.'],
      ['5. Subila en Costos → "📤 Subir planilla de costos". Antes de guardar te muestra qué cambia.'],
    ]);
    ins['!cols']=[{wch:110}];
    XLSX.utils.book_append_sheet(wb,ins,'Instrucciones');
    const ws=XLSX.utils.aoa_to_sheet(filas);
    ws['!cols']=[{wch:44},{wch:14},{wch:8},{wch:11},{wch:22},{wch:50}];
    XLSX.utils.book_append_sheet(wb,ws,'Costos');
    XLSX.writeFile(wb,'costos-boxtainer.xlsx');
  }catch(e){toast('⚠️ No se pudo armar la planilla: '+(e.message||e));}
}

async function leerPlanillaCostos(input){
  const f=input.files[0]; input.value=''; if(!f) return;
  try{
    await cargarLib(LIB_XLSX);
    const wb=XLSX.read(await f.arrayBuffer(),{type:'array'});
    // la hoja con la columna "ítem de la app" (la planilla modelo la llama Costos)
    let mat=null,cab=-1,ci=-1,cc=-1,cp=-1,cd=-1;
    for(const n of wb.SheetNames){
      const m=XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,raw:true,defval:''});
      for(let i=0;i<Math.min(15,m.length);i++){
        const h=m[i].map(normTxt), j=h.findIndex(x=>/item de la app/.test(x));
        if(j>=0){mat=m;cab=i;ci=j;cc=h.findIndex(x=>/costo|precio/.test(x));cp=h.findIndex(x=>/proveedor/.test(x));cd=h.findIndex(x=>/incluye|detalle/.test(x));break;}
      }
      if(mat) break;
    }
    if(!mat) throw new Error('no encontré la columna "ÍTEM DE LA APP". Bajá la planilla modelo y completala.');
    if(cc<0) throw new Error('no encontré la columna "COSTO USD"');
    const porNorm={}; catalogoCostos().forEach(x=>porNorm[normTxt(x.clave)]=x.clave);
    const filas=[], desconocidos=[]; let sinCosto=0;
    mat.slice(cab+1).forEach(r=>{
      const nom=String(r[ci]??'').trim(); if(!nom) return;
      const v=String(r[cc]??'').trim(), costo=numAR(r[cc]);
      if(v===''||isNaN(costo)||costo<0){sinCosto++;return;}
      const clave=porNorm[normTxt(nom)];
      if(!clave){desconocidos.push(nom);return;}
      filas.push({clave,costo:Math.round(costo*100)/100,ant:listaCostos[clave]?.costo??null,
        proveedor:cp>=0?String(r[cp]??'').trim():'',detalle:cd>=0?String(r[cd]??'').trim():''});
    });
    if(!filas.length&&!desconocidos.length) throw new Error('no hay filas con costo');
    cpImp={archivo:f,filas,desconocidos,sinCosto};
  }catch(e){console.error(e);toast('⚠️ No se pudo leer la planilla: '+(e.message||e));cpImp=null;}
  renderCostos();
}

function previaPlanillaCostosHTML(){
  const p=cpImp; if(!p) return '';
  const cambian=p.filas.filter(x=>x.ant==null||Number(x.ant)!==x.costo);
  return `<div class="card" style="border-left:5px solid var(--nar)">
    <div class="card-title">📄 ${esc(p.archivo.name)}</div>
    <div style="font-size:13px;line-height:1.5">${cambian.length} precio${cambian.length===1?'':'s'} cambian · ${p.filas.length-cambian.length} quedan igual${p.sinCosto?` · ${p.sinCosto} fila${p.sinCosto>1?'s':''} sin costo (no se tocan)`:''}</div>
    ${cambian.length?`<div class="cp-lista">${cambian.slice(0,60).map(x=>`<div><span>${esc(x.clave)}${x.detalle?`<small>${esc(x.detalle)}</small>`:''}</span><b>${x.ant==null?'nuevo':usd(x.ant)} → ${usd(x.costo)}</b></div>`).join('')}
      ${cambian.length>60?`<div style="color:var(--gris-m)">y ${cambian.length-60} más…</div>`:''}</div>`:''}
    ${p.desconocidos.length?`<div style="font-size:12px;color:var(--rojo);margin-top:6px">⚠️ ${p.desconocidos.length} fila${p.desconocidos.length>1?'s':''} con un nombre que no existe en la app (¿se cambió el nombre del ítem?). No se cargan: ${esc(p.desconocidos.slice(0,8).join(' · '))}${p.desconocidos.length>8?'…':''}</div>`:''}
    <div class="flex-btns" style="margin-top:8px">${cambian.length?`<button class="btn btn-verde btn-sm" onclick="guardarPlanillaCostos(this)">✅ Guardar ${cambian.length} precio${cambian.length===1?'':'s'}</button>`:''}
      <button class="btn btn-sec btn-sm" onclick="cpImp=null;renderCostos()">Cancelar</button></div></div>`;
}

async function guardarPlanillaCostos(btn){
  const p=cpImp; if(!p) return; btn.disabled=true;
  try{
    // la planilla queda como respaldo de los precios (y de qué productos se agruparon)
    let ruta=null;
    try{
      const seguro=p.archivo.name.normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^\w.\-]+/g,'_').slice(-80);
      ruta=`planillas/${nuevoId()}-${seguro}`;
      chk(await sb.storage.from('costos').upload(ruta,p.archivo,{contentType:p.archivo.type||'application/octet-stream'}));
    }catch(e){console.warn('No se guardó la planilla como respaldo',e);ruta=null;}
    const cat={}; catalogoCostos().forEach(x=>cat[x.clave]=x);
    const cambian=p.filas.filter(x=>x.ant==null||Number(x.ant)!==x.costo);
    const filas=cambian.map(x=>{const prev=listaCostos[x.clave]||cat[x.clave]||{};
      const f={clave:x.clave,costo:x.costo,rubro:prev.rubro||'mat',unidad:prev.unidad||'c/u'};
      if(proveedoresListo) Object.assign(f,{proveedor:x.proveedor||'Planilla de costos',fuente:'excel',referencia:ruta});
      return f;});
    chk(await sb.from('lista_costos').upsert(filas,{onConflict:'clave'}));
    filas.forEach(f=>listaCostos[f.clave]={...(listaCostos[f.clave]||{}),...f});
    cpImp=null; toast(`✅ ${filas.length} precio${filas.length===1?'':'s'} actualizados`); renderCostos();
  }catch(e){toast(msgError(e)); btn.disabled=false;}
}
