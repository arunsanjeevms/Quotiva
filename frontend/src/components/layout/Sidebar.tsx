import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDown, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { NAVIGATION, type NavGroup } from './navigation';
import { useBusiness } from '@/stores/BusinessContext';
import { Tooltip } from '@/components/ui/Menu';
import { cn } from '@/lib/cn';
import { initials } from '@/lib/format';

const EXPANDED_KEY = 'quotiva.sidebar.expanded';

export interface SidebarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onMobileClose,
}: SidebarProps): React.ReactElement {
  const { permissions, business, branding } = useBusiness();
  const location = useLocation();

  const [expanded, setExpanded] = useState<string[]>(() => {
    try {
      const raw = window.localStorage.getItem(EXPANDED_KEY);
      return raw ? (JSON.parse(raw) as string[]) : ['sales'];
    } catch {
      return ['sales'];
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(EXPANDED_KEY, JSON.stringify(expanded));
    } catch {
      /* ignore */
    }
  }, [expanded]);

  // Keep the group containing the current route open.
  useEffect(() => {
    const active = NAVIGATION.find((group) =>
      group.items?.some((item) => location.pathname.startsWith(item.to)),
    );
    if (active && !expanded.includes(active.id)) {
      setExpanded((prev) => [...prev, active.id]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  /**
   * Items the user cannot access are hidden rather than disabled, and a group
   * whose children are all hidden disappears entirely.
   */
  const visible = useMemo(() => {
    const allowed = (permission?: string): boolean => !permission || permissions.has(permission);
    return NAVIGATION.map((group) => {
      if (group.items) {
        const items = group.items.filter((item) => allowed(item.permission));
        return items.length > 0 && allowed(group.permission) ? { ...group, items } : null;
      }
      return allowed(group.permission) ? group : null;
    }).filter((group): group is NavGroup => group !== null);
  }, [permissions]);

  const content = (
    <>
      <div
        className={cn(
          'flex h-14 shrink-0 items-center gap-2.5 border-b border-line px-3',
          collapsed && 'lg:justify-center lg:px-2',
        )}
      >
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-fg"
          aria-hidden
        >
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt="" className="h-full w-full rounded-md object-cover" />
          ) : (
            initials(business.name)
          )}
        </div>
        {!collapsed && (
          <span className="min-w-0 flex-1 truncate text-base font-semibold text-content">
            {business.name}
          </span>
        )}
        <button
          type="button"
          onClick={onMobileClose}
          className="rounded p-1 text-content-muted hover:bg-subtle lg:hidden"
          aria-label="Close navigation"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2" aria-label="Main">
        {visible.map((group) =>
          group.items ? (
            <NavGroupBlock
              key={group.id}
              group={group}
              collapsed={collapsed}
              open={expanded.includes(group.id)}
              onToggle={() =>
                setExpanded((prev) =>
                  prev.includes(group.id)
                    ? prev.filter((id) => id !== group.id)
                    : [...prev, group.id],
                )
              }
              onNavigate={onMobileClose}
            />
          ) : (
            <NavLeaf
              key={group.id}
              to={group.to!}
              label={group.label}
              icon={group.icon}
              collapsed={collapsed}
              end
              onNavigate={onMobileClose}
            />
          ),
        )}
      </nav>

      <div className="hidden shrink-0 border-t border-line p-2 lg:block">
        <button
          type="button"
          onClick={onToggleCollapsed}
          className={cn(
            'flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-content-muted transition-colors hover:bg-subtle hover:text-content',
            collapsed && 'justify-center',
          )}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <>
              <PanelLeftClose className="h-4 w-4" />
              Collapse
            </>
          )}
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-gray-900/40 animate-fade-in"
            onClick={onMobileClose}
            aria-hidden
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-line bg-surface animate-slide-in-right">
            {content}
          </aside>
        </div>
      )}

      {/* Desktop rail */}
      <aside
        className={cn(
          'sticky top-0 hidden h-screen shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-150 lg:flex',
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        {content}
      </aside>
    </>
  );
}

function NavGroupBlock({
  group,
  collapsed,
  open,
  onToggle,
  onNavigate,
}: {
  group: NavGroup;
  collapsed: boolean;
  open: boolean;
  onToggle: () => void;
  onNavigate: () => void;
}): React.ReactElement {
  const location = useLocation();
  const hasActiveChild = group.items?.some((item) => location.pathname.startsWith(item.to)) ?? false;
  const Icon = group.icon;

  if (collapsed) {
    return (
      <Tooltip content={group.label} side="right">
        <div>
          <NavLink
            to={group.items?.[0]?.to ?? '#'}
            onClick={onNavigate}
            className={cn(
              'flex h-9 w-full items-center justify-center rounded transition-colors',
              hasActiveChild
                ? 'bg-primary-subtle text-primary'
                : 'text-content-muted hover:bg-subtle hover:text-content',
            )}
          >
            {Icon && <Icon className="h-4 w-4" />}
          </NavLink>
        </div>
      </Tooltip>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          'flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-base font-medium transition-colors',
          hasActiveChild ? 'text-content' : 'text-content-secondary hover:bg-subtle hover:text-content',
        )}
      >
        {Icon && <Icon className="h-4 w-4 shrink-0" />}
        <span className="flex-1 text-left">{group.label}</span>
        <ChevronDown
          className={cn('h-3.5 w-3.5 shrink-0 transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div className="ml-[1.4rem] mt-0.5 space-y-0.5 border-l border-line pl-2">
          {group.items?.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'block rounded px-2 py-1.5 text-base transition-colors',
                  isActive
                    ? 'bg-primary-subtle font-medium text-primary'
                    : 'text-content-secondary hover:bg-subtle hover:text-content',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

function NavLeaf({
  to,
  label,
  icon: Icon,
  collapsed,
  end,
  onNavigate,
}: {
  to: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  collapsed: boolean;
  end?: boolean;
  onNavigate: () => void;
}): React.ReactElement {
  const link = (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 rounded px-2 py-1.5 text-base font-medium transition-colors',
          collapsed && 'h-9 justify-center px-0',
          isActive
            ? 'bg-primary-subtle text-primary'
            : 'text-content-secondary hover:bg-subtle hover:text-content',
        )
      }
    >
      {Icon && <Icon className="h-4 w-4 shrink-0" />}
      {!collapsed && label}
    </NavLink>
  );

  return collapsed ? (
    <Tooltip content={label} side="right">
      <div>{link}</div>
    </Tooltip>
  ) : (
    link
  );
}
