// Supabase de mentira, solo para grabar los videos de Recursos.
// Reemplaza a supabase-js en el navegador: guarda todo en memoria, con los datos de prueba de datos.js.
// No se conecta a ninguna base real. Lo inyecta grabar.js; la app publicada nunca lo carga.
(function(){
  const DB=window.__MOCK_DB||{};
  const ME=window.__MOCK_ME;
  const blobs={}; // ruta de storage -> URL
  const oyentes=[];
  const uuid=()=>crypto.randomUUID();
  const ahora=()=>new Date().toISOString();
  const tabla=t=>(DB[t]=DB[t]||[]);
  const clon=o=>JSON.parse(JSON.stringify(o));
  const PK={presupuestos:'proyecto_id',costeos:'proyecto_id',recursos:'clave',lista_costos:'clave'};
  let serial=1000;
  function avisar(){setTimeout(()=>oyentes.forEach(f=>{try{f({})}catch(e){}}),50);}
  function porDefecto(t,r){
    if(t==='recorrido'){r.id=r.id??++serial;r.autor_id=r.autor_id??ME.id;}
    else if(!r.id&&t!=='presupuestos'&&t!=='costeos'&&t!=='recursos') r.id=uuid();
    r.creado_en=r.creado_en||ahora();
    if(['planos','costos','actualizaciones','incidencias','faltantes'].includes(t)) r.autor_id=r.autor_id||ME.id;
    if(t==='consultas') r.de_id=r.de_id||ME.id;
    if(t==='pedidos_carpinteria'){
      r.numero=r.numero??++serial; r.estado=r.estado||'enviado';
      r.proyecto_nombre=r.proyecto_nombre||(tabla('proyectos').find(p=>p.id===r.proyecto_id)||{}).nombre||'';
      r.historial=[{estado:'enviado',por:ME.id,en:ahora()}];
    }
    if(t==='sugerencias'){const p=tabla('perfiles').find(x=>x.id===ME.id)||{};
      Object.assign(r,{autor:r.autor||ME.id,autor_nombre:p.nombre||'',autor_rol:p.rol||'',estado:'nueva',respuesta:''});}
    if(t==='recursos'){r.actualizado_en=ahora();r.actualizado_por=ME.id;}
    if(t==='oportunidades'){r.numero=r.numero??++serial;r.vendedor_id=r.vendedor_id||ME.id;r.etapa=r.etapa||'precalificado';r.unidades=r.unidades||1;
      r.entregado=!!r.entregado;r.cobrado=!!r.cobrado;r.etapa_en=r.etapa_en||ahora();r.actualizado_en=r.actualizado_en||ahora();
      r.historial=r.historial||[{etapa:r.etapa,en:ahora(),por:ME.id}];}
    if(t==='tareas_crm'){r.hecha_en=r.hecha_en??null;r.tipo=r.tipo||'llamar';}
    return r;
  }
  function alActualizar(t,r,cambios){
    if(t==='pedidos_carpinteria'){
      const h=Array.isArray(r.historial)?r.historial:[];
      if(cambios.estado&&cambios.estado!==r.estado) h.push({estado:cambios.estado,por:ME.id,en:ahora(),nota:cambios.nota_taller||undefined});
      else if(cambios.fecha_compromiso&&r.fecha_compromiso&&cambios.fecha_compromiso!==r.fecha_compromiso)
        h.push({fecha:cambios.fecha_compromiso,antes:r.fecha_compromiso,por:ME.id,en:ahora(),nota:cambios.nota_taller||undefined});
      cambios.historial=h;
    }
    if(t==='recursos'){cambios.actualizado_en=ahora();cambios.actualizado_por=ME.id;}
    if(t==='oportunidades'){cambios.actualizado_en=ahora();
      if(cambios.etapa&&cambios.etapa!==r.etapa){cambios.etapa_en=ahora();cambios.historial=(r.historial||[]).concat([{etapa:cambios.etapa,en:ahora(),por:ME.id}]);}}
  }
  // Cotizador (migración 0025): la misma cuenta que hace la base, en memoria
  const PK2={cot_insumos:'codigo',cot_tipologias:'codigo',cot_parametros:'clave',cot_equivalencias:'clave',cotizaciones_costo:'cotizacion_id'};
  Object.assign(PK,PK2);
  const par=k=>Number((tabla('cot_parametros').find(x=>x.clave===k)||{}).valor);
  function cotCalc(tip,camb,uni){
    const t=tabla('cot_tipologias').find(x=>x.codigo===tip); if(!t) throw new Error('La tipología no existe');
    const m=t.margen??par('margen_default')??0, u=Math.max(1,Math.min(999,uni||1));
    const base={}; tabla('cot_recetas').filter(r=>r.tipologia===tip).forEach(r=>base[r.insumo]=Number(r.cant));
    const cods=new Set([...Object.keys(base),...Object.keys(camb||{})]);
    let costo=0,sin=[]; const det=[];
    tabla('cot_insumos').filter(i=>cods.has(i.codigo)).sort((a,b)=>String(a.rubro).localeCompare(b.rubro)||a.nombre.localeCompare(b.nombre)).forEach(i=>{
      const b=base[i.codigo]||0, c=camb&&camb[i.codigo]!=null?Math.max(0,Number(camb[i.codigo])):b;
      if(!c&&!b) return; det.push({codigo:i.codigo,nombre:i.nombre,unidad:i.unidad,cant:c,base:b});
      if(c>0){if(i.costo_usd==null) sin.push(i.nombre); else costo+=c*Number(i.costo_usd);}});
    const pu=Math.round(costo*(1+m));
    return {tipologia:tip,tipologia_nombre:t.nombre,unidades:u,costo_unit:Math.round(costo*100)/100,costo_total:Math.round(costo*u*100)/100,margen:m,
      precio_unit:pu,precio_total:pu*u,detalle:det,sin_costo:sin.length,sin_costo_nombres:sin,iva:par('iva')||0,tipo_cambio:par('tipo_cambio'),validez_dias:par('validez_dias')||7};
  }
  function cotMock(fn,a){
    try{
      const yo=(tabla('perfiles').find(x=>x.id===ME.id)||{}).rol, lider=['admin','lider_ventas'].includes(yo);
      if(fn==='cot_catalogo') return {data:{tipologias:clon(tabla('cot_tipologias').filter(t=>t.activo!==false).map(({margen,...t})=>t)),
        insumos:clon(tabla('cot_insumos').filter(i=>i.activo!==false).map(({costo_usd,...i})=>i)),recetas:clon(tabla('cot_recetas')),
        iva:par('iva'),tipo_cambio:par('tipo_cambio'),validez_dias:par('validez_dias')},error:null};
      if(fn==='cot_calcular'){const c=cotCalc(a.p_tipologia,a.p_cambios,a.p_unidades);if(!lider){delete c.costo_unit;delete c.costo_total;delete c.margen;}return {data:c,error:null};}
      if(fn==='cot_guardar'){
        const c=cotCalc(a.p_tipologia,a.p_cambios,a.p_unidades), lista=c.precio_total, o=tabla('oportunidades').find(x=>x.id===a.p_oportunidad);
        let ped=a.p_precio_pedido||null, est, fin=null, v=a.p_id&&tabla('cotizaciones').find(x=>x.id===a.p_id);
        if(v&&v.estado==='enviada') throw new Error('La cotización ya se envió: hacé una nueva');
        if(ped==null||ped>=lista){est='lista';fin=ped??lista;if(ped===lista)ped=null;}
        else if(lider){est='autorizada';fin=ped;}
        else if(v&&v.estado==='autorizada'&&Number(v.precio_final)===ped&&Number(v.precio_lista)===lista){est='autorizada';fin=ped;}
        else{est='pendiente';if(!String(a.p_motivo||'').trim()) throw new Error('Contale al líder de ventas por qué pedís otro precio');}
        const fila={oportunidad_id:o.id,vendedor_id:o.vendedor_id,cliente:o.cliente,tipologia:a.p_tipologia,tipologia_nombre:c.tipologia_nombre,unidades:c.unidades,
          cambios:a.p_cambios||{},detalle:c.detalle,notas:a.p_notas,precio_lista:lista,precio_pedido:ped,motivo_pedido:a.p_motivo,precio_final:fin,estado:est,
          iva:c.iva,tipo_cambio:c.tipo_cambio,validez_dias:c.validez_dias,sin_costo:c.sin_costo,actualizado_en:ahora()};
        if(est==='pendiente') fila.respuesta=null;
        if(v) Object.assign(v,fila); else{v=Object.assign({id:uuid(),numero:++serial,creado_en:ahora()},fila);tabla('cotizaciones').push(v);}
        const k=tabla('cotizaciones_costo').find(x=>x.cotizacion_id===v.id);
        if(k) Object.assign(k,{costo_total:c.costo_total,margen:c.margen}); else tabla('cotizaciones_costo').push({cotizacion_id:v.id,costo_total:c.costo_total,margen:c.margen});
        avisar(); return {data:v.id,error:null};
      }
      if(fn==='cot_autorizar'){const v=tabla('cotizaciones').find(x=>x.id===a.p_id);
        if(a.p_aprobar) Object.assign(v,{estado:'autorizada',precio_final:a.p_precio??v.precio_pedido,precio_pedido:a.p_precio??v.precio_pedido,respuesta:a.p_respuesta,autorizado_por:ME.id});
        else Object.assign(v,{estado:'rechazada',precio_final:null,respuesta:a.p_respuesta,autorizado_por:ME.id});
        avisar(); return {data:null,error:null};}
      if(fn==='cot_enviar'){const v=tabla('cotizaciones').find(x=>x.id===a.p_id);
        if(!['lista','autorizada','enviada'].includes(v.estado)) throw new Error('El precio todavía no está autorizado');
        Object.assign(v,{estado:'enviada',enviada_en:ahora(),enviada_via:a.p_via});
        const o=tabla('oportunidades').find(x=>x.id===v.oportunidad_id);
        Object.assign(o,{precio_estandar:v.precio_lista,precio_cliente:v.precio_final,unidades:v.unidades,presupuesto_via:a.p_via||o.presupuesto_via});
        avisar(); return {data:null,error:null};}
      if(fn==='cot_importar'){
        (a.p_insumos||[]).forEach(x=>{const f={codigo:x.codigo,nombre:x.nombre,rubro:x.rubro,unidad:x.unidad,costo_usd:x.costo,fuente:'planilla',activo:true,para_vendedor:x.rubro!=='Otros',costo_actualizado_en:ahora()};
          const y=tabla('cot_insumos').find(i=>i.codigo===x.codigo); if(y) Object.assign(y,f); else tabla('cot_insumos').push(f);});
        (a.p_tipologias||[]).forEach(x=>{const y=tabla('cot_tipologias').find(i=>i.codigo===x.codigo), f={...x,activo:true}; if(y) Object.assign(y,f); else tabla('cot_tipologias').push(f);});
        const ts=new Set((a.p_recetas||[]).map(r=>r.tipologia)); DB.cot_recetas=tabla('cot_recetas').filter(r=>!ts.has(r.tipologia));
        (a.p_recetas||[]).forEach(r=>DB.cot_recetas.push({...r}));
        Object.entries(a.p_parametros||{}).forEach(([k,v])=>{const y=tabla('cot_parametros').find(i=>i.clave===k); if(y) y.valor=v; else tabla('cot_parametros').push({clave:k,valor:v});});
        avisar(); return {data:{insumos:(a.p_insumos||[]).length,tipologias:(a.p_tipologias||[]).length,recetas:(a.p_recetas||[]).length},error:null};}
    }catch(e){return {data:null,error:{message:e.message,code:'P0001'}};}
    return {data:null,error:null};
  }
  class Q{
    constructor(t){this.t=t;this.op='select';this.f=[];this.ord=[];this.rng=null;this.lim=null;this.val=null;this.opts={};this.uno=false;}
    select(){return this;}
    insert(v){this.op='insert';this.val=v;return this;}
    update(v){this.op='update';this.val=v;return this;}
    upsert(v,o){this.op='upsert';this.val=v;this.opts=o||{};return this;}
    delete(){this.op='delete';return this;}
    eq(k,v){this.f.push(r=>String(r[k])===String(v));return this;}
    neq(k,v){this.f.push(r=>String(r[k])!==String(v));return this;}
    in(k,vs){const s=new Set(vs.map(String));this.f.push(r=>s.has(String(r[k])));return this;}
    is(k,v){this.f.push(r=>(r[k]??null)===v);return this;}
    match(o){Object.entries(o).forEach(([k,v])=>this.eq(k,v));return this;}
    order(k,o){this.ord.push([k,!(o&&o.ascending===false)]);return this;}
    range(a,b){this.rng=[a,b];return this;}
    limit(n){this.lim=n;return this;}
    single(){this.uno=true;return this;}
    maybeSingle(){this.uno=true;return this;}
    run(){
      const T=tabla(this.t), pasa=r=>this.f.every(f=>f(r));
      if(this.op==='select'){
        let out=T.filter(pasa);
        this.ord.forEach(([k,asc])=>out.sort((a,b)=>((a[k]??'')>(b[k]??'')?1:(a[k]??'')<(b[k]??'')?-1:0)*(asc?1:-1)));
        if(this.rng) out=out.slice(this.rng[0],this.rng[1]+1);
        if(this.lim!=null) out=out.slice(0,this.lim);
        out=clon(out);
        return {data:this.uno?(out[0]||null):out,error:null};
      }
      if(this.op==='insert'){
        const filas=(Array.isArray(this.val)?this.val:[this.val]).map(r=>porDefecto(this.t,clon(r)));
        T.push(...filas); avisar(); return {data:this.uno?clon(filas[0]):clon(filas),error:null};
      }
      if(this.op==='upsert'){
        const k=this.opts.onConflict||PK[this.t]||'id';
        const filas=(Array.isArray(this.val)?this.val:[this.val]).map(r=>{
          const x=T.find(y=>String(y[k])===String(r[k]));
          if(x){const c=clon(r);alActualizar(this.t,x,c);Object.assign(x,c);return x;}
          const n=porDefecto(this.t,clon(r));T.push(n);return n;});
        avisar(); return {data:clon(filas),error:null};
      }
      if(this.op==='update'){
        const fs=T.filter(pasa); fs.forEach(r=>{const c=clon(this.val);alActualizar(this.t,r,c);Object.assign(r,c);});
        avisar(); return {data:this.uno?clon(fs[0]||null):clon(fs),error:null};
      }
      if(this.op==='delete'){
        const quedan=T.filter(r=>!pasa(r)); DB[this.t]=quedan; avisar(); return {data:[],error:null};
      }
    }
    then(ok,mal){return new Promise(r=>setTimeout(r,40)).then(()=>this.run()).then(ok,mal);}
  }
  const sesion={user:{id:ME.id,email:ME.email,user_metadata:{nombre:ME.nombre}}};
  window.supabase={createClient:()=>({
    from:t=>new Q(t),
    rpc:async(fn,args)=>{
      if(fn==='reconfirmar_nota'){const vs=tabla('nota_versiones').filter(v=>v.proyecto_id===args.pid);
        const p=tabla('proyectos').find(x=>x.id===args.pid);
        vs.length&&tabla('nota_versiones').push({id:uuid(),proyecto_id:args.pid,version:vs.length+1,tipo:'reconfirmada',ficha:p&&p.ficha,autor_id:ME.id,creado_en:ahora()});
        avisar();}
      if(fn==='estado_correos_sugerencias') return {data:[],error:null};
      if(fn==='notas_de_ordenes') return {data:tabla('proyectos').filter(p=>(args.pids||[]).includes(p.id)).map(p=>({proyecto_id:p.id,nombre:p.nombre,
        cliente:p.cliente,empresa:p.empresa,tipo:p.tipo,entrega:p.entrega,deposito:p.deposito,ficha:p.ficha})),error:null};
      if(fn==='cargar_stock_taller'){const yo=tabla('perfiles').find(x=>x.id===ME.id)||{}, t={carp_aluminio:'aluminio',carp_madera:'madera'}[yo.rol];
        DB.stock_taller=tabla('stock_taller').filter(x=>x.taller!==t);
        (args.filas||[]).forEach(f=>DB.stock_taller.push({id:uuid(),taller:t,codigo:f.codigo||null,descripcion:f.descripcion,cantidad:Number(f.cantidad)||0,unidad:f.unidad||null,cargado_en:ahora()}));
        avisar(); return {data:(args.filas||[]).length,error:null};}
      if(fn.startsWith('cot_')) return cotMock(fn,args);
      return {data:null,error:null};
    },
    auth:{
      getSession:async()=>({data:{session:sesion},error:null}),
      onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
      signInWithPassword:async()=>({data:{session:sesion},error:null}),
      signOut:async()=>({error:null}),signUp:async()=>({data:{},error:null}),
      resetPasswordForEmail:async()=>({error:null}),updateUser:async()=>({error:null}),
    },
    storage:{from:b=>({
      upload:async(ruta,f)=>{blobs[b+'/'+ruta]=URL.createObjectURL(f);return {data:{path:ruta},error:null};},
      createSignedUrl:async(ruta)=>({data:{signedUrl:blobs[b+'/'+ruta]||window.__MOCK_ARCHIVOS?.[b+'/'+ruta]||'about:blank'},error:null}),
      remove:async()=>({data:[],error:null}),
    })},
    channel:()=>{const c={on:(_a,_b,fn)=>{oyentes.push(fn);return c;},subscribe:()=>c};return c;},
  })};
})();
