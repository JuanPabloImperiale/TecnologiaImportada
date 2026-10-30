# Tecnología Importada — App

Web app (tienda pública + panel admin) en React + Vite + TypeScript, Tailwind + shadcn/ui, sobre Firebase.

## Requisitos
- Node.js 18+ y npm.

## Correr en local
```bash
cd app
npm install
npm run dev
```
Abrí la URL que muestra Vite (normalmente http://localhost:5173).

- Tienda pública: `/`
- Panel admin (login placeholder en Fase 0): `/adm`

> El archivo `.env.local` ya está incluido con la config de Firebase del proyecto `tecnologiaimportada`.
> Si lo perdés, copiá `.env.example` y completá las variables `VITE_FIREBASE_*`.
> Para App Check en local también podés completar `VITE_FIREBASE_APPCHECK_SITE_KEY` y `VITE_FIREBASE_APPCHECK_DEBUG_TOKEN`.

## Scripts
- `npm run dev` — servidor de desarrollo.
- `npm run build` — build de producción a `dist/`.
- `npm run preview` — sirve el build localmente.
- `npm run lint` — ESLint.

## Estructura
```
src/
  components/ui        kit base (Button, Card, Input, Badge, Spinner, EmptyState, ThemeToggle)
  components/layout    ShopLayout, AdminLayout, ErrorBoundary
  providers            ThemeProvider (claro/oscuro/sistema)
  hooks                useTheme, useAsync
  services             result.ts (manejo de errores tipado) — los services de cada módulo llegan por fase
  models               interfaces TS de todas las colecciones
  schemas              validaciones Zod
  lib                  firebase.ts, utils.ts (cn, formatMoney, formatDate, slugify)
  routes               router + páginas (placeholders por ahora)
```

## Estado actual: Fase 1 (Auth admin)
Listo además de la Fase 0:
- Login real en `/adm` (email + contraseña, validación con Zod, errores con toast).
- **Sin roles:** cualquier usuario habilitado en Firebase Auth que pueda iniciar sesión accede a todo el panel. El control de acceso es la lista de usuarios de Firebase Auth.
- Guard de sesión: todo `/adm/*` requiere estar logueado; si no, redirige al login.
- Topbar con email y botón de cerrar sesión.
- Logos de marca integrados (principal en home/login/favicon; el de accesorios para las vistas del subnegocio).

### Gestión de accesos
Para habilitar o quitar a alguien del panel: **Firebase → Authentication → Usuarios** (agregar/eliminar usuario). No hay roles ni scripts: todos los usuarios tienen el mismo nivel.

### Logos
`public/TIPrincipal.png` (principal — home, login, favicon) y `public/TIAccesorios.png` (subnegocio — vistas de Accesorios). Son los dos únicos assets de imagen, para mantener la app liviana. Para cambiarlos, reemplazá esos archivos manteniendo el nombre.

## Estado actual: Fase 2 (Inventario + Categorías)
- **Categorías** (`/adm/categorias`): alta, edición y borrado, por unidad (Productos/Accesorios).
- **Inventario** (`/adm/inventario`): pestañas Productos/Accesorios, búsqueda, alerta de stock bajo, activar/desactivar (soft-delete) y editar.
- **Alta/edición de producto** (`/adm/inventario/nuevo` y `/:id`): nombre, categoría, precios, costo (ARS/USD + tipo de cambio), stock + stock mínimo, SKU, imágenes (subida a Storage con compresión), destacado/activo.
- Cada cambio de stock registra un movimiento en `movimientosStock` (kardex).

### ⚠️ Aplicar las reglas de Firestore (una vez, obligatorio)
Sin esto, la app no puede leer/escribir en Firestore.
1. Consola → Firestore Database (crear base si no existe, modo producción). Pestaña **Reglas** → pegar `firestore.rules` → Publicar.
2. (Recomendado) **App Check** con reCAPTCHA para proteger la creación anónima de pedidos.

> No usamos Firebase Storage (requiere plan Blaze). Las imágenes van a **Cloudinary** (gratis). El archivo `storage.rules` queda solo de referencia por si algún día se activa Storage.

### Configurar Cloudinary (gratis, para las imágenes)
1. Creá una cuenta en https://cloudinary.com (gratis, sin tarjeta).
2. En el Dashboard, copiá tu **Cloud name**.
3. Settings (⚙️) → **Upload** → "Upload presets" → **Add upload preset**:
   - Signing mode: **Unsigned**.
   - Guardá y copiá el **nombre del preset**.
4. En `.env.local` completá:
   ```
   VITE_CLOUDINARY_CLOUD_NAME=tu_cloud_name
   VITE_CLOUDINARY_UPLOAD_PRESET=tu_preset
   ```
5. Reiniciá `npm run dev`. Listo: el subir-foto del formulario sube a Cloudinary.

> Plan gratis de Cloudinary: ~25 GB, más que suficiente para fotos de producto. Si no completás esto, todo funciona menos la subida de imágenes.

### Probar la Fase 2
1. Entrá a `/adm` → **Categorías**: creá un par (ej. "Audio", "Cargadores").
2. **Inventario** → "Nuevo producto": cargá uno con imagen, precio, costo y stock.
3. Verificá que aparezca en la lista, probá la búsqueda, el toggle activo/inactivo y la edición.
4. Repetí en la pestaña **Accesorios**.

## Estado actual: Fase 3 (Catálogo público)
- **Home** (`/`): hero con logo, chips de categorías y grilla de **destacados** (productos con "destacado" activado), todo desde Firestore.
- **Catálogo** (`/catalogo`): grilla responsive con buscador, filtro por unidad (Todos/Productos/Accesorios) y por categoría.
- **Categoría** (`/categoria/:slug`) y **Búsqueda** (`/buscar`): misma vista filtrada.
- **Detalle de producto** (`/producto/:slug`): galería con miniaturas, precio en su moneda (US$ o $ + equivalente en pesos si es USD), descuento, stock, descripción y especificaciones.
- Header de la tienda **siempre visible**; el scroll ocurre en el contenido (igual que el panel admin).
- El botón "Agregar al carrito" está visible pero se activa en la Fase 4.

> Para ver productos en la tienda: cargá productos en el panel (Fase 2) y marcá algunos como **Activo** (y **Destacado** para que salgan en el home).

## Estado actual: Fase 4 (Carrito + confirmación por WhatsApp)
- **Carrito** en `localStorage`, compartido entre pestañas (si sumás algo en una pestaña, se actualiza en las otras). Badge con la cantidad en el ícono del carrito.
- **Agregar al carrito** desde el detalle (con selector de cantidad, topeado al stock).
- `/carrito`: editar cantidades, quitar, subtotal estimado (en ARS).
- `/carrito/confirmar`: form mínimo **nombre + celular** (sin cuenta). Al enviar: crea el **pedido** en Firestore (estado `nuevo`) y **abre WhatsApp** con el detalle hacia el negocio.
- `/pedido/enviado`: confirmación y carrito vaciado.

### Configurar el WhatsApp del negocio (para que se abra el mensaje)
Entrá al panel → **Configuración** (`/adm/configuracion`) → cargá el **WhatsApp** (solo dígitos con código de país, ej. `5491122334455`) → Guardar. Queda guardado en Firestore (`settings/general`), sin reiniciar nada.
(Opcional: `VITE_WHATSAPP` en `.env.local` funciona como respaldo.)
Si no hay número, el pedido igual se registra en Firestore, solo que no se abre WhatsApp.

### Agregar al carrito rápido
Cada card del catálogo/home tiene un botón **+** para agregar al carrito sin abrir el detalle.

## Estado actual: Fase 5 (Notificaciones)
- **`/adm/notificaciones`**: bandeja de consultas de carrito en **tiempo real** (aparecen solas al confirmar un pedido).
- Cada consulta muestra nombre, celular, fecha, productos y totales por moneda (USD/ARS).
- Estados: **Nuevo → Visto → Atendido** (+ Descartado). Filtros pendientes / atendidos / todos.
- **Responder por WhatsApp**: abre el chat al celular del cliente (y marca la consulta como vista).
- **Marcar atendido** (registra quién y cuándo) / **Reabrir** / **Descartar**.
- **Badge de pendientes** en el menú lateral (consultas no atendidas), siempre en vivo.

## Estado actual: Fase 6 (Ventas)
- **`/adm/ventas/nueva`**: registrar venta — buscar y agregar productos (mezcla Productos y Accesorios), marcar líneas como **venta o bonificación** (regalo: precio $0, costo real), descuento, **medio de pago** (+ recargo % si es tarjeta), **envío** (retiro/envío + costo), datos de cliente opcionales. Muestra total y **margen** en vivo.
- Al confirmar: transacción atómica que asigna **N° correlativo**, **descuenta stock**, registra movimiento de kardex y crea la venta. Valida stock (no deja vender de más).
- **`/adm/ventas`**: listado con búsqueda y filtros, badges de estado/facturación, y **exportar CSV**.
- **`/adm/ventas/:id`**: detalle con margen y bonificaciones, **anular** (reintegra stock), **imprimir comprobante** (se abre listo para "Guardar como PDF" desde el navegador) y **registrar Factura C / CAE** (facturación manual en ARCA, con los datos listos para copiar).
- **Convertir en venta** desde Notificaciones: precarga los productos del pedido del cliente.

> Las reglas de Firestore ya cubren `ventas`, `counters` y `movimientosStock` (se publicaron en la Fase 2). Si ves errores de permisos, revisá que las reglas publicadas sean las últimas.

## Estado actual: Fase 7 (Gastos + Balance mensual)
- **`/adm/gastos`**: cargar gastos por mes (concepto, categoría, monto, fecha, **recurrente**), listado del mes, eliminar, y **clonar los recurrentes** del mes anterior.
- **`/adm/balance`**: selector de mes con tarjetas de **ingresos, COGS, margen bruto, envíos, gastos y ganancia neta**.
  - Comparativa **Productos vs Accesorios** (ingresos/costo/margen por unidad).
  - KPI **Bonificaciones del mes** (unidades regaladas + costo absorbido).
  - El costo de las bonificaciones se **reasigna a la unidad que cobró** (Accesorios no queda en pérdida); el envío se cuenta como ingreso aparte.
  - Ganancia neta = margen bruto + envíos − gastos.

## Cambio de modelo de moneda (importante)
- El **producto se carga en una sola moneda** (USD o ARS): costo, ganancia y precio en esa moneda. **No se convierte al dar de alta.**
- En la **tienda** el producto se muestra solo en su moneda (sin "≈ en pesos").
- La **conversión se hace recién en la venta**: al registrar, se carga la **cotización del día** y cuánto se cobró en **USD (efectivo)** y cuánto en **ARS (por cualquier medio)**.
- El **balance separa lo vendido en dólares de lo vendido en pesos** (sin mezclar): margen en USD y, aparte, margen + envíos − gastos en ARS.

> Nota: los productos creados antes de este cambio pueden tener datos de moneda inconsistentes; conviene revisarlos/recrearlos.

## Estado actual: Fase 8 (Dashboard + módulos de soporte)
- **Dashboard** (`/adm/dashboard`) con ventas del día/mes, stock bajo, top productos y consultas pendientes.
- **Importaciones** (`/adm/importaciones`) para registrar lotes, actualizar costo y sumar stock dejando movimientos.
- **Contactos** (`/adm/contactos`) derivados de pedidos y ventas, agrupados por celular, con acceso directo a WhatsApp.
- **Contenido** (`/adm/contenido`) para editar el hero del home sin tocar código.
- **Configuración** ampliada con WhatsApp, stock mínimo por defecto, CUIT, recargo de tarjeta y medios de pago habilitados.
- Vistas públicas de soporte: `/nosotros`, `/contacto`, `/envios`, `/faq`, `/legales`.

## Estado actual: Fase 9 (QA, robustez y despliegue)
- Build de producción validado con `npm run build`.
- Rutas con `errorElement` para evitar la pantalla cruda de React Router ante errores inesperados.
- Metadato `noindex,nofollow` en el área admin y login.
- Lazy-load de páginas para reducir el bundle inicial.
- Inicialización opcional de **Firebase App Check** desde variables de entorno.

Pendiente operativo de despliegue: publicar reglas/hosting, terminar App Check en consola Firebase, revisar el warning de chunk grande y hacer la pasada final de QA funcional.

## Convención clave
Un componente nunca llama a Firestore directo. Flujo: **componente → hook → service → Firebase**.
Nunca hardcodear colores: usar los tokens (`bg-surface`, `text-text`, `bg-accent`, etc.).

## Control de lecturas de Firestore
- Firestore usa cache persistente IndexedDB compartida entre pestanas. Los datos pueden permanecer en el dispositivo despues de cerrar sesion: usar el panel en dispositivos de confianza.
- Las busquedas completas de productos y el historial de ventas reutilizan resultados durante 60 segundos en memoria y comparten consultas simultaneas. Los errores no se guardan en cache.
- Los cambios de productos invalidan su cache de busqueda. Crear o anular ventas invalida tambien el stock; facturar invalida el historial. El boton Actualizar de Ventas fuerza la consulta al servidor.
- La pagina de catalogo tiene una sola carga inicial/restablecimiento; no carga una pagina sin filtro al buscar dentro de una categoria.
- Las modificaciones desde otros dispositivos pueden demorar hasta 60 segundos en verse en estas busquedas. Las transacciones siguen validando el stock en el servidor.
- Los buscadores aplican el texto despues de 1,2 segundos sin escritura; borrar limpia el filtro inmediatamente. El indicador giratorio permanece visible durante la espera y la consulta. Excepcion: el listado de Ventas tiene un formulario manual; todos sus filtros se aplican solo al pulsar Buscar o enviar el formulario con Enter.
- En Ventas se pueden combinar producto, numero o cliente, monto cobrado, moneda, estado y facturacion. El monto compara `pago.ars` o `pago.usd` a precision de centavos, no el total de productos. La consulta de monto usa un rango de un centavo sobre el campo del pago y ordena solo los resultados; no requiere migracion ni indice compuesto adicional.
- El selector de productos carga el catalogo al abrirse y filtra sus sugerencias localmente. Seleccionar un producto no consulta ventas. Si hay monto, se consulta por monto y se aplican los demas filtros sobre esas coincidencias; si no, se usa el indice del producto. La busqueda parcial solo por numero o cliente usa el historial completo con cache, unicamente al confirmar.
- Editar campos no altera los resultados existentes hasta Buscar. Actualizar repite los filtros ya aplicados y fuerza datos frescos; Limpiar filtros vuelve a las ventas recientes paginadas. La exportacion mensual sigue siendo independiente de los filtros de busqueda.
- Inventario abre con 30 productos y obtiene el contador global desde `stockBajo`, sin escanear todos los productos. El filtro y el dashboard consultan ese mismo indice.
- Stock bajo requiere producto activo, minimo configurado mayor que cero y stock menor o igual al minimo. Sin minimo o con minimo cero no aplica la alerta, incluso si el stock es cero.
- Altas, ediciones, activaciones, bajas, ventas, anulaciones, importaciones, regalos y reservas mantienen el indice junto con el cambio de producto, en la misma transaccion o batch. Una entrada se retira al reponer, desactivar o eliminar el producto. Las operaciones confirmadas descartan la cache de productos; crear, anular o convertir ventas descarta ademas el historial correspondiente.
- El filtro de ventas por producto consulta `productIds` con `array-contains` y ordena por fecha, sin descargar el historial completo. Las ventas nuevas, incluidas las convertidas de cuentas a cobrar, guardan ese campo.
- La cache no garantiza consumo cero ni un limite diario. Medir otras 24 horas con trafico comparable; la consola de Firestore tambien genera lecturas. El cupo gratis es de 50.000 lecturas por dia y se reinicia alrededor de medianoche del Pacifico, no de Argentina.
- Para costo cero estricto, revisar el plan del proyecto. Spark limita el servicio al agotar cuotas; en Blaze se factura el exceso y una alerta de presupuesto no es un corte automatico.

Referencia: https://firebase.google.com/docs/firestore/pricing

### Publicacion del filtro indexado de ventas
Antes de publicar Hosting se debe crear el indice de `ventas.productIds` + `creado DESC` definido en `firestore.indexes.json` y adaptar las ventas antiguas. No cambiar las reglas de seguridad para esta tarea.

```bash
npx firebase-tools deploy --only firestore:indexes --project tecnologiaimportada
npm exec --yes --package=firebase-tools -- node scripts/backfillVentaProductIds.mjs --project tecnologiaimportada
npm exec --yes --package=firebase-tools -- node scripts/backfillVentaProductIds.mjs --project tecnologiaimportada --apply
```

El segundo comando simula sin escribir. Cada ejecucion lee una vez todas las ventas; `--apply` agrega o corrige solo `productIds` en las pendientes, sin tocar precios, items, estado ni stock. Es idempotente y usa la version del documento para no pisar cambios concurrentes. Si falla, corregir la causa y volver a ejecutar. La cuenta autenticada con `firebase login` necesita permisos de Firestore en el proyecto; no se imprimen ni se guardan tokens en el repo.

Verificar que el indice este listo antes de publicar Hosting y volver a ejecutar la simulacion despues del corte para detectar ventas creadas por clientes con la version anterior. Todavia puede haber lectores con la app anterior: pedir que recarguen.

### Inicializar stock bajo
La coleccion `stockBajo` permite lectura y escritura solo al equipo autenticado. Publicar las reglas de la coleccion antes del nuevo Hosting. Inicializarla una vez con:

```bash
npm exec --yes --package=firebase-tools -- node scripts/backfillLowStock.mjs --project tecnologiaimportada
npm exec --yes --package=firebase-tools -- node scripts/backfillLowStock.mjs --project tecnologiaimportada --apply
```

La simulacion no escribe. La aplicacion verifica versiones, actualiza entradas necesarias y elimina las que ya no cumplen la condicion, sin modificar los productos. Repetir despues del corte para reconciliar posibles cambios hechos desde clientes antiguos. Los cambios manuales desde consola o scripts externos tambien requieren reconciliar este indice.
