import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Search, Download, ChevronRight, RefreshCw, X } from 'lucide-react';
import { useCatalog } from '@/hooks/useCatalog';
import { saleService, type VentaCursor } from '@/services/saleService';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatMoney, formatUsd, formatDate, monthKey, matchesSearch } from '@/lib/utils';
import { medioPagoLabel } from '@/lib/mediosPago';
import { exportarVentasCsv } from '@/lib/ventasCsv';
import { coincideFiltroFacturacion, type FiltroFacturacion } from '@/lib/ventas';
import type { Producto, Venta } from '@/models';

function ventaFecha(v: Venta): Date {
  return (v.creado as unknown as { toDate?: () => Date })?.toDate?.() ?? new Date();
}

type FiltroEstado = 'todas' | 'confirmada' | 'anulada';

interface FiltrosVentas {
  producto: Producto | null;
  texto: string;
  monto: number | null;
  moneda: 'ARS' | 'USD';
  estado: FiltroEstado;
  facturacion: FiltroFacturacion;
}

const SIN_FILTROS: FiltrosVentas = {
  producto: null, texto: '', monto: null, moneda: 'ARS', estado: 'todas', facturacion: 'todas',
};

const MESES = [
  { value: '01', label: 'Enero' },
  { value: '02', label: 'Febrero' },
  { value: '03', label: 'Marzo' },
  { value: '04', label: 'Abril' },
  { value: '05', label: 'Mayo' },
  { value: '06', label: 'Junio' },
  { value: '07', label: 'Julio' },
  { value: '08', label: 'Agosto' },
  { value: '09', label: 'Septiembre' },
  { value: '10', label: 'Octubre' },
  { value: '11', label: 'Noviembre' },
  { value: '12', label: 'Diciembre' },
];

export function VentasPage() {
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<VentaCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [productoInput, setProductoInput] = useState('');
  const [producto, setProducto] = useState<Producto | null>(null);
  const [catalogoActivado, setCatalogoActivado] = useState(false);
  const [sugerenciasAbiertas, setSugerenciasAbiertas] = useState(false);
  const [montoInput, setMontoInput] = useState('');
  const [moneda, setMoneda] = useState<'ARS' | 'USD'>('ARS');
  const [aplicados, setAplicados] = useState<FiltrosVentas>(SIN_FILTROS);
  const [erroresFiltro, setErroresFiltro] = useState<{ producto?: string; monto?: string }>({});
  const { all, catMap, loading: loadingCatalog, error: catalogError } = useCatalog({ loadProducts: catalogoActivado });
  const solicitud = useRef(0);
  const [estado, setEstado] = useState<FiltroEstado>('todas');
  const [facturacion, setFacturacion] = useState<FiltroFacturacion>('todas');
  const [mesExportacion, setMesExportacion] = useState(() => monthKey(new Date()).slice(5));
  const [anioExportacion, setAnioExportacion] = useState(() => monthKey(new Date()).slice(0, 4));

  const cargarPagina = useCallback(async (filtros: FiltrosVentas, desde: VentaCursor | null, reemplazar: boolean, forzar = false) => {
    const actual = ++solicitud.current;
    if (reemplazar) {
      setLoading(true);
      setLoadingMore(false);
    }
    else setLoadingMore(true);
    try {
      const resultado = filtros.monto !== null
        ? await saleService.getByAmount(filtros.monto, filtros.moneda, forzar)
        : filtros.producto
          ? await saleService.getByProduct(filtros.producto.id, forzar)
          : filtros.texto || filtros.estado !== 'todas' || filtros.facturacion !== 'todas'
            ? await saleService.getAll(forzar)
            : await saleService.getPage(30, desde);
      if (actual !== solicitud.current) return;
      if (resultado.ok) {
        if (Array.isArray(resultado.data)) {
          setVentas(resultado.data);
          setCursor(null);
          setHasMore(false);
        } else {
          const pagina = resultado.data;
          setVentas((actuales) => reemplazar ? pagina.ventas : [...actuales, ...pagina.ventas]);
          setCursor(pagina.cursor);
          setHasMore(pagina.hasMore);
        }
        setError(null);
      } else {
        setError(resultado.error.message);
      }
    } catch {
      if (actual === solicitud.current) setError('No se pudieron cargar las ventas. Intentá nuevamente.');
    } finally {
      if (actual === solicitud.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  useEffect(() => {
    void cargarPagina(SIN_FILTROS, null, true);
    return () => { solicitud.current += 1; };
  }, [cargarPagina]);

  const candidatos = useMemo(() => {
    if (!productoInput.trim()) return [];
    return all.filter((p) => matchesSearch(productoInput, p.nombre, p.sku, catMap.get(p.categoriaId) ?? p.categoria));
  }, [productoInput, all, catMap]);

  const buscar = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const monto = montoInput.trim() === '' ? null : Number(montoInput);
    const errores: typeof erroresFiltro = {};
    if (productoInput.trim() && !producto) errores.producto = 'Seleccioná un producto de la lista.';
    if (monto !== null && (!Number.isFinite(monto) || monto < 0)) errores.monto = 'Ingresá un monto válido.';
    setErroresFiltro(errores);
    if (Object.keys(errores).length) return;
    const filtros: FiltrosVentas = { producto, texto: searchInput.trim(), monto, moneda, estado, facturacion };
    setAplicados(filtros);
    setSugerenciasAbiertas(false);
    void cargarPagina(filtros, null, true);
  };

  const limpiar = () => {
    setProducto(null);
    setProductoInput('');
    setSearchInput('');
    setMontoInput('');
    setMoneda('ARS');
    setEstado('todas');
    setFacturacion('todas');
    setErroresFiltro({});
    setSugerenciasAbiertas(false);
    setAplicados(SIN_FILTROS);
    void cargarPagina(SIN_FILTROS, null, true);
  };

  const lista = useMemo(() => {
    const term = aplicados.texto.toLowerCase();
    return ventas.filter(
      (v) =>
        (!aplicados.producto || v.items.some((item) => item.productId === aplicados.producto?.id)) &&
        (aplicados.monto === null || Math.round((aplicados.moneda === 'USD' ? v.pago?.usd : v.pago?.ars) * 100) === Math.round(aplicados.monto * 100)) &&
        (aplicados.estado === 'todas' || v.estado === aplicados.estado) &&
        coincideFiltroFacturacion(v.facturacion?.estado, aplicados.facturacion) &&
        (!term ||
          String(v.numero).includes(term) ||
          (v.cliente?.nombre ?? '').toLowerCase().includes(term)),
    );
  }, [ventas, aplicados]);

  const anios = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: currentYear - 2000 + 1 }, (_, index) => {
      const value = String(currentYear - index);
      return { value, label: value };
    });
  }, []);
  const periodoExportacion = `${anioExportacion}-${mesExportacion}`;

  const exportarCsv = async () => {
    setExportando(true);
    const resultado = await saleService.getByMonth(periodoExportacion);
    setExportando(false);
    if (!resultado.ok) {
      toast.error(resultado.error.message);
      return;
    }
    if (resultado.data.length === 0) {
      toast.message('No hay ventas en el mes seleccionado.');
      return;
    }
    const csv = exportarVentasCsv(resultado.data, periodoExportacion);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ventas-${periodoExportacion}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Ventas</h1>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => void cargarPagina(aplicados, null, true, true)} disabled={loading}>
            <RefreshCw size={16} aria-hidden="true" /> Actualizar
          </Button>
          <Link to="/adm/ventas/nueva">
            <Button>
              <Plus size={16} aria-hidden="true" /> Nueva venta
            </Button>
          </Link>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-md border border-line bg-surface p-3">
        <Select
          label="Mes para exportar"
          value={mesExportacion}
          onChange={(event) => setMesExportacion(event.target.value)}
          options={MESES}
          className="min-w-[150px]"
        />
        <Select
          label="Año"
          value={anioExportacion}
          onChange={(event) => setAnioExportacion(event.target.value)}
          options={anios}
          className="min-w-[110px]"
        />
        <Button variant="ghost" onClick={() => void exportarCsv()} loading={exportando} disabled={exportando}>
          <Download size={16} aria-hidden="true" /> Exportar mes seleccionado
        </Button>
        <p className="w-full text-xs text-text-soft">
          Incluye todas las ventas del mes, también las anuladas, sin depender de las páginas ni de los filtros visibles.
        </p>
      </div>

      <form onSubmit={buscar} className="mb-4 grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-12">
        <div className="relative min-w-0 lg:col-span-4">
          <Input
            id="venta-producto"
            label="Producto"
            aria-label="Buscar producto para filtrar ventas"
            placeholder="Nombre, SKU o categoría…"
            value={productoInput}
            loading={loadingCatalog}
            error={erroresFiltro.producto}
            role="combobox"
            aria-expanded={sugerenciasAbiertas && Boolean(productoInput.trim())}
            aria-controls="venta-productos"
            autoComplete="off"
            onFocus={() => { setCatalogoActivado(true); setSugerenciasAbiertas(true); }}
            onChange={(event) => { setProductoInput(event.target.value); setProducto(null); setSugerenciasAbiertas(true); }}
            onKeyDown={(event) => { if (event.key === 'Escape') setSugerenciasAbiertas(false); }}
          />
            {sugerenciasAbiertas && productoInput.trim() && (
              <div id="venta-productos" role="listbox" aria-label="Productos" className="absolute z-10 mt-1 max-h-80 w-full overflow-y-auto rounded-md border border-line bg-surface shadow-ti">
                {candidatos.map((p) => (
                  <button key={p.id} type="button" role="option" aria-selected={producto?.id === p.id} onClick={() => { setProducto(p); setProductoInput(p.nombre); setSugerenciasAbiertas(false); }} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2">
                    <span className="min-w-0 break-words">{p.nombre}</span>
                    <span className="shrink-0 text-text-soft">{p.monedaVenta === 'USD' ? 'USD' : 'ARS'} · stock {p.stock}</span>
                  </button>
                ))}
                {candidatos.length === 0 && <p className="p-3 text-sm text-text-soft">{loadingCatalog ? 'Buscando productos…' : catalogError || 'Sin productos coincidentes.'}</p>}
              </div>
            )}
        </div>
        <div className="min-w-0 lg:col-span-4">
          <Input id="venta-texto" label="N° o cliente" placeholder="Buscar por N° o cliente…" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} />
        </div>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_100px] gap-2 lg:col-span-4">
          <Input id="venta-monto" label="Monto cobrado" aria-label="Monto cobrado" type="number" min="0" step="0.01" inputMode="decimal" placeholder="Ej. 5700" value={montoInput} error={erroresFiltro.monto} onChange={(event) => setMontoInput(event.target.value)} />
          <Select id="venta-moneda" label="Moneda" value={moneda} onChange={(event) => setMoneda(event.target.value as 'ARS' | 'USD')} options={[{ value: 'ARS', label: 'ARS' }, { value: 'USD', label: 'USD' }]} />
        </div>
        <div className="min-w-0 lg:col-span-4">
          <Select id="venta-estado" label="Estado" value={estado} onChange={(event) => setEstado(event.target.value as FiltroEstado)} options={[{ value: 'todas', label: 'Todas' }, { value: 'confirmada', label: 'Confirmadas' }, { value: 'anulada', label: 'Anuladas' }]} />
        </div>
        <div className="min-w-0 lg:col-span-4">
          <Select id="venta-facturacion" label="Facturación" value={facturacion} onChange={(event) => setFacturacion(event.target.value as FiltroFacturacion)} options={[{ value: 'todas', label: 'Todas' }, { value: 'facturada', label: 'Facturadas' }, { value: 'sin_facturar', label: 'Sin facturar' }]} />
        </div>
        <div className="flex items-center gap-2 lg:col-span-4">
          <Button type="submit" loading={loading} disabled={loading}><Search size={16} aria-hidden="true" /> Buscar</Button>
          <Button type="button" variant="ghost" onClick={limpiar} disabled={loading} aria-label="Limpiar filtros" title="Limpiar filtros"><X size={16} aria-hidden="true" /></Button>
        </div>
      </form>

      {!loading && !error && !hasMore && <p aria-live="polite" className="mb-3 text-sm text-text-soft">{lista.length} venta(s){aplicados.producto ? ` · ${aplicados.producto.nombre}` : ''}{aplicados.monto !== null ? ` · Cobrado ${aplicados.moneda === 'USD' ? formatUsd(aplicados.monto) : formatMoney(aplicados.monto)}` : ''}</p>}

      {loading ? (
        <Spinner />
      ) : error ? (
        <EmptyState title="Error" description={error} />
      ) : lista.length === 0 ? (
        <EmptyState title={hasMore ? 'Sin coincidencias en esta página' : 'Sin ventas coincidentes'} description="No hay ventas con los filtros seleccionados." />
      ) : (
        <div className="flex flex-col gap-2">
          {lista.map((v) => (
            <Link key={v.id} to={`/adm/ventas/${v.id}`}>
              <Card className="flex items-center gap-4 p-3.5 transition-colors hover:border-line-strong">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-surface-2 text-sm font-bold">
                  #{v.numero}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{v.cliente?.nombre || 'Consumidor final'}</p>
                  <p className="text-sm text-text-soft">
                    {formatDate(ventaFecha(v), 'DD/MM/YYYY HH:mm')}
                    {v.pago?.medioArs ? ` · ${medioPagoLabel(v.pago.medioArs)}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold leading-tight">
                    {v.totalUsd > 0 && <span>{formatUsd(v.totalUsd)}</span>}
                    {v.totalUsd > 0 && (v.totalArs > 0 || (v.envio?.costo ?? 0) > 0) && <span className="text-text-faint"> · </span>}
                    {(v.totalArs > 0 || (v.envio?.costo ?? 0) > 0) && <span>{formatMoney(v.totalArs + (v.envio?.costo ?? 0))}</span>}
                  </p>
                  <div className="flex justify-end gap-1">
                    {v.estado === 'anulada' && <Badge tone="danger">Anulada</Badge>}
                    {v.facturacion?.estado === 'facturada' ? (
                      <Badge tone="success">Facturada</Badge>
                    ) : (
                      <Badge tone="neutral">Sin facturar</Badge>
                    )}
                  </div>
                </div>
                <ChevronRight size={18} className="shrink-0 text-text-faint" aria-hidden="true" />
              </Card>
            </Link>
          ))}
        </div>
      )}

      {!loading && !error && hasMore && (
        <div className="mt-4 flex flex-col items-center gap-2">
          <p className="text-xs text-text-soft">Mostrando búsqueda y filtros sobre las {ventas.length} ventas cargadas.</p>
          <Button variant="ghost" onClick={() => void cargarPagina(aplicados, cursor, false)} loading={loadingMore} disabled={loadingMore}>
            Cargar 30 ventas anteriores
          </Button>
        </div>
      )}
    </div>
  );
}
