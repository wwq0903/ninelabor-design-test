import {
  collection,
  doc,
  getDocs,
  query,
  where,
  setDoc,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  InquiryHistory,
  InquiryHistoryEventType,
  InquiryHistoryMetadata,
  InquiryStatus,
  UserRole,
} from '../types';
import { sanitizeFirestoreData } from '../utils/firestoreHelper';

/**
 * 상태 라벨 한국어 변환 헬퍼
 */
export function formatHistoryStatusLabel(status?: InquiryStatus | string): string {
  if (!status) return '';
  switch (status) {
    case 'RECEIVED':
      return '접수';
    case 'IN_PROGRESS':
    case 'ASSIGNED':
      return '처리중';
    case 'ANSWERED':
      return '답변완료';
    case 'CLOSED':
      return '종결';
    default:
      return status;
  }
}

/**
 * 일시 한국어 포맷: YYYY.MM.DD HH:mm
 * (예: 2026.10.07 14:30)
 */
export function formatHistoryDateTime(isoString?: string): string {
  if (!isoString) return '-';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}.${month}.${day} ${hours}:${minutes}`;
  } catch {
    return isoString;
  }
}

/**
 * 이벤트 유형별 사용자 친화적 타이틀 생성
 * (원문 내용이나 민감 데이터는 일절 표시하지 않음)
 */
export function getHistoryEventTitle(
  eventType: InquiryHistoryEventType,
  metadata?: InquiryHistoryMetadata
): string {
  switch (eventType) {
    case 'INQUIRY_CREATED':
      return '문의가 접수되었습니다.';
    case 'INQUIRY_EDITED':
      return '문의 내용이 수정되었습니다.';
    case 'STATUS_CHANGED': {
      const toLabel = formatHistoryStatusLabel(metadata?.toStatus);
      return toLabel
        ? `처리 상태가 '${toLabel}'(으)로 변경되었습니다.`
        : '처리 상태가 변경되었습니다.';
    }
    case 'ANSWER_CREATED':
      return '노무사 답변이 등록되었습니다.';
    case 'ANSWER_UPDATED':
      return '노무사 답변이 수정되었습니다.';
    case 'INQUIRY_CLOSED':
      return '문의 처리가 종결되었습니다.';
    default:
      return '문의 처리 이력이 기록되었습니다.';
  }
}

/**
 * 행위자 역할 한글 표기
 */
export function getHistoryActorRoleBadge(role: 'ADMIN' | 'COMPANY' | 'WORKER'): {
  label: string;
  badgeClass: string;
} {
  switch (role) {
    case 'ADMIN':
      return { label: '공인노무사/관리자', badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
    case 'COMPANY':
      return { label: '기업 담당자', badgeClass: 'bg-blue-50 text-blue-700 border-blue-200' };
    case 'WORKER':
      return { label: '개인 근로자', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    default:
      return { label: role, badgeClass: 'bg-slate-50 text-slate-700 border-slate-200' };
  }
}

/**
 * 통합 문의 처리이력 전용 서비스 (inquiry_history)
 * - 불변 감사 추적(Immutable Processing History)
 * - 민감 원문(문의 본문, 답변 전문, 주민등록번호, 첨부파일 내용 등) 복사 금지
 */
export const inquiryHistoryService = {
  /**
   * 새 처리이력 기록 생성
   * - 수정/삭제가 불가능한 단방향 추가(Append-only)
   */
  async recordHistory(params: {
    inquiryId: string;
    companyId?: string | null;
    requesterId: string;
    eventType: InquiryHistoryEventType;
    actorId: string;
    actorRole: 'ADMIN' | 'COMPANY' | 'WORKER';
    actorName: string;
    metadata?: InquiryHistoryMetadata;
  }): Promise<InquiryHistory> {
    const {
      inquiryId,
      companyId = null,
      requesterId,
      eventType,
      actorId,
      actorRole,
      actorName,
      metadata,
    } = params;

    const historyId = `inqh_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date().toISOString();

    // 엄격한 데이터 정제: 민감 원문 데이터 배제 (상태 변경 정보 등 최소 메타데이터만 포함)
    const cleanMetadata: InquiryHistoryMetadata = {};
    if (metadata?.fromStatus) cleanMetadata.fromStatus = metadata.fromStatus;
    if (metadata?.toStatus) cleanMetadata.toStatus = metadata.toStatus;

    const record: InquiryHistory = sanitizeFirestoreData({
      id: historyId,
      inquiryId,
      companyId: companyId || null,
      requesterId,
      eventType,
      actorId,
      actorRole,
      actorName: actorName?.trim() || '사용자',
      createdAt: now,
      ...(Object.keys(cleanMetadata).length > 0 ? { metadata: cleanMetadata } : {}),
    });

    const docRef = doc(db, 'inquiry_history', historyId);
    try {
      await setDoc(docRef, record);
      return record;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `inquiry_history/${historyId}`);
    }
  },

  /**
   * 문의 ID에 해당하는 처리이력 목록 조회
   * - 시간순(과거 -> 최신) 정렬 반환
   * - RBAC 규칙 호환을 위해 호출자의 context(role, companyId, requesterId)를 반영한 쿼리 지원
   */
  async getInquiryHistories(
    inquiryId: string,
    context?: {
      role?: UserRole;
      companyId?: string | null;
      requesterId?: string;
    }
  ): Promise<InquiryHistory[]> {
    if (!inquiryId || !inquiryId.trim()) return [];
    const colRef = collection(db, 'inquiry_history');

    try {
      let snap;

      // 역할별 보안 규칙 호환 쿼리 분기
      if (context?.role === 'COMPANY' && context.companyId) {
        try {
          const q = query(
            colRef,
            where('inquiryId', '==', inquiryId),
            where('companyId', '==', context.companyId)
          );
          snap = await getDocs(q);
        } catch {
          const fallbackQ = query(colRef, where('inquiryId', '==', inquiryId));
          snap = await getDocs(fallbackQ);
        }
      } else if (context?.role === 'WORKER' && context.requesterId) {
        try {
          const q = query(
            colRef,
            where('inquiryId', '==', inquiryId),
            where('requesterId', '==', context.requesterId)
          );
          snap = await getDocs(q);
        } catch {
          const fallbackQ = query(colRef, where('inquiryId', '==', inquiryId));
          snap = await getDocs(fallbackQ);
        }
      } else {
        // ADMIN 또는 기본 쿼리
        const q = query(colRef, where('inquiryId', '==', inquiryId));
        snap = await getDocs(q);
      }

      const list = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as InquiryHistory)
      );

      // 시간순(과거 -> 최신) 일관된 정렬
      return list.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `inquiry_history?inquiryId=${inquiryId}`);
    }
  },
};
