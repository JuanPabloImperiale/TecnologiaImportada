import { useCallback, useMemo, useState, useEffect } from 'react';
import { MessageCircle, Search, User, Edit2, Trash2, Check, X, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { contactService, type Contacto, type ContactoPage } from '@/services/contactService';
import { useSearchInput } from '@/hooks/useSearchInput';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/Modal';
import { formatDate, toDate } from '@/lib/utils';

export function ContactosPage() {
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<ContactoPage['cursor']>(null);
  const [hasMore, setHasMore] = useState(false);
  const [searchInput, setQ, q, searchPending] = useSearchInput();
  const [editingCelular, setEditingCelular] = useState<string | null>(null);
  const [editingNombre, setEditingNombre] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const cargarContactos = useCallback(async (desde: Parameters<typeof contactService.getPage>[1], reemplazar: boolean) => {
    if (reemplazar) setLoading(true);
    else setLoadingMore(true);
    const resultado = await contactService.getPage(30, desde);
    if (resultado.ok) {
      setContactos((actuales) => reemplazar ? resultado.data.contactos : [...actuales, ...resultado.data.contactos]);
      setCursor(resultado.data.cursor);
      setHasMore(resultado.data.hasMore);
      setError(null);
    } else setError(resultado.error.message);
    setLoading(false);
    setLoadingMore(false);
  }, []);

  useEffect(() => { void cargarContactos(null, true); }, [cargarContactos]);

  const lista = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return contactos;
    return contactos.filter(
      (c) => c.nombre.toLowerCase().includes(term) || c.celular.includes(term),
    );
  }, [contactos, q]);

  const onEditStart = (c: Contacto) => {
    setEditingCelular(c.celular);
    setEditingNombre(c.nombre);
  };

  const onEditSave = async () => {
    if (!editingCelular || !editingNombre.trim()) return;
    setSaving(true);
    const res = await contactService.save(editingCelular, { nombre: editingNombre });
    setSaving(false);
    if (res.ok) {
      setContactos((prev) => prev.map((contacto) => contacto.celular === editingCelular
        ? { ...contacto, nombre: editingNombre.trim() }
        : contacto));
      setEditingCelular(null);
      toast.success('Contacto actualizado');
    } else {
      toast.error(res.error.message);
    }
  };

  const onDeleteClick = (celular: string) => {
    setDeleteConfirm(celular);
  };

  const onDeleteConfirm = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    const res = await contactService.save(deleteConfirm, { eliminado: true });
    setDeleting(false);
    if (res.ok) {
      setContactos((prev) => prev.filter((contacto) => contacto.celular !== deleteConfirm));
      setDeleteConfirm(null);
      toast.success('Contacto eliminado');
    } else {
      toast.error(res.error.message);
    }
  };

  if (loading) return <Spinner />;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Contactos</h1>
        <Button variant="ghost" size="sm" onClick={() => void cargarContactos(null, true)} disabled={loading}>
          <RefreshCw size={15} aria-hidden="true" /> Actualizar
        </Button>
      </div>
      <div className="relative mb-4 max-w-md">
        <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-soft" aria-hidden="true" />
        <Input placeholder="Buscar por nombre o celular…" value={searchInput} loading={searchPending} onChange={(e) => setQ(e.target.value)} className="pl-9" />
      </div>
      <p className="mb-3 text-xs text-text-soft">
        Los contactos se cargan por páginas y la búsqueda filtra los registros ya cargados.
      </p>

      {error ? (
        <EmptyState title="Error" description={error} />
      ) : lista.length === 0 ? (
        <EmptyState icon={<User size={36} />} title="Sin contactos" description="Se arman solos a partir de consultas y ventas." />
      ) : (
        <div className="flex flex-col gap-2">
          {lista.map((c) => {
            const isEditing = editingCelular === c.celular;
            return (
              <Card key={c.celular} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  {isEditing ? (
                    <input
                      type="text"
                      value={editingNombre}
                      onChange={(e) => setEditingNombre(e.target.value)}
                      className="mb-1 w-full rounded border border-line bg-surface-2 px-2 py-1 text-sm font-medium"
                      placeholder="Nombre"
                      autoFocus
                    />
                  ) : (
                    <p className="truncate font-medium">{c.nombre || 'Sin nombre'}</p>
                  )}
                  <p className="text-sm text-text-soft">
                    {c.celular} · {c.cantidadPedidos} consulta(s) · {c.cantidadVentas} venta(s) · últ. {c.ultimoContacto ? formatDate(toDate(c.ultimoContacto)) : 'sin fecha'}
                  </p>
                </div>
                {isEditing ? (
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={onEditSave}
                      disabled={saving}
                      aria-label="Guardar"
                      className="flex h-9 w-9 items-center justify-center rounded-md border border-line bg-surface-2 text-success hover:border-line-strong disabled:opacity-50"
                    >
                      <Check size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingCelular(null)}
                      aria-label="Cancelar"
                      className="flex h-9 w-9 items-center justify-center rounded-md border border-line bg-surface-2 text-danger hover:border-line-strong"
                    >
                      <X size={16} aria-hidden="true" />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => onEditStart(c)}
                      aria-label="Editar nombre"
                      className="flex h-9 w-9 items-center justify-center rounded-md border border-line bg-surface-2 text-text hover:border-line-strong"
                    >
                      <Edit2 size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteClick(c.celular)}
                      aria-label="Eliminar"
                      className="flex h-9 w-9 items-center justify-center rounded-md border border-line bg-surface-2 text-danger hover:border-line-strong"
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </div>
                )}
                <a
                  href={`https://wa.me/${c.celular.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="WhatsApp"
                  className="flex h-9 w-9 items-center justify-center rounded-md border border-line bg-surface-2 text-text hover:border-line-strong"
                >
                  <MessageCircle size={16} aria-hidden="true" />
                </a>
              </Card>
            );
          })}
        </div>
      )}

      {hasMore && !error && (
        <div className="mt-4 flex justify-center">
          <Button variant="ghost" onClick={() => void cargarContactos(cursor, false)} loading={loadingMore} disabled={loadingMore}>
            Cargar más contactos
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={deleteConfirm !== null}
        title="Eliminar contacto"
        message="¿Estás seguro de que querés eliminar este contacto?"
        confirmLabel="Eliminar"
        danger
        loading={deleting}
        onConfirm={onDeleteConfirm}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
