import React, { useEffect, useState } from 'react';
import { AuditLog } from '../../../types';
import { auditLogService } from '../../../services/auditLogService';
import { Activity, ShieldCheck, Search, Clock, User, Building2 } from 'lucide-react';

export const AuditLogView: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const list = await auditLogService.getAuditLogs(100);
      setLogs(list);
    } catch (err) {
      console.error('Failed to fetch audit logs', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filtered = logs.filter(
    (l) =>
      l.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.actorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.resourceType.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (l.companyId && l.companyId.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              시스템 관리
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 border border-slate-200">
              총 {logs.length}건 기록
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <Activity className="h-6 w-6 text-slate-700" />
            활동기록 (Audit Log)
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            관리자 및 공인노무사의 주요 데이터 접근, 급여 확정, 정책 변경 등 핵심 감사 추적 기록입니다.
            (위변조 방지 불변 저장)
          </p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex justify-between items-center">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="수행 작업, 작업자 또는 리소스 검색"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-1.5 text-xs focus:border-slate-800 focus:outline-none"
          />
        </div>
      </div>

      {/* Log Table */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">활동기록 로딩 중...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Activity className="mx-auto h-8 w-8 text-slate-300" />
            <p className="text-xs font-semibold text-slate-700">기록된 활동 로그가 없습니다.</p>
            <p className="text-[11px] text-slate-400">
              급여 확정, 자료 승인 등 주요 작업 수행 시 자동으로 기록됩니다.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-semibold text-slate-500">
                <tr>
                  <th className="px-4 py-3">발생 일시</th>
                  <th className="px-4 py-3">작업자</th>
                  <th className="px-4 py-3">역할</th>
                  <th className="px-4 py-3">수행 작업</th>
                  <th className="px-4 py-3">리소스 유형</th>
                  <th className="px-4 py-3">기업 ID</th>
                  <th className="px-4 py-3">상세 내용</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70 transition">
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-500">
                      {new Date(log.timestamp).toLocaleString('ko-KR')}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{log.actorName}</td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-700">
                        {log.actorRole}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-blue-700">{log.action}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-600">
                      {log.resourceType}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-400">
                      {log.companyId || '-'}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-slate-500 font-mono">
                      {log.details ? JSON.stringify(log.details) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
