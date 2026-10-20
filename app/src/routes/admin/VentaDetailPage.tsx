import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Printer, Ban, FileText } from 'lucide-react';
import { saleService } from '@/services/saleService';
import { regaloService } from '@/services/regaloService';
import { settingsService } from '@/services/settingsService';
import { printComprobante } from '@/lib/comprobante';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/Modal';
import { formatMoney, formatUsd, formatPrice, formatDate } from '@/lib/utils';
import { medioPagoLabel } from '@/lib/mediosPago';
import type { Regalo, Venta } from '@/models';

export function VentaDetailPage() {
  const { id } = useParams();
  const [venta, setVenta] = useState<Venta | null>(null);
  const [loading, setLoading] = useState(true);
  const [nombreNegocio, setNombreNegocio] = useState('Tecnología Importada');

  const [confirmAnular, setConfirmAnular] = useState(false);
  const [anulando, setAnulando] = useState(false);
  const [nroFacturaC, setNroFacturaC] = useState('');
  const [cae, setCae] = useState('');
  const [facturando, setFacturando] = useState(false);
  const [regalos, setRegalos] = useState<Regalo[]>([]);

  const load = useCallback(async () => {
    if (!id) return;
    const res = await saleService.get(id);
    setVenta(res.ok ? res.data : null);
    const regalosRes = await regaloService.getByVenta(id);
    if (regalosRes.ok) setRegalos(regalosRes.data);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
    settingsService.get().then((s) => s.nombreNegocio && setNombreNegocio(s.nombreNegocio));
  }, [load]);

  const anular = async () => {
    if (!venta) return;
    setAnulando(true);
    const res = await saleService.anular(venta.id);
    setAnulando(false);
    setConfirmAnular(false);
    if (res.ok) {
      toast.success('Venta anulada. Stock reintegrado.');
      void load();
    } else toast.error(res.error.message);
  };

  const marcarFacturada = async () => {
    if (!venta) return;
    if (!nroFacturaC.trim()) {
      toast.error('Ingresá el N° de Factura C.');
      return;
    }
    setFacturando(true);
    const res = await saleService.registrarFactura(venta.id, nroFacturaC.trim(), cae.trim());
    setFacturando(false);
    if (res.ok) {
      toast.success('Factura registrada.');
      void load();
    } else toast.error(res.error.message);
  };

  if (loading) return <Spinner />;
  if (!venta) {
    return (
      <EmptyState
        title="Venta no encontrada"
        action={
          <Link to="/adm/ventas">
            <Button variant="ghost">Volver a ventas</Button>
          </Link>
        }
      />
    );
  }

  const fecha = (venta.creado as unknown as { toDate?: () => Date })?.toDate?.() ?? new Date();
  const margenUsd = venta.totalUsd - venta.costoUsd;
  const margenArs = venta.totalArs - venta.costoArs;
  const facturada = venta.facturacion?.estado === 'facturada';
  const p = venta.pago;

  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/adm/ventas" className="mb-4 inline-flex items-center gap-1.5 text-sm text-text-soft hover:text-text">
        <ArrowLeft size={16} aria-hidden="true" /> Volver a ventas
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Venta #{venta.numero}</h1>
          <p className="text-sm text-text-soft">{formatDate(fecha, 'DD/MM/YYYY HH:mm')}</p>
        </div>
        <div className="flex gap-1.5">
          {venta.estado === 'anulada' && <Badge tone="danger">Anulada</Badge>}
          <Badge tone={facturada ? 'success' : 'neutral'}>{facturada ? 'Facturada' : 'Sin facturar'}</Badge>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        <Card>
          <CardBody className="flex flex-col gap-3">
            {(venta.cliente?.nombre || venta.cliente?.celular || venta.cliente?.cuitDni) && (
              <div className="border-b border-line pb-3 text-sm">
                <p className="font-semibold">Cliente</p>
                <p>{venta.cliente?.nombre || 'Nombre no registrado'}</p>
                {venta.cliente?.celular && <p className="text-text-soft">Celular: {venta.cliente.celular}</p>}
                {venta.cliente?.cuitDni && <p className="text-text-soft">CUIT/DNI: {venta.cliente.cuitDni}</p>}
              </div>
            )}
            <table className="w-full text-sm">
              <tbody>
                {venta.items.map((i, idx) => (
                  <tr key={idx} className="border-b border-line">
                    <td className="py-2">
                      {i.cantidad}× {i.nombre} <span className="text-text-faint">({i.moneda})</span>
                      {i.tipo === 'bonificacion' && <span className="ml-1 text-info">(Bonificación)</span>}
                      <span className="block text-xs text-text-soft">
                        Costo: {formatPrice(i.costoUnitario * i.cantidad, i.moneda)}
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      {i.tipo === 'bonificacion' ? 'Bonificación · $0' : formatPrice(i.precioUnitario * i.cantidad, i.moneda)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-text-soft">
              Canal: {venta.canal === 'whatsapp' ? 'WhatsApp' : 'Presencial'} · Unidad: {venta.negocio} · Registró: {venta.vendedorId || 'No disponible'}
            </p>
            <div className="flex flex-col gap-1 text-sm text-text-soft">
              {venta.totalUsd > 0 && <Row label="Total en dólares" value={formatUsd(venta.totalUsd)} />}
              {venta.descuento && venta.descuento.montoArs > 0 && (
                <>
                  <Row label="Subtotal en pesos" value={formatMoney(venta.totalArs + venta.descuento.montoArs)} />
                  <Row label={`Descuento (${venta.descuento.porcentaje}%)`} value={`−${formatMoney(venta.descuento.montoArs)}`} />
                </>
              )}
              {(venta.totalArs > 0 || (venta.envio?.costo ?? 0) > 0) && (
                <Row label={`Total en pesos${(venta.envio?.costo ?? 0) > 0 ? ' (con envío)' : ''}`} value={formatMoney(venta.totalArs + (venta.envio?.costo ?? 0))} />
              )}
            </div>
            <div className="rounded-md bg-surface-2 p-3 text-sm text-text-soft">
              <p>
                <span className="font-medium text-text">Cobro:</span>{' '}
                {p?.usd ? `US$ ${p.usd} efectivo` : ''}
                {p?.usd && p?.ars ? ' + ' : ''}
                {p?.ars ? `${formatMoney(p.ars)} (${medioPagoLabel(p.medioArs)})` : ''}
                {p?.tipoCambio ? ` · dólar a ${p.tipoCambio}` : ''}
              </p>
              <p className="mt-1">
                {venta.envio?.metodo === 'envio' ? 'Envío' : 'Retiro en local'} · Margen:{' '}
                {venta.totalUsd > 0 && <span className="font-bold text-success">{formatUsd(margenUsd)}</span>}
                {venta.totalUsd > 0 && (venta.totalArs > 0 || venta.costoArs > 0) && ' · '}
                {(venta.totalArs > 0 || venta.costoArs > 0) && <span className="font-bold text-success">{formatMoney(margenArs)}</span>}
              </p>
            </div>
            {venta.cuentaCobrarId && (
              <Link to={`/adm/cuentas-a-cobrar/${venta.cuentaCobrarId}`} className="text-sm font-medium underline">
                Ver cuenta a cobrar y pagos parciales
              </Link>
            )}
          </CardBody>
        </Card>

        {regalos.length > 0 && (
          <Card>
            <CardBody className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-bold">Regalos asociados</h2>
                <Link to="/adm/regalos" className="text-sm font-medium underline">Ver regalos</Link>
              </div>
              <div className="flex flex-col gap-2 text-sm">
                {regalos.flatMap((regalo) => regalo.items.map((item, index) => (
                  <div key={`${regalo.id}-${index}`} className="flex justify-between border-t border-line pt-2">
                    <span>{item.cantidad}× {item.nombre}</span>
                    <span className="text-text-soft">Costo {formatPrice(item.costoUnitario * item.cantidad, item.moneda)}</span>
                  </div>
                )))}
              </div>
            </CardBody>
          </Card>
        )}

        {venta.pagosDetalle && venta.pagosDetalle.length > 0 && (
          <Card>
            <CardBody className="flex flex-col gap-3">
              <h2 className="text-base font-bold">Historial de pagos parciales</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead><tr className="text-text-soft"><th className="py-2 pr-3">Fecha</th><th className="py-2 pr-3">Importe</th><th className="py-2 pr-3">Medio</th><th className="py-2">Registró</th></tr></thead>
                  <tbody>{venta.pagosDetalle.map((pago, index) => (
                    <tr key={`${index}-${pago.fecha.toMillis()}`} className="border-t border-line">
                      <td className="py-2 pr-3">{formatDate(pago.fecha.toDate())}</td>
                      <td className="py-2 pr-3 font-medium">{formatPrice(pago.monto, pago.moneda)}</td>
                      <td className="py-2 pr-3">{medioPagoLabel(pago.medio)}</td>
                      <td className="py-2">{pago.registradoPor}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => printComprobante(venta, nombreNegocio)}>
            <Printer size={16} aria-hidden="true" /> Imprimir comprobante
          </Button>
          {venta.estado === 'confirmada' && (
            <Button variant="ghost" onClick={() => setConfirmAnular(true)}>
              <Ban size={16} aria-hidden="true" /> Anular venta
            </Button>
          )}
        </div>

        {/* Facturación manual (Factura C - ARCA) */}
        <Card>
          <CardBody className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <FileText size={18} aria-hidden="true" />
              <h2 className="text-base font-bold">Facturación (Factura C, ARCA)</h2>
            </div>
            <div className="rounded-md bg-surface-2 p-3 text-sm text-text-soft">
              Datos para cargar en ARCA: fecha {formatDate(fecha, 'DD/MM/YYYY')} · cliente{' '}
              {venta.cliente?.nombre || 'Consumidor final'}
              {venta.cliente?.cuitDni ? ` (${venta.cliente.cuitDni})` : ''} · importe{' '}
              <strong className="text-text">
                {venta.totalUsd > 0 ? formatUsd(venta.totalUsd) : ''}
                {venta.totalUsd > 0 && venta.totalArs > 0 ? ' + ' : ''}
                {venta.totalArs > 0 ? formatMoney(venta.totalArs) : ''}
              </strong>{' '}
              · Factura C.
            </div>
            {facturada ? (
              <p className="text-sm">
                <span className="text-text-soft">Facturada:</span> N° {venta.facturacion.nroFacturaC}
                {venta.facturacion.cae ? ` · CAE ${venta.facturacion.cae}` : ''}
              </p>
            ) : (
              <div className="flex flex-wrap items-end gap-3">
                <Input label="N° Factura C" value={nroFacturaC} onChange={(e) => setNroFacturaC(e.target.value)} className="w-40" />
                <Input label="CAE (opcional)" value={cae} onChange={(e) => setCae(e.target.value)} className="w-44" />
                <Button onClick={marcarFacturada} loading={facturando}>
                  Marcar facturada
                </Button>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmAnular}
        title="Anular venta"
        message="Se anula la venta y se reintegra el stock de los productos. No se puede deshacer."
        confirmLabel="Anular"
        danger
        loading={anulando}
        onConfirm={anular}
        onCancel={() => setConfirmAnular(false)}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className="text-text">{value}</span>
    </div>
  );
}
