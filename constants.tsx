import React from 'react';
import { Clock, Zap, MapPin } from 'lucide-react';

export const SEVERITY_MAP = {
  critical: { color: 'text-red-500', indicator: 'bg-red-500', border: 'border-red-500', label: 'URGENT' },
  high: { color: 'text-amber-400', indicator: 'bg-amber-500', border: 'border-amber-500', label: 'HIGH RISK' },
  medium: { color: 'text-emerald-400', indicator: 'bg-emerald-500', border: 'border-emerald-500', label: 'MODERATE' },
  low: { color: 'text-blue-400', indicator: 'bg-blue-500', border: 'border-blue-500', label: 'MONITORING' },
};

export const getSeverityStyles = (severity: string) => 
  SEVERITY_MAP[severity as keyof typeof SEVERITY_MAP] || SEVERITY_MAP.low;

export const formatTimeAgo = (dateStr: string) => {
  const date = new Date(dateStr).getTime();
  const seconds = Math.floor((Date.now() - date) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return '1d ago'; // Fallback for demo
};
