import Link from "next/link";
import { getDemoMode } from "@/lib/server/demo";

function Mark() {
  return (
    <svg viewBox="0 0 24 24" className="size-7" aria-hidden>
      <rect width="24" height="24" rx="7" fill="#4338ca" />
      <path d="M7 16.5 15.5 8M9 8h6.5v6.5" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Header navigation. In broken mode the "Pricing" item points to the wrong page. */
export async function DemoHeader() {
  const mode = await getDemoMode();
  const pricingHref = mode === "broken" ? "/demo/about" : "/demo/pricing";
  const links = [
    { href: "/demo/features", label: "Features" },
    { href: pricingHref, label: "Pricing" },
    { href: "/demo/about", label: "About" },
    { href: "/demo/contact", label: "Contact" },
  ];
  return (
    <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/demo" className="flex items-center gap-2 font-semibold text-slate-900">
          <Mark /> Quillstack
        </Link>
        <nav aria-label="Main navigation" className="flex items-center gap-1 overflow-x-auto text-sm sm:gap-2">
          {links.map((l) => (
            <Link key={l.label} href={l.href} className="rounded-md px-2.5 py-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900">
              {l.label}
            </Link>
          ))}
          <Link href="/demo/signup" className="ml-1 hidden rounded-md bg-indigo-600 px-3 py-1.5 font-medium text-white hover:bg-indigo-500 sm:inline-block">
            Sign up
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function DemoHeaderFallback() {
  return <div className="h-16 border-b border-slate-200 bg-white" />;
}

export function DemoFooter() {
  return (
    <footer className="border-t border-slate-200 bg-slate-50">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm sm:grid-cols-4 sm:px-6">
        <div>
          <p className="font-semibold text-slate-900">Quillstack</p>
          <p className="mt-2 text-slate-500">Shared notes for fast-moving teams.</p>
        </div>
        <div>
          <p className="font-medium text-slate-900">Product</p>
          <ul className="mt-2 space-y-1.5 text-slate-600">
            <li><Link href="/demo/features" className="hover:text-indigo-600">Features</Link></li>
            <li><Link href="/demo/pricing" className="hover:text-indigo-600">Pricing</Link></li>
            <li><Link href="/demo/docs" className="hover:text-indigo-600">Documentation</Link></li>
          </ul>
        </div>
        <div>
          <p className="font-medium text-slate-900">Company</p>
          <ul className="mt-2 space-y-1.5 text-slate-600">
            <li><Link href="/demo/about" className="hover:text-indigo-600">About</Link></li>
            <li><Link href="/demo/contact" className="hover:text-indigo-600">Contact</Link></li>
          </ul>
        </div>
        <div>
          <p className="font-medium text-slate-900">Legal</p>
          <ul className="mt-2 space-y-1.5 text-slate-600">
            <li><Link href="/demo/privacy" className="hover:text-indigo-600">Privacy policy</Link></li>
          </ul>
        </div>
      </div>
      <p className="border-t border-slate-200 py-4 text-center text-xs text-slate-400">
        © 2026 Quillstack (fictional demo company for CECH)
      </p>
    </footer>
  );
}
