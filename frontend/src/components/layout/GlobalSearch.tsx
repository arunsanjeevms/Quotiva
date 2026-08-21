import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import { Command } from 'cmdk';
import { FileText, Loader2, Receipt, Search, ShoppingBag, Users, Wallet } from 'lucide-react';
import { searchService } from '@/services/resources';
import { useDebouncedValue } from '@/hooks/useListParams';
import { usePermission } from '@/stores/BusinessContext';

const GROUPS = [
  { key: 'customers', label: 'Customers', icon: Users, path: '/customers', permission: 'customer.read' },
  { key: 'quotations', label: 'Quotations', icon: FileText, path: '/quotations', permission: 'quotation.read' },
  { key: 'invoices', label: 'Invoices', icon: Receipt, path: '/invoices', permission: 'invoice.read' },
  { key: 'products', label: 'Products & services', icon: ShoppingBag, path: '/products', permission: 'product.read' },
  { key: 'payments', label: 'Payments', icon: Wallet, path: '/payments', permission: 'payment.read' },
] as const;

/**
 * Command palette. Search runs server-side against /api/search and each group
 * is filtered by the caller's read permission for that module.
 */
export function GlobalSearch({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): React.ReactElement {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query, 250);

  const canRead = {
    customers: usePermission('customer.read'),
    quotations: usePermission('quotation.read'),
    invoices: usePermission('invoice.read'),
    products: usePermission('product.read'),
    payments: usePermission('payment.read'),
  };

  const { data, isFetching } = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => searchService.query(debounced),
    enabled: open && debounced.trim().length >= 2,
  });

  const go = (path: string): void => {
    onOpenChange(false);
    setQuery('');
    navigate(path);
  };

  const hasResults = GROUPS.some((group) => (data?.[group.key]?.length ?? 0) > 0);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-gray-900/40 animate-fade-in" />
        <Dialog.Content className="fixed left-1/2 top-[15vh] z-[60] w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-lg border border-line bg-surface shadow-lg animate-zoom-in">
          <Dialog.Title className="sr-only">Search</Dialog.Title>
          <Command shouldFilter={false}>
            <div className="flex items-center gap-2 border-b border-line px-3">
              <Search className="h-4 w-4 shrink-0 text-content-muted" />
              <Command.Input
                autoFocus
                value={query}
                onValueChange={setQuery}
                placeholder="Search customers, quotations, invoices, products…"
                className="h-12 w-full bg-transparent text-base outline-none placeholder:text-content-muted"
              />
              {isFetching && <Loader2 className="h-4 w-4 animate-spin text-content-muted" />}
            </div>

            <Command.List className="max-h-[60vh] overflow-y-auto p-2">
              {debounced.trim().length < 2 ? (
                <p className="px-2 py-8 text-center text-sm text-content-muted">
                  Type at least two characters to search.
                </p>
              ) : !isFetching && !hasResults ? (
                <p className="px-2 py-8 text-center text-sm text-content-muted">
                  No results for “{debounced}”.
                </p>
              ) : (
                GROUPS.filter((group) => canRead[group.key]).map((group) => {
                  const results = data?.[group.key] ?? [];
                  if (results.length === 0) return null;
                  const Icon = group.icon;
                  return (
                    <Command.Group
                      key={group.key}
                      heading={
                        <span className="px-2 text-xs uppercase tracking-wide text-content-muted">
                          {group.label}
                        </span>
                      }
                      className="mb-1"
                    >
                      {results.map((item) => (
                        <Command.Item
                          key={item.id}
                          value={`${group.key}-${item.id}`}
                          onSelect={() => go(`${group.path}/${item.id}`)}
                          className="flex cursor-pointer items-center gap-2.5 rounded px-2 py-2 text-base outline-none data-[selected=true]:bg-subtle"
                        >
                          <Icon className="h-4 w-4 shrink-0 text-content-muted" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-content">{item.label}</span>
                            <span className="block truncate text-sm text-content-muted">
                              {item.sublabel}
                            </span>
                          </span>
                        </Command.Item>
                      ))}
                    </Command.Group>
                  );
                })
              )}
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
