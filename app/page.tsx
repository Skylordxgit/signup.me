import Link from "next/link";

export default function Home() {
  return (
    <main className="homeShell">
      <section className="homeHero">
        <div className="brandMark">SL</div>
        <p>Self-hosted smart links</p>
        <h1>Create public contact pages from one private dashboard.</h1>
        <div className="homeActions">
          <Link href="/admin">Open Admin</Link>
          <Link href="/dr-moiz-khakiani">View Sample Page</Link>
        </div>
      </section>
    </main>
  );
}
