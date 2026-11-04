/**
 * Script para asignar Custom Claims (roles) a usuarios en Firebase Auth
 */

const admin = require('firebase-admin');
const { getAuth } = require('firebase-admin/auth');
const fs = require('fs');
const path = require('path');

// Configurar Firebase Admin SDK
const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || 
  path.join(process.cwd(), 'firebaseAdminConfig.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error(`❌ Error: No se encontró configuración de Firebase Admin SDK`);
  console.error(`   Ruta esperada: ${serviceAccountPath}`);
  process.exit(1);
}

const serviceAccount = require(serviceAccountPath);

// Inicializar Firebase Admin SDK
admin.initializeApp({
  credential: admin.cert(serviceAccount),
});

// Obtener instancia de auth
const auth = getAuth();

const VALID_ROLES = ['admin', 'vendedor', 'contador'];

/**
 * Asignar Custom Claims a un usuario
 */
async function setUserRole(email, role) {
  try {
    if (!VALID_ROLES.includes(role)) {
      throw new Error(`Rol inválido: ${role}. Roles válidos: ${VALID_ROLES.join(', ')}`);
    }

    console.log(`📧 Buscando usuario: ${email}`);
    const user = await auth.getUserByEmail(email);
    console.log(`✅ Usuario encontrado: ${user.uid}`);
    
    console.log(`🔐 Asignando rol: ${role}`);
    await auth.setCustomUserClaims(user.uid, { role });
    
    console.log(`✅ Custom claims asignados exitosamente: {"role": "${role}"}`);
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    throw error;
  }
}

// Procesar argumentos
const args = process.argv.slice(2);

if (args.length < 2) {
  console.error('Uso: node setUserRole.cjs <email> <role>');
  console.error('Ejemplo: node setUserRole.cjs admin@empresa.com admin');
  process.exit(1);
}

const [email, role] = args;

setUserRole(email, role)
  .then(() => {
    console.log('\n✅ Proceso completado con éxito');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Proceso fallido');
    process.exit(1);
  });
