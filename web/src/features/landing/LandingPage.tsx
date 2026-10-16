import { Link } from "react-router";
import { PublicHeader, SiteFooter } from "../../components/AppShell";

export function LandingPage() {
  return <div className="site-frame">
    <a className="skip-link" href="#main">Skip to content</a>
    <PublicHeader landing />
    <main id="main" className="site-main landing-main">
      <section className="landing-hero">
        <h1>A clear record of why<br className="hidden sm:block" /> an agent traded.</h1>
        <p>An agent reads crypto posts, makes paper trades, and records the evidence with Chainlink CRE.</p>
        <Link to="/dashboard" className="primary-button">Explore dashboard</Link>
        <p className="quiet-note">Practice trades. No real funds.</p>
      </section>
      <section id="how-it-works" className="landing-follow" aria-labelledby="how-heading">
        <h2 id="how-heading">Follow the evidence.</h2>
        <p>See the source posts, the decision, and the record behind each trade.</p>
        <div className="how-it-works">
          <div><h3>The source posts</h3><p>The agent reads selected voices on X and looks for calls on the same token and direction.</p></div>
          <div><h3>The trading decision</h3><p>When enough sources agree, the agent can open a paper position under rules published before they take effect.</p></div>
          <div><h3>The evidence record</h3><p>Chainlink CRE checks the cited posts and entry price. Saved inputs let a reviewer check whether the decision reproduces.</p></div>
        </div>
        <p className="quiet-note mt-8">Evidence checks and trading performance are separate. Paper exits are recorded off-chain.</p>
      </section>
    </main>
    <SiteFooter />
  </div>;
}
