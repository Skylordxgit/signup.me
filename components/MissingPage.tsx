"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, Link2, Sparkles } from "lucide-react";
import { usePathname } from "next/navigation";

export function MissingPage() {
  const pathname = usePathname();
  const requested = pathname.split("/").filter(Boolean).at(-1) || "your-name";
  const slug = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(requested) ? requested : "your-name";
  const destination = `/admin?slug=${encodeURIComponent(slug)}`;
  const rememberSlug = () => { document.cookie = `smartlink_claim=${encodeURIComponent(slug)}; Path=/; Max-Age=600; SameSite=Lax`; };

  return (
    <main className="missingPage">
      <header className="missingHeader">
        <Link href="/" className="missingBrand" aria-label="signup.me home">
          <span><Link2 size={20} /></span>
          signup.me
        </Link>
        <a href={destination} className="missingSignIn" onClick={rememberSlug}>Sign in</a>
      </header>

      <section className="missingContent">
        <div className="missingEyebrow"><Sparkles size={16} />This address needs a creator</div>
        <h1>Make <strong>/{slug}</strong> yours.</h1>
        <p>Create a polished profile, add your links, and publish it at this address in minutes.</p>
        <div className="missingActions">
          <a href={destination} className="missingPrimary" onClick={rememberSlug}>Build your page <ArrowRight size={18} /></a>
          <button type="button" onClick={() => history.back()} className="missingBack"><ArrowLeft size={18} />Go back</button>
        </div>
        <div className="missingAddress" aria-label={`Preview address signup.me/${slug}`}>
          <span>signup.me/</span><strong>{slug}</strong><i aria-hidden="true" />
        </div>
      </section>

      <footer className="missingFooter"><span>404</span> The page you requested is not published yet.</footer>
    </main>
  );
}
