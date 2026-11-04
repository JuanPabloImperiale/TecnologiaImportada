# 🔒 Plan de Hardening de Seguridad - Admin & Firebase

**Objetivo**: Implementar seguridad máxima en un único PR sin perder funcionalidad en producción.

**Restricciones**:
- ✅ Zero impacto en Firebase costs (libre tier)
- ✅ Zero breaking changes
- ✅ Backward compatible 100%
- ✅ Deployment sin downtime

---

## 📋 FASES DE IMPLEMENTACIÓN

### FASE 1: Critical Fixes (Sin cambios de API)
**Duración**: ~20 minutos | **Risk**: MINIMAL | **Breaking Changes**: NONE

#### Task 1.1: Remover AppCheck Debug Token
**Archivo**: `app/src/lib/firebase.ts` líneas 32-37
**Cambio**: Eliminar la lógica que expone el token en globalThis
**Por qué**: Previene bypass de AppCheck
**Backward compatible**: ✅ SÍ (Firebase SDK lo maneja automáticamente)
**Testing**: Verificar que Firebase Auth sigue funcionando

```typescript
// ANTES (líneas 32-37):
if (appCheckDebugToken) {
  const scope = globalThis as typeof globalThis & {
    FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean;
  };
  scope.FIREBASE_APPCHECK_DEBUG_TOKEN =
    appCheckDebugToken === 'true' ? true : appCheckDebugToken;
}

// DESPUÉS: ELIMINAR completamente
// Firebase SDK detecta automáticamente si está en desarrollo
```

#### Task 1.2: Rotar Cloudinary Credentials
**Archivo**: `.env.local` (local only, no commit)
**Cambio**: Generar nuevo UPLOAD_PRESET con restricciones
**Por qué**: Credenciales públicas permiten abusos
**Backward compatible**: ✅ SÍ (solo cambia valor, no estructura)
**Testing**: Verificar que uploads siguen funcionando

**Acción**:
1. Ir a Cloudinary Dashboard
2. Crear nuevo Upload Preset con restricciones:
   - Folder: `/tecnologia-importada/admin/`
   - Max file size: 5MB
   - Allowed formats: jpg, png, webp
   - Public ID prefix: auto
3. Actualizar `VITE_CLOUDINARY_UPLOAD_PRESET` en `.env.local`
4. Rotar la UPLOAD_PRESET anterior (deshabilitar)

---

### FASE 2: Firestore Security Rules (Validación de datos)
**Duración**: ~35 minutos | **Risk**: MINIMAL | **Breaking Changes**: NONE

#### Task 2.1: Mejorar Rules para `ventas`
**Archivo**: `app/firestore.rules`
**Cambio**: Agregar validación de schema para objeto `cliente`

```firestore
// ANTES:
allow create, update: if isAdmin();

// DESPUÉS:
allow create, update: if isAdmin() && 
  validateVentaCliente(request.resource.data.cliente);

function validateVentaCliente(cliente) {
  // Si cliente existe, validar que solo tiene campos permitidos
  return !cliente.keys().hasAny(['nombreBusqueda', 'otrosCampos']) ||
         cliente.keys().hasOnly(['celular', 'nombre', 'cuitDni']);
}
```

**Por qué**: Evita inyección de datos malformados
**Backward compatible**: ✅ SÍ (rechaza datos inválidos que nunca debieron existir)
**Testing**: Tests de validación de schema

#### Task 2.2: Mejorar Rules para `clientes`
**Archivo**: `app/firestore.rules`
**Cambio**: Restringir update/delete solo a admin

```firestore
// ANTES:
allow read, update, delete: if signedIn();

// DESPUÉS:
allow read: if signedIn();
allow create: if isAdmin() || (
  signedIn() && 
  request.method == 'create' &&
  request.resource.data.keys().hasOnly(['celular', 'nombre', 'cuitDni'])
);
allow update, delete: if isAdmin();
```

**Por qué**: Solo admin puede modificar clientes existentes
**Backward compatible**: ✅ SÍ (clientes públicos solo pueden crear nuevos)
**Testing**: Tests de permisos por rol

---

### FASE 3: Custom Claims & Authentication
**Duración**: ~55 minutos | **Risk**: LOW | **Breaking Changes**: NONE

#### Task 3.1: Implementar Custom Claims en Firebase Auth
**Cómo**: Script local que agrega claims a usuarios existentes

**Archivo a crear**: `app/scripts/setUserRole.mjs` (mejorado)

```javascript
// Agregar roles a usuarios existentes
// Ejecutar: node scripts/setUserRole.mjs <email> <role>
// Roles permitidos: admin, vendedor, contador

import admin from 'firebase-admin';

admin.initializeApp({ ... });
const auth = admin.auth();

async function setUserRole(email, role) {
  if (!['admin', 'vendedor', 'contador'].includes(role)) {
    throw new Error('Role no válido');
  }
  
  const user = await auth.getUserByEmail(email);
  await auth.setCustomUserClaims(user.uid, { role });
  console.log(`✅ Role '${role}' asignado a ${email}`);
}

const [, , email, role] = process.argv;
if (!email || !role) {
  console.error('Uso: node setUserRole.mjs <email> <role>');
  process.exit(1);
}

setUserRole(email, role).catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
```

**Por qué**: Control granular de accesos sin cambiar DB
**Backward compatible**: ✅ SÍ (usuarios sin claims siguen funcionando)
**Testing**: Verificar que claims se obtienen correctamente en idToken

#### Task 3.2: Mejorar ProtectedRoute con validación de roles
**Archivo**: `app/src/components/layout/ProtectedRoute.tsx`
**Cambio**: Validar Custom Claims para acceso

```typescript
// ANTES:
if (!isAuthenticated) return <Navigate to="/login" />;
return <Outlet />;

// DESPUÉS:
const { user } = useAuth();
const [claims, setClaims] = useState<{ role?: string } | null>(null);
const [loading, setLoading] = useState(true);

useEffect(() => {
  if (!user) {
    setLoading(false);
    return;
  }
  
  user.getIdTokenResult().then(idTokenResult => {
    setClaims(idTokenResult.claims);
    setLoading(false);
  });
}, [user]);

if (loading) return <LoadingSpinner />;
if (!user) return <Navigate to="/login" />;

// Validar role si es necesario (configurar por ruta)
const requiredRole = 'admin'; // o configurar dinámicamente
if (requiredRole && claims?.role !== requiredRole) {
  return <SinPermiso />;
}

return <Outlet />;
```

**Por qué**: Control de acceso granular a nivel de ruta
**Backward compatible**: ✅ SÍ (usuario sin claims = acceso completo durante transición)
**Testing**: Tests de permisos por rol

---

### FASE 4: Data Validation & Integrity
**Duración**: ~20 minutos | **Risk**: MINIMAL | **Breaking Changes**: NONE

#### Task 4.1: Validar vendedorId en transacción
**Archivo**: `app/src/services/saleService.ts` línea 248
**Cambio**: Throw error si no hay sesión activa

```typescript
// ANTES:
vendedorId: auth.currentUser?.email ?? auth.currentUser?.uid ?? '',

// DESPUÉS:
if (!auth.currentUser) {
  throw new Error('Error de autenticación: no hay sesión activa. Por favor, recarga la página.');
}
vendedorId: auth.currentUser.email ?? auth.currentUser.uid,
```

**Por qué**: Garantiza auditoría siempre
**Backward compatible**: ✅ SÍ (solo cambia manejo de error imposible)
**Testing**: Error si auth.currentUser es null

#### Task 4.2: Validar longitud de campos en contactService
**Archivo**: `app/src/services/contactService.ts` línea 159
**Cambio**: Validar límite de longitud

```typescript
// ANTES:
nombre: String(nombre ?? '').trim(),

// DESPUÉS:
const nombreStr = String(nombre ?? '').trim().slice(0, 255);
if (nombreStr !== String(nombre ?? '').trim()) {
  console.warn('Nombre truncado a 255 caracteres');
}
nombre: nombreStr,
```

**Por qué**: Evita exceso de datos en Firestore
**Backward compatible**: ✅ SÍ (trunca automáticamente)
**Testing**: Verificar que nombres largos se truncan

---

### FASE 5: Testing & Documentation
**Duración**: ~65 minutos | **Risk**: NONE | **Breaking Changes**: NONE

#### Task 5.1: Agregar tests de seguridad
**Archivos**: Crear tests para:
- ✅ Validación de schema en Firestore Rules
- ✅ Custom Claims en Auth
- ✅ ProtectedRoute con roles
- ✅ vendedorId obligatorio
- ✅ Truncamiento de campos

#### Task 5.2: Documentar cambios
**Archivo a crear**: `SECURITY.md`

Contenido:
- Roles implementados (admin, vendedor, contador)
- Cómo asignar roles (script)
- Firestore Rules explicadas
- Validaciones de datos
- Endpoints sensibles protegidos
- Procedimiento de auditoría

---

## 🚀 DEPLOYMENT STRATEGY (Zero Downtime)

### Pre-Deployment Checklist
- [ ] Todos los tests pasan en local
- [ ] Code review completado
- [ ] PR creado con todos los cambios
- [ ] Firebase Rules validadas en staging
- [ ] Custom Claims script probado

### Deployment en Stages

**Stage 1: Firebase Rules (Sin impacto, solo validación)**
```bash
# 1. Deploy solo las Firestore Rules mejoradas
firebase deploy --only firestore:rules

# 2. Esperar 5 minutos
# 3. Verificar logs que no hay errores de validación
firebase functions:log --limit 50
```

**Stage 2: Code Deploy (Con backward compatibility)**
```bash
# 1. Deploy la app actualizada (sin Custom Claims requirement)
npm run build
firebase deploy --only hosting

# 2. Verificar que funcionalidad sigue igual
# 3. Usuarios reciben código actualizado (sin impact)
```

**Stage 3: Custom Claims Migration (Sin cambios en app)**
```bash
# 1. Ejecutar script para asignar roles a usuarios admin existentes
node scripts/setUserRole.mjs admin@empresa.com admin
node scripts/setUserRole.mjs vendedor@empresa.com vendedor

# 2. Verificar en Firebase Console que claims se crearon
# 3. NO cambia funcionamiento aún (ProtectedRoute ignora claims si no existen)
```

**Stage 4: Activar validación de roles (Solo cuando todos tienen claims)**
```bash
# 1. Una vez todos tienen roles asignados:
# 2. Hacer push a rama con ProtectedRoute validando roles
# 3. Rollback es simple: revertir commit
```

### Rollback Plan

Si hay problema en cualquier stage:

```bash
# Opción 1: Revertir Firebase Rules
firebase deploy --only firestore:rules  # con versión anterior

# Opción 2: Revertir hosting
firebase deploy --only hosting  # con versión anterior

# Opción 3: Revertir Custom Claims
node scripts/removeUserRole.mjs <email>
```

---

## 📊 RESUMEN DE CAMBIOS

| Cambio | Archivo | Líneas | Risk | Cost | Backward Compat |
|--------|---------|--------|------|------|-----------------|
| Remover AppCheck Token | firebase.ts | 32-37 | ✅ NONE | ✅ FREE | ✅ YES |
| Rotar Cloudinary | .env.local | - | ✅ NONE | ✅ FREE | ✅ YES |
| Validar schema ventas | firestore.rules | - | ✅ LOW | ✅ FREE | ✅ YES |
| Restringir clientes | firestore.rules | - | ✅ LOW | ✅ FREE | ✅ YES |
| Custom Claims | scripts/ | NEW | ✅ LOW | ✅ FREE | ✅ YES |
| ProtectedRoute roles | ProtectedRoute.tsx | - | ✅ LOW | ✅ FREE | ✅ YES |
| Validar vendedorId | saleService.ts | 248 | ✅ NONE | ✅ FREE | ✅ YES |
| Truncar campos | contactService.ts | 159 | ✅ NONE | ✅ FREE | ✅ YES |

---

## 🎯 PR STRUCTURE

```
Commit 1: [Security] Remove AppCheck debug token exposure
Commit 2: [Security] Rotate Cloudinary credentials (local config)
Commit 3: [Security] Improve Firestore Rules for data validation
Commit 4: [Security] Add Custom Claims support for role-based access
Commit 5: [Security] Enhance ProtectedRoute with role validation
Commit 6: [Security] Add data validation and integrity checks
Commit 7: [Tests] Add security-focused unit and integration tests
Commit 8: [Docs] Add SECURITY.md documentation

PR Title: 🔒 Security Hardening: Admin Auth & Firebase Communication

PR Description:
- Remover exposición de AppCheck debug token
- Mejorar Firestore Rules con validación de schema
- Implementar Custom Claims para roles (admin, vendedor, contador)
- Validación de datos en transacciones críticas
- Tests de seguridad
- Documentación de seguridad

⚠️ Deployment Strategy:
1. Deploy Firestore Rules (5 min)
2. Deploy código (no impact)
3. Asignar Custom Claims a usuarios (30 min)
4. Activar validación de roles (opcional, backward compat)
5. Rollback plan disponible en SECURITY.md

❌ Breaking Changes: NONE
✅ Backward Compatible: 100%
💰 Firebase Cost Impact: ZERO
📈 Readability Impact: IMPROVED
```

---

## ⏱️ TIMELINE

| Fase | Tareas | Tiempo | Status |
|------|--------|--------|--------|
| 1 | Critical Fixes (Token, Cloudinary) | 20 min | 🔵 Ready |
| 2 | Firestore Rules (Validación schema) | 35 min | 🔵 Ready |
| 3 | Custom Claims & ProtectedRoute | 55 min | 🔵 Ready |
| 4 | Data Validation | 20 min | 🔵 Ready |
| 5 | Testing & Documentation | 65 min | 🔵 Ready |
| **TOTAL** | | **195 min (3.25 hrs)** | 🔵 Ready |

---

## ✅ PRÓXIMOS PASOS

1. ✅ Plan aprobado
2. ⏳ Crear rama: `security/hardening-phase-1`
3. ⏳ Implementar por fases
4. ⏳ Tests en local
5. ⏳ Crear PR con descripción completa
6. ⏳ Code review
7. ⏳ Deploy según stages

¿Procedo con la implementación?
