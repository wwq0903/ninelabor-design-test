import React, { useEffect, useState } from 'react';
import { Company, Worker, WorkerStatus, UserProfile, MembershipStatus } from '../../../types';
import { firmService } from '../../../services/firmService';
import { auditLogService } from '../../../services/auditLogService';
import { auth } from '../../../lib/firebase';
import {
  Users,
  Search,
  Plus,
  Trash2,
  Building2,
  CheckCircle2,
  X,
  UserPlus,
  Info,
  AlertCircle,
  Eye,
  ShieldCheck,
  Lock,
  Edit3,
  Save,
  Clock,
  UserCheck,
  UserX,
  Calendar,
  Phone,
  Mail,
  Briefcase,
  ArrowRightLeft,
  FileText,
  StickyNote,
  User,
  CheckSquare,
} from 'lucide-react';
import { InternalNotesSection } from './InternalNotesSection';
import { EntityTasksSection } from './EntityTasksSection';

interface AdminWorkersViewProps {
  companies: Company[];
  initialCompanyFilter?: string;
  initialViewMode?: 'all' | 'pending';
  onNavigateToSource?: (
    sourceType: any,
    sourceId: string,
    companyId?: string,
    workerId?: string
  ) => void;
}

export const AdminWorkersView: React.FC<AdminWorkersViewProps> = ({
  companies,
  initialCompanyFilter = 'all',
  initialViewMode = 'all',
  onNavigateToSource,
}) => {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [pendingWorkers, setPendingWorkers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(initialCompanyFilter);
  const [statusFilter, setStatusFilter] = useState<'all' | WorkerStatus>('all');
  const [viewTab, setViewTab] = useState<'all' | 'pending'>(initialViewMode);
  const [searchQuery, setSearchQuery] = useState('');

  // Sync initial props if changed externally
  useEffect(() => {
    if (initialCompanyFilter) setSelectedCompanyId(initialCompanyFilter);
  }, [initialCompanyFilter]);

  useEffect(() => {
    if (initialViewMode) setViewTab(initialViewMode);
  }, [initialViewMode]);

  // Modals state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreateAccountModalOpen, setIsCreateAccountModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectingUser, setRejectingUser] = useState<UserProfile | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Processing state
  const [processingUid, setProcessingUid] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // New Worker Form (Manual List Entry)
  const [newWorker, setNewWorker] = useState({
    companyId: '',
    name: '',
    department: '',
    position: '',
    joinDate: '',
    phone: '',
    email: '',
    rrn: '',
  });

  // Server Account Creation Modal Form
  const [accountRole, setAccountRole] = useState<'WORKER' | 'COMPANY'>('WORKER');
  const [accountForm, setAccountForm] = useState({
    email: '',
    displayName: '',
    phone: '',
    rrn: '',
    companyId: '',
    companyName: '',
    businessNumber: '',
    department: '',
    position: '',
    employeeId: '',
    joinDate: '',
    membershipType: 'COMPANY_AFFILIATED' as 'COMPANY_AFFILIATED' | 'INDIVIDUAL',
  });
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [createAccountError, setCreateAccountError] = useState<string | null>(null);
  const [createAccountSuccess, setCreateAccountSuccess] = useState<string | null>(null);

  // Worker Detail & Edit State (Requirements 1, 2, 4, 6, 7, 8)
  const [selectedWorkerForDetail, setSelectedWorkerForDetail] = useState<Worker | null>(null);
  const [workerDetailTab, setWorkerDetailTab] = useState<'info' | 'notes' | 'tasks'>('info');
  const [linkedUserProfile, setLinkedUserProfile] = useState<UserProfile | null>(null);
  const [fullRrn, setFullRrn] = useState<string | null>(null);
  const [rrnLoading, setRrnLoading] = useState(false);
  const [rrnError, setRrnError] = useState<string | null>(null);
  const [isRrnEnvMissing, setIsRrnEnvMissing] = useState(false);
  const [isEditingRrn, setIsEditingRrn] = useState(false);
  const [newRrnInput, setNewRrnInput] = useState('');
  const [savingRrn, setSavingRrn] = useState(false);
  const [saveRrnSuccess, setSaveRrnSuccess] = useState<string | null>(null);

  // Detail Edit Form
  const [isEditingDetail, setIsEditingDetail] = useState(false);
  const [editDetailForm, setEditDetailForm] = useState({
    name: '',
    phone: '',
    email: '',
    companyId: '',
    department: '',
    position: '',
    joinDate: '',
    resignedDate: '',
    status: 'active' as WorkerStatus,
    membershipStatus: 'ACTIVE' as MembershipStatus,
  });
  const [savingDetail, setSavingDetail] = useState(false);
  const [detailSaveSuccess, setDetailSaveSuccess] = useState<string | null>(null);
  const [detailSaveError, setDetailSaveError] = useState<string | null>(null);

  // Load Workers & Pending
  const fetchWorkers = async () => {
    try {
      setLoading(true);
      if (selectedCompanyId === 'all') {
        const list = await firmService.getAllWorkers();
        setWorkers(list);
      } else {
        const list = await firmService.getWorkersByCompany(selectedCompanyId);
        setWorkers(list);
      }
    } catch (err) {
      console.error('Failed to load workers', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPendingWorkers = async () => {
    try {
      const list = await firmService.getPendingAffiliationWorkers();
      setPendingWorkers(list);
    } catch (err) {
      console.error('Failed to load pending workers', err);
    }
  };

  useEffect(() => {
    fetchWorkers();
    fetchPendingWorkers();
  }, [selectedCompanyId]);

  // When worker detail opens, fetch RRN and linked user profile
  useEffect(() => {
    if (!selectedWorkerForDetail) {
      setWorkerDetailTab('info');
      setLinkedUserProfile(null);
      setFullRrn(null);
      setRrnError(null);
      setIsRrnEnvMissing(false);
      setIsEditingRrn(false);
      setNewRrnInput('');
      setSaveRrnSuccess(null);
      setIsEditingDetail(false);
      setDetailSaveSuccess(null);
      setDetailSaveError(null);
      return;
    }

    // Populate detail form
    setEditDetailForm({
      name: selectedWorkerForDetail.name,
      phone: selectedWorkerForDetail.phone || '',
      email: selectedWorkerForDetail.email || '',
      companyId: selectedWorkerForDetail.companyId,
      department: selectedWorkerForDetail.department || '',
      position: selectedWorkerForDetail.position || '',
      joinDate: selectedWorkerForDetail.joinDate || '',
      resignedDate: selectedWorkerForDetail.resignedDate || '',
      status: selectedWorkerForDetail.status,
      membershipStatus: 'ACTIVE',
    });

    let isMounted = true;

    // Load linked user profile if userId is present
    if (selectedWorkerForDetail.userId) {
      firmService
        .getPendingAffiliationWorkers()
        .then((users) => {
          if (!isMounted) return;
          const u = users.find((item) => item.uid === selectedWorkerForDetail.userId);
          if (u) {
            setLinkedUserProfile(u);
            setEditDetailForm((prev) => ({
              ...prev,
              membershipStatus: u.membershipStatus || 'ACTIVE',
            }));
          }
        })
        .catch(() => {});
    }

    // Automatic secure RRN retrieval
    const fetchDecryptedRrn = async () => {
      try {
        setRrnLoading(true);
        setRrnError(null);
        setIsRrnEnvMissing(false);
        const currentUser = auth.currentUser;
        if (!currentUser) {
          if (isMounted) setRrnError('로그인 세션이 만료되었습니다.');
          return;
        }

        const idToken = await currentUser.getIdToken();
        const res = await fetch(`/api/admin/worker-rrn/${selectedWorkerForDetail.id}`, {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        });

        if (res.status === 404) {
          if (isMounted) {
            setFullRrn(null);
            setRrnError('주민등록번호 미등록');
          }
          return;
        }

        // Requirement 2, 10: Gracefully handle missing environment variables (HTTP 503)
        if (res.status === 503) {
          const errData = await res.json();
          if (isMounted) {
            setIsRrnEnvMissing(true);
            setRrnError(
              errData.error === 'FIREBASE_SERVICE_ACCOUNT_KEY_REQUIRED' ||
                errData.error === 'RRN_ENCRYPTION_KEY_REQUIRED'
                ? '주민등록번호 보안 서버 설정 후 확인 가능합니다.'
                : errData.message || '주민등록번호 보안 서버 설정 후 확인 가능합니다.'
            );
          }
          return;
        }

        if (!res.ok) {
          const errData = await res.json();
          if (isMounted) {
            setRrnError(errData.message || '주민등록번호 복호화 조회에 실패했습니다.');
          }
          return;
        }

        const data = await res.json();
        if (isMounted) {
          setFullRrn(data.rrn);
        }
      } catch (err: any) {
        if (isMounted) {
          setRrnError('서버 통신 중 오류가 발생했습니다.');
        }
      } finally {
        if (isMounted) setRrnLoading(false);
      }
    };

    fetchDecryptedRrn();

    return () => {
      isMounted = false;
    };
  }, [selectedWorkerForDetail]);

  // Requirement 3: Approve worker affiliation
  const handleApproveAffiliation = async (user: UserProfile) => {
    if (!user.requestedCompanyId) return;
    const targetComp = companies.find((c) => c.id === user.requestedCompanyId);

    try {
      setProcessingUid(user.uid);
      const approvedWorker = await firmService.approveWorkerAffiliation(
        user.uid,
        user.requestedCompanyId,
        {
          name: user.displayName,
          email: user.email,
          phone: user.phone,
          department: user.department,
          position: user.position,
          joinDate: user.joinDate || new Date().toISOString().split('T')[0],
        }
      );

      // Audit Log: Requirement 9 (WORKER_AFFILIATION_APPROVED)
      const currentUser = auth.currentUser;
      if (currentUser && approvedWorker) {
        await auditLogService.logAction({
          actorUserId: currentUser.uid,
          actorRole: 'ADMIN',
          actorName: currentUser.displayName || '최고관리자',
          companyId: user.requestedCompanyId,
          action: 'WORKER_AFFILIATION_APPROVED',
          resourceType: 'workers',
          resourceId: approvedWorker.id,
          details: {
            userId: user.uid,
            workerId: approvedWorker.id,
            companyId: user.requestedCompanyId,
            companyName: targetComp?.companyName || user.requestedCompanyName || '',
            workerName: user.displayName,
          },
        });
      }

      await fetchPendingWorkers();
      await fetchWorkers();
    } catch (err) {
      console.error('Failed to approve worker affiliation', err);
    } finally {
      setProcessingUid(null);
    }
  };

  // Requirement 4: Reject worker affiliation
  const handleOpenRejectModal = (user: UserProfile) => {
    setRejectingUser(user);
    setRejectReason('');
    setIsRejectModalOpen(true);
  };

  const handleConfirmReject = async () => {
    if (!rejectingUser) return;
    try {
      setProcessingUid(rejectingUser.uid);
      await firmService.rejectWorkerAffiliation(rejectingUser.uid, rejectReason.trim());

      // Audit Log: Requirement 9 (WORKER_AFFILIATION_REJECTED)
      const currentUser = auth.currentUser;
      if (currentUser) {
        await auditLogService.logAction({
          actorUserId: currentUser.uid,
          actorRole: 'ADMIN',
          actorName: currentUser.displayName || '최고관리자',
          companyId: rejectingUser.requestedCompanyId || undefined,
          action: 'WORKER_AFFILIATION_REJECTED',
          resourceType: 'users',
          resourceId: rejectingUser.uid,
          details: {
            userId: rejectingUser.uid,
            requestedCompanyId: rejectingUser.requestedCompanyId,
            userName: rejectingUser.displayName,
            reason: rejectReason.trim() || '관리자 반려',
          },
        });
      }

      setIsRejectModalOpen(false);
      setRejectingUser(null);
      setRejectReason('');
      await fetchPendingWorkers();
    } catch (err) {
      console.error('Failed to reject worker affiliation', err);
    } finally {
      setProcessingUid(null);
    }
  };

  // Requirement 1, 2, 6, 7, 8: Save Worker Details (including company change & termination)
  const handleSaveWorkerDetail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorkerForDetail) return;

    try {
      setSavingDetail(true);
      setDetailSaveSuccess(null);
      setDetailSaveError(null);

      const currentUser = auth.currentUser;
      const prevWorker = selectedWorkerForDetail;
      const isCompanyChanged = editDetailForm.companyId !== prevWorker.companyId;
      const isTerminated = editDetailForm.status === 'resigned' && prevWorker.status !== 'resigned';
      const targetComp = companies.find((c) => c.id === editDetailForm.companyId);
      const newCompanyName = targetComp?.companyName || '';

      const updatedWorkerData: Partial<Worker> = {
        name: editDetailForm.name.trim(),
        phone: editDetailForm.phone.trim(),
        email: editDetailForm.email.trim(),
        companyId: editDetailForm.companyId,
        department: editDetailForm.department.trim(),
        position: editDetailForm.position.trim(),
        joinDate: editDetailForm.joinDate || undefined,
        status: editDetailForm.status,
      };

      if (editDetailForm.status === 'resigned') {
        updatedWorkerData.resignedDate =
          editDetailForm.resignedDate || new Date().toISOString().split('T')[0];
      } else {
        updatedWorkerData.resignedDate = undefined;
      }

      const updatedUserData: Partial<UserProfile> = {
        displayName: editDetailForm.name.trim(),
        phone: editDetailForm.phone.trim(),
        department: editDetailForm.department.trim(),
        position: editDetailForm.position.trim(),
        workerStatus: editDetailForm.status,
        membershipStatus: editDetailForm.membershipStatus,
      };

      if (isCompanyChanged) {
        updatedUserData.companyId = editDetailForm.companyId;
        updatedUserData.companyName = newCompanyName;
      }

      if (editDetailForm.status === 'resigned') {
        updatedUserData.resignedDate = updatedWorkerData.resignedDate;
      }

      // Save via firmService
      await firmService.updateWorkerFull(
        prevWorker.id,
        updatedWorkerData,
        prevWorker.userId,
        updatedUserData
      );

      // Requirement 9: Audit Logs for respective actions
      if (currentUser) {
        if (isCompanyChanged) {
          // Requirement 7: WORKER_COMPANY_CHANGED
          await auditLogService.logAction({
            actorUserId: currentUser.uid,
            actorRole: 'ADMIN',
            actorName: currentUser.displayName || '최고관리자',
            companyId: editDetailForm.companyId,
            action: 'WORKER_COMPANY_CHANGED',
            resourceType: 'workers',
            resourceId: prevWorker.id,
            details: {
              workerId: prevWorker.id,
              userId: prevWorker.userId,
              previousCompanyId: prevWorker.companyId,
              newCompanyId: editDetailForm.companyId,
              newCompanyName,
              workerName: editDetailForm.name.trim(),
            },
          });
        }

        if (isTerminated) {
          // Requirement 8: WORKER_TERMINATED
          await auditLogService.logAction({
            actorUserId: currentUser.uid,
            actorRole: 'ADMIN',
            actorName: currentUser.displayName || '최고관리자',
            companyId: editDetailForm.companyId,
            action: 'WORKER_TERMINATED',
            resourceType: 'workers',
            resourceId: prevWorker.id,
            details: {
              workerId: prevWorker.id,
              userId: prevWorker.userId,
              companyId: editDetailForm.companyId,
              workerName: editDetailForm.name.trim(),
              resignedDate: updatedWorkerData.resignedDate,
            },
          });
        }

        // General Profile Updated Log
        await auditLogService.logAction({
          actorUserId: currentUser.uid,
          actorRole: 'ADMIN',
          actorName: currentUser.displayName || '최고관리자',
          companyId: editDetailForm.companyId,
          action: 'WORKER_PROFILE_UPDATED',
          resourceType: 'workers',
          resourceId: prevWorker.id,
          details: {
            workerId: prevWorker.id,
            userId: prevWorker.userId,
            name: editDetailForm.name.trim(),
            status: editDetailForm.status,
            department: editDetailForm.department.trim(),
            position: editDetailForm.position.trim(),
          },
        });
      }

      // Update local state
      setSelectedWorkerForDetail({
        ...prevWorker,
        ...updatedWorkerData,
        updatedAt: new Date().toISOString(),
      });

      setIsEditingDetail(false);
      setDetailSaveSuccess('근로자 정보가 성공적으로 수정되었습니다.');
      await fetchWorkers();
      setTimeout(() => setDetailSaveSuccess(null), 3000);
    } catch (err: any) {
      console.error('Failed to update worker detail:', err);
      setDetailSaveError(err.message || '근로자 정보 수정 중 오류가 발생했습니다.');
    } finally {
      setSavingDetail(false);
    }
  };

  // Immediate Status Change from Table (Active / On Leave / Resigned)
  const handleStatusChangeFromTable = async (worker: Worker, newStatus: WorkerStatus) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const resignedDate = newStatus === 'resigned' ? today : undefined;

      await firmService.updateWorkerFull(
        worker.id,
        { status: newStatus, resignedDate },
        worker.userId,
        { workerStatus: newStatus, resignedDate }
      );

      const currentUser = auth.currentUser;
      if (currentUser) {
        if (newStatus === 'resigned') {
          await auditLogService.logAction({
            actorUserId: currentUser.uid,
            actorRole: 'ADMIN',
            actorName: currentUser.displayName || '최고관리자',
            companyId: worker.companyId,
            action: 'WORKER_TERMINATED',
            resourceType: 'workers',
            resourceId: worker.id,
            details: {
              workerId: worker.id,
              userId: worker.userId,
              workerName: worker.name,
              resignedDate: today,
            },
          });
        } else {
          await auditLogService.logAction({
            actorUserId: currentUser.uid,
            actorRole: 'ADMIN',
            actorName: currentUser.displayName || '최고관리자',
            companyId: worker.companyId,
            action: 'WORKER_PROFILE_UPDATED',
            resourceType: 'workers',
            resourceId: worker.id,
            details: {
              workerId: worker.id,
              status: newStatus,
              workerName: worker.name,
            },
          });
        }
      }

      await fetchWorkers();
    } catch (err) {
      console.error('Failed to update worker status', err);
    }
  };

  // Save RRN (Requirement 2: AES-256-GCM server encryption)
  const handleSaveRrnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorkerForDetail || !newRrnInput.trim()) return;

    try {
      setSavingRrn(true);
      setRrnError(null);
      setSaveRrnSuccess(null);
      const currentUser = auth.currentUser;
      if (!currentUser) {
        setRrnError('로그인 세션이 만료되었습니다.');
        return;
      }

      const idToken = await currentUser.getIdToken();
      const res = await fetch(`/api/admin/worker-rrn/${selectedWorkerForDetail.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          rrn: newRrnInput.trim(),
          userId: selectedWorkerForDetail.userId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setRrnError(data.message || '주민등록번호 저장에 실패했습니다.');
        return;
      }

      const clean = newRrnInput.replace(/[^0-9]/g, '');
      setFullRrn(`${clean.substring(0, 6)}-${clean.substring(6)}`);
      setIsEditingRrn(false);
      setNewRrnInput('');
      setSaveRrnSuccess('주민등록번호가 안전하게 암호화되어 저장되었습니다.');
      await fetchWorkers();
      setTimeout(() => setSaveRrnSuccess(null), 3000);
    } catch (err: any) {
      setRrnError(err.message || '저장 중 오류가 발생했습니다.');
    } finally {
      setSavingRrn(false);
    }
  };

  // Manual List Worker Registration
  const handleCreateWorker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorker.companyId || !newWorker.name.trim()) return;

    try {
      setIsSubmitting(true);
      const created = await firmService.createWorker({
        companyId: newWorker.companyId,
        name: newWorker.name.trim(),
        department: newWorker.department.trim(),
        position: newWorker.position.trim(),
        joinDate: newWorker.joinDate,
        phone: newWorker.phone.trim(),
        email: newWorker.email.trim(),
        status: 'active',
      });

      if (newWorker.rrn && newWorker.rrn.trim()) {
        try {
          const currentUser = auth.currentUser;
          if (currentUser) {
            const idToken = await currentUser.getIdToken();
            await fetch(`/api/admin/worker-rrn/${created.id}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${idToken}`,
              },
              body: JSON.stringify({
                rrn: newWorker.rrn.trim(),
              }),
            });
          }
        } catch (rrnErr) {
          console.warn('[AdminWorkersView] RRN save notice:', rrnErr);
        }
      }

      setIsModalOpen(false);
      setNewWorker({
        companyId: companies[0]?.id || '',
        name: '',
        department: '',
        position: '',
        joinDate: '',
        phone: '',
        email: '',
        rrn: '',
      });
      await fetchWorkers();
    } catch (err) {
      console.error('Failed to create worker', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Server API Auth Account Creation
  const handleCreateAccountViaServer = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateAccountError(null);
    setCreateAccountSuccess(null);

    const currentUser = auth.currentUser;
    if (!currentUser) {
      setCreateAccountError('로그인 세션이 만료되었습니다. 다시 로그인해 주세요.');
      return;
    }

    try {
      setIsCreatingAccount(true);
      const idToken = await currentUser.getIdToken();
      const selectedComp = companies.find((c) => c.id === accountForm.companyId);

      const payload: Record<string, any> = {
        role: accountRole,
        email: accountForm.email.trim(),
        displayName: accountForm.displayName.trim(),
        phone: accountForm.phone.trim(),
      };

      if (accountRole === 'WORKER') {
        payload.membershipType = accountForm.membershipType;
        if (accountForm.membershipType === 'COMPANY_AFFILIATED') {
          payload.companyId = accountForm.companyId;
          payload.companyName = selectedComp?.companyName || accountForm.companyName;
        }
        if (accountForm.department.trim()) payload.department = accountForm.department.trim();
        if (accountForm.position.trim()) payload.position = accountForm.position.trim();
        if (accountForm.employeeId.trim()) payload.employeeId = accountForm.employeeId.trim();
        if (accountForm.joinDate) payload.joinDate = accountForm.joinDate;
        if (accountForm.rrn.trim()) payload.rrn = accountForm.rrn.trim();
      } else if (accountRole === 'COMPANY') {
        payload.companyName = accountForm.companyName.trim();
        payload.businessNumber = accountForm.businessNumber.trim();
        if (accountForm.companyId) payload.companyId = accountForm.companyId;
      }

      const response = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        setCreateAccountError(data.message || '회원 계정 생성에 실패했습니다.');
        return;
      }

      setCreateAccountSuccess(
        `${data.user?.displayName || '회원'}님의 계정이 성공적으로 생성되었습니다. (사용자가 본인 비밀번호를 설정할 수 있도록 초기 안내가 처리되었습니다.)`
      );
      await fetchWorkers();
      await fetchPendingWorkers();

      setTimeout(() => {
        setIsCreateAccountModalOpen(false);
        setCreateAccountSuccess(null);
        setAccountForm({
          email: '',
          displayName: '',
          phone: '',
          rrn: '',
          companyId: companies[0]?.id || '',
          companyName: '',
          businessNumber: '',
          department: '',
          position: '',
          employeeId: '',
          joinDate: '',
          membershipType: 'COMPANY_AFFILIATED',
        });
      }, 1600);
    } catch (err: any) {
      console.error('Failed to create account via server API:', err);
      setCreateAccountError(err.message || '서버 통신 중 오류가 발생했습니다.');
    } finally {
      setIsCreatingAccount(false);
    }
  };

  // Filter Workers List
  const filteredWorkers = workers.filter((w) => {
    // Status filter
    if (statusFilter !== 'all' && w.status !== statusFilter) return false;

    // Search query
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;

    const matchName = w.name.toLowerCase().includes(query);
    const matchDept = (w.department || '').toLowerCase().includes(query);
    const matchPos = (w.position || '').toLowerCase().includes(query);
    const matchPhone = (w.phone || '').includes(query);
    const matchEmail = (w.email || '').toLowerCase().includes(query);
    const matchCompany = companies
      .find((c) => c.id === w.companyId)
      ?.companyName.toLowerCase()
      .includes(query);

    return matchName || matchDept || matchPos || matchPhone || matchEmail || matchCompany;
  });

  // Filter Pending Workers List
  const filteredPendingWorkers = pendingWorkers.filter((pw) => {
    if (selectedCompanyId !== 'all' && pw.requestedCompanyId !== selectedCompanyId) return false;

    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;

    const matchName = pw.displayName.toLowerCase().includes(query);
    const matchEmail = pw.email.toLowerCase().includes(query);
    const matchDept = (pw.department || '').toLowerCase().includes(query);
    const matchCompany = companies
      .find((c) => c.id === pw.requestedCompanyId)
      ?.companyName.toLowerCase()
      .includes(query);

    return matchName || matchEmail || matchDept || matchCompany;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              기업·회원 관리
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 border border-slate-200">
              총 {workers.length}명
            </span>
            {pendingWorkers.length > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-200 animate-pulse">
                승인 대기 {pendingWorkers.length}명
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <Users className="h-6 w-6 text-slate-700" />
            근로자 관리
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            고객사 소속 근로자 명부를 조회·수정하고, 소속 승인/반려 및 소속회사 변경, 퇴사 상태를 안전하게 관리합니다.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (companies.length > 0) {
                setAccountForm((prev) => ({ ...prev, companyId: companies[0].id }));
              }
              setCreateAccountError(null);
              setCreateAccountSuccess(null);
              setIsCreateAccountModalOpen(true);
            }}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs sm:text-sm font-medium text-slate-700 shadow-xs hover:bg-slate-50 transition"
            title="관리자 전용 회원 계정 발급"
          >
            <UserPlus className="h-4 w-4 text-slate-500" />
            회원 계정 추가 (서버 API)
          </button>
          <button
            onClick={() => {
              if (companies.length > 0) {
                setNewWorker((prev) => ({ ...prev, companyId: companies[0].id }));
              }
              setIsModalOpen(true);
            }}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs sm:text-sm font-medium text-white shadow-sm hover:bg-slate-800 transition"
          >
            <Plus className="h-4 w-4" />
            신규 근로자 명부 등록
          </button>
        </div>
      </div>

      {/* Tabs: 전체 근로자 vs 소속 승인 대기 (Requirement 1) */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-1">
        <button
          onClick={() => setViewTab('all')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition ${
            viewTab === 'all'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Users className="h-3.5 w-3.5" />
          <span>전체 근로자 명부</span>
          <span
            className={`rounded-full px-2 py-0.2 text-[10px] ${
              viewTab === 'all' ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {workers.length}
          </span>
        </button>

        <button
          onClick={() => setViewTab('pending')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition ${
            viewTab === 'pending'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'text-amber-800 hover:bg-amber-50 hover:text-amber-900'
          }`}
        >
          <Clock className="h-3.5 w-3.5" />
          <span>소속 승인 대기</span>
          <span
            className={`rounded-full px-2 py-0.2 text-[10px] font-bold ${
              viewTab === 'pending'
                ? 'bg-amber-700 text-white'
                : 'bg-amber-100 text-amber-900'
            }`}
          >
            {pendingWorkers.length}
          </span>
        </button>
      </div>

      {/* Filters Bar: Company, Status, Search (Requirement 1) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Company Filter */}
          <div className="flex items-center gap-1.5">
            <Building2 className="h-4 w-4 text-slate-400" />
            <span className="text-xs font-bold text-slate-700">기업:</span>
            <select
              value={selectedCompanyId}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-900 focus:border-slate-800 focus:outline-none"
            >
              <option value="all">전체 기업 보기 ({companies.length}개사)</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.companyName}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter (Only in 'all' tab) */}
          {viewTab === 'all' && (
            <div className="flex items-center gap-1.5 ml-1">
              <span className="text-xs font-bold text-slate-700">재직상태:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | WorkerStatus)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-900 focus:border-slate-800 focus:outline-none"
              >
                <option value="all">전체 상태</option>
                <option value="active">재직</option>
                <option value="on_leave">휴직</option>
                <option value="resigned">퇴사</option>
              </select>
            </div>
          )}
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="이름, 기업명, 부서, 직책, 연락처"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-1.5 text-xs focus:border-slate-800 focus:outline-none"
          />
        </div>
      </div>

      {/* VIEW TAB: Pending Approvals Table (Requirement 3, 4) */}
      {viewTab === 'pending' && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse" />
              <h3 className="text-sm font-bold text-amber-950">
                소속 승인 대기자 목록 ({filteredPendingWorkers.length}명)
              </h3>
            </div>
            <span className="text-[11px] text-amber-800 font-medium">
              승인 시 해당 기업 식별자(ID)가 확정되고 내부 업무 열람 권한이 부여됩니다.
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-amber-200 bg-white">
            {filteredPendingWorkers.length === 0 ? (
              <div className="p-8 text-center text-xs text-amber-800">
                현재 승인 대기 중인 근로자가 없습니다.
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-amber-100/60 border-b border-amber-200 text-[11px] font-semibold text-amber-950">
                  <tr>
                    <th className="px-4 py-2.5">신청자 성명</th>
                    <th className="px-4 py-2.5">계정 이메일 / 연락처</th>
                    <th className="px-4 py-2.5">신청 소속 기업</th>
                    <th className="px-4 py-2.5">신청 부서 / 직책</th>
                    <th className="px-4 py-2.5">신청일시</th>
                    <th className="px-4 py-2.5 text-center">승인 및 반려 관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-100">
                  {filteredPendingWorkers.map((pw) => {
                    const comp = companies.find((c) => c.id === pw.requestedCompanyId);
                    const isProcessing = processingUid === pw.uid;

                    return (
                      <tr key={pw.uid} className="hover:bg-amber-50/50 transition">
                        <td className="px-4 py-3 font-bold text-slate-900">{pw.displayName}</td>
                        <td className="px-4 py-3 text-slate-600">
                          <div>{pw.email}</div>
                          {pw.phone && <div className="text-[11px] text-slate-400">{pw.phone}</div>}
                        </td>
                        <td className="px-4 py-3 font-semibold text-emerald-800">
                          {comp?.companyName || pw.requestedCompanyName || pw.requestedCompanyId || '-'}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {pw.department || '-'} / {pw.position || '-'}
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-slate-500">
                          {pw.createdAt?.split('T')[0] || '-'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleApproveAffiliation(pw)}
                              disabled={isProcessing}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1 text-[11px] font-bold text-white shadow-xs hover:bg-emerald-700 transition disabled:opacity-50"
                            >
                              <UserCheck className="h-3 w-3" />
                              <span>{isProcessing ? '처리 중...' : '소속 승인'}</span>
                            </button>
                            <button
                              onClick={() => handleOpenRejectModal(pw)}
                              disabled={isProcessing}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-50 hover:border-rose-200 transition disabled:opacity-50"
                            >
                              <UserX className="h-3 w-3" />
                              <span>반려</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* VIEW TAB: Workers List Table (Requirement 1, 2) */}
      {viewTab === 'all' && (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
          {loading ? (
            <div className="p-8 text-center text-xs text-slate-500">근로자 명부 로딩 중...</div>
          ) : filteredWorkers.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <Users className="mx-auto h-8 w-8 text-slate-300" />
              <p className="text-xs font-semibold text-slate-700">해당 조건의 근로자가 없습니다.</p>
              <p className="text-[11px] text-slate-400">
                필터 조건을 변경하거나 상단의 [신규 근로자 등록] 버튼으로 추가하세요.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-semibold text-slate-500">
                  <tr>
                    <th className="px-4 py-3">소속 기업</th>
                    <th className="px-4 py-3">근로자 성명</th>
                    <th className="px-4 py-3">부서 / 직책</th>
                    <th className="px-4 py-3">연락처 / 이메일</th>
                    <th className="px-4 py-3">주민등록번호</th>
                    <th className="px-4 py-3">입사일자</th>
                    <th className="px-4 py-3 text-center">재직상태</th>
                    <th className="px-4 py-3 text-center">상세 / 관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredWorkers.map((w) => {
                    const comp = companies.find((c) => c.id === w.companyId);

                    return (
                      <tr key={w.id} className="hover:bg-slate-50/70 transition">
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          {comp?.companyName || w.companyId}
                        </td>
                        <td className="px-4 py-3 font-bold text-slate-900">
                          <button
                            onClick={() => setSelectedWorkerForDetail(w)}
                            className="hover:underline text-left text-slate-900"
                          >
                            {w.name}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {w.department || '-'} / {w.position || '-'}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {w.phone || w.email || '-'}
                        </td>
                        {/* Requirement 1: Only maskedRrn in list, NEVER full plain RRN */}
                        <td className="px-4 py-3 font-mono text-[11px] text-slate-600">
                          {w.maskedRrn || '미등록'}
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-500">{w.joinDate || '-'}</td>
                        <td className="px-4 py-3 text-center">
                          <select
                            value={w.status}
                            onChange={(e) =>
                              handleStatusChangeFromTable(w, e.target.value as WorkerStatus)
                            }
                            className={`rounded-lg border px-2 py-0.5 text-[11px] font-semibold focus:outline-none ${
                              w.status === 'active'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : w.status === 'on_leave'
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                          >
                            <option value="active">재직</option>
                            <option value="on_leave">휴직</option>
                            <option value="resigned">퇴사</option>
                          </select>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => setSelectedWorkerForDetail(w)}
                            className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-200 transition"
                            title="근로자 상세조회 및 정보 수정"
                          >
                            <Eye className="h-3.5 w-3.5 text-slate-600" />
                            <span>상세</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Reject Modal (Requirement 4) */}
      {isRejectModalOpen && rejectingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <UserX className="h-4 w-4 text-rose-600" />
                소속 승인 반려
              </h3>
              <button
                onClick={() => setIsRejectModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="text-xs text-slate-600 space-y-1">
              <p>
                <strong>{rejectingUser.displayName}</strong> ({rejectingUser.email}) 님의 소속 신청을
                반려합니다.
              </p>
              <p className="text-rose-600 text-[11px]">
                ※ 반려 시 기업 식별자(companyId)가 부여되지 않으며, 해당 기업의 모든 데이터 접근이
                원천 차단됩니다.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                반려 사유 (선택)
              </label>
              <textarea
                rows={3}
                placeholder="예: 사원 명부 불일치, 입사 예정일 미도래 등"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsRejectModalOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirmReject}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 transition"
              >
                반려 처리
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Worker Detail, Edit, Full RRN (Requirements 1, 2, 6, 7, 8) */}
      {selectedWorkerForDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-xl space-y-5 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-800 font-bold text-sm">
                  {selectedWorkerForDetail.name.slice(0, 1)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">
                      {selectedWorkerForDetail.name} 근로자 상세 정보
                    </h3>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        selectedWorkerForDetail.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : selectedWorkerForDetail.status === 'on_leave'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}
                    >
                      {selectedWorkerForDetail.status === 'active'
                        ? '재직'
                        : selectedWorkerForDetail.status === 'on_leave'
                        ? '휴직'
                        : '퇴사'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono">
                    근로자 식별자(ID): {selectedWorkerForDetail.id} • 소속사 ID:{' '}
                    {selectedWorkerForDetail.companyId}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {!isEditingDetail && workerDetailTab === 'info' && (
                  <button
                    type="button"
                    onClick={() => setIsEditingDetail(true)}
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    <span>정보 수정</span>
                  </button>
                )}
                <button
                  onClick={() => setSelectedWorkerForDetail(null)}
                  className="text-slate-400 hover:text-slate-600 rounded-lg p-1 transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Tabs: [기본 인사 정보] & [내부 메모] */}
            <div className="flex items-center gap-1 border-b border-slate-200">
              <button
                type="button"
                onClick={() => setWorkerDetailTab('info')}
                className={`pb-2.5 px-3.5 text-xs font-bold border-b-2 transition flex items-center gap-1.5 ${
                  workerDetailTab === 'info'
                    ? 'border-slate-900 text-slate-900'
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                <User className="h-4 w-4" />
                <span>기본 인사 정보</span>
              </button>
              <button
                type="button"
                onClick={() => setWorkerDetailTab('notes')}
                className={`pb-2.5 px-3.5 text-xs font-bold border-b-2 transition flex items-center gap-1.5 ${
                  workerDetailTab === 'notes'
                    ? 'border-slate-900 text-slate-900'
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                <StickyNote className="h-4 w-4" />
                <span>내부 메모</span>
              </button>
              <button
                type="button"
                onClick={() => setWorkerDetailTab('tasks')}
                className={`pb-2.5 px-3.5 text-xs font-bold border-b-2 transition flex items-center gap-1.5 ${
                  workerDetailTab === 'tasks'
                    ? 'border-slate-900 text-slate-900'
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                <CheckSquare className="h-4 w-4" />
                <span>할 일</span>
              </button>
            </div>

            {workerDetailTab === 'info' && (
              <div className="space-y-4">
                {/* Success / Error alerts */}
            {detailSaveSuccess && (
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-2.5 text-xs text-emerald-800 flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>{detailSaveSuccess}</span>
              </div>
            )}
            {detailSaveError && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 p-2.5 text-xs text-rose-800 flex items-center gap-2 font-medium">
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                <span>{detailSaveError}</span>
              </div>
            )}

            {/* RRN Secure Management Box (Requirement 2, 10) */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  <span className="text-xs font-bold text-slate-900">
                    주민등록번호 안전 관리 (ADMIN 실무 복호화)
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                    <Lock className="h-3 w-3" />
                    AES-256-GCM
                  </span>
                  {!isEditingRrn && !isRrnEnvMissing && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditingRrn(true);
                        setNewRrnInput(fullRrn ? fullRrn.replace('-', '') : '');
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 transition shadow-2xs"
                    >
                      <Edit3 className="h-3 w-3" />
                      <span>{fullRrn ? '수정' : '등록'}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* RRN Display or Missing-Secret Banner */}
              {rrnLoading ? (
                <div className="flex items-center gap-2 py-3 px-4 rounded-xl bg-white border border-slate-200">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-900 border-t-transparent" />
                  <span className="text-xs text-slate-600 font-medium">
                    서버에서 암호화된 주민등록번호를 안전하게 복호화하여 조회 중입니다...
                  </span>
                </div>
              ) : isRrnEnvMissing ? (
                /* Requirement 2, 10: Friendly notice without crashing the view */
                <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-100 border border-slate-300">
                  <div className="flex items-center gap-2.5">
                    <Lock className="h-4 w-4 text-slate-500 shrink-0" />
                    <div>
                      <span className="block text-xs font-bold text-slate-800">
                        주민등록번호 보안 서버 설정 후 확인 가능합니다.
                      </span>
                      <span className="text-[11px] text-slate-500">
                        목록 노출 마스킹: {selectedWorkerForDetail.maskedRrn || '미등록'}
                      </span>
                    </div>
                  </div>
                </div>
              ) : isEditingRrn ? (
                <form
                  onSubmit={handleSaveRrnSubmit}
                  className="space-y-3 bg-white p-3.5 rounded-xl border border-slate-200"
                >
                  <div className="text-[11px] text-slate-600 font-medium leading-relaxed">
                    입력하신 주민등록번호는 즉시 서버에서 <strong>AES-256-GCM</strong>으로 암호화되어
                    격리 보관(<code>worker_sensitive_data</code>)되며, 프로필에는 마스킹(예:{' '}
                    <code>900101-1******</code>)만 저장됩니다.
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      required
                      autoFocus
                      placeholder="숫자 13자리 입력 (예: 9001011234567)"
                      value={newRrnInput}
                      onChange={(e) =>
                        setNewRrnInput(e.target.value.replace(/[^0-9]/g, ''))
                      }
                      maxLength={14}
                      className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono focus:border-slate-900 focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={savingRrn || newRrnInput.replace(/[^0-9]/g, '').length !== 13}
                      className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                    >
                      <Save className="h-3.5 w-3.5" />
                      <span>{savingRrn ? '저장 중...' : '저장'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={savingRrn}
                      onClick={() => {
                        setIsEditingRrn(false);
                        setNewRrnInput('');
                      }}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                    >
                      취소
                    </button>
                  </div>
                </form>
              ) : fullRrn ? (
                <div className="flex items-center justify-between p-3.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
                  <div>
                    <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">
                      전체 주민등록번호 (ADMIN 실무 확인용)
                    </span>
                    <span className="font-mono text-base font-bold text-slate-900 tracking-wider">
                      {fullRrn}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="inline-block text-[11px] font-mono text-slate-500 bg-slate-100 rounded-md px-2 py-0.5">
                      목록 노출 마스킹:{' '}
                      {selectedWorkerForDetail.maskedRrn ||
                        `${fullRrn.substring(0, 6)}-${fullRrn.substring(7, 8)}******`}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between p-3 rounded-xl bg-white border border-dashed border-slate-300">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <AlertCircle className="h-4 w-4 text-slate-400" />
                    <span>
                      등록된 주민등록번호가 없습니다. (마스킹:{' '}
                      {selectedWorkerForDetail.maskedRrn || '미등록'})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingRrn(true);
                      setNewRrnInput('');
                    }}
                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition"
                  >
                    주민등록번호 등록
                  </button>
                </div>
              )}

              {saveRrnSuccess && (
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-2.5 text-xs text-emerald-800 flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>{saveRrnSuccess}</span>
                </div>
              )}

              {rrnError && !isEditingRrn && !isRrnEnvMissing && rrnError !== '주민등록번호 미등록' && (
                <div className="rounded-xl bg-rose-50 border border-rose-200 p-2.5 text-xs text-rose-800 flex items-center gap-2 font-medium">
                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                  <span>{rrnError}</span>
                </div>
              )}
            </div>

            {/* Editable or Static Worker Information (Requirement 1, 2, 6, 7, 8) */}
            {isEditingDetail ? (
              <form onSubmit={handleSaveWorkerDetail} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      근로자 성명 <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={editDetailForm.name}
                      onChange={(e) =>
                        setEditDetailForm({ ...editDetailForm, name: e.target.value })
                      }
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                    />
                  </div>

                  {/* Requirement 6, 7: ID-based Company Affiliation Selection */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                      <ArrowRightLeft className="h-3 w-3 text-indigo-600" />
                      <span>소속 기업 (ID 기준 변경)</span> <span className="text-rose-500">*</span>
                    </label>
                    <select
                      required
                      value={editDetailForm.companyId}
                      onChange={(e) =>
                        setEditDetailForm({ ...editDetailForm, companyId: e.target.value })
                      }
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none bg-white font-medium"
                    >
                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.companyName} ({c.id})
                        </option>
                      ))}
                    </select>
                    {editDetailForm.companyId !== selectedWorkerForDetail.companyId && (
                      <p className="text-[10px] text-amber-700 mt-1">
                        ※ 소속기업 변경 시 현재 소속정보만 안전하게 업데이트되며, 과거 급여/문서 기록은 보존됩니다.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">연락처</label>
                    <input
                      type="text"
                      placeholder="010-0000-0000"
                      value={editDetailForm.phone}
                      onChange={(e) =>
                        setEditDetailForm({ ...editDetailForm, phone: e.target.value })
                      }
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">이메일</label>
                    <input
                      type="email"
                      placeholder="worker@company.com"
                      value={editDetailForm.email}
                      onChange={(e) =>
                        setEditDetailForm({ ...editDetailForm, email: e.target.value })
                      }
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">부서</label>
                    <input
                      type="text"
                      placeholder="경영지원팀"
                      value={editDetailForm.department}
                      onChange={(e) =>
                        setEditDetailForm({ ...editDetailForm, department: e.target.value })
                      }
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">직책 / 직급</label>
                    <input
                      type="text"
                      placeholder="대리 / 선임"
                      value={editDetailForm.position}
                      onChange={(e) =>
                        setEditDetailForm({ ...editDetailForm, position: e.target.value })
                      }
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">입사일자</label>
                    <input
                      type="date"
                      value={editDetailForm.joinDate}
                      onChange={(e) =>
                        setEditDetailForm({ ...editDetailForm, joinDate: e.target.value })
                      }
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                    />
                  </div>

                  {/* Requirement 8: Resigned Status & Resigned Date */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      재직 상태 <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={editDetailForm.status}
                      onChange={(e) => {
                        const st = e.target.value as WorkerStatus;
                        setEditDetailForm({
                          ...editDetailForm,
                          status: st,
                          resignedDate:
                            st === 'resigned' && !editDetailForm.resignedDate
                              ? new Date().toISOString().split('T')[0]
                              : editDetailForm.resignedDate,
                        });
                      }}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none bg-white font-medium"
                    >
                      <option value="active">재직 (active)</option>
                      <option value="on_leave">휴직 (on_leave)</option>
                      <option value="resigned">퇴사 (resigned)</option>
                    </select>
                  </div>

                  {editDetailForm.status === 'resigned' && (
                    <div className="sm:col-span-2 rounded-xl bg-slate-50 p-3 border border-slate-200 space-y-2">
                      <label className="block text-xs font-semibold text-slate-800">
                        퇴사일자 <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="date"
                        required
                        value={editDetailForm.resignedDate}
                        onChange={(e) =>
                          setEditDetailForm({ ...editDetailForm, resignedDate: e.target.value })
                        }
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none bg-white"
                      />
                      <p className="text-[11px] text-slate-500">
                        ※ 퇴사 처리 시 계정과 과거 기록(급여, 근태, 문서)은 영구 삭제되지 않으며 안전하게 보존됩니다.
                      </p>
                    </div>
                  )}

                  {/* Requirement 2: Membership Status */}
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      회원 상태 (소속 인증 상태)
                    </label>
                    <select
                      value={editDetailForm.membershipStatus}
                      onChange={(e) =>
                        setEditDetailForm({
                          ...editDetailForm,
                          membershipStatus: e.target.value as MembershipStatus,
                        })
                      }
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none bg-white"
                    >
                      <option value="ACTIVE">소속 승인 완료 (ACTIVE)</option>
                      <option value="PENDING_COMPANY_VERIFICATION">
                        소속 승인 대기 (PENDING_COMPANY_VERIFICATION)
                      </option>
                      <option value="REJECTED">소속 승인 반려 (REJECTED)</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    disabled={savingDetail}
                    onClick={() => setIsEditingDetail(false)}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    disabled={savingDetail}
                    className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Save className="h-4 w-4" />
                    <span>{savingDetail ? '저장 중...' : '변경사항 저장'}</span>
                  </button>
                </div>
              </form>
            ) : (
              /* Static View */
              <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-slate-600" />
                  인사 및 소속 정보
                </h4>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-100">
                    <span className="block text-[10px] text-slate-400 font-semibold mb-0.5">
                      소속 기업 (ID 기준)
                    </span>
                    <span className="font-bold text-slate-800">
                      {companies.find((c) => c.id === selectedWorkerForDetail.companyId)?.companyName ||
                        selectedWorkerForDetail.companyId}
                    </span>
                    <span className="block font-mono text-[10px] text-slate-400 mt-0.5">
                      ID: {selectedWorkerForDetail.companyId}
                    </span>
                  </div>

                  <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-100">
                    <span className="block text-[10px] text-slate-400 font-semibold mb-0.5">
                      입사일자 / 퇴사일자
                    </span>
                    <span className="font-medium text-slate-800 font-mono">
                      입사: {selectedWorkerForDetail.joinDate || '미등록'}
                    </span>
                    {selectedWorkerForDetail.status === 'resigned' && (
                      <span className="block text-rose-600 font-mono text-[11px] font-semibold mt-0.5">
                        퇴사일: {selectedWorkerForDetail.resignedDate || '-'}
                      </span>
                    )}
                  </div>

                  <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-100">
                    <span className="block text-[10px] text-slate-400 font-semibold mb-0.5">
                      부서 / 직책
                    </span>
                    <span className="font-medium text-slate-800">
                      {selectedWorkerForDetail.department || '-'} /{' '}
                      {selectedWorkerForDetail.position || '-'}
                    </span>
                  </div>

                  <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-100">
                    <span className="block text-[10px] text-slate-400 font-semibold mb-0.5">
                      연락처
                    </span>
                    <span className="font-medium text-slate-800 font-mono">
                      {selectedWorkerForDetail.phone || '미등록'}
                    </span>
                  </div>

                  <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-100">
                    <span className="block text-[10px] text-slate-400 font-semibold mb-0.5">
                      이메일
                    </span>
                    <span className="font-medium text-slate-800 font-mono">
                      {selectedWorkerForDetail.email || '미등록'}
                    </span>
                  </div>

                  <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-100">
                    <span className="block text-[10px] text-slate-400 font-semibold mb-0.5">
                      인증 계정(UID) 연동
                    </span>
                    <span className="font-mono text-[11px] text-slate-600 truncate block">
                      {selectedWorkerForDetail.userId
                        ? `연동됨 (${selectedWorkerForDetail.userId.slice(0, 10)}...)`
                        : '미연동 (명부 등록 상태)'}
                    </span>
                  </div>
                </div>
              </div>
            )}
              </div>
            )}

            {workerDetailTab === 'notes' && (
              <InternalNotesSection
                targetType="WORKER"
                targetId={selectedWorkerForDetail.id}
                companyId={selectedWorkerForDetail.companyId}
                targetName={`${selectedWorkerForDetail.name} (${
                  companies.find((c) => c.id === selectedWorkerForDetail.companyId)?.companyName ||
                  selectedWorkerForDetail.companyId
                })`}
              />
            )}

            {workerDetailTab === 'tasks' && (
              <EntityTasksSection
                entityType="WORKER"
                companyId={selectedWorkerForDetail.companyId}
                workerId={selectedWorkerForDetail.id}
                entityName={`${selectedWorkerForDetail.name} (${
                  companies.find((c) => c.id === selectedWorkerForDetail.companyId)?.companyName ||
                  selectedWorkerForDetail.companyId
                })`}
                onNavigateToSource={(st, sid, cid, wid) => {
                  setSelectedWorkerForDetail(null);
                  if (onNavigateToSource) onNavigateToSource(st, sid, cid, wid);
                }}
              />
            )}

            {/* Footer */}
            <div className="flex items-center justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSelectedWorkerForDetail(null)}
                className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Worker Registration Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Users className="h-4 w-4 text-slate-700" />
                신규 근로자 명부 등록
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateWorker} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  소속 기업 <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={newWorker.companyId}
                  onChange={(e) => setNewWorker({ ...newWorker, companyId: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none bg-white"
                >
                  <option value="">기업 선택</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.companyName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  근로자 성명 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="예: 홍길동"
                  value={newWorker.name}
                  onChange={(e) => setNewWorker({ ...newWorker, name: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">부서</label>
                  <input
                    type="text"
                    placeholder="경영지원팀"
                    value={newWorker.department}
                    onChange={(e) => setNewWorker({ ...newWorker, department: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">직급</label>
                  <input
                    type="text"
                    placeholder="선임 / 대리"
                    value={newWorker.position}
                    onChange={(e) => setNewWorker({ ...newWorker, position: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">입사일자</label>
                <input
                  type="date"
                  value={newWorker.joinDate}
                  onChange={(e) => setNewWorker({ ...newWorker, joinDate: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">연락처</label>
                  <input
                    type="text"
                    placeholder="010-0000-0000"
                    value={newWorker.phone}
                    onChange={(e) => setNewWorker({ ...newWorker, phone: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">이메일</label>
                  <input
                    type="email"
                    placeholder="worker@company.com"
                    value={newWorker.email}
                    onChange={(e) => setNewWorker({ ...newWorker, email: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  주민등록번호 (선택 - AES-256-GCM 암호화)
                </label>
                <input
                  type="text"
                  placeholder="숫자 13자리 (예: 9001011234567)"
                  value={newWorker.rrn}
                  onChange={(e) =>
                    setNewWorker({
                      ...newWorker,
                      rrn: e.target.value.replace(/[^0-9]/g, ''),
                    })
                  }
                  maxLength={14}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none font-mono"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  ※ 일반 근로자 명부 문서에는 마스킹(900101-1******)만 저장되며, 원본은 AES-256-GCM으로 별도 암호화 보관됩니다.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition disabled:opacity-50"
                >
                  {isSubmitting ? '등록 중...' : '근로자 등록'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Real Server API User Account Creation Modal */}
      {isCreateAccountModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-slate-800" />
                <h3 className="text-sm font-bold text-slate-900">
                  관리자 전용 회원 계정 생성 (서버 API)
                </h3>
              </div>
              <button
                onClick={() => {
                  if (!isCreatingAccount) {
                    setIsCreateAccountModalOpen(false);
                    setCreateAccountError(null);
                    setCreateAccountSuccess(null);
                  }
                }}
                disabled={isCreatingAccount}
                className="text-slate-400 hover:text-slate-600 disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-[11px] text-blue-800 leading-relaxed flex items-start gap-2">
              <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <strong>안전한 서버 인증 연동:</strong> Firebase Admin SDK 기반 서버 API(<code>POST /api/admin/create-user</code>)를 통해 Auth 계정과 Firestore 프로필을 생성합니다.
              </div>
            </div>

            {createAccountError && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 flex items-center gap-2 font-medium">
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                <span>{createAccountError}</span>
              </div>
            )}

            {createAccountSuccess && (
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>{createAccountSuccess}</span>
              </div>
            )}

            <form onSubmit={handleCreateAccountViaServer} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  생성할 회원 유형 <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100 border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setAccountRole('WORKER')}
                    className={`py-2 text-xs font-bold rounded-lg transition ${
                      accountRole === 'WORKER'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    근로자 (WORKER)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccountRole('COMPANY')}
                    className={`py-2 text-xs font-bold rounded-lg transition ${
                      accountRole === 'COMPANY'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    기업 대표 / 관리자 (COMPANY)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  로그인 이메일 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="user@example.com"
                  value={accountForm.email}
                  onChange={(e) => setAccountForm({ ...accountForm, email: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {accountRole === 'COMPANY' ? '대표자 / 담당자명' : '성명'}{' '}
                    <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="홍길동"
                    value={accountForm.displayName}
                    onChange={(e) =>
                      setAccountForm({ ...accountForm, displayName: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">연락처</label>
                  <input
                    type="text"
                    placeholder="010-0000-0000"
                    value={accountForm.phone}
                    onChange={(e) => setAccountForm({ ...accountForm, phone: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                  />
                </div>
              </div>

              {accountRole === 'WORKER' && (
                <div className="space-y-3.5 pt-2 border-t border-slate-100">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        소속 구분 <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={accountForm.membershipType}
                        onChange={(e) =>
                          setAccountForm({
                            ...accountForm,
                            membershipType: e.target.value as 'COMPANY_AFFILIATED' | 'INDIVIDUAL',
                          })
                        }
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none bg-white"
                      >
                        <option value="COMPANY_AFFILIATED">고객사 소속 근로자</option>
                        <option value="INDIVIDUAL">개인 (비소속) 근로자</option>
                      </select>
                    </div>

                    {accountForm.membershipType === 'COMPANY_AFFILIATED' && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          소속 고객사 <span className="text-rose-500">*</span>
                        </label>
                        <select
                          required
                          value={accountForm.companyId}
                          onChange={(e) =>
                            setAccountForm({ ...accountForm, companyId: e.target.value })
                          }
                          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none bg-white"
                        >
                          <option value="">기업 선택</option>
                          {companies.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.companyName}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">부서</label>
                      <input
                        type="text"
                        placeholder="인사팀"
                        value={accountForm.department}
                        onChange={(e) =>
                          setAccountForm({ ...accountForm, department: e.target.value })
                        }
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">직급/직책</label>
                      <input
                        type="text"
                        placeholder="대리"
                        value={accountForm.position}
                        onChange={(e) =>
                          setAccountForm({ ...accountForm, position: e.target.value })
                        }
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">사번 (선택)</label>
                      <input
                        type="text"
                        placeholder="EMP-001"
                        value={accountForm.employeeId}
                        onChange={(e) =>
                          setAccountForm({ ...accountForm, employeeId: e.target.value })
                        }
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">입사일자</label>
                    <input
                      type="date"
                      value={accountForm.joinDate}
                      onChange={(e) =>
                        setAccountForm({ ...accountForm, joinDate: e.target.value })
                      }
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      주민등록번호 (선택 - AES-256-GCM 암호화)
                    </label>
                    <input
                      type="text"
                      placeholder="숫자 13자리 (예: 9001011234567)"
                      value={accountForm.rrn}
                      onChange={(e) =>
                        setAccountForm({
                          ...accountForm,
                          rrn: e.target.value.replace(/[^0-9]/g, ''),
                        })
                      }
                      maxLength={14}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none font-mono"
                    />
                  </div>
                </div>
              )}

              {accountRole === 'COMPANY' && (
                <div className="space-y-3.5 pt-2 border-t border-slate-100">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      회사명 <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="주식회사 예시"
                      value={accountForm.companyName}
                      onChange={(e) =>
                        setAccountForm({ ...accountForm, companyName: e.target.value })
                      }
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      사업자등록번호 <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="000-00-00000"
                      value={accountForm.businessNumber}
                      onChange={(e) =>
                        setAccountForm({ ...accountForm, businessNumber: e.target.value })
                      }
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isCreatingAccount}
                  onClick={() => setIsCreateAccountModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition disabled:opacity-50"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isCreatingAccount}
                  className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isCreatingAccount ? (
                    <>
                      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      <span>계정 생성 중...</span>
                    </>
                  ) : (
                    <span>회원 계정 발급 (서버 실행)</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
