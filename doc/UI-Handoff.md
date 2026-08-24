# UI implementation handoff

**Figma:** [Untitled product file](https://www.figma.com/design/VjnnzGqWIo1q2aLRLdA89p/Untitled?node-id=0-1)  
**Lock:** [UI-Style-Lock.md](UI-Style-Lock.md)  
**Pages:** [UI-Page-Spec.md](UI-Page-Spec.md)

## Build order (Kevin first)

| Order | Surface | Owner | Figma | Code |
| --- | --- | --- | --- | --- |
| 1 | Public payment (Pending + states) | Kevin | `e1-*`, `E1-pending-payment` `29:4197` | `apps/payment-page` |
| 2 | Merchant web (dashboard, orders, create) | Andrew UI later / Kevin prototype | `d*` | `apps/web` (reserved) |
| 3 | Platform + Agent shells | Andrew when assigned | `b*` `c*` | `apps/web` |
| 4 | Cashier POS | Bruce M2+ | `g*` | `apps/cashier-apk` |
| 5 | Motion pass | Kevin | page 99 | CSS after screens exist |

Do **not** implement Figma page **98 Archive**. Ignore pink animation sticky notes in product UI.

## Frame → code map (guest pay)

| Frame | Node | State |
| --- | --- | --- |
| `E1-pending-payment` | `29:4197` | Pending Payment |
| `e1-verifying-desktop` | `29:4917` | Verifying |
| `e1-completed-desktop` | `29:4966` | Completed |
| `e1-expired-desktop` | `29:5012` | Expired |
| `e1-anomaly-desktop` | `29:5066` | Payment Anomaly |
| `e1-failed-desktop` | `41:2` | Failed |
| `e1-pending-mode-c` | `41:77` | Mode C exact amount |
| `e2-invalid-desktop` | `29:5115` | Invalid link |

## API (Andrew)

Payment page polls **GET `/v1/orders/{id}/payment`** (M2). Until then, `public/mock-order.js` only.

Preview: `pnpm --filter @cryptogate/payment-page dev` then open http://127.0.0.1:5173/ — query `?state=verifying|completed|expired|anomaly|failed|invalid` and `?mode=C|D`. Create-order prototype at `/create-order.html`.

## Branch (Kevin)

```
feat-kevin-payment-page-ui-lock
```

```bash
git checkout main && git pull
git checkout -b feat-kevin-payment-page-ui-lock
```
