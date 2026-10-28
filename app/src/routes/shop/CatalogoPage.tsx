import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Search, RefreshCw } from 'lucide-react';
import { productService, type ProductoCursor } from '@/services/productService';
import { useCategories } from '@/hooks/useCategories';
import { useSearchInput } from '@/hooks/useSearchInput';
import { ProductCard } from '@/components/shop/ProductCard';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { cn, matchesSearch, slugify } from '@/lib/utils';
import type { Categoria, Negocio, Producto } from '@/models';

type Unidad = Negocio | 'todos';

function parseUnidad(value: string | null): Unidad {
  return value === 'productos' || value === 'accesorios' || value === 'todos'
    ? value
    : 'todos';
}

export function CatalogoPage() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const { categories: productosCategorias } = useCategories('productos');
  const { categories: accesoriosCategorias } = useCategories('accesorios');
  const [products, setProducts] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<ProductoCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const categorias = useMemo<Categoria[]>(() => [...productosCategorias, ...accesoriosCategorias], [productosCategorias, accesoriosCategorias]);
  const catMap = useMemo(() => new Map(categorias.map((category) => [category.id, category.nombre])), [categorias]);

  const [searchInput, setSearch, search, searchPending] = useSearchInput(params.get('q') ?? '');
  const [unidad, setUnidad] = useState<Unidad>(() => parseUnidad(params.get('unidad')));
  // State holds the category document ID (empty = all)
  const [categoriaId, setCategoriaId] = useState(params.get('categoriaId') ?? '');

  const cargarPagina = useCallback(async (desde: ProductoCursor | null, reemplazar: boolean) => {
    if (reemplazar) setLoading(true);
    else setLoadingMore(true);
    const resultado = await productService.getActivePage(16, desde);
    if (resultado.ok) {
      setProducts((actuales) => reemplazar ? resultado.data.products : [...actuales, ...resultado.data.products]);
      setCursor(resultado.data.cursor);
      setHasMore(resultado.data.hasMore);
      setError(null);
    } else {
      setError(resultado.error.message);
    }
    setLoading(false);
    setLoadingMore(false);
  }, []);

  useEffect(() => {
    if (search.trim() || categoriaId) return;
    void cargarPagina(null, true);
  }, [cargarPagina, search, categoriaId]);

  useEffect(() => {
    const term = search.trim();
    if (!term && !categoriaId) return;
    let active = true;
    setLoading(true);
    void productService.searchAll({ soloActivos: true }).then((resultado) => {
      if (!active) return;
      if (resultado.ok) {
        setProducts(resultado.data);
        setCursor(null);
        setHasMore(false);
        setError(null);
      } else setError(resultado.error.message);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [search, categoriaId]);

  // Categories are independent of the products loaded in the current pages.
  const categoriasUnidad = useMemo(() => {
    return unidad === 'todos' ? categorias : categorias.filter((category) => category.negocio === unidad);
  }, [categorias, unidad]);

  // /categoria/:slug → resolve category ID from slug
  useEffect(() => {
    if (slug && categorias.length) {
      const match = categorias.find((c) => slugify(c.nombre) === slug);
      setCategoriaId(match?.id ?? '');
    }
  }, [slug, categorias]);

  const cambiarUnidad = (u: Unidad) => {
    setUnidad(u);
    setCategoriaId('');
  };

  const filtered = useMemo(() => {
    return products.filter(
      (p) =>
        (unidad === 'todos' || p.negocio === unidad) &&
        (!categoriaId || p.categoriaId === categoriaId) &&
        matchesSearch(search, p.nombre, p.descripcion, catMap.get(p.categoriaId) ?? p.categoria),
    );
  }, [products, unidad, categoriaId, search, catMap]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3 text-center">
        {/* Buscador */}
        <div className="relative mt-2 w-full max-w-md">
          <Search
            size={17}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-soft"
            aria-hidden="true"
          />
          <Input
            placeholder="Buscar productos…"
            value={searchInput}
            loading={searchPending || loading}
            onChange={(e) => {
              const value = e.target.value;
              setSearch(value);
            }}
            className="pl-9"
          />
        </div>

        {/* División principal: Todos / Productos / Accesorios */}
        <div className="inline-flex w-full max-w-md rounded-pill border border-line bg-surface-2 p-1 sm:w-auto">
          {(['todos', 'productos', 'accesorios'] as Unidad[]).map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => cambiarUnidad(u)}
              className={cn(
                'flex-1 rounded-pill px-5 py-2 text-sm font-bold capitalize transition-colors sm:flex-none',
                unidad === u ? 'bg-accent text-on-accent' : 'text-text-soft hover:text-text',
              )}
            >
              {u}
            </button>
          ))}
        </div>
      </div>

      {/* Categorías de la unidad elegida */}
      {categoriasUnidad.length > 0 && (
        <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          <div className="flex min-w-max gap-2 sm:min-w-0 sm:flex-wrap sm:justify-center">
            <button
              type="button"
              onClick={() => {
                setCategoriaId('');
              }}
              className={cn(
                'whitespace-nowrap rounded-pill border px-4 py-1.5 text-sm font-medium transition-colors',
                !categoriaId
                  ? 'border-transparent bg-accent text-on-accent'
                  : 'border-line bg-surface-2 text-text-soft hover:text-text',
              )}
            >
              Todas
            </button>
            {categoriasUnidad.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoriaId(c.id)}
                className={cn(
                  'whitespace-nowrap rounded-pill border px-4 py-1.5 text-sm font-medium transition-colors',
                  categoriaId === c.id
                    ? 'border-transparent bg-accent text-on-accent'
                    : 'border-line bg-surface-2 text-text-soft hover:text-text',
                )}
              >
                {c.nombre}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : error ? (
        <EmptyState title="Error" description={error} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Sin resultados"
          description="No encontramos productos con esos filtros."
        />
      ) : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {filtered.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
          <p className="text-center text-xs text-text-soft">La búsqueda revisa todos los productos activos.</p>
        </div>
      )}
      {!loading && !error && hasMore && !search.trim() && (
        <div className="flex justify-center">
          <Button variant="ghost" onClick={() => void cargarPagina(cursor, false)} loading={loadingMore} disabled={loadingMore}>
            <RefreshCw size={15} aria-hidden="true" /> Cargar más productos
          </Button>
        </div>
      )}
    </div>
  );
}
