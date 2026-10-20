import type { Venta } from '@/models';
import { formatMoney, formatUsd, formatPrice, formatDate } from './utils';
import { medioPagoLabel } from './mediosPago';

/**
 * Abre una ventana con el comprobante listo para imprimir o "Guardar como PDF".
 * No es factura legal (eso se emite en ARCA).
 */
export function printComprobante(venta: Venta, nombreNegocio: string) {
  const fecha = (venta.creado as unknown as { toDate?: () => Date })?.toDate?.() ?? new Date();

  const filas = venta.items
    .map((i) => {
      const bonif = i.tipo === 'bonificacion';
      const importe = bonif ? '—' : formatPrice(i.precioUnitario * i.cantidad, i.moneda);
      return `<tr>
        <td>${i.cantidad}× ${escapeHtml(i.nombre)}${bonif ? ' <em>(Bonificación)</em>' : ''}</td>
        <td class="r">${importe}</td>
      </tr>`;
    })
    .join('');

  const d = venta.descuento;
  const descuentoFilas =
    d && d.montoArs > 0
      ? `<tr><td>Subtotal en pesos</td><td class="r">${formatMoney(venta.totalArs + d.montoArs)}</td></tr>` +
        `<tr><td>Descuento (${d.porcentaje}%)</td><td class="r">−${formatMoney(d.montoArs)}</td></tr>`
      : '';

  const totales =
    (venta.totalUsd > 0 ? `<tr class="total"><td>Total en dólares</td><td class="r">${formatUsd(venta.totalUsd)}</td></tr>` : '') +
    descuentoFilas +
    (venta.totalArs > 0 || venta.envio?.costo
      ? `<tr class="total"><td>Total en pesos</td><td class="r">${formatMoney(venta.totalArs + (venta.envio?.costo ?? 0))}</td></tr>`
      : '');

  const p = venta.pago;
  const pagoTxt =
    `${p?.usd ? `US$ ${p.usd} en efectivo` : ''}` +
    `${p?.usd && p?.ars ? ' + ' : ''}` +
    `${p?.ars ? `${formatMoney(p.ars)} (${escapeHtml(medioPagoLabel(p.medioArs))})` : ''}`;

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
  <title>Comprobante #${venta.numero}</title>
  <style>
    *{font-family:Helvetica,Arial,sans-serif;color:#171717}
    body{max-width:380px;margin:24px auto;padding:0 16px}
    h1{font-size:20px;margin:0}
    .muted{color:#6b6a64;font-size:13px}
    table{width:100%;border-collapse:collapse;margin-top:14px;font-size:14px}
    td{padding:6px 0;border-bottom:1px solid #eee}
    .r{text-align:right}
    .total td{font-weight:800;border-top:2px solid #171717;border-bottom:none;padding-top:10px}
    .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #171717;padding-bottom:10px}
    .foot{margin-top:18px;font-size:12px;color:#6b6a64;text-align:center}
    @page{size:letter;margin:14mm}
    @media print{
      body{width:100%;max-width:none;margin:0;padding:0;font-size:12pt}
      h1{font-size:24pt}
      .muted{font-size:11pt}
      table{font-size:12pt;margin-top:18px}
      td{padding:9px 0}
      .total td{padding-top:12px}
      .foot{font-size:10pt;margin-top:24px}
    }
  </style></head><body>
    <div class="head">
      <div><h1>${escapeHtml(nombreNegocio || 'Tecnología Importada')}</h1><div class="muted">Comprobante de venta</div></div>
      <div class="r"><strong>#${venta.numero}</strong><div class="muted">${formatDate(fecha, 'DD/MM/YYYY HH:mm')}</div></div>
    </div>
    ${venta.cliente?.nombre ? `<p class="muted">Cliente: ${escapeHtml(venta.cliente.nombre)}${venta.cliente.celular ? ' · ' + escapeHtml(venta.cliente.celular) : ''}</p>` : ''}
    <table>${filas}</table>
    <table>${totales}</table>
    <p class="muted" style="margin-top:12px">Cobro: ${pagoTxt || '—'} · ${venta.envio?.metodo === 'envio' ? 'Envío' : 'Retiro en local'}</p>
    <div class="foot">Comprobante interno · no es factura legal.<br>¡Gracias por tu compra!</div>
    <script>window.onload=function(){window.print()}</script>
  </body></html>`;

  const w = window.open('', '_blank', 'width=420,height=680');
  if (!w) return;
  w.document.write(html);
  w.document.close();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
