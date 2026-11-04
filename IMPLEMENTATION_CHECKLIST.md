# ✅ CHECKLIST DE IMPLEMENTACIÓN - Security Hardening

## 🔵 PRE-IMPLEMENTACIÓN

- [ ] Plan revisado y aprobado
- [ ] Rama creada: `security/hardening-phase-1`
- [ ] Backup de `.env.local` realizado
- [ ] Firebase project en staging disponible para testing
- [ ] Acceso a Cloudinary Dashboard verificado

---

## 🔴 FASE 1: CRITICAL FIXES (20 min)

### Task 1.1: Remover AppCheck Debug Token
- [ ] Revisar `app/src/lib/firebase.ts` líneas 32-37
- [ ] Eliminar bloque de exposición de token
- [ ] ✅ Verificar que Firebase Auth aún funciona
- [ ] ✅ Commit: `git commit -m "🔒 [Security] Remove AppCheck debug token exposure"`

### Task 1.2: Rotar Cloudinary Credentials
- [ ] Acceder a Cloudinary Dashboard
- [ ] Crear nuevo Upload Preset con restricciones
  - [ ] Folder: `/tecnologia-importada/admin/`
  - [ ] Max file size: 5MB
  - [ ] Allowed formats: jpg, png, webp
- [ ] Copiar nuevo UPLOAD_PRESET
- [ ] Actualizar `.env.local` LOCAL (no commit)
- [ ] Deshabilitar UPLOAD_PRESET anterior
- [ ] ✅ Probar upload en local
- [ ] ✅ Verificar que funciona con restricciones

---

## 🟠 FASE 2: FIRESTORE RULES (35 min)

### Task 2.1: Mejorar Rules para `ventas`
- [ ] Abrir `app/firestore.rules`
- [ ] Agregar función de validación: `validateVentaCliente()`
- [ ] Validar que objeto `cliente` solo tiene: `celular`, `nombre`, `cuitDni`
- [ ] ✅ Revisar sintaxis con Firebase emulator
- [ ] ✅ Commit: `git commit -m "🔒 [Security] Add schema validation for venta cliente object"`

**Validación en emulator**:
```bash
cd app
firebase emulators:start --only firestore
# En otra terminal: npm run test:firestore
```

### Task 2.2: Mejorar Rules para `clientes`
- [ ] Actualizar regla de `clientes`
- [ ] Permitir CREATE solo si es admin O datos válidos
- [ ] Restringir UPDATE/DELETE solo a admin
- [ ] Permitir READ a todos autenticados
- [ ] ✅ Revisar sintaxis con Firebase emulator
- [ ] ✅ Commit: `git commit -m "🔒 [Security] Restrict client updates to admin only"`

---

## 🟡 FASE 3: CUSTOM CLAIMS & AUTH (55 min)

### Task 3.1: Implementar Custom Claims
- [ ] Actualizar script `app/scripts/setUserRole.mjs`
- [ ] Agregar validación de roles permitidos: admin, vendedor, contador
- [ ] Agregar función para remover roles (rollback)
- [ ] ✅ Probar script en local:
  ```bash
  cd app
  node scripts/setUserRole.mjs test@empresa.com admin
  ```
- [ ] ✅ Verificar en Firebase Console que claim se creó
- [ ] ✅ Commit: `git commit -m "🔒 [Security] Add Custom Claims role assignment script"`

### Task 3.2: Mejorar ProtectedRoute
- [ ] Editar `app/src/components/layout/ProtectedRoute.tsx`
- [ ] Agregar estado para claims
- [ ] Obtener Custom Claims del idToken
- [ ] Validar role si es requerido (configurar por ruta)
- [ ] Usar componente `SinPermiso` si role no es válido
- [ ] ✅ Testing en local:
  ```bash
  npm run dev
  # Probar acceso a rutas admin con usuario sin claims
  # Probar acceso con usuario con claims correctos
  ```
- [ ] ✅ Commit: `git commit -m "🔒 [Security] Add role-based access control to ProtectedRoute"`

---

## 🟡 FASE 4: DATA VALIDATION (20 min)

### Task 4.1: Validar vendedorId
- [ ] Editar `app/src/services/saleService.ts` línea 248
- [ ] Cambiar valor por defecto vacío a error explícito
- [ ] ✅ Test: Verificar que error se lanza si auth.currentUser es null
- [ ] ✅ Commit: `git commit -m "🔒 [Security] Enforce mandatory vendorId in sales transactions"`

### Task 4.2: Validar longitud de campos
- [ ] Editar `app/src/services/contactService.ts` línea 159
- [ ] Agregar límite de 255 caracteres para `nombre`
- [ ] Agregar warning si se trunca
- [ ] ✅ Test: Crear contacto con nombre > 255 caracteres
- [ ] ✅ Commit: `git commit -m "🔒 [Security] Add field length validation in contactService"`

---

## 🔵 FASE 5: TESTING & DOCUMENTATION (65 min)

### Task 5.1: Crear/Mejorar Tests
- [ ] Crear archivo: `app/src/lib/firestore-security.test.ts`
  - [ ] Test validación de schema en `ventas`
  - [ ] Test restricción de `clientes` para admin
  - [ ] Test rechazo de datos inválidos
  
- [ ] Crear archivo: `app/src/services/auth.test.ts`
  - [ ] Test obtención de Custom Claims
  - [ ] Test validación de roles en ProtectedRoute
  - [ ] Test acceso denegado sin rol
  
- [ ] Mejorar: `app/src/services/saleService.test.ts`
  - [ ] Test error si auth.currentUser es null
  - [ ] Test vendorId siempre se guarda
  
- [ ] Mejorar: `app/src/services/contactService.test.ts`
  - [ ] Test nombre se trunca a 255 caracteres
  - [ ] Test warning en consola si se trunca

- [ ] ✅ Ejecutar todos los tests:
  ```bash
  npm run test
  # o específicos:
  npm run test -- --testPathPattern="security|auth|contact|sale"
  ```

### Task 5.2: Documentar cambios
- [ ] Crear archivo: `app/SECURITY.md`
  Contenido:
  - [ ] Introducción a seguridad en la app
  - [ ] Roles implementados y cómo funcionan
  - [ ] Cómo asignar roles a usuarios
  - [ ] Explicación de Firestore Rules
  - [ ] Validaciones de datos implementadas
  - [ ] Endpoints/operaciones sensibles protegidas
  - [ ] Procedimiento de auditoría
  - [ ] Plan de rollback
  
- [ ] Actualizar archivo: `README.md`
  - [ ] Agregar sección "Security" con link a SECURITY.md
  - [ ] Instrucciones para ejecutar script de roles

- [ ] ✅ Commit: `git commit -m "📚 [Docs] Add comprehensive security documentation"`

---

## 🚀 FASE 6: PR & DEPLOYMENT

### Pre-PR Checklist
- [ ] Todos los tests pasan: `npm run test`
- [ ] Lint sin errores: `npm run lint`
- [ ] Build sin errores: `npm run build`
- [ ] Limpiar console.log de debug
- [ ] Revisar commits en orden lógico (7-8 commits)

### Crear PR
- [ ] Titulo: `🔒 Security Hardening: Admin Auth & Firebase Communication`
- [ ] Descripción completa con:
  - [ ] Resumen de cambios
  - [ ] Vulnerabilidades solucionadas
  - [ ] Deployment strategy
  - [ ] Testing realizadas
  - [ ] Link a SECURITY.md
  - [ ] Deployment checklist

### Code Review
- [ ] Revisar cambios por fase
- [ ] Verificar tests coverage
- [ ] Validar backward compatibility
- [ ] Evaluar impacto en performance
- [ ] Aprobación requerida antes de merge

### Merge a Main
- [ ] Squash commits NO (mantener histórico limpio)
- [ ] Delete rama después de merge
- [ ] Descargar rama main actualizada

---

## 🌍 DEPLOYMENT (Zero Downtime)

### Pre-Deployment (Local)
```bash
# Verificar una última vez
npm run test
npm run build
npm run lint

# Crear tag de versión
git tag -a v1.X.X -m "🔒 Security Hardening Release"
git push origin v1.X.X
```

### Stage 1: Deploy Firebase Rules (5-10 min)
```bash
# ✅ Checkpoint 1
firebase deploy --only firestore:rules

# ✅ Esperar logs
firebase functions:log --limit 50

# ✅ Verificar en Firebase Console
# - Firestore > Rules > Validar que se actualizó
```

### Stage 2: Deploy App (2-5 min)
```bash
# ✅ Checkpoint 2
npm run build
firebase deploy --only hosting

# ✅ Verificar en https://tu-app.web.app
# - Login funciona
# - Operaciones normales funcionan
# - No hay errores en console
```

### Stage 3: Assign Custom Claims (30 min)
```bash
# ✅ Checkpoint 3
cd app

# Asignar role admin a usuarios administradores
node scripts/setUserRole.mjs admin1@empresa.com admin
node scripts/setUserRole.mjs admin2@empresa.com admin

# Asignar role vendedor a vendedores
node scripts/setUserRole.mjs vendedor1@empresa.com vendedor
node scripts/setUserRole.mjs vendedor2@empresa.com vendedor

# ✅ Verificar en Firebase Console
# Authentication > Users > Ver campo "Custom claims"
```

### Stage 4: Validate Roles (Optional)
```bash
# ✅ Checkpoint 4 (solo si todos tienen claims)
# En este punto, ProtectedRoute ya valida roles automáticamente
# Usuarios sin claims pueden acceder pero sin role específico
# Esto es backward compatible

# Opcional: hacer un commit adicional si quieres activar
# validación estricta de roles (no recomendado sin todos asignados)
```

---

## ⏮️ ROLLBACK PLAN (Si algo falla)

### Rollback Completo
```bash
# Volver a versión anterior
git revert <commit-hash>
git push origin main

# Deploy de rollback
firebase deploy
npm run build && firebase deploy --only hosting
```

### Rollback Parcial

**Si falla Stage 1 (Firestore Rules)**:
```bash
# Usar versión anterior de rules
git checkout HEAD~1 -- app/firestore.rules
firebase deploy --only firestore:rules
```

**Si falla Stage 2 (App Deploy)**:
```bash
# Firebase Hosting tiene rollback automático
# En Firebase Console > Hosting > seleccionar versión anterior
# O ejecutar:
firebase hosting:disable
```

**Si falla Stage 3 (Custom Claims)**:
```bash
# Remover claims
node scripts/removeUserRole.mjs admin1@empresa.com
# O ejecutar en Firebase Console CLI:
firebase auth:delete [uid] --project [project-id]
# (cuidado: esto elimina el usuario)
```

---

## ✅ POST-DEPLOYMENT VALIDATION

- [ ] Verificar logs de Firebase (5 minutos)
  ```bash
  firebase functions:log --limit 100
  ```

- [ ] Monitorear errores en app:
  - [ ] Abrir app en navegador
  - [ ] Revisar console de developer
  - [ ] Probar login
  - [ ] Probar crear venta (si eres admin)
  - [ ] Probar crear contacto

- [ ] Verificar Firestore Rules funcionan:
  - [ ] Intentar crear venta con cliente inválido (debe fallar)
  - [ ] Intentar actualizar cliente como usuario normal (debe fallar)
  - [ ] Intentar actualizar cliente como admin (debe funcionar)

- [ ] Verificar Custom Claims:
  ```bash
  # En console de app
  firebase.auth().currentUser?.getIdTokenResult().then(r => console.log(r.claims))
  ```

- [ ] Monitorear durante 24h:
  - [ ] Revisar logs periódicamente
  - [ ] Comunicar a equipo cambios de seguridad
  - [ ] Recolectar feedback

---

## 📊 STATUS TRACKING

| Fase | Status | Completado | Notas |
|------|--------|------------|-------|
| Pre-Impl | ⏳ Pending | - | Espera inicio |
| Fase 1 | ⏳ Pending | - | Token + Cloudinary |
| Fase 2 | ⏳ Pending | - | Firestore Rules |
| Fase 3 | ⏳ Pending | - | Custom Claims |
| Fase 4 | ⏳ Pending | - | Data Validation |
| Fase 5 | ⏳ Pending | - | Tests + Docs |
| Fase 6 | ⏳ Pending | - | PR + Deploy |

---

## 🎯 SUCCESS CRITERIA

✅ Todo implementado cuando:

1. ✅ Todos los tests pasan (tests/security + tests/auth + tests/contact + tests/sale)
2. ✅ Build sin errores: `npm run build`
3. ✅ Lint sin advertencias: `npm run lint`
4. ✅ Firestore Rules validadas en emulator
5. ✅ App funciona en producción sin errores
6. ✅ Custom Claims asignados a al menos 1 usuario de prueba
7. ✅ ProtectedRoute obtiene claims sin error
8. ✅ SECURITY.md documentado completamente
9. ✅ Todas las vulnerabilidades de CRITICAL resueltas
10. ✅ Firebase costs siguen en $0/mes

---

## 📞 CONTACTO & APOYO

Si hay problemas durante implementación:
- Revisar SECURITY.md (nuevas secciones de troubleshooting)
- Revisar Firebase Console logs
- Revisar console del navegador (developer tools)
- Considerar rollback a versión anterior

---

**¿PROCEDO CON IMPLEMENTACIÓN DE FASE 1?**
