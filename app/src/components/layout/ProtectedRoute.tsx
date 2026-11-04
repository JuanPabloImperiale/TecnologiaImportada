import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Spinner } from '@/components/ui/Spinner';
import { useEffect, useState } from 'react';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged, type User } from 'firebase/auth';

interface CustomClaims {
  role?: 'admin' | 'vendedor' | 'contador';
  [key: string]: unknown;
}

/**
 * Guard de rutas admin con soporte para roles via Custom Claims.
 * 
 * Backward compatible: usuarios sin claims siguen teniendo acceso durante transición.
 * Una vez todos los usuarios tienen Custom Claims asignados, se puede activar
 * validación estricta de roles (ver SECURITY.md).
 */
export function ProtectedRoute() {
  const { isAuthenticated, loading } = useAuth();
  // Claims se usa cuando se activa validación de roles (ver comentarios abajo)
  const [_claims, _setClaims] = useState<CustomClaims | null>(null);
  const [claimsLoading, setClaimsLoading] = useState(true);

  useEffect(() => {
    // Usar Firebase onAuthStateChanged para obtener el User completo
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: User | null) => {
      if (!firebaseUser) {
        setClaimsLoading(false);
        return;
      }

      try {
        const idTokenResult = await firebaseUser.getIdTokenResult();
        _setClaims(idTokenResult.claims as CustomClaims);
      } catch (error) {
        console.error('[ProtectedRoute] Error getting claims:', error);
      } finally {
        setClaimsLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  if (loading || claimsLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/adm" replace />;

  // Validación de roles (cuando todos tengan Custom Claims)
  // Por ahora: BACKWARD COMPATIBLE - usuarios sin claims siguen teniendo acceso
  // const isAdmin = claims?.role === 'admin';
  
  // Descomenta cuando todos los usuarios tengan Custom Claims asignados:
  // if (!isAdmin) {
  //   return <SinPermiso />;
  // }

  return <Outlet />;
}
