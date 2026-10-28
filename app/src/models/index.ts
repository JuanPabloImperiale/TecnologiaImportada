import type { Timestamp } from 'firebase/firestore';

/** Unidad de negocio. */
export type Negocio = 'productos' | 'accesorios';

/** Rol del equipo (custom claims). El público no tiene rol. */
export type Rol = 'staff' | 'admin';

/** Variante de un producto (color, capacidad, etc.). */
export interface Variante {
  nombre: string;
  sku?: string;
  stock: number;
  costo: number;
  precioVenta: number;
}

/** Producto del catálogo / inventario. */
export interface Producto {
  id: string;
  nombre: string;
  slug: string;
  negocio: Negocio;
  /** ID del documento de la categoría en Firestore (relación por ID). */
  categoriaId: string;
  /** Nombre denormalizado – legacy. Usar categoriaId para filtrar. */
  categoria?: string;
  descripcion: string;
  /**
   * Moneda única del producto (costo, precio y ganancia están en esta moneda).
   * NO se convierte al darlo de alta; la conversión se hace recién en la venta.
   */
  monedaVenta: 'ARS' | 'USD';
  /** Precio de venta en `monedaVenta`. */
  precioVenta: number;
  precioAnterior?: number;
  /** Cómo se calculó la ganancia sobre el costo (en la misma moneda). */
  gananciaModo?: 'porcentaje' | 'monto';
  gananciaValor?: number;
  /** Costo en `monedaVenta`. */
  costo: number;
  sku?: string;
  codigoBarras?: string;
  stock: number;
  stockMinimo: number;
  imagenes: string[];
  specs?: Record<string, string>;
  activo: boolean;
  destacado: boolean;
  importBatchId?: string;
  proveedor?: string;
  creado: Timestamp;
  actualizado: Timestamp;
}

export interface Categoria {
  id: string;
  nombre: string;
  slug: string;
  negocio: Negocio;
  orden: number;
}

/** Línea de un carrito / pedido / venta. */
export interface ItemBase {
  productId: string;
  nombre: string;
  negocio: Negocio;
  cantidad: number;
  precioUnitario: number;
}

/** Item del carrito (en localStorage). `precioUnitario` es el valor en ARS (canónico). */
export interface ItemCarrito extends ItemBase {
  imagen?: string;
  /** Moneda en que se muestra el precio de este producto. */
  monedaVenta: 'ARS' | 'USD';
  /** Precio en su moneda (para mostrar en la línea). */
  precioMostrado: number;
}

export type EstadoPedido = 'nuevo' | 'visto' | 'atendido' | 'descartado';

/** Consulta de carrito (lead) creada desde la tienda. */
export interface Pedido {
  id: string;
  nombre: string;
  celular: string;
  /** Teléfono normalizado (solo dígitos) — clave en la colección clientes. */
  contactoId?: string;
  items: ItemCarrito[];
  /** Totales separados por moneda (sin conversión). */
  totalUsd: number;
  totalArs: number;
  estado: EstadoPedido;
  atendidoPor?: string;
  atendidoEn?: Timestamp;
  creado: Timestamp;
}

/** Tipo de línea en una venta. */
export type TipoItemVenta = 'venta' | 'bonificacion';

export interface ItemVenta extends ItemBase {
  tipo: TipoItemVenta;
  /** Moneda del item (la del producto). precioUnitario y costoUnitario están en esta moneda. */
  moneda: 'ARS' | 'USD';
  /** Costo unitario al momento de la venta (snapshot, en `moneda`). */
  costoUnitario: number;
}

export type MedioPago = 'efectivo' | 'transferencia_emmy' | 'transferencia_sole' | 'qr';
/** Medios que ya no se ofrecen pero pueden figurar en ventas viejas. */
export type MedioPagoLegacy = 'transferencia' | 'tarjeta';
export type CanalVenta = 'presencial' | 'whatsapp';
export type EstadoVenta = 'confirmada' | 'anulada';
export type EstadoFacturacion = 'sin_facturar' | 'facturada';

export interface Envio {
  metodo: 'retiro' | 'envio';
  costo: number; // en ARS
}

export interface Facturacion {
  estado: EstadoFacturacion;
  tipo: 'C';
  nroFacturaC?: string;
  cae?: string;
}

/** Cómo se cobró la venta. El USD es solo efectivo; el ARS puede ser por cualquier medio. */
export interface PagoVenta {
  /** Cobrado en dólares (efectivo). */
  usd: number;
  /** Cobrado en pesos. */
  ars: number;
  /** Medio del pago en pesos. */
  medioArs: MedioPago | MedioPagoLegacy | 'varios';
  /** Cotización USD→ARS usada en la venta. */
  tipoCambio: number;
}

export interface PagoRegistrado {
  fecha: Timestamp;
  monto: number;
  moneda: 'USD' | 'ARS';
  medio: MedioPago;
  registradoPor: string;
}

export type EstadoCuentaCobrar = 'pendiente' | 'pagada' | 'convertida' | 'cancelada';

/** Crédito comercial separado de ventas hasta que se cobre el total. */
export interface CuentaCobrar {
  id: string;
  numero: number;
  items: ItemVenta[];
  cliente: { nombre: string; celular?: string; cuitDni?: string };
  canal: CanalVenta;
  envio: Envio;
  pagos: PagoRegistrado[];
  estado: EstadoCuentaCobrar;
  creada: Timestamp;
  creadaPor: string;
  fechaCompleta?: Timestamp;
  ventaId?: string;
  numeroVenta?: number;
}

export interface Venta {
  id: string;
  numero: number;
  negocio: Negocio | 'mixta';
  items: ItemVenta[];
  productIds?: string[];
  /** Ingresos por moneda (items de tipo venta), sin conversión. `totalArs` ya tiene restado `descuento`. */
  totalUsd: number;
  totalArs: number;
  /** Descuento solo sobre accesorios en pesos (no incluye envío). */
  descuento?: { porcentaje: number; montoArs: number };
  /** Costo por moneda (todos los items, incl. bonificaciones). */
  costoUsd: number;
  costoArs: number;
  /** Costo de bonificaciones por moneda. */
  costoBonifUsd: number;
  costoBonifArs: number;
  envio: Envio; // ARS
  pago: PagoVenta;
  canal: CanalVenta;
  cliente?: { nombre?: string; celular?: string; cuitDni?: string };
  pedidoId?: string;
  cuentaCobrarId?: string;
  pagosDetalle?: PagoRegistrado[];
  estado: EstadoVenta;
  facturacion: Facturacion;
  vendedorId: string;
  creado: Timestamp;
}

/** Accesorios entregados sin cargo, opcionalmente asociados a una venta. */
export interface RegaloItem {
  productId: string;
  nombre: string;
  negocio: 'accesorios';
  moneda: 'ARS' | 'USD';
  cantidad: number;
  costoUnitario: number;
}

export interface Regalo {
  id: string;
  items: RegaloItem[];
  ventaId?: string;
  ventaNumero?: number;
  creado: Timestamp;
  registradoPor: string;
}

export type CategoriaGasto =
  | 'alquiler'
  | 'servicios'
  | 'insumos'
  | 'sueldos'
  | 'impuestos'
  | 'bonificaciones'
  | 'otros';

export interface Gasto {
  id: string;
  concepto: string;
  categoria: CategoriaGasto;
  monto: number;
  fecha: Timestamp;
  recurrente: boolean;
  nota?: string;
  creadoPor: string;
}

export type TipoMovimiento = 'venta' | 'regalo' | 'ingreso' | 'ajuste' | 'anulacion' | 'reserva' | 'liberacion';

export interface MovimientoStock {
  id: string;
  productId: string;
  tipo: TipoMovimiento;
  cantidad: number;
  motivo?: string;
  usuario: string;
  fecha: Timestamp;
}

export interface Novedad {
  id: string;
  titulo: string;
  texto?: string;
  /** Tipo de contenido: imagen o embed de Instagram. */
  tipo: 'imagen' | 'instagram';
  /** URL de la imagen (si tipo === 'imagen'). */
  mediaUrl?: string;
  /** Link de post de Instagram (si tipo === 'instagram'). */
  instagramPostUrl?: string;
  /** Texto del botón CTA. */
  ctaLabel?: string;
  /** URL destino del CTA. */
  ctaUrl?: string;
  /** Días desde `creado` hasta marcar como vencida (opcional). */
  diasVencimiento?: number;
  /** Estado: borrador o publicada. */
  estado: 'borrador' | 'publicada';
  /** Si está destacada (muestra popup en home). */
  destacado: boolean;
  /** Orden de visualización (ascendente). */
  orden: number;
  creado: Timestamp;
  actualizado: Timestamp;
}

export interface Settings {
  nombreNegocio: string;
  whatsapp: string;
  stockMinimoDefault: number;
  cuit?: string;
  /** % de descuento sugerido para pagos en efectivo. */
  descuentoEfectivo?: number;
  mediosPago: MedioPago[];
  /** Texto del hero del home (editable desde Contenido). */
  heroTitulo?: string;
  heroSubtitulo?: string;
  nosotrosTitulo?: string;
  nosotrosTexto?: string;
  nosotrosImagen?: string;
  direccion?: string;
  telefono?: string;
  instagram?: string;
  /** Latitud del pin del local (reemplaza mapaEmbedUrl). */
  mapLat?: number;
  /** Longitud del pin del local. */
  mapLon?: number;
  /** Legacy: embed URL de Google Maps (ignorado si mapLat/mapLon están presentes). */
  mapaEmbedUrl?: string;
  contactoTitulo?: string;
  contactoTexto?: string;
}
