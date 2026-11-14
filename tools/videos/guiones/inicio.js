// Video de Primeros pasos: para todos los roles.
module.exports={
  usuario:'supervisor', titulo:'PRIMEROS PASOS · Para todos',
  async guion(g){
    await g.decir('Bienvenido a BoxTainer Gestión Pro. En un minuto te mostramos cómo moverte en la app.');
    await g.decir('Entrás desde el celular con tu correo y tu contraseña. La primera vez, tocá Crear cuenta y esperá a que el administrador te asigne el rol.');
    await g.decir('Arriba ves tu nombre y tu rol. Cada rol ve solo las pestañas y los proyectos que le tocan.',
      ()=>g.mostrar('#header-user-info'));
    await g.decir('En el Tablero aparece primero lo que espera algo de vos: consultas para responder, proyectos de tu área y avisos.',
      ()=>g.mostrar('#dash-content'));
    await g.decir('En Proyectos tocá una tarjeta para ver el detalle.',()=>g.abrirProyecto(g.P.obra));
    await g.decir('Ahí está la etapa, la información, los planos, la nota de pedido, las consultas y el recorrido del proyecto.',async()=>{
      await g.mostrar('#det-content .flujo');
      await g.mostrar('#det-content .dsec:has-text("Nota de pedido")');
    });
    await g.decir('Las consultas entre áreas tienen semáforo: verde hasta cuatro horas, amarillo hasta veinticuatro y rojo después.',async()=>{
      await g.mostrar('#det-content .dsec:has-text("Consultas")');
      await g.escribir('#cq-texto','¿Llegó el vidrio de la ventana?');
      await g.elegir('#cq-para','lider');
      await g.tocar('#det-content button[onclick^="enviarConsulta"]',{espera:1200});
    });
    await g.decir('En Sugerencias mandás una idea para mejorar, con texto, una foto o un audio.',async()=>{
      await g.cerrar();
      await g.pestana('sugerencias');
    });
    await g.decir('Y en Recursos tenés el video y el paso a paso de tu rol. Si la app cambia, el video se actualiza acá.',async()=>{
      await g.pestana('recursos');
      await g.mostrar('#rec-content .rec-pasos');
    });
  },
};
