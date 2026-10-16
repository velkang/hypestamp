import { Link } from "react-router";

export function Brand() {
  return <Link to="/" className="brand" aria-label="Hypestamp home"><img src="/logo.svg" alt="" width="31" height="46" /><span>Hypestamp</span></Link>;
}
