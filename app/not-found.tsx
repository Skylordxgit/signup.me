import Link from "next/link";

export default function NotFound() {
  return (
    <main className="notFound">
      <div>
        <p>404</p>
        <h1>This public page is not available.</h1>
        <span>The slug may be missing, disabled, or unpublished.</span>
        <Link href="/">Return home</Link>
      </div>
    </main>
  );
}
