import { initializeApp, cert, getApps, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

let adminApp: App | null = null;
let adminAuth: Auth | null = null;
let adminDb: Firestore | null = null;
let isServiceAccountConfigured = false;
let configErrorMessage: string | null = null;

function initFirebaseAdmin(): void {
  if (isServiceAccountConfigured && adminAuth && adminDb) {
    return;
  }

  const serviceAccountKeyEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (!serviceAccountKeyEnv || !serviceAccountKeyEnv.trim()) {
    isServiceAccountConfigured = false;
    configErrorMessage = 'FIREBASE_SERVICE_ACCOUNT_KEY 환경변수가 설정되지 않았습니다.';
    return;
  }

  try {
    const rawKey = serviceAccountKeyEnv.trim();
    const serviceAccount = JSON.parse(rawKey);

    // Never initialize against a service account belonging to another Firebase project.
    if (!serviceAccount || serviceAccount.project_id !== firebaseConfig.projectId ||
        typeof serviceAccount.client_email !== 'string' ||
        typeof serviceAccount.private_key !== 'string') {
      throw new Error('Service account project mismatch or invalid credentials');
    }

    if (getApps().length === 0) {
      adminApp = initializeApp({
        credential: cert(serviceAccount),
        projectId: firebaseConfig.projectId,
      });
    } else {
      // Reusing an unrelated app could cross tenant/project boundaries.
      const existing = getApps().find(app => app.options.projectId === firebaseConfig.projectId);
      if (!existing) throw new Error('Firebase Admin app project mismatch');
      adminApp = existing;
    }

    adminAuth = getAuth(adminApp);
    adminDb = getFirestore(adminApp, firebaseConfig.firestoreDatabaseId);
    isServiceAccountConfigured = true;
    configErrorMessage = null;
    console.log('[Firebase Admin] Successfully initialized with FIREBASE_SERVICE_ACCOUNT_KEY');
  } catch (err: any) {
    console.error('[Firebase Admin] Failed to initialize (verify credentials and project configuration).');
    isServiceAccountConfigured = false;
    configErrorMessage = 'FIREBASE_SERVICE_ACCOUNT_KEY 설정 또는 초기화 오류';
  }
}

// Initial bootstrap attempt
initFirebaseAdmin();

export function isFirebaseAdminConfigured(): boolean {
  if (!isServiceAccountConfigured) {
    initFirebaseAdmin();
  }
  return isServiceAccountConfigured && adminAuth !== null && adminDb !== null;
}

export function getAdminAuth(): Auth {
  if (!isFirebaseAdminConfigured() || !adminAuth) {
    throw new Error(configErrorMessage || 'FIREBASE_SERVICE_ACCOUNT_KEY_REQUIRED');
  }
  return adminAuth;
}

export function getAdminDb(): Firestore {
  if (!isFirebaseAdminConfigured() || !adminDb) {
    throw new Error(configErrorMessage || 'FIREBASE_SERVICE_ACCOUNT_KEY_REQUIRED');
  }
  return adminDb;
}
