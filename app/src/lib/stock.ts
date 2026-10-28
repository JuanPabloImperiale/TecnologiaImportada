import type { Producto } from '@/models';

export function isLowStock(product: Partial<Producto> | null): boolean {
  const minimum = Number(product?.stockMinimo ?? 0);
  return product?.activo === true && minimum > 0 && Number(product.stock ?? 0) <= minimum;
}