import { Request, Response } from 'express';
import crypto from 'crypto';
import firebaseConfig from '../../firebase-applet-config.json';
import { UserRole, MembershipType } from '../types';
import { isFirebaseAdminConfigured, getAdminAuth, getAdminDb } from './firebaseAdmin';
import { encryptRrn, validateRrn, isRrnEncryptionConfigured } from './rrnService';

// Verify caller's ADMIN permission strictly using:
// 1. Firebase ID Token verification (caller UID)
// 2. admins/{callerUid} document existence in Firestore
// 3. users/{callerUid}.role == 'ADMIN' in Firestore
// NO hardcoded emails and NO bootstrap emails.
async function verifyCallerIsAdmin(callerUid: string): Promise<{ branchId: string; branchRole: string; assignedCompanyIds: string[] } | null> {
  try {
    const db = getAdminDb();
    const [adminDoc, userDoc] = await Promise.all([
      db.collection('admins').doc(callerUid).get(),
      db.collection('users').doc(callerUid).get(),
    ]);
    const admin = adminDoc.data();
    const user = userDoc.data();
    if (!adminDoc.exists || !userDoc.exists || user?.role !== 'ADMIN' ||
        admin?.active !== true || user?.isActive === false ||
        ['SUSPENDED', 'DELETED'].includes(user?.status) ||
        typeof admin?.branchId !== 'string' || !/^[a-z0-9][a-z0-9_-]{1,63}$/.test(admin.branchId)) return null;
    return {
      branchId: admin.branchId,
      branchRole: admin.branchRole || '',
      assignedCompanyIds: Array.isArray(admin.assignedCompanyIds) ? admin.assignedCompanyIds : [],
    };
  } catch (error) {
    console.error('[Admin Auth Check] Administrator verification failed');
    return null;
  }
}

// Handler for POST /api/admin/create-user
export async function handleAdminCreateUser(req: Request, res: Response) {
  // Requirement 2: Strict enforcement of FIREBASE_SERVICE_ACCOUNT_KEY
  if (!isFirebaseAdminConfigured()) {
    return res.status(503).json({
      error: 'FIREBASE_SERVICE_ACCOUNT_KEY_REQUIRED',
      message: '서버 환경변수 FIREBASE_SERVICE_ACCOUNT_KEY 설정이 필요합니다. 올바른 Firebase 서비스 계정 키(JSON)를 서버에 등록해 주세요.',
    });
  }

  // Requirement 1: Verify ID Token
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: '인증 헤더(Bearer ID 토큰)가 누락되었습니다.',
    });
  }

  const idToken = authHeader.substring(7).trim();
  let decodedToken;
  try {
    const adminAuth = getAdminAuth();
    decodedToken = await adminAuth.verifyIdToken(idToken, true);
  } catch (tokenErr: any) {
    console.error('[Admin API] ID Token verification failed');
    return res.status(401).json({
      error: 'INVALID_TOKEN',
      message: '유효하지 않거나 만료된 Firebase 인증 토큰입니다. 다시 로그인해 주세요.',
    });
  }

  const callerUid = decodedToken.uid;

  // Requirement 1: Check Firestore ADMIN permission (admins/{uid} or users/{uid}.role == 'ADMIN')
  const callerAdmin = await verifyCallerIsAdmin(callerUid);
  if (!callerAdmin) {
    return res.status(403).json({
      error: 'FORBIDDEN',
      message: '최고관리자(ADMIN) 권한이 필요합니다.',
    });
  }

  // Role validation: Strictly block ADMIN and ATTORNEY creation; allow only COMPANY and WORKER
  const {
    role,
    email,
    displayName,
    phone,
    rrn,
    companyId,
    companyName,
    businessNumber,
    department,
    position,
    employeeId,
    joinDate,
    membershipType,
    simulateFirestoreFailure, // Internal flag for rollback testing
  } = req.body ?? {};

  if (role === 'ADMIN' || role === 'ATTORNEY') {
    return res.status(400).json({
      error: 'ROLE_CREATION_NOT_ALLOWED',
      message: 'ADMIN 및 ATTORNEY 계정은 이 API를 통해 생성할 수 없습니다. (COMPANY 및 WORKER만 생성 가능)',
    });
  }

  if (role !== 'COMPANY' && role !== 'WORKER') {
    return res.status(400).json({
      error: 'INVALID_ROLE',
      message: '생성할 역할은 COMPANY 또는 WORKER여야 합니다.',
    });
  }

  // Schema input validation
  if (phone != null && (typeof phone !== 'string' || phone.length > 32)) return res.status(400).json({ error: 'INVALID_PHONE' });
  // Firebase Auth requires E.164 phone numbers. Store Korean/local contact numbers in Firestore only.
  // Reject conflicting membership flags rather than creating a worker linked to a company
  // while their membership claims they are an unaffiliated individual.
  if (membershipType != null && !['INDIVIDUAL', 'COMPANY_AFFILIATED'].includes(membershipType)) {
    return res.status(400).json({ error: 'INVALID_MEMBERSHIP_TYPE' });
  }
  for (const value of [email, displayName, companyName, businessNumber, department, position, employeeId, joinDate, membershipType]) {
    if (value != null && typeof value !== 'string') return res.status(400).json({ error: 'INVALID_FIELD_TYPE' });
  }
  const cleanEmail = (email || '').toString().trim().toLowerCase();
  if (cleanEmail.length > 254) return res.status(400).json({ error: 'INVALID_EMAIL' });
  if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
    return res.status(400).json({
      error: 'INVALID_EMAIL',
      message: '올바른 이메일 주소를 입력해 주세요.',
    });
  }

  const cleanName = (displayName || '').toString().trim();
  if (!cleanName || cleanName.length > 120) {
    return res.status(400).json({
      error: 'INVALID_DISPLAY_NAME',
      message: '사용자 이름(성명 또는 대표자명)을 입력해 주세요.',
    });
  }

  if (role === 'COMPANY') {
    const cleanCompanyName = (companyName || '').toString().trim();
    const cleanBusinessNumber = (businessNumber || '').toString().trim();

    if (!cleanCompanyName || cleanCompanyName.length > 200) {
      return res.status(400).json({
        error: 'MISSING_COMPANY_NAME',
        message: '회사명을 입력해 주세요.',
      });
    }
    if (!/^(?:[0-9]{10}|[0-9]{3}-[0-9]{2}-[0-9]{5})$/.test(cleanBusinessNumber)) {
      return res.status(400).json({
        error: 'MISSING_BUSINESS_NUMBER',
        message: '사업자등록번호를 입력해 주세요.',
      });
    }
  }

  // Requirement 3: If RRN is provided, verify RRN encryption key and format early
  if (rrn && typeof rrn === 'string' && rrn.trim()) {
    if (!isRrnEncryptionConfigured()) {
      return res.status(503).json({
        error: 'RRN_ENCRYPTION_KEY_REQUIRED',
        message: '주민등록번호 암호화 처리를 위해 서버 환경변수 RRN_ENCRYPTION_KEY 설정이 반드시 필요합니다.',
      });
    }

    const rrnValidation = validateRrn(rrn.trim());
    if (!rrnValidation.isValid) {
      return res.status(400).json({
        error: 'INVALID_RRN_FORMAT',
        message: rrnValidation.error || '올바른 주민등록번호 형식이 아닙니다.',
      });
    }
  }

  // Check tenant ownership BEFORE creating an Auth account. Never accept a caller's
  // arbitrary companyId as authorization and never overwrite an existing tenant.
  const requestedCompanyId = typeof companyId === 'string' ? companyId.trim() : '';
  if (companyId != null && typeof companyId !== 'string') {
    return res.status(400).json({ error: 'INVALID_COMPANY_ID' });
  }
  if (requestedCompanyId && !/^[a-zA-Z0-9_-]{1,128}$/.test(requestedCompanyId)) {
    return res.status(400).json({ error: 'INVALID_COMPANY_ID' });
  }
  if (role === 'COMPANY' && requestedCompanyId) {
    return res.status(400).json({ error: 'COMPANY_ID_NOT_ALLOWED', message: '신규 기업 ID는 서버에서 생성합니다.' });
  }
  if (role === 'WORKER' && requestedCompanyId && membershipType === 'INDIVIDUAL') {
    return res.status(400).json({ error: 'MEMBERSHIP_COMPANY_CONFLICT' });
  }
  if (role === 'WORKER' && !requestedCompanyId && membershipType === 'COMPANY_AFFILIATED') {
    return res.status(400).json({ error: 'MEMBERSHIP_COMPANY_CONFLICT' });
  }
  let verifiedCompanyName = '';
  if (role === 'WORKER' && requestedCompanyId) {
    const target = await getAdminDb().collection('companies').doc(requestedCompanyId).get();
    const data = target.data();
    if (!target.exists || data?.branchId !== callerAdmin.branchId ||
        (callerAdmin.branchRole === 'MANAGER' && !callerAdmin.assignedCompanyIds.includes(requestedCompanyId))) {
      return res.status(403).json({ error: 'COMPANY_BRANCH_ACCESS_DENIED' });
    }
    verifiedCompanyName = typeof data?.companyName === 'string' ? data.companyName : '';
  }
  // A production API must not expose a request-controlled failure switch.
  if (simulateFirestoreFailure && process.env.NODE_ENV !== 'test') {
    return res.status(400).json({ error: 'UNSUPPORTED_FIELD' });
  }

  // Generate cryptographically secure random password so admin never manages user's permanent password
  const temporaryPassword = `${crypto.randomBytes(18).toString('base64url')}!A1`;

  let createdUid: string | null = null;
  let createdCompanyId: string | null = null;
  let createdWorkerId: string | null = null;
  const adminAuth = getAdminAuth();
  const adminDb = getAdminDb();

  try {
    // Step 1: Create Firebase Auth User via Admin SDK
    try {
      const userRecord = await adminAuth.createUser({
        email: cleanEmail,
        password: temporaryPassword,
        displayName: cleanName,
        // Contact phone is not necessarily E.164; Auth phoneNumber must not be set here.
      });
      createdUid = userRecord.uid;
    } catch (authErr: any) {
      if (authErr.code === 'auth/email-already-exists') {
        return res.status(400).json({
          error: 'EMAIL_ALREADY_EXISTS',
          message: '이미 가입된 이메일입니다.',
        });
      }
      throw authErr;
    }

    if (!createdUid) {
      throw new Error('Auth 사용자 생성 결과 UID가 확인되지 않았습니다.');
    }

    // Testing hook: If simulateFirestoreFailure is set, trigger an error to test rollback
    if (simulateFirestoreFailure && process.env.NODE_ENV === 'test') {
      throw new Error('SIMULATED_FIRESTORE_WRITE_FAILURE');
    }

    // Step 2: Build all documents before a single atomic Firestore commit.
    // Firebase Auth is separate; on a Firestore failure, compensate by deleting Auth.
    const writeBatch = adminDb.batch();
    const now = new Date().toISOString();
    let assignedCompanyId: string | null = requestedCompanyId || null;
    let assignedCompanyName: string = role === 'WORKER' && assignedCompanyId
      ? verifiedCompanyName
      : ''; // Do not trust caller-provided companyName for an existing company.

    // 2-A. For COMPANY role, create company record if not existing
    if (role === 'COMPANY') {
      const targetCompanyId = `comp_${crypto.randomUUID()}`;
      assignedCompanyId = targetCompanyId;
      assignedCompanyName = (companyName || '등록 기업').trim();

      const newCompanyData = {
        id: targetCompanyId,
        branchId: callerAdmin.branchId,
        companyName: assignedCompanyName,
        businessNumber: (businessNumber || '미등록').trim(),
        representativeName: cleanName,
        contactEmail: cleanEmail,
        contactPhone: phone?.trim() || '',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      };

      const bn = newCompanyData.businessNumber;
      const maskedBn = `***-**-${bn.replace(/\D/g, '').slice(-5)}`;
      const directoryEntry = {
        companyId: targetCompanyId,
        branchId: callerAdmin.branchId,
        companyName: assignedCompanyName,
        businessNumberMasked: maskedBn,
        createdAt: now,
      };

      writeBatch.create(adminDb.collection('companies').doc(targetCompanyId), newCompanyData);
      writeBatch.create(adminDb.collection('company_directory').doc(targetCompanyId), directoryEntry);
      createdCompanyId = targetCompanyId;
    }

    // 2-B. Build User Profile matching project schema
    const effectiveMembershipType: MembershipType =
      role === 'COMPANY'
        ? 'COMPANY_AFFILIATED'
        : !assignedCompanyId
        ? 'INDIVIDUAL'
        : 'COMPANY_AFFILIATED';

    const userProfileData: Record<string, any> = {
      uid: createdUid,
      email: cleanEmail,
      displayName: cleanName,
      role: role as UserRole,
      membershipType: effectiveMembershipType,
      membershipStatus: 'ACTIVE',
      companyId: assignedCompanyId,
      branchId: callerAdmin.branchId,
      createdAt: now,
      updatedAt: now,
    };

    if (phone?.trim()) userProfileData.phone = phone.trim();
    if (assignedCompanyName) userProfileData.companyName = assignedCompanyName;
    if (department?.trim()) userProfileData.department = department.trim();
    if (position?.trim()) userProfileData.position = position.trim();
    if (employeeId?.trim()) userProfileData.employeeId = employeeId.trim();

    // Secure RRN Encryption (Requirement 3: strictly encrypted, never plaintext)
    let encryptedRrnData: { rrnEncrypted: string; maskedRrn: string } | null = null;
    if (rrn && typeof rrn === 'string' && rrn.trim()) {
      encryptedRrnData = encryptRrn(rrn.trim());
      userProfileData.maskedRrn = encryptedRrnData.maskedRrn;
      userProfileData.hasRrn = true;
    }

    // Write users/{uid}
    writeBatch.create(adminDb.collection('users').doc(createdUid), userProfileData);

    // If RRN encrypted, store strictly in worker_sensitive_data/{createdUid}
    if (encryptedRrnData) {
      const sensitiveData = {
        workerId: createdUid,
        userId: createdUid,
        rrnEncrypted: encryptedRrnData.rrnEncrypted,
        maskedRrn: encryptedRrnData.maskedRrn,
        updatedAt: now,
        updatedBy: callerUid,
      };
      writeBatch.create(adminDb.collection('worker_sensitive_data').doc(createdUid), sensitiveData);
    }

    // 2-C. For WORKER role with company affiliation, write to workers collection
    if (role === 'WORKER' && assignedCompanyId) {
      const workerId = `wrk_${crypto.randomUUID()}`;
      createdWorkerId = workerId;
      const workerRecord: Record<string, any> = {
        id: workerId,
        companyId: assignedCompanyId,
        branchId: callerAdmin.branchId,
        userId: createdUid,
        name: cleanName,
        email: cleanEmail,
        phone: phone?.trim() || '',
        department: department?.trim() || '',
        position: position?.trim() || '',
        joinDate: joinDate || now.split('T')[0],
        status: 'active',
        createdAt: now,
        updatedAt: now,
      };

      if (encryptedRrnData) {
        workerRecord.maskedRrn = encryptedRrnData.maskedRrn;
        workerRecord.hasRrn = true;

        const sensitiveWorkerData = {
          workerId,
          userId: createdUid,
          rrnEncrypted: encryptedRrnData.rrnEncrypted,
          maskedRrn: encryptedRrnData.maskedRrn,
          updatedAt: now,
          updatedBy: callerUid,
        };
        writeBatch.create(adminDb.collection('worker_sensitive_data').doc(workerId), sensitiveWorkerData);
      }

      writeBatch.create(adminDb.collection('workers').doc(workerId), workerRecord);
    }

    // Step 3: Record Audit Log
    const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const auditLogData = {
      id: logId,
      actorUserId: callerUid,
      actorRole: 'ADMIN',
      actorName: '최고관리자',
      action: 'ADMIN_USER_CREATED',
      resourceType: 'users',
      resourceId: createdUid,
      timestamp: now,
      branchId: callerAdmin.branchId,
      details: {
        targetRole: role,
        // Keep direct identifiers out of general-purpose audit details.
        companyId: assignedCompanyId || undefined,
        branchId: callerAdmin.branchId,
      },
    };

    writeBatch.create(adminDb.collection('audit_logs').doc(logId), auditLogData);
    // Either all business documents and the audit event are committed, or none are.
    await writeBatch.commit();

    // Step 4: Trigger Password Reset flow so admin never manages user's permanent password
    let passwordResetSuccess = false;
    try {
      const resetUrl = `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${firebaseConfig.apiKey}`;
      const resetRes = await fetch(resetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestType: 'PASSWORD_RESET',
          email: cleanEmail,
        }),
      });
      passwordResetSuccess = resetRes.ok;
    } catch (resetErr: any) {
      console.warn('[Password Reset] Failed to trigger password reset email');
    }

    // Final Success Response
    return res.status(201).json({
      success: true,
      message: `${cleanName}님의 계정이 정상적으로 생성되었습니다.`,
      user: {
        uid: createdUid,
        email: cleanEmail,
        displayName: cleanName,
        role,
        membershipType: effectiveMembershipType,
        membershipStatus: 'ACTIVE',
        companyId: assignedCompanyId,
      },
      passwordResetTriggered: passwordResetSuccess,
    });
  } catch (error: any) {
    console.error('[Admin API] Error in create-user workflow');

    // A failed atomic Firestore batch leaves no partially written documents.
    // Rollback created Auth account if Firestore profile write failed
    if (createdUid) {
      console.warn('[ROLLBACK] Initiating Auth rollback');
      try {
        await adminAuth.deleteUser(createdUid);
        console.log('[ROLLBACK] Orphan Auth account deleted successfully');
      } catch (rollbackErr: any) {
        console.error('[ROLLBACK] Failed to delete orphan Auth account');
      }
    }

    return res.status(500).json({
      error: 'USER_CREATION_FAILED',
      message:
        error.message === 'SIMULATED_FIRESTORE_WRITE_FAILURE'
          ? 'Firestore 저장 실패로 인해 생성된 Auth 계정이 안전하게 롤백(삭제)되었습니다.'
          : '회원 계정 및 데이터 생성 중 오류가 발생하여 계정 생성이 취소되었습니다.',
    });
  }
}
