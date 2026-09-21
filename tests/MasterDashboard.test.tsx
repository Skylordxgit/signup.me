import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MasterDashboard } from "../components/MasterDashboard";

test("master dashboard navigation includes domains in the required order", () => {
  const html = renderToStaticMarkup(<MasterDashboard email="master@example.test" />);
  const labels = ["Overview", "Workspaces", "Domains", "All users", "Global branding", "Signup access"];
  let offset = -1;
  for (const label of labels) {
    const next = html.indexOf(label, offset + 1);
    assert.ok(next > offset, `${label} should appear after the previous navigation item`);
    offset = next;
  }
});
