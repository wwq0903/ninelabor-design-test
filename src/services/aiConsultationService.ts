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
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { AIConsultation, AIConsultationStatus } from '../types';

export const aiConsultationService = {
  // Call real backend Gemini proxy route
  async askGemini(prompt: string): Promise<string> {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('AI 서비스를 이용하려면 로그인해 주세요.');
      const idToken = await currentUser.getIdToken();
      const res = await fetch('/api/ai-consult', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ prompt }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(
          errorData.message ||
            'AI 서비스 서버 응답 오류가 발생했습니다. (AI 서비스 설정이 필요합니다.)'
        );
      }

      const data = await res.json();
      if (!data.text || !data.text.trim()) {
        throw new Error('AI 서비스로부터 빈 응답이 반환되었습니다.');
      }

      return data.text;
    } catch (err: any) {
      // Prompts and provider errors can contain confidential labor-case information.
      console.error('AI consultation request failed');
      throw err;
    }
  },

  async getConsultationsByUser(userId: string): Promise<AIConsultation[]> {
    if (!userId) return [];
    const colRef = collection(db, 'ai_consultations');
    try {
      const q = query(colRef, where('userId', '==', userId));
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AIConsultation));
      // Sort client side by createdAt desc
      return list.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `ai_consultations?userId=${userId}`);
    }
  },

  async getConsultationsByCompany(companyId: string): Promise<AIConsultation[]> {
    if (!companyId) return [];
    const colRef = collection(db, 'ai_consultations');
    try {
      const q = query(colRef, where('companyId', '==', companyId));
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AIConsultation));
      return list.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `ai_consultations?companyId=${companyId}`);
    }
  },

  async getAllConsultations(): Promise<AIConsultation[]> {
    const colRef = collection(db, 'ai_consultations');
    try {
      const snap = await getDocs(colRef);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AIConsultation));
      return list.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'ai_consultations');
    }
  },

  async createConsultation(
    data: Omit<AIConsultation, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<AIConsultation> {
    const id = `ai_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const docRef = doc(db, 'ai_consultations', id);
    const now = new Date().toISOString();

    const record: AIConsultation = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await setDoc(docRef, record);
      return record;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `ai_consultations/${id}`);
    }
  },

  async requestAttorneyReview(
    id: string,
    assignedAttorneyId?: string,
    assignedAttorneyName?: string
  ): Promise<void> {
    const docRef = doc(db, 'ai_consultations', id);
    const now = new Date().toISOString();

    try {
      await updateDoc(docRef, {
        status: 'ATTORNEY_REVIEW_PENDING' as AIConsultationStatus,
        reviewRequestedAt: now,
        assignedAttorneyId: assignedAttorneyId || undefined,
        assignedAttorneyName: assignedAttorneyName || undefined,
        updatedAt: now,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `ai_consultations/${id}`);
    }
  },

  async submitAttorneyAnswer(
    id: string,
    attorneyAnswer: string,
    attorneyId: string,
    attorneyName: string
  ): Promise<void> {
    const docRef = doc(db, 'ai_consultations', id);
    const now = new Date().toISOString();

    try {
      await updateDoc(docRef, {
        status: 'ANSWERED' as AIConsultationStatus,
        attorneyAnswer: attorneyAnswer.trim(),
        assignedAttorneyId: attorneyId,
        assignedAttorneyName: attorneyName,
        answeredAt: now,
        updatedAt: now,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `ai_consultations/${id}`);
    }
  },

  async updateStatus(id: string, status: AIConsultationStatus): Promise<void> {
    const docRef = doc(db, 'ai_consultations', id);
    try {
      await updateDoc(docRef, {
        status,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `ai_consultations/${id}`);
    }
  },
};
