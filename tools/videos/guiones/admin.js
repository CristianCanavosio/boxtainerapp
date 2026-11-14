// Video del Administrador: usuarios y roles, costos, sugerencias y cómo actualizar estos videos.
module.exports={
  usuario:'admin', titulo:'ADMINISTRADOR · Usuarios, costos y recursos',
  async guion(g){
    await g.decir('El administrador da acceso al equipo, es el único que ve la plata y mantiene al día estos videos.');
    await g.decir('Cuando alguien se crea una cuenta, aparece en Usuarios esperando rol. Elegí el rol y tocá Aprobar.',async()=>{
      await g.pestana('usuarios');
      await g.elegir('#sol-rol-0','supervisor');
      await g.tocar('#lista-usuarios button[onclick^="aprobar"]',{espera:1500});
    });
    await g.decir('En la lista del equipo cambiás el rol de cada uno, y a los vendedores les asignás su empresa. Si un supervisor deja de serlo, la app avisa qué proyectos hay que reasignar.',
      ()=>g.mostrar('#lista-usuarios .persona-item:has-text("Martín Ríos")'));
    await g.decir('En Costos mantenés la lista de precios: a mano, o importando el Excel o el PDF de un proveedor.',
      ()=>g.pestana('costos'));
    await g.decir('En cada proyecto ves el costeo del pedido y el desvío de materiales en dólares. Nadie más ve esos montos.',async()=>{
      await g.abrirProyecto(g.P.obra);
      await g.mostrar('#mp-sec');
    });
    await g.decir('En Sugerencias ves todas las ideas del equipo. Cambiales el estado y respondé: quien la mandó ve la respuesta.',async()=>{
      await g.cerrar();
      await g.pestana('sugerencias');
      await g.mostrar('#sug-lista .card');
    });
    await g.decir('Y en Recursos están estos videos. Cuando cambie algo en la app, tocá Editar en el video que quieras actualizar.',async()=>{
      await g.pestana('recursos');
      await g.tocar('#rec-content .chip:nth-child(2)');
      await g.tocar('#rec-content .rec-card:has-text("Supervisor") button[onclick^="recEditar"]',{espera:900});
    });
    await g.decir('Podés corregir el título, los pasos y para qué roles es. Subí el video nuevo, o pegá un enlace de YouTube o de Drive.',async()=>{
      await g.mostrar('#rec-pasos');
      await g.subir('#rec-form label:has(#rec-arch)',g.archivos.video);
    });
    await g.decir('Tocá Guardar: todos lo ven al instante, sin tocar el código. Si algo sale mal, podés volver al video original.',
      ()=>g.tocar('#rec-guardar',{espera:1800}));
    await g.decir('Con Nuevo recurso sumás otro video, un manual en PDF o un enlace, para el rol que quieras.',
      ()=>g.mostrar('#rec-content button[onclick="recEditar(null)"]'));
  },
};
