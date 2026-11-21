import { useEffect, type ReactNode } from "react";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import styles from "./Legal.module.css";

const UPDATED = "17 November 2026";
const CONTACT = "contact@samedaydesk.com";

function LegalPage({ eyebrow, title, description, children }: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${title} | SameDayDesk`;
    const meta = document.querySelector('meta[name="description"]');
    const previous = meta?.getAttribute("content") ?? null;
    meta?.setAttribute("content", description);
    return () => {
      document.title = previousTitle;
      if (previous !== null) meta?.setAttribute("content", previous);
    };
  }, [title, description]);

  return (
    <>
      <Nav />
      <main id="main" className={styles.wrap}>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className={styles.h1}>{title}</h1>
        <p className={styles.updated}>Updated {UPDATED}</p>
        <div className={styles.body}>{children}</div>
      </main>
      <Footer />
    </>
  );
}

export function Terms() {
  return (
    <LegalPage
      eyebrow="Legal · terms"
      title="Terms of Service"
      description="The terms for SameDayDesk builds, monthly services and paid agent tools."
    >
      <section>
        <h2>1. Who you contract with</h2>
        <p>
          The checkout or written order terms identify who provides your service. Write to
          SameDayDesk at{" "}
          <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
        </p>
      </section>
      <section>
        <h2>2. Builds</h2>
        <p>
          Each build has a written scope, a fixed price and the checks it must pass, agreed before work
          starts. You pay when you order. We deliver the code, setup notes and the tests for the scoped
          path, and the code is yours.
        </p>
        <p>
          If the delivered code does not pass the agreed checks in the agreed environment, we repair
          it at no extra charge. If we cannot make it pass, we refund the price of the build.
        </p>
      </section>
      <section>
        <h2>3. Monthly services</h2>
        <p>
          Keep it working covers the workflow named in your order. It renews monthly and is billed in
          advance. You can cancel future renewals at any time. Your service continues through the
          end of the paid billing period.
        </p>
      </section>
      <section>
        <h2>4. Paid agent tools</h2>
        <p>
          Paid tools on agents.samedaydesk.com state their price in the payment terms they return
          before any payment. A call is paid in the asset and network those terms name, usually USDC on
          Base. On-chain payments are final once settled. If a paid call fails to deliver, write to us
          with the transaction and we will settle it with you.
        </p>
      </section>
      <section>
        <h2>5. Your part</h2>
        <p>
          You give us accurate information and the access the scope needs, and you are responsible for
          how you use what we deliver and for the services you connect it to. Do not send us passwords,
          private keys or card numbers by email or chat; we never ask for them.
        </p>
      </section>
      <section>
        <h2>6. Free tools</h2>
        <p>
          The free checkers and guides are offered as they are. Their results describe what a public
          address returned when it was checked.
        </p>
      </section>
      <section>
        <h2>7. Liability</h2>
        <p>
          Our total liability for any order is limited to the amount you paid for it. We are not liable
          for indirect or consequential losses, including lost profits.
        </p>
      </section>
      <section>
        <h2>8. Changes</h2>
        <p>
          We may update these terms. The version in force when you order applies to that order.
        </p>
      </section>
    </LegalPage>
  );
}

export function Privacy() {
  return (
    <LegalPage
      eyebrow="Legal · privacy"
      title="Privacy Policy"
      description="What SameDayDesk collects, why, and who processes it."
    >
      <section>
        <h2>1. Who we are</h2>
        <p>
          This notice covers the information used to run SameDayDesk. Write to us at{" "}
          <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
        </p>
      </section>
      <section>
        <h2>2. What we collect</h2>
        <ul>
          <li>Your email address and account details when you sign up or order.</li>
          <li>What you send us about your project: addresses, repositories, descriptions.</li>
          <li>The public address you enter into a free checker, and its result.</li>
          <li>Payment records. Card details go to Stripe and never reach us.</li>
          <li>Anonymous page analytics, without cookies.</li>
        </ul>
      </section>
      <section>
        <h2>3. Why</h2>
        <p>
          To deliver what you ordered, answer you, run the checks you ask for, keep accurate payment
          records and see which pages help visitors. For Keep it working, we use the workflow
          and release details you supply to run the checks and send your reports. We do not sell
          your information.
        </p>
      </section>
      <section>
        <h2>4. Who processes it</h2>
        <ul>
          <li>Supabase, for accounts and sign-in.</li>
          <li>Stripe, for card payments.</li>
          <li>PostHog, for cookieless page analytics.</li>
          <li>Resend, for email we send you.</li>
          <li>The Base network, for USDC payments, which are public on-chain records.</li>
        </ul>
      </section>
      <section>
        <h2>5. How long</h2>
        <p>
          Account and project information is kept while your account is open and for as long as tax
          and accounting rules require for orders. Ask us and we delete the rest.
        </p>
      </section>
      <section>
        <h2>6. Your choices</h2>
        <p>
          You can ask for a copy of your information, its correction or its deletion by writing to{" "}
          <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. We answer within 30 days.
        </p>
      </section>
    </LegalPage>
  );
}
