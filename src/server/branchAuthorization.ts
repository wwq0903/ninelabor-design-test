import type { Request, Response, NextFunction } from 'express';
import { getAdminAuth, getAdminDb, isFirebaseAdminConfigured } from './firebaseAdmin';
import { canAccessBranchResource, type BranchPrincipal } from '../security/branchAccess';

/**
 * Mandatory branch gate for admin maternity operations.
 * Missing branch assignments must be migrated before access.
 * This guard is not sufficient by itself: Firestore/Storage rules and all other
 * endpoints must also enforce branch ownership.
 */
export async function requireMaternityBranchAccess(req: Request, res: Response, next: NextFunction) {
  if (!isFirebaseAdminConfigured()) return res.status(503).json({ error: 'AUTH_UNAVAILABLE' });
  const bearer = req.headers.authorization;
  if (!bearer?.startsWith('Bearer ') || !bearer.slice(7).trim()) {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }
  const companyId = req.body?.targetCompanyId;
  const caseId = req.params?.caseId;
  if (typeof companyId !== 'string' || !companyId.trim() || typeof caseId !== 'string' || !caseId.trim()) {
    return res.status(400).json({ error: 'INVALID_COMPANY' });
  }
  let decoded: { uid: string };
  try {
    decoded = await getAdminAuth().verifyIdToken(bearer.slice(7).trim(), true);
  } catch {
    return res.status(401).json({ error: 'INVALID_TOKEN' });
  }
  try {
    const db = getAdminDb();
    const [adminDoc, userDoc, companyDoc, caseDoc] = await Promise.all([
      db.collection('admins').doc(decoded.uid).get(),
      db.collection('users').doc(decoded.uid).get(),
      db.collection('companies').doc(companyId).get(),
      db.collection('maternity_cases').doc(caseId).get(),
    ]);
    const user = userDoc.data();
    const admin = adminDoc.data();
    const company = companyDoc.data();
    const maternityCase = caseDoc.data();
    // Authorize against the persisted case, never only the caller-provided company ID.
    if (!caseDoc.exists || maternityCase?.companyId !== companyId) {
      return res.status(403).json({ error: 'CASE_COMPANY_MISMATCH' });
    }
    if (!companyDoc.exists || !adminDoc.exists || !userDoc.exists || user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    // Never trust caller-supplied branch or permission fields.
    const principal: BranchPrincipal = {
      uid: decoded.uid,
      active: admin?.active === true && user?.isActive !== false && user?.status !== 'SUSPENDED' && user?.status !== 'DELETED',
      role: admin?.branchRole,
      branchId: admin?.branchId ?? null,
      permissions: admin?.permissions,
      assignedCompanyIds: admin?.assignedCompanyIds,
    };
    if (!canAccessBranchResource(principal, { branchId: company?.branchId ?? null, companyId }, 'maternity.write')) {
      return res.status(403).json({ error: 'BRANCH_ACCESS_DENIED' });
    }
    return next();
  } catch {
    return res.status(503).json({ error: 'AUTH_BACKEND_UNAVAILABLE' });
  }
}
