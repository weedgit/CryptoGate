import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SESSION_COOKIE_NAME,
  clearSessionCookie,
  getSessionToken,
  parseCookieHeader,
  sessionCookie,
} from "../src/http/cookies.mjs";
import { sessionFromUser } from "../src/auth/session-payload.mjs";

describe("session cookies", () => {
  it("parses cg_session from Cookie header", () => {
    const token = getSessionToken("other=1; cg_session=abc_def; x=y");
    assert.equal(token, "abc_def");
  });

  it("returns null when cookie missing", () => {
    assert.equal(getSessionToken(undefined), null);
    assert.equal(parseCookieHeader("")[SESSION_COOKIE_NAME], undefined);
  });

  it("sets HttpOnly SameSite cookie", () => {
    const line = sessionCookie("tok");
    assert.match(line, /^cg_session=tok;/);
    assert.match(line, /HttpOnly/);
    assert.match(line, /SameSite=Lax/);
    assert.match(line, /Path=\//);
  });

  it("clears cookie with Max-Age=0", () => {
    assert.match(clearSessionCookie(), /Max-Age=0/);
  });
});

describe("session payload", () => {
  it("includes memberships when provided", () => {
    const session = sessionFromUser(
      { id: "u1", email: "cashier@example.com" },
      [
        {
          orgId: "m1",
          userId: "u1",
          role: "cashier",
          orgType: "merchant",
        },
      ],
    );
    assert.equal(session.memberships[0].role, "cashier");
  });

  it("defaults memberships to empty", () => {
    const session = sessionFromUser({
      id: "u1",
      email: "cashier@example.com",
    });
    assert.deepEqual(session.memberships, []);
  });
});
