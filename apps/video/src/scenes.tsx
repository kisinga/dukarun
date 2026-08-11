import {
  ArrowPathIcon,
  ArrowTrendingUpIcon,
  BanknotesIcon,
  ChartBarIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  CloudArrowUpIcon,
  CubeIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  QrCodeIcon,
  ShieldCheckIcon,
  SignalSlashIcon,
  UsersIcon,
  WifiIcon,
} from '@heroicons/react/24/outline';
import type { CSSProperties, ReactNode } from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { RenderTarget, Scene } from './schema';

const products = [
  ['Unga wa Dola 2kg', 185],
  ['Mafuta 1L', 340],
  ['Sugar 1kg', 165],
  ['Airtime 100', 100],
] as const;

function enterStyle(frame: number, fps: number, delay = 0): CSSProperties {
  const progress = spring({ frame: frame - delay, fps, config: { damping: 18, stiffness: 120 } });
  return {
    opacity: interpolate(progress, [0, 1], [0, 1]),
    transform: `translateY(${interpolate(progress, [0, 1], [34, 0])}px)`,
  };
}

function fadeStyle(frame: number, fps: number, delay = 0): CSSProperties {
  const progress = spring({ frame: frame - delay, fps, config: { damping: 18, stiffness: 120 } });
  return { opacity: interpolate(progress, [0, 1], [0, 1]) };
}

function Shell({ scene, children, kicker }: { scene: Scene; children: ReactNode; kicker: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div className="scene-shell">
      <div className="scene-copy" style={enterStyle(frame, fps)}>
        <p className="scene-kicker">{kicker}</p>
        <h1 className="scene-title">{scene.headline}</h1>
        {scene.body ? <p className="scene-body">{scene.body}</p> : null}
      </div>
      {children}
    </div>
  );
}

function Phone({ offline = false }: { offline?: boolean }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div className="phone-layout">
      <div className="phone" style={enterStyle(frame, fps, 6)}>
        <div className="phone-notch" />
        <div className="phone-screen">
          <div className="phone-header">
            <span>Sell</span>
            {offline ? (
              <span className="badge badge-warning">
                <SignalSlashIcon width={20} /> Offline
              </span>
            ) : (
              <span className="badge badge-success">
                <CheckCircleIcon width={20} /> Live
              </span>
            )}
          </div>
          <div className="product-grid">
            {products.map(([name, price], index) => (
              <div
                className="product-card"
                key={name}
                style={enterStyle(frame, fps, 10 + index * 3)}
              >
                <div className="product-name">{name}</div>
                <div className="product-price">{price.toLocaleString('en-KE')}</div>
              </div>
            ))}
          </div>
          <div className="cart-bar">Record M-Pesa · KES 790</div>
        </div>
      </div>
    </div>
  );
}

function BrandHook({ scene }: { scene: Scene }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <Shell scene={scene} kicker="Built for the network you have">
      <div className="hero-visual-layout">
        <div className="hero-visual" style={enterStyle(frame, fps, 10)}>
          <SignalSlashIcon width={300} color="#e85d2f" strokeWidth={1.2} />
        </div>
      </div>
    </Shell>
  );
}

function PhonePos({ scene }: { scene: Scene }) {
  return (
    <Shell scene={scene} kicker="Dukarun point of sale">
      <Phone offline />
    </Shell>
  );
}

function OfflineState({ scene }: { scene: Scene }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <Shell scene={scene} kicker="Offline is normal">
      <div className="offline-card-layout">
        <div className="panel offline-card" style={enterStyle(frame, fps, 6)}>
          <div className="badge badge-warning">
            <SignalSlashIcon width={22} /> Offline queue
          </div>
          <div style={{ marginTop: 30, fontSize: 30, fontWeight: 700 }}>Sale #0142</div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: 18,
              fontSize: 25,
            }}
          >
            <span>Jiko Kiosk · Wanjiru</span>
            <strong>KES 790</strong>
          </div>
          <div
            style={{
              marginTop: 26,
              height: 12,
              overflow: 'hidden',
              borderRadius: 8,
              background: '#ebebeb',
            }}
          >
            <div style={{ width: '68%', height: '100%', background: '#eab308' }} />
          </div>
        </div>
      </div>
    </Shell>
  );
}

function SyncState({ scene }: { scene: Scene }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rotation = interpolate(frame, [0, fps * 1.5], [0, 360]);
  return (
    <Shell scene={scene} kicker="Back online">
      <div className="sync-layout">
        <div className="sync-visual" style={enterStyle(frame, fps)}>
          <CloudArrowUpIcon width={230} color="#22c55e" />
          <ArrowPathIcon
            width={100}
            color="#3b82f6"
            style={{ transform: `rotate(${rotation}deg)` }}
          />
        </div>
      </div>
    </Shell>
  );
}

function Receipt({ scene }: { scene: Scene }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <Shell scene={scene} kicker="Payment complete">
      <div className="receipt-layout">
        <div className="receipt" style={enterStyle(frame, fps, 4)}>
          <div style={{ textAlign: 'center', fontWeight: 900, letterSpacing: 2 }}>JIKO KIOSK</div>
          <div style={{ marginTop: 6, textAlign: 'center', opacity: 0.6 }}>Cashier: Wanjiru</div>
          <div className="receipt-rule" />
          <div className="receipt-row">
            <span>UNGA WA DOLA 2KG</span>
            <span>185</span>
          </div>
          <div className="receipt-row">
            <span>MAFUTA 1L</span>
            <span>340</span>
          </div>
          <div className="receipt-row">
            <span>SUGAR 1KG</span>
            <span>165</span>
          </div>
          <div className="receipt-row">
            <span>AIRTIME</span>
            <span>100</span>
          </div>
          <div className="receipt-rule" />
          <div className="receipt-row receipt-total">
            <span>TOTAL</span>
            <span>790</span>
          </div>
          <div style={{ marginTop: 24, color: '#147a38', fontWeight: 900 }}>✓ M-PESA RECORDED</div>
        </div>
      </div>
    </Shell>
  );
}

function LedgerPosting({ scene }: { scene: Scene }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <Shell scene={scene} kicker="Real accounting underneath">
      <div className="ledger-layout">
        <div className="panel ledger-card" style={enterStyle(frame, fps)}>
          <div className="ledger-row" style={{ fontWeight: 800 }}>
            <span>Account</span>
            <span>Debit</span>
            <span>Credit</span>
          </div>
          <div className="ledger-row">
            <span>M-Pesa</span>
            <strong>790</strong>
            <span>0</span>
          </div>
          <div className="ledger-row">
            <span>Sales revenue</span>
            <span>0</span>
            <strong>790</strong>
          </div>
          <div className="badge badge-success" style={{ marginTop: 24 }}>
            <CheckCircleIcon width={22} /> Balanced
          </div>
        </div>
      </div>
    </Shell>
  );
}

function Dashboard({ scene }: { scene: Scene }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const values = [
    ['Revenue', `KES ${Number(scene.data.revenue ?? 18450).toLocaleString('en-KE')}`],
    ['Sales', String(scene.data.sales ?? 27)],
    ['Margin', `KES ${Number(scene.data.margin ?? 4260).toLocaleString('en-KE')}`],
  ];
  return (
    <Shell scene={scene} kicker="The owner's office">
      <div className="dashboard" style={enterStyle(frame, fps, 4)}>
        {values.map(([label, value], index) => (
          <div
            className="panel stat-card"
            key={label}
            style={enterStyle(frame, fps, 8 + index * 4)}
          >
            <div className="stat-label">{label}</div>
            <div className="stat-value">{value}</div>
          </div>
        ))}
      </div>
    </Shell>
  );
}

function BusinessOperations({ scene }: { scene: Scene }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const stages = [
    { icon: BanknotesIcon, title: 'At the counter', detail: 'Sales · Cash · M-Pesa' },
    { icon: CubeIcon, title: 'On the shelves', detail: 'Stock in · Stock out' },
    { icon: UsersIcon, title: 'Behind the shop', detail: 'Staff · Suppliers · Expenses' },
    {
      icon: ChatBubbleLeftRightIcon,
      title: 'After the sale',
      detail: 'Credit · Receipts · Follow-up',
    },
  ] as const;

  return (
    <Shell scene={scene} kicker="Running a business">
      <div className="business-journey" style={fadeStyle(frame, fps, 3)}>
        <svg className="journey-links" viewBox="0 0 900 520" aria-hidden="true">
          <path d="M350 120 C420 120 420 225 450 260" />
          <path d="M550 120 C480 120 480 225 450 260" />
          <path d="M350 400 C420 400 420 295 450 260" />
          <path d="M550 400 C480 400 480 295 450 260" />
        </svg>
        <div className="journey-grid">
          {stages.map(({ icon: Icon, title, detail }, index) => (
            <div
              className="journey-card-wrap"
              key={title}
              style={enterStyle(frame, fps, 7 + index * 4)}
            >
              <div className="journey-card">
                <span className="journey-icon">
                  <Icon width={30} />
                </span>
                <span>
                  <strong>{title}</strong>
                  <small>{detail}</small>
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className="journey-hub" style={fadeStyle(frame, fps, 22)}>
          <small>One business</small>
          <strong>Everything moves together</strong>
        </div>
      </div>
    </Shell>
  );
}

function RecordsBreakdown({ scene }: { scene: Scene }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const failures = [
    {
      icon: ChatBubbleLeftRightIcon,
      title: 'Customer credit',
      cost: 'Cash uncollected',
      note: 'Balances and follow-up slip.',
    },
    {
      icon: BanknotesIcon,
      title: 'Supplier credit',
      cost: 'Surprise payment',
      note: 'What the business owes surfaces late.',
    },
    {
      icon: CubeIcon,
      title: 'Stock count',
      cost: 'Surprise stockout',
      note: 'The shelf empties before the record warns.',
    },
    {
      icon: ChartBarIcon,
      title: 'Profit record',
      cost: 'Profit is a guess',
      note: 'Sales, costs and expenses do not reconcile.',
    },
  ] as const;

  return (
    <Shell scene={scene} kicker="Weak records">
      <div className="breakdown-board" style={fadeStyle(frame, fps, 2)}>
        <svg className="breakdown-links" viewBox="0 0 900 520" aria-hidden="true">
          <path d="M350 120 L405 178" />
          <path d="M495 178 L550 120" />
          <path d="M350 365 L405 310" />
          <path d="M495 310 L550 365" />
        </svg>
        <div className="breakdown-grid">
          {failures.map(({ icon: Icon, title, cost, note }, index) => (
            <div
              className="breakdown-card-wrap"
              key={title}
              style={enterStyle(frame, fps, 6 + index * 4)}
            >
              <div className="breakdown-card">
                <div className="breakdown-card-head">
                  <span className="breakdown-icon">
                    <Icon width={27} />
                  </span>
                  <span className="breakdown-warning">Record missing</span>
                </div>
                <strong>{title}</strong>
                <small>{note}</small>
                <b>{cost}</b>
              </div>
            </div>
          ))}
        </div>
        <div className="breakdown-core" style={fadeStyle(frame, fps, 20)}>
          <ExclamationTriangleIcon width={38} />
          <strong>Breakage spreads</strong>
        </div>
        <div className="business-cost-strip" style={enterStyle(frame, fps, 26)}>
          <span>The business pays</span>
          <strong>in uncollected cash, surprise bills, stockouts and uncertain profit</strong>
        </div>
      </div>
    </Shell>
  );
}

function DukarunTransition({ scene }: { scene: Scene }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div className="scene-shell dukarun-transition">
      <div className="transition-path transition-path-left" />
      <div className="transition-path transition-path-right" />
      <div className="transition-content" style={enterStyle(frame, fps, 3)}>
        <CtaWordmark />
        <p className="transition-kicker">One place for your records</p>
        <h1 className="scene-title">{scene.headline}</h1>
        <p className="scene-body">{scene.body}</p>
      </div>
    </div>
  );
}

function OverviewHook({ scene }: { scene: Scene }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cards = [
    { icon: BanknotesIcon, label: 'Sales records', value: 'Missing entries', tone: 'primary' },
    { icon: CubeIcon, label: 'Stock on hand', value: 'Count does not match', tone: 'warning' },
    { icon: UsersIcon, label: 'Owner decisions', value: 'No clear numbers', tone: 'info' },
    {
      icon: ChatBubbleLeftRightIcon,
      label: 'Customer credit',
      value: 'Follow-up missed',
      tone: 'success',
    },
  ] as const;
  return (
    <Shell scene={scene} kicker="When records fail">
      <div className="overview-stack">
        {cards.map(({ icon: Icon, label, value, tone }, index) => (
          <div
            className={`overview-stack-card overview-stack-card-${index + 1}`}
            key={label}
            style={enterStyle(frame, fps, 6 + index * 4)}
          >
            <span className={`overview-icon overview-icon-${tone}`}>
              <Icon width={30} />
            </span>
            <span>
              <small>{label}</small>
              <strong>{value}</strong>
            </span>
          </div>
        ))}
      </div>
    </Shell>
  );
}

function BarcodeSale({ scene }: { scene: Scene }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scanProgress = interpolate(frame % 70, [0, 35, 70], [8, 88, 8]);
  return (
    <Shell scene={scene} kicker="At the counter">
      <div className="sale-console" style={fadeStyle(frame, fps, 5)}>
        <div className="sale-console-top">
          <span className="sale-console-brand">Jiko Kiosk</span>
          <span className="badge badge-success">
            <WifiIcon width={18} /> Ready
          </span>
        </div>
        <div className="product-finder">
          <div className="product-search-preview">
            <MagnifyingGlassIcon width={21} />
            <span>Search product, manufacturer or SKU</span>
          </div>
          <div className="product-find-methods">
            <span className="product-find-method product-find-method-active">Quick add</span>
            <span className="product-find-method">Search</span>
            <span className="product-find-method">Scan barcode</span>
          </div>
        </div>
        <div className="scan-stage">
          <div className="scan-product">
            <span className="scan-product-mark">UD</span>
            <div>
              <strong>Unga wa Dola 2kg</strong>
              <small>KES 185</small>
            </div>
          </div>
          <div className="barcode-box">
            <QrCodeIcon width={54} />
            <div className="barcode-lines" aria-hidden="true" />
            <div className="scanner-beam" style={{ top: `${scanProgress}%` }} />
          </div>
        </div>
        <div className="sale-confirmation">
          <span>
            <CheckCircleIcon width={24} /> Product added
          </span>
          <strong>M-Pesa · KES {Number(scene.data.total ?? 185).toLocaleString('en-KE')}</strong>
        </div>
      </div>
    </Shell>
  );
}

function TransactionFlow({ scene }: { scene: Scene }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = interpolate(frame, [10, 70], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const steps = [
    { icon: BanknotesIcon, label: 'Sale complete', detail: 'KES 185' },
    { icon: CubeIcon, label: 'Stock updated', detail: '−1 unit' },
    { icon: ChartBarIcon, label: 'Books posted', detail: 'Balanced' },
  ] as const;
  return (
    <Shell scene={scene} kicker="After every sale">
      <div className="transaction-visual" style={fadeStyle(frame, fps, 4)}>
        <div className="sync-ribbon">
          <SignalSlashIcon width={20} /> Saved safely offline{' '}
          <span>
            <ArrowPathIcon width={18} /> Sync ready
          </span>
        </div>
        <div className="flow-line">
          <span style={{ transform: `scaleX(${progress})` }} />
        </div>
        <div className="flow-steps">
          {steps.map(({ icon: Icon, label, detail }, index) => (
            <div className="flow-card" key={label} style={enterStyle(frame, fps, 8 + index * 10)}>
              <span className="flow-icon">
                <Icon width={34} />
              </span>
              <strong>{label}</strong>
              <small>{detail}</small>
            </div>
          ))}
        </div>
      </div>
    </Shell>
  );
}

function OfflineSync({ scene }: { scene: Scene }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rotation = interpolate(frame, [18, 80], [0, 360], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <Shell scene={scene} kicker="Offline protection">
      <div className="offline-sync-layout" style={fadeStyle(frame, fps, 3)}>
        <div className="offline-sale-card panel" style={enterStyle(frame, fps, 6)}>
          <div className="offline-sync-head">
            <span className="badge badge-warning">
              <SignalSlashIcon width={20} /> Saved offline
            </span>
            <small>Sale #0142</small>
          </div>
          <strong>Jiko Kiosk</strong>
          <div className="offline-sale-total">
            <span>M-Pesa</span>
            <b>KES {Number(scene.data.total ?? 185).toLocaleString('en-KE')}</b>
          </div>
          <div className="offline-device-status">
            <CheckCircleIcon width={20} /> Securely stored on this device
          </div>
        </div>
        <div className="offline-sync-arrow" style={{ transform: `rotate(${rotation}deg)` }}>
          <ArrowPathIcon width={52} />
        </div>
        <div className="offline-result-card panel" style={enterStyle(frame, fps, 24)}>
          <div className="offline-result-icon">
            <CloudArrowUpIcon width={42} />
          </div>
          <div>
            <small>Connection restored</small>
            <strong>Sale synchronized</strong>
          </div>
          <ul>
            <li>
              <CheckCircleIcon width={19} /> Stock updated
            </li>
            <li>
              <CheckCircleIcon width={19} /> Books posted
            </li>
          </ul>
        </div>
      </div>
    </Shell>
  );
}

function RemoteDashboard({ scene }: { scene: Scene }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const bars = [42, 58, 49, 72, 64, 88, 78];
  return (
    <Shell scene={scene} kicker="Owner overview">
      <div className="owner-dashboard" style={fadeStyle(frame, fps, 4)}>
        <div className="owner-dashboard-head">
          <span>
            <MapPinIcon width={22} /> All shops
          </span>
          <div className="location-pills">
            <b>All</b>
            <span>CBD</span>
            <span>Eastlands</span>
          </div>
        </div>
        <div className="owner-stats">
          <div>
            <small>Revenue</small>
            <strong>KES {Number(scene.data.revenue ?? 18450).toLocaleString('en-KE')}</strong>
          </div>
          <div>
            <small>Margin</small>
            <strong>KES {Number(scene.data.margin ?? 4260).toLocaleString('en-KE')}</strong>
          </div>
          <div>
            <small>Sales</small>
            <strong>{Number(scene.data.sales ?? 27)}</strong>
          </div>
        </div>
        <div className="owner-chart">
          <div className="chart-copy">
            <strong>Sales this week</strong>
            <small>Updated moments ago</small>
          </div>
          <div className="chart-bars">
            {bars.map((height, index) => (
              <span
                key={index}
                style={{ height: `${height}%`, ...enterStyle(frame, fps, 12 + index * 2) }}
              />
            ))}
          </div>
        </div>
        <div className="stock-alert">
          <CubeIcon width={22} />
          <span>
            <strong>4 products are running low</strong>
            <small>Restock before they run out</small>
          </span>
          <ArrowTrendingUpIcon width={24} />
        </div>
      </div>
    </Shell>
  );
}

function StaffPerformance({ scene }: { scene: Scene }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const people = [
    ['Wanjiru', '42 sales', 'KES 28,640', '+14%'],
    ['Amina', '36 sales', 'KES 24,120', '+8%'],
    ['Otieno', '31 sales', 'KES 19,870', '+5%'],
  ] as const;
  return (
    <Shell scene={scene} kicker="Team performance">
      <div className="performance-layout" style={fadeStyle(frame, fps, 4)}>
        <div className="performance-table panel">
          <div className="performance-heading">
            <span>Staff performance</span>
            <small>This month</small>
          </div>
          {people.map(([name, sales, revenue, change], index) => (
            <div
              className="performance-row"
              key={name}
              style={enterStyle(frame, fps, 8 + index * 5)}
            >
              <span className="avatar">{name.slice(0, 1)}</span>
              <span>
                <strong>{name}</strong>
                <small>{sales}</small>
              </span>
              <b>{revenue}</b>
              <em>{change}</em>
            </div>
          ))}
        </div>
        <div className="commission-card panel" style={enterStyle(frame, fps, 22)}>
          <span className="overview-icon overview-icon-primary">
            <BanknotesIcon width={30} />
          </span>
          <small>Draft commission</small>
          <strong>KES {Number(scene.data.commission ?? 2780).toLocaleString('en-KE')}</strong>
          <span className="commission-status">
            <CheckCircleIcon width={20} /> Ready to review
          </span>
        </div>
      </div>
    </Shell>
  );
}

function CustomerComms({ scene }: { scene: Scene }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <Shell scene={scene} kicker="Credit records">
      <div className="comms-layout" style={fadeStyle(frame, fps, 4)}>
        <div className="credit-summary panel">
          <div className="credit-summary-head">
            <strong>Credit position</strong>
            <span>On record</span>
          </div>
          <div className="credit-position-row">
            <span className="credit-position-icon credit-position-in">
              <UsersIcon width={23} />
            </span>
            <div className="credit-position-copy">
              <small>Customers owe you</small>
              <span>12 balances</span>
            </div>
            <strong>
              KES {Number(scene.data.customerBalance ?? 6200).toLocaleString('en-KE')}
            </strong>
          </div>
          <div className="credit-position-row">
            <span className="credit-position-icon credit-position-out">
              <CubeIcon width={23} />
            </span>
            <div className="credit-position-copy">
              <small>You owe suppliers</small>
              <span>3 suppliers</span>
            </div>
            <strong>
              KES {Number(scene.data.supplierBalance ?? 18400).toLocaleString('en-KE')}
            </strong>
          </div>
          <div className="credit-summary-foot">
            <CheckCircleIcon width={18} /> Every payment linked to a balance
          </div>
        </div>
        <div className="message-phone">
          <div className="message-phone-head">
            <ChatBubbleLeftRightIcon width={24} />
            <span>Jane Mwangi</span>
            <b>WhatsApp</b>
          </div>
          <div className="message-thread">
            <div className="message-bubble" style={enterStyle(frame, fps, 10)}>
              <strong>Receipt ready</strong>
              <span>Thank you for shopping at Jiko Kiosk.</span>
              <small>10:42</small>
            </div>
            <div className="message-bubble message-bubble-later" style={enterStyle(frame, fps, 22)}>
              <strong>Friendly reminder</strong>
              <span>Your balance is KES 2,450.</span>
              <small>14:05 · Delivered</small>
            </div>
          </div>
          <div className="channel-row">
            <span>SMS</span>
            <span className="active">WhatsApp</span>
            <b>Sent automatically</b>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function CreditAccounts({ scene }: { scene: Scene }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const accounts = [
    {
      icon: UsersIcon,
      type: 'Customer account',
      name: 'Jane Mwangi',
      balance: Number(scene.data.customerBalance ?? 6200),
      balanceLabel: 'Owes you',
      payment: 'KES 1,200 payment',
      date: 'Today · Allocated',
      tone: 'in',
    },
    {
      icon: CubeIcon,
      type: 'Supplier account',
      name: 'Bidhaa Wholesale',
      balance: Number(scene.data.supplierBalance ?? 18400),
      balanceLabel: 'You owe',
      payment: 'KES 6,000 payment',
      date: 'Yesterday · Allocated',
      tone: 'out',
    },
  ] as const;
  return (
    <Shell scene={scene} kicker="Credit accounts">
      <div className="credit-accounts-layout" style={fadeStyle(frame, fps, 3)}>
        {accounts.map(
          ({ icon: Icon, type, name, balance, balanceLabel, payment, date, tone }, index) => (
            <div
              className={`credit-account-card credit-account-${tone}`}
              key={type}
              style={enterStyle(frame, fps, 6 + index * 9)}
            >
              <div className="credit-account-head">
                <span>
                  <Icon width={26} />
                </span>
                <div>
                  <small>{type}</small>
                  <strong>{name}</strong>
                </div>
                <b>On record</b>
              </div>
              <div className="credit-account-balance">
                <small>{balanceLabel}</small>
                <strong>KES {balance.toLocaleString('en-KE')}</strong>
              </div>
              <div className="credit-payment-row">
                <span className="credit-payment-icon">
                  <BanknotesIcon width={23} />
                </span>
                <div>
                  <strong>{payment}</strong>
                  <small>{date}</small>
                </div>
                <CheckCircleIcon width={24} />
              </div>
            </div>
          )
        )}
      </div>
    </Shell>
  );
}

function CustomerReminders({ scene }: { scene: Scene }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const balance = Number(scene.data.balance ?? 2450).toLocaleString('en-KE');
  return (
    <Shell scene={scene} kicker="Customer communication">
      <div className="reminder-layout" style={fadeStyle(frame, fps, 3)}>
        <div className="reminder-schedule panel" style={enterStyle(frame, fps, 6)}>
          <div className="reminder-schedule-head">
            <span className="overview-icon overview-icon-primary">
              <ChatBubbleLeftRightIcon width={29} />
            </span>
            <div>
              <small>Scheduled reminder</small>
              <strong>Jane Mwangi</strong>
            </div>
          </div>
          <div className="reminder-details">
            <span>
              <small>Balance</small>
              <strong>KES {balance}</strong>
            </span>
            <span>
              <small>Send</small>
              <strong>Today · 2:00 PM</strong>
            </span>
          </div>
          <div className="reminder-channels">
            <span>SMS</span>
            <span className="active">WhatsApp</span>
            <b>Automatic</b>
          </div>
        </div>
        <div className="reminder-phone" style={enterStyle(frame, fps, 18)}>
          <div className="reminder-phone-head">
            <ChatBubbleLeftRightIcon width={24} />
            <strong>Jane Mwangi</strong>
            <span>WhatsApp</span>
          </div>
          <div className="reminder-message">
            <small>Jiko Kiosk</small>
            <strong>Payment reminder</strong>
            <p>Your current balance is KES {balance}. Thank you.</p>
            <span>14:05 · Delivered</span>
          </div>
          <div className="reminder-receipt-status">
            <CheckCircleIcon width={20} /> Amount and customer verified
          </div>
        </div>
      </div>
    </Shell>
  );
}

function StockOperations({ scene }: { scene: Scene }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const movements = [
    {
      icon: CubeIcon,
      label: 'Purchase received',
      detail: 'Bidhaa Wholesale · 48 units',
      status: 'Stock added',
    },
    {
      icon: MapPinIcon,
      label: 'Location transfer',
      detail: 'CBD to Eastlands · 12 units',
      status: 'In transit',
    },
    {
      icon: ArrowPathIcon,
      label: 'Stock adjustment',
      detail: '2 damaged units · Reason recorded',
      status: 'Updated',
    },
  ] as const;
  return (
    <Shell scene={scene} kicker="Stock and supply">
      <div className="stock-operations-layout" style={fadeStyle(frame, fps, 3)}>
        <div className="stock-operations-head">
          <span>Latest stock movements</span>
          <b>All locations</b>
        </div>
        {movements.map(({ icon: Icon, label, detail, status }, index) => (
          <div
            className="stock-operation-row"
            key={label}
            style={enterStyle(frame, fps, 7 + index * 7)}
          >
            <span className="stock-operation-icon">
              <Icon width={27} />
            </span>
            <div>
              <strong>{label}</strong>
              <small>{detail}</small>
            </div>
            <b>{status}</b>
          </div>
        ))}
        <div className="stock-operations-foot">
          <CheckCircleIcon width={21} /> Every movement updates the location balance
        </div>
      </div>
    </Shell>
  );
}

function OperationsSnapshot({ scene }: { scene: Scene }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const groups = [
    {
      icon: ShieldCheckIcon,
      title: 'Controls',
      items: ['Approvals', 'Roles & permissions', 'Audit trail'],
    },
    {
      icon: CubeIcon,
      title: 'Stock & supply',
      items: ['Purchases & suppliers', 'Stock adjustments', 'Location transfers'],
    },
    {
      icon: BanknotesIcon,
      title: 'Money',
      items: ['Expenses', 'Cash transfers', 'Customer & supplier credit'],
    },
    {
      icon: ChartBarIcon,
      title: 'Planning',
      items: ['Reports', 'Proformas', 'Ledger & periods'],
    },
  ] as const;

  return (
    <Shell scene={scene} kicker="Business controls">
      <div className="operations-board" style={fadeStyle(frame, fps, 3)}>
        {groups.map(({ icon: Icon, title, items }, index) => (
          <div className="operation-card" key={title} style={enterStyle(frame, fps, 7 + index * 4)}>
            <span className="operation-icon">
              <Icon width={30} />
            </span>
            <div className="operation-card-copy">
              <strong>{title}</strong>
              <div className="operation-items">
                {items.map(item => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}

function CtaWordmark() {
  return (
    <div className="cta-wordmark" aria-label="Dukarun">
      <svg className="cta-logo-mark" viewBox="0 6 48 52" aria-hidden="true">
        <rect x="0" y="6" width="48" height="52" rx="10" fill="currentColor" />
        <rect x="22" y="20" width="16" height="28" rx="8" fill="#e85d2f" />
        <rect x="4" y="10" width="40" height="4" rx="2" fill="#e85d2f" opacity=".34" />
      </svg>
      <span>dukarun</span>
    </div>
  );
}

function Cta({ scene }: { scene: Scene }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div className="scene-shell cta-scene">
      <div className="cta-content" style={enterStyle(frame, fps)}>
        <CtaWordmark />
        <h1 className="scene-title cta-title">{scene.headline}</h1>
        <p className="cta-body">{scene.body}</p>
        <div className="cta-button">Get started</div>
      </div>
    </div>
  );
}

export function SceneRenderer({ scene, target }: { scene: Scene; target: RenderTarget }) {
  const content = (() => {
    switch (scene.template) {
      case 'business-operations':
        return <BusinessOperations scene={scene} />;
      case 'records-breakdown':
        return <RecordsBreakdown scene={scene} />;
      case 'dukarun-transition':
        return <DukarunTransition scene={scene} />;
      case 'overview-hook':
        return <OverviewHook scene={scene} />;
      case 'barcode-sale':
        return <BarcodeSale scene={scene} />;
      case 'transaction-flow':
        return <TransactionFlow scene={scene} />;
      case 'remote-dashboard':
        return <RemoteDashboard scene={scene} />;
      case 'staff-performance':
        return <StaffPerformance scene={scene} />;
      case 'customer-comms':
        return <CustomerComms scene={scene} />;
      case 'operations-snapshot':
        return <OperationsSnapshot scene={scene} />;
      case 'offline-sync':
        return <OfflineSync scene={scene} />;
      case 'credit-accounts':
        return <CreditAccounts scene={scene} />;
      case 'customer-reminders':
        return <CustomerReminders scene={scene} />;
      case 'stock-operations':
        return <StockOperations scene={scene} />;
      case 'brand-hook':
        return <BrandHook scene={scene} />;
      case 'phone-pos':
        return <PhonePos scene={scene} />;
      case 'offline-state':
        return <OfflineState scene={scene} />;
      case 'sync-state':
        return <SyncState scene={scene} />;
      case 'receipt':
        return <Receipt scene={scene} />;
      case 'ledger-posting':
        return <LedgerPosting scene={scene} />;
      case 'dashboard-summary':
        return <Dashboard scene={scene} />;
      case 'cta':
        return <Cta scene={scene} />;
    }
  })();
  return <div className={target}>{content}</div>;
}
