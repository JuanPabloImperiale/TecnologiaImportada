import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Search, CreditCard, Ban, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { useCatalog } from '@/hooks/useCatalog';
import { useSearchInput } from '@/hooks/useSearchInput';
import { cuentaCobrarService, type CuentaCobrarItemInput } from '@/services/cuentaCobrarService';
import { DEFAULT_MEDIOS_PAGO, settingsService } from '@/services/settingsService';
import { calcularSaldosCuenta, filtrarProductosCuenta } from '@/lib/cuentasCobrar';
import { MEDIOS_PAGO, medioPagoLabel } from '@/lib/mediosPago';
import { formatDate, formatMoney, formatPrice, formatUsd, matchesSearch, toDate } from '@/lib/utils';
import { Card, CardBody } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/Modal';
import type { CuentaCobrar, EstadoCuentaCobrar, MedioPago, Producto } from '@/models';

interface LineaEdicion extends CuentaCobrarItemInput {
  nombre: string;
  moneda: 'USD' | 'ARS';
  stock: number;
}

const estadoLabel: Record<EstadoCuentaCobrar, string> = {
  pendiente: 'Pendiente',
  pagada: 'Pagada · lista para registrar',
  convertida: 'Venta registrada',
  cancelada: 'Cancelada',
};

const estadoTone: Record<EstadoCuentaCobrar, 'neutral' | 'success' | 'danger'> = {
  pendiente: 'neutral',
  pagada: 'success',
  convertida: 'success',
  cancelada: 'danger',
};

function fechaHoy(): string {
  return formatDate(new Date(), 'YYYY-MM-DD');
}

function fechaLocal(value: string): Date {
  return new Date(`${value}T12:00:00`);
}

function Saldos({ saldos }: { saldos: ReturnType<typeof calcularSaldosCuenta> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-md bg-surface-2 p-3 text-sm">
        <p className="font-semibold">USD</p>
        <p>Total {formatUsd(saldos.totalUsd)} · Pagado {formatUsd(saldos.pagadoUsd)}</p>
        <p className="font-bold">Saldo {formatUsd(saldos.saldoUsd)}</p>
      </div>
      <div className="rounded-md bg-surface-2 p-3 text-sm">
        <p className="font-semibold">Pesos</p>
        <p>Total {formatMoney(saldos.totalArs)} · Pagado {formatMoney(saldos.pagadoArs)}</p>
        <p className="font-bold">Saldo {formatMoney(saldos.saldoArs)}</p>
      </div>
    </div>
  );
}

export function CuentasCobrarPage() {
  const [cuentas, setCuentas] = useState<CuentaCobrar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchInput, setQ, q, searchPending] = useSearchInput();

  useEffect(() => {
    const unsubscribe = cuentaCobrarService.subscribe(
      (items) => {
        setCuentas(items);
        setLoading(false);
      },
      (message) => {
        setError(message);
        setLoading(false);
      },
    );
    return unsubscribe;
  }, []);

  const filtradas = useMemo(() => {
    const term = q.trim();
    return cuentas.filter((cuenta) => matchesSearch(term, String(cuenta.numero), cuenta.cliente.nombre, cuenta.cliente.celular));
  }, [cuentas, q]);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cuentas a cobrar</h1>
          <p className="text-sm text-text-soft">Control de productos reservados y pagos parciales.</p>
        </div>
        <Link to="/adm/cuentas-a-cobrar/nueva"><Button><Plus size={16} aria-hidden="true" /> Nueva cuenta</Button></Link>
      </div>

      <div className="relative mb-4">
        <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-soft" aria-hidden="true" />
        <Input placeholder="Buscar por número, cliente o celular…" value={searchInput} loading={searchPending || loading} onChange={(event) => setQ(event.target.value)} className="pl-9" />
      </div>

      {loading ? <Spinner /> : error ? <EmptyState title="Error" description={error} /> : filtradas.length === 0 ? (
        <EmptyState icon={<CreditCard size={32} />} title="Sin cuentas" description="Las cuentas pendientes y cerradas aparecerán acá." />
      ) : (
        <div className="flex flex-col gap-2">
          {filtradas.map((cuenta) => {
            const saldos = calcularSaldosCuenta(cuenta.items, cuenta.pagos, cuenta.envio.costo);
            return (
              <Link key={cuenta.id} to={`/adm/cuentas-a-cobrar/${cuenta.id}`}>
                <Card className="flex flex-wrap items-center gap-3 p-3.5 transition-colors hover:border-line-strong">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-surface-2 text-sm font-bold">#{cuenta.numero}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{cuenta.cliente.nombre}</p>
                    <p className="text-sm text-text-soft">{formatDate(toDate(cuenta.creada))} · {cuenta.items.length} producto(s)</p>
                  </div>
                  <div className="text-right text-sm">
                    {saldos.saldoUsd > 0 && <p>{formatUsd(saldos.saldoUsd)}</p>}
                    {saldos.saldoArs > 0 && <p>{formatMoney(saldos.saldoArs)}</p>}
                    {cuenta.estado === 'convertida' && <p className="font-semibold">Venta #{cuenta.numeroVenta}</p>}
                  </div>
                  <Badge tone={estadoTone[cuenta.estado]}>{estadoLabel[cuenta.estado]}</Badge>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function NuevaCuentaCobrarPage() {
  const navigate = useNavigate();
  const [searchInput, setQ, q, searchPending] = useSearchInput();
  const { products, catMap, loading: loadingProducts } = useCatalog({ negocio: 'productos', loadProducts: Boolean(q.trim()) });
  const [lineas, setLineas] = useState<LineaEdicion[]>([]);
  const [cliente, setCliente] = useState({ nombre: '', celular: '', cuitDni: '' });
  const [canal, setCanal] = useState<'presencial' | 'whatsapp'>('presencial');
  const [metodoEntrega, setMetodoEntrega] = useState<'retiro' | 'envio'>('retiro');
  const [costoEnvio, setCostoEnvio] = useState(0);
  const [guardando, setGuardando] = useState(false);

  const candidatos = useMemo(
    () => filtrarProductosCuenta(q, products, new Set(lineas.map((linea) => linea.productId)), catMap),
    [products, lineas, q, catMap],
  );
  const saldos = calcularSaldosCuenta(lineas, [], metodoEntrega === 'envio' ? costoEnvio : 0);

  const agregar = (producto: Producto) => {
    setLineas((actuales) => [...actuales, {
      productId: producto.id,
      nombre: producto.nombre,
      cantidad: 1,
      precioUnitario: producto.precioVenta,
      moneda: producto.monedaVenta,
      stock: producto.stock,
    }]);
    setQ('');
  };

  const actualizarLinea = (productId: string, patch: Partial<LineaEdicion>) =>
    setLineas((actuales) => actuales.map((linea) => linea.productId === productId ? { ...linea, ...patch } : linea));

  const guardar = async () => {
    setGuardando(true);
    const resultado = await cuentaCobrarService.crear({
      items: lineas.map(({ productId, cantidad, precioUnitario }) => ({ productId, cantidad, precioUnitario })),
      cliente,
      canal,
      envio: { metodo: metodoEntrega, costo: metodoEntrega === 'envio' ? costoEnvio : 0 },
    });
    setGuardando(false);
    if (resultado.ok) {
      toast.success(`Cuenta #${resultado.data.numero} creada. El stock quedó reservado.`);
      navigate(`/adm/cuentas-a-cobrar/${resultado.data.id}`);
    } else toast.error(resultado.error.message);
  };

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/adm/cuentas-a-cobrar" className="mb-4 inline-flex items-center gap-1.5 text-sm text-text-soft hover:text-text"><ArrowLeft size={16} aria-hidden="true" /> Volver a cuentas</Link>
      <h1 className="mb-5 text-2xl font-bold tracking-tight">Nueva cuenta a cobrar</h1>
      <div className="flex flex-col gap-5">
        <Card><CardBody className="flex flex-col gap-3">
          <h2 className="font-bold">Productos</h2>
          <div className="relative">
            <Input
              label="Buscar producto"
              placeholder="Nombre, SKU o categoría"
              value={searchInput}
              loading={searchPending || loadingProducts}
              onChange={(event) => setQ(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setQ('');
                if (event.key === 'Enter' && searchInput === q && candidatos[0]) {
                  event.preventDefault();
                  agregar(candidatos[0]);
                }
              }}
            />
            {candidatos.length > 0 && <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-line bg-surface shadow-ti">
              {candidatos.map((producto) => <button key={producto.id} type="button" onClick={() => agregar(producto)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2">
                <span className="truncate">{producto.nombre}</span><span className="shrink-0 text-text-soft">{formatPrice(producto.precioVenta, producto.monedaVenta)} · stock {producto.stock}</span>
              </button>)}
            </div>}
          </div>
          {loadingProducts ? <Spinner /> : lineas.length === 0 ? <p className="py-3 text-center text-sm text-text-soft">Agregá productos de la unidad Productos. Accesorios no se pueden incluir.</p> : (
            <div className="flex flex-col gap-2">{lineas.map((linea) => <div key={linea.productId} className="flex flex-wrap items-center gap-2 rounded-md border border-line p-2.5">
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{linea.nombre} <span className="text-text-faint">({linea.moneda})</span></span>
              <Input aria-label={`Cantidad de ${linea.nombre}`} type="number" min={1} max={linea.stock} value={linea.cantidad} onChange={(event) => actualizarLinea(linea.productId, { cantidad: Math.min(linea.stock, Math.max(1, Number(event.target.value) || 1)) })} className="w-20" />
              <Input aria-label={`Precio acordado de ${linea.nombre}`} type="number" min={0} value={linea.precioUnitario} onChange={(event) => actualizarLinea(linea.productId, { precioUnitario: Math.max(0, Number(event.target.value) || 0) })} className="w-32" />
              <Button variant="ghost" size="sm" onClick={() => setLineas((actuales) => actuales.filter((item) => item.productId !== linea.productId))}>Quitar</Button>
            </div>)}</div>
          )}
          <Saldos saldos={saldos} />
        </CardBody></Card>

        <Card><CardBody className="grid gap-4 sm:grid-cols-2">
          <h2 className="sm:col-span-2 font-bold">Cliente y entrega</h2>
          <Input label="Nombre del cliente" required value={cliente.nombre} onChange={(event) => setCliente({ ...cliente, nombre: event.target.value })} />
          <Input label="Celular" type="tel" value={cliente.celular} onChange={(event) => setCliente({ ...cliente, celular: event.target.value })} />
          <Input label="CUIT/DNI" value={cliente.cuitDni} onChange={(event) => setCliente({ ...cliente, cuitDni: event.target.value })} />
          <Select label="Canal" value={canal} onChange={(event) => setCanal(event.target.value as 'presencial' | 'whatsapp')} options={[{ value: 'presencial', label: 'Presencial' }, { value: 'whatsapp', label: 'WhatsApp' }]} />
          <Select label="Entrega" value={metodoEntrega} onChange={(event) => setMetodoEntrega(event.target.value as 'retiro' | 'envio')} options={[{ value: 'retiro', label: 'Retiro en local' }, { value: 'envio', label: 'Envío' }]} />
          {metodoEntrega === 'envio' && <Input label="Costo de envío (ARS)" type="number" min={0} value={costoEnvio} onChange={(event) => setCostoEnvio(Math.max(0, Number(event.target.value) || 0))} />}
        </CardBody></Card>

        <p className="text-sm text-text-soft">Al crear la cuenta se reserva el stock. La operación no aparecerá como venta ni en el balance hasta completar los saldos y registrarla como venta.</p>
        <div className="flex justify-end gap-2"><Link to="/adm/cuentas-a-cobrar"><Button variant="ghost">Cancelar</Button></Link><Button onClick={guardar} loading={guardando} disabled={lineas.length === 0 || !cliente.nombre.trim()}>Crear cuenta y reservar stock</Button></div>
      </div>
    </div>
  );
}

export function CuentaCobrarDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [cuenta, setCuenta] = useState<CuentaCobrar | null>(null);
  const [loading, setLoading] = useState(true);
  const [fechaPago, setFechaPago] = useState(fechaHoy);
  const [moneda, setMoneda] = useState<'USD' | 'ARS'>('ARS');
  const [monto, setMonto] = useState('');
  const [medio, setMedio] = useState<MedioPago>('efectivo');
  const [guardando, setGuardando] = useState(false);
  const [convirtiendo, setConvirtiendo] = useState(false);
  const [confirmCancelar, setConfirmCancelar] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [mediosHabilitados, setMediosHabilitados] = useState<MedioPago[]>(DEFAULT_MEDIOS_PAGO);

  const cargar = useCallback(async () => {
    try {
      setCuenta(await cuentaCobrarService.get(id));
    } catch {
      toast.error('No se pudo cargar la cuenta.');
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => { void cargar(); }, [cargar]);
  useEffect(() => {
    settingsService.get().then((settings) => {
      const habilitados = settings.mediosPago?.length ? settings.mediosPago : DEFAULT_MEDIOS_PAGO;
      setMediosHabilitados(habilitados);
    });
  }, []);

  const saldos = cuenta ? calcularSaldosCuenta(cuenta.items, cuenta.pagos, cuenta.envio.costo) : null;
  const saldoUsdPendiente = saldos?.saldoUsd ?? 0;
  const saldoArsPendiente = saldos?.saldoArs ?? 0;
  useEffect(() => {
    if (saldoUsdPendiente <= 0 && saldoArsPendiente <= 0) return;
    if (moneda === 'ARS' && saldoArsPendiente <= 0 && saldoUsdPendiente > 0) setMoneda('USD');
    if (moneda === 'USD' && saldoUsdPendiente <= 0 && saldoArsPendiente > 0) setMoneda('ARS');
  }, [moneda, saldoArsPendiente, saldoUsdPendiente]);
  const mediosDisponibles = moneda === 'USD'
    ? [{ value: 'efectivo', label: 'Efectivo en USD' }]
    : MEDIOS_PAGO.filter((medioPago) => mediosHabilitados.includes(medioPago.value));

  useEffect(() => {
    if (moneda === 'USD') setMedio('efectivo');
    else if (!mediosHabilitados.includes(medio)) setMedio(mediosHabilitados[0] ?? 'efectivo');
  }, [moneda, medio, mediosHabilitados]);

  const agregarPago = async () => {
    setGuardando(true);
    const resultado = await cuentaCobrarService.registrarPago(id, {
      fecha: fechaLocal(fechaPago),
      monto: Number(monto),
      moneda,
      medio,
    });
    setGuardando(false);
    if (resultado.ok) {
      toast.success(resultado.data.completa ? 'Cuenta saldada. Ya podés registrarla como venta.' : 'Pago registrado.');
      setMonto('');
      await cargar();
    } else toast.error(resultado.error.message);
  };

  const convertir = async () => {
    setConvirtiendo(true);
    const resultado = await cuentaCobrarService.convertirEnVenta(id);
    setConvirtiendo(false);
    if (resultado.ok) {
      toast.success(`Venta #${resultado.data.numero} registrada con la fecha del pago final.`);
      navigate(`/adm/ventas/${resultado.data.id}`);
    } else toast.error(resultado.error.message);
  };

  const cancelar = async () => {
    setCancelando(true);
    const resultado = await cuentaCobrarService.cancelar(id);
    setCancelando(false);
    setConfirmCancelar(false);
    if (resultado.ok) {
      toast.success('Cuenta cancelada y stock liberado.');
      await cargar();
    } else toast.error(resultado.error.message);
  };

  if (loading) return <Spinner />;
  if (!cuenta || !saldos) return <EmptyState title="Cuenta no encontrada" action={<Link to="/adm/cuentas-a-cobrar"><Button variant="ghost">Volver a cuentas</Button></Link>} />;

  const monedasPendientes = [
    ...(saldos.saldoUsd > 0 ? [{ value: 'USD', label: 'USD' }] : []),
    ...(saldos.saldoArs > 0 ? [{ value: 'ARS', label: 'ARS' }] : []),
  ];
  const fechaCompleta = cuenta.fechaCompleta ? toDate(cuenta.fechaCompleta) : null;

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/adm/cuentas-a-cobrar" className="mb-4 inline-flex items-center gap-1.5 text-sm text-text-soft hover:text-text"><ArrowLeft size={16} aria-hidden="true" /> Volver a cuentas</Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight">Cuenta #{cuenta.numero}</h1><p className="text-sm text-text-soft">Creada {formatDate(toDate(cuenta.creada), 'DD/MM/YYYY HH:mm')}</p></div>
        <Badge tone={estadoTone[cuenta.estado]}>{estadoLabel[cuenta.estado]}</Badge>
      </div>

      <div className="flex flex-col gap-5">
        <Card><CardBody className="flex flex-col gap-3">
          <div><h2 className="font-bold">{cuenta.cliente.nombre}</h2><p className="text-sm text-text-soft">{cuenta.cliente.celular || 'Sin celular'}{cuenta.cliente.cuitDni ? ` · CUIT/DNI ${cuenta.cliente.cuitDni}` : ''}</p></div>
          <div className="divide-y divide-line">{cuenta.items.map((item) => <div key={item.productId} className="flex justify-between gap-3 py-2 text-sm">
            <span>{item.cantidad}× {item.nombre} <span className="text-text-faint">({item.moneda})</span><span className="block text-xs text-text-soft">Costo: {formatPrice(item.costoUnitario * item.cantidad, item.moneda)}</span></span>
            <span className="font-medium">{formatPrice(item.precioUnitario * item.cantidad, item.moneda)}</span>
          </div>)}</div>
          {cuenta.envio.costo > 0 && <p className="text-sm text-text-soft">Envío: {formatMoney(cuenta.envio.costo)}</p>}
          <Saldos saldos={saldos} />
          <p className="text-xs text-text-soft">Canal: {cuenta.canal === 'whatsapp' ? 'WhatsApp' : 'Presencial'} · Creó: {cuenta.creadaPor || 'No disponible'}</p>
        </CardBody></Card>

        <Card><CardBody className="flex flex-col gap-3">
          <h2 className="font-bold">Historial de pagos ({cuenta.pagos.length})</h2>
          {cuenta.pagos.length === 0 ? <p className="text-sm text-text-soft">Todavía no hay pagos registrados.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="text-text-soft"><th className="py-2 pr-3">Fecha</th><th className="py-2 pr-3">Importe</th><th className="py-2 pr-3">Medio</th><th className="py-2">Registró</th></tr></thead><tbody>{cuenta.pagos.map((pago, index) => <tr key={`${index}-${pago.fecha.toMillis()}`} className="border-t border-line"><td className="py-2 pr-3">{formatDate(toDate(pago.fecha))}</td><td className="py-2 pr-3 font-medium">{formatPrice(pago.monto, pago.moneda)}</td><td className="py-2 pr-3">{medioPagoLabel(pago.medio)}</td><td className="py-2">{pago.registradoPor}</td></tr>)}</tbody></table></div>}
        </CardBody></Card>

        {cuenta.estado === 'pendiente' && monedasPendientes.length > 0 && <Card><CardBody className="flex flex-col gap-3">
          <h2 className="font-bold">Registrar pago parcial</h2>
          <p className="text-sm text-text-soft">Cada pago se aplica únicamente al saldo de su moneda; USD se recibe en efectivo.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Fecha del pago" type="date" value={fechaPago} onChange={(event) => setFechaPago(event.target.value)} />
            <Select label="Moneda" value={moneda} onChange={(event) => { setMoneda(event.target.value as 'USD' | 'ARS'); setMonto(''); }} options={monedasPendientes} />
            <Input label={`Importe (${moneda})`} type="number" min="0.01" step="0.01" value={monto} onChange={(event) => setMonto(event.target.value)} />
            <Select label="Medio de pago" value={medio} onChange={(event) => setMedio(event.target.value as MedioPago)} options={mediosDisponibles} />
          </div>
          {mediosDisponibles.length === 0 && <p className="text-sm text-danger">No hay un medio habilitado para cobrar en esta moneda. Revisá Configuración.</p>}
          <div className="flex justify-end"><Button onClick={agregarPago} loading={guardando} disabled={!monto || Number(monto) <= 0 || !fechaPago || mediosDisponibles.length === 0}>Guardar pago</Button></div>
        </CardBody></Card>}

        {cuenta.estado === 'pagada' && <Card><CardBody className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-success"><CheckCircle2 size={18} aria-hidden="true" /><h2 className="font-bold">Saldo completo</h2></div>
          <p className="text-sm text-text-soft">Pago final registrado el {fechaCompleta ? formatDate(fechaCompleta, 'DD/MM/YYYY') : 'fecha no disponible'}. Al registrar la venta, esa será su fecha y el stock no se descontará nuevamente.</p>
          <div className="flex justify-end"><Button onClick={convertir} loading={convirtiendo}>Registrar como una venta</Button></div>
        </CardBody></Card>}

        {cuenta.estado === 'convertida' && cuenta.ventaId && <Link to={`/adm/ventas/${cuenta.ventaId}`} className="text-sm font-medium underline">Abrir venta #{cuenta.numeroVenta}</Link>}
        {(cuenta.estado === 'pendiente' || cuenta.estado === 'pagada') && <div className="flex justify-end"><Button variant="ghost" onClick={() => setConfirmCancelar(true)}><Ban size={16} aria-hidden="true" /> Cancelar cuenta</Button></div>}
      </div>

      <ConfirmDialog open={confirmCancelar} title="Cancelar cuenta" message={`Se liberará el stock. ${cuenta.pagos.length ? 'Los pagos ya recibidos quedarán en el historial; la app no procesa su devolución.' : 'No se registró ningún pago.'}`} confirmLabel="Cancelar cuenta" danger loading={cancelando} onConfirm={cancelar} onCancel={() => setConfirmCancelar(false)} />
    </div>
  );
}