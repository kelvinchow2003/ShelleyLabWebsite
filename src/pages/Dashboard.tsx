import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  FolderKanban,
  Package,
  Plus,
  ListChecks,
  Loader2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useNavigation } from '../contexts/NavigationContext';
import { StatusBadge } from '../components/Modal';
import {
  formatDate,
  getStatusColor,
  formatStatusLabel,
  isLoanOverdue,
} from '../lib/utils';
import type { Project, EquipmentLoan } from '../lib/database.types';

interface LoanWithMeta extends EquipmentLoan {
  equipment_name: string;
  lab_name: string;
}

export function Dashboard() {
  const { user } = useAuth();
  const { navigateTo } = useNavigation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loans, setLoans] = useState<LoanWithMeta[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!user) return;

      // My active projects (assigned to me, pending/in_progress)
      const { data: assignments } = await supabase
        .from('project_assignments')
        .select('project_id')
        .eq('user_id', user.id);
      const projectIds = (assignments ?? []).map((a) => a.project_id);

      let myProjects: Project[] = [];
      if (projectIds.length) {
        const { data } = await supabase
          .from('projects')
          .select('*')
          .in('id', projectIds)
          .in('status', ['pending', 'in_progress'])
          .order('submitted_date', { ascending: false })
          .limit(5);
        myProjects = data ?? [];
      }
      setProjects(myProjects);

      // Active equipment loans (borrowing)
      const { data: loanRows } = await supabase
        .from('equipment_loans')
        .select('*')
        .eq('status', 'borrowing')
        .order('expected_return_date', { ascending: true })
        .limit(5);

      const loanList = loanRows ?? [];
      const equipmentIds = [...new Set(loanList.map((l) => l.equipment_id))];
      const labIds = [...new Set(loanList.map((l) => l.lab_id).filter(Boolean))] as string[];

      const [eqRes, labRes] = await Promise.all([
        equipmentIds.length
          ? supabase.from('equipment').select('id,name').in('id', equipmentIds)
          : Promise.resolve({ data: [] }),
        labIds.length
          ? supabase.from('labs').select('id,name').in('id', labIds)
          : Promise.resolve({ data: [] }),
      ]);
      const eqMap = new Map((eqRes.data ?? []).map((e) => [e.id, e.name]));
      const labMap = new Map((labRes.data ?? []).map((l) => [l.id, l.name]));

      setLoans(
        loanList.map((l) => ({
          ...l,
          equipment_name: eqMap.get(l.equipment_id) ?? 'Unknown equipment',
          lab_name: l.lab_id ? labMap.get(l.lab_id) ?? '—' : '—',
        }))
      );
      setLoading(false);
    }
    load();
  }, [user]);

  const overdueLoans = loans.filter((l) =>
    isLoanOverdue(l.expected_return_date, l.actual_return_date, l.status)
  );

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-gray-500">
          Welcome back{user?.email ? `, ${user.email}` : ''}. Here&apos;s what&apos;s
          active.
        </p>
      </div>

      {overdueLoans.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
            <div>
              <h3 className="font-semibold text-red-800">Overdue Equipment</h3>
              <ul className="mt-1 space-y-0.5 text-sm text-red-700">
                {overdueLoans.map((l) => (
                  <li key={l.id}>
                    <strong>{l.contact_name}</strong> has not returned{' '}
                    <strong>{l.equipment_name}</strong> (due{' '}
                    {formatDate(l.expected_return_date, false)})
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* My Active Projects */}
        <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold text-gray-900">
              <FolderKanban className="h-5 w-5 text-blue-600" />
              My Active Projects
            </h2>
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
              {projects.length}
            </span>
          </div>
          {projects.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">
              No active projects assigned to you.
            </p>
          ) : (
            <ul className="space-y-3">
              {projects.map((p) => (
                <li
                  key={p.id}
                  className="rounded-md border border-gray-100 bg-gray-50 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-gray-900">{p.project_name}</span>
                    <StatusBadge
                      label={formatStatusLabel(p.status)}
                      className={getStatusColor(p.status)}
                    />
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                    <span>{p.company}</span>
                    {p.is_urgent && (
                      <span className="font-semibold text-red-600">Urgent</span>
                    )}
                    <span>· {formatDate(p.submitted_date, false)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Active Equipment Loans */}
        <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold text-gray-900">
              <Package className="h-5 w-5 text-blue-600" />
              Active Equipment Loans
            </h2>
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
              {loans.length}
            </span>
          </div>
          {loans.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">
              No equipment currently on loan.
            </p>
          ) : (
            <ul className="space-y-3">
              {loans.map((l) => {
                const overdue = isLoanOverdue(
                  l.expected_return_date,
                  l.actual_return_date,
                  l.status
                );
                return (
                  <li
                    key={l.id}
                    className={`rounded-md border p-3 ${
                      overdue
                        ? 'border-red-200 bg-red-50'
                        : 'border-gray-100 bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-gray-900">
                        {l.equipment_name}
                      </span>
                      {overdue && (
                        <span className="text-xs font-semibold text-red-600">
                          Overdue!
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {l.contact_name} · {l.lab_name} · due{' '}
                      {formatDate(l.expected_return_date, false)}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* Quick Actions */}
      <section className="rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 p-5 text-white shadow-sm">
        <h2 className="mb-3 font-semibold">Quick Actions</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <QuickAction
            icon={<Plus className="h-4 w-4" />}
            label="New Project"
            onClick={() => navigateTo('projects')}
          />
          <QuickAction
            icon={<Package className="h-4 w-4" />}
            label="New Loan"
            onClick={() => navigateTo('equipment')}
          />
          <QuickAction
            icon={<ListChecks className="h-4 w-4" />}
            label="View All Projects"
            onClick={() => navigateTo('projects')}
          />
        </div>
      </section>
    </div>
  );
}

function QuickAction({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 rounded-md bg-white/15 px-4 py-3 text-sm font-medium backdrop-blur transition hover:bg-white/25"
    >
      {icon}
      {label}
    </button>
  );
}
