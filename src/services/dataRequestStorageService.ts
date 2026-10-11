import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  UploadTaskSnapshot,
} from 'firebase/storage';
import { storage } from '../lib/firebase';
import { DataRequestFile } from '../types';
import { validateFileForUpload, sanitizeFileName } from '../lib/fileSecurity';

export interface StorageStatus {
  isConfigured: boolean;
  bucketName: string;
  errorMessage?: string;
}

export const dataRequestStorageService = {
  /**
   * Check whether Firebase Storage is configured and active
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
      // Test storage endpoint reachability via REST check
      const response = await fetch(`https://firebasestorage.googleapis.com/v0/b/${bucketName}/o?maxResults=1`);
      if (response.status === 404) {
        return {
          isConfigured: false,
          bucketName,
          errorMessage: 'Firebase Storage 설정이 필요합니다. (Storage 버킷이 생성되지 않았거나 비활성화됨)',
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
        errorMessage: `Firebase Storage 설정이 필요합니다. (${err.message})`,
      };
    }
  },

  /**
   * Upload a single file to Firebase Storage under the isolated path:
   * data-requests/{companyId}/{dataRequestId}/{fileId}/{fileName}
   */
  async uploadDataRequestFile(params: {
    file: File;
    companyId: string;
    dataRequestId: string;
    uploadedById: string;
    uploadedByName?: string;
    onProgress?: (percent: number) => void;
  }): Promise<DataRequestFile> {
    const { file, companyId, dataRequestId, uploadedById, uploadedByName, onProgress } = params;

    if (!companyId || !dataRequestId) {
      throw new Error('기업 식별자(companyId) 또는 자료요청 식별자(dataRequestId)가 누락되었습니다.');
    }

    // 1. File security validation
    const validation = validateFileForUpload(file);
    if (!validation.isValid) {
      throw new Error(validation.error || '유효하지 않은 파일입니다.');
    }

    const safeName = validation.sanitizedName || sanitizeFileName(file.name);
    const fileId = `file_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    // 2. Strict company & request isolated path:
    // data-requests/{companyId}/{dataRequestId}/{fileId}/{fileName}
    const storagePath = `data-requests/${companyId}/${dataRequestId}/${fileId}/${safeName}`;
    const fileRef = ref(storage, storagePath);

    return new Promise((resolve, reject) => {
      const uploadTask = uploadBytesResumable(fileRef, file, {
        contentType: file.type || 'application/octet-stream',
        customMetadata: {
          companyId,
          dataRequestId,
          uploadedById,
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
          console.error('[Storage Upload Error]', error);
          if (error.code === 'storage/unknown' || error.message?.includes('unknown error')) {
            reject(
              new Error(
                'Firebase Storage 설정이 필요합니다. Storage 버킷이 아직 활성화되지 않았습니다.'
              )
            );
          } else if (error.code === 'storage/unauthorized') {
            reject(new Error('업로드 권한이 없습니다. (자사 자료요청에만 업로드 가능)'));
          } else {
            reject(new Error(`파일 업로드 실패: ${error.message}`));
          }
        },
        async () => {
          try {
            // Upload complete - retrieve real download URL
            const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
            const now = new Date().toISOString();

            const fileMetadata: DataRequestFile = {
              fileId,
              dataRequestId,
              companyId,
              uploadedById,
              uploadedByName: uploadedByName || '사용자',
              originalFileName: file.name,
              storagePath,
              downloadUrl,
              contentType: file.type || 'application/octet-stream',
              size: file.size,
              uploadedAt: now,
            };

            resolve(fileMetadata);
          } catch (urlErr: any) {
            reject(new Error(`다운로드 URL 생성 실패: ${urlErr.message}`));
          }
        }
      );
    });
  },

  /**
   * Delete a file from Firebase Storage
   * Verifies companyId and dataRequestId to prevent cross-tenant deletion
   */
  async deleteDataRequestFile(params: {
    storagePath: string;
    companyId: string;
    dataRequestId: string;
  }): Promise<void> {
    const { storagePath, companyId, dataRequestId } = params;

    // Verify expected path structure: data-requests/{companyId}/{dataRequestId}/...
    const expectedPrefix = `data-requests/${companyId}/${dataRequestId}/`;
    if (!storagePath.startsWith(expectedPrefix)) {
      throw new Error('보안 위반: 파일 저장 경로가 해당 기업 또는 요청과 일치하지 않습니다.');
    }

    try {
      const fileRef = ref(storage, storagePath);
      await deleteObject(fileRef);
    } catch (error: any) {
      if (error.code === 'storage/object-not-found') {
        console.warn('Storage file already deleted or not found');
        return;
      }
      throw error;
    }
  },

  /**
   * Download a real file from Firebase Storage
   */
  async downloadDataRequestFile(file: DataRequestFile): Promise<void> {
    if (!file.storagePath) {
      throw new Error('파일 저장 경로가 없습니다.');
    }

    try {
      const fileRef = ref(storage, file.storagePath);
      const url = file.downloadUrl || (await getDownloadURL(fileRef));

      // Trigger real browser download using download anchor
      const link = document.createElement('a');
      link.href = url;
      link.download = file.originalFileName;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error: any) {
      console.error('[Storage Download Error]', error);
      if (error.code === 'storage/unknown' || error.message?.includes('unknown error')) {
        throw new Error('Firebase Storage 설정이 필요합니다. 버킷 활성화 여부를 확인하세요.');
      }
      throw new Error(`파일 다운로드 실패: ${error.message}`);
    }
  },
};
