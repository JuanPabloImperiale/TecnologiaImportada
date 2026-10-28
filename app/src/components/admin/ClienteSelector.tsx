import { useEffect, useState } from 'react';
import { useSearchInput } from '@/hooks/useSearchInput';
import { Search, Plus, X } from 'lucide-react';
import { contactService } from '@/services/contactService';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
interface Cliente {
  celular: string;
  nombre: string;
  cuitDni?: string;
}

interface ClienteSelectorProps {
  cliente: Cliente;
  onChange: (cliente: Cliente) => void;
}

export function ClienteSelector({ cliente, onChange }: ClienteSelectorProps) {
  const [busqueda, setBusqueda, busquedaConfirmada, searchPending] = useSearchInput();
  const [showNew, setShowNew] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoCelular, setNuevoCelular] = useState('');
  const [candidatos, setCandidatos] = useState<Cliente[]>([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);
  const [errorHistorial, setErrorHistorial] = useState<string | null>(null);

  useEffect(() => {
    const term = busquedaConfirmada.trim();
    if (!term) {
      setCandidatos([]);
      setCargandoHistorial(false);
      setErrorHistorial(null);
      return;
    }
    let active = true;
    setCargandoHistorial(true);
    setErrorHistorial(null);
    void contactService.search(term).then((resultado) => {
      if (!active) return;
      setCargandoHistorial(false);
      if (resultado.ok) {
        setCandidatos(resultado.data.map((contacto) => ({
          nombre: contacto.nombre,
          celular: contacto.celular,
          cuitDni: contacto.cuitDni,
        })));
      } else {
        setCandidatos([]);
        setErrorHistorial(resultado.error.message);
      }
    });
    return () => { active = false; };
  }, [busquedaConfirmada]);

  const onSelectContacto = (contacto: Cliente) => {
    onChange(contacto);
    setBusqueda('');
  };

  const onNuevoContacto = () => {
    if (!nuevoNombre.trim() || !nuevoCelular.trim()) return;
    onChange({
      nombre: nuevoNombre.trim(),
      celular: nuevoCelular.trim(),
    });
    setNuevoNombre('');
    setNuevoCelular('');
    setShowNew(false);
    setBusqueda('');
  };

  const onLimpiar = () => {
    onChange({ nombre: '', celular: '' });
    setBusqueda('');
    setCandidatos([]);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Estado actual */}
      {cliente.nombre || cliente.celular ? (
        <div className="flex items-center justify-between rounded-lg border border-line bg-surface-2 p-3">
          <div className="flex-1">
            <p className="font-medium">{cliente.nombre || 'Sin nombre'}</p>
            <p className="text-sm text-text-soft">{cliente.celular}</p>
          </div>
          <button
            type="button"
            onClick={onLimpiar}
            className="flex h-8 w-8 items-center justify-center rounded text-text-soft hover:bg-surface"
            aria-label="Limpiar"
          >
            <X size={18} />
          </button>
        </div>
      ) : null}

      {/* Búsqueda */}
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-soft" aria-hidden="true" />
          <Input
            placeholder="Buscar contacto por nombre o celular…"
            value={busqueda}
            loading={searchPending || cargandoHistorial}
            onChange={(e) => setBusqueda(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {cargandoHistorial && (
        <p className="text-xs text-text-soft">Cargando contactos registrados…</p>
      )}
      {errorHistorial && <p className="text-xs text-danger">No se pudieron buscar contactos: {errorHistorial}</p>}
      {busqueda.trim() && busqueda.trim() === busquedaConfirmada.trim() && !cargandoHistorial && !errorHistorial && candidatos.length === 0 && (
        <p className="text-xs text-text-soft">No hay coincidencias. Podés cargar el contacto manualmente.</p>
      )}

      {/* Sugerencias */}
      {busqueda.trim() === busquedaConfirmada.trim() && busqueda.trim() && !cargandoHistorial && candidatos.length > 0 ? (
        <Card className="flex flex-col gap-1 p-2">
          {candidatos.map((c) => (
            <button
              key={c.celular}
              type="button"
              onClick={() => onSelectContacto(c)}
              className="flex flex-col rounded px-3 py-2 text-left hover:bg-surface-2"
            >
              <p className="font-medium text-sm">{c.nombre}</p>
              <p className="text-xs text-text-soft">{c.celular}</p>
            </button>
          ))}
        </Card>
      ) : null}

      {/* Crear nuevo */}
      {!showNew ? (
        <Button variant="ghost" size="sm" onClick={() => setShowNew(true)} className="w-full justify-center">
          <Plus size={16} className="mr-2" />
          Crear nuevo contacto
        </Button>
      ) : (
        <Card className="flex flex-col gap-3 p-4">
          <Input
            label="Nombre"
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            placeholder="Ej: Juan García"
          />
          <Input
            label="Celular"
            value={nuevoCelular}
            onChange={(e) => setNuevoCelular(e.target.value)}
            placeholder="Ej: +54 9 2657 123456"
          />
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setShowNew(false)} className="flex-1">
              Cancelar
            </Button>
            <Button onClick={onNuevoContacto} disabled={!nuevoNombre.trim() || !nuevoCelular.trim()} className="flex-1">
              Guardar
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
