import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { productService } from '@/services/productService';
import { CatalogoPage } from './CatalogoPage';

vi.mock('@/services/productService', () => ({ productService: { getActivePage: vi.fn(), searchAll: vi.fn() } }));
vi.mock('@/hooks/useCategories', () => {
  const categories = [{ id: 'audio', nombre: 'Audio', slug: 'audio', negocio: 'productos', orden: 0 }];
  const empty: never[] = [];
  return { useCategories: (negocio: string) => ({ categories: negocio === 'productos' ? categories : empty }) };
});
vi.mock('@/components/shop/ProductCard', () => ({ ProductCard: () => null }));

let renderer: ReactTestRenderer;

async function montar(path = '/catalogo') {
  await act(async () => { renderer = create(<MemoryRouter initialEntries={[path]}><CatalogoPage /></MemoryRouter>); });
}

async function buscar(value: string) {
  await act(async () => {
    renderer.root.findByProps({ placeholder: 'Buscar productos…' }).props.onChange({ target: { value } });
  });
  await act(async () => { await vi.advanceTimersByTimeAsync(1_200); });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', { setTimeout, clearTimeout });
  vi.clearAllMocks();
  vi.mocked(productService.getActivePage).mockResolvedValue({ ok: true, data: { products: [], cursor: null, hasMore: false } });
  vi.mocked(productService.searchAll).mockResolvedValue({ ok: true, data: [] });
});

afterEach(() => {
  if (renderer) act(() => renderer.unmount());
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('CatalogoPage: consultas sin duplicación', () => {
  it('no consulta por cada tecla y espera 1.2 segundos desde la ultima escritura', async () => {
    await montar();
    const cambiarTexto = (value: string) => renderer.root.findByProps({ placeholder: 'Buscar productos…' }).props.onChange({ target: { value } });
    act(() => cambiarTexto('ca'));
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    act(() => cambiarTexto('cable'));
    await act(async () => { await vi.advanceTimersByTimeAsync(1_199); });
    expect(productService.searchAll).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(productService.searchAll).toHaveBeenCalledOnce();
  });

  it('carga una sola página al borrar una búsqueda', async () => {
    await montar();
    expect(productService.getActivePage).toHaveBeenCalledOnce();
    await buscar('cable');
    expect(productService.searchAll).toHaveBeenCalledOnce();
    await buscar('');
    expect(productService.getActivePage).toHaveBeenCalledTimes(2);
  });

  it('no carga páginas sin filtro si ya hay una categoría seleccionada', async () => {
    await montar('/catalogo?categoriaId=audio');
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    expect(productService.getActivePage).not.toHaveBeenCalled();
    expect(productService.searchAll).toHaveBeenCalledOnce();
    await buscar('cable');
    await buscar('');
    expect(productService.getActivePage).not.toHaveBeenCalled();
  });

  it('carga una sola página al quitar la categoría', async () => {
    await montar('/catalogo?categoriaId=audio');
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    await act(async () => {
      renderer.root.findAllByType('button').find((node) => node.children.includes('Todas'))!.props.onClick();
    });
    expect(productService.getActivePage).toHaveBeenCalledOnce();
  });
});