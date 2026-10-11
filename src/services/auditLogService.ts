import {
  collection,
  doc,
  getDocs,
  setDoc,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { sanitizeAuditDetails } from '../utils/sanitizeAuditDetails';
import { AuditLog, UserRole } from '../types';

export const auditLogService = {
  async logAction(entry: {
    actorUserId: string;
    actorRole: UserRole;
    actorName: string;
    companyId?: string;
    action: string;
    resourceType: string;
    resourceId: string;
    details?: Record<string, any>;
  }): Promise<void> {
    // Never trust an arbitrary caller-supplied actor ID, including in client-side audit logs.
    const signedInUid = auth.currentUser?.uid;
    if (!signedInUid || entry.actorUserId !== signedInUid) {
      console.warn('Audit log skipped: actor identity mismatch');
      return;
    }
    const logId = doc(collection(db, 'audit_logs')).id;
    const docRef = doc(db, 'audit_logs', logId);
    const now = new Date().toISOString();
    const sanitizedDetails = sanitizeAuditDetails(entry.details ?? {});

    const log: AuditLog = {
      id: logId,
      actorUserId: entry.actorUserId,
      actorRole: entry.actorRole,
      actorName: entry.actorName,
      companyId: entry.companyId || undefined,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      timestamp: now,
      details: sanitizedDetails && typeof sanitizedDetails === 'object' && Object.keys(sanitizedDetails).length > 0
        ? sanitizedDetails as Record<string, any> : undefined,
    };

    try {
      await setDoc(docRef, log);
    } catch (error) {
      // Non-blocking log write failure
      console.warn('Audit log write error', error);
    }
  },

  async getAuditLogs(maxCount: number = 100): Promise<AuditLog[]> {
    const colRef = collection(db, 'audit_logs');
    try {
      const snap = await getDocs(query(colRef, orderBy('timestamp', 'desc'), limit(Math.max(1, Math.min(maxCount, 200)))));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AuditLog));
      return list
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, maxCount);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'audit_logs');
    }
  },
};
