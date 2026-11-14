# Videos de la pestaña Recursos

Los videos cortos que ve cada rol en **Recursos** se graban solos con este programa: abre la app en un
navegador con una **base de prueba en memoria** (`mock-supabase.js` + `datos.js`, todo inventado, nunca
datos reales), sigue el guion de cada rol, y arma un MP4 vertical con subtítulos y voz en español.

| Guion | Video | Lo ve |
| --- | --- | --- |
| `guiones/inicio.js` | Primeros pasos | Todos |
| `guiones/ventas.js` | Cargar la nota de pedido | Ventas |
| `guiones/arquitectura.js` | Plano y verificación | Arquitectura |
| `guiones/lider.js` | Stock, asignación y seguimiento | Líder de operaciones |
| `guiones/supervisor.js` | Parte diario y materiales | Supervisor |
| `guiones/carpinteria.js` | Responder los pedidos | Carpinterías de aluminio y de madera |
| `guiones/admin.js` | Usuarios, costos y recursos | Administrador |

Los MP4 quedan en `web/recursos/videos/<guion>.mp4` y se publican con la app. El texto y el paso a paso
de cada tarjeta están en `web/recursos.js` (`REC_BASE`).

## Dos formas de actualizar un video

1. **Desde la app, sin tocar código** (lo más común): el administrador entra a **Recursos → ✏️ Editar**,
   sube el video nuevo (o pega un enlace de YouTube/Drive) y guarda. También puede corregir el texto,
   los pasos, para qué roles es, o sumar recursos nuevos (otro video, un manual en PDF). Lo que se cambia
   ahí queda en la tabla `recursos` de Supabase (migración `0015_recursos.sql`) y manda sobre lo que trae la app.
   Con **"Volver todo a como venía en la app"** se deshace.
2. **Volver a grabar con este programa** cuando cambie la app: se edita el guion del rol y se corre:

   ```bash
   pip install kokoro-onnx soundfile    # voz en español (el modelo se baja solo la primera vez)
   node tools/videos/grabar.js           # todos los videos
   node tools/videos/grabar.js lider     # solo uno
   SIN_VOZ=1 node tools/videos/grabar.js supervisor   # solo subtítulos, sin voz
   VOZ=em_alex node tools/videos/grabar.js            # voz de hombre (por defecto, voz de mujer)
   DEBUG=1 node tools/videos/grabar.js ventas         # muestra cada frase mientras graba
   ```

   Necesita Node 18+, Playwright con Chromium y ffmpeg (con libass para los subtítulos).

## Cómo se escribe un guion

```js
module.exports={
  usuario:'supervisor',                 // quién entra (ver datos.js)
  titulo:'SUPERVISOR · Parte diario',   // título fijo arriba de los subtítulos
  async guion(g){
    // g.decir(texto, acciones): muestra el subtítulo, lo dice, y mientras tanto hace las acciones
    await g.decir('Tocá Actualizar hoy.',()=>g.tocar('button[onclick^="abrirUpdate"]'));
  },
};
```

Acciones disponibles: `g.tocar(selector)`, `g.escribir(selector,texto)`, `g.valor(selector,valor)`,
`g.elegir(selector,opción)`, `g.mostrar(selector)`, `g.subir(selector,archivo)`, `g.pestana('proyectos')`,
`g.abrirProyecto(g.P.obra)`, `g.cerrar()`, `g.op(clave,valor)` y `g.siguiente()` (nota de pedido),
`g.pausa(ms)`, `g.dia(n)`. Los proyectos y usuarios de prueba están en `datos.js`.

Si la app cambia y un selector deja de existir, el programa corta con el error y la frase en la que iba.
