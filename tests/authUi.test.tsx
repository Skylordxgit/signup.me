import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LoginForm } from "../components/LoginForm";

test("login only shows the signup entry point when master signup is enabled", () => {
  assert.match(renderToStaticMarkup(<LoginForm signupEnabled />), /Sign up/);
  assert.doesNotMatch(renderToStaticMarkup(<LoginForm signupEnabled={false} />), /Sign up/);
});

test("login shows email and password fields immediately without social login", () => {
  const html = renderToStaticMarkup(<LoginForm signupEnabled={false} />);
  assert.match(html, /name="email"/);
  assert.match(html, /name="password"/);
  assert.match(html, /Sign in to dashboard/);
  assert.doesNotMatch(html, /Google|Login with Email|Demo login|Back/);
});
