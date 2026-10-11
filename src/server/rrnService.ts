import { Request, Response } from 'express';
import crypto from 'crypto';
import { isFirebaseAdminConfigured, getAdminAuth, getAdminDb } from './firebaseAdmin';

// Check if RRN encryption key is configured
export function isRrnEncryptionConfigured(): boolean {
  const secret = process.env.RRN_ENCRYPTION_KEY;
  return Boolean(secret && typeof secret === 'string' && secret.trim().length > 0);
}

// Cryptographic Key Management (AES-256-GCM)
// Strictly requires RRN_ENCRYPTION_KEY in environment variables
// NO default key, NO temporary key generation, NO hardcoding, NO plaintext fallback
export function getEncryptionKey(): Buffer {
  const secret = process.env.RRN_ENCRYPTION_KEY;
  if (!secret || typeof secret !== 'string' || !secret.trim()) {
    throw new Error('RRN_ENCRYPTION_KEY_REQUIRED: 주민등록번호 암호화 처리를 위해 서버 환경변수 RRN_ENCRYPTION_KEY 설정이 반드시 필요합니다.');
  }
  return crypto.createHash('sha256').update(secret.trim()).digest();
}

// Validate Korean Resident Registration Number format
export function validateRrn(rrn: string): { isValid: boolean; cleanRrn: string; error?: string } {
  const clean = (rrn || '').toString().replace(/[^0-9]/g, '');
  if (clean.length !== 13) {
    return { isValid: false, cleanRrn: '', error: '주민등록번호는 숫자 13자리여야 합니다.' };
  }

  // Validate 7th digit (gender code: 1~8)
  const genderCode = parseInt(clean.charAt(6), 10);
  if (genderCode < 1 || genderCode > 8) {
    return { isValid: false, cleanRrn: '', error: '올바르지 않은 주민등록번호 형식입니다.' };
  }

  return { isValid: true, cleanRrn: clean };
}

// Encrypt RRN with AES-256-GCM
export function encryptRrn(plainRrn: string): { rrnEncrypted: string; maskedRrn: string } {
  const validation = validateRrn(plainRrn);
  if (!validation.isValid) {
    throw new Error(validation.error || '유효하지 않은 주민등록번호입니다.');
  }

  const clean = validation.cleanRrn;
  const formattedPlain = `${clean.substring(0, 6)}-${clean.substring(6)}`;
  const key = getEncryptionKey(); // Strictly throws if RRN_ENCRYPTION_KEY is missing
  const iv = crypto.randomBytes(12); // Standard 12 bytes IV for AES-GCM

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(formattedPlain, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  const rrnEncrypted = `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  const maskedRrn = `${clean.substring(0, 6)}-${clean.substring(6, 7)}******`;

  return { rrnEncrypted, maskedRrn };
}

// Decrypt RRN with AES-256-GCM
export function decryptRrn(encryptedString: string): string {
  if (!encryptedString || !encryptedString.includes(':')) {
    throw new Error('유효하지 않은 암호화 데이터 포맷입니다.');
  }

  const parts = encryptedString.split(':');
  if (parts.length !== 3) {
    throw new Error('암호화 데이터 구성요소가 올바르지 않습니다.');
  }

  const [ivHex, authTagHex, cipherHex] = parts;
  // Buffer.from(hex) silently truncates malformed input. Validate before decrypting.
  if (!/^[a-f0-9]{24}$/i.test(ivHex) || !/^[a-f0-9]{32}$/i.test(authTagHex) ||
      !/^(?:[a-f0-9]{2})+$/i.test(cipherHex) || cipherHex.length > 256) {
    throw new Error('유효하지 않은 암호화 데이터 포맷입니다.');
  }
  const key = getEncryptionKey(); // Strictly throws if RRN_ENCRYPTION_KEY is missing
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

// Check ADMIN privilege strictly based on:
// 1. Firebase ID Token verification (done by caller)
// 2. admins/{uid} document existence in Firestore
// 3. users/{uid}.role == 'ADMIN' in Firestore
// No email hardcoding or bootstrap email
/** Both role records, active status and branch assignment are mandatory. */
export async function checkCallerAdmin(callerUid: string): Promise<boolean> {
  try {
    const db = getAdminDb();
    const [admin, user] = await Promise.all([
      db.collection('admins').doc(callerUid).get(),
      db.collection('users').doc(callerUid).get(),
    ]);
    const a = admin.data();
    const u = user.data();
    return admin.exists && user.exists && u?.role === 'ADMIN' &&
      a?.active === true && u?.isActive !== false &&
      u?.status !== 'SUSPENDED' && u?.status !== 'DELETED' &&
      typeof a?.branchId === 'string' && /^[a-z0-9][a-z0-9_-]{1,63}$/.test(a.branchId) &&
      ['SUPER_ADMIN', 'ATTORNEY', 'MANAGER'].includes(a?.branchRole);
  } catch {
    return false;
  }
}

/** Resolve the persisted worker and company; never authorize by request body. */
async function authorizeWorkerRrn(callerUid: string, workerId: string) {
  if (!workerId || workerId.includes('/') || workerId.length > 128) return null;
  const db = getAdminDb();
  const [admin, user, worker] = await Promise.all([
    db.collection('admins').doc(callerUid).get(),
    db.collection('users').doc(callerUid).get(),
    db.collection('workers').doc(workerId).get(),
  ]);
  const a = admin.data();
  const u = user.data();
  const w = worker.data();
  if (!admin.exists || !user.exists || !worker.exists || u?.role !== 'ADMIN' ||
      a?.active !== true || u?.isActive === false ||
      ['SUSPENDED', 'DELETED'].includes(u?.status) ||
      !['SUPER_ADMIN', 'ATTORNEY', 'MANAGER'].includes(a?.branchRole) ||
      !w?.companyId || typeof w.companyId !== 'string') return null;
  const company = await db.collection('companies').doc(w.companyId).get();
  const branchId = company.data()?.branchId;
  if (!company.exists || !branchId || branchId !== a?.branchId ||
      w?.branchId && w.branchId !== branchId ||
      a.branchRole === 'MANAGER' && !a.assignedCompanyIds?.includes(w.companyId)) return null;
  return { worker: w, companyId: w.companyId, branchId };
}

// Record Audit Log (Strictly WITHOUT plain or decrypted RRN)
async function recordAuditLog(
  actorUserId: string,
  actorRole: string,
  action: 'SENSITIVE_RRN_CREATED' | 'SENSITIVE_RRN_VIEWED' | 'SENSITIVE_RRN_UPDATED',
  resourceId: string
) {
  try {
    const adminDb = getAdminDb();
    const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const auditData = {
      id: logId,
      actorUserId,
      actorRole,
      actorName: actorRole === 'ADMIN' ? '최고관리자' : '사용자',
      action,
      resourceType: 'worker_sensitive_data',
      resourceId,
      timestamp: new Date().toISOString(),
    };

    await adminDb.collection('audit_logs').doc(logId).set(auditData);
  } catch (err: any) {
    console.warn('[Audit Log] Failed to write sensitive RRN audit log:', err.message);
  }
}

// GET /api/admin/worker-rrn/:workerId
// Requirement: Automatic retrieval and decryption for verified ADMIN
// Returns 503 if FIREBASE_SERVICE_ACCOUNT_KEY or RRN_ENCRYPTION_KEY is missing
export async function handleGetWorkerRrn(req: Request, res: Response) {
  if (!isFirebaseAdminConfigured()) {
    return res.status(503).json({
      error: 'FIREBASE_SERVICE_ACCOUNT_KEY_REQUIRED',
      message: '서버 환경변수 FIREBASE_SERVICE_ACCOUNT_KEY 설정이 필요합니다. 올바른 Firebase 서비스 계정 키(JSON)를 서버에 등록해 주세요.',
    });
  }

  if (!isRrnEncryptionConfigured()) {
    return res.status(503).json({
      error: 'RRN_ENCRYPTION_KEY_REQUIRED',
      message: '서버 환경변수 RRN_ENCRYPTION_KEY 설정이 필요합니다. 주민등록번호 복호화 키를 등록해 주세요.',
    });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: '인증 헤더(Bearer 토큰)가 필요합니다.' });
  }

  const idToken = authHeader.substring(7).trim();
  let decodedToken;
  try {
    const adminAuth = getAdminAuth();
    decodedToken = await adminAuth.verifyIdToken(idToken, true);
  } catch {
    return res.status(401).json({ error: 'INVALID_TOKEN', message: '유효하지 않거나 만료된 인증 토큰입니다.' });
  }

  const callerUid = decodedToken.uid;

  // Strict ADMIN Verification (admins/{uid} or users/{uid}.role == 'ADMIN')
  const isAdmin = await checkCallerAdmin(callerUid);
  if (!isAdmin) {
    return res.status(403).json({
      error: 'FORBIDDEN',
      message: '주민등록번호 전체 조회를 위한 최고관리자(ADMIN) 권한이 필요합니다.',
    });
  }

  const { workerId } = req.params;
  if (!workerId) {
    return res.status(400).json({ error: 'MISSING_WORKER_ID', message: '근로자 식별자(workerId)가 필요합니다.' });
  }

  try {
    const access = await authorizeWorkerRrn(callerUid, workerId);
    if (!access) return res.status(403).json({ error: 'BRANCH_ACCESS_DENIED' });
    const adminDb = getAdminDb();

    // 1. Check worker_sensitive_data collection by workerId
    let sensitiveSnap = await adminDb.collection('worker_sensitive_data').doc(workerId).get();
    let sensitiveDoc = sensitiveSnap.exists ? sensitiveSnap.data() : null;

    // 2. If not found by workerId, check if worker record has a linked userId
    if (!sensitiveDoc) {
      const workerSnap = await adminDb.collection('workers').doc(workerId).get();
      if (workerSnap.exists) {
        const workerData = workerSnap.data();
        if (workerData?.userId && workerData.userId === access.worker.userId) {
          const userSensitiveSnap = await adminDb.collection('worker_sensitive_data').doc(workerData.userId).get();
          if (userSensitiveSnap.exists) {
            sensitiveDoc = userSensitiveSnap.data();
          }
        }
      }
    }

    if (sensitiveDoc && (!sensitiveDoc.userId || sensitiveDoc.userId !== access.worker.userId)) {
      return res.status(403).json({ error: 'SENSITIVE_RECORD_MISMATCH' });
    }
    if (!sensitiveDoc || !sensitiveDoc.rrnEncrypted) {
      return res.status(404).json({
        error: 'RRN_NOT_FOUND',
        message: '해당 근로자의 등록된 주민등록번호 정보가 없습니다.',
      });
    }

    // Decrypt on server using verified key
    const plainRrn = decryptRrn(sensitiveDoc.rrnEncrypted);

    // Record Audit Log (without plain RRN)
    await recordAuditLog(callerUid, 'ADMIN', 'SENSITIVE_RRN_VIEWED', workerId);

    return res.json({
      success: true,
      workerId,
      rrn: plainRrn,
      maskedRrn: sensitiveDoc.maskedRrn || `${plainRrn.substring(0, 6)}-${plainRrn.substring(7, 8)}******`,
    });
  } catch (err: any) {
    console.error('[RRN Service] Failed to retrieve/decrypt RRN for worker:', workerId, err.message);
    return res.status(500).json({
      error: 'RRN_DECRYPTION_FAILED',
      message: '주민등록번호 복호화 처리 중 오류가 발생했습니다.',
    });
  }
}

// POST /api/admin/worker-rrn/:workerId
// Requirement: ADMIN registers or updates worker's RRN safely
// Returns 503 if FIREBASE_SERVICE_ACCOUNT_KEY or RRN_ENCRYPTION_KEY is missing
export async function handleSaveWorkerRrn(req: Request, res: Response) {
  if (!isFirebaseAdminConfigured()) {
    return res.status(503).json({
      error: 'FIREBASE_SERVICE_ACCOUNT_KEY_REQUIRED',
      message: '서버 환경변수 FIREBASE_SERVICE_ACCOUNT_KEY 설정이 필요합니다. 올바른 Firebase 서비스 계정 키(JSON)를 서버에 등록해 주세요.',
    });
  }

  if (!isRrnEncryptionConfigured()) {
    return res.status(503).json({
      error: 'RRN_ENCRYPTION_KEY_REQUIRED',
      message: '서버 환경변수 RRN_ENCRYPTION_KEY 설정이 필요합니다. 주민등록번호 암호화 키를 등록해 주세요.',
    });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: '인증 헤더(Bearer 토큰)가 필요합니다.' });
  }

  const idToken = authHeader.substring(7).trim();
  let decodedToken;
  try {
    const adminAuth = getAdminAuth();
    decodedToken = await adminAuth.verifyIdToken(idToken, true);
  } catch {
    return res.status(401).json({ error: 'INVALID_TOKEN', message: '유효하지 않거나 만료된 인증 토큰입니다.' });
  }

  const callerUid = decodedToken.uid;

  // Strict ADMIN Verification (admins/{uid} or users/{uid}.role == 'ADMIN')
  const isAdmin = await checkCallerAdmin(callerUid);
  if (!isAdmin) {
    return res.status(403).json({
      error: 'FORBIDDEN',
      message: '주민등록번호 등록/수정을 위한 최고관리자(ADMIN) 권한이 필요합니다.',
    });
  }

  const { workerId } = req.params;
  const { rrn, userId } = req.body;

  if (!workerId) {
    return res.status(400).json({ error: 'MISSING_WORKER_ID', message: '근로자 식별자(workerId)가 필요합니다.' });
  }

  const validation = validateRrn(rrn);
  if (!validation.isValid) {
    return res.status(400).json({ error: 'INVALID_RRN_FORMAT', message: validation.error });
  }

  try {
    const access = await authorizeWorkerRrn(callerUid, workerId);
    if (!access) return res.status(403).json({ error: 'BRANCH_ACCESS_DENIED' });
    if (userId !== undefined && userId !== null && userId !== access.worker.userId) {
      return res.status(400).json({ error: 'WORKER_USER_MISMATCH' });
    }
    const adminDb = getAdminDb();
    const existing = await adminDb.collection('worker_sensitive_data').doc(workerId).get();
    if (existing.exists && existing.data()?.userId && existing.data()?.userId !== access.worker.userId) {
      return res.status(409).json({ error: 'SENSITIVE_RECORD_MISMATCH' });
    }

    // Encrypt with AES-256-GCM
    const { rrnEncrypted, maskedRrn } = encryptRrn(validation.cleanRrn);
    const now = new Date().toISOString();

    // 1. Store in separate worker_sensitive_data collection
    const sensitiveData = {
      workerId,
      userId: access.worker.userId || null,
      companyId: access.companyId,
      branchId: access.branchId,
      rrnEncrypted,
      maskedRrn,
      updatedAt: now,
      updatedBy: callerUid,
    };
    await adminDb.collection('worker_sensitive_data').doc(workerId).set(sensitiveData, { merge: true });

    // 2. Update general workers document with ONLY maskedRrn (Never plaintext!)
    try {
      await adminDb.collection('workers').doc(workerId).set({ maskedRrn, hasRrn: true, updatedAt: now }, { merge: true });
    } catch (wErr) {
      console.warn('[RRN Service] Worker document update notice:', wErr);
    }

    // 3. If linked userId exists, update users/{userId} with ONLY maskedRrn
    if (access.worker.userId) {
      try {
        await adminDb.collection('users').doc(access.worker.userId).set({ maskedRrn, hasRrn: true, updatedAt: now }, { merge: true });
      } catch (uErr) {
        console.warn('[RRN Service] User document update notice:', uErr);
      }
    }

    // Record Audit Log
    await recordAuditLog(callerUid, 'ADMIN', 'SENSITIVE_RRN_UPDATED', workerId);

    return res.json({
      success: true,
      message: '주민등록번호가 안전하게 암호화되어 저장되었습니다.',
      workerId,
      maskedRrn,
    });
  } catch (err: any) {
    console.error('[RRN Service] Failed to save encrypted RRN for worker:', workerId, err.message);
    return res.status(500).json({
      error: 'RRN_ENCRYPTION_FAILED',
      message: '주민등록번호 암호화 저장 중 오류가 발생했습니다.',
    });
  }
}

// POST /api/worker/submit-rrn
// Worker self submission during onboarding / profile completion
// Returns 503 if FIREBASE_SERVICE_ACCOUNT_KEY or RRN_ENCRYPTION_KEY is missing
export async function handleWorkerSubmitRrn(req: Request, res: Response) {
  if (!isFirebaseAdminConfigured()) {
    return res.status(503).json({
      error: 'FIREBASE_SERVICE_ACCOUNT_KEY_REQUIRED',
      message: '서버 환경변수 FIREBASE_SERVICE_ACCOUNT_KEY 설정이 필요합니다. 올바른 Firebase 서비스 계정 키(JSON)를 서버에 등록해 주세요.',
    });
  }

  if (!isRrnEncryptionConfigured()) {
    return res.status(503).json({
      error: 'RRN_ENCRYPTION_KEY_REQUIRED',
      message: '서버 환경변수 RRN_ENCRYPTION_KEY 설정이 필요합니다. 주민등록번호 암호화 키를 등록해 주세요.',
    });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: '인증 헤더(Bearer 토큰)가 필요합니다.' });
  }

  const idToken = authHeader.substring(7).trim();
  let decodedToken;
  try {
    const adminAuth = getAdminAuth();
    decodedToken = await adminAuth.verifyIdToken(idToken, true);
  } catch {
    return res.status(401).json({ error: 'INVALID_TOKEN', message: '유효하지 않거나 만료된 인증 토큰입니다.' });
  }

  const callerUid = decodedToken.uid;
  const { rrn, workerId } = req.body;

  const validation = validateRrn(rrn);
  if (!validation.isValid) {
    return res.status(400).json({ error: 'INVALID_RRN_FORMAT', message: validation.error });
  }

  try {
    const adminDb = getAdminDb();
    // Never trust a caller-supplied workerId. A worker may submit only for
    // their own user profile or a worker record explicitly linked to their UID.
    const callerSnap = await adminDb.collection('users').doc(callerUid).get();
    const callerProfile = callerSnap.data();
    if (!callerSnap.exists || callerProfile?.role !== 'WORKER' || callerProfile?.isActive === false ||
        callerProfile?.status === 'SUSPENDED' || callerProfile?.status === 'DELETED') {
      return res.status(403).json({ error: 'WORKER_ONLY' });
    }
    if (workerId !== undefined && (typeof workerId !== 'string' || !workerId.trim() || workerId.includes('/'))) {
      return res.status(400).json({ error: 'INVALID_WORKER_ID' });
    }
    if (workerId && workerId !== callerUid) {
      const linkedWorker = await adminDb.collection('workers').doc(workerId).get();
      if (!linkedWorker.exists || linkedWorker.data()?.userId !== callerUid) {
        return res.status(403).json({ error: 'WORKER_OWNERSHIP_REQUIRED' });
      }
    }
    const targetDocId = workerId || callerUid;
    const existingSensitive = await adminDb.collection('worker_sensitive_data').doc(targetDocId).get();
    if (existingSensitive.exists && existingSensitive.data()?.userId !== callerUid) {
      return res.status(403).json({ error: 'SENSITIVE_RECORD_OWNERSHIP_REQUIRED' });
    }
    const { rrnEncrypted, maskedRrn } = encryptRrn(validation.cleanRrn);
    const now = new Date().toISOString();
    const sensitiveData = {
      workerId: targetDocId,
      userId: callerUid,
      rrnEncrypted,
      maskedRrn,
      updatedAt: now,
      updatedBy: callerUid,
    };

    // Store encrypted RRN in worker_sensitive_data
    await adminDb.collection('worker_sensitive_data').doc(targetDocId).set(sensitiveData, { merge: true });

    // Update users/{callerUid} with ONLY maskedRrn (Never plaintext!)
    await adminDb.collection('users').doc(callerUid).set({ maskedRrn, hasRrn: true, updatedAt: now }, { merge: true });

    // If workerId provided, also update workers/{workerId} with maskedRrn
    if (workerId) {
      try {
        await adminDb.collection('workers').doc(workerId).set({ maskedRrn, hasRrn: true, updatedAt: now }, { merge: true });
      } catch (e) {
        console.warn('[handleWorkerSubmitRrn] Worker document update notice:', e);
      }
    }

    // Record Audit Log
    await recordAuditLog(callerUid, 'WORKER', 'SENSITIVE_RRN_CREATED', targetDocId);

    return res.json({
      success: true,
      message: '주민등록번호가 안전하게 암호화되어 등록되었습니다.',
      maskedRrn,
    });
  } catch (err: any) {
    console.error('[RRN Service] Worker self submit error:', err.message);
    return res.status(500).json({
      error: 'RRN_SUBMISSION_FAILED',
      message: '주민등록번호 암호화 저장 처리 중 오류가 발생했습니다.',
    });
  }
}
