import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  runTransaction,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  PlanCode,
  SubscriptionRequest,
  SubscriptionRequestStatus,
  UserRole,
} from '../types';
import { auditLogService } from './auditLogService';

const VALID_REQUEST_PLAN_CODES: PlanCode[] = [
  'FREE',
  'BASIC',
  'STANDARD',
  'CUSTOM',
  'OUTSOURCING',
];

const VALID_REQUEST_STATUSES: SubscriptionRequestStatus[] = [
  'REQUESTED',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
];

// In-memory lock per company to prevent rapid duplicate clicks in the same runtime
const inFlightCompanyRequests = new Set<string>();

export const subscriptionRequestService = {
  /**
   * [R2-8 2/4-C-③ & 2/4-C-④] 플랜 변경 신청 생성 (COMPANY)
   *
   * 원자적 동시 중복 신청 방지:
   * 1. 0차 클라이언트 인메모리 락: 동일 브라우저/인스턴스에서 다중 클릭 방지
   * 2. 1차 쿼리 검사: 해당 회사의 기존 진행중(REQUESTED, UNDER_REVIEW) 신청 조회 (인덱스 의존성 제거를 위한 메모리 필터링)
   * 3. 2차 원자적 트랜잭션: companies/{companyId}의 activeSubscriptionRequestId를 트랜잭션 내에서 원자적으로 점검 및 갱신.
   *    동시에 여러 요청이 유입되더라도 Firestore의 트랜잭션 충돌 감지 및 직렬화 보장으로
   *    정확히 1건만 생성되고 후속 요청은 안전하게 차단됩니다.
   */
  async createSubscriptionRequest(params: {
    companyId: string;
    companyName: string;
    requesterId: string;
    requestedPlanCode: PlanCode;
    note?: string;
  }): Promise<SubscriptionRequest> {
    // Offline-only plan management: never issue a legacy client-side plan request.
    throw new Error('온라인 플랜 변경 신청은 종료되었습니다. 노무법인 관리자에게 문의해주세요.');

  },

  /**
   * [R2-8 2/4-C-③ & 2/4-C-④] 특정 회사(자사)의 신청 내역 목록 조회 (COMPANY)
   */
  async getSubscriptionRequestsByCompany(
    companyId: string
  ): Promise<SubscriptionRequest[]> {
    if (!companyId || !companyId.trim()) {
      return [];
    }

    const colRef = collection(db, 'subscription_requests');
    const q = query(
      colRef,
      where('companyId', '==', companyId.trim())
    );

    try {
      const snap = await getDocs(q);
      const requests = snap.docs.map((d) => d.data() as SubscriptionRequest);
      // 최신순 정렬 (클라이언트 메모리 정렬로 복합 색인 미생성 오류 방지)
      return requests.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'subscription_requests');
      throw err;
    }
  },

  /**
   * [R2-8 2/4-C-③] 전체 플랜 변경 신청 목록 조회 (ADMIN 전용)
   */
  async getAllSubscriptionRequests(): Promise<SubscriptionRequest[]> {
    const colRef = collection(db, 'subscription_requests');

    try {
      const snap = await getDocs(colRef);
      const requests = snap.docs.map((d) => d.data() as SubscriptionRequest);
      return requests.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'subscription_requests');
      throw err;
    }
  },

  /**
   * [R2-8 2/4-C-③] 단일 신청 상세 조회
   */
  async getSubscriptionRequestById(
    requestId: string
  ): Promise<SubscriptionRequest | null> {
    if (!requestId) return null;
    const docRef = doc(db, 'subscription_requests', requestId);

    try {
      const snap = await getDoc(docRef);
      if (!snap.exists()) return null;
      return snap.data() as SubscriptionRequest;
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, 'subscription_requests');
      throw err;
    }
  },

  /**
   * [R2-8 2/4-C-③] 신청 상태 변경 (ADMIN 전용)
   *
   * 중요:
   * - APPROVED가 되더라도 companies/{companyId}.subscription을 자동 변경하지 않습니다.
   * - 신청 상태와 실제 구독 상태는 분리됩니다.
   * - ADMIN이 상태를 변경하면 Audit Log에 이전 status, 변경 status, actor uid를 기록합니다. (결제정보 제외)
   */
  async updateSubscriptionRequestStatus(params: {
    requestId: string;
    newStatus: SubscriptionRequestStatus;
    actor: {
      uid: string;
      role: UserRole;
      name: string;
    };
    reviewComment?: string;
  }): Promise<SubscriptionRequest> {
    const { requestId, newStatus, actor, reviewComment } = params;

    if (!requestId) {
      throw new Error('신청 식별자(requestId)가 누락되었습니다.');
    }
    if (!VALID_REQUEST_STATUSES.includes(newStatus)) {
      throw new Error(`유효하지 않은 신청 상태입니다: ${newStatus}`);
    }

    const docRef = doc(db, 'subscription_requests', requestId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      throw new Error(`존재하지 않는 신청 내역입니다: ${requestId}`);
    }

    const currentData = snap.data() as SubscriptionRequest;
    const oldStatus = currentData.status;

    const now = new Date().toISOString();
    const updatePayload: Partial<SubscriptionRequest> = {
      status: newStatus,
      updatedAt: now,
      reviewerId: actor.uid,
      reviewerName: actor.name,
      reviewedAt: now,
    };
    if (reviewComment !== undefined) {
      updatePayload.reviewComment = reviewComment.trim();
    }

    try {
      await updateDoc(docRef, updatePayload);

      // 신청이 종료 상태(APPROVED, REJECTED, CANCELLED)로 전환될 때
      // 회사 문서의 activeSubscriptionRequestId를 정리하여 후속 신청이 원활히 가능하도록 처리
      if (['APPROVED', 'REJECTED', 'CANCELLED'].includes(newStatus)) {
        try {
          const compDocRef = doc(db, 'companies', currentData.companyId);
          const compSnap = await getDoc(compDocRef);
          if (
            compSnap.exists() &&
            compSnap.data()?.activeSubscriptionRequestId === requestId
          ) {
            await updateDoc(compDocRef, {
              activeSubscriptionRequestId: null,
              updatedAt: now,
            });
          }
        } catch (_cleanupErr) {
          // 회사 문서의 락 정리 실패는 상태 변경 본 작업을 중단시키지 않음
        }
      }

      // Audit Log 기록 (결제정보 일체 기록하지 않음)
      await auditLogService.logAction({
        actorUserId: actor.uid,
        actorRole: actor.role,
        actorName: actor.name,
        companyId: currentData.companyId,
        action: 'UPDATE_SUBSCRIPTION_REQUEST_STATUS',
        resourceType: 'SUBSCRIPTION_REQUEST',
        resourceId: requestId,
        details: {
          requestId,
          companyId: currentData.companyId,
          companyName: currentData.companyName,
          requestedPlanCode: currentData.requestedPlanCode,
          oldStatus,
          newStatus,
          reviewComment: reviewComment?.trim() || undefined,
        },
      });

      return {
        ...currentData,
        ...updatePayload,
      };
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'subscription_requests');
      throw err;
    }
  },

  /**
   * [R2-8 2/4-C-⑦] 승인된 플랜 변경 신청의 실제 subscription 적용 (ADMIN 전용)
   *
   * 원자적 트랜잭션 (runTransaction):
   * 1. subscription_requests/{requestId} 조회 및 검증:
   *    - status === 'APPROVED' 필수
   *    - !appliedAt 필수 (중복 적용 차단)
   * 2. companies/{companyId} 조회 및 검증
   * 3. 날짜 검증:
   *    - startDate: 필수 입력
   *    - endDate: 선택 입력 (입력 시 startDate보다 이전일 수 없음)
   * 4. 원자적 갱신:
   *    - companies/{companyId}:
   *        subscription = { planCode, status: 'ACTIVE', startDate, endDate }
   *        currentPlanId = planCode (하위 호환 동기화)
   *    - subscription_requests/{requestId}:
   *        appliedAt = now
   *        appliedById = actor.uid
   *        appliedByName = actor.name
   *        appliedSubscriptionPlanCode = planCode
   * 5. Audit Log 기록 (결제정보 일체 제외)
   */
  async applyApprovedSubscriptionRequest(params: {
    requestId: string;
    startDate: string;
    endDate?: string;
    actor: {
      uid: string;
      role: UserRole;
      name: string;
    };
  }): Promise<{
    request: SubscriptionRequest;
    companyId: string;
    newSubscription: {
      planCode: PlanCode;
      status: 'ACTIVE';
      startDate: string;
      endDate?: string;
    };
  }> {
    const { requestId, startDate, endDate, actor } = params;

    if (!requestId) {
      throw new Error('신청 식별자(requestId)가 누락되었습니다.');
    }

    const cleanStart = (startDate || '').trim();
    const cleanEnd = (endDate || '').trim();

    if (!cleanStart) {
      throw new Error('적용 시작일(startDate)을 지정해주세요.');
    }

    if (cleanEnd && cleanEnd < cleanStart) {
      throw new Error('적용 종료일은 시작일보다 이전일 수 없습니다.');
    }

    const requestDocRef = doc(db, 'subscription_requests', requestId);

    try {
      const result = await runTransaction(db, async (transaction) => {
        // 1. subscription_requests 조회 및 검증
        const reqSnap = await transaction.get(requestDocRef);
        if (!reqSnap.exists()) {
          throw new Error(`존재하지 않는 신청 내역입니다: ${requestId}`);
        }

        const reqData = reqSnap.data() as SubscriptionRequest;

        // 적용 대상 검증: status == APPROVED
        if (reqData.status !== 'APPROVED') {
          throw new Error(
            `승인(APPROVED) 상태의 신청만 실제 구독에 적용할 수 있습니다. (현재 상태: ${reqData.status})`
          );
        }

        // 중복 적용 방지: appliedAt 존재 여부 검사
        if (reqData.appliedAt) {
          throw new Error(
            `이미 실제 구독에 적용 완료된 신청 건입니다. (적용일시: ${reqData.appliedAt})`
          );
        }

        // 2. companies 문서 조회 및 검증
        const companyDocRef = doc(db, 'companies', reqData.companyId);
        const compSnap = await transaction.get(companyDocRef);
        if (!compSnap.exists()) {
          throw new Error(`대상 기업을 찾을 수 없습니다: ${reqData.companyId}`);
        }

        const compData = compSnap.data();
        const oldSubscription = compData.subscription || null;

        const now = new Date().toISOString();
        const newSubscription: {
          planCode: PlanCode;
          status: 'ACTIVE';
          startDate: string;
          endDate?: string;
        } = {
          planCode: reqData.requestedPlanCode,
          status: 'ACTIVE',
          startDate: cleanStart,
        };
        if (cleanEnd) {
          newSubscription.endDate = cleanEnd;
        }

        // 3. 원자적 트랜잭션 갱신
        // companies/{companyId} 갱신: subscription + currentPlanId 동기화
        transaction.update(companyDocRef, {
          subscription: newSubscription,
          currentPlanId: reqData.requestedPlanCode,
          updatedAt: now,
        });

        // subscription_requests/{requestId} 갱신: applied 메타데이터 기록
        const updatedRequestPayload: Partial<SubscriptionRequest> = {
          appliedAt: now,
          appliedById: actor.uid,
          appliedByName: actor.name,
          appliedSubscriptionPlanCode: reqData.requestedPlanCode,
          updatedAt: now,
        };
        transaction.update(requestDocRef, updatedRequestPayload);

        return {
          request: {
            ...reqData,
            ...updatedRequestPayload,
          },
          companyId: reqData.companyId,
          companyName: reqData.companyName,
          oldSubscription,
          newSubscription,
          timestamp: now,
        };
      });

      // 4. 트랜잭션 성공 후 Audit Log 기록 (결제정보 일체 기록하지 않음)
      await auditLogService.logAction({
        actorUserId: actor.uid,
        actorRole: actor.role,
        actorName: actor.name,
        companyId: result.companyId,
        action: 'APPLY_SUBSCRIPTION_REQUEST',
        resourceType: 'SUBSCRIPTION',
        resourceId: result.companyId,
        details: {
          requestId,
          companyId: result.companyId,
          companyName: result.companyName,
          requestedPlanCode: result.request.requestedPlanCode,
          oldSubscription: result.oldSubscription,
          newSubscription: result.newSubscription,
          appliedAt: result.timestamp,
        },
      });

      return {
        request: result.request,
        companyId: result.companyId,
        newSubscription: result.newSubscription,
      };
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'subscription_requests');
      throw err;
    }
  },
};
