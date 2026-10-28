import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { contactService, type Contacto } from '@/services/contactService';
import { ClienteSelector } from './ClienteSelector';

vi.mock('@/services/contactService', () => ({ contactService: { search: vi.fn() } }));

const contacto: Contacto = { id: '123', nombre: 'Ana', celular: '123', cantidadPedidos: 0, cantidadVentas: 1, cantidadCuentas: 0 };
let renderer: ReactTestRenderer;
const onChange = vi.fn();

async function montar() {
  await act(async () => { renderer = create(<ClienteSelector cliente={{ nombre: '', celular: '' }} onChange={onChange} />); });
}

function escribir(value: string) {
  act(() => renderer.root.findByProps({ placeholder: 'Buscar contacto por nombre o celular…' }).props.onChange({ target: { value } }));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.mocked(contactService.search).mockResolvedValue({ ok: true, data: [contacto] });
});

afterEach(() => {
  act(() => renderer.unmount());
  vi.useRealTimers();
});

describe('ClienteSelector', () => {
  it('busca automaticamente una sola vez despues de terminar de escribir', async () => {
    await montar();
    escribir('an');
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    escribir('ana');
    await act(async () => { await vi.advanceTimersByTimeAsync(1_199); });
    expect(contactService.search).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(contactService.search).toHaveBeenCalledOnce();
    expect(contactService.search).toHaveBeenCalledWith('ana');
    expect(JSON.stringify(renderer.toJSON())).toContain('Ana');
    await act(async () => {
      renderer.root.findAllByType('button').find((node) => node.findAllByType('p').some((child) => child.children.includes('Ana')))!.props.onClick();
    });
    expect(onChange).toHaveBeenCalledWith({ nombre: 'Ana', celular: '123', cuitDni: undefined });
    expect(renderer.root.findByProps({ placeholder: 'Buscar contacto por nombre o celular…' }).props.value).toBe('');
  });

  it('descarta respuestas antiguas cuando hay otra busqueda en curso', async () => {
    let resolve!: (value: Awaited<ReturnType<typeof contactService.search>>) => void;
    vi.mocked(contactService.search).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    vi.mocked(contactService.search).mockResolvedValue({ ok: true, data: [{ ...contacto, nombre: 'Bea' }] });
    await montar();
    escribir('ana');
    await act(async () => { await vi.advanceTimersByTimeAsync(1_200); });
    escribir('bea');
    await act(async () => { await vi.advanceTimersByTimeAsync(1_200); });
    await act(async () => { resolve({ ok: true, data: [contacto] }); });
    expect(JSON.stringify(renderer.toJSON())).toContain('Bea');
    expect(JSON.stringify(renderer.toJSON())).not.toContain('Ana');
  });

  it('borrar cancela la busqueda pendiente sin consultar', async () => {
    await montar();
    escribir('ana');
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    escribir('');
    await act(async () => { await vi.advanceTimersByTimeAsync(1_200); });
    expect(contactService.search).not.toHaveBeenCalled();
  });
});