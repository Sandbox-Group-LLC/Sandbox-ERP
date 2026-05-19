export type UserRole = 'ADMIN' | 'MEMBER' | 'EXTERNAL' | 'CLIENT';

export const EXTERNAL_ALLOWED_ROUTES = [
  '/projects',
  '/inventory',
  '/messages',
  '/ai-assistant',
] as const;

export const CLIENT_ALLOWED_ROUTES = [
  '/projects',
  '/ai-assistant',
] as const;

export const EXTERNAL_ALLOWED_PROJECT_TABS = [
  'client-budget',
  'plan',
  'purchases',
  'shipping',
  'assets',
  'proofs',
  'space-allocation',
] as const;

export const CLIENT_ALLOWED_PROJECT_TABS = [
  'client-budget',
  'plan',
  'assets',
  'space-allocation',
  'proof-approvals',
] as const;

export function canAccessRoute(role: UserRole, pathname: string): boolean {
  if (role === 'ADMIN' || role === 'MEMBER') {
    return true;
  }

  if (role === 'EXTERNAL') {
    if (pathname === '/') return true;
    if (pathname === '/projects' || pathname.startsWith('/projects/')) return true;
    for (const route of EXTERNAL_ALLOWED_ROUTES) {
      if (pathname === route || pathname.startsWith(route + '/')) {
        return true;
      }
    }
    return false;
  }

  if (role === 'CLIENT') {
    if (pathname === '/') return true;
    if (pathname === '/projects' || pathname.startsWith('/projects/')) return true;
    for (const route of CLIENT_ALLOWED_ROUTES) {
      if (pathname === route || pathname.startsWith(route + '/')) {
        return true;
      }
    }
    return false;
  }

  return false;
}

export function canAccessProjectTab(role: UserRole, tabId: string): boolean {
  if (role === 'ADMIN' || role === 'MEMBER') {
    return true;
  }

  if (role === 'EXTERNAL') {
    return EXTERNAL_ALLOWED_PROJECT_TABS.includes(tabId as any);
  }

  if (role === 'CLIENT') {
    return CLIENT_ALLOWED_PROJECT_TABS.includes(tabId as any);
  }

  return false;
}

export function getNavItems(role: UserRole) {
  const allItems = [
    { name: 'Dashboard', href: '/', icon: 'LayoutDashboard' },
    { name: 'Clients', href: '/clients', icon: 'Users' },
    { name: 'Opportunities', href: '/opportunities', icon: 'Target' },
    { name: 'Projects', href: '/projects', icon: 'FolderKanban' },
    { name: 'Vendors', href: '/vendors', icon: 'Building2' },
    { name: 'People', href: '/people', icon: 'UserCircle' },
    { name: 'Inventory', href: '/inventory', icon: 'Package' },
    { name: 'Contracts', href: '/contracts', icon: 'FileText' },
    { name: 'Receivables', href: '/receivables', icon: 'DollarSign' },
    { name: 'Messages', href: '/messages', icon: 'MessageSquare' },
  ];

  if (role === 'EXTERNAL') {
    return allItems.filter(item => 
      item.href === '/projects' ||
      item.href === '/inventory' ||
      item.href === '/messages'
    );
  }

  if (role === 'CLIENT') {
    return allItems.filter(item => 
      item.href === '/projects'
    );
  }

  return allItems;
}
