# BoxTainer Gestión Pro

App móvil de gestión de proyectos de BoxTainer Argentina SAS: ventas carga la nota de pedido (asistente de 7 pasos con dibujo del contenedor y PDF para el cliente), arquitectura sube el plano, el líder de operaciones asigna supervisor, fechas y presupuesto, y cada supervisor ve solo sus proyectos y carga avance, gastos, faltantes y consultas.

## Estructura

- `supabase/migrations/` — esquema de la base y permisos por rol (Row Level Security). Los permisos se aplican en la base, no solo en la app.
- `web/` — la app (HTML + JavaScript, sin compilación). `web/config.js` tiene la URL del proyecto y la clave pública (publishable/anon). Nunca poner ahí la `service_role`.

## Roles

| Rol | Ve | Puede |
| --- | --- | --- |
| Ventas | Sus proyectos (sin costos) | Cargar pedido y ficha técnica, enviar a arquitectura, responder consultas |
| Arquitectura | Proyectos en su etapa y los que planificó (sin costos) | Subir planos, verificar contra la ficha, enviar al líder |
| Líder de operaciones | Todo | Asignar supervisor, fechas, presupuesto y stock; resolver faltantes |
| Supervisor | Solo sus proyectos asignados | Avance, gastos reales, faltantes, reportar errores, consultas |
| Administrador | Todo | Lo mismo que el líder y asignar roles |
| Solo lectura | Todo | Nada |
| Carpintería de aluminio / de madera | Solo los pedidos que le mandaron y los planos de esos proyectos (sin precios ni el resto del proyecto) | Aceptar con fecha, rechazar con motivo, correr la fecha, marcar en fabricación y listo |

## Puesta en marcha

### 1. Base de datos (Supabase → SQL Editor)

Correr en orden, una sola vez cada uno:

1. `supabase/migrations/0001_esquema_y_permisos.sql`
2. `supabase/migrations/0002_tiempo_real_y_ajustes.sql`
3. `supabase/migrations/0003_croquis_de_ventas.sql` (deja que ventas suba el croquis del cliente desde la nota de pedido)
4. `supabase/migrations/0004_costeo_solo_admin.sql` (lista de costos y costeo del pedido, solo para el administrador)
5. `supabase/migrations/0005_precios_de_proveedores.sql` (importar precios de proveedores desde Excel, PDF o a mano; depósito privado `costos`)
6. `supabase/migrations/0006_cambios_en_nota_confirmada.sql` (cambios en la nota que ya confirmó el cliente: historial y reconfirmación de ventas)
7. `supabase/migrations/0007_materiales_por_proyecto.sql` (materiales de cada proyecto: stock antes de asignar, consumo real y desvíos)
8. `supabase/migrations/0008_plata_solo_admin.sql` (presupuesto de obra y gastos reales en USD: solo el administrador)
9. `supabase/migrations/0009_pedidos_a_carpinterias.sql` (pedidos a la carpintería de aluminio y a la de madera, con sus propios usuarios)

### 2. Publicar la app (Vercel, gratis)

1. Entrar a vercel.com con la cuenta de GitHub → **Add New… → Project** → importar `boxtainerapp`.
2. En **Root Directory** elegir `web`. Framework: **Other**. Sin comando de build.
3. **Deploy**. Vercel da una dirección tipo `https://boxtainerapp.vercel.app`. Cada cambio que se suba a `main` se publica solo.

### 3. Supabase → Authentication → URL Configuration

- **Site URL**: la dirección de Vercel.
- **Redirect URLs**: agregar la misma dirección. Así funcionan los enlaces de confirmación de correo y de recuperar contraseña.

### 4. Primer administrador

1. Abrir la app, tocar **Crear cuenta**, confirmar el correo.
2. En el SQL Editor correr, con ese correo:
   ```sql
   update perfiles set rol = 'admin' where email = 'tu-correo@empresa.com';
   ```
3. Desde ahí, el resto del equipo se crea su cuenta y el administrador le asigna el rol en la pestaña **Usuarios**.

### 5. Pasar los datos de la app anterior

En la app anterior (artefacto), pestaña Reportes → **Descargar respaldo completo**. En la app nueva, como administrador, Reportes → **Importar respaldo (app anterior)**. Los supervisores se asignan buscando una cuenta con el mismo nombre, así que conviene que el equipo cree sus cuentas antes de importar. Los planos que estaban subidos dentro del artefacto no se pueden mover automáticamente: hay que volver a subirlos (los que eran enlaces sí pasan).

## Límites conocidos

- Planos: hasta 50 MB por archivo en el plan gratuito de Supabase (Storage → Settings permite más en el plan Pro). Para archivos más grandes, pegar un enlace de Drive/OneDrive.
- Cada cambio hace que los celulares abiertos vuelvan a leer los datos que pueden ver. Con muchos miles de proyectos convendrá cargar por partes.
- El valor de venta de un proyecto lo ve cualquiera que vea el proyecto (incluido el supervisor). Si hay que ocultarlo, se mueve a una tabla aparte como el presupuesto.

## Nota de pedido

`web/nota.js` y `web/nota.css` tienen el asistente de carga que usa ventas (cliente, producto, distribución, terminaciones, aberturas, instalaciones y confirmación). Se guarda en la columna `ficha` del proyecto con `v: 2`. Los proyectos viejos siguen mostrando la ficha técnica anterior y se pueden pasar a la nota nueva desde Editar.

- Lo marcado "a confirmar" deja enviar a arquitectura, pero el líder no puede pasar el proyecto a ejecución hasta completarlo.
- El PDF para el cliente se arma en el celular (html2canvas y jsPDF desde cdnjs).

### Cambios después de que el cliente confirmó
- Cuando ventas envía la nota, queda guardada la versión que aprobó el cliente.
- Desde ahí solo el líder o el administrador la corrigen (arquitectura y ventas no). Si cambian algo que el cliente ve, queda registrado quién y qué cambió, y a ventas le llega una consulta automática.
- Ventas le manda el PDF nuevo al cliente y, cuando aprueba, toca **El cliente aprobó el cambio** en el proyecto.
- Mientras tanto el proyecto **no pasa a ejecución** (lo frena también la base). Si ya estaba en ejecución, queda marcado.
- En el detalle del proyecto está el historial con el PDF de cada versión.

## Materiales del proyecto
- Los ítems de materiales salen de la nota de pedido (son los mismos del costeo).
- **Líder, antes de asignar:** marca cada ítem como *Hay*, *Pedido* o *Falta*, y puede corregir la cantidad. No se asigna mientras haya ítems sin validar o en falta. Al asignar, lo planificado queda fijo.
- **Supervisor, en obra:** carga cuánto se usó de cada ítem (el total acumulado) y puede agregar materiales no previstos.
- **Desvío en cantidad:** lo ven el líder y el supervisor. Mientras la obra sigue, marca solo lo que se pasó; al finalizar, compara todo.
- **Desvío en USD:** lo ve solo el administrador. Se calcula como la diferencia de cantidad por el precio de la lista de costos.
- Toda la plata (presupuesto de obra, gastos reales en USD, desvíos en USD) la ve solo el administrador. El líder y el supervisor trabajan con cantidades.

## Pedidos a las carpinterías
`web/pedidos-carp.js`. La carpintería de aluminio y la de madera son empresas del grupo con su propia gente, así que cada una entra con su usuario (el administrador le asigna el rol en **Usuarios**).
- **Supervisor (o líder / admin):** desde el detalle del proyecto toca *Pedir a aluminio* o *Pedir a madera*. Las aberturas y muebles de la nota de pedido se cargan solos como sugerencia; se revisan, se pone para cuándo lo necesita la obra y dónde se entrega.
- **Carpintería:** en **📥 Pedidos** ve lo nuevo, lo acepta con la fecha en que lo tiene listo (o lo rechaza con el motivo), marca *en fabricación* y *listo*, y puede correr la fecha explicando por qué. Ve los planos del proyecto, nada más.
- **Supervisor:** cuando lo recibe en obra toca *Lo recibimos*. Si lo rechazaron, lo corrige y lo reenvía. Puede cancelarlo mientras no esté recibido.
- **Avisos (semáforo):** sin respuesta de la carpintería más de 4 h (amarillo) o 24 h (rojo), fecha de la carpintería posterior a la que necesita la obra, fecha vencida, listo para retirar. Salen en **Alertas** y en la pestaña **🪚 Carpinterías**.
- Cada cambio de estado o de fecha queda en el historial del pedido con quién y cuándo (lo escribe la base, no se puede editar). Los pedidos no se borran: se cancelan.

## Costeo del pedido (solo administrador)

`web/costeo.js`. Cada nota de pedido se convierte en una lista de ítems con cantidades (contenedor, espacios, artefactos, m² de pintura, revestimientos y piso calculados con las medidas del contenedor, puertas, ventanas, eléctrica, etc.). El administrador carga el precio unitario de cada ítem en la pestaña **🔒 Costos** (o directo en el proyecto) y el pedido se costea solo, con margen contra el valor de venta. Puede corregir cantidades y agregar ítems a mano, y pasar los totales por rubro al presupuesto de obra que ve el líder.

Las tablas `lista_costos` y `costeos` tienen Row Level Security que solo deja leer y escribir al rol `admin`: ninguna otra área puede verlas, ni siquiera usando la API de Supabase.

### Precios de proveedores

`web/costeo-import.js`. En **🔒 Costos** el administrador puede importar un Excel/CSV (elige las columnas de descripción y precio), un PDF de presupuesto (se lee el texto y se proponen las líneas con precio) o cargar precios a mano, en USD o en ARS con el dólar del día. Cada fila queda en el catálogo del proveedor (`precios_proveedor`) con el archivo original guardado en el depósito privado `costos`. Al vincular una fila a un ítem de la lista, ese ítem toma el precio, y la próxima lista del mismo proveedor se vincula sola. Para un mismo ítem se pueden comparar precios de varios proveedores y elegir cuál usar.

Pendiente: traer costos desde Flexxus (necesita acceso a su API o a la base y un proceso de sincronización fuera del navegador).
