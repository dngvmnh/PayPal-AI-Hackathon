import Link from "next/link";
import { SampleButton } from "./components/SampleButton.tsx";

export default function NotFound() {
  return (
    <div className="panel empty">
      <h1>This order isn&apos;t here</h1>
      <p className="muted">
        The hosted demo runs on a free instance, so stored orders reset when it sleeps or redeploys. Load the sample
        again to pick the flow back up.
      </p>
      <div className="row" style={{ justifyContent: "center" }}>
        <SampleButton />
        <Link href="/" className="button">
          All orders
        </Link>
      </div>
    </div>
  );
}
