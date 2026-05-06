import type { Metadata } from 'next'
import Image from 'next/image'
import { QRCard } from '@/components/landing/QRCard'

const TELEGRAM_URL = 'https://t.me/Bevocal_bot'
const LOGIN_URL = '/sign-in'
const CONTACT_EMAIL = 'mailto:hello@bevocal.in'

export const metadata: Metadata = {
  title: 'My Leader — Your Voice, Straight to Your Leader',
  description:
    'Report civic issues directly to your MLA. No middlemen, no filters. Real on-ground intelligence for leaders and workers across AP & Telangana.',
}

/* ─── Inline SVG icons ─────────────────────────────────────────────────────── */

function IconSignal() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#CC0000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 20h.01M7 20v-4M12 20v-8M17 20V8M22 4v16"/>
    </svg>
  )
}

function IconMapPin() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#CC0000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
      <circle cx="12" cy="10" r="3"/>
    </svg>
  )
}

function IconPeople() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#CC0000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  )
}

function IconChart() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#CC0000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
      <line x1="2" y1="20" x2="22" y2="20"/>
    </svg>
  )
}

function IconTelegram() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L8.32 14.617l-2.96-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.828.942z"/>
    </svg>
  )
}

function IconArrowRight() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12"/>
      <polyline points="12 5 19 12 12 19"/>
    </svg>
  )
}

function IconCheck() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#CC0000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  )
}

/* ─── (image placeholders removed — real images wired in below) ─── */

/* ─── Page ─────────────────────────────────────────────────────────────────── */

export default function LandingPage() {
  return (
    <div className="lp-root">

      {/* ── NAV ────────────────────────────────────────────────────────── */}
      <header className="lp-nav">
        <div className="lp-container">
          <div className="lp-nav-inner">
            <a href="/" aria-label="My Leader home" className="lp-nav-logo">
              <Image src="/logo.svg" alt="My Leader" width={160} height={40} priority style={{ height: '36px', width: 'auto' }} />
            </a>
            <nav aria-label="Main navigation" className="lp-nav-links">
              <a href="#citizens" className="lp-nav-link">For Citizens</a>
              <a href="#leaders" className="lp-nav-link">For Leaders</a>
            </nav>
            <a href={LOGIN_URL} className="lp-btn-red lp-nav-cta">
              Karyakarta Login
            </a>
          </div>
        </div>
      </header>

      {/* ── HERO ────────────────────────────────────────────────────────── */}
      <section className="lp-hero">
        <div className="lp-container">
          <div className="lp-hero-grid">

            {/* Text */}
            <div className="lp-hero-text">
              <div className="lp-hero-badge">
                <span className="lp-hero-badge-dot" />
                <span>Live in AP &amp; Telangana</span>
              </div>
              <h1 className="lp-hero-h1">
                Direct line.<br />
                <span style={{ color: '#CC0000' }}>No middlemen.</span><br />
                No filters.
              </h1>
              <p className="lp-hero-sub">
                My Leader connects citizens directly to their elected representative — bypassing media spin and worker bias. Report a real problem. Get real action.
              </p>
              <div className="lp-hero-ctas">
                <a href="#citizens" className="lp-btn-red lp-btn-lg">
                  I&apos;m a Citizen <IconArrowRight />
                </a>
                <a href="#leaders" className="lp-btn-ghost lp-btn-lg">
                  I&apos;m a Leader <IconArrowRight />
                </a>
              </div>
              <div className="lp-trust-row">
                {[
                  'Telegram-based — no app needed',
                  'Telugu & English',
                  'Every issue tracked & assigned',
                ].map((item) => (
                  <div key={item} className="lp-trust-item">
                    <IconCheck />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Hero image */}
            <div className="lp-hero-img-side">
              <div className="lp-hero-img-wrapper">
                <Image
                  src="/images/citizen-hero.png"
                  alt="South Indian citizen holding smartphone on a street with civic issues — AP/Telangana"
                  fill
                  style={{ objectFit: 'cover', objectPosition: 'center top' }}
                  priority
                  sizes="(max-width: 960px) 0px, 45vw"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CITIZEN SECTION ─────────────────────────────────────────────── */}
      <section id="citizens" className="lp-section-white">
        <div className="lp-container">
          <div className="lp-section-label" style={{ color: '#CC0000' }}>FOR CITIZENS</div>
          <h2 className="lp-section-h2">
            మీ సమస్య, నేరుగా నేత దగ్గరికి.
          </h2>
          <p className="lp-section-tagline">&ldquo;Your problem. Straight to your leader.&rdquo;</p>
          <p className="lp-section-body">
            Road potholes. Water shortage. Ration card issues. Corruption. Whatever you&apos;re facing — report it directly to your representative. No middlemen. No filters. Your issue is logged, assigned, and tracked until it&apos;s resolved.
          </p>

          {/* 3 Cards */}
          <div className="lp-citizen-cards">

            {/* QR Card */}
            <div className="lp-card lp-card-hover lp-card-centered">
              <div className="lp-card-label">Scan to Start</div>
              <QRCard />
              <p className="lp-card-caption">Point your phone camera at this code — Telegram opens automatically.</p>
            </div>

            {/* Telegram Card */}
            <div className="lp-card lp-card-hover lp-card-centered">
              <div className="lp-tg-icon">
                <IconTelegram />
              </div>
              <div>
                <div className="lp-card-label">Chat Your Grievance</div>
                <p className="lp-card-body-text">
                  Send text, photos, or audio in <strong>Telugu or English</strong>. Works on any phone with Telegram.
                </p>
                <a href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer" className="lp-btn-tg">
                  <IconTelegram />
                  Start on Telegram
                </a>
              </div>
            </div>

            {/* Coming Soon Card */}
            <div className="lp-card lp-card-coming-soon lp-card-centered">
              <div className="lp-app-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="1.5" aria-hidden="true">
                  <rect x="5" y="2" width="14" height="20" rx="2"/>
                  <line x1="12" y1="18" x2="12.01" y2="18"/>
                </svg>
              </div>
              <div>
                <div className="lp-coming-soon-header">
                  <div className="lp-card-label" style={{ color: '#9CA3AF' }}>My Leader App</div>
                  <span className="lp-badge-soon">Coming Soon</span>
                </div>
                <p className="lp-card-body-text" style={{ color: '#6B7280' }}>
                  Full citizen app with live case updates, issue tracking, and direct notifications from your representative&apos;s office.
                </p>
                <button disabled aria-disabled="true" className="lp-btn-disabled">
                  Download App
                </button>
              </div>
            </div>
          </div>

          {/* Karyakarta link */}
          <div className="lp-karyakarta-row">
            <p>
              Are you a ground worker?{' '}
              <a href={LOGIN_URL} className="lp-link-red">Login as Karyakarta →</a>
            </p>
          </div>
        </div>
      </section>

      {/* ── LEADER SECTION ──────────────────────────────────────────────── */}
      <section id="leaders" className="lp-section-grey">
        <div className="lp-container">
          <div className="lp-leaders-inner">

            {/* Copy side */}
            <div className="lp-leaders-copy">
              <div className="lp-section-label" style={{ color: '#CC0000' }}>FOR LEADERS</div>
              <h2 className="lp-section-h2">
                Know What&apos;s Really Happening in Your Constituency.
              </h2>
              <p className="lp-leaders-quote">
                Not what the media says. Not what your workers tell you.
              </p>
              <p className="lp-section-body">
                What citizens are <strong>actually facing</strong> — raw, geotagged, and tracked from first report to resolution.
              </p>
              <a href={CONTACT_EMAIL} className="lp-btn-red lp-btn-lg lp-btn-shadow">
                Request Access for Your Office <IconArrowRight />
              </a>
              <div style={{ marginTop: '40px', borderRadius: '16px', overflow: 'hidden' }}>
                <Image
                  src="/images/leader-office.png"
                  alt="South Indian political leader reviewing constituency data in his office"
                  width={800}
                  height={450}
                  style={{ width: '100%', height: 'auto', display: 'block' }}
                />
              </div>
            </div>

            {/* Value props grid */}
            <div className="lp-value-props">
              {[
                {
                  icon: <IconSignal />,
                  title: 'Direct Line to Citizens',
                  body: 'Citizens report issues straight to your office. No workers diluting or filtering the message before it reaches you.',
                },
                {
                  icon: <IconMapPin />,
                  title: 'Ground Intelligence, Not Media Intelligence',
                  body: 'See real issues geotagged to specific mandals and wards. Identify sensitive zones before they become headlines.',
                },
                {
                  icon: <IconPeople />,
                  title: 'Manage Your Karyakartas',
                  body: 'Assign cases to your ground team by area. Track who is responding, who is lagging. Build real accountability.',
                },
                {
                  icon: <IconChart />,
                  title: 'Pattern Insights for Strategy',
                  body: 'Identify recurring issues by area. Plan targeted Janata Darbar stops and outreach based on actual citizen data — not assumptions.',
                },
              ].map(({ icon, title, body }) => (
                <div key={title} className="lp-vp-card">
                  <div className="lp-vp-icon">{icon}</div>
                  <div>
                    <h3 className="lp-vp-title">{title}</h3>
                    <p className="lp-vp-body">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ────────────────────────────────────────────────── */}
      <section className="lp-section-white">
        <div className="lp-container">
          <div style={{ textAlign: 'center', marginBottom: '56px' }}>
            <div className="lp-section-label" style={{ color: '#CC0000', textAlign: 'center' }}>HOW IT WORKS</div>
            <h2 className="lp-section-h2" style={{ textAlign: 'center' }}>
              Three steps from problem to action.
            </h2>
          </div>
          <div className="lp-hiw-grid">
            {[
              {
                step: '01',
                title: 'Citizen Sends a Message',
                body: 'Open Telegram, start a chat with My Leader. Send your grievance in text, photo, or audio — in Telugu or English. No forms. No queues.',
                imgSrc: '/images/ground-reality.png',
                imgAlt: 'Residents standing on a waterlogged street in AP/Telangana — a real civic issue',
              },
              {
                step: '02',
                title: 'Issue is Logged & Assigned',
                body: 'Every message creates a tracked ticket. Tagged by location, type, and severity — then assigned to the nearest available karyakarta on the ground.',
                imgSrc: '/images/karyakartas-field.png',
                imgAlt: 'Karyakartas listening to elderly villagers at their home in a rural AP/Telangana village',
              },
              {
                step: '03',
                title: 'Leader Gets Visibility. Citizen Gets an Update.',
                body: 'The leader sees real-time case status on the dashboard. The citizen receives a Telegram notification when their issue is accepted and resolved.',
                imgSrc: '/images/leader-office.png',
                imgAlt: 'Political leader reviewing constituency case data on a tablet in his office',
              },
            ].map(({ step, title, body, imgSrc, imgAlt }) => (
              <div key={step} className="lp-hiw-step">
                <div className="lp-hiw-img-wrapper">
                  <Image
                    src={imgSrc}
                    alt={imgAlt}
                    width={600}
                    height={450}
                    style={{ width: '100%', height: 'auto', display: 'block', borderRadius: '16px' }}
                  />
                </div>
                <div>
                  <span className="lp-hiw-num">{step}</span>
                  <h3 className="lp-hiw-title">{title}</h3>
                  <p className="lp-hiw-body">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA BANNER ────────────────────────────────────────────── */}
      <section className="lp-cta-banner">
        <div style={{ maxWidth: '680px', margin: '0 auto', textAlign: 'center', padding: '0 20px' }}>
          <h2 className="lp-cta-h2">Ready to make your voice count?</h2>
          <p className="lp-cta-sub">
            Start a Telegram chat and report your issue in under 60 seconds. No registration. No waiting. Your leader will know.
          </p>
          <a href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer" className="lp-btn-white-on-red">
            <IconTelegram />
            Open My Leader on Telegram
          </a>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────────────── */}
      <footer className="lp-footer">
        <div className="lp-container">
          <div className="lp-footer-grid">
            <div>
              <Image src="/logo.svg" alt="My Leader" width={140} height={36} style={{ height: '32px', width: 'auto', filter: 'brightness(0) invert(1)', marginBottom: '12px' }} />
              <p className="lp-footer-tagline">
                A civic issue platform for one organization at a time.<br />Built for AP &amp; Telangana.
              </p>
            </div>
            <div className="lp-footer-col">
              <p className="lp-footer-col-label">Navigate</p>
              <a href="#citizens" className="lp-footer-link">For Citizens</a>
              <a href="#leaders" className="lp-footer-link">For Leaders</a>
              <a href="#how" className="lp-footer-link">How It Works</a>
            </div>
            <div className="lp-footer-col">
              <p className="lp-footer-col-label">Connect</p>
              <a href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer" className="lp-footer-link lp-footer-tg">
                <IconTelegram /> @Bevocal_bot
              </a>
              <a href={CONTACT_EMAIL} className="lp-footer-link">hello@bevocal.in</a>
              <a href={LOGIN_URL} className="lp-footer-link-red">Karyakarta Login →</a>
            </div>
          </div>
          <div className="lp-footer-bottom">
            <p>© 2026 My Leader. All rights reserved.</p>
            <p>Made for the people of AP &amp; Telangana.</p>
          </div>
        </div>
      </footer>

      {/* ── STYLES ──────────────────────────────────────────────────────── */}
      <style>{`
        /* Reset for landing page */
        .lp-root {
          background: #fff;
          color: #1A1A1A;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
          font-size: 16px;
          line-height: 1.5;
        }

        /* Container */
        .lp-container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 20px;
        }

        /* ── NAV ── */
        .lp-nav {
          position: sticky;
          top: 0;
          z-index: 50;
          background: rgba(255,255,255,0.96);
          backdrop-filter: blur(8px);
          border-bottom: 1px solid #E5E7EB;
        }
        .lp-nav-inner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 64px;
          gap: 16px;
        }
        .lp-nav-logo { display: flex; align-items: center; flex-shrink: 0; text-decoration: none; }
        .lp-nav-links { display: none; gap: 32px; align-items: center; }
        .lp-nav-link {
          font-size: 15px; font-weight: 500; color: #374151;
          text-decoration: none; transition: color 150ms;
        }
        .lp-nav-link:hover { color: #CC0000; }
        .lp-nav-cta { flex-shrink: 0; }

        /* ── BUTTONS ── */
        .lp-btn-red {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 12px 24px; border-radius: 8px;
          background: #CC0000; color: #fff;
          font-size: 15px; font-weight: 700;
          text-decoration: none; min-height: 44px;
          border: none; cursor: pointer;
          transition: background 150ms, transform 150ms;
        }
        .lp-btn-red:hover { background: #AA0000; transform: translateY(-1px); }

        .lp-btn-lg { padding: 14px 28px; font-size: 16px; min-height: 52px; }

        .lp-btn-ghost {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 14px 28px; border-radius: 8px;
          background: transparent; color: #fff;
          border: 2px solid rgba(255,255,255,0.25);
          font-size: 16px; font-weight: 600;
          text-decoration: none; min-height: 52px;
          transition: border-color 150ms, background 150ms;
        }
        .lp-btn-ghost:hover {
          border-color: rgba(255,255,255,0.6);
          background: rgba(255,255,255,0.06);
        }

        .lp-btn-tg {
          display: inline-flex; align-items: center; gap: 10px;
          padding: 14px 28px; border-radius: 8px;
          background: #0088CC; color: #fff;
          font-size: 15px; font-weight: 700;
          text-decoration: none; min-height: 52px;
          transition: background 150ms;
        }
        .lp-btn-tg:hover { background: #006FAA; }

        .lp-btn-disabled {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 14px 28px; border-radius: 8px;
          background: #D1D5DB; color: #9CA3AF;
          font-size: 15px; font-weight: 600;
          border: none; cursor: not-allowed; min-height: 52px;
          opacity: 0.8;
        }

        .lp-btn-shadow { box-shadow: 0 4px 16px rgba(204,0,0,0.28); }

        .lp-btn-white-on-red {
          display: inline-flex; align-items: center; gap: 12px;
          padding: 16px 36px; border-radius: 8px;
          background: #fff; color: #CC0000;
          font-size: 17px; font-weight: 800;
          text-decoration: none; min-height: 56px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.15);
          transition: transform 150ms, box-shadow 150ms;
        }
        .lp-btn-white-on-red:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 28px rgba(0,0,0,0.20);
        }

        /* ── HERO ── */
        .lp-hero { background: #111111; color: #fff; overflow: hidden; }
        .lp-hero-grid { display: flex; flex-direction: column; }
        .lp-hero-text { padding: 64px 0 48px; display: flex; flex-direction: column; justify-content: center; }
        .lp-hero-img-side { display: none; }

        .lp-hero-badge {
          display: inline-flex; align-items: center; gap: 8px;
          background: rgba(204,0,0,0.15);
          border: 1px solid rgba(204,0,0,0.3);
          border-radius: 100px; padding: 6px 14px;
          margin-bottom: 28px; width: fit-content;
        }
        .lp-hero-badge span { font-size: 12px; font-weight: 700; color: #FCA5A5; letter-spacing: 0.06em; text-transform: uppercase; }
        .lp-hero-badge-dot {
          width: 7px; height: 7px; border-radius: 50%;
          background: #CC0000; display: inline-block;
          animation: lp-pulse 2s infinite;
        }

        .lp-hero-h1 {
          font-size: clamp(36px, 6vw, 68px);
          font-weight: 900; line-height: 1.05;
          letter-spacing: -1.5px; margin-bottom: 24px; color: #fff;
        }
        .lp-hero-sub {
          font-size: clamp(16px, 2vw, 19px);
          line-height: 1.65; color: #9CA3AF;
          margin-bottom: 40px; max-width: 480px;
        }
        .lp-hero-ctas { display: flex; gap: 16px; flex-wrap: wrap; }
        .lp-trust-row {
          display: flex; gap: 20px; margin-top: 40px;
          flex-wrap: wrap;
        }
        .lp-trust-item {
          display: flex; align-items: center; gap: 8px;
          font-size: 13px; color: #6B7280;
        }

        /* ── SECTIONS ── */
        .lp-section-white { background: #FFFFFF; padding: 80px 0; }
        .lp-section-grey  { background: #F7F7F7; padding: 80px 0; }

        .lp-section-label {
          font-size: 12px; font-weight: 700; letter-spacing: 0.12em;
          text-transform: uppercase; margin-bottom: 12px;
        }
        .lp-section-h2 {
          font-size: clamp(28px, 4vw, 48px);
          font-weight: 900; letter-spacing: -0.5px;
          line-height: 1.1; color: #111111; margin-bottom: 16px;
        }
        .lp-section-tagline { font-size: 17px; color: #374151; font-style: italic; margin-bottom: 20px; }
        .lp-section-body { font-size: 17px; line-height: 1.7; color: #4B5563; max-width: 620px; margin-bottom: 48px; }

        /* ── CITIZEN CARDS ── */
        .lp-citizen-cards {
          display: grid;
          grid-template-columns: 1fr;
          gap: 20px;
        }
        .lp-card {
          background: #fff;
          border: 1.5px solid #E5E7EB;
          border-radius: 16px;
          padding: 32px 24px;
          display: flex; flex-direction: column; gap: 20px;
          box-shadow: 0 2px 12px rgba(0,0,0,0.06);
          transition: box-shadow 200ms, transform 200ms;
        }
        .lp-card-centered { align-items: center; text-align: center; }
        .lp-card-hover:hover {
          box-shadow: 0 8px 32px rgba(204,0,0,0.10);
          transform: translateY(-2px);
        }
        .lp-card-coming-soon {
          background: #F9FAFB; opacity: 0.8;
        }
        .lp-card-label {
          font-size: 12px; font-weight: 700; letter-spacing: 0.1em;
          text-transform: uppercase; color: #CC0000;
        }
        .lp-card-caption { font-size: 14px; color: #6B7280; }
        .lp-card-body-text { font-size: 15px; line-height: 1.65; color: #4B5563; margin-bottom: 20px; }

        .lp-tg-icon {
          width: 72px; height: 72px; border-radius: 50%;
          background: #0088CC;
          display: flex; align-items: center; justify-content: center;
          color: #fff; flex-shrink: 0;
        }
        .lp-app-icon {
          width: 72px; height: 72px; border-radius: 18px;
          background: #E5E7EB;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .lp-coming-soon-header {
          display: flex; align-items: center; justify-content: center;
          gap: 10px; margin-bottom: 10px;
        }
        .lp-badge-soon {
          font-size: 10px; font-weight: 700; letter-spacing: 0.08em;
          text-transform: uppercase; background: #FEF3C7; color: #92400E;
          padding: 3px 8px; border-radius: 100px; border: 1px solid #FCD34D;
        }

        /* Karyakarta row */
        .lp-karyakarta-row {
          text-align: center; margin-top: 48px;
          padding-top: 32px; border-top: 1px solid #E5E7EB;
          font-size: 15px; color: #6B7280;
        }
        .lp-link-red {
          color: #CC0000; font-weight: 600;
          text-decoration: none; border-bottom: 1px solid currentColor;
        }
        .lp-link-red:hover { color: #AA0000; }

        /* ── LEADERS ── */
        .lp-leaders-inner { display: flex; flex-direction: column; gap: 48px; }
        .lp-leaders-copy { flex: 1 1 400px; min-width: 0; }
        .lp-leaders-quote {
          font-size: 18px; line-height: 1.65; color: #4B5563;
          font-style: italic; border-left: 3px solid #CC0000;
          padding-left: 16px; margin-bottom: 16px;
        }
        .lp-leader-img { min-height: 240px; }

        /* Value props */
        .lp-value-props {
          flex: 1 1 420px; min-width: 0;
          display: grid; grid-template-columns: 1fr; gap: 16px;
        }
        .lp-vp-card {
          background: #fff; border: 1.5px solid #E5E7EB;
          border-radius: 14px; padding: 24px;
          display: flex; flex-direction: column; gap: 12px;
          transition: box-shadow 200ms, border-color 200ms;
        }
        .lp-vp-card:hover {
          box-shadow: 0 6px 24px rgba(204,0,0,0.08);
          border-color: #FCA5A5;
        }
        .lp-vp-icon {
          width: 52px; height: 52px; border-radius: 12px;
          background: #FEF2F2;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .lp-vp-title { font-size: 16px; font-weight: 700; color: #111111; margin-bottom: 6px; }
        .lp-vp-body  { font-size: 14px; line-height: 1.65; color: #6B7280; }

        /* ── HOW IT WORKS ── */
        .lp-hiw-grid { display: grid; grid-template-columns: 1fr; gap: 48px; }
        .lp-hiw-step { display: flex; flex-direction: column; gap: 20px; }
        .lp-hiw-img  { aspect-ratio: 4 / 3; }
        .lp-hiw-num  {
          font-size: 56px; font-weight: 900; color: #F3F4F6;
          line-height: 1; display: block; margin-bottom: 8px;
        }
        .lp-hiw-title { font-size: 19px; font-weight: 700; color: #111111; margin-bottom: 10px; line-height: 1.3; }
        .lp-hiw-body  { font-size: 15px; line-height: 1.7; color: #6B7280; }

        /* ── CTA BANNER ── */
        .lp-cta-banner { background: #CC0000; padding: 72px 0; }
        .lp-cta-h2 {
          font-size: clamp(26px, 4vw, 40px);
          font-weight: 900; color: #fff;
          letter-spacing: -0.5px; margin-bottom: 16px;
        }
        .lp-cta-sub { font-size: 17px; color: rgba(255,255,255,0.82); margin-bottom: 36px; line-height: 1.65; }

        /* ── FOOTER ── */
        .lp-footer { background: #1A1A1A; color: #9CA3AF; padding: 56px 0 32px; }
        .lp-footer-grid {
          display: grid; grid-template-columns: 1fr; gap: 36px;
        }
        .lp-footer-tagline { font-size: 14px; line-height: 1.65; color: #6B7280; margin-top: 12px; }
        .lp-footer-col { display: flex; flex-direction: column; gap: 12px; }
        .lp-footer-col-label {
          font-size: 11px; font-weight: 700; letter-spacing: 0.1em;
          text-transform: uppercase; color: #4B5563; margin-bottom: 4px;
        }
        .lp-footer-link {
          font-size: 14px; color: #9CA3AF; text-decoration: none;
          transition: color 150ms;
        }
        .lp-footer-link:hover { color: #fff; }
        .lp-footer-tg {
          display: flex; align-items: center; gap: 8px;
        }
        .lp-footer-tg:hover { color: #0088CC !important; }
        .lp-footer-link-red {
          font-size: 14px; color: #CC0000; font-weight: 600;
          text-decoration: none; transition: color 150ms;
        }
        .lp-footer-link-red:hover { color: #EF4444; }
        .lp-footer-bottom {
          border-top: 1px solid #2D2D2D; margin-top: 40px; padding-top: 24px;
          display: flex; align-items: center; justify-content: space-between;
          flex-wrap: wrap; gap: 12px; font-size: 13px; color: #4B5563;
        }

        /* ── HERO IMAGE ── */
        .lp-hero-img-wrapper {
          position: relative; width: 100%; height: 100%;
          min-height: 460px; border-radius: 16px; overflow: hidden;
        }

        /* ── HIW IMAGE ── */
        .lp-hiw-img-wrapper { border-radius: 16px; overflow: hidden; }
        .lp-hiw-img { min-height: 200px; }

        /* ── ANIMATIONS ── */
        @keyframes lp-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.35; }
        }

        /* ── RESPONSIVE ── */
        @media (min-width: 768px) {
          .lp-nav-links { display: flex; }

          .lp-citizen-cards { grid-template-columns: repeat(3, 1fr); align-items: start; }

          .lp-footer-grid { grid-template-columns: 2fr 1fr 1fr; gap: 48px; }

          .lp-hiw-grid { grid-template-columns: repeat(3, 1fr); gap: 32px; align-items: start; }

          .lp-value-props { grid-template-columns: repeat(2, 1fr); }
        }

        @media (min-width: 960px) {
          .lp-hero-grid {
            flex-direction: row; align-items: stretch;
            min-height: 600px; gap: 48px;
          }
          .lp-hero-text { flex: 0 0 55%; padding: 80px 0; }
          .lp-hero-img-side {
            display: flex; flex: 1;
            align-items: stretch; padding: 40px 0;
          }
          .lp-hero-img-placeholder { border-radius: 16px; }

          .lp-leaders-inner { flex-direction: row; align-items: flex-start; gap: 64px; }
          .lp-leader-img { min-height: 280px; }
        }

        /* Smooth scroll */
        html { scroll-behavior: smooth; }
      `}</style>
    </div>
  )
}
