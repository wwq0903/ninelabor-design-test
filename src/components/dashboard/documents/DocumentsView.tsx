import React, { useEffect, useState, useMemo } from 'react';
import { Company, UserRole, CompanyDocument, CompanyDocumentCategory } from '../../../types';
import { documentService, canDeleteCompanyDocument } from '../../../services/documentService';
import { firmService } from '../../../services/firmService';
import { useAuth } from '../../../contexts/AuthContext';
import {
  COMPANY_DOCUMENT_CATEGORIES,
  getCompanyDocumentCategoryConfig,
} from '../../../constants/companyDocuments';
import { formatFileSize } from '../../../lib/fileSecurity';
import {
  FolderOpen,
  Search,
  FileText,
  Building2,
  Calendar,
  ShieldAlert,
  User,
  Plus,
  UploadCloud,
  CheckCircle2,
  X,
  AlertTriangle,
  Paperclip,
  Loader2,
  Download,
  Trash2,
} from 'lucide-react';

interface DocumentsViewProps {
  role: UserRole;
  companyId?: string;
  employeeId?: string;
}

export const DocumentsView: React.FC<DocumentsViewProps> = ({
  role,
  companyId,
}) => {
  const { currentUser, userProfile } = useAuth();
  const [documents, setDocuments] = useState<CompanyDocument[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedCompanyFilter, setSelectedCompanyFilter] = useState<string>('ALL');
  const [fetchError, setFetchError] = useState<string | null>(null);

  // [R2-7 1/3-B] 신규 문서 등록 모달 상태
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadCompanyId, setUploadCompanyId] = useState<string>('');
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadCategory, setUploadCategory] = useState<CompanyDocumentCategory>('LABOR_CONTRACT');
  const [uploadDescription, setUploadDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileValidationError, setFileValidationError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccessMessage, setUploadSuccessMessage] = useState<string | null>(null);

  // [R2-7 1/3-C-②] 문서 다운로드 상태
  const [downloadingDocId, setDownloadingDocId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadSuccessMessage, setDownloadSuccessMessage] = useState<string | null>(null);

  // [R2-7 1/3-C-③] 기업 문서 삭제 상태
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [deleteModalDoc, setDeleteModalDoc] = useState<CompanyDocument | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccessMessage, setDeleteSuccessMessage] = useState<string | null>(null);

  // 1. 비로그인 및 WORKER 권한 접근 차단 (Requirement: WORKER 접근 불가, 비로그인 접근 불가)
  const isWorker = role === 'WORKER';
  const isNotLoggedIn = !currentUser;

  const effectiveCompanyId = companyId || userProfile?.companyId || '';

  const fetchDocuments = async () => {
    if (isWorker || isNotLoggedIn) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setFetchError(null);

      if (role === 'ADMIN') {
        // ADMIN: 전체 기업 목록 및 문서 조회
        const [docList, compList] = await Promise.all([
          documentService.getAllCompanyDocuments(
            selectedCompanyFilter === 'ALL' ? undefined : selectedCompanyFilter,
            selectedCategory === 'ALL' ? undefined : (selectedCategory as CompanyDocumentCategory)
          ),
          firmService.getAllCompanies(),
        ]);
        setDocuments(docList || []);
        setCompanies(compList || []);
      } else if (role === 'COMPANY') {
        // COMPANY: 자사 문서만 조회
        if (!effectiveCompanyId) {
          setDocuments([]);
        } else {
          const docList = await documentService.getCompanyDocumentsByCompany(
            effectiveCompanyId,
            selectedCategory === 'ALL' ? undefined : (selectedCategory as CompanyDocumentCategory)
          );
          setDocuments(docList || []);
        }
      }
    } catch (err: any) {
      console.error('문서 목록 조회 실패:', err);
      setFetchError('문서 목록을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, [role, currentUser?.uid, effectiveCompanyId, selectedCompanyFilter, selectedCategory]);

  // 모달 열릴 때 초기화
  const handleOpenUploadModal = () => {
    setUploadTitle('');
    setUploadCategory('LABOR_CONTRACT');
    setUploadDescription('');
    setSelectedFile(null);
    setFileValidationError(null);
    setUploadError(null);

    if (role === 'COMPANY') {
      setUploadCompanyId(effectiveCompanyId);
    } else {
      // ADMIN일 경우 필터된 기업이 있으면 기본 선택
      setUploadCompanyId(selectedCompanyFilter !== 'ALL' ? selectedCompanyFilter : '');
    }
    setIsUploadModalOpen(true);
  };

  // 파일 선택 핸들러 & 즉각적인 유효성 검사
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setSelectedFile(null);
      setFileValidationError(null);
      return;
    }

    const validation = documentService.validateCompanyDocumentFile(file);
    if (!validation.isValid) {
      setSelectedFile(null);
      setFileValidationError(validation.error || '유효하지 않은 파일입니다.');
      e.target.value = '';
      return;
    }

    setFileValidationError(null);
    setSelectedFile(file);

    // 제목이 비어있으면 파일명(확장자 제외)으로 기본값 제안
    if (!uploadTitle.trim()) {
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
      setUploadTitle(nameWithoutExt);
    }
  };

  // 문서 등록 제출 핸들러 (R2-7 1/3-B 처리 순서 준수)
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    const targetCompanyId = role === 'ADMIN' ? uploadCompanyId : effectiveCompanyId;
    if (!targetCompanyId) {
      setUploadError('문서를 등록할 대상 기업을 선택해주세요.');
      return;
    }

    if (!selectedFile) {
      setUploadError('등록할 파일을 선택해주세요.');
      return;
    }

    if (!uploadTitle.trim()) {
      setUploadError('문서명을 입력해주세요.');
      return;
    }

    // 대상 기업명 추출
    let targetCompanyName = '';
    if (role === 'ADMIN') {
      const found = companies.find((c) => c.id === targetCompanyId);
      targetCompanyName = found?.companyName || '미지정 기업';
    } else {
      targetCompanyName = userProfile?.displayName || userProfile?.companyName || '자사';
    }

    try {
      setIsUploading(true);
      setUploadError(null);

      // ① 파일 유효성 검사 -> ② Storage 업로드 -> ③ 성공 시 Firestore 생성
      await documentService.uploadCompanyDocument({
        file: selectedFile,
        companyId: targetCompanyId,
        companyName: targetCompanyName,
        title: uploadTitle.trim(),
        category: uploadCategory,
        description: uploadDescription.trim(),
        uploadedById: currentUser.uid,
        uploadedByRole: role as 'ADMIN' | 'COMPANY',
      });

      // 등록 성공 처리
      setIsUploadModalOpen(false);
      setUploadSuccessMessage(`'${uploadTitle.trim()}' 문서가 성공적으로 보관함에 등록되었습니다.`);
      setTimeout(() => setUploadSuccessMessage(null), 4000);

      // 목록 새로고침
      await fetchDocuments();
    } catch (err: any) {
      console.error('문서 등록 실패:', err);
      setUploadError(err.message || '문서 등록 중 오류가 발생했습니다.');
    } finally {
      setIsUploading(false);
    }
  };

  // [R2-7 1/3-C-②] 기업 문서 다운로드 핸들러
  const handleDownload = async (docItem: CompanyDocument) => {
    if (!currentUser) {
      setDownloadError('로그인 후 문서를 다운로드할 수 있습니다.');
      return;
    }
    if (downloadingDocId) return; // 중복 다운로드 요청 방지

    setDownloadError(null);
    setDownloadSuccessMessage(null);
    setDownloadingDocId(docItem.id);

    try {
      await documentService.downloadCompanyDocument(docItem, {
        uid: currentUser.uid,
        role: role as 'ADMIN' | 'COMPANY' | 'WORKER',
        companyId: effectiveCompanyId,
      });
      setDownloadSuccessMessage(`'${docItem.originalFileName || docItem.title}' 파일을 다운로드했습니다.`);
      setTimeout(() => setDownloadSuccessMessage(null), 4000);
    } catch (err: any) {
      console.error('문서 다운로드 실패:', err);
      // 실패 시 성공으로 위장하지 않고 구체적 안내 메시지 표출
      setDownloadError(err?.message || '문서 다운로드 중 오류가 발생했습니다.');
    } finally {
      setDownloadingDocId(null);
    }
  };

  // [R2-7 1/3-C-③] 기업 문서 삭제 요청 (확인 모달 표출)
  const handleDeleteClick = (docItem: CompanyDocument) => {
    setDeleteError(null);
    setDeleteSuccessMessage(null);
    setDeleteModalDoc(docItem);
  };

  // [R2-7 1/3-C-③] 기업 문서 삭제 실행 (Storage 파일 삭제 -> Firestore 문서 삭제 순차 진행)
  const handleDeleteConfirm = async () => {
    if (!deleteModalDoc || !currentUser) return;
    const targetDoc = deleteModalDoc;
    const docId = targetDoc.id;

    setDeletingDocId(docId);
    setDeleteError(null);

    try {
      const authContext = {
        uid: currentUser.uid,
        role: role as 'ADMIN' | 'COMPANY' | 'WORKER',
        companyId: effectiveCompanyId,
      };

      await documentService.deleteCompanyDocument(targetDoc, authContext);

      // 전체 작업 완료된 경우에만 목록에서 제거
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
      setDeleteSuccessMessage(`문서 '${targetDoc.title}'이(가) 안전하게 삭제되었습니다.`);
      setDeleteModalDoc(null);
      setTimeout(() => setDeleteSuccessMessage(null), 4000);
    } catch (err: any) {
      console.error('문서 삭제 실패:', err);
      // 부분 실패 또는 Storage 실패 시 성공으로 표시하지 않고 오류 안내 표출 (목록 유지)
      setDeleteError(err?.message || '문서 삭제 중 오류가 발생했습니다.');
      setDeleteModalDoc(null);
    } finally {
      setDeletingDocId(null);
    }
  };

  // 검색 필터링 (문서명, 기업명, 설명, 카테고리명)
  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return documents;
    return documents.filter((d) => {
      const matchTitle = (d.title || '').toLowerCase().includes(q);
      const matchCompany = (d.companyName || '').toLowerCase().includes(q);
      const matchDesc = (d.description || '').toLowerCase().includes(q);
      const catConfig = getCompanyDocumentCategoryConfig(d.category);
      const matchCategory = catConfig.label.toLowerCase().includes(q);
      return matchTitle || matchCompany || matchDesc || matchCategory;
    });
  }, [documents, searchQuery]);

  // 1. 근로자 및 비로그인 접근 제한 화면 (Requirement: 접근 불가)
  if (isWorker || isNotLoggedIn) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 sm:p-12 text-center max-w-xl mx-auto my-8 shadow-xs">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 mb-4 border border-amber-200">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">기업 문서관리 접근 권한 제한</h2>
        <p className="mt-2 text-xs text-slate-600 leading-relaxed">
          {isWorker
            ? '근로자 계정에서는 기업 문서관리 기능에 접근할 수 없습니다. (최고관리자 및 기업회원 전용 기능)'
            : '로그인 후 이용할 수 있는 기능입니다.'}
        </p>
        <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-500">
          보안 정책: R2-7 기업 전용 문서 격리 관리
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Fetch Error Banner */}
      {fetchError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 shadow-xs">
          <span>{fetchError}</span>
        </div>
      )}

      {/* Success Notification Banner */}
      {uploadSuccessMessage && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span className="font-medium">{uploadSuccessMessage}</span>
          </div>
          <button
            onClick={() => setUploadSuccessMessage(null)}
            className="text-emerald-600 hover:text-emerald-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* [R2-7 1/3-C-②] Download Error Banner */}
      {downloadError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
            <span className="font-medium">{downloadError}</span>
          </div>
          <button
            onClick={() => setDownloadError(null)}
            className="text-rose-600 hover:text-rose-800"
            title="닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* [R2-7 1/3-C-②] Download Success Banner */}
      {downloadSuccessMessage && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span className="font-medium">{downloadSuccessMessage}</span>
          </div>
          <button
            onClick={() => setDownloadSuccessMessage(null)}
            className="text-emerald-600 hover:text-emerald-800"
            title="닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* [R2-7 1/3-C-③] Delete Error Banner */}
      {deleteError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
            <span className="font-medium">{deleteError}</span>
          </div>
          <button
            onClick={() => setDeleteError(null)}
            className="text-rose-600 hover:text-rose-800"
            title="닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* [R2-7 1/3-C-③] Delete Success Banner */}
      {deleteSuccessMessage && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span className="font-medium">{deleteSuccessMessage}</span>
          </div>
          <button
            onClick={() => setDeleteSuccessMessage(null)}
            className="text-emerald-600 hover:text-emerald-800"
            title="닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Header & [문서 등록] 버튼 (R2-7 1/3-B) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {role === 'ADMIN' ? '통합 관리자' : '기업 전용'}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 border border-slate-200">
              총 {documents.length}건
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <FolderOpen className="h-6 w-6 text-slate-700" />
            기업 문서관리
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            {role === 'ADMIN'
              ? '전체 고객사의 법정 노무 서식 및 인사·급여 문서를 안전하게 보관하고 관리합니다.'
              : '우리 사업장의 근로계약서, 취업규칙, 급여자료 등 주요 노무 문서를 안전하게 등록하고 보관합니다.'}
          </p>
        </div>

        {/* [문서 등록] 버튼 (ADMIN 및 COMPANY 전용) */}
        <div>
          <button
            type="button"
            onClick={handleOpenUploadModal}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 transition"
          >
            <Plus className="h-4 w-4" />
            <span>문서 등록</span>
          </button>
        </div>
      </div>

      {/* Filters Toolbar (기업 필터, 카테고리 필터, 문서 검색) */}
      <div className="space-y-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        {/* Row 1: ADMIN 기업 선택 필터 & 검색창 */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {role === 'ADMIN' ? (
            <div className="flex items-center gap-2 flex-1 max-w-sm">
              <Building2 className="h-4 w-4 text-slate-400 shrink-0" />
              <label htmlFor="company-filter" className="sr-only">
                기업 선택
              </label>
              <select
                id="company-filter"
                value={selectedCompanyFilter}
                onChange={(e) => setSelectedCompanyFilter(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs bg-white text-slate-700 focus:border-slate-800 focus:outline-none"
              >
                <option value="ALL">전체 기업 문서 보기</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.companyName} ({c.businessNumber})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-slate-600 font-medium">
              <Building2 className="h-4 w-4 text-blue-600" />
              <span>자사 전용 문서함 ({userProfile?.displayName || userProfile?.companyName || '우리 회사'})</span>
            </div>
          )}

          {/* 문서명 검색 */}
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="문서명 검색"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-1.5 text-xs focus:border-slate-800 focus:outline-none"
            />
          </div>
        </div>

        {/* Row 2: 카테고리 필터 탭 (7개 문서 카테고리) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-2 border-t border-slate-100 pb-0.5">
          <button
            onClick={() => setSelectedCategory('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
              selectedCategory === 'ALL'
                ? 'bg-slate-900 text-white font-bold shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            전체 분류
          </button>
          {COMPANY_DOCUMENT_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                selectedCategory === cat.id
                  ? 'bg-slate-900 text-white font-bold shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Document List / Table */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500">문서 목록을 불러오는 중입니다...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <FolderOpen className="mx-auto h-8 w-8 text-slate-300" />
            <p className="text-xs font-semibold text-slate-700">등록된 문서가 없습니다.</p>
            <p className="text-[11px] text-slate-400">
              {searchQuery
                ? '검색 조건과 일치하는 문서가 없습니다.'
                : '상단의 [문서 등록] 버튼을 눌러 첫 기업 문서를 보관함에 등록해보세요.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold text-slate-600">
                <tr>
                  <th className="py-3 px-4">분류</th>
                  <th className="py-3 px-4">문서명</th>
                  <th className="py-3 px-4">첨부 파일</th>
                  {role === 'ADMIN' && <th className="py-3 px-4">기업명</th>}
                  <th className="py-3 px-4">등록자</th>
                  <th className="py-3 px-4">등록일</th>
                  <th className="py-3 px-4 text-center">다운로드</th>
                  <th className="py-3 px-4 text-center">삭제</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filtered.map((docItem) => {
                  const catCfg = getCompanyDocumentCategoryConfig(docItem.category);
                  const isCurrentDownloading = downloadingDocId === docItem.id;
                  const isCurrentDeleting = deletingDocId === docItem.id;
                  const canDelete = canDeleteCompanyDocument(docItem, {
                    uid: currentUser?.uid || '',
                    role,
                    companyId: effectiveCompanyId,
                  });

                  return (
                    <tr key={docItem.id} className="hover:bg-slate-50/60 transition">
                      {/* 분류 */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold border ${catCfg.badgeBg}`}
                        >
                          {catCfg.label}
                        </span>
                      </td>

                      {/* 문서명 및 설명 */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900 flex items-center gap-2">
                          <FileText className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="truncate max-w-xs sm:max-w-md">{docItem.title}</span>
                        </div>
                        {docItem.description && (
                          <p className="text-[11px] text-slate-400 mt-0.5 truncate max-w-xs sm:max-w-md">
                            {docItem.description}
                          </p>
                        )}
                      </td>

                      {/* 첨부 파일 정보 */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-slate-600">
                          <Paperclip className="h-3 w-3 text-slate-400 shrink-0" />
                          <span className="font-mono text-[11px] max-w-[140px] truncate" title={docItem.originalFileName}>
                            {docItem.originalFileName || '-'}
                          </span>
                          {docItem.size ? (
                            <span className="text-[10px] text-slate-400">
                              ({formatFileSize(docItem.size)})
                            </span>
                          ) : null}
                        </div>
                      </td>

                      {/* 기업명 (ADMIN 전용 표시) */}
                      {role === 'ADMIN' && (
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 font-medium text-slate-800">
                            <Building2 className="h-3 w-3 text-slate-400" />
                            <span>{docItem.companyName || '-'}</span>
                          </div>
                        </td>
                      )}

                      {/* 등록자 */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-medium ${
                            docItem.uploadedByRole === 'ADMIN' ? 'text-indigo-600' : 'text-slate-600'
                          }`}
                        >
                          <User className="h-3 w-3" />
                          {docItem.uploadedByRole === 'ADMIN' ? '최고관리자 (노무사)' : '기업 담당자'}
                        </span>
                      </td>

                      {/* 등록일 */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-slate-500 font-mono text-[11px]">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-slate-400" />
                          <span>
                            {docItem.createdAt
                              ? new Date(docItem.createdAt).toLocaleDateString('ko-KR')
                              : '-'}
                          </span>
                        </div>
                      </td>

                      {/* [R2-7 1/3-C-②] 다운로드 버튼 */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-center">
                        <button
                          type="button"
                          onClick={() => handleDownload(docItem)}
                          disabled={downloadingDocId !== null || deletingDocId !== null || !docItem.storagePath}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition"
                          title={!docItem.storagePath ? '저장 경로가 없는 문서입니다.' : '문서 파일 다운로드'}
                        >
                          {isCurrentDownloading ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />
                              <span className="text-slate-500 font-normal">다운로드 중...</span>
                            </>
                          ) : (
                            <>
                              <Download className="h-3.5 w-3.5 text-slate-600" />
                              <span>다운로드</span>
                            </>
                          )}
                        </button>
                      </td>

                      {/* [R2-7 1/3-C-③] 삭제 버튼 (권한이 있는 문서에만 표시) */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-center">
                        {canDelete ? (
                          <button
                            type="button"
                            onClick={() => handleDeleteClick(docItem)}
                            disabled={deletingDocId !== null || downloadingDocId !== null}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-medium text-rose-600 shadow-xs hover:bg-rose-50 hover:border-rose-300 disabled:opacity-50 disabled:cursor-not-allowed transition"
                            title="문서 및 저장소 파일 삭제"
                          >
                            {isCurrentDeleting ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-rose-500" />
                                <span className="text-rose-500 font-normal">삭제 중...</span>
                              </>
                            ) : (
                              <>
                                <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                                <span>삭제</span>
                              </>
                            )}
                          </button>
                        ) : (
                          <span className="text-slate-300 text-xs">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* [R2-7 1/3-B] 신규 문서 등록 모달 */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-slate-100 p-2 text-slate-700">
                  <UploadCloud className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">기업 문서 등록</h3>
                  <p className="text-[11px] text-slate-500">
                    실제 문서 파일을 안전하게 Storage에 업로드하고 보관함에 등록합니다.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isUploading && setIsUploadModalOpen(false)}
                disabled={isUploading}
                className="text-slate-400 hover:text-slate-600 disabled:opacity-40"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Error Message Alert */}
            {uploadError && (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span className="font-semibold">등록 실패: </span>
                  <span>{uploadError}</span>
                </div>
              </div>
            )}

            <form onSubmit={handleUploadSubmit} className="mt-4 space-y-4">
              {/* 1. 기업 선택 (ADMIN: 선택, COMPANY: 자동 고정) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  대상 기업 <span className="text-rose-500">*</span>
                </label>
                {role === 'ADMIN' ? (
                  <select
                    value={uploadCompanyId}
                    onChange={(e) => setUploadCompanyId(e.target.value)}
                    required
                    disabled={isUploading}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs bg-white text-slate-800 focus:border-slate-800 focus:outline-none"
                  >
                    <option value="">대상 기업을 선택하세요</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.companyName} ({c.businessNumber})
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                    <Building2 className="h-4 w-4 text-slate-400" />
                    <span className="font-semibold text-slate-900">
                      {userProfile?.displayName || userProfile?.companyName || '자사'}
                    </span>
                    <span className="text-[11px] text-slate-400">(본인 소속 기업으로 자동 고정)</span>
                  </div>
                )}
              </div>

              {/* 2. 문서명 */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  문서명 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="예: 2026년 표준 취업규칙(개정안)"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  disabled={isUploading}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-800 focus:outline-none"
                />
              </div>

              {/* 3. 문서 분류 (7개 카테고리) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  문서 분류 <span className="text-rose-500">*</span>
                </label>
                <select
                  value={uploadCategory}
                  onChange={(e) => setUploadCategory(e.target.value as CompanyDocumentCategory)}
                  required
                  disabled={isUploading}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs bg-white text-slate-800 focus:border-slate-800 focus:outline-none"
                >
                  {COMPANY_DOCUMENT_CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* 4. 설명 (선택) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  설명 <span className="text-slate-400 font-normal">(선택)</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="문서에 대한 추가 참고사항이나 설명을 입력하세요."
                  value={uploadDescription}
                  onChange={(e) => setUploadDescription(e.target.value)}
                  disabled={isUploading}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-800 focus:outline-none resize-none"
                />
              </div>

              {/* 5. 파일 선택 (필수, R2-7 1/3-B) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  파일 첨부 <span className="text-rose-500">*</span>
                </label>
                <div className="rounded-xl border border-dashed border-slate-300 p-4 bg-slate-50/50 text-center hover:bg-slate-50 transition">
                  <input
                    type="file"
                    id="company-doc-file"
                    onChange={handleFileChange}
                    disabled={isUploading}
                    className="hidden"
                  />
                  {selectedFile ? (
                    <div className="flex items-center justify-between bg-white p-2.5 rounded-lg border border-slate-200 text-left">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <FileText className="h-4 w-4 text-slate-500 shrink-0" />
                        <div className="truncate">
                          <p className="text-xs font-medium text-slate-800 truncate">{selectedFile.name}</p>
                          <p className="text-[10px] text-slate-400">{formatFileSize(selectedFile.size)}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedFile(null);
                          setFileValidationError(null);
                        }}
                        disabled={isUploading}
                        className="text-slate-400 hover:text-slate-600 p-1"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <label
                      htmlFor="company-doc-file"
                      className="cursor-pointer flex flex-col items-center justify-center gap-1.5"
                    >
                      <Paperclip className="h-5 w-5 text-slate-400" />
                      <span className="text-xs font-semibold text-slate-700">파일을 선택해주세요</span>
                      <span className="text-[10px] text-slate-400">
                        PDF, HWP, 오피스 문서, 이미지, 압축파일 (최대 20MB)
                      </span>
                    </label>
                  )}
                </div>

                {/* File Validation Error */}
                {fileValidationError && (
                  <div className="mt-2 rounded-lg bg-rose-50 border border-rose-200 p-2 text-[11px] text-rose-700 flex items-start gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-rose-600 shrink-0 mt-0.5" />
                    <span>{fileValidationError}</span>
                  </div>
                )}
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(false)}
                  disabled={isUploading}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition disabled:opacity-40"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={
                    isUploading ||
                    !selectedFile ||
                    !uploadTitle.trim() ||
                    (role === 'ADMIN' && !uploadCompanyId) ||
                    !!fileValidationError
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 transition disabled:opacity-40"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>업로드 중...</span>
                    </>
                  ) : (
                    <span>등록하기</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* [R2-7 1/3-C-③] 기업 문서 삭제 확인 모달 */}
      {deleteModalDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200">
            <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
              <div className="rounded-xl bg-rose-50 p-2.5 text-rose-600 border border-rose-100">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">기업 문서 삭제</h3>
                <p className="text-[11px] text-slate-500">
                  선택한 문서와 저장소(Storage)의 실제 파일을 삭제합니다.
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">문서명</span>
                  <span className="font-semibold text-slate-900 truncate max-w-[200px]" title={deleteModalDoc.title}>
                    {deleteModalDoc.title}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">첨부 파일</span>
                  <span className="font-mono text-slate-700 truncate max-w-[200px]" title={deleteModalDoc.originalFileName}>
                    {deleteModalDoc.originalFileName || '-'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">분류</span>
                  <span className="font-medium text-slate-700">
                    {getCompanyDocumentCategoryConfig(deleteModalDoc.category).label}
                  </span>
                </div>
              </div>

              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-[11px] text-amber-800 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-semibold">삭제 처리 순서 및 주의사항</p>
                  <p>
                    ① Firebase Storage 실제 파일 삭제 후 ② company_documents 문서가 순차적으로 삭제됩니다.
                    삭제 완료 후에는 복구할 수 없습니다.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteModalDoc(null)}
                disabled={deletingDocId !== null}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={deletingDocId !== null}
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-rose-700 disabled:opacity-50 transition"
              >
                {deletingDocId !== null ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>삭제 처리 중...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>삭제 확인</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
