import React from 'react';
import { UserRole } from '../../types';

interface RoleBadgeProps {
  role: UserRole;
  size?: 'sm' | 'md';
}

export const RoleBadge: React.FC<RoleBadgeProps> = ({ role, size = 'md' }) => {
  const roleConfig: Record<UserRole, { label: string; bg: string; text: string; border: string }> = {
    ADMIN: {
      label: '최고관리자',
      bg: 'bg-slate-900',
      text: 'text-white',
      border: 'border-slate-800',
    },
    COMPANY: {
      label: '기업 회원',
      bg: 'bg-blue-50',
      text: 'text-blue-700',
      border: 'border-blue-200',
    },
    WORKER: {
      label: '근로자',
      bg: 'bg-emerald-50',
      text: 'text-emerald-700',
      border: 'border-emerald-200',
    },
  };

  const current = (roleConfig as any)[role] || {
    label: role,
    bg: 'bg-gray-100',
    text: 'text-gray-700',
    border: 'border-gray-200',
  };

  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs font-medium';

  return (
    <span
      className={`inline-flex items-center rounded-md border font-medium ${current.bg} ${current.text} ${current.border} ${sizeClasses}`}
    >
      {current.label}
    </span>
  );
};
