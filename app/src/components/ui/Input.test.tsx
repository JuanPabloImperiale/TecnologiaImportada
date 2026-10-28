import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Input } from './Input';

describe('Input: indicador de busqueda', () => {
  it('muestra un icono accesible y reserva espacio sin bloquear la escritura', () => {
    const html = renderToStaticMarkup(<Input loading value="iphone" readOnly aria-label="Producto" />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="Buscando"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('animate-spin');
    expect(html).toContain('pr-11');
    expect(html).not.toContain('disabled');
  });

  it('no muestra el indicador cuando no hay busqueda pendiente', () => {
    const html = renderToStaticMarkup(<Input aria-label="Producto" />);
    expect(html).not.toContain('role="status"');
    expect(html).not.toContain('aria-busy="true"');
  });

  it('mantiene separado el control de contraseña si se usa loading', () => {
    const html = renderToStaticMarkup(<Input type="password" loading />);
    expect(html).toContain('right-12');
    expect(html).toContain('pr-20');
    expect(html).toContain('Mostrar contraseña');
  });
});