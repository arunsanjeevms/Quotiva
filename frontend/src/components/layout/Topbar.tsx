import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, Check, LogOut, Menu as MenuIcon, Search, User as UserIcon } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from '@/components/ui/Menu';
import { Badge } from '@/components/ui/Badge';
import { GlobalSearch } from './GlobalSearch';
import { useNotifications } from '@/hooks/queries';
import { notificationsService } from '@/services/resources';
import { useSession } from '@/stores/SessionContext';
import { useBusiness } from '@/stores/BusinessContext';
import { formatRelative, initials } from '@/lib/format';
import { cn } from '@/lib/cn';

export function Topbar({ onOpenNav }: { onOpenNav: () => void }): React.ReactElement {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, signOut } = useSession();
  const { business, role } = useBusiness();
  const [searchOpen, setSearchOpen] = useState(false);
  const { data: notificationData } = useNotifications();

  const notifications = notificationData?.data ?? [];
  const unread = notifications.filter((n) => !n.readAt);

  // Command palette shortcut.
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const markAllRead = async (): Promise<void> => {
    await notificationsService.markAllRead();
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface/95 px-3 backdrop-blur sm:px-4">
        <button
          type="button"
          onClick={onOpenNav}
          className="rounded p-2 text-content-secondary hover:bg-subtle lg:hidden"
          aria-label="Open navigation"
        >
          <MenuIcon className="h-4.5 w-4.5" />
        </button>

        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="flex h-8 flex-1 items-center gap-2 rounded border border-line bg-app px-2.5 text-sm text-content-muted transition-colors hover:border-line-strong sm:max-w-md"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="flex-1 text-left">Search customers, documents…</span>
          <kbd className="hidden rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px] text-content-muted sm:inline">
            ⌘K
          </kbd>
        </button>

        <div className="ml-auto flex items-center gap-1">
          <Menu>
            <MenuTrigger asChild>
              <button
                type="button"
                className="relative rounded p-2 text-content-secondary transition-colors hover:bg-subtle"
                aria-label={`Notifications${unread.length ? `, ${unread.length} unread` : ''}`}
              >
                <Bell className="h-4.5 w-4.5" />
                {unread.length > 0 && (
                  <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
                    {unread.length > 9 ? '9+' : unread.length}
                  </span>
                )}
              </button>
            </MenuTrigger>
            <MenuContent className="w-80 p-0">
              <div className="flex items-center justify-between border-b border-line px-3 py-2">
                <span className="text-h3 text-content">Notifications</span>
                {unread.length > 0 && (
                  <button
                    type="button"
                    onClick={markAllRead}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-96 overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="px-3 py-8 text-center text-sm text-content-muted">
                    You are all caught up.
                  </p>
                ) : (
                  notifications.slice(0, 8).map((item) => (
                    <Link
                      key={item.id}
                      to={item.link ?? '#'}
                      className={cn(
                        'block border-b border-line px-3 py-2.5 transition-colors last:border-0 hover:bg-subtle',
                        !item.readAt && 'bg-primary-subtle/40',
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <span
                          className={cn(
                            'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                            item.severity === 'error' && 'bg-danger',
                            item.severity === 'warning' && 'bg-warning',
                            item.severity === 'success' && 'bg-success',
                            item.severity === 'info' && 'bg-info',
                          )}
                        />
                        <div className="min-w-0">
                          <p className="text-base text-content">{item.title}</p>
                          {item.body && (
                            <p className="truncate text-sm text-content-muted">{item.body}</p>
                          )}
                          <p className="mt-0.5 text-xs font-normal text-content-muted">
                            {formatRelative(item.createdAt)}
                          </p>
                        </div>
                        {item.readAt && <Check className="ml-auto h-3 w-3 text-content-muted" />}
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </MenuContent>
          </Menu>

          <Menu>
            <MenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 rounded p-1 pr-2 transition-colors hover:bg-subtle"
                aria-label="Account menu"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-subtle text-xs font-semibold text-primary">
                  {initials(user?.fullName ?? user?.email)}
                </span>
                <span className="hidden text-sm font-medium text-content-secondary sm:inline">
                  {user?.fullName ?? user?.email}
                </span>
              </button>
            </MenuTrigger>
            <MenuContent className="w-60">
              <div className="px-2 py-1.5">
                <p className="truncate text-base font-medium text-content">
                  {user?.fullName ?? 'Account'}
                </p>
                <p className="truncate text-sm text-content-muted">{user?.email}</p>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <Badge tone="primary">{role.name}</Badge>
                  <span className="truncate text-xs font-normal text-content-muted">
                    {business.name}
                  </span>
                </div>
              </div>
              <MenuSeparator />
              <MenuLabel>Account</MenuLabel>
              <MenuItem onSelect={() => navigate('/profile')}>
                <UserIcon className="h-3.5 w-3.5" />
                Profile & password
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                destructive
                onSelect={() => {
                  void signOut();
                }}
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>
      </header>

      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}

/** Fixed application chrome — distinct from the configurable document footer. */
export function AppFooter(): React.ReactElement {
  return (
    <footer className="mt-auto border-t border-line bg-surface px-4 py-3">
      <p className="text-center text-xs font-normal text-content-muted">
        Designed and Developed by Arun Sanjeev M S
      </p>
    </footer>
  );
}
