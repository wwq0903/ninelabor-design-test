import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
} from 'firebase/firestore';
import { ref, uploadBytes, deleteObject, getDownloadURL } from 'firebase/storage';
import { db, storage, handleFirestoreError, OperationType } from '../lib/firebase';
import { CompanyDocument, CompanyDocumentCategory, DocumentMeta } from '../types';
import { validateFileForUpload, sanitizeFileName } from '../lib/fileSecurity';
import { containsKoreanRrn } from '../utils/rrnDetector';
import { sanitizeFirestoreData } from '../utils/firestoreHelper';

export interface DocumentAuthContext {
  uid: string;
  role: 'ADMIN' | 'COMPANY' | 'WORKER' | string;
  companyId?: string;
}

export interface UploadCompanyDocumentParams {
  file: File;
  companyId: string;
  companyName: string;
  title: string;
  category: CompanyDocumentCategory;
  description?: string;
  uploadedById: string;
  uploadedByRole: 'ADMIN' | 'COMPANY';
}

export const documentService = {
  /**
   * 기업 문서 파일 유효성 검사 (R2-7 1/3-B)
   * - 0 byte 차단
   * - 최대 20MB 차단
   * - 허용 확장자 검증 (PDF, HWP, 오피스, 이미지, 압축파일 등)
   * - 실행형/위험 확장자 및 MIME 차단
   * - 파일명 주민등록번호 포함 여부 검증 (RRN 유출 방지: 에러 메시지에 실제 번호 출력 금지)
   * - 파일명 sanitize 처리
   */
  validateCompanyDocumentFile(file: File): { isValid: boolean; error?: string; sanitizedName?: string } {
    if (!file) {
      return { isValid: false, error: '파일이 선택되지 않았습니다.' };
    }

    // 1. 파일명 주민등록번호(RRN) 검증 (보안: 실제 주민등록번호는 로그/메시지에 절대 노출 금지)
    if (containsKoreanRrn(file.name)) {
      return {
        isValid: false,
        error: '파일명에 주민등록번호 전체가 포함되어 있어 등록할 수 없습니다. 파일명에서 주민등록번호를 제거한 후 다시 시도해주세요.',
      };
    }

    // 2. 기본 파일 보안 검증 (0바이트, 20MB, 위험 확장자, 지원 형식)
    const res = validateFileForUpload(file);
    if (!res.isValid) {
      return res;
    }

    return {
      isValid: true,
      sanitizedName: sanitizeFileName(file.name),
    };
  },

  /**
   * ADMIN 및 COMPANY용 기업 문서 실제 파일 등록 (R2-7 1/3-B)
   *
   * 처리 순서:
   * ① 파일 유효성 검증
   * ② 클라이언트 documentId 사전 생성 (Firestore 문서는 아직 생성 금지)
   * ③ Firebase Storage 실제 파일 업로드 (경로: company-documents/{companyId}/{documentId}/{safeFileName})
   * ④ 업로드 성공 확인 후 Firestore company_documents 문서 생성
   * (Storage 업로드 실패 시 Firestore 문서를 생성하지 않음 / downloadUrl은 저장하지 않음)
   */
  async uploadCompanyDocument(params: UploadCompanyDocumentParams): Promise<CompanyDocument> {
    // ① 파일 유효성 검증
    const validation = this.validateCompanyDocumentFile(params.file);
    if (!validation.isValid) {
      throw new Error(validation.error || '유효하지 않은 파일입니다.');
    }

    if (!params.companyId?.trim()) {
      throw new Error('대상 기업 ID가 지정되지 않았습니다.');
    }
    if (!params.title?.trim()) {
      throw new Error('문서명을 입력해주세요.');
    }
    if (!params.category) {
      throw new Error('문서 분류를 선택해주세요.');
    }
    if (!params.uploadedById) {
      throw new Error('등록자 정보가 올바르지 않습니다.');
    }

    // ② documentId 사전 생성 (Firestore 생성은 Storage 성공 이후로 보류)
    const documentId = doc(collection(db, 'company_documents')).id;
    const safeFileName = validation.sanitizedName || sanitizeFileName(params.file.name);
    const storagePath = `company-documents/${params.companyId}/${documentId}/${safeFileName}`;

    // ③ Firebase Storage 파일 업로드
    const storageRef = ref(storage, storagePath);
    try {
      await uploadBytes(storageRef, params.file, {
        contentType: params.file.type || 'application/octet-stream',
        customMetadata: {
          companyId: params.companyId,
          documentId,
          uploadedById: params.uploadedById,
          uploadedByRole: params.uploadedByRole,
          originalFileName: params.file.name,
        },
      });
    } catch (storageError: any) {
      console.error('Storage upload failed:', storageError);
      const isUnauthorized =
        storageError?.code === 'storage/unauthorized' ||
        storageError?.message?.includes('permission') ||
        storageError?.message?.includes('unauthorized') ||
        storageError?.message?.includes('403');
      const waitNotice = isUnauthorized ? ' (Storage 실파일 권한 검증 대기)' : '';
      throw new Error(
        `파일 저장소(Storage) 업로드 실패${waitNotice}: ${storageError.message || '저장소 권한 또는 네트워크 오류가 발생했습니다.'}`
      );
    }

    // ④ 업로드 성공 확인 후 Firestore company_documents 문서 생성 (downloadUrl은 저장하지 않음)
    const now = new Date().toISOString();
    const docData: CompanyDocument = {
      id: documentId,
      companyId: params.companyId,
      companyName: params.companyName || '',
      title: params.title.trim(),
      category: params.category,
      description: params.description?.trim() || '',
      originalFileName: params.file.name,
      storagePath,
      contentType: params.file.type || 'application/octet-stream',
      size: params.file.size,
      uploadedById: params.uploadedById,
      uploadedByRole: params.uploadedByRole,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = doc(db, 'company_documents', documentId);
    try {
      await setDoc(docRef, sanitizeFirestoreData(docData));
      return docData;
    } catch (firestoreError: any) {
      console.error('Firestore company_documents registration failed after storage upload:', firestoreError);

      // [R2-7 1/3-C-①] Rollback 처리
      // Storage 업로드는 성공했지만 company_documents 생성이 실패한 경우
      // ① 방금 업로드한 Storage 파일 삭제 시도
      let storageCleanupSucceeded = false;
      try {
        await deleteObject(storageRef);
        storageCleanupSucceeded = true;
      } catch (cleanupError) {
        console.warn('Storage rollback cleanup failed:', cleanupError);
        storageCleanupSucceeded = false;
      }

      // ② Storage 삭제 성공 시:
      // "문서 정보 등록에 실패하여 업로드된 파일을 정리했습니다." 안내
      // ③ Storage 삭제도 실패한 경우:
      // "파일 업로드 후 문서 정보 등록에 실패하여 Storage 정리가 필요합니다." 안내
      if (storageCleanupSucceeded) {
        throw new Error('문서 정보 등록에 실패하여 업로드된 파일을 정리했습니다.');
      } else {
        throw new Error('파일 업로드 후 문서 정보 등록에 실패하여 Storage 정리가 필요합니다.');
      }
    }
  },

  /**
   * ADMIN용: 전체 기업의 문서 목록 조회 (선택적으로 companyId 및 category 필터)
   */
  async getAllCompanyDocuments(
    companyId?: string,
    category?: CompanyDocumentCategory
  ): Promise<CompanyDocument[]> {
    const colRef = collection(db, 'company_documents');
    try {
      let q = query(colRef);
      if (companyId) {
        q = query(colRef, where('companyId', '==', companyId));
      }
      const snap = await getDocs(q);
      let docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as CompanyDocument));

      if (category) {
        docs = docs.filter((d) => d.category === category);
      }

      // 최신 등록순 정렬 (클라이언트 정렬로 복합 색인 의존성 제거)
      docs.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      return docs;
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'company_documents');
      return [];
    }
  },

  /**
   * COMPANY용: 자사 companyId에 속한 문서 목록만 조회
   */
  async getCompanyDocumentsByCompany(
    companyId: string,
    category?: CompanyDocumentCategory
  ): Promise<CompanyDocument[]> {
    if (!companyId) return [];
    const colRef = collection(db, 'company_documents');
    try {
      const q = query(colRef, where('companyId', '==', companyId));
      const snap = await getDocs(q);
      let docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as CompanyDocument));

      if (category) {
        docs = docs.filter((d) => d.category === category);
      }

      // 최신 등록순 정렬
      docs.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      return docs;
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `company_documents?companyId=${companyId}`);
      return [];
    }
  },

  // --- 기존 코드와의 하위 호환성을 위한 레거시 래퍼 (조회 전용) ---
  async getAllDocuments(): Promise<DocumentMeta[]> {
    const list = await this.getAllCompanyDocuments();
    return list.map((d) => ({
      id: d.id,
      companyId: d.companyId,
      category: d.category,
      title: d.title,
      fileName: d.originalFileName || d.title,
      fileSize: d.size,
      fileType: d.contentType,
      uploadedById: d.uploadedById,
      uploadedByName: d.companyName,
      storagePath: d.storagePath,
      createdAt: d.createdAt,
    }));
  },

  async getDocumentsByCompany(companyId: string, category?: CompanyDocumentCategory): Promise<DocumentMeta[]> {
    const list = await this.getCompanyDocumentsByCompany(companyId, category);
    return list.map((d) => ({
      id: d.id,
      companyId: d.companyId,
      category: d.category,
      title: d.title,
      fileName: d.originalFileName || d.title,
      fileSize: d.size,
      fileType: d.contentType,
      uploadedById: d.uploadedById,
      uploadedByName: d.companyName,
      storagePath: d.storagePath,
      createdAt: d.createdAt,
    }));
  },

  /**
   * 기업 문서 다운로드 (R2-7 1/3-C-②)
   * - ADMIN: 전체 기업 문서 다운로드 가능
   * - COMPANY: 본인 회사(document.companyId == user.companyId)의 문서만 다운로드 가능
   * - WORKER / 비로그인: 다운로드 차단
   * - storagePath를 사용하여 다운로드 시점에만 실시간 URL을 발급받으며 downloadUrl은 Firestore에 저장하지 않음.
   * - 타사 storagePath 변조 방지 검증 포함
   */
  async downloadCompanyDocument(
    docItem: CompanyDocument,
    authContext: DocumentAuthContext
  ): Promise<void> {
    if (!authContext || !authContext.uid) {
      throw new Error('로그인 후 문서를 다운로드할 수 있습니다.');
    }

    if (authContext.role === 'WORKER') {
      throw new Error('근로자 계정은 기업 문서를 다운로드할 수 없습니다.');
    }

    if (authContext.role !== 'ADMIN' && authContext.role !== 'COMPANY') {
      throw new Error('문서 다운로드 권한이 없습니다.');
    }

    if (!docItem || !docItem.storagePath) {
      throw new Error('파일 저장소 경로가 유효하지 않은 문서입니다.');
    }

    // COMPANY 역할 격리 검증:
    // 1) document.companyId == authContext.companyId
    // 2) storagePath 접두사가 company-documents/{companyId}/ 형태인지 검증하여 타사 경로 접근 차단
    if (authContext.role === 'COMPANY') {
      if (!authContext.companyId) {
        throw new Error('소속 기업 정보가 확인되지 않아 문서를 다운로드할 수 없습니다.');
      }
      if (docItem.companyId !== authContext.companyId) {
        throw new Error('타사 기업의 문서는 다운로드할 수 없습니다.');
      }
      const allowedPrefix = `company-documents/${authContext.companyId}/`;
      if (!docItem.storagePath.startsWith(allowedPrefix)) {
        throw new Error('접근 권한이 없는 파일 경로이거나 타사의 문서 파일입니다.');
      }
    }

    // ADMIN 역할 검증:
    if (authContext.role === 'ADMIN') {
      if (!docItem.storagePath.startsWith('company-documents/')) {
        throw new Error('유효하지 않은 기업 문서 경로입니다.');
      }
    }

    try {
      const fileRef = ref(storage, docItem.storagePath);
      // 다운로드 시점에만 URL을 가져오며 Firestore에는 절대 저장하지 않음
      const downloadUrl = await getDownloadURL(fileRef);

      const downloadFileName = docItem.originalFileName || docItem.title || 'document';

      // 1) Fetch blob 방식으로 우선 시도 (크로스오리진 다운로드 파일명 유지 목적)
      try {
        const response = await fetch(downloadUrl);
        if (response.ok) {
          const blob = await response.blob();
          const blobUrl = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = downloadFileName;
          document.body.appendChild(link);
          link.click();
          window.URL.revokeObjectURL(blobUrl);
          document.body.removeChild(link);
          return;
        }
      } catch (blobErr) {
        // CORS 또는 네트워크 이슈 시 fallback 처리
        console.warn('Blob fetch download failed, fallback to anchor tag:', blobErr);
      }

      // 2) Fallback direct anchor click
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = downloadFileName;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      console.error('Failed to download company document:', err);
      const isUnauthorized =
        err?.code === 'storage/unauthorized' ||
        err?.code === 'storage/unknown' ||
        err?.message?.includes('permission') ||
        err?.message?.includes('unauthorized') ||
        err?.message?.includes('403');
      const waitNotice = isUnauthorized ? ' (Storage 실파일 권한 검증 대기)' : '';
      throw new Error(`파일 다운로드 실패${waitNotice}: ${err.message || '저장소 권한을 확인해주세요.'}`);
    }
  },

  /**
   * [R2-7 1/3-C-③] 기업 문서 삭제
   * 권한:
   * - ADMIN: 모든 기업 문서 삭제 가능
   * - COMPANY: 자기 회사 문서(companyId 일치) 중 본인이 직접 업로드한 문서(uploadedById 일치)만 삭제 가능
   * - WORKER / 비로그인: 삭제 불가
   *
   * 처리 순서:
   * ① Firebase Storage 실제 파일 삭제
   * ② Storage 삭제 성공 확인
   * ③ company_documents Firestore 문서 삭제
   *
   * Storage 삭제 실패 시 Firestore 문서를 삭제하지 않음.
   * Storage 파일 삭제 성공 후 Firestore 문서 삭제 실패 시:
   * "파일은 삭제되었으나 문서 정보 정리에 실패했습니다." 안내
   */
  async deleteCompanyDocument(
    docItem: CompanyDocument,
    authContext: DocumentAuthContext
  ): Promise<void> {
    // 1. 비로그인 및 WORKER 권한 차단
    if (!authContext || !authContext.uid) {
      throw new Error('로그인 후 문서를 삭제할 수 있습니다.');
    }
    if (authContext.role !== 'ADMIN' && authContext.role !== 'COMPANY') {
      throw new Error('문서 삭제 권한이 없습니다.');
    }

    // 2. COMPANY 권한 엄격 검증:
    // - document.companyId == 로그인 사용자의 companyId
    // - document.uploadedById == request.auth.uid
    // (ADMIN이 등록한 문서나 같은 회사의 다른 사용자가 등록한 문서는 COMPANY 삭제 불가)
    if (authContext.role === 'COMPANY') {
      if (!authContext.companyId) {
        throw new Error('소속 기업 정보가 확인되지 않아 문서를 삭제할 수 없습니다.');
      }
      if (docItem.companyId !== authContext.companyId) {
        throw new Error('타사 기업의 문서는 삭제할 수 없습니다.');
      }
      if (docItem.uploadedById !== authContext.uid) {
        throw new Error('본인이 직접 업로드한 문서만 삭제할 수 있습니다.');
      }
    }

    // Storage 경로 검증
    if (!docItem.storagePath) {
      throw new Error('삭제할 문서의 파일 저장소 경로가 없습니다.');
    }

    if (authContext.role === 'COMPANY') {
      const allowedPrefix = `company-documents/${authContext.companyId}/`;
      if (!docItem.storagePath.startsWith(allowedPrefix)) {
        throw new Error('접근 권한이 없는 파일 경로이거나 타사의 문서 파일입니다.');
      }
    } else if (authContext.role === 'ADMIN') {
      if (!docItem.storagePath.startsWith('company-documents/')) {
        throw new Error('유효하지 않은 기업 문서 경로입니다.');
      }
    }

    // ① Firebase Storage 실제 파일 삭제
    const storageRef = ref(storage, docItem.storagePath);
    try {
      await deleteObject(storageRef);
    } catch (storageError: any) {
      console.error('Storage deletion failed:', storageError);
      const isUnauthorized =
        storageError?.code === 'storage/unauthorized' ||
        storageError?.code === 'storage/unknown' ||
        storageError?.message?.includes('permission') ||
        storageError?.message?.includes('unauthorized') ||
        storageError?.message?.includes('403');
      const waitNotice = isUnauthorized ? ' (Storage 실파일 권한 검증 대기)' : '';
      // Storage 삭제 실패 시 Firestore 문서를 삭제하지 않음
      throw new Error(
        `파일 저장소 삭제 실패${waitNotice}: ${storageError.message || '저장소 권한 또는 네트워크 오류가 발생했습니다.'}`
      );
    }

    // ② Storage 삭제 성공 확인 후
    // ③ company_documents Firestore 문서 삭제
    const docRef = doc(db, 'company_documents', docItem.id);
    try {
      await deleteDoc(docRef);
    } catch (firestoreError: any) {
      console.error('Firestore company_documents delete failed after storage deletion:', firestoreError);
      // 부분 실패: Storage 파일 삭제는 성공했지만 Firestore 문서 삭제가 실패한 경우
      throw new Error('파일은 삭제되었으나 문서 정보 정리에 실패했습니다.');
    }
  },
};

/**
 * [R2-7 1/3-C-③] 기업 문서 삭제 권한 판별 헬퍼
 * - ADMIN: 모든 기업 문서 삭제 가능
 * - COMPANY: 자기 회사 문서(companyId 일치) 중 본인이 직접 업로드한 문서(uploadedById 일치)만 삭제 가능
 * - WORKER / 비로그인: 삭제 불가
 */
export function canDeleteCompanyDocument(
  docItem: CompanyDocument,
  currentUser: { uid: string; role?: string; companyId?: string } | null
): boolean {
  if (!currentUser || !currentUser.uid) return false;
  if (currentUser.role === 'ADMIN') return true;
  if (currentUser.role === 'COMPANY') {
    return Boolean(
      currentUser.companyId &&
      docItem.companyId === currentUser.companyId &&
      docItem.uploadedById === currentUser.uid
    );
  }
  return false;
}
