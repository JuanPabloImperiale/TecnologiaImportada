# 🧪 VALIDACIÓN LOCAL - Testing Strategy

## Herramientas Disponibles

✅ **Vitest** - Unit/Integration tests
✅ **Vite** - Dev server con HMR
✅ **TypeScript** - Type checking
✅ **ESLint** - Code linting
✅ **Firebase Emulator** - Local Firebase testing (puede usarse)

---

## 🔄 Workflow de Validación Local

### Para cada cambio:

```
1. EDITAR código
   ↓
2. RUN: npm run test (solo tests afectados)
   ↓
3. RUN: npm run lint (verificar sintaxis)
   ↓
4. RUN: npm run build (compilar TypeScript)
   ↓
5. RUN: npm run dev (probar en navegador)
   ↓
6. VERIFICAR en navegador (dev tools, consola)
   ↓
7. COMMIT si todo pasa
```

---

## 📋 Validación por Fase

### FASE 1: CRITICAL FIXES

**Task 1.1: Remover AppCheck Debug Token**

```bash
# 1. Hacer cambio en firebase.ts (eliminar líneas 32-37)
# 2. Verificar sintaxis
npm run lint

# 3. Compilar TypeScript
npm run build

# 4. Ver que no hay errores de compilación
# 5. Tests no afectados (no hay tests específicos para AppCheck)

# 6. Ejecutar app en local
npm run dev

# 7. Abrir https://localhost:5173 en navegador
# 8. Hacer login
# 9. Abrir DevTools > Console
# 10. Verificar que NO hay errores de Auth

# 11. Commit
git add app/src/lib/firebase.ts
git commit -m "🔒 [Security] Remove AppCheck debug token exposure"
```

**Task 1.2: Rotar Cloudinary Credentials**

```bash
# 1. Ir a Cloudinary Dashboard y crear nuevo UPLOAD_PRESET
# 2. Copiar el nuevo preset name
# 3. Actualizar .env.local (LOCAL ONLY, NO COMMIT)

# 4. Verificar cambio
cat app/.env.local | grep CLOUDINARY

# 5. Ejecutar app en local
npm run dev

# 6. Ir a sección de Novedades/Productos donde haya upload
# 7. Intentar subir una imagen
# 8. Verificar que funciona con nuevo preset

# 9. Si falla, revertir y usar preset anterior
# 10. Si funciona: ✅ Validado

# Nota: Este cambio NO se commitea (es local .env.local)
```

---

### FASE 2: FIRESTORE RULES

**Task 2.1 y 2.2: Mejorar Firestore Rules**

```bash
# 1. Editar firestore.rules (agregar validaciones)

# 2. Verificar sintaxis de rules (manual review)
# No hay linter automático para Firestore Rules

# 3. Para testing real de rules, necesitarías Firebase Emulator
# Pero como no está configurado, validaremos así:

# a) Revisar lógica manualmente
#    (archivo incluye validaciones de schema)

# b) Probar en dev local (sin emulator):
npm run dev

# c) Abrir navegador y probar crear venta
# d) Si la regla rechaza, verás error en console:
#    "Permission denied" o similar

# e) Abrir Firebase Console > Firestore > Rules
# f) Deploy rules en consola para verificar sintaxis

# 4. Commit si todo revisa bien
git add app/firestore.rules
git commit -m "🔒 [Security] Add schema validation for venta cliente object"
```

---

### FASE 3: CUSTOM CLAIMS & AUTH

**Task 3.1: Implementar Custom Claims Script**

```bash
# 1. Actualizar scripts/setUserRole.mjs

# 2. Verificar sintaxis de Node.js
node --check app/scripts/setUserRole.mjs

# 3. Commit
git add app/scripts/setUserRole.mjs
git commit -m "🔒 [Security] Add Custom Claims role assignment script"

# NOTA: No se puede probar completamente sin Firebase Admin SDK
#       Se validará en deployment cuando ejecutemos el script
```

**Task 3.2: Mejorar ProtectedRoute**

```bash
# 1. Editar ProtectedRoute.tsx (agregar validación de claims)

# 2. Ejecutar tests
npm run test

# 3. Ejecutar linter
npm run lint

# 4. Compilar
npm run build

# 5. Ejecutar app en local
npm run dev

# 6. Abrir navegador y login
# 7. Abrir DevTools > Console
# 8. Ejecutar en console:
firebase.auth().currentUser?.getIdTokenResult().then(r => console.log(r.claims))

# 9. Si no hay claims (transición), debe dejar pasar (backward compatible)
# 10. Si tiene claims, debe validar el rol

# 11. Commit
git add app/src/components/layout/ProtectedRoute.tsx
git commit -m "🔒 [Security] Add role-based access control to ProtectedRoute"
```

---

### FASE 4: DATA VALIDATION

**Task 4.1: Validar vendorId**

```bash
# 1. Editar saleService.ts (agregar throw error si no hay auth)

# 2. Ejecutar tests de saleService
npm run test -- saleService.test

# 3. Ejecutar linter
npm run lint

# 4. Compilar
npm run build

# 5. App en local
npm run dev

# 6. Login como admin
# 7. Ir a crear venta
# 8. Verificar que vendorId se guarda con tu email/uid
# 9. Abrir Firebase Console > Firestore > ventas
# 10. Verificar que vendorId no está vacío

# 11. Commit
git add app/src/services/saleService.ts
git commit -m "🔒 [Security] Enforce mandatory vendorId in sales transactions"
```

**Task 4.2: Validar longitud de campos**

```bash
# 1. Editar contactService.ts (truncar a 255 chars)

# 2. Ejecutar tests
npm run test -- contactService.test

# 3. Linter + Build
npm run lint && npm run build

# 4. App en local
npm run dev

# 5. Crear contacto con nombre muy largo (> 255 chars)
# 6. Verificar en console que se trunca

# 7. Commit
git add app/src/services/contactService.ts
git commit -m "🔒 [Security] Add field length validation in contactService"
```

---

### FASE 5: TESTING & DOCS

**Task 5.1: Tests de Seguridad**

```bash
# 1. Crear archivos de test:
#    - src/lib/firestore-security.test.ts
#    - src/services/auth.test.ts
#    - Mejorar tests existentes

# 2. Ejecutar todos los tests
npm run test

# 3. Verificar coverage
npm run test -- --coverage

# 4. Commit
git add app/src/**/*.test.ts
git commit -m "🔒 [Tests] Add security-focused unit and integration tests"
```

**Task 5.2: Documentación**

```bash
# 1. Crear SECURITY.md en app/

# 2. Actualizar README.md

# 3. No necesita tests, es solo documentación

# 4. Commit
git add app/SECURITY.md app/README.md
git commit -m "📚 [Docs] Add comprehensive security documentation"
```

---

## ✅ Pre-Deployment Validation Checklist

Después de todos los cambios, ejecutar:

```bash
# 1. Linter
npm run lint

# 2. Tests (todos)
npm run test

# 3. Build
npm run build

# 4. Dev server (verificar en navegador)
npm run dev &

# 5. Verificaciones manuales en navegador:
#    - Login funciona
#    - Crear venta funciona
#    - Crear contacto funciona
#    - Ver console sin errores
#    - Firestore Console muestra datos correctos

# 6. Matar dev server
kill %1
```

---

## 🧪 Validación por Tipo de Cambio

### Cambios en Firestore Rules
- ✅ Sintaxis manual
- ✅ Revisar lógica
- ✅ Probar en dev local (intentar violar regla)
- ✅ Abrir Firebase Console > Rules > Validar

### Cambios en TypeScript/React
- ✅ `npm run lint`
- ✅ `npm run test`
- ✅ `npm run build`
- ✅ `npm run dev` + navegador

### Cambios en .env.local
- ✅ No commitear
- ✅ Probar localmente
- ✅ Verificar funcionalidad

### Cambios en Scripts (Node.js)
- ✅ `node --check` para sintaxis
- ✅ Lógica manual review
- ✅ No se puede probar sin Firebase Admin SDK

---

## 🚀 Workflow Completo

```bash
# 1. Crear rama
git checkout -b security/hardening-phase-1

# 2. FASE 1
# - Editar firebase.ts (remover token)
npm run lint && npm run build
npm run dev  # Verificar en navegador
git commit -m "..."

# 3. FASE 1
# - Actualizar .env.local (cloudinary)
# - Probar upload en dev
# - NO COMMIT a git

# 4. FASE 2
# - Editar firestore.rules
# - Revisar manualmente
# - Probar en dev
git commit -m "..."

# 5. FASE 3
# - Editar scripts/setUserRole.mjs
node --check app/scripts/setUserRole.mjs
git commit -m "..."

# - Editar ProtectedRoute.tsx
npm run lint && npm run build && npm run test
npm run dev  # Verificar en navegador
git commit -m "..."

# 6. FASE 4
# - Editar saleService.ts
npm run test -- saleService.test && npm run build
npm run dev  # Crear venta, verificar vendorId
git commit -m "..."

# - Editar contactService.ts
npm run test -- contactService.test && npm run build
npm run dev  # Crear contacto largo, verificar truncado
git commit -m "..."

# 7. FASE 5
# - Crear tests
npm run test  # Todos pasan
git commit -m "..."

# - Crear SECURITY.md
git add SECURITY.md README.md
git commit -m "..."

# 8. PRE-DEPLOYMENT
npm run lint
npm run test
npm run build
npm run dev  # Verificación manual completa

# 9. Push y crear PR
git push origin security/hardening-phase-1
# Crear PR en GitHub
```

---

## 📊 Validación por Herramienta

### npm run lint
```bash
Verifica:
- Sintaxis de TypeScript
- Estilos de código
- Reglas de ESLint
```

### npm run test
```bash
Ejecuta:
- Todos los tests en app/src/**/*.test.ts
- Coverage automático
- Detecta breaking changes
```

### npm run build
```bash
Compila:
- TypeScript a JavaScript
- Bundlea con Vite
- Genera dist/
- Verifica que NO hay errores
```

### npm run dev
```bash
Inicia:
- Dev server en http://localhost:5173
- Hot Module Replacement (HMR)
- Permite probar en navegador
- Ver console para errores
```

---

## 🔍 Señales de Éxito

✅ `npm run lint` sin errores
✅ `npm run test` todos pasan
✅ `npm run build` sin errores
✅ `npm run dev` app carga normalmente
✅ Login funciona en navegador
✅ Crear venta funciona
✅ Console sin errores en DevTools
✅ Firestore Console muestra datos correctos

---

## 🔴 Señales de Fallo

❌ `npm run lint` errores
❌ `npm run test` fallan
❌ `npm run build` errores
❌ `npm run dev` página en blanco
❌ Console con errores de auth/firebase
❌ Firestore rechaza escritura
❌ App no responde

Si algo falla: revertir commit y revisar cambio

---

## 🔄 Workflow Si Falla Algo

```bash
# 1. Identificar el error
# 2. Revisar console en navegador (DevTools)
# 3. Revisar terminal de npm run test/build
# 4. Revertir cambio
git revert HEAD

# 5. O si es local:
git checkout -- <archivo>

# 6. Ajustar y reintentar
npm run lint
npm run test
npm run build
npm run dev
```

---

**RESUMEN**: Validación local es fácil y completa. Cada cambio se valida con:
1. Lint
2. Tests
3. Build
4. Dev server + navegador

Si todo pasa local, deployment es seguro ✅
