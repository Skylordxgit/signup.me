import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LoginForm } from "../components/LoginForm";

test("login only shows the signup entry point when master signup is enabled", () => {
  assert.match(renderToStaticMarkup(<LoginForm signupEnabled />), /Sign Up/);
  assert.doesNotMatch(renderToStaticMarkup(<LoginForm signupEnabled={false} />), /Sign Up/);
});
