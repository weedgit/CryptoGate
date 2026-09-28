import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("Invite member modal", () => {
  it("uses the Edit member look: gold header with waves, field controls, owner-acct footer", () => {
    const m = read("src/shared/InviteMemberModal.tsx");
    assert.match(m, /className="org-edit__head"/);
    assert.match(m, /className="org-edit__head-icon"/);
    assert.match(m, /className="org-edit__waves"/);
    assert.match(m, /className="org-edit__close"/);
    assert.match(m, /<FieldControl icon="mail">/);
    assert.match(m, /<FieldControl icon="user">/);
    assert.match(m, /className="owner-acct__foot"/);
    assert.match(m, /className="org-edit__cancel"/);
    assert.match(m, /className="owner-acct__save"/);
    assert.match(m, /<InviteCredentialsPanel/);
  });

  it("replaces the old b3-invite-modal in all three team pages", () => {
    for (const p of [
      "src/merchant/TeamSettingsPage.tsx",
      "src/platform/PlatformTeamPage.tsx",
      "src/platform/OrgTeamRoster.tsx",
    ]) {
      const src = read(p);
      assert.match(src, /<InviteMemberModal/);
      assert.doesNotMatch(src, /b3-invite-modal/);
    }
    assert.match(read("src/platform/OrgTeamRoster.tsx"), /submitLabel=\{isCashiers \? "Invite cashier" : "Invite"\}/);
  });

  it("is a narrow single-column dialog", () => {
    const css = read("src/styles/merchant/22-org-detail.css");
    assert.match(css, /\.b3-owner-edit\.invite-member-modal \{\s*width: min\(520px/);
  });
});
