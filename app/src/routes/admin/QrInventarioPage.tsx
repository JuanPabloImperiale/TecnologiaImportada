import { useCallback, useEffect, useMemo, useState } from 'react';
import { Printer, QrCode, Search, RefreshCw } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { productService, type ProductoCursor } from '@/services/productService';
import { useCategories } from '@/hooks/useCategories';
import { useSearchInput } from '@/hooks/useSearchInput';
import { QR_LABELS_PER_PAGE } from '@/components/admin/QrLabelSheet';
import { useQrPrint } from '@/hooks/useQrPrint';
import { UnitTabs } from '@/components/admin/UnitTabs';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { matchesSearch, productPublicUrl } from '@/lib/utils';
import type { Categoria, Negocio, Producto } from '@/models';

/** Etiquetas QR por producto para imprimir y pegar en el local. Solo productos activos. */
export function QrInventarioPage() {
  const { categories: categoriasProductos } = useCategories('productos');
  const { categories: categoriasAccesorios } = useCategories('accesorios');
  const categorias = useMemo<Categoria[]>(() => [...categoriasProductos, ...categoriasAccesorios], [categoriasProductos, categoriasAccesorios]);
  const catMap = useMemo(() => new Map(categorias.map((category) => [category.id, category.nombre])), [categorias]);
  const { print, sheet } = useQrPrint();
  const [all, setAll] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<ProductoCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [negocio, setNegocio] = useState<Negocio>('productos');
  const [categoriaId, setCategoriaId] = useState('');
  const [searchInput, setQ, q, searchPending] = useSearchInput();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedItems, setSelectedItems] = useState<Map<string, Producto>>(new Map());

  const cargarPagina = useCallback(async (desde: ProductoCursor | null, reemplazar: boolean) => {
    if (reemplazar) setLoading(true);
    else setLoadingMore(true);
    const result = await productService.getActivePage(30, desde);
    if (result.ok) {
      setAll((actuales) => reemplazar ? result.data.products : [...actuales, ...result.data.products]);
      setCursor(result.data.cursor);
      setHasMore(result.data.hasMore);
      setError(null);
    } else {
      setError(result.error.message);
    }
    setLoading(false);
    setLoadingMore(false);
  }, []);

  useEffect(() => {
    if (!q.trim() && !categoriaId) void cargarPagina(null, true);
  }, [cargarPagina, q, categoriaId]);

  useEffect(() => {
    const term = q.trim();
    if (!term && !categoriaId) return;
    let active = true;
    setLoading(true);
    void productService.searchAll({ soloActivos: true }).then((result) => {
      if (!active) return;
      if (result.ok) {
        setAll(result.data);
        setCursor(null);
        setHasMore(false);
        setError(null);
      } else setError(result.error.message);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [q, categoriaId]);

  const categoriasUnidad = useMemo(() => {
    return categorias.filter((category) => category.negocio === negocio);
  }, [categorias, negocio]);

  const filtered = useMemo(
    () =>
      all
        .filter(
          (p) =>
            p.negocio === negocio &&
            (!categoriaId || p.categoriaId === categoriaId || matchesSearch(catMap.get(categoriaId) ?? '', p.categoria, catMap.get(p.categoriaId))) &&
            matchesSearch(q, p.nombre, p.sku, catMap.get(p.categoriaId) ?? p.categoria),
        )
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [all, negocio, categoriaId, q, catMap],
  );

  const toggle = (id: string) => {
    const product = all.find((item) => item.id === id);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSelectedItems((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else if (product) next.set(id, product);
      return next;
    });
  };

  const allFilteredSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.id));
  const toggleAllFiltered = () =>
  {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const p of filtered) {
        if (allFilteredSelected) next.delete(p.id);
        else next.add(p.id);
      }
      return next;
    });
    setSelectedItems((prev) => {
      const next = new Map(prev);
      for (const product of filtered) {
        if (allFilteredSelected) next.delete(product.id);
        else next.set(product.id, product);
      }
      return next;
    });
  }

  // Keep item snapshots so selection survives paging, filters, and refreshes.
  const selectedProducts = useMemo(
    () => [...selectedItems.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [selectedItems],
  );
  const hojas = Math.ceil(selectedProducts.length / QR_LABELS_PER_PAGE);

  const cambiarUnidad = (n: Negocio) => {
    setNegocio(n);
    setCategoriaId('');
  };

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">QR Inventario</h1>
          <p className="mt-1 text-sm text-text-soft">
            Imprimí etiquetas QR ({QR_LABELS_PER_PAGE} por hoja A4). Al escanearlas se abre la ficha
            pública del producto con su precio actualizado.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => void cargarPagina(null, true)} disabled={loading}>
            <RefreshCw size={15} aria-hidden="true" /> Actualizar
          </Button>
          <UnitTabs value={negocio} onChange={cambiarUnidad} />
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_240px]">
        <div className="relative">
          <Search
            size={17}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-soft"
            aria-hidden="true"
          />
          <Input
            placeholder="Buscar por nombre, SKU o categoría…"
            value={searchInput}
            loading={searchPending || loading}
            onChange={(e) => {
              const value = e.target.value;
              setQ(value);
            }}
            className="pl-9"
          />
        </div>
        <Select
          aria-label="Categoría"
          value={categoriaId}
          onChange={(e) => {
            const value = e.target.value;
            setCategoriaId(value);
          }}
          placeholder="Todas las categorías"
          options={categoriasUnidad.map((c) => ({ value: c.id, label: c.nombre }))}
        />
      </div>

      <div className="sticky top-0 z-10 mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface p-3 shadow-ti">
        <Button variant="ghost" size="sm" onClick={toggleAllFiltered} disabled={filtered.length === 0}>
          {allFilteredSelected ? 'Quitar selección visible' : `Seleccionar los ${filtered.length} visibles`}
        </Button>
        {selected.size > 0 && (
          <Button variant="ghost" size="sm" onClick={() => { setSelected(new Set()); setSelectedItems(new Map()); }}>
            Limpiar selección
          </Button>
        )}
        <span className="text-sm text-text-soft">
          {selectedProducts.length} seleccionados
          {hojas > 0 && ` · ${hojas} ${hojas === 1 ? 'hoja' : 'hojas'}`}
        </span>
        <Button
          size="sm"
          className="ml-auto"
          disabled={selectedProducts.length === 0}
          onClick={() => print(selectedProducts.map((p) => ({ id: p.id, nombre: p.nombre })))}
        >
          <Printer size={16} aria-hidden="true" /> Imprimir seleccionados
        </Button>
      </div>
      <p className="mb-3 text-xs text-text-soft">La búsqueda revisa todos los productos activos. Conservamos la selección al cambiar de página o unidad.</p>

      {loading ? (
        <Spinner />
      ) : error ? (
        <EmptyState title="Error" description={error} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<QrCode size={32} />}
          title="Sin productos"
          description={q || categoriaId ? 'Probá con otra búsqueda o categoría.' : 'No hay productos activos en esta unidad.'}
        />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => {
            const checked = selected.has(p.id);
            return (
              <Card key={p.id} className={checked ? 'border-line-strong' : undefined}>
                <label className="flex cursor-pointer items-center gap-3 p-3">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(p.id)}
                    className="h-4 w-4 shrink-0 accent-[var(--ti-accent)]"
                  />
                  <div className="shrink-0 rounded bg-white p-1">
                    <QRCodeSVG value={productPublicUrl(p.id)} size={48} level="M" marginSize={0} />
                  </div>
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-sm font-medium">{p.nombre}</p>
                    <p className="truncate text-xs text-text-soft">
                      {catMap.get(p.categoriaId) ?? p.categoria ?? 'Sin categoría'}
                    </p>
                  </div>
                </label>
              </Card>
            );
          })}
        </div>
      )}

      {!loading && !error && hasMore && (
        <div className="mt-4 flex justify-center">
          <Button variant="ghost" onClick={() => void cargarPagina(cursor, false)} loading={loadingMore} disabled={loadingMore}>
            <RefreshCw size={15} aria-hidden="true" /> Cargar 30 productos más
          </Button>
        </div>
      )}

      {sheet}
    </div>
  );
}
