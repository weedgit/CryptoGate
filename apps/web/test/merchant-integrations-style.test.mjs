import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

describe("merchant integrations project style", () => {
  it("uses the Settlement gold section heads for keys, webhooks and history", () => {
    const page = read("src/merchant/IntegrationsPage.tsx");
    assert.match(page, /<SettlementSectionHead\s+icon="key"\s+title="API keys"/);
    assert.match(page, /<SettlementSectionHead\s+icon="webhook"\s+title="Webhooks"/);
    assert.match(page, /<SettlementSectionHead\s+icon="history"\s+title="Delivery history"/);
    assert.match(page, /<EmptyState\s+icon="key"/);
    assert.match(page, /<EmptyState\s+icon="webhook"/);
    assert.doesNotMatch(page, /<p className="plat-int__empty">/);
    const head = read("src/merchant/SettlementSectionHead.tsx");
    assert.match(head, /\|\s*"webhook"/);
    assert.match(head, /\|\s*"history"/);
  });

  it("shows active API keys as professional row cards", () => {
    const page = read("src/merchant/IntegrationsPage.tsx");
    assert.match(page, /plat-int__item plat-int__item--key/);
    assert.match(page, /<KeyStateBadge expiresAt=\{k\.expiresAt\} \/>/);
    assert.match(page, /<KeyIdCopy keyId=\{k\.keyId\} \/>/);
    assert.match(page, /className="plat-int__scope"/);
    const css = read("src/styles/merchant/62-integrations.css");
    assert.match(css, /\.plat-int__item--key \.plat-int__item-details \{[^}]*repeat\(4/);
    assert.match(css, /@container \(max-width: 560px\)/);
  });

  it("puts Add webhook beside the endpoint URL", () => {
    const page = read("src/merchant/IntegrationsPage.tsx");
    const row = page.slice(page.indexOf('className="plat-int__url-row"'));
    const end = row.indexOf("</div>");
    assert.ok(row.indexOf('id="hook-url"') > 0 && row.indexOf('id="hook-url"') < end);
    assert.ok(row.indexOf("Add webhook") > 0 && row.indexOf("Add webhook") < end);
    const hookForm = page.slice(page.indexOf("onSubmit={onRegisterHook}"));
    const tail = hookForm.slice(
      hookForm.indexOf("</fieldset>"),
      hookForm.indexOf("</form>"),
    );
    assert.doesNotMatch(tail, /<button/);
  });

  it("renders the one-time secret in the project modal style", () => {
    const page = read("src/merchant/IntegrationsPage.tsx");
    assert.match(
      page,
      /className="b3-commission-modal b3-owner-edit org-profile-edit-modal plat-int-secret-modal"/,
    );
    assert.match(page, /<header className="org-edit__head">/);
    assert.match(page, /className="org-edit__waves"/);
    assert.match(page, /className="owner-acct__save" onClick=\{onDismiss\}/);
    assert.match(page, /plat-int-secret-modal__copy/);
    const css = read("src/styles/merchant/07-integrations.css");
    assert.match(css, /\.b3-commission-modal-backdrop \.b3-owner-edit\.plat-int-secret-modal \{/);
  });

  it("confirms rotate, revoke and delete in a project pop-up", () => {
    const page = read("src/merchant/IntegrationsPage.tsx");
    assert.doesNotMatch(page, /window\.confirm/);
    assert.equal(page.split("await askConfirm({").length - 1, 4);
    assert.match(page, /<ConfirmActionModal/);
    const modal = read("src/shared/ConfirmActionModal.tsx");
    assert.match(modal, /role="alertdialog"/);
    assert.match(modal, /event\.key === "Escape"/);
    const index = read("src/styles/merchant.css");
    assert.match(index, /63-confirm-action\.css/);
  });

  it("lays out Create API key in two columns", () => {
    const page = read("src/merchant/IntegrationsPage.tsx");
    const form = page.slice(
      page.indexOf("plat-int__form--cols"),
      page.indexOf("Generate API key"),
    );
    const order = ['id="key-label"', 'id="key-ip-allowlist"', "Permissions", 'id="key-expires"'];
    const at = order.map((s) => form.indexOf(s));
    assert.ok(at.every((i) => i > 0), at.join(","));
    assert.deepEqual([...at].sort((a, b) => a - b), at);
    assert.equal(form.split('className="plat-int__form-col"').length - 1, 2);
    const css = read("src/styles/merchant/62-integrations.css");
    assert.match(css, /\.plat-int__form--cols \{[^}]*grid-template-columns: repeat\(2/);
  });

  it("gives the merchant Networks tab the Service Bills page title", () => {
    const page = read("src/merchant/NetworksPage.tsx");
    assert.match(page, /org-network-rail-panel__intro--page/);
    assert.match(page, /org-network-rail-panel__intro-icon/);
    assert.match(page, /<h1 className="org-network-rail-panel__intro-title">Networks<\/h1>/);
    const css = read("src/styles/merchant/41-merchant-site-detail.css");
    assert.match(
      css,
      /__intro--page \.org-network-rail-panel__intro-title \{[^}]*font-size: 26px/,
    );
    const platform = read("src/platform/OrgNetworkRailPanel.tsx");
    assert.doesNotMatch(platform, /__intro--page/);
  });

  it("gives the Settlement header the Service Bills page title", () => {
    const hero = read("src/merchant/settlement/SettlementHero.tsx");
    assert.doesNotMatch(hero, /GoldWaves|stl-hero__stats|stl-stat/);
    assert.match(hero, /<h1 className="stl-hero__title">Settlement<\/h1>/);
    const css = read("src/styles/merchant/59-settlement.css");
    assert.match(css, /\.stl-hero__title \{[^}]*font-size: 26px/);
    assert.match(css, /\.stl-hero__top \{[^}]*border-bottom/);
    assert.doesNotMatch(css, /stl-hero__waves|\.stl-hero::before/);
  });

  it("shows the platform fee wallet address as a single line with copy", () => {
    const panel = read("src/platform/BillingWalletPanel.tsx");
    assert.doesNotMatch(panel, /<textarea/);
    assert.match(panel, /id="billing-pay-to"/);
    assert.match(panel, /field-shell--copy plat-fee-billing__shell--address/);
    assert.match(panel, /navigator\.clipboard\.writeText\(value\)/);
    assert.match(panel, /copied \? "Copied" : "Copy"/);
  });

  it("styles merchant Settlement cards like the platform addresses card", () => {
    const css = read("src/styles/merchant/59-settlement.css");
    assert.match(css, /\.plat-settlement\.plat-settings \{[^}]*--stl-card: #04182b/);
    assert.match(css, /\.plat-settlement__card \.stl-head__icon \{[^}]*background: transparent/);
    assert.match(css, /\.plat-settlement__table thead th \{[^}]*text-transform: none/);
    assert.match(css, /\.plat-settlement__net strong \{[^}]*text-transform: uppercase/);
  });

  it("merchant Settlement wallets reuse the platform addresses table", () => {
    const card = read("src/merchant/settlement/SettlementAddressesCard.tsx");
    assert.match(card, /<MerchantSettlementPanel/);
    assert.match(card, /canManage=\{!locked\}/);
    assert.match(card, /platform-detail b3-agent-detail/);
    assert.doesNotMatch(card, /rows=\{/);
  });

  it("Settlement uses two columns: wallet/fulfillment/cashier left, FX/matching right", () => {
    const page = read("src/merchant/SettlementPage.tsx");
    const [left, right] = page.split('<div className="plat-settlement__col">').slice(1);
    assert.ok(left && right);
    const at = (src, s) => src.indexOf(s);
    assert.ok(at(left, "<SettlementAddressesCard") < at(left, "<FulfillmentPolicyCard"));
    assert.ok(at(left, "<FulfillmentPolicyCard") < at(left, "<CashierChannelCard"));
    assert.ok(at(right, "<PricingSettingsPage") < at(right, "<MatchingModeCard"));
    assert.equal(at(right, "<FulfillmentPolicyCard"), -1);
    const css = read("src/styles/merchant/59-settlement.css");
    assert.match(css, /\.plat-settlement \.plat-settlement__col \{[^}]*flex-direction: column/);
  });

  it("Settlement card title bars match the Settlement addresses head", () => {
    const css = read("src/styles/merchant/59-settlement.css");
    assert.match(
      css,
      /\.plat-settlement\.plat-settings \.plat-settlement__card \.stl-head \{\s*gap: 10px;\s*padding: 12px 16px;[^}]*background: #0a1e34;[^}]*border-bottom: 1px solid rgba\(120, 160, 190, 0\.12\)/,
    );
    assert.match(css, /\.plat-settlement__card \.stl-head__sub \{\s*display: none;/);
    assert.match(css, /\.plat-settlement__head-badges \.plat-settlement__mode-pill,[^{]*\{[^}]*background: transparent;[^}]*color: #8ea0b3/);
  });

  it("Matching mode has no underpay tolerance field", () => {
    const card = read("src/merchant/settlement/MatchingModeCard.tsx");
    assert.doesNotMatch(card, /underpay|Tolerance/i);
    assert.match(card, /putMatchingMode\(orgId, draftMode\)/);
    assert.doesNotMatch(read("src/merchant/matchingLabels.ts"), /UNDERPAY/);
    assert.doesNotMatch(read("src/merchant/settlement/useSettlementData.ts"), /underpay/i);
  });

  it("drops the matching and fulfillment scope descriptions", () => {
    const matching = read("src/merchant/settlement/MatchingModeCard.tsx");
    const fulfillment = read("src/merchant/settlement/FulfillmentPolicyCard.tsx");
    assert.doesNotMatch(matching, /matchingModeScope|plat-settings__card-copy/);
    assert.doesNotMatch(fulfillment, /fulfillmentPolicyScope|plat-settings__card-copy/);
    assert.doesNotMatch(read("src/merchant/matchingLabels.ts"), /fixed settlement address only/);
  });

  it("settlement wallets are one per network (4 testnet, 3 mainnet)", () => {
    const panel = read("src/platform/MerchantSettlementPanel.tsx");
    assert.match(panel, /export function settlementNetworkRows\(\): SettlementNetworkRow\[\]/);
    assert.match(panel, /for \(const row of enabledRegistry\(\)\)/);
    assert.match(panel, /testnetBadge: row\.chainEnv === ChainEnvironment\.Testnet/);
    assert.match(panel, /row\.assets\.map\(\(asset\) =>/);
    assert.match(panel, /mixed: active\.length > 1/);
    assert.match(panel, /putSettlement\(orgId, \{\s*network: pendingSave\.network,/);
    assert.doesNotMatch(panel, /asset: pendingSave/);
    assert.doesNotMatch(panel, /settlementPairRows|settlementWalletRows|showAsset/);
    const compliance = read("src/platform/ComplianceOverrideModal.tsx");
    assert.match(compliance, /settlementNetworkRows\(\)/);
    assert.doesNotMatch(compliance, /settlementAsset/);
    const alerts = read("src/merchant/merchantAlerts.ts");
    assert.match(alerts, /id: `settlement:cooldown:\$\{orgId\}:\$\{network\}`/);
  });

  it("loads gold palette overrides after the generic settings styles", () => {
    const index = read("src/styles/merchant.css");
    const at = (name) => index.indexOf(name);
    assert.ok(at("62-integrations.css") > at("32-agent-settings.css"));
    assert.ok(at("62-integrations.css") > at("59-settlement.css"));
    const css = read("src/styles/merchant/62-integrations.css");
    assert.match(css, /\.plat-settings\.plat-int \{[^}]*--stl-gold:/);
    assert.match(css, /html\[data-theme="light"\] \.plat-settings\.plat-int \{/);
    assert.match(css, /\.plat-int__check input:checked \{/);
    assert.match(css, /\.plat-int__form \.plat-settings__submit \{[^}]*linear-gradient/);
  });
});
