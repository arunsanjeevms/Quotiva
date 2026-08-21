import { Outlet } from 'react-router-dom';

export function AuthLayout(): React.ReactElement {
  return (
    <div className="flex min-h-screen flex-col bg-app">
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex items-center justify-center gap-2.5">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-base font-semibold text-primary-fg"
              aria-hidden
            >
              Q
            </span>
            <span className="text-h2 text-content">Quotiva</span>
          </div>
          <Outlet />
        </div>
      </div>
      <footer className="px-4 py-4">
        <p className="text-center text-xs font-normal text-content-muted">
          Designed and Developed by Arun Sanjeev M S
        </p>
      </footer>
    </div>
  );
}
