import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  UploadTaskSnapshot,
} from 'firebase/storage';
import {
  collection,
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  query,
  where,
} from 'firebase/firestore';
import { storage, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { InquiryFile, UserRole } from '../types';
import { validateFileForUpload, sanitizeFileName } from '../lib/fileSecurity';

export interface StorageStatus {
  isConfigured: boolean;
  bucketName: string;
  errorMessage?: string;
}

export const inquiryStorageService = {
  /**
   * Firebase Storage 활성화 여부 확인
   * 버킷 존재 및 엔드포인트 접근 가능 여부를 점검합니다.
   */
  async checkStorageAvailability(): Promise<StorageStatus> {
    const bucketName = storage.app.options.storageBucket || '';
    if (!bucketName) {
      return {
        isConfigured: false,
        bucketName: '',
        errorMessage: 'Firebase Storage 설정이 필요합니다. (storageBucket 설정 없음)',
      };
    }

    try {
      const response = await fetch(
        `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o?maxResults=1`
      );
      if (response.status === 404) {
        return {
          isConfigured: false,
          bucketName,
          errorMessage: 'Firebase Storage 설정이 필요합니다. (Storage 버킷 미존재)',
        };
      }
      return {
        isConfigured: true,
        bucketName,
      };
    } catch (err: any) {
      return {
        isConfigured: false,
        bucketName,
        errorMessage: 'Firebase Storage 설정이 필요합니다.',
      };
    }
  },

  /**
   * 문의 첨부파일 업로드
   * 저장 경로:
   *  - 기업 문의: inquiries/{companyId}/{inquiryId}/{fileId}/{fileName}
   *  - 비소속 개인 문의: inquiries/individual/{requesterId}/{inquiryId}/{fileId}/{fileName}
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

    if (!inquiryId || !requesterId) {
      throw new Error('문의 식별자(inquiryId) 또는 작성자 식별자(requesterId)가 누락되었습니다.');
    }

    // 1. Storage 실제 활성화 여부 확인
    const storageStatus = await this.checkStorageAvailability();
    if (!storageStatus.isConfigured) {
      throw new Error('Firebase Storage 설정이 필요합니다.');
    }

    // 2. 공통 파일 보안 검증 (20MB 제한, 위험 확장자/실행파일 차단)
    const validation = validateFileForUpload(file);
    if (!validation.isValid) {
      throw new Error(validation.error || '유효하지 않은 파일입니다.');
    }

    const safeName = validation.sanitizedName || sanitizeFileName(file.name);
    const fileId = `file_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    // 3. 저장 경로 분기 (기업 문의 vs 비소속 개인 문의)
    let storagePath = '';
    if (companyId && companyId.trim()) {
      storagePath = `inquiries/${companyId.trim()}/${inquiryId}/${fileId}/${safeName}`;
    } else {
      storagePath = `inquiries/individual/${requesterId}/${inquiryId}/${fileId}/${safeName}`;
    }

    const fileRef = ref(storage, storagePath);

    // 4. Firebase Storage 바이너리 업로드 (가짜 성공 처리 절대 금지)
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
            const percent = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
            onProgress(percent);
          }
        },
        (error) => {
          console.error('[Inquiry Storage Upload Error]', error);
          if (
            error.code === 'storage/unknown' ||
            error.code === 'storage/bucket-not-found' ||
            error.code === 'storage/project-not-found' ||
            error.message?.includes('unknown error')
          ) {
            reject(new Error('Firebase Storage 설정이 필요합니다.'));
          } else if (error.code === 'storage/unauthorized') {
            reject(new Error('파일 업로드 권한이 없습니다.'));
          } else {
            reject(new Error(`파일 업로드 실패: ${error.message}`));
          }
        },
        () => {
          resolve();
        }
      );
    });

    // 5. Firestore 별도 컬렉션 inquiry_files 에 메타데이터 저장
    // 보안 준수: 파일 다운로드 URL을 장기간 공개 가능한 형태로 Firestore에 저장하지 않음!
    const now = new Date().toISOString();
    const fileMetadata: InquiryFile = {
      id: fileId,
      inquiryId,
      companyId: companyId && companyId.trim() ? companyId.trim() : null,
      requesterId,
      uploadedById,
      uploadedByRole,
      originalFileName: file.name,
      storagePath,
      contentType: file.type || 'application/octet-stream',
      size: file.size,
      uploadedAt: now,
    };

    try {
      const docRef = doc(db, 'inquiry_files', fileId);
      await setDoc(docRef, fileMetadata);
      return fileMetadata;
    } catch (err) {
      // 메타데이터 저장 실패 시 업로드된 storage 파일 정리 시도
      try {
        await deleteObject(fileRef);
      } catch (cleanupErr) {
        console.warn('Inquiry Storage file cleanup notice:', cleanupErr);
      }
      handleFirestoreError(err, OperationType.CREATE, `inquiry_files/${fileId}`);
    }
  },

  /**
   * 특정 문의의 첨부파일 메타데이터 목록 조회
   */
  async getFilesByInquiry(inquiryId: string): Promise<InquiryFile[]> {
    if (!inquiryId) return [];
    const colRef = collection(db, 'inquiry_files');
    try {
      const q = query(colRef, where('inquiryId', '==', inquiryId));
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => d.data() as InquiryFile);
      return list.sort((a, b) => ((a.uploadedAt || '') > (b.uploadedAt || '') ? 1 : -1));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `inquiry_files?inquiryId=${inquiryId}`);
    }
  },

  /**
   * storagePath 기준 권한 확인 후 실시간 다운로드 URL 생성 및 브라우저 다운로드
   * 장기 공개 URL을 DB에 저장하지 않고 필요 시점마다 온디맨드로 발급하여 안전하게 다운로드합니다.
   */
  async downloadInquiryFile(params: {
    file: InquiryFile;
    currentUserUid: string;
    userRole: UserRole;
    userCompanyId?: string | null;
  }): Promise<void> {
    const { file, currentUserUid, userRole, userCompanyId } = params;

    if (!file.storagePath) {
      throw new Error('파일 저장 경로가 누락되었습니다.');
    }

    // 1. 역할별 다운로드 권한 검증
    if (userRole === 'ADMIN') {
      // ADMIN: 전체 접근 허용
    } else if (userRole === 'COMPANY') {
      // COMPANY: 자기 회사 문의의 파일만 접근
      if (!userCompanyId || !file.companyId || file.companyId !== userCompanyId) {
        throw new Error('자사 문의의 첨부파일만 다운로드할 수 있습니다.');
      }
    } else if (userRole === 'WORKER') {
      // 비소속 개인 WORKER: 본인이 작성한 문의의 파일만 접근
      if (file.requesterId !== currentUserUid) {
        throw new Error('본인이 작성한 문의의 첨부파일만 다운로드할 수 있습니다.');
      }
    } else {
      throw new Error('파일 다운로드 권한이 없습니다.');
    }

    // 2. storagePath 기준 일회성 다운로드 URL 조회 및 다운로드 트리거
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
      console.error('[Inquiry Download Error]', error);
      if (
        error.code === 'storage/unknown' ||
        error.code === 'storage/bucket-not-found' ||
        error.message?.includes('unknown error')
      ) {
        throw new Error('Firebase Storage 설정이 필요합니다.');
      } else if (error.code === 'storage/unauthorized') {
        throw new Error('파일 다운로드 권한이 없습니다.');
      }
      throw new Error(`파일 다운로드 실패: ${error.message}`);
    }
  },

  /**
   * 첨부파일 삭제 (스토리지 객체 및 Firestore 문서 동시 삭제)
   */
  async deleteInquiryFile(file: InquiryFile): Promise<void> {
    try {
      const fileRef = ref(storage, file.storagePath);
      await deleteObject(fileRef);
    } catch (e: any) {
      if (e.code !== 'storage/object-not-found') {
        console.warn('Storage delete notice:', e);
      }
    }

    try {
      await deleteDoc(doc(db, 'inquiry_files', file.id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `inquiry_files/${file.id}`);
    }
  },
};
