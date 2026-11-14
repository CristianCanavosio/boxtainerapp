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
        T.push(...filas); avisar(); return {data:clon(filas),error:null};
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
        avisar(); return {data:clon(fs),error:null};
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
