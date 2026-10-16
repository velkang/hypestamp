import { Link, NavLink, Outlet } from "react-router";
import { ThemeToggle } from "../lib/theme";
import { Brand } from "./Brand";

export function PublicHeader({ landing = false }: { landing?: boolean }) {
  return <header className="site-header">
    <Brand />
    <nav className="site-nav" aria-label="Main">
      {landing ? <><a href="#how-it-works">How it works</a><Link to="/reports">Reports</Link><Link to="/dashboard">Dashboard →</Link></> :
        [{ to: "/dashboard", label: "Dashboard" }, { to: "/trades", label: "Trades" }, { to: "/sources", label: "Sources" }, { to: "/reports", label: "Reports" }].map((item) => <NavLink key={item.to} to={item.to}>{item.label}</NavLink>)}
    </nav>
    <ThemeToggle />
  </header>;
}

export function SiteFooter() {
  return <footer className="site-footer"><span>Practice trades. Ethereum Sepolia testnet.</span><Link to="/rulesets">View trading rules →</Link></footer>;
}

export function AppShell() {
  return <div className="site-frame"><a className="skip-link" href="#main">Skip to content</a><PublicHeader /><main id="main" className="site-main page-stack"><Outlet /></main><SiteFooter /></div>;
}
