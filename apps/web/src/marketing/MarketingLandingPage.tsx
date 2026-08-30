import { useState } from "react";
import { Link } from "react-router-dom";
import { GateLogoMark } from "./GateLogoMark";
import { MarketingBackground } from "./MarketingBackground";
import { MarketingOrderCard } from "./MarketingOrderCard";
import "./marketing.css";

const PILLARS = [
  {
    code: "01",
    title: "Watch-only collection",
    body: "Payers send USDT to the merchant wallet. CryptoGate never holds spend keys or moves funds.",
  },
  {
    code: "02",
    title: "Honest order state",
    body: "Pending → Verifying → Completed only after real chain confirmations — never “paid” from the browser alone.",
  },
  {
    code: "03",
    title: "Built for the counter",
    body: "Merchant web, cashier POS, matching modes, and signed webhooks for hotels, travel, and retail.",
  },
] as const;

const AUDIENCES = [
  "Hotels & hospitality",
  "Travel & transport",
  "Retail counters",
  "Multi-location merchants",
  "Agent channel partners",
] as const;

const STATS = [
  { k: "Live rail", v: "USDT · Tron", teal: true },
  { k: "Matching", v: "Modes B · C · S", teal: false },
  { k: "Confirmations", v: "19 on Tron", teal: false },
  { k: "Portals", v: "Merchant · Agent · Platform", teal: false },
] as const;

export function MarketingLandingPage() {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className={`marketing-shell${navOpen ? " is-nav-open" : ""}`}>
      <MarketingBackground />
      <header className="marketing-nav">
        <Link className="marketing-nav__brand" to="/">
          <GateLogoMark size={36} />
          <span className="marketing-nav__name">CryptoGate</span>
        </Link>
        <button
          type="button"
          className={`marketing-nav__menu-btn${navOpen ? " is-open" : ""}`}
          aria-label={navOpen ? "Close menu" : "Open menu"}
          aria-expanded={navOpen}
          onClick={() => setNavOpen((v) => !v)}
        >
          <span aria-hidden />
          <span aria-hidden />
          <span aria-hidden />
        </button>
        <div className="marketing-nav__actions">
          <a
            className="marketing-nav__link"
            href="#product"
            onClick={() => setNavOpen(false)}
          >
            Product
          </a>
          <Link
            className="marketing-btn-primary"
            to="/login"
            onClick={() => setNavOpen(false)}
          >
            Sign in
          </Link>
        </div>
      </header>

      <section className="marketing-hero" aria-labelledby="marketing-hero-title">
        <div className="marketing-hero__copy">
          <p className="marketing-eyebrow">B2B · Non-custodial · USDT / Tron</p>
          <h1 id="marketing-hero-title" className="marketing-hero__title">
            Collect crypto at the counter —{" "}
            <em>watch-only</em>, merchant-controlled
          </h1>
          <p className="marketing-hero__lead">
            CryptoGate creates payment orders, shows QR and pay links, watches
            the chain, and reconciles status. Platform revenue is billed
            separately on service bills — never skimmed from the payer&apos;s
            on-chain payment.
          </p>
          <div className="marketing-hero__ctas">
            <Link className="marketing-btn-primary" to="/login">
              Sign in to your portal
            </Link>
            <a className="marketing-btn-secondary" href="#product">
              See how it works
            </a>
          </div>
        </div>

        <div className="marketing-hero__aside">
          <div className="marketing-hero__visual">
            <MarketingOrderCard />
          </div>
          <div className="marketing-stats" aria-label="Platform highlights">
            {STATS.map((stat) => (
              <article key={stat.k} className="marketing-stat">
                <p className="marketing-stat__k">{stat.k}</p>
                <p
                  className={
                    stat.teal
                      ? "marketing-stat__v marketing-stat__v--teal"
                      : "marketing-stat__v"
                  }
                >
                  {stat.v}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        id="product"
        className="marketing-section"
        aria-labelledby="marketing-product-title"
      >
        <div className="marketing-section__head">
          <h2 id="marketing-product-title" className="marketing-section__title">
            Payment orders, not custody
          </h2>
          <p className="marketing-section__sub">
            Phase 1 is merchant collection software: org hierarchy, cashier
            access, chain watcher, and separate service-bill billing for
            platform fees.
          </p>
        </div>

        <div className="marketing-pillars">
          {PILLARS.map((pillar) => (
            <article key={pillar.code} className="marketing-pillar">
              <div className="marketing-pillar__icon">{pillar.code}</div>
              <h3 className="marketing-pillar__title">{pillar.title}</h3>
              <p className="marketing-pillar__body">{pillar.body}</p>
            </article>
          ))}
        </div>

        <p className="marketing-trust">
          <strong>Two rails, never merged:</strong> customer{" "}
          <strong>payment orders</strong> go to the merchant wallet;{" "}
          <strong>service bills</strong> pay for CryptoGate software separately.
        </p>
      </section>

      <section
        className="marketing-section"
        aria-labelledby="marketing-audience-title"
      >
        <div className="marketing-section__head">
          <h2 id="marketing-audience-title" className="marketing-section__title">
            Who it&apos;s for
          </h2>
          <p className="marketing-section__sub">
            Operators who need USDT collection with role isolation — cashiers
            create orders; owners control settlement and matching mode.
          </p>
        </div>
        <div className="marketing-audience">
          {AUDIENCES.map((label) => (
            <span key={label} className="marketing-audience__pill">
              {label}
            </span>
          ))}
        </div>
      </section>

      <section
        className="marketing-section marketing-section--cta"
        aria-labelledby="marketing-cta-title"
      >
        <div className="marketing-cta-band">
          <div>
            <h2 id="marketing-cta-title" className="marketing-section__title">
              Ready to collect?
            </h2>
            <p className="marketing-section__sub">
              Sign in to the merchant, agent, or platform portal. Guest payment
              links stay public — no account required for payers.
            </p>
          </div>
          <Link className="marketing-btn-primary" to="/login">
            Sign in to your portal
          </Link>
        </div>
      </section>

      <footer className="marketing-footer">
        <span>CryptoGate — watch-only merchant collection</span>
        <span>
          <a href="mailto:support@cryptogate.io">support@cryptogate.io</a>
          {" · "}
          <Link to="/login">Sign in</Link>
        </span>
      </footer>
    </div>
  );
}
