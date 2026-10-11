import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// CRITICAL: The app will break without specifying firestoreDatabaseId
export const db = getFirestore(app, (firebaseConfig as { firestoreDatabaseId: string }).firestoreDatabaseId);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

/** Report only a stable error code to the UI. Never serialize auth identity or provider metadata. */
export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const code = typeof error === 'object' && error !== null && 'code' in error &&
    typeof (error as { code?: unknown }).code === 'string'
    ? (error as { code: string }).code
    : 'unknown';
  // Paths can contain tenant IDs and document IDs; keep them out of user-visible errors.
  console.error('Firestore operation failed', { operationType, code });
  const userMessage = code === 'permission-denied'
    ? '해당 작업을 수행할 권한이 없습니다.'
    : code === 'unavailable' || code === 'deadline-exceeded'
      ? '서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.'
      : '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
  throw new Error(userMessage);
}
