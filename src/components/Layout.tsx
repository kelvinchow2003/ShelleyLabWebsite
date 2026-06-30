import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Home,
  FolderKanban,
  Package,
  BarChart3,
  Trash2,
  LogOut,
  Menu,
  X,
  ChevronDown,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { getInitials } from '../lib/utils';
import { ShelleyWordmark } from './Logo';
import type { PageKey } from '../contexts/NavigationContext';

interface NavItem {
  key: PageKey;
  label: string;
  icon: typeof Home;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'home', label: 'Dashboard', icon: Home },
  { key: 'projects', label: 'Projects', icon: FolderKanban },
  { key: 'equipment', label: 'Equipment', icon: Package },
  { key: 'logs', label: 'Activity Log', icon: BarChart3 },
  { key: 'deleted', label: 'Deleted', icon: Trash2 },
];

export function Layout({
  currentPage,
  onNavigate,
  children,
}: {
  currentPage: PageKey;
  onNavigate: (page: PageKey) => void;
  children: ReactNode;
}) {
  const { signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  function go(page: PageKey) {
    onNavigate(page);
    setMobileOpen(false);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="sticky top-0 z-40 border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex h-20 items-center justify-between">
            <button
              onClick={() => go('home')}
              className="flex items-center gap-2"
              aria-label="Shelley Automation — Dashboard"
            >
              <ShelleyWordmark imgClassName="h-14 w-auto" iconClassName="h-10 w-10" textClassName="text-xl" />
            </button>

            {/* Desktop nav */}
            <div className="hidden items-center gap-1 md:flex">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = currentPage === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => go(item.key)}
                    className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition ${
                      active
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                );
              })}
              <UserMenu />
            </div>

            {/* Mobile toggle */}
            <button
              className="rounded-md p-2 text-gray-600 hover:bg-gray-100 md:hidden"
              onClick={() => setMobileOpen((o) => !o)}
              aria-label="Toggle navigation"
            >
              {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="border-t border-gray-200 bg-white px-4 py-2 md:hidden">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = currentPage === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => go(item.key)}
                  className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition ${
                    active
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
            <button
              onClick={() => {
                setMobileOpen(false);
                signOut();
              }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </div>
        )}
      </nav>

      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}

function UserMenu() {
  const { user, signOut } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('user_profiles')
      .select('display_name')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => setDisplayName(data?.display_name ?? ''));
  }, [user]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const name = displayName || user?.email || 'Account';
  const email = user?.email ?? '';

  return (
    <div ref={ref} className="relative ml-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition hover:bg-gray-100"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">
          {getInitials(name)}
        </span>
        <ChevronDown className="h-4 w-4 text-gray-500" />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="border-b border-gray-100 px-4 py-3">
            <p className="truncate text-sm font-medium text-gray-900">{name}</p>
            {email && <p className="truncate text-xs text-gray-400">{email}</p>}
          </div>
          <button
            onClick={() => signOut()}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
