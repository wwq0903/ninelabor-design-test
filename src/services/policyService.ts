import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { UserConsent } from '../types';
import { CURRENT_TERMS_VERSION, POLICY_DOCUMENTS, PolicyDocument } from '../config/policies';

export const policyService = {
  getPolicies(): PolicyDocument[] {
    return POLICY_DOCUMENTS;
  },

  getPolicyById(id: string): PolicyDocument | undefined {
    return POLICY_DOCUMENTS.find((p) => p.id === id || p.type === id);
  },

  async getUserConsents(userId: string): Promise<UserConsent[]> {
    if (!userId) return [];
    const colRef = collection(db, 'consents');
    try {
      const q = query(colRef, where('userId', '==', userId));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as UserConsent));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `consents?userId=${userId}`);
    }
  },

  async saveConsent(
    userId: string,
    termType: string,
    agreed: boolean,
    version: string = CURRENT_TERMS_VERSION
  ): Promise<UserConsent> {
    const consentId = `cst_${userId.substring(0, 8)}_${termType}_${Date.now()}`;
    const docRef = doc(db, 'consents', consentId);
    const now = new Date().toISOString();

    const consentData: UserConsent = {
      id: consentId,
      userId,
      termType,
      version,
      agreed,
      agreedAt: now,
    };

    try {
      await setDoc(docRef, consentData);
      return consentData;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `consents/${consentId}`);
    }
  },

  async withdrawConsent(consentId: string): Promise<void> {
    const docRef = doc(db, 'consents', consentId);
    try {
      await updateDoc(docRef, {
        agreed: false,
        withdrawnAt: new Date().toISOString(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `consents/${consentId}`);
    }
  },
};
