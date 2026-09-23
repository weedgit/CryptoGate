import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ownerOnboardEmailConflict,
  validatePlatformInviteEmail,
} from "../src/shared/registeredEmailInvite.ts";

function indexOf(...refs) {
  const map = new Map();
  for (const ref of refs) {
    map.set(ref.email, {
      id: ref.id,
      type: ref.type,
      name: ref.name,
      role: ref.role,
    });
  }
  return map;
}

describe("ownerOnboardEmailConflict", () => {
  it("blocks platform/agent O/A as merchant Owner", () => {
    const index = indexOf({
      email: "ops@platform.example",
      id: "p1",
      type: "platform",
      name: "Platform",
      role: "owner",
    });
    assert.match(
      ownerOnboardEmailConflict("ops@platform.example", index) ?? "",
      /cannot be the merchant or site Owner/,
    );
  });

  it("blocks any other registered email", () => {
    const index = indexOf({
      email: "other@shop.example",
      id: "m2",
      type: "merchant",
      name: "Other Shop",
      role: "owner",
    });
    assert.match(
      ownerOnboardEmailConflict("other@shop.example", index) ?? "",
      /already registered/,
    );
  });

  it("allows unused email", () => {
    assert.equal(
      ownerOnboardEmailConflict("fresh@new.example", new Map()),
      null,
    );
  });
});

describe("validatePlatformInviteEmail", () => {
  const merchantTarget = {
    targetOrgId: "m1",
    targetOrgType: "merchant",
  };

  it("allows verified-path platform/agent O/A onto merchant team", () => {
    const index = indexOf({
      email: "admin@agent.example",
      id: "a1",
      type: "agent",
      name: "Channel",
      role: "administrator",
    });
    assert.equal(
      validatePlatformInviteEmail(
        "admin@agent.example",
        index,
        merchantTarget,
      ),
      null,
    );
  });

  it("blocks platform/agent Viewer on merchant/site invite", () => {
    const index = indexOf({
      email: "view@platform.example",
      id: "p1",
      type: "platform",
      name: "Platform",
      role: "viewer",
    });
    assert.match(
      validatePlatformInviteEmail(
        "view@platform.example",
        index,
        merchantTarget,
      ) ?? "",
      /Viewer/,
    );
  });

  it("blocks unrelated registered org on merchant invite", () => {
    const index = indexOf({
      email: "peer@merchant.example",
      id: "m9",
      type: "merchant",
      name: "Peer",
      role: "owner",
    });
    assert.match(
      validatePlatformInviteEmail(
        "peer@merchant.example",
        index,
        merchantTarget,
      ) ?? "",
      /already registered/,
    );
  });

  it("blocks same-email already on target members list", () => {
    assert.match(
      validatePlatformInviteEmail("me@shop.example", new Map(), {
        ...merchantTarget,
        members: [{ email: "me@shop.example", role: "administrator" }],
      }) ?? "",
      /already a member/,
    );
  });
});
