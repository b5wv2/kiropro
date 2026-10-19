# G2Bulk API Documentation (AI-Optimized Reference)

## Overview
The **G2Bulk API** enables automated reselling of game top-ups, gift cards, and digital vouchers over HTTPS using plain JSON. 
- **Base URL:** `https://api.g2bulk.com`
- **OpenAPI Spec:** `https://api.g2bulk.com/openapi.json`
- **Account & Wallet Management:** Fund your wallet and generate API keys via the Telegram bot `@G2BULKBOT` or on [g2bulk.com](https://g2bulk.com).

---

## Core Concepts & Workflow

### How a Purchase Flows
1. **Browse Catalog:** Query Categories and Products (for gift cards/vouchers) or Games and their Catalogue (for direct game top-ups).
2. **Check Live Prices:** Prices fluctuate with exchange rates. **Always** read the current price from the product or catalogue endpoint immediately before charging your customer.
3. **Place Order:** Submit the purchase request using your API key.
   - **Gift Cards:** Return `COMPLETED` immediately with codes attached, or `PENDING` with a `poll_url`.
   - **Game Top-Ups:** Return `PENDING` and process asynchronously in the background.
4. **Track Completion:** Poll the status endpoint / `poll_url`, or pass a `callback_url` when ordering to receive a real-time Webhook notification.
5. **Reconcile:** Verify balance deductions and refunds against the `/v1/transactions` endpoint.

---

## Authentication

- **Standard REST API (`/v1/...`):** Pass your secret key in the `X-API-Key` HTTP header.
  ```http
  X-API-Key: your_secret_api_key
  ```
- **Public Endpoints:** Catalog browsing endpoints (`category`, `products`, `games`, `catalogue`) do **not** require an API key.
- **SMM Panel API (`/api/v2`):** Pass your API key inside the request body (or query string) as the `key` field instead of a header.
- **Security Best Practices:** API keys spend your wallet balance directly. Never expose them in client-side code. You can restrict API keys to specific server IP addresses via `@G2BULKBOT` or the website.

---

## Idempotency

Order creation endpoints accept an optional `X-Idempotency-Key` header to prevent accidental double-charging on network retries.
- **Header:** `X-Idempotency-Key: <UUID>`
- **Format:** Must be a valid 36-character UUID (e.g., `550e8400-e29b-41d4-a716-446655440000`). Any other length is rejected with HTTP `400`.
- **TTL & Scope:** Retrying with the same key within **30 minutes** returns the original response without charging again. Keys are scoped to your account.

---

## Rate Limits

| Scope | Limit |
| :--- | :--- |
| All requests (per IP) | 1,000 requests per 10 seconds |
| All requests (per API key) | 1,000 requests per 10 seconds |
| Player ID validation (per IP) | 120 requests per minute |

### Rate Limit Headers
Every rate-limited response includes:
- `X-RateLimit-Limit`: Maximum allowed requests in the window.
- `X-RateLimit-Remaining`: Remaining requests in the current window.
- `X-RateLimit-Reset`: Seconds until the window resets.

When exceeded, the API returns HTTP `429 Too Many Requests` with a `Retry-After` header indicating how many seconds to wait before retrying.

---

## Error Handling

All standard `/v1` responses include a `success` boolean. Errors include a human-readable `message`:

```json
{
  "success": false,
  "message": "You don't have enough balance to complete this purchase."
}
```

### HTTP Status Codes
| Code | Meaning | Handling Action |
| :--- | :--- | :--- |
| `200` | **OK** | Request succeeded. |
| `202` | **Accepted** | Order is still processing. Continue polling. |
| `400` | **Bad Request** | Invalid format, missing parameters, or invalid UUID length. |
| `401` | **Unauthorized** | Missing or invalid `X-API-Key`. |
| `403` | **Forbidden** | Action not allowed (e.g., request from an unauthorized IP address). |
| `404` | **Not Found** | Resource does not exist or does not belong to your account. |
| `410` | **Gone** | Terminal state: The order failed and was automatically refunded. Stop polling. |
| `429` | **Too Many Requests** | Rate limit exceeded. Respect the `Retry-After` header. |
| `5xx` | **Server Error** | Temporary server issue. Retry with exponential backoff. |

> **Exception:** The SMM Panel API (`/api/v2`) **always** returns HTTP `200` and reports errors inside an `error` JSON property (e.g., `{ "error": "Insufficient balance" }`).

---

## REST API v1 Endpoints

### 1. Account
Manage profile and check wallet balance. (Auth Required)
- `GET /v1/getMe` — Retrieve account profile and current wallet balance.

### 2. Catalog (Gift Cards & Vouchers)
Browse gift card categories and products. (Public - No Auth Required)
- `GET /v1/category` — List all gift card/voucher categories.
- `GET /v1/category/{id}` — Get details and products for a specific category.
- `GET /v1/products` — List all available gift card/voucher products.
- `GET /v1/products/{id}` — Get details and live pricing for a specific product.

### 3. Purchases (Gift Cards & Vouchers)
Buy gift cards/vouchers and retrieve digital codes. (Auth Required)
- `POST /v1/products/{id}/purchase` — Purchase a gift card or voucher.
- `GET /v1/orders` — List all gift card/voucher orders.
- `GET /v1/orders/{id}` — Get status and details of a specific order.
- `GET /v1/orders/{id}/delivery` — Retrieve the delivered voucher/gift card codes for an order.

**Purchase Lifecycle Notes:**
- Purchasing returns either `COMPLETED` (with codes attached) or `PENDING` (with a `poll_url`).
- If `PENDING`, poll the `poll_url` every **2 to 5 seconds** until it returns HTTP `200` (codes ready) or HTTP `410` (failed and refunded). Most orders finish within 5–10 seconds.
- **Retention Policy:** Codes remain available for **30 days** after order creation. Always persist them in your own database before then.

### 4. Game Top-Up (Direct Recharge)
Direct top-ups credit the player's in-game account directly without voucher codes.

#### Workflow:
1. List supported games (`GET /v1/games`).
2. Query required input fields for the game (`POST /v1/games/fields`), such as `user_id`, `server`, or `character_name`.
3. *(Optional)* Validate the player (`POST /v1/games/checkPlayerId`) to display the customer's in-game username before charging.
4. Fetch the game's catalogue (`GET /v1/games/{code}/catalogue`) for denominations and live prices.
5. Submit the top-up order (`POST /v1/games/{code}/order`). It returns `PENDING`; track it via status endpoints or Webhooks.

#### Order Statuses:
- `PENDING`: Queued for processing.
- `PROCESSING`: Currently in flight.
- `COMPLETED`: Delivered to player account.
- `FAILED`: Failed and refunded to your wallet balance.

#### Endpoints:
- `GET /v1/games` — List all supported games (Public).
- `GET /v1/games/{code}/catalogue` — Get denominations and live prices for a specific game code (Public).
- `POST /v1/games/fields` — Get required player input fields for a game.
- `POST /v1/games/servers` — Get available server list for a game.
- `POST /v1/games/checkPlayerId` — Validate player ID and retrieve in-game name.
- `POST /v1/games/eta` — Check estimated delivery time for a game.
- `POST /v1/games/{code}/order` — Place a direct top-up order (Auth Required).
- `POST /v1/games/order/status` — Check status of a top-up order (Auth Required).
- `GET /v1/games/orders` — List all game top-up orders (Auth Required).
- `GET /v1/games/orders/{id}` — Get details of a specific game top-up order (Auth Required).

### 5. Transactions
Audit wallet balance changes. (Auth Required)
- `GET /v1/transactions` — Retrieve the ledger of all balance additions, deductions, and refunds.

### 6. Webhook Management
Manage webhook secrets, view delivery logs, and trigger test events. (Auth Required)
- `GET /v1/webhooks/secret` — View current webhook signing secret metadata.
- `POST /v1/webhooks/secret` — Generate or rotate your webhook signing secret (`whsec_...`).
- `GET /v1/webhooks/deliveries` — List past webhook delivery attempts.
- `POST /v1/webhooks/deliveries/{id}/resend` — Manually resend a specific webhook event.
- `POST /v1/webhooks/test` — Send a test webhook event to your endpoint.

---

## SMM Panel API (`/api/v2`)

G2Bulk supports the standard SMM Panel protocol on a single endpoint.
- **Endpoint:** `https://api.g2bulk.com/api/v2`
- **Methods:** `POST` (recommended) or `GET` (query string; discouraged as it exposes your API key in server logs).
- **Content-Type:** `application/json` or `application/x-www-form-urlencoded`.
- **Authentication:** Pass `key` inside the request payload/query.

### Supported Actions

| `action` Value | Description | Required / Extra Fields |
| :--- | :--- | :--- |
| `services` | Lists every service with its live rate in USD. | `category` *(optional: filter by game name)* |
| `add` | Places a top-up order and returns `{"order": 12345}`. | `service` (int), `link` (string), `quantity` (int, always `1` for top-ups) |
| `status` | Checks order status. | `order` (single integer ID) OR `orders` (comma-separated IDs, max 100) |
| `balance` | Returns your current wallet balance. | *None* |

### Formatting the `link` Parameter for Game Top-Ups (`action: "add"`)
Depending on the game's requirements, pass player details in the `link` field using pipe (`|`) delimiters and keep `quantity` set to `1`:
- Player ID only: `PlayerID`
- Player ID + Server ID: `PlayerID|ServerID`
- Player ID + Server ID + Character Name: `PlayerID|ServerID|Charname`

### SMM Order Status Values
`Pending`, `In progress`, `Completed`, `Partial`, `Canceled`

### Request Schema (`SmmRequest`)
```json
{
  "key": "your_api_key",
  "action": "services | add | status | balance",
  "category": "Optional game name filter (for services)",
  "service": 1,
  "link": "12345678|2001",
  "quantity": 1,
  "order": 12345,
  "orders": "12345,12346"
}
```

### Example Requests

#### cURL (POST - Recommended)
```bash
curl https://api.g2bulk.com/api/v2 \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
    "key": "YOUR_API_KEY",
    "action": "add",
    "service": 1,
    "link": "12345678|2001",
    "quantity": 1
  }'
```

#### Successful `add` Response (HTTP 200)
```json
{
  "order": 12345
}
```

#### Common SMM Error Strings (Returned as HTTP 200 with `{"error": "..."}`)
- `Invalid API key`
- `Invalid action`
- `Service ID is required`
- `Link (Player ID) is required`
- `Service not found or inactive`
- `Game is currently unavailable`
- `Insufficient balance`
- `Order not found`

---

## Webhooks Specification

When placing an order, pass a public `callback_url` (`http://` or `https://`). G2Bulk will send a `POST` request to that URL as soon as the order reaches a terminal state.

### Delivery & Retry Policy
- **Timeout:** Your server must return any `2xx` HTTP status code within **10 seconds**.
- **Retries:** Non-`2xx` responses or timeouts are retried with exponential backoff for approximately **3 days** on the following schedule:
  `1 min` $\rightarrow$ `5 min` $\rightarrow$ `30 min` $\rightarrow$ `2 hours` $\rightarrow$ `6 hours` $\rightarrow$ `12 hours` $\rightarrow$ `Daily`.
- **Deduplication (Idempotency):** Both `event_id` (in the JSON body) and the `webhook-id` header remain identical across all retry attempts for the same event. Store processed `event_id`s to ignore duplicates.
- **Network Restrictions:** Redirects (`3xx`) are **not** followed. URLs pointing to `localhost`, private networks, or internal IP ranges are skipped.

### Webhook Request Headers

| Header | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `webhook-id` | `string` | Yes | Unique event ID (matches `event_id` in body). Constant across retries. |
| `webhook-timestamp` | `string` | Yes | Unix timestamp in seconds when the delivery attempt was sent. |
| `webhook-signature` | `string` | Conditional | Sent once you create a signing secret. Format: `v1,<base64 HMAC-SHA256>`. |
| `X-G2Bulk-Event` | `string` | Yes | Event type identifier (matches `event` in body). |
| `User-Agent` | `string` | Yes | G2Bulk webhook user agent string. |

---

### Verifying Webhook Signatures

G2Bulk uses the [Standard Webhooks](https://www.standardwebhooks.com/) signature format.
1. Generate a signing secret (`whsec_...`) once via `POST /v1/webhooks/secret`.
2. Strip the `whsec_` prefix and **Base64-decode** the remaining string to obtain the raw cryptographic key.
3. Construct the signed payload string: `{webhook-id}.{webhook-timestamp}.{raw_body}`.
4. Compute an **HMAC-SHA256** digest over the signed payload using the decoded key, Base64-encode the result, and prefix it with `v1,`.
5. Compare your computed signature against the space-separated signatures in the `webhook-signature` header.
6. **Replay Protection:** Reject any webhook where `webhook-timestamp` is more than **5 minutes** old.

#### Node.js Verification Example
```javascript
import crypto from "crypto";

const key = Buffer.from(secret.replace("whsec_", ""), "base64");
const signed = `${req.headers["webhook-id"]}.${req.headers["webhook-timestamp"]}.${rawBody}`;
const expected = "v1," + crypto.createHmac("sha256", key).update(signed).digest("base64");
const ok = req.headers["webhook-signature"].split(" ").some((s) => s === expected);
```

#### Python Verification Example
```python
import base64
import hashlib
import hmac

key = base64.b64decode(secret.removeprefix("whsec_"))
signed = f"{headers['webhook-id']}.{headers['webhook-timestamp']}.{raw_body}".encode()
expected = "v1," + base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest()).decode()
ok = expected in headers["webhook-signature"].split(" ")
```

---

### Webhook Payload 1: Gift Card Order Finished
Triggered when a gift card or voucher order that started as `PENDING` reaches `COMPLETED`, `FAILED`, `REFUNDED`, or `CANCELLED`.
> **Important:** Gift card codes are **not** included in the webhook payload for security. Fetch them from `GET /v1/orders/{id}/delivery` using your API key.

#### Payload Schema
| Field | Type | Description |
| :--- | :--- | :--- |
| `delivered_at` | `string \| null` | ISO 8601 / RFC 3339 timestamp (e.g., `2026-10-19T05:30:08Z`). |
| `event` | `string` | Event type (e.g., `order.completed`). |
| `event_id` | `string` | Unique event identifier for deduplication. |
| `is_refunded` | `boolean` | Whether the order amount was refunded to your wallet. |
| `order_id` | `integer` | Unique order ID. |
| `product_id` | `integer` | Purchased product ID. |
| `status` | `string (enum)` | One of: `COMPLETED`, `FAILED`, `REFUNDED`, `CANCELLED`. |

#### Example Payload
```json
{
  "delivered_at": "2026-10-19T05:30:08Z",
  "event": "order.completed",
  "event_id": "evt_order_124_completed",
  "is_refunded": false,
  "order_id": 124,
  "product_id": 2,
  "status": "COMPLETED"
}
```

---

### Webhook Payload 2: Top-Up Order Finished
Triggered when a direct game top-up order reaches `COMPLETED` or `FAILED`.

#### Payload Schema
| Field | Type | Description |
| :--- | :--- | :--- |
| `denom_id` | `string` | Denomination identifier (e.g., `"60 UC"`). |
| `event` | `string (enum)` | `"topup.completed"` or `"topup.failed"`. |
| `event_id` | `string` | Unique event identifier for deduplication. |
| `game_code` | `string` | Short code of the game (e.g., `"pubgm"`). |
| `game_name` | `string` | Full display name of the game (e.g., `"PUBG Mobile"`). |
| `message` | `string` | Human-readable result or error description. |
| `order_id` | `integer` | Unique top-up order ID. |
| `player_id` | `string` | Target in-game player ID. |
| `player_name` | `string` | Target in-game player name. |
| `price` | `number` | Price charged for the order. |
| `remark` | `string` | Custom remark or external reference associated with the order. |
| `server_id` | `string` | Target game server ID. |
| `status` | `string (enum)` | `"COMPLETED"` or `"FAILED"`. |
| `timestamp` | `string` | ISO 8601 / RFC 3339 timestamp of completion. |

#### Example Payload
```json
{
  "denom_id": "60 UC",
  "event": "topup.completed",
  "event_id": "evt_topup_42_completed",
  "game_code": "pubgm",
  "game_name": "PUBG Mobile",
  "message": "Order completed successfully",
  "order_id": 42,
  "player_id": "12345678",
  "player_name": "PlayerName",
  "price": 0.88,
  "remark": "order-8812",
  "server_id": "2001",
  "status": "COMPLETED",
  "timestamp": "2026-10-19T05:31:00Z"
}
```