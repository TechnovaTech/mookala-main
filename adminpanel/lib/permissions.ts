/**
 * Roles, permissions, navigation and API access rules for the admin panel.
 *
 * This file is imported by the Edge middleware, by server route handlers and by
 * client components, so it must stay free of Node-only and browser-only imports.
 */

export type Role = 'super_admin' | 'finance' | 'marketing' | 'operations' | 'legal';

export const ROLES: { value: Role; label: string; description: string }[] = [
  {
    value: 'super_admin',
    label: 'Super Admin',
    description: 'Full platform authority, including role assignment and high-risk configuration.',
  },
  {
    value: 'finance',
    label: 'Finance',
    description: 'Payments, reconciliation, commissions, refunds, settlements and financial reports.',
  },
  {
    value: 'marketing',
    label: 'Marketing',
    description: 'Campaigns, banners, coupons, referrals, advertisers and promotional analytics.',
  },
  {
    value: 'operations',
    label: 'Operations',
    description: 'Users, artists, venues, bookings, ticketing, learning, wishes and support.',
  },
  {
    value: 'legal',
    label: 'Legal',
    description: 'Policies, agreements, compliance documents, retention and deletion requests.',
  },
];

/** Every permission module. Each has a `view` and a `manage` action. */
export const MODULES = [
  'dashboard',
  'users',
  'support',
  'artists',
  'organizers',
  'kyc',
  'events',
  'venues',
  'bookings',
  'categories',
  'hire',
  'learning',
  'wishes',
  'ads',
  'memberships',
  'finance',
  'refunds',
  'settlements',
  'marketing',
  'communications',
  'fraud',
  'reports',
  'platform',
  'legal',
  'security',
  'system',
  'integrations',
] as const;

export type Module = (typeof MODULES)[number];
export type Action = 'view' | 'manage' | 'approve';
export type Permission = `${Module}:${Action}`;

export const MODULE_LABELS: Record<Module, string> = {
  dashboard: 'Dashboard',
  users: 'Users',
  support: 'Customer support',
  artists: 'Artists',
  organizers: 'Organisers',
  kyc: 'KYC verification',
  events: 'Events',
  venues: 'Venues',
  bookings: 'Bookings & tickets',
  categories: 'Categories',
  hire: 'Hire professionals',
  learning: 'Learning',
  wishes: 'Wishes & greetings',
  ads: 'Advertisements',
  memberships: 'Memberships',
  finance: 'Finance & commissions',
  refunds: 'Refunds',
  settlements: 'Settlements & payouts',
  marketing: 'Marketing',
  communications: 'Communications',
  fraud: 'Fraud & risk',
  reports: 'Reports & exports',
  platform: 'Platform configuration',
  legal: 'Legal & documents',
  security: 'Security & audit',
  system: 'System health',
  integrations: 'Payment gateway and provider keys',
};

function both(...modules: Module[]): Permission[] {
  return modules.flatMap((m) => [`${m}:view`, `${m}:manage`] as Permission[]);
}

function view(...modules: Module[]): Permission[] {
  return modules.map((m) => `${m}:view` as Permission);
}

/**
 * What each role may do, taken from the client's requirements (section 16) and
 * from how the work actually flows through the panel:
 *
 *   Super Admin  everything, including role assignment and high-risk
 *                configuration (handled separately: always passes).
 *   Finance      payment records, reconciliation, commissions, refunds,
 *                settlements and financial reports. Records every payment,
 *                including advertiser invoices and membership payments.
 *   Marketing    campaigns, banners, coupons, referrals, advertiser operations
 *                and promotional analytics.
 *   Operations   users, artists, venues, bookings, ticketing, learning, wishes,
 *                memberships and support.
 *   Legal        policies, agreements, compliance documents, retention and
 *                deletion requests.
 *
 * Least privilege: a role can open only what its work needs, and no role other
 * than Super Admin receives every module. Kept for Super Admins alone:
 * admin accounts and roles, security settings, platform configuration, system
 * health and backups, and the payment gateway and provider keys
 * (`integrations`). A Super Admin can grant one extra permission to one admin
 * under Security & Audit when their work needs it.
 */
export const ROLE_PERMISSIONS: Record<Exclude<Role, 'super_admin'>, Permission[]> = {
  finance: [
    // Money: full control, including the approvals.
    ...both('finance', 'refunds', 'settlements', 'reports'),
    'finance:approve',
    'refunds:approve',
    'settlements:approve',
    // Read-only context for payment records: who paid, for what, to whom.
    ...view(
      'dashboard',
      'bookings',
      'events',
      'venues',
      'organizers',
      'artists',
      'learning',
      'wishes',
      'ads',
      'memberships',
      'fraud'
    ),
  ],
  marketing: [
    ...both('marketing', 'ads', 'communications'),
    // Read-only context for campaigns and promotional analytics.
    ...view('dashboard', 'artists', 'events', 'memberships', 'reports'),
  ],
  operations: [
    ...both(
      'users',
      'support',
      'artists',
      'organizers',
      'kyc',
      'events',
      'venues',
      'bookings',
      'categories',
      'hire',
      'learning',
      'wishes',
      'memberships',
      'fraud'
    ),
    // Day-to-day approvals that belong to operations: courses and greeting templates.
    'learning:approve',
    'wishes:approve',
    // Read-only: refund status for customer support, what was sent to customers,
    // and the booking and customer reports.
    ...view('dashboard', 'refunds', 'communications', 'reports'),
  ],
  legal: [
    ...both('legal'),
    // Read-only context for compliance work and deletion requests.
    ...view('dashboard', 'users', 'artists', 'organizers', 'platform', 'security'),
  ],
};

export interface AdminIdentity {
  id?: string;
  email?: string;
  name?: string;
  role?: string;
  /** Extra permissions granted on top of the role. */
  perms?: string[];
  /** Session id, used for revocation. */
  sid?: string;
}

export function normaliseRole(role?: string | null): Role | null {
  // Accounts created before roles existed were stored with role "admin".
  if (role === 'admin') return 'super_admin';
  return ROLES.some((r) => r.value === role) ? (role as Role) : null;
}

export function permissionsFor(admin: AdminIdentity | null | undefined): string[] {
  if (!admin) return [];
  const role = normaliseRole(admin.role);
  if (!role) return [];
  if (role === 'super_admin') return ['*'];
  return [...ROLE_PERMISSIONS[role], ...(admin.perms || [])];
}

export function can(admin: AdminIdentity | null | undefined, permission: string): boolean {
  if (!admin) return false;
  const granted = permissionsFor(admin);
  if (granted.includes('*')) return true;
  if (granted.includes(permission)) return true;
  // Being able to manage a module implies being able to view it.
  const [module, action] = permission.split(':');
  if (action === 'view' && granted.includes(`${module}:manage`)) return true;
  return false;
}

/* ------------------------------------------------------------------ */
/* Navigation                                                          */
/* ------------------------------------------------------------------ */

export interface NavItem {
  label: string;
  href: string;
  permission: Permission;
}

export interface NavGroup {
  label: string;
  /** lucide-react icon name, resolved in the Sidebar component. */
  icon: string;
  href?: string;
  permission?: Permission;
  items?: NavItem[];
}

export const NAV: NavGroup[] = [
  { label: 'Dashboard', icon: 'BarChart3', href: '/dashboard', permission: 'dashboard:view' },
  {
    label: 'Users & Support',
    icon: 'Users',
    items: [
      { label: 'All Users', href: '/users', permission: 'users:view' },
      { label: 'User Verification', href: '/users/verification', permission: 'users:view' },
      { label: 'User Activity', href: '/users/activity', permission: 'users:view' },
      { label: 'Complaints', href: '/support/complaints', permission: 'support:view' },
      { label: 'Support Tickets', href: '/support/tickets', permission: 'support:view' },
      { label: 'Feedback & Ratings', href: '/support/feedback', permission: 'support:view' },
      { label: 'Reported Accounts', href: '/support/reports', permission: 'support:view' },
    ],
  },
  {
    label: 'Artists',
    icon: 'Music',
    items: [
      { label: 'All Artists', href: '/artists', permission: 'artists:view' },
      { label: 'Applications & KYC', href: '/kyc', permission: 'kyc:view' },
      { label: 'Artist Categories', href: '/artists/categories', permission: 'artists:view' },
      { label: 'Portfolio Review', href: '/artists/portfolio', permission: 'artists:view' },
      { label: 'Availability', href: '/artists/availability', permission: 'artists:view' },
      { label: 'Performance', href: '/artists/performance', permission: 'artists:view' },
      { label: 'Artist Payments', href: '/artists/payments', permission: 'settlements:view' },
    ],
  },
  {
    label: 'Venues & Ticketing',
    icon: 'Ticket',
    items: [
      { label: 'Organisers', href: '/organizers', permission: 'organizers:view' },
      { label: 'Events', href: '/events', permission: 'events:view' },
      { label: 'Venues', href: '/venues', permission: 'venues:view' },
      { label: 'Cinemas', href: '/cinemas', permission: 'venues:view' },
      { label: 'Cinema Shows', href: '/cinemas/shows', permission: 'venues:view' },
      { label: 'Bookings', href: '/bookings', permission: 'bookings:view' },
      { label: 'Cancellations', href: '/bookings/cancellations', permission: 'bookings:view' },
      { label: 'Ticketing Reports', href: '/ticketing/reports', permission: 'bookings:view' },
      { label: 'Event Categories', href: '/categories', permission: 'categories:view' },
      { label: 'Hire Professionals', href: '/professionals', permission: 'hire:view' },
      { label: 'Hire Requests', href: '/hire-requests', permission: 'hire:view' },
    ],
  },
  {
    label: 'Learning',
    icon: 'GraduationCap',
    items: [
      { label: 'Courses', href: '/learning/courses', permission: 'learning:view' },
      { label: 'Instructors', href: '/learning/instructors', permission: 'learning:view' },
      { label: 'Students', href: '/learning/students', permission: 'learning:view' },
      { label: 'Course Applications', href: '/learning/applications', permission: 'learning:view' },
      { label: 'Course Categories', href: '/learning/categories', permission: 'learning:view' },
      { label: 'Certificates', href: '/learning/certificates', permission: 'learning:view' },
      { label: 'Learning Reports', href: '/learning/reports', permission: 'learning:view' },
    ],
  },
  {
    label: 'Wishes',
    icon: 'Gift',
    items: [
      { label: 'Templates', href: '/wishes/templates', permission: 'wishes:view' },
      { label: 'Categories', href: '/wishes/categories', permission: 'wishes:view' },
      { label: 'Custom Wishes', href: '/wishes/custom', permission: 'wishes:view' },
      { label: 'Orders & Delivery', href: '/wishes/orders', permission: 'wishes:view' },
      { label: 'Delivery Monitor', href: '/wishes/orders/monitor', permission: 'wishes:view' },
      { label: 'Wishes Reports', href: '/wishes/reports', permission: 'wishes:view' },
    ],
  },
  {
    label: 'Advertisements',
    icon: 'Megaphone',
    items: [
      { label: 'Homepage Banners', href: '/banners', permission: 'ads:view' },
      { label: 'Sponsored Ads', href: '/ads', permission: 'ads:view' },
      { label: 'Advertisers', href: '/advertising/advertisers', permission: 'ads:view' },
      { label: 'Applications', href: '/advertising/applications', permission: 'ads:view' },
      { label: 'Campaigns', href: '/advertising/campaigns', permission: 'ads:view' },
      { label: 'Campaign Scheduling', href: '/advertising/scheduling', permission: 'ads:view' },
      { label: 'Packages', href: '/advertising/packages', permission: 'ads:view' },
      { label: 'Ad Payments', href: '/advertising/payments', permission: 'ads:view' },
      { label: 'Ads Reports', href: '/advertising/reports', permission: 'ads:view' },
    ],
  },
  {
    label: 'Memberships',
    icon: 'BadgeCheck',
    items: [
      { label: 'Plans', href: '/memberships/plans', permission: 'memberships:view' },
      { label: 'Subscriptions', href: '/memberships/subscriptions', permission: 'memberships:view' },
      { label: 'Membership Payments', href: '/memberships/payments', permission: 'memberships:view' },
      { label: 'Expiry Reminders', href: '/memberships/reminders', permission: 'memberships:view' },
      { label: 'Renewals & Cancellations', href: '/memberships/renewals', permission: 'memberships:view' },
      { label: 'Membership Reports', href: '/memberships/reports', permission: 'memberships:view' },
    ],
  },
  {
    label: 'Finance',
    icon: 'CreditCard',
    items: [
      { label: 'Overview', href: '/finance', permission: 'finance:view' },
      { label: 'Payments', href: '/finance/payments', permission: 'finance:view' },
      { label: 'Ledger', href: '/finance/ledger', permission: 'finance:view' },
      { label: 'Commission Settings', href: '/finance/commissions', permission: 'finance:view' },
      { label: 'Refunds', href: '/finance/refunds', permission: 'refunds:view' },
      { label: 'Refund Rules', href: '/finance/refund-rules', permission: 'refunds:view' },
      { label: 'Settlements', href: '/finance/settlements', permission: 'settlements:view' },
      { label: 'Statements', href: '/finance/statements', permission: 'finance:view' },
      { label: 'Reconciliation', href: '/finance/reconciliation', permission: 'finance:view' },
      { label: 'Payment Gateway', href: '/settings', permission: 'integrations:view' },
    ],
  },
  {
    label: 'Marketing',
    icon: 'Percent',
    items: [
      { label: 'Coupons', href: '/marketing/coupons', permission: 'marketing:view' },
      { label: 'Referral Programmes', href: '/marketing/referrals', permission: 'marketing:view' },
      { label: 'Push Campaigns', href: '/marketing/push-campaigns', permission: 'marketing:view' },
      { label: 'Promotions', href: '/marketing/promotions', permission: 'marketing:view' },
    ],
  },
  {
    label: 'Communications',
    icon: 'MessageSquare',
    items: [
      { label: 'Announcements', href: '/communications/announcements', permission: 'communications:view' },
      { label: 'Templates', href: '/communications/templates', permission: 'communications:view' },
      { label: 'Email, SMS, WhatsApp & Push', href: '/communications/channels', permission: 'communications:view' },
      { label: 'Delivery Logs', href: '/communications/logs', permission: 'communications:view' },
    ],
  },
  {
    label: 'Fraud & Risk',
    icon: 'ShieldAlert',
    items: [
      { label: 'Risk Overview', href: '/fraud', permission: 'fraud:view' },
      { label: 'Risk Cases', href: '/fraud/cases', permission: 'fraud:view' },
    ],
  },
  {
    label: 'Reports & Exports',
    icon: 'FileBarChart',
    items: [
      { label: 'Reports', href: '/reports', permission: 'reports:view' },
      { label: 'Scheduled Reports', href: '/reports/scheduled', permission: 'reports:view' },
      { label: 'Generated Files', href: '/reports/files', permission: 'reports:view' },
    ],
  },
  {
    label: 'Platform & Legal',
    icon: 'Scale',
    items: [
      { label: 'Platform Configuration', href: '/platform', permission: 'platform:view' },
      { label: 'Policies', href: '/legal/policies', permission: 'legal:view' },
      { label: 'Agreements & Documents', href: '/legal/documents', permission: 'legal:view' },
      { label: 'Consent Records', href: '/legal/consents', permission: 'legal:view' },
      { label: 'Retention Schedules', href: '/legal/retention', permission: 'legal:view' },
      { label: 'Deletion Requests', href: '/legal/deletion-requests', permission: 'legal:view' },
    ],
  },
  {
    label: 'Security & Audit',
    icon: 'Lock',
    items: [
      { label: 'Admins & Roles', href: '/security/admins', permission: 'security:view' },
      // Every admin sees their own sessions and devices here; only a Super Admin sees other admins' (checked by the API).
      { label: 'Sessions & Devices', href: '/security/sessions', permission: 'dashboard:view' },
      { label: 'Login History', href: '/security/logins', permission: 'security:view' },
      { label: 'Activity Log', href: '/security/audit', permission: 'security:view' },
      { label: 'Security Events', href: '/security/events', permission: 'security:view' },
      { label: 'Security Settings', href: '/security/settings', permission: 'security:view' },
      // Every role may need to approve, or follow, a change held for a second approver.
      // The API shows each admin only their own requests and the ones they may decide.
      { label: 'Approvals', href: '/security/approvals', permission: 'dashboard:view' },
      { label: 'My Account & 2FA', href: '/security/account', permission: 'dashboard:view' },
    ],
  },
  {
    label: 'System Health',
    icon: 'Activity',
    items: [
      { label: 'Status', href: '/system', permission: 'system:view' },
      { label: 'Backups', href: '/system/backups', permission: 'system:view' },
      { label: 'Incidents', href: '/system/incidents', permission: 'system:view' },
    ],
  },
];

/** Permission needed to open an admin page, or null when any admin may. */
export function permissionForPath(pathname: string): string | null {
  let best: { href: string; permission: string } | null = null;

  for (const group of NAV) {
    const candidates: { href: string; permission?: string }[] = group.items
      ? group.items
      : [{ href: group.href || '', permission: group.permission }];

    for (const item of candidates) {
      if (!item.href || !item.permission) continue;
      if (pathname === item.href || pathname.startsWith(item.href + '/')) {
        if (!best || item.href.length > best.href.length) {
          best = { href: item.href, permission: item.permission };
        }
      }
    }
  }

  return best ? best.permission : null;
}

/* ------------------------------------------------------------------ */
/* API access rules                                                    */
/* ------------------------------------------------------------------ */

export type Access = 'public' | 'admin' | Permission;

interface ApiRule {
  /** Matched against the pathname, e.g. /api/users/123 */
  pattern: RegExp;
  methods?: string[];
  access: Access;
}

const READ = ['GET', 'HEAD'];
const WRITE = ['POST', 'PUT', 'PATCH', 'DELETE'];

/**
 * First matching rule wins. Anything under /api that matches no rule needs a
 * signed-in admin, so a new route is closed by default.
 *
 * The "public" rules below are the endpoints the website and the two mobile
 * apps call. They stay open until those clients send a session token.
 */
const API_RULES: ApiRule[] = [
  // --- admin sign-in -------------------------------------------------
  { pattern: /^\/api\/auth\/(login|logout)$/, access: 'public' },
  { pattern: /^\/api\/auth\/(me|change-password|2fa)(\/.*)?$/, access: 'admin' },

  // --- mobile app / website sign-in and profiles ---------------------
  { pattern: /^\/api\/auth\/(check-user|login-existing)$/, access: 'public' },
  { pattern: /^\/api\/user\/(register|verify-otp|profile|follow-status)$/, access: 'public' },
  {
    pattern: /^\/api\/organizer\/(register|verify-otp|profile|kyc|kyc-status|resubmit-kyc|earnings)$/,
    access: 'public',
  },
  {
    pattern:
      /^\/api\/artist\/(register|verify-otp|profile|kyc|kyc-status|resubmit-kyc|media|dashboard-stats|booking-requests|booking-response|events|followers|earnings|availability)$/,
    access: 'public',
  },
  { pattern: /^\/api\/staff\/login$/, access: 'public' },
  { pattern: /^\/api\/public\//, access: 'public' },
  // Called by the host's scheduler. Each handler checks the CRON_SECRET itself.
  { pattern: /^\/api\/cron\//, access: 'public' },

  // --- catalogue the apps read ---------------------------------------
  { pattern: /^\/api\/artists$/, methods: READ, access: 'public' }, // ?all=true is checked in the handler
  { pattern: /^\/api\/artists\/(follow|follower-count)$/, access: 'public' },
  { pattern: /^\/api\/images\/[^/]+$/, methods: READ, access: 'public' },
  { pattern: /^\/api\/(categories|genres|languages|banners|ads|professionals)$/, methods: READ, access: 'public' },
  { pattern: /^\/api\/venues(\/[^/]+)?$/, methods: READ, access: 'public' },

  // --- events ----------------------------------------------------------
  { pattern: /^\/api\/events\/approved$/, methods: READ, access: 'public' },
  { pattern: /^\/api\/events\/user\/[^/]+$/, methods: READ, access: 'public' },
  { pattern: /^\/api\/events\/organizer\/[^/]+$/, access: 'finance:view' },
  { pattern: /^\/api\/events\/[^/]+\/scan-stats$/, methods: READ, access: 'public' },
  { pattern: /^\/api\/events\/[^/]+\/(bookings|payment-details)$/, access: 'finance:view' },
  // List, create, read one, edit tickets and delete are used by the organiser
  // app. The handlers restrict what an anonymous caller may see and change.
  { pattern: /^\/api\/events(\/[^/]+)?$/, access: 'public' },

  // --- bookings and payments -------------------------------------------
  { pattern: /^\/api\/bookings$/, access: 'public' }, // an unfiltered GET is checked in the handler
  { pattern: /^\/api\/bookings\/(verify|cancel)$/, access: 'public' },
  { pattern: /^\/api\/payment\/(config|order|verify|webhook)$/, access: 'public' },

  // --- requests raised from the apps -----------------------------------
  { pattern: /^\/api\/hire-requests$/, methods: ['GET', 'POST'], access: 'public' }, // an unfiltered GET is checked in the handler
  { pattern: /^\/api\/jatra$/, access: 'public' }, // an unfiltered GET is checked in the handler

  // --- admin-only areas -------------------------------------------------
  { pattern: /^\/api\/dashboard\//, access: 'dashboard:view' },
  { pattern: /^\/api\/users(\/.*)?$/, methods: READ, access: 'users:view' },
  { pattern: /^\/api\/users(\/.*)?$/, methods: WRITE, access: 'users:manage' },
  { pattern: /^\/api\/organizers(\/.*)?$/, methods: READ, access: 'organizers:view' },
  { pattern: /^\/api\/organizers(\/.*)?$/, methods: WRITE, access: 'organizers:manage' },
  { pattern: /^\/api\/artist\/[^/]+$/, methods: READ, access: 'artists:view' },
  { pattern: /^\/api\/kyc$/, methods: READ, access: 'kyc:view' },
  { pattern: /^\/api\/kyc\//, access: 'kyc:manage' },
  { pattern: /^\/api\/venues(\/.*)?$/, methods: WRITE, access: 'venues:manage' },
  { pattern: /^\/api\/categories$/, methods: WRITE, access: 'categories:manage' },
  { pattern: /^\/api\/(banners|ads)(\/.*)?$/, methods: WRITE, access: 'ads:manage' },
  { pattern: /^\/api\/professionals(\/.*)?$/, methods: WRITE, access: 'hire:manage' },
  { pattern: /^\/api\/hire-requests(\/.*)?$/, methods: READ, access: 'hire:view' },
  { pattern: /^\/api\/hire-requests(\/.*)?$/, methods: WRITE, access: 'hire:manage' },
  // Gateway keys are high-risk configuration: Super Admin, or an admin granted `integrations`.
  { pattern: /^\/api\/settings\/payment(\/.*)?$/, methods: READ, access: 'integrations:view' },
  { pattern: /^\/api\/settings\/payment(\/.*)?$/, methods: WRITE, access: 'integrations:manage' },
  { pattern: /^\/api\/settings$/, methods: READ, access: 'finance:view' },
  { pattern: /^\/api\/settings$/, methods: WRITE, access: 'finance:manage' },
  // Everything under /api/admin checks its own module permission in the handler.
  { pattern: /^\/api\/admin\//, access: 'admin' },
];

export function accessForApi(pathname: string, method: string): Access {
  const verb = method.toUpperCase();
  for (const rule of API_RULES) {
    if (rule.methods && !rule.methods.includes(verb)) continue;
    if (rule.pattern.test(pathname)) return rule.access;
  }
  return 'admin';
}
