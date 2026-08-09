import { ArrowPathIcon, CheckCircleIcon, CloudArrowUpIcon, SignalSlashIcon } from '@heroicons/react/24/outline';
import type { CSSProperties, ReactNode } from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { RenderTarget, Scene } from './schema';

const products = [['Unga wa Dola 2kg', 185], ['Mafuta 1L', 340], ['Sugar 1kg', 165], ['Airtime 100', 100]] as const;

function enterStyle(frame: number, fps: number, delay = 0): CSSProperties {
  const progress = spring({ frame: frame - delay, fps, config: { damping: 18, stiffness: 120 } });
  return { opacity: interpolate(progress, [0, 1], [0, 1]), transform: `translateY(${interpolate(progress, [0, 1], [34, 0])}px)` };
}

function Shell({ scene, children, kicker }: { scene: Scene; children: ReactNode; kicker: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return <div className="scene-shell"><div className="scene-copy" style={enterStyle(frame, fps)}><p className="scene-kicker">{kicker}</p><h1 className="scene-title">{scene.headline}</h1>{scene.body ? <p className="scene-body">{scene.body}</p> : null}</div>{children}</div>;
}

function Phone({ offline = false }: { offline?: boolean }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return <div className="phone-layout"><div className="phone" style={enterStyle(frame, fps, 6)}><div className="phone-notch" /><div className="phone-screen"><div className="phone-header"><span>Sell</span>{offline ? <span className="badge badge-warning"><SignalSlashIcon width={20} /> Offline</span> : <span className="badge badge-success"><CheckCircleIcon width={20} /> Live</span>}</div><div className="product-grid">{products.map(([name, price], index) => <div className="product-card" key={name} style={enterStyle(frame, fps, 10 + index * 3)}><div className="product-name">{name}</div><div className="product-price">{price.toLocaleString('en-KE')}</div></div>)}</div><div className="cart-bar">Record M-Pesa · KES 790</div></div></div></div>;
}

function BrandHook({ scene }: { scene: Scene }) {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  return <Shell scene={scene} kicker="Built for the network you have"><div className="hero-visual-layout"><div className="hero-visual" style={enterStyle(frame, fps, 10)}><SignalSlashIcon width={300} color="#e85d2f" strokeWidth={1.2} /></div></div></Shell>;
}

function PhonePos({ scene }: { scene: Scene }) { return <Shell scene={scene} kicker="Dukarun point of sale"><Phone offline /></Shell>; }

function OfflineState({ scene }: { scene: Scene }) {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  return <Shell scene={scene} kicker="Offline is normal"><div className="offline-card-layout"><div className="panel offline-card" style={enterStyle(frame, fps, 6)}><div className="badge badge-warning"><SignalSlashIcon width={22} /> Offline queue</div><div style={{ marginTop: 30, fontSize: 30, fontWeight: 700 }}>Sale #0142</div><div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18, fontSize: 25 }}><span>Jiko Kiosk · Wanjiru</span><strong>KES 790</strong></div><div style={{ marginTop: 26, height: 12, overflow: 'hidden', borderRadius: 8, background: '#ebebeb' }}><div style={{ width: '68%', height: '100%', background: '#eab308' }} /></div></div></div></Shell>;
}

function SyncState({ scene }: { scene: Scene }) {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig(); const rotation = interpolate(frame, [0, fps * 1.5], [0, 360]);
  return <Shell scene={scene} kicker="Back online"><div className="sync-layout"><div className="sync-visual" style={enterStyle(frame, fps)}><CloudArrowUpIcon width={230} color="#22c55e" /><ArrowPathIcon width={100} color="#3b82f6" style={{ transform: `rotate(${rotation}deg)` }} /></div></div></Shell>;
}

function Receipt({ scene }: { scene: Scene }) {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  return <Shell scene={scene} kicker="Payment complete"><div className="receipt-layout"><div className="receipt" style={enterStyle(frame, fps, 4)}><div style={{ textAlign: 'center', fontWeight: 900, letterSpacing: 2 }}>JIKO KIOSK</div><div style={{ marginTop: 6, textAlign: 'center', opacity: .6 }}>Cashier: Wanjiru</div><div className="receipt-rule" /><div className="receipt-row"><span>UNGA WA DOLA 2KG</span><span>185</span></div><div className="receipt-row"><span>MAFUTA 1L</span><span>340</span></div><div className="receipt-row"><span>SUGAR 1KG</span><span>165</span></div><div className="receipt-row"><span>AIRTIME</span><span>100</span></div><div className="receipt-rule" /><div className="receipt-row receipt-total"><span>TOTAL</span><span>790</span></div><div style={{ marginTop: 24, color: '#147a38', fontWeight: 900 }}>✓ M-PESA RECORDED</div></div></div></Shell>;
}

function LedgerPosting({ scene }: { scene: Scene }) {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  return <Shell scene={scene} kicker="Real accounting underneath"><div className="ledger-layout"><div className="panel ledger-card" style={enterStyle(frame, fps)}><div className="ledger-row" style={{ fontWeight: 800 }}><span>Account</span><span>Debit</span><span>Credit</span></div><div className="ledger-row"><span>M-Pesa</span><strong>790</strong><span>—</span></div><div className="ledger-row"><span>Sales revenue</span><span>—</span><strong>790</strong></div><div className="badge badge-success" style={{ marginTop: 24 }}><CheckCircleIcon width={22} /> Balanced</div></div></div></Shell>;
}

function Dashboard({ scene }: { scene: Scene }) {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  const values = [['Revenue', `KES ${Number(scene.data.revenue ?? 18450).toLocaleString('en-KE')}`], ['Sales', String(scene.data.sales ?? 27)], ['Margin', `KES ${Number(scene.data.margin ?? 4260).toLocaleString('en-KE')}`]];
  return <Shell scene={scene} kicker="The owner's office"><div className="dashboard" style={enterStyle(frame, fps, 4)}>{values.map(([label, value], index) => <div className="panel stat-card" key={label} style={enterStyle(frame, fps, 8 + index * 4)}><div className="stat-label">{label}</div><div className="stat-value">{value}</div></div>)}</div></Shell>;
}

function CtaWordmark() {
  return <div className="cta-wordmark" aria-label="Dukarun"><svg className="cta-logo-mark" viewBox="0 6 48 52" aria-hidden="true"><rect x="0" y="6" width="48" height="52" rx="10" fill="currentColor" /><rect x="22" y="20" width="16" height="28" rx="8" fill="#e85d2f" /><rect x="4" y="10" width="40" height="4" rx="2" fill="#e85d2f" opacity=".34" /></svg><span>dukarun</span></div>;
}

function Cta({ scene }: { scene: Scene }) {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  return <div className="scene-shell cta-scene"><div className="cta-content" style={enterStyle(frame, fps)}><CtaWordmark /><h1 className="scene-title cta-title">{scene.headline}</h1><p className="cta-body">{scene.body}</p><div className="cta-button">Get started</div></div></div>;
}

export function SceneRenderer({ scene, target }: { scene: Scene; target: RenderTarget }) {
  const content = (() => { switch (scene.template) { case 'brand-hook': return <BrandHook scene={scene} />; case 'phone-pos': return <PhonePos scene={scene} />; case 'offline-state': return <OfflineState scene={scene} />; case 'sync-state': return <SyncState scene={scene} />; case 'receipt': return <Receipt scene={scene} />; case 'ledger-posting': return <LedgerPosting scene={scene} />; case 'dashboard-summary': return <Dashboard scene={scene} />; case 'cta': return <Cta scene={scene} />; } })();
  return <div className={target}>{content}</div>;
}
