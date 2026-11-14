// Video del Supervisor: parte diario, materiales usados, faltantes y errores.
module.exports={
  usuario:'supervisor', titulo:'SUPERVISOR · Parte diario y materiales',
  async guion(g){
    await g.decir('El supervisor carga todos los días el avance de sus proyectos y lo que se usó en la obra.');
    await g.decir('En Proyectos ves solo los que te asignaron. Tocá uno para abrirlo.',()=>g.abrirProyecto(g.P.obra));
    await g.decir('Arriba ves el avance real contra el esperado según las fechas. Si se atrasa, el proyecto se marca como desviado.',
      ()=>g.mostrar('#det-content .prog-bar'));
    await g.decir('Al final de la jornada tocá Actualizar hoy.',async()=>{
      await g.tocar('#det-content button[onclick^="abrirUpdate"]',{espera:900});
    });
    await g.decir('Poné el porcentaje de avance, cuántas personas trabajaron, cuántas horas y qué se hizo. Con eso se calculan las horas hombre.',async()=>{
      await g.valor('#upd-av','45');
      await g.escribir('#upd-pers','3');
      await g.escribir('#upd-hs','8');
      await g.escribir('#upd-text','Revestimiento PVC en la oficina. Mañana sigue el baño.');
      await g.tocar('#m-update button[onclick="guardarUpdate()"]',{espera:1200});
    });
    await g.decir('En Materiales cargá cuánto se usó de cada uno, siempre el total acumulado. Si te pasás de lo planificado, se marca el desvío.',async()=>{
      await g.abrirProyecto(g.P.obra);
      await g.valor('#mp-sec .mp-r:has-text("Revestimiento PVC") input','36');
      await g.page.keyboard.press('Tab'); await g.pausa(1200);
      await g.mostrar('#mp-sec .mp-r:has-text("Revestimiento PVC")');
    });
    await g.decir('Si usaste algo que no estaba previsto, agregalo abajo.',async()=>{
      await g.tocar('#mp-sec details.mp-add summary');
      await g.escribir('#mp-nom','Sellador poliuretánico');
      await g.escribir('#mp-uni','pomo');
      await g.escribir('#mp-cant','2');
      await g.tocar('#mp-sec button[onclick^="agregarMatProy"]',{espera:1200});
    });
    await g.decir('Si falta un material, tocá Falta material. Le llega al líder con la fecha en que lo necesitás y si frena el trabajo.',async()=>{
      await g.tocar('#det-content button[onclick^="abrirFaltante"]',{espera:900});
      await g.escribir('#fa-mat','Perfil C 100');
      await g.escribir('#fa-cant','6 barras');
      await g.elegir('#fa-frena','no');
      await g.tocar('#m-falt button[onclick="guardarFaltante()"]',{espera:1200});
    });
    await g.decir('Si encontrás un error en las medidas o en el plano, tocá Reportar error y elegí de qué área vino. Le llega como consulta urgente.',async()=>{
      await g.tocar('#det-content button[onclick^="abrirIncidencia"]',{espera:900});
      await g.elegir('#inc-tipo','Medida incorrecta');
      await g.elegir('#inc-origen','arquitectura');
      await g.escribir('#inc-desc','La ventana del baño en el plano mide 60 por 60, la nota dice 60 por 40.');
      await g.elegir('#inc-frena','no');
      await g.tocar('#m-inc button[onclick="guardarIncidencia()"]',{espera:1200});
    });
    await g.decir('Los pedidos a las carpinterías también están en el proyecto. Cuando llegan a la obra, tocá Lo recibimos.',
      ()=>g.mostrar('#pc-sec'));
    await g.decir('Listo. Cargá el parte todos los días: así el líder ve el avance real sin tener que llamarte.');
  },
};
