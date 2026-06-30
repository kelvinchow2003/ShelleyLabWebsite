import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, RotateCcw, Download } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { RowsSkeleton } from '../components/Skeleton';
import { formatDate } from '../lib/utils';
import { exportCsv, dateStamp } from '../lib/csv';
import type { AdminLog, UserProfile } from '../lib/database.types';

const PAGE_SIZE = 25;

function actionColor(action: string): string {
  switch (action) {
    case 'created':
      return 'bg-green-100 text-green-800';
    case 'updated':
      return 'bg-blue-100 text-blue-800';
    case 'deleted':
      return 'bg-red-100 text-red-800';
    case 'recovered':
      return 'bg-purple-100 text-purple-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

export function ActivityLog() {
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [users, setUsers] = useState<Map<string, UserProfile>>(new Map());
  const [loading, setLoading] = useState(true);

  const [actionFilter, setActionFilter] = useState('all');
  const [entityFilter, setEntityFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(0);

  useEffect(() => {
    async function load() {
      const [logRes, userRes] = await Promise.all([
        supabase.from('admin_logs').select('*').order('created_at', { ascending: false }),
        supabase.from('user_profiles').select('*'),
      ]);
      setLogs(logRes.data ?? []);
      setUsers(new Map((userRes.data ?? []).map((u) => [u.id, u])));
      setLoading(false);
    }
    load();
  }, []);

  const entityTypes = useMemo(
    () => [...new Set(logs.map((l) => l.entity_type))].sort(),
    [logs]
  );

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (actionFilter !== 'all' && l.action !== actionFilter) return false;
      if (entityFilter !== 'all' && l.entity_type !== entityFilter) return false;
      if (startDate && new Date(l.created_at) < new Date(startDate)) return false;
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        if (new Date(l.created_at) > end) return false;
      }
      return true;
    });
  }, [logs, actionFilter, entityFilter, startDate, endDate]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  function resetFilters() {
    setActionFilter('all');
    setEntityFilter('all');
    setStartDate('');
    setEndDate('');
    setPage(0);
  }

  function handleExport() {
    const rows = filtered.map((log) => {
      const u = log.user_id ? users.get(log.user_id) : null;
      return {
        user: u ? u.display_name || u.email : 'System',
        action: log.action,
        entity_type: log.entity_type,
        entity_id: log.entity_id ?? '',
        timestamp: formatDate(log.created_at),
      };
    });
    if (rows.length === 0) return;
    exportCsv(`activity-log-${dateStamp()}`, rows, [
      { key: 'user', label: 'User' },
      { key: 'action', label: 'Action' },
      { key: 'entity_type', label: 'Entity Type' },
      { key: 'entity_id', label: 'Entity ID' },
      { key: 'timestamp', label: 'Timestamp' },
    ]);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Activity Log</h1>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Download className="h-4 w-4" /> Export CSV
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <label className="text-xs font-medium text-gray-500">
          Action
          <select
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPage(0);
            }}
            className="mt-1 block rounded-md border border-gray-300 px-2 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          >
            <option value="all">All actions</option>
            <option value="created">Created</option>
            <option value="updated">Updated</option>
            <option value="deleted">Deleted</option>
            <option value="recovered">Recovered</option>
          </select>
        </label>
        <label className="text-xs font-medium text-gray-500">
          Entity Type
          <select
            value={entityFilter}
            onChange={(e) => {
              setEntityFilter(e.target.value);
              setPage(0);
            }}
            className="mt-1 block rounded-md border border-gray-300 px-2 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          >
            <option value="all">All types</option>
            {entityTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-gray-500">
          Start Date
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setPage(0);
            }}
            className="mt-1 block rounded-md border border-gray-300 px-2 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          />
        </label>
        <label className="text-xs font-medium text-gray-500">
          End Date
          <input
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setPage(0);
            }}
            className="mt-1 block rounded-md border border-gray-300 px-2 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          />
        </label>
        <button
          onClick={resetFilters}
          className="flex items-center gap-1 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          <RotateCcw className="h-4 w-4" /> Reset Filters
        </button>
      </div>

      {loading ? (
        <RowsSkeleton count={8} />
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          {/* Mobile: card layout */}
          <div className="divide-y divide-gray-100 md:hidden">
            {pageRows.length === 0 ? (
              <p className="px-4 py-10 text-center text-gray-400">
                No activity matches your filters.
              </p>
            ) : (
              pageRows.map((log) => {
                const u = log.user_id ? users.get(log.user_id) : null;
                return (
                  <div key={log.id} className="space-y-1 px-4 py-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-800">
                        {u ? u.display_name || u.email : 'System'}
                      </span>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${actionColor(
                          log.action
                        )}`}
                      >
                        {log.action}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">
                      {log.entity_type}
                      {log.entity_id && (
                        <span className="ml-1 font-mono text-gray-400">
                          · {log.entity_id.slice(0, 8)}…
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-400">{formatDate(log.created_at)}</p>
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop: table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <Th>User</Th>
                  <Th>Action</Th>
                  <Th>Entity Type</Th>
                  <Th>Entity ID</Th>
                  <Th>Timestamp</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                      No activity matches your filters.
                    </td>
                  </tr>
                ) : (
                  pageRows.map((log) => {
                    const u = log.user_id ? users.get(log.user_id) : null;
                    return (
                      <tr key={log.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-800">
                          {u ? u.display_name || u.email : 'System'}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${actionColor(
                              log.action
                            )}`}
                          >
                            {log.action}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{log.entity_type}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-400">
                          {log.entity_id ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-500">
                          {formatDate(log.created_at)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
            <span className="text-sm text-gray-500">
              {filtered.length} entries · Page {safePage + 1} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
                className="flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" /> Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={safePage >= totalPages - 1}
                className="flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                Next <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
      {children}
    </th>
  );
}
