import {
  collection,
  doc,
  getDocs,
  query,
  where,
  setDoc,
  deleteDoc,
  orderBy,
} from 'firebase/firestore';
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  UploadTaskSnapshot,
} from 'firebase/storage';
import { db, storage, handleFirestoreError, OperationType } from '../lib/firebase';
import { InquiryFile } from '../types';
import {
  validateFileForUpload,
  sanitizeFileName,
  formatFileSize,
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_MB,
  ALLOWED_EXTENSIONS,
  DANGEROUS_EXTENSIONS,
  type FileValidationResult,
} from '../lib/fileSecurity';

// Re-export existing validation utilities to ensure reuse and prevent duplication
export {
  validateFileForUpload,
  sanitizeFileName,
  formatFileSize,
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_MB,
  ALLOWED_EXTENSIONS,
  DANGEROUS_EXTENSIONS,
  type FileValidationResult,
};

/**
 * Unified notification message when Firebase Storage is not configured/active
 */
export const INQUIRY_STORAGE_REQUIRED_MESSAGE = 'Firebase Storage 설정이 필요합니다.';

export interface InquiryStorageStatus {
  isConfigured: boolean;
  bucketName: string;
  message: string;
}

/**
 * 1. Firebase Storage 상태 확인
 * 현재 프로젝트에서 Firebase Storage가 실제로 활성화되어 있는지 확인
 * 활성화되어 있지 않다면 "Firebase Storage 설정이 필요합니다." 안내 문구 통일
 */
export async function checkInquiryStorageAvailability(): Promise<InquiryStorageStatus> {
  const bucketName = storage.app.options.storageBucket || '';
  if (!bucketName) {
    return {
      isConfigured: false,
      bucketName: '',
      message: INQUIRY_STORAGE_REQUIRED_MESSAGE,
    };
  }

  try {
    const response = await fetch(
      `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o?maxResults=1`
    );
    // 404 indicates the storage bucket has not been created or is disabled
    if (response.status === 404) {
      return {
        isConfigured: false,
        bucketName,
        message: INQUIRY_STORAGE_REQUIRED_MESSAGE,
      };
    }

    return {
      isConfigured: true,
      bucketName,
      message: 'Firebase Storage가 활성화되어 있습니다.',
    };
  } catch {
    return {
      isConfigured: false,
      bucketName,
      message: INQUIRY_STORAGE_REQUIRED_MESSAGE,
    };
  }
}

/**
 * 3. Storage 경로 규칙
 * 기업 문의: inquiries/{companyId}/{inquiryId}/{fileId}/{fileName}
 * 비소속 개인 문의: inquiries/individual/{requesterId}/{inquiryId}/{fileId}/{fileName}
 */
export function getInquiryStoragePath(params: {
  companyId?: string | null;
  requesterId: string;
  inquiryId: string;
  fileId: string;
  fileName: string;
}): string {
  const { companyId, requesterId, inquiryId, fileId, fileName } = params;
  const safeName = sanitizeFileName(fileName);

  if (companyId && companyId.trim()) {
    // 기업 문의
    return `inquiries/${companyId}/${inquiryId}/${fileId}/${safeName}`;
  }

  // 비소속 개인 문의
  return `inquiries/individual/${requesterId}/${inquiryId}/${fileId}/${safeName}`;
}

/**
 * 2. inquiry_files 컬렉션 데이터 접근 서비스
 * 필드:
 * - id
 * - inquiryId
 * - companyId
 * - requesterId
 * - uploadedById
 * - uploadedByRole
 * - originalFileName
 * - storagePath
 * - contentType
 * - size
 * - uploadedAt
 * *주의*: 다운로드 URL(downloadUrl)은 저장하지 않음.
 */
export const inquiryFileService = {
  checkStorageAvailability: checkInquiryStorageAvailability,
  getStoragePath: getInquiryStoragePath,

  /**
   * Inquiry ID에 연결된 첨부파일 메타데이터 목록 조회
   */
  async getInquiryFiles(inquiryId: string): Promise<InquiryFile[]> {
    if (!inquiryId || !inquiryId.trim()) return [];
    const colRef = collection(db, 'inquiry_files');
    try {
      let snap;
      try {
        const q = query(
          colRef,
          where('inquiryId', '==', inquiryId),
          orderBy('uploadedAt', 'asc')
        );
        snap = await getDocs(q);
      } catch {
        const fallbackQ = query(colRef, where('inquiryId', '==', inquiryId));
        snap = await getDocs(fallbackQ);
      }
      const files = snap.docs.map(
        (docSnap) => ({ id: docSnap.id, ...docSnap.data() } as InquiryFile)
      );
      return files.sort((a, b) => ((a.uploadedAt || '') > (b.uploadedAt || '') ? 1 : -1));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `inquiry_files?inquiryId=${inquiryId}`);
    }
  },

  /**
   * inquiry_files 컬렉션에 새 첨부파일 메타데이터 문서 저장
   * 다운로드 URL은 저장하지 않음
   */
  async createInquiryFileRecord(params: {
    fileId?: string;
    inquiryId: string;
    companyId?: string | null;
    requesterId: string;
    uploadedById: string;
    uploadedByRole: 'ADMIN' | 'COMPANY' | 'WORKER';
    originalFileName: string;
    storagePath: string;
    contentType: string;
    size: number;
  }): Promise<InquiryFile> {
    const fileId =
      params.fileId || `file_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const docRef = doc(db, 'inquiry_files', fileId);
    const now = new Date().toISOString();

    const record: InquiryFile = {
      id: fileId,
      inquiryId: params.inquiryId,
      companyId: params.companyId || null,
      requesterId: params.requesterId,
      uploadedById: params.uploadedById,
      uploadedByRole: params.uploadedByRole,
      originalFileName: params.originalFileName,
      storagePath: params.storagePath,
      contentType: params.contentType,
      size: params.size,
      uploadedAt: now,
    };

    try {
      await setDoc(docRef, record);
      return record;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `inquiry_files/${fileId}`);
    }
  },

  /**
   * Actual file upload to Firebase Storage with strict validation and error handling
   * - Validates file with existing fileSecurity utility
   * - Calculates storage path according to business rules
   * - Tries upload to Firebase Storage
   * - If Storage rejects or is disabled: rejects with "Firebase Storage 설정이 필요합니다."
   * - ONLY creates inquiry_files Firestore record after real storage upload succeeds
   */
  async uploadInquiryFile(params: {
    file: File;
    inquiryId: string;
    companyId?: string | null;
    requesterId: string;
    uploadedById: string;
    uploadedByRole: 'ADMIN' | 'COMPANY' | 'WORKER';
    onProgress?: (percent: number) => void;
  }): Promise<InquiryFile> {
    const {
      file,
      inquiryId,
      companyId,
      requesterId,
      uploadedById,
      uploadedByRole,
      onProgress,
    } = params;

    // 1. File security validation using common fileSecurity utility
    const validation = validateFileForUpload(file);
    if (!validation.isValid) {
      throw new Error(validation.error || '유효하지 않은 파일입니다.');
    }

    const safeName = validation.sanitizedName || sanitizeFileName(file.name);
    const fileId = `file_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    // 2. Storage path generation according to rules:
    // 기업 문의: inquiries/{companyId}/{inquiryId}/{fileId}/{fileName}
    // 비소속 개인 문의: inquiries/individual/{requesterId}/{inquiryId}/{fileId}/{fileName}
    const storagePath = getInquiryStoragePath({
      companyId,
      requesterId,
      inquiryId,
      fileId,
      fileName: safeName,
    });

    const fileRef = ref(storage, storagePath);

    // 3. Attempt actual Firebase Storage upload
    await new Promise<void>((resolve, reject) => {
      const uploadTask = uploadBytesResumable(fileRef, file, {
        contentType: file.type || 'application/octet-stream',
        customMetadata: {
          inquiryId,
          companyId: companyId || '',
          requesterId,
          uploadedById,
          uploadedByRole,
          originalFileName: file.name,
        },
      });

      uploadTask.on(
        'state_changed',
        (snapshot: UploadTaskSnapshot) => {
          if (snapshot.totalBytes > 0 && onProgress) {
            const percent = Math.round(
              (snapshot.bytesTransferred / snapshot.totalBytes) * 100
            );
            onProgress(percent);
          }
        },
        (error) => {
          console.warn('[Inquiry Storage Upload Denied/Error]', error.code, error.message);
          // If storage upload fails due to permission, disabled, or unconfigured rules:
          reject(new Error(INQUIRY_STORAGE_REQUIRED_MESSAGE));
        },
        () => {
          resolve();
        }
      );
    });

    // 4. ONLY after actual Storage upload succeeds, create inquiry_files metadata document
    const record = await this.createInquiryFileRecord({
      fileId,
      inquiryId,
      companyId: companyId || null,
      requesterId,
      uploadedById,
      uploadedByRole,
      originalFileName: file.name,
      storagePath,
      contentType: file.type || 'application/octet-stream',
      size: file.size,
    });

    return record;
  },

  /**
   * 3. 파일 다운로드
   * - Firestore에 downloadUrl을 저장하지 않음.
   * - inquiry_files.storagePath를 기준으로 Firebase Storage에서 실제 파일을 가져와 다운로드.
   * - 다운로드 권한 오류 시 "Firebase Storage 설정이 필요합니다." 통일 안내 문구 표출.
   */
  async downloadInquiryFile(file: InquiryFile): Promise<void> {
    if (!file || !file.storagePath) {
      throw new Error('파일 저장 경로가 없습니다.');
    }

    try {
      const fileRef = ref(storage, file.storagePath);
      const downloadUrl = await getDownloadURL(fileRef);

      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = file.originalFileName;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error: any) {
      console.warn('[Inquiry Download Error]', error.code, error.message);
      if (
        error.code === 'storage/unauthorized' ||
        error.code === 'storage/unknown' ||
        error.message?.includes('unknown error')
      ) {
        throw new Error(INQUIRY_STORAGE_REQUIRED_MESSAGE);
      }
      throw new Error(`파일 다운로드 실패: ${error.message}`);
    }
  },

  /**
   * 4. 첨부파일 삭제
   * - ADMIN: 모든 문의 첨부파일 삭제 가능
   * - COMPANY: 자기 회사 문의에서 본인이 업로드한 파일만 삭제 가능
   * - 비소속 개인 WORKER: 본인 문의에서 본인이 업로드한 파일만 삭제 가능
   * - 회사 소속 WORKER: 접근 및 삭제 불가
   *
   * 삭제 순서:
   * 1. 실제 Firebase Storage 파일 삭제 시도 (deleteObject)
   * 2. Storage 삭제 성공 후에만 Firestore inquiry_files 메타데이터 문서 삭제 (deleteDoc)
   * 3. Storage 삭제 실패 시 Firestore 메타데이터를 절대 먼저 삭제하지 않음
   * 4. 부분 실패/오류 발생 시 사용자에게 명확한 오류 반환 (가짜 삭제 성공 금지)
   */
  async deleteInquiryFile(params: {
    file: InquiryFile;
    currentUserId: string;
    currentUserRole: 'ADMIN' | 'COMPANY' | 'WORKER';
    companyId?: string | null;
    isIndividualWorker?: boolean;
  }): Promise<void> {
    const { file, currentUserId, currentUserRole, companyId, isIndividualWorker } = params;

    if (!file || !file.id || !file.storagePath) {
      throw new Error('삭제할 파일 정보가 올바르지 않습니다.');
    }

    // Role-based permission check
    const isAdmin = currentUserRole === 'ADMIN';
    const isOwnerCompany =
      currentUserRole === 'COMPANY' &&
      Boolean(companyId) &&
      file.companyId === companyId &&
      file.uploadedById === currentUserId;
    const isOwnerWorker =
      currentUserRole === 'WORKER' &&
      Boolean(isIndividualWorker) &&
      file.requesterId === currentUserId &&
      file.uploadedById === currentUserId;

    if (!isAdmin && !isOwnerCompany && !isOwnerWorker) {
      throw new Error('첨부파일 삭제 권한이 없습니다 (본인이 업로드한 파일만 삭제 가능).');
    }

    // Step 1: 실제 Firebase Storage 파일 삭제 시도
    try {
      const fileRef = ref(storage, file.storagePath);
      await deleteObject(fileRef);
    } catch (storageErr: any) {
      console.warn('[Inquiry Storage Delete Error]', storageErr.code, storageErr.message);
      if (
        storageErr.code === 'storage/unauthorized' ||
        storageErr.code === 'storage/unknown' ||
        storageErr.message?.includes('unknown error')
      ) {
        throw new Error(`${INQUIRY_STORAGE_REQUIRED_MESSAGE} (저장소 파일 삭제 권한 없음)`);
      }
      // If file is already gone from storage, allow cleaning up metadata, otherwise abort
      if (storageErr.code !== 'storage/object-not-found') {
        throw new Error(`저장소 파일 삭제 실패: ${storageErr.message || 'Storage 삭제 오류'}`);
      }
    }

    // Step 2: Storage 삭제 완료 후에만 Firestore 메타데이터 문서 삭제
    try {
      const docRef = doc(db, 'inquiry_files', file.id);
      await deleteDoc(docRef);
    } catch (firestoreErr: any) {
      console.error('[Inquiry Firestore Delete Error]', firestoreErr);
      handleFirestoreError(firestoreErr, OperationType.DELETE, `inquiry_files/${file.id}`);
    }
  },
};
