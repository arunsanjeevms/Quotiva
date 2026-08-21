import { NavLink, Outlet } from 'react-router-dom';
import { NAVIGATION, SETTINGS_ICONS } from '@/components/layout/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { cn } from '@/lib/cn';

export function SettingsLayout(): React.ReactElement {
  const items = NAVIGATION.find((group) => group.id === 'settings')?.items ?? [];

  return (
    <>
      <PageHeader
        title="Settings"
        description="Configure your business identity, documents, users and security."
      />
      <div className="flex flex-col gap-5 lg:flex-row">
        <nav
          aria-label="Settings sections"
          className="shrink-0 lg:w-56"
        >
          {/* Horizontal scroller on narrow screens, vertical list on desktop. */}
          <div className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
            {items.map((item) => {
              const Icon = SETTINGS_ICONS[item.to];
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'flex shrink-0 items-center gap-2 whitespace-nowrap rounded px-2.5 py-1.5 text-base transition-colors',
                      isActive
                        ? 'bg-primary-subtle font-medium text-primary'
                        : 'text-content-secondary hover:bg-subtle hover:text-content',
                    )
                  }
                >
                  {Icon && <Icon className="h-4 w-4 shrink-0" />}
                  {item.label}
                </NavLink>
              );
            })}
          </div>
        </nav>
        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </>
  );
}
