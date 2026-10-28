import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Gift, Link2, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useCatalog } from '@/hooks/useCatalog';
import { useSearchInput } from '@/hooks/useSearchInput';
import { regaloService, type RegaloCursor } from '@/services/regaloService';
import { productService } from '@/services/productService';
import { saleService } from '@/services/saleService';
import { Card, CardBody } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { formatDate, formatPrice, matchesSearch, monthKey, toDate } from '@/lib/utils';
import type { Producto, Regalo, Venta } from '@/models';
import { Select } from '@/components/ui/Select';

interface LineaRegalo {
  producto: Producto;
  cantidad: number;
}

const MONTH_OPTIONS = [
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

export function RegalosPage() {
  const [ym, setYm] = useState(monthKey(new Date()));
  const [busquedaInput, setBusqueda, busqueda, searchPending] = useSearchInput();
  const [lineas, setLineas] = useState<LineaRegalo[]>([]);
  const [ventaNumero, setVentaNumero] = useState('');
  const [venta, setVenta] = useState<Venta | null>(null);
  const [buscandoVenta, setBuscandoVenta] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [regalos, setRegalos] = useState<Regalo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<RegaloCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const { all, catMap, loading: loadingCatalog } = useCatalog({ loadProducts: Boolean(busqueda.trim()) });
  const [year, month] = ym.split('-');
  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 6 }, (_, idx) => {
      const value = String(currentYear - idx);
      return { value, label: value };
    });
  }, []);

  const cargar = useCallback(async (desde: RegaloCursor | null, reemplazar: boolean) => {
    if (reemplazar) setLoading(true);
    else setLoadingMore(true);
    const resultado = await regaloService.getPage(30, ym, desde);
    if (resultado.ok) {
      setRegalos((actuales) => reemplazar ? resultado.data.regalos : [...actuales, ...resultado.data.regalos]);
      setCursor(resultado.data.cursor);
      setHasMore(resultado.data.hasMore);
      setError(null);
    } else setError(resultado.error.message);
    setLoading(false);
    setLoadingMore(false);
  }, [ym]);

  useEffect(() => { void cargar(null, true); }, [cargar]);

  const candidatos = useMemo(() => {
    const term = busqueda.trim();
    if (!term) return [];
    return all.filter((producto) =>
      producto.negocio === 'accesorios' &&
      !lineas.some((linea) => linea.producto.id === producto.id) &&
      matchesSearch(term, producto.nombre, producto.sku, catMap.get(producto.categoriaId) ?? producto.categoria),
    );
  }, [all, busqueda, catMap, lineas]);

  const agregar = (producto: Producto) => {
    setLineas((actuales) => [...actuales, { producto, cantidad: 1 }]);
    setBusqueda('');
  };

  const quitar = (id: string) => setLineas((actuales) => actuales.filter((linea) => linea.producto.id !== id));

  const vincularVenta = async () => {
    const numero = Number(ventaNumero);
    if (!Number.isInteger(numero) || numero <= 0) {
      setVenta(null);
      toast.error('Ingresá un número de venta válido.');
      return;
    }
    setBuscandoVenta(true);
    const resultado = await saleService.getByNumero(numero);
    setBuscandoVenta(false);
    if (!resultado.ok) {
      toast.error(resultado.error.message);
      return;
    }
    if (!resultado.data) {
      setVenta(null);
      toast.error(`No existe la venta #${numero}.`);
      return;
    }
    setVenta(resultado.data);
    toast.success(`Venta #${resultado.data.numero} vinculada.`);
  };

  const registrar = async () => {
    if (lineas.length === 0) {
      toast.error('Agregá al menos un accesorio.');
      return;
    }
    setGuardando(true);
    const input = {
      items: lineas.map((linea) => ({ productId: linea.producto.id, cantidad: linea.cantidad })),
      ...(venta ? { ventaId: venta.id, ventaNumero: venta.numero } : {}),
    };
    const resultado = editingId
      ? await regaloService.actualizar(editingId, input)
      : await regaloService.registrar(input);
    setGuardando(false);
    if (!resultado.ok) {
      toast.error(resultado.error.message);
      return;
    }
    toast.success(editingId ? 'Regalo actualizado y stock ajustado.' : 'Regalo registrado y stock descontado.');
    setLineas([]);
    setVenta(null);
    setVentaNumero('');
    setEditingId(null);
    await cargar(null, true);
  };

  const editar = async (regalo: Regalo) => {
    const productos = await Promise.all(regalo.items.map(async (item) => {
      const local = all.find((producto) => producto.id === item.productId);
      if (local) return local;
      const resultado = await productService.get(item.productId);
      return resultado.ok ? resultado.data : null;
    }));
    if (productos.some((producto) => !producto)) {
      toast.error('No se pudieron cargar todos los accesorios del regalo.');
      return;
    }
    setEditingId(regalo.id);
    setLineas(regalo.items.map((item, index) => ({ producto: productos[index] as Producto, cantidad: item.cantidad })));
    setVentaNumero(regalo.ventaNumero ? String(regalo.ventaNumero) : '');
    setVenta(null);
    if (regalo.ventaId) {
      const resultado = await saleService.get(regalo.ventaId);
      if (resultado.ok) setVenta(resultado.data);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelarEdicion = () => {
    setEditingId(null);
    setLineas([]);
    setVenta(null);
    setVentaNumero('');
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{editingId ? 'Editar regalo' : 'Regalos'}</h1>
          <p className="mt-1 text-sm text-text-soft">Registrá accesorios entregados sin cargo y controlá su costo.</p>
        </div>
        <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-3 sm:items-end">
          <Select label="Mes" value={month} onChange={(e) => setYm(`${year}-${e.target.value}`)} options={MONTH_OPTIONS} />
          <Select label="Año" value={year} onChange={(e) => setYm(`${e.target.value}-${month}`)} options={yearOptions} />
          <Button variant="ghost" size="sm" onClick={() => void cargar(null, true)} disabled={loading}>
            <RefreshCw size={15} aria-hidden="true" /> Actualizar
          </Button>
        </div>
      </div>

      <Card className="mb-5">
        <CardBody className="flex flex-col gap-4">
          <div className="relative">
            <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-soft" aria-hidden="true" />
            <Input
              label="Accesorio"
              placeholder="Buscar funda, vidrio, cargador…"
              value={busquedaInput}
              loading={searchPending || loadingCatalog}
              onChange={(e) => setBusqueda(e.target.value)}
              className="pl-9"
            />
            {candidatos.length > 0 && (
              <div className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-line bg-surface shadow-ti">
                {candidatos.map((producto) => (
                  <button key={producto.id} type="button" onClick={() => agregar(producto)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2">
                    <span className="truncate">{producto.nombre}</span>
                    <span className="shrink-0 text-text-soft">Stock {producto.stock}</span>
                  </button>
                ))}
              </div>
            )}
            {busqueda.trim() && loadingCatalog && candidatos.length === 0 && <p className="mt-1 text-xs text-text-soft">Cargando accesorios…</p>}
          </div>

          {lineas.length > 0 && (
            <div className="flex flex-col gap-2">
              {lineas.map((linea) => (
                <div key={linea.producto.id} className="flex flex-wrap items-center gap-2 rounded-md border border-line p-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{linea.producto.nombre}</span>
                  <span className="text-xs text-text-soft">Costo {formatPrice(linea.producto.costo, linea.producto.monedaVenta)}</span>
                  <input
                    type="number"
                    min={1}
                    max={linea.producto.stock}
                    value={linea.cantidad}
                    onChange={(e) => setLineas((actuales) => actuales.map((actual) => actual.producto.id === linea.producto.id ? { ...actual, cantidad: Math.max(1, Number(e.target.value) || 1) } : actual))}
                    className="h-9 w-16 rounded-md border border-line bg-surface-2 px-2 text-center text-sm"
                    aria-label={`Cantidad de ${linea.producto.nombre}`}
                  />
                  <button type="button" onClick={() => quitar(linea.producto.id)} aria-label={`Quitar ${linea.producto.nombre}`} className="text-text-soft hover:text-danger">
                    <Trash2 size={17} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-end gap-3 border-t border-line pt-4">
            <Input label="Venta asociada (opcional)" type="number" placeholder="N° de venta" value={ventaNumero} onChange={(e) => { setVentaNumero(e.target.value); setVenta(null); }} className="w-48" />
            <Button variant="ghost" onClick={() => void vincularVenta()} loading={buscandoVenta} disabled={!ventaNumero.trim() || buscandoVenta}>
              <Link2 size={15} aria-hidden="true" /> Vincular venta
            </Button>
            {venta && <p className="w-full text-sm text-success">Venta #{venta.numero} vinculada.</p>}
            <div className="ml-auto flex gap-2">
              {editingId && <Button variant="ghost" onClick={cancelarEdicion} disabled={guardando}>Cancelar</Button>}
              <Button onClick={registrar} loading={guardando} disabled={guardando || lineas.length === 0}>
                <Plus size={16} aria-hidden="true" /> {editingId ? 'Guardar cambios' : 'Registrar regalo'}
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {loading ? <Spinner /> : error ? <EmptyState title="Error" description={error} /> : regalos.length === 0 ? (
        <EmptyState icon={<Gift size={32} />} title="Sin regalos registrados" description="Los accesorios regalados aparecerán acá." />
      ) : (
        <div className="flex flex-col gap-2">
          {regalos.map((regalo) => (
            <Card key={regalo.id}>
              <CardBody className="flex flex-wrap items-center gap-3 p-3">
                <Gift size={18} className="text-info" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{regalo.items.map((item) => `${item.cantidad}× ${item.nombre}`).join(', ')}</p>
                  <p className="text-xs text-text-soft">{formatDate(toDate(regalo.creado), 'DD/MM/YYYY HH:mm')} · {regalo.ventaNumero && regalo.ventaId ? <Link to={`/adm/ventas/${regalo.ventaId}`} className="underline">Venta #{regalo.ventaNumero}</Link> : 'Sin venta asociada'}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => void editar(regalo)}>Editar</Button>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {!loading && !error && hasMore && (
        <div className="mt-4 flex justify-center">
          <Button variant="ghost" onClick={() => void cargar(cursor, false)} loading={loadingMore} disabled={loadingMore}>Cargar más regalos</Button>
        </div>
      )}
    </div>
  );
}