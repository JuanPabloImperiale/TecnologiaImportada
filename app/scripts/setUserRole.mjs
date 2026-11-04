/**
 * Script para asignar Custom Claims (roles) a usuarios en Firebase Auth
 * 
 * IMPORTANTE: Este script usa Firebase Admin SDK y requiere credenciales
 * de servicios (environment variable GOOGLE_APPLICATION_CREDENTIALS o
 * credenciales en firebaseAdminConfig.json)
 * 
 * Uso: node scripts/setUserRole.mjs <email> <role>
 * 
 * Roles permitidos: admin, vendedor, contador
 * 
 * Ejemplos:
 *   node scripts/setUserRole.mjs admin@empresa.com admin
 *   node scripts/setUserRole.mjs vendedor@empresa.com vendedor
 *   node scripts/setUserRole.mjs contador@empresa.com contador
 */

import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

// Configurar Firebase Admin SDK
const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || 
  path.join(process.cwd(), 'firebaseAdminConfig.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error(`❌ Error: No se encontró configuración de Firebase Admin SDK`);
  console.error(`   Proporciona: GOOGLE_APPLICATION_CREDENTIALS o firebaseAdminConfig.json`);
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id,
});

const auth = admin.auth();

const VALID_ROLES = ['admin', 'vendedor', 'contador'];

/**
 * Asignar Custom Claims a un usuario
 * @param {string} email - Email del usuario
 * @param {string} role - Rol a asignar (admin, vendedor, contador)
 */
async function setUserRole(email, role) {
  try {
    // Validar role
    if (!VALID_ROLES.includes(role)) {
      throw new Error(`Role '${role}' no válido. Roles permitidos: ${VALID_ROLES.join(', ')}`);
    }

    // Obtener usuario por email
    const user = await auth.getUserByEmail(email);
    
    // Asignar Custom Claims
    await auth.setCustomUserClaims(user.uid, { role });
    
    console.log(`✅ Role '${role}' asignado exitosamente a ${email}`);
    console.log(`   UID: ${user.uid}`);
    console.log(`\n⚠️  El usuario debe hacer logout/login para obtener el nuevo token.`);
    console.log(`   O actualizar la página (Firebase SDK lo detecta automáticamente).`);
    
    process.exit(0);
  } catch (error) {
    console.error(`❌ Error:`, error.message);
    process.exit(1);
  }
}

/**
 * Remover Custom Claims de un usuario
 * @param {string} email - Email del usuario
 */
async function removeUserRole(email) {
  try {
    const user = await auth.getUserByEmail(email);
    await auth.setCustomUserClaims(user.uid, {});
    
    console.log(`✅ Custom Claims removidos exitosamente de ${email}`);
    console.log(`   UID: ${user.uid}`);
    
    process.exit(0);
  } catch (error) {
    console.error(`❌ Error:`, error.message);
    process.exit(1);
  }
}

/**
 * Listar todos los usuarios y sus roles
 */
async function listUsersWithRoles() {
  try {
    const users = [];
    let pageToken;
    
    do {
      const page = await auth.listUsers(1000, pageToken);
      users.push(...page.users);
      pageToken = page.pageToken;
    } while (pageToken);
    
    console.log(`\n📋 Usuarios en Firebase Auth:\n`);
    console.log(`${'Email'.padEnd(30)} | ${'Role'.padEnd(15)} | ${'UID'}`);
    console.log(`${'-'.repeat(30)}-+-${'-'.repeat(15)}-+-${'-'.repeat(28)}`);
    
    users.forEach(user => {
      const role = user.customClaims?.role || '(sin role)';
      console.log(`${(user.email || '(sin email)').padEnd(30)} | ${role.padEnd(15)} | ${user.uid}`);
    });
    
    console.log(`\n Total: ${users.length} usuarios`);
    
    process.exit(0);
  } catch (error) {
    console.error(`❌ Error:`, error.message);
    process.exit(1);
  }
}

// Parse argumentos
const [, , command, email, role] = process.argv;

if (!command) {
  console.log(`
  📚 Uso:
  
  Asignar role:    node scripts/setUserRole.mjs <email> <role>
  Remover role:    node scripts/setUserRole.mjs remove <email>
  Listar usuarios: node scripts/setUserRole.mjs list
  
  Roles válidos: admin, vendedor, contador
  
  Ejemplos:
    node scripts/setUserRole.mjs admin@empresa.com admin
    node scripts/setUserRole.mjs vendedor@empresa.com vendedor
    node scripts/setUserRole.mjs remove contador@empresa.com
    node scripts/setUserRole.mjs list
  `);
  process.exit(0);
}

// Ejecutar comando
if (command === 'list') {
  listUsersWithRoles();
} else if (command === 'remove') {
  if (!email) {
    console.error('❌ Error: Proporciona el email del usuario a remover claims');
    console.error('Uso: node scripts/setUserRole.mjs remove <email>');
    process.exit(1);
  }
  removeUserRole(email);
} else if (email && role) {
  setUserRole(command, email); // command es el email
} else {
  // Asumir que command es email y email es role
  if (!command || !email) {
    console.error('❌ Error: Proporciona email y role');
    console.error('Uso: node scripts/setUserRole.mjs <email> <role>');
    process.exit(1);
  }
  setUserRole(command, email);
}
