# ADR-0001: Warehouse Management Portal — Foundational Architecture

- **Status:** Proposed (revision 2)
- **Date:** 2026-05-07
- **Authors:** Platform Engineering
- **Reviewers:** *to be assigned*
- **Supersedes:** —
- **Superseded by:** —

> **Revision 2 changes vs r1:** removed cross-store transaction (§5.3); replaced per-event hash chaining with batched Merkle anchoring (§5.6); added historical as-of design via snapshots (§5.7); added capacity & cost model (§7); added latency budget (§8); inlined event schema evolution policy (§5.8); inlined metering event shape (§5.9); split Identity & Tenant into three concerns (§5.10); reworked considered-options analysis (§4); explicit per-context SLOs (§5.13); dropped overstated cloud-agnostic and lock-in claims.
>
> **Revision 3 changes vs r2:** clarified tenant terminology (§1); partitioned snapshot tables (§5.7); added outbox janitor and DR-only replay clarification (§5.5); pinned Notify & Ack to a separate per-region database (§5.1); defined SKU tags in catalog (§5.1); explained outbox poller choice over `LISTEN/NOTIFY` (§5.13); added GxP / 21 CFR Part 11 confirmation (§5.14); added vanilla-PG cutover mechanism (§5.4); offline-replay batch flagging (§5.11); cost-model exclusions made explicit (§7.4); shrinkage event mapping (§5.2); §11 renamed.

---

## 1. Context

We are building a multi-tenant warehouse management portal capable of operating one or more very large physical warehouses on behalf of many customers ("depositors"). Customers bring goods to the warehouse, deposit them, and over time return to withdraw **some or all** of those goods. The system must always be able to answer, with cryptographic-grade auditability:

> *For customer C, item/SKU S, lot L: how many units were originally deposited, how many have been withdrawn (and when, by whom), and how many units remain on hand right now — and what was the answer at any historical timestamp T?*

The portal must support **billions of items** across thousands of customers, deliver real-time notifications on every movement, and capture a verifiable customer acknowledgement on each withdrawal.

**Terminology** (load-bearing — earlier drafts were ambiguous):

- **Tenant** = a depositor *organization* (e.g., "Acme Foods Ltd"). The unit of multi-tenancy, sharding, billing, RLS, and data residency. ~10³ tenants targeted in year one; ~10⁶ items in stock per tenant on average.
- **Customer user** = an individual person belonging to a tenant (Acme's logistics manager, Acme's drivers). Lives in the customer identity directory (§5.10).
- **Operator** = a member of the warehouse-operating workforce (our employees / partners). Lives in the workforce identity directory.
- **Depositor / customer** are used interchangeably with *tenant* in narrative text; where the distinction matters (organization vs individual), we say *tenant* vs *customer user*.
- **SKU, lot, location** are tenant-scoped — two tenants may share an SKU code; the system treats them as distinct.

### 1.1 Functional scope

1. **Intake / Goods Receipt** — capture items deposited (SKU, lot/batch, serial numbers where applicable, qty, weight, dimensions, condition, photos, storage requirements, expiry, handling instructions).
2. **Storage allocation** — assign goods to bin/rack/zone locations, optionally split across locations.
3. **Withdrawal / Goods Issue** — customer-initiated, possibly partial, against an existing deposit. Reduces on-hand atomically; produces a goods-issue note.
4. **Live balance** — current on-hand units per (customer, SKU, lot, location).
5. **Historical balance** — same query "as-of" any past timestamp T within retention.
6. **Notifications** — automatic, real-time push to the customer (and configurable internal stakeholders) on intake, withdrawal, low-stock, expiry-approaching, exception events.
7. **Acknowledgement** — every customer-facing transaction must be accepted by the customer through a non-repudiable proof (OTP, signed e-receipt, biometric where available), persisted as evidence.
8. **Reporting & audit** — full movement history, exportable for compliance.
9. **Customer self-service portal & operator console** — separate UIs for depositors and warehouse staff.
10. **Metering** — periodic occupancy and per-event fee data emitted to billing.

### 1.2 Non-functional requirements

| Concern | Target | Source of confidence |
|---|---|---|
| Total units in stock | 10⁹ across all tenants | Capacity model §7 |
| Movement events / day, sustained avg | 10M | §7 |
| Movement events / day, peak | 50M (~580/s sustained, ~3K/s peak) | §7 |
| Read latency (current balance, p99) | < 150 ms | Latency budget §8 |
| Write latency (withdrawal end-to-end, p99) | < 250 ms | Latency budget §8 |
| Availability (per region, per service) | 99.95 % monthly | Multi-AZ; multi-region for ledger & projector |
| RPO / RTO | RPO ≤ 1 min / RTO ≤ 30 min | Sync replica + region pair |
| Audit retention | 7 years online-queryable; 10 years archival | Regulatory worst-case |
| Tenant isolation | Logical, with row-level security on every read | §5.10 |
| Compliance | SOC 2 Type II, ISO 27001, GDPR/NDPR; optional GxP | §5.14 |

### 1.3 Forces and constraints

- The "remaining = deposited − withdrawn" invariant must **never** drift, even under partial failures, retries, or concurrent withdrawals against the same lot.
- Operators scan barcodes/RFID at the dock door — the system must accept high-frequency scan events without coupling each scan to a synchronous acknowledgement round-trip.
- Customers may be offline (rural depositors); acknowledgements must support OTP and printable signed receipts, not only app-push.
- Operator workforce ranges from low-literacy floor staff (mobile scanner UX) to inventory controllers (rich web UX).
- Some customers demand physically segregated storage; the system must model this without a separate deployment.
- Some customers will demand data residency in their region.

---

## 2. Decision drivers

1. **Correctness over throughput** for the inventory ledger — we will never trade auditability for write latency.
2. **Multi-tenant by default** — physical warehouse is shared, but every record is tenant-scoped, and the data plane enforces this.
3. **Event-sourced movement log** — the source of truth is an append-only stream of movement events; balances are projections.
4. **Strong consistency on the write path; eventual consistency on display** — the *decision* to permit a withdrawal is always made under a strict per-lot lock; the *dashboard* may lag by seconds.
5. **Buy before build** for commodity capabilities (auth, transactional email/SMS, object storage, search, observability).
6. **Cloud-native, single-cloud primary.** Azure is primary. We accept lock-in where it is operationally expensive to abstract (managed Postgres, Service Bus, Entra, Blob immutable storage). We abstract at the *workload* level (services are containerised on Kubernetes), not the dependency level.

---

## 3. Architecture diagram (logical)

```
                                        ┌────────── SMS / Email / Push
Customer App ─┐                         │
Customer Web ─┼─► API GW ─► BFF ─► Svcs ┼────────── Webhooks (customer ERP)
Operator Web ─┤        ▲                 │
Handheld    ──┴─► Edge GW ───────────────┴────────── Signed PDF receipts
                       │
                       ▼
              ┌──────────────────────┐
              │ Movement Ledger      │  ◄── per-lot SELECT FOR UPDATE
              │  + Balance Projector │      (single PostgreSQL transaction;
              │  (same PG shard,     │       see §5.3)
              │   separate schemas)  │
              └─────────┬────────────┘
                        │ transactional outbox
                        ▼
              ┌──────────────────────┐
              │ Event Bus            │  Azure Service Bus (topics)
              └─────────┬────────────┘
                        │
        ┌───────────────┼─────────────────┬───────────────────┐
        ▼               ▼                 ▼                   ▼
 ┌─────────────┐ ┌─────────────┐  ┌─────────────┐    ┌───────────────┐
 │ Read cache  │ │ Notify & Ack│  │ Anchor      │    │ Audit archive │
 │ (Cosmos /   │ │ Service     │  │ Service     │    │ (Blob WORM,   │
 │  Redis)     │ │             │  │ (Merkle +   │    │  Parquet cold │
 │  derived    │ │             │  │  legal hold)│    │  ledger)      │
 └─────────────┘ └─────────────┘  └─────────────┘    └───────────────┘
```

### 3.1 Withdrawal write path (load-bearing diagram)

```
  Operator/Portal
        │  withdrawal request
        ▼
  ┌──────────┐
  │   BFF    │ ── authn, tenant resolve, route to shard
  └────┬─────┘
       ▼
  ┌──────────────────────────────────────────────────────┐
  │  Withdrawal Service (per shard)                      │
  │                                                      │
  │  BEGIN;                                              │
  │   1. SELECT FOR UPDATE on projector.lot_balance      │
  │      WHERE (tenant, sku, lot) = (...)                │
  │      → validate available_qty >= requested_qty       │
  │   2. INSERT INTO ledger.events (GoodsPicked) RETURNING id
  │   3. UPDATE projector.lot_balance                    │
  │   4. INSERT INTO outbox.events (...) for fanout      │
  │  COMMIT;     ← single atomic transaction, one DB     │
  └──────────────────────────────────────────────────────┘
       │
       ▼ (outbox poller, separate process)
  Service Bus topic ─► Notify, Read-cache projector,
                        Anchor batcher, Audit archiver
```

The lock is on the **projector row**; the ledger remains append-only; the cross-system fanout happens *after commit* via the outbox. There is no cross-store transaction at any point.

---

## 4. Considered options

| # | Option | Score | Why |
|---|---|---|---|
| A | Off-the-shelf WMS (SAP EWM, Manhattan, Blue Yonder) | Reject | Licensing + per-tenant customization cost; weak self-service multi-tenant model; notification/ack model would still be custom. |
| B | Open-source WMS fork (Odoo, ERPNext) | Reject as primary | Useful as catalog reference; data model not designed for billion-item scale or per-customer ledger semantics. |
| C | Custom monolith, single relational DB, mutable `stock_on_hand` table + audit log | Reject | Audit log is parallel to truth, so they drift. Concurrent partial withdrawals require explicit application-level reconciliation. We have seen this fail in production at peers. |
| D | Custom, **double-entry accounting model** for inventory (debit bin, credit customer; debit customer, credit shipped) | Reject | Powerful but adds a mental model with no benefit over event sourcing for our domain. We would pay the learning cost for a generality we do not need. |
| E | Custom, **event-sourced movement log + CQRS projections**, PostgreSQL-primary, services on AKS | **Selected** | Append-only ledger gives correctness by construction; projections give portal performance; PG sharding gives the scale we need without a NewSQL bet. |
| F | Hybrid: event-sourced for movement; CRUD for catalog/locations/identity | Folded into E | This is what E actually is; only inventory needs event sourcing. We are explicit that catalog and identity are CRUD. |

**Why event sourcing here, when most CRUD systems do not need it.** The product *is* a movement log. The customer pays us to produce a defensible answer to "where is my stuff and what happened to it." Every other domain in the system (catalog, identity, locations) is normal CRUD and is built that way. We do not apply event sourcing where it does not pay for itself.

---

## 5. Decision

We will build a custom warehouse management portal organized around six bounded contexts. The **Movement Ledger and the Balance Projector live in the same PostgreSQL database** (different schemas) and are updated within a single transaction; everything else is decoupled via a transactional outbox onto Azure Service Bus.

### 5.1 Bounded contexts

| Context | Responsibility | Storage | Notes |
|---|---|---|---|
| **Tenant Directory** | Tenants, plans, region, shard routing | PostgreSQL (control plane) | Read at gateway on every request, cached |
| **Workforce Identity** | Operators, roles, MFA, SSO | Microsoft Entra ID | Federated, not owned by us |
| **Customer Identity** | Customer users, passwords, MFA | Entra External ID | Separate directory from workforce |
| **Catalog & Locations** | SKUs (with arbitrary tenant-defined tags, e.g., `cold-chain`, `hazardous`, `high-value`, used for notification scoping and pick-path policy), lots, warehouses, zones, racks, bins, capacity | PostgreSQL (per shard) | CRUD; soft-deletes |
| **Movement Ledger + Balance Projector** | Append-only movement events; current on-hand by (tenant, sku, lot, location); hourly snapshots | PostgreSQL (sharded) | **One DB, two schemas, one transaction** |
| **Notification & Acknowledgement** | Notification fan-out, OTP, signed receipts, ack state machine | PostgreSQL (per-region, separate from ledger shards) + Service Bus | Idempotent consumers; a noisy notification storm cannot back-pressure the ledger because they share no database |
| **Anchor Service** | Per-minute Merkle batches; daily anchor to immutable Blob | PostgreSQL + Blob WORM | Tamper-evident; off the write path |
| **Audit & Reporting** | Long-term Parquet archive of cold ledger partitions; analytical queries | Azure Blob (Cool/Archive) + external tables | Read-mostly |
| **Read Cache** (optional) | Sub-50ms portal reads for tenants on premium tier | Cosmos DB or Redis | Derived from outbox; eventually consistent |

### 5.2 Inventory ledger (event-sourced)

Inventory is modelled as an **append-only ledger of movement events**, never as a mutable row.

**Event types** (versioned schemas under `events/<name>/v{N}.json`):

- `GoodsReceived` — intake at dock; one event per lot per receipt.
- `GoodsStored` — placement into a specific bin (may split a lot).
- `GoodsPicked` — pick from a bin in response to a withdrawal.
- `GoodsIssued` — release to customer; carries acknowledgement reference.
- `GoodsAdjusted` — reconciliation from cycle counts; requires dual approval.
- `GoodsDamaged` / `GoodsExpired` / `GoodsTransferred` — lifecycle events.
- Physical loss / theft ("shrinkage") is recorded as a `GoodsAdjusted` event with a mandatory `reason_code` (`shrinkage`, `damaged_in_handling`, `cycle_count_correction`, `customs_seizure`, …) which routes downstream to insurance and dispute workflows.
- `OwnershipTransferred` — non-physical change of custodian (commodities use case).

**Common envelope:**

```
event_id        UUIDv7    -- time-ordered, monotonic per shard
tenant_id       UUID
customer_id     UUID
sku_id          UUID
lot_id          UUID
location_id     UUID NULL
quantity        NUMERIC(20,3)  -- signed; negative for picks/issues
unit_of_measure TEXT
actor_id        UUID
actor_type      ENUM(operator, customer, system, scanner)
occurred_at     TIMESTAMPTZ    -- physical event time (from device)
recorded_at     TIMESTAMPTZ    -- DB commit time
idempotency_key TEXT UNIQUE per (tenant, type)
correlation_id  UUID
causation_id    UUID
schema_version  SMALLINT
batch_id        UUID NULL      -- set by Anchor Service post-commit
payload         JSONB          -- type-specific fields
blob_refs       TEXT[]         -- content-addressable (sha256:...) refs to Blob
```

Binary payloads (photos, signatures, scanned PDFs) live in Azure Blob keyed by content hash; the event stores only the hash. The ledger row is bounded to ≤ 2 KB by policy, enforced at write time.

**Balance is a projection:**
```
on_hand(tenant, sku, lot, location, as_of=T)
  = Σ quantity of events for that tuple where recorded_at ≤ T
```

### 5.3 Concurrency and the partial-withdrawal invariant

A withdrawal is a single PostgreSQL transaction, on a single shard:

```sql
BEGIN;
  SELECT available_qty FROM projector.lot_balance
   WHERE tenant_id = $1 AND sku_id = $2 AND lot_id = $3
   FOR UPDATE;                               -- per-lot lock
  -- application: assert available_qty >= requested_qty
  INSERT INTO ledger.events (...)            -- GoodsPicked
       VALUES (...) RETURNING event_id;
  UPDATE projector.lot_balance
     SET available_qty = available_qty - $4,
         last_event_id = $5
   WHERE tenant_id = $1 AND sku_id = $2 AND lot_id = $3;
  INSERT INTO outbox.events (...)            -- for post-commit fanout
       VALUES (...);
COMMIT;
```

This gives **strict serializability per `(tenant, sku, lot)`**: two concurrent withdrawals against the same lot serialize on the projector lock, while withdrawals against different lots run in parallel.

The ledger is the legal record. The projector is a fast index over it, recomputable by replay (§5.5). The outbox guarantees at-least-once delivery to Service Bus *after* commit.

The Read Cache (Cosmos / Redis) is updated **off the write path** by an outbox consumer. The display value in the customer portal can lag by up to 2 seconds (SLO §5.13). The decision to *permit* a withdrawal never reads from the cache.

### 5.4 Sharding for billions of items

- **Ledger and projector** are co-located on shards keyed by `hash(tenant_id) mod N`. Initial N = 8; we resize via Citus shard rebalancer or, on vanilla PG, via tenant-directed cutover: logical replication streams the target tenant's rows to the new shard, the tenant directory keeps reads pinned to the source until catch-up, then a 5–30 second read-only freeze flips routing and confirms parity. One tenant migrates at a time; other tenants are unaffected.
- Within each shard, the `ledger.events` table is **range-partitioned by `month(occurred_at)`**. Hot months stay on fast disk; partitions older than 90 days are detached and exported to Parquet on Blob, queried via PG Foreign Data Wrapper for the rare deep historical query.
- The projector is small (~5 GB at 10⁹ items in stock) and lives entirely in RAM on each shard.
- A single tenant cannot dominate a shard — tenants exceeding 10% of shard capacity are migrated to a dedicated shard. The Tenant Directory makes this routing transparent to services.

### 5.5 Replay and reconciliation

The projector is rebuildable from the ledger:

```
TRUNCATE projector.lot_balance;
INSERT INTO projector.lot_balance
SELECT tenant_id, sku_id, lot_id, location_id, SUM(quantity)
  FROM ledger.events
 GROUP BY 1,2,3,4;
```

The full `TRUNCATE + INSERT` is a **disaster-recovery operation only** — at 7 years of ledger it is a multi-hour job. Routine drift on a single tuple is fixed by **per-tuple recompute**, which scans only that lot's events and is sub-second.

Three background jobs run continuously:

- **Rolling checksum** (every 5 minutes): for each shard, compute `SUM(quantity)` per `(tenant, sku, lot)` from the last hour of ledger events and compare with the projector delta. Any discrepancy alerts immediately and triggers per-tuple recompute.
- **Full nightly recompute** for last 24h: full diff per tenant, written to a reconciliation report. Any non-zero delta is a P1 incident and blocks billing close-of-day.
- **Outbox janitor** (hourly): deletes outbox rows whose published events are confirmed delivered to Service Bus and older than 7 days. The audit archive (Blob WORM) is authoritative thereafter; the outbox is a delivery buffer, not a record.

### 5.6 Tamper-evident audit (Merkle batches)

We do **not** chain hashes per event (that would serialize all writes for a tenant). We chain **batches**:

1. Every committed event is enqueued (via outbox) to the **Anchor Service**.
2. The Anchor Service rolls events per `(tenant_id, minute)` into a **Merkle tree**. The tree's root, plus the previous batch's root, plus a monotonic batch sequence, are stored in `anchor.batches`.
3. `anchor.batches` itself is hash-chained — but it is small (one row per tenant per minute), so the chain is not contended.
4. **Hourly:** the latest 60 batch roots per tenant are written to Azure Blob with **immutable storage + legal hold** (WORM).
5. **Daily:** a compressed manifest of all batch roots is timestamped via RFC 3161 (external timestamping authority) and archived.

This gives us:
- proof that no historical event was retroactively modified (any change invalidates a Merkle root and breaks the chain),
- proof of *time* via external RFC 3161 timestamps,
- **zero serialization on the write path** — the anchor pipeline is asynchronous,
- regulator-friendly evidence without a blockchain dependency.

Anchor lag SLO: ≤ 5 minutes from event commit to first Merkle root persisted.

### 5.7 Historical "as-of" balances

Replaying 7 years of ledger per query is not viable. We materialize **snapshots**:

- **Hourly snapshot** of `(tenant_id, sku_id, lot_id, location_id, on_hand_qty)` for any tuple with activity in that hour, kept for **30 days**.
- **Daily snapshot** of every tuple with non-zero balance, kept for the full **7 years**.
- Snapshots are written by a meter sweeper (§5.9) that reads the projector under a snapshot isolation level — no impact on the write path.
- The snapshot tables are **range-partitioned by `month(snapshot_at)`** on every shard. Hourly-tier partitions older than 30 days are detached and dropped (their information is preserved by the daily tier). Daily-tier partitions older than 1 year are detached and exported to compressed Parquet on Blob, queried via PG Foreign Data Wrapper for the rare deep-history query.

**Query algorithm for `on_hand(... as_of=T)`:**
1. Locate the latest snapshot at time `S ≤ T` (hourly if T within 30 days, else daily).
2. Replay ledger events in `(S, T]` for that tuple.
3. Return `snapshot_qty + Σ events`.

Bounded work: at most 1 hour (or 1 day) of events per query.

### 5.8 Schema evolution policy

Event schemas live in `events/<name>/v{N}.json` (JSON Schema) under version control.

**Forbidden once a schema version is in production:**
- rename a field;
- change a field's type or unit;
- remove a required field;
- redefine the semantics of an enum value.

**Allowed:**
- add an optional field (becomes part of vN+1, not a mutation of vN);
- deprecate a field (it remains serialized and read by upcasters);
- add a new event type.

**Reading old events.** Every event carries `schema_version`. Readers compose **upcasters** that map `vN → vN+1`. An event written at v3 read by code that knows v5 is upcast 3→4→5 in memory; the stored row is never rewritten.

CI enforces:
- every existing schema version has an upcaster to its successor;
- no breaking change between versions;
- consumers declare the minimum version they support.

The same policy applies to the outbox event envelope.

### 5.9 Metering & billing events

Billing is a separate stream, derived but emitted explicitly:

- `OccupancyMeasured(tenant_id, customer_id, sku_id, lot_id, location_id, qty, occurred_at, period='hour'|'day')` — emitted by the meter sweeper at the same time it writes a snapshot.
- `MovementCharged(event_id, fee_unit, fee_amount, currency)` — emitted by a billing consumer of the movement outbox; idempotent on `event_id`.

Billing events live in their own topic and their own retention — billing is downstream, never on the critical write path.

We commit to this **shape now** (not the rates, not the price plan) because the ledger event schema must accommodate the fields billing needs (`location_id`, `unit_of_measure`, `occurred_at`). Locking these is foundational.

### 5.10 Identity, access, and tenancy

Three distinct concerns that revision 1 conflated:

| Concern | Owner | Why separate |
|---|---|---|
| **Workforce identity** (operators) | Microsoft Entra ID + SSO + MFA | Internal staff lifecycle, conditional access |
| **Customer identity** (depositors' users) | Entra External ID (separate directory) | Customers must never appear in workforce directory; separate password policy, MFA story, breach blast radius |
| **Tenant directory** (which tenants exist, on which shard, in which region) | Our control-plane PG | Routing concern, not an identity concern |

**Authorization** is policy-based (Open Policy Agent). Roles:
- Customer side: `customer-admin`, `customer-user`, `depositor-driver`, `customer-auditor`.
- Workforce: `warehouse-supervisor`, `warehouse-operator`, `inventory-controller`, `platform-admin`, `platform-auditor`.

**Row-level security** is enforced in PostgreSQL (`USING (tenant_id = current_setting('app.tenant_id')::uuid)`). The connection's session variable is set by the BFF after authn; services cannot bypass RLS.

**API keys** for ERP integrations are scoped per (tenant, integration), rotatable, and visible to the customer admin in the portal.

### 5.11 Edge & device integration

- Handheld scanners and RFID gates publish to the **Edge Gateway**, which batches, deduplicates, and signs scan events before they enter the ledger.
- **Per-device certificates** issued from internal PKI; cert lifetime 90 days; revocation list refreshed every 5 minutes; lost/stolen scanner is revoked immediately and the next scan fails closed.
- **Offline tolerance.** If the dock loses connectivity, scans are buffered locally (SQLite on the gateway box) and replayed in `occurred_at` order with their original timestamps. Each scan carries a per-device monotonic sequence; the ingest service rejects out-of-sequence replays per device.
- **Clock skew.** `occurred_at` is the device clock; `recorded_at` is the DB commit time. The projector and snapshots key on `recorded_at` for monotonicity; `occurred_at` is for forensic / business reporting only. Devices NTP-sync hourly; events with `|occurred_at - recorded_at| > 1h` are flagged for review but not rejected. Offline-replayed batches carry a `replay_batch_id`; the *batch* is reviewed once on arrival, not the thousands of events inside it.
- Weighbridge and dimensioner integrations follow the same gateway pattern.

### 5.12 Notifications and acknowledgement

Notification & Ack consumes domain events from the outbox and fans out:

- **In-app push** (web + mobile) via SignalR.
- **Email** via Azure Communication Services (transactional).
- **SMS** via Twilio + local aggregators (offline-customer case).
- **Webhook** for customers integrating their ERP — signed with HMAC, retried with jitter, dead-lettered after 24h.
- **Printable receipt** as a signed PDF (PAdES) for paper acknowledgement at the dock.

Each notification is **delivery-tracked** (queued → sent → delivered → opened where supported). Notification preferences are per-customer **and per-event-type and per-SKU-tag** (so a pharma customer can subscribe `low-stock` only for cold-chain SKUs).

#### Acknowledgement methods (in order of preference)

1. **OTP-on-release** — code by SMS/email; operator enters at the dock to release. OTP is bound to the `GoodsIssued` event by HMAC.
2. **Signed e-receipt** — customer signs on the operator's tablet (SVG signature, IP, geolocation, device hash) or signs the PDF in the portal.
3. **QR-code release token** — customer's app shows a short-lived signed JWT QR; operator scans.
4. **Paper signature fallback** — printed signed receipt; scanned and stored alongside the event.

#### State machine

```
REQUESTED → APPROVED → STAGED → AWAITING_ACK → ACKNOWLEDGED → RELEASED
            ↘ REJECTED                       ↘ ACK_TIMEOUT (compensate, see §5.12.1)
```

#### 5.12.1 Acknowledgement timeout & compensation

- **Default OTP timeout: 4 hours.** Maximum: 24h on supervisor approval. Rationale: staged goods occupy a staging bin; we cannot block dock space for a day by default.
- On timeout, the system emits a compensating `GoodsStored` event. **Bin reservation policy:** the original source bin is held for the full timeout window; if the bin is released for re-allocation (because the warehouse is at capacity), the compensating event places the goods in the next available compatible bin and emits `GoodsRelocated` referencing the original. Either way, the projector is reconciled and the customer is notified that their withdrawal is cancelled.
- Compensation is itself idempotent on `correlation_id` — a duplicate timeout fire does not double-restock.

### 5.13 Service-level objectives (SLOs)

| Path | Metric | SLO |
|---|---|---|
| Withdrawal write (BFF → COMMIT) | p99 latency | ≤ 250 ms |
| Withdrawal write | success rate | ≥ 99.9 % |
| Current balance read (BFF) | p99 latency | ≤ 150 ms |
| Read Cache freshness (write → cache) | p95 lag | ≤ 2 s |
| Outbox publish (commit → Service Bus) | p99 lag | ≤ 5 s |
| Notification delivery (event → channel send) | p95 | ≤ 30 s |
| OTP delivery (issue → customer phone) | p95 | ≤ 60 s |
| Anchor batch persistence | p99 | ≤ 5 min |
| Reconciliation drift detection | mean time to alert | ≤ 5 min |

Error budget for the withdrawal path: 43 minutes/month. Burn-rate alerts at 2× and 10× target.

The 5-second outbox publish lag is set deliberately above what's technically achievable. Sub-second publish via PostgreSQL `LISTEN/NOTIFY` or logical decoding (Debezium-style) is feasible; we chose periodic polling because the only consumer where sub-second matters (in-app push) tolerates 5 s, and the operational simplicity of a poller — restart-safe, observable, no replication-slot management — outweighs the latency win. We will revisit if a real-time use case emerges.

### 5.14 Security and compliance

- TLS 1.3 in transit; AES-256 at rest with envelope encryption.
- **Customer-managed keys** (CMK) via Azure Key Vault for tenants on the regulated tier.
- **PII separation.** Customer contact details, signatures, and biometric hashes are stored in a separate `pii.*` schema, encrypted with per-tenant DEKs. GDPR/NDPR right-to-erasure removes the PII payload while the ledger retains an event whose `actor_id` becomes a tombstoned reference — sufficient for audit, insufficient to identify the individual.
- All admin actions are logged into the same Merkle-anchored audit stream as the ledger.
- Penetration testing quarterly; SOC 2 Type II attestation in year two.
- **GxP / 21 CFR Part 11.** For pharma tenants, the OTP + PAdES-signed receipt path satisfies Part 11 requirements for electronic signatures: each signature is uniquely bound to one individual (OTP HMAC over `user_id`, `event_id`, timestamp), is not transferable, includes a captured signing reason from a controlled vocabulary, and is recorded in the tamper-evident Merkle-anchored audit (§5.6). EU GMP Annex 11 is satisfied by the same controls.
- **Data residency.** Tenants are pinned to a region in the Tenant Directory; their shard, projector, snapshots, and Blob containers are co-located in-region. Cross-region traffic for a tenant is alertable.

### 5.15 Vendor coupling — honest position

We use Service Bus, Cosmos, Blob immutable storage, Entra, Key Vault, and SignalR. These are operationally expensive to abstract and we do not pretend otherwise. What we *do* commit to:

- All compute is OCI containers on Kubernetes (AKS), portable to EKS/GKE.
- All persistent state is in managed PG, which exists everywhere.
- Service Bus is consumed via a thin port (publish/subscribe) — replaceable with Kafka in 1–2 quarters if forced.
- Blob WORM has no equivalent on every cloud; switching clouds means re-establishing the audit anchor process. We accept this.

We do not claim to be cloud-agnostic. We claim a credible escape path for the workloads, not the dependencies.

---

## 6. Key sequences

### 6.1 Intake (goods received)

1. Driver arrives; operator scans truck/PO → `IntakeSession` opens.
2. Each pallet/SKU scanned → preliminary `GoodsReceived` candidate buffered locally on the Edge Gateway.
3. Operator confirms counts; weighbridge/dimensioner readings attach to the session.
4. Session committed → Edge Gateway POSTs the batch to the API; ledger writes `GoodsReceived` events transactionally. Photos uploaded to Blob first; events reference them by content hash.
5. Outbox publishes; Notify & Ack emails/SMSs the customer with a signed PDF receipt.
6. Customer acknowledges (portal or OTP); intake closes as `ACKNOWLEDGED`.

### 6.2 Partial withdrawal

1. Customer raises a withdrawal request: SKU S, lot L, qty 120 (of 500 originally deposited).
2. Service writes `WithdrawalRequested` → `REQUESTED`.
3. Inventory controller approves → `APPROVED`; pick list generated across bins (FEFO/FIFO per customer policy).
4. Operator picks; each bin pick is a transaction per §5.3, writing `GoodsPicked` and updating the projector. Read Cache reflects the new available qty within ~2s.
5. Goods staged at the dock; status `AWAITING_ACK`; OTP sent.
6. Customer presents OTP; on match, `GoodsIssued` is written, status `RELEASED`.
7. Customer receives signed e-receipt with the new remaining balance ("380 units of S/lot L remain on hand").
8. If OTP times out (default 4h): compensating `GoodsStored` per §5.12.1; customer notified; ledger remains internally consistent.

---

## 7. Capacity & cost model

### 7.1 Sizing assumptions

| Quantity | Value | Note |
|---|---|---|
| Total units in stock | 10⁹ | NFR target |
| Avg units per lot | 100 | Mixed; lots of 1 for serialized, 1000+ for bulk |
| Total active lots | ~10⁷ | 10⁹ ÷ 100 |
| Movement events / day, avg | 10⁷ | Steady state |
| Movement events / day, peak | 5×10⁷ | Seasonal |
| Avg event row size | 1 KB | Bounded by §5.2 |
| Tenants | 10³ | Initial |

### 7.2 Storage projection (7-year retention)

| Store | Hot | Cold (Parquet) |
|---|---|---|
| Ledger | 10⁷ × 1KB × 90 days = ~900 GB online (per shard, ÷ 8 shards = ~115 GB each) | 10⁷ × 1KB × 365 × 7 ≈ **25 TB raw, ~8 TB compressed** in Blob |
| Projector | 10⁷ rows × 500 B = **5 GB** | — |
| Hourly snapshots (last 30 days) | 10⁷ × 24 × 30 × 1KB ≈ **7 TB** | — |
| Daily snapshots (7 years) | 10⁷ × 365 × 7 × 1KB ≈ **25 TB**; compressed ~8 TB | — |
| Anchor batches | minutes × tenants × ~1KB ≈ **negligible** | — |
| Blob (photos, signatures, PDFs) | ~1 % of events × 200 KB × peak load × 7 years ≈ **150–300 TB** Cool tier | — |

### 7.3 Throughput

- Peak 5×10⁷ events/day = ~580/s sustained, ~3K/s peak across 8 shards = ~375/s peak per shard. Comfortably within a single PG primary's range with appropriate hardware (8–16 vCPU, NVMe, sync replica in-AZ + async cross-AZ).
- Service Bus Premium: 1 messaging unit handles ~1K msg/s; provision 4–8 MUs.
- Cosmos read cache: ~5K RU/s baseline, autoscale to 50K RU/s.

### 7.4 Indicative monthly cost (USD, steady-state)

| Item | Estimate |
|---|---|
| Azure DB for PostgreSQL Flexible Server, 8 shards × ~16 vCPU + replicas | $18–25 K |
| Azure Service Bus Premium (4 MU) | $3 K |
| Azure Blob (Hot + Cool + Archive, ~250 TB blended) | $4–6 K |
| Cosmos DB Read Cache (autoscale) | $3–6 K |
| AKS compute (services, projector, anchor, notify) | $8–12 K |
| SendGrid + Twilio (notifications, OTPs) | $3–8 K usage-based |
| Observability (Log Analytics, App Insights) | $3–5 K |
| Entra External ID, Key Vault, misc | $1–2 K |
| **Total (steady state)** | **~$45–65 K / month** |

This excludes: peak-season burst (autoscale up to ~+50%), multi-region DR replicas (~+30%), customers on dedicated infrastructure (billed-through), customer-managed-key (CMK) overhead for regulated tenants (~$1–2/key/month plus operations cost), and inter-region egress for cross-region replication (~$0.02/GB at Azure list price).

---

## 8. Latency budget — withdrawal write path

Target: p99 **≤ 250 ms** end-to-end (BFF in → response out).

| Stage | p50 | p99 | Notes |
|---|---|---|---|
| Network (client → BFF, in region) | 5 | 15 | TLS established |
| BFF: authn, tenant resolve, RBAC | 3 | 10 | Tenant directory cached |
| Connection acquire from pool | <1 | 3 | Pre-warmed pool |
| `BEGIN` + `SELECT FOR UPDATE` on projector | 3 | 10 | Single indexed row, RAM-resident |
| Application validation | <1 | 2 | |
| `INSERT` into ledger.events | 3 | 8 | UUIDv7 keeps insert sequential |
| `UPDATE` projector | 2 | 6 | Single row |
| `INSERT` into outbox | 2 | 5 | |
| `COMMIT` (sync replica in-AZ) | 8 | 30 | Dominant cost |
| Hash / signature on response | 1 | 3 | |
| Network (BFF → client) | 5 | 15 | |
| **Total** | **~32 ms** | **~107 ms** | Headroom against 250 ms SLO |

The 250 ms SLO leaves >2× headroom for tail effects (GC, pool exhaustion, retried connection, lock wait under contention). The dominant variable is `COMMIT` durability mode; we accept sync in-AZ + async cross-region as the durability/latency point.

Read path (current balance) has no lock and serves from the projector or Read Cache: p99 budget ~50 ms, well under the 150 ms SLO.

---

## 9. Consequences

### 9.1 Positive

- **Provable correctness** of the deposit/withdraw/remaining invariant, end to end, with strict serializability where it matters and no cross-store transactions.
- **Auditability** strong enough for regulated customers — Merkle-anchored, RFC 3161 timestamped, immutable-blob archived, with no per-tenant write serialization.
- **Bounded historical queries** via snapshots; "as-of" answers are O(1 hour of events) regardless of retention depth.
- **Independent scaling** of write path (ledger + projector co-located) and read path (Read Cache + projector replicas).
- **Tenant isolation** enforced at the data plane via RLS, not just the application layer.
- **Notification + acknowledgement** is a first-class state machine with explicit compensation.
- **Replayable history**: any projection corruption is recoverable from the ledger; no "we lost the numbers" failure mode.
- **Operationally honest** about vendor coupling and what we will and won't abstract.

### 9.2 Negative / costs

- **Higher initial complexity** than a CRUD-on-relational design. Engineers must learn event sourcing, CQRS, idempotency, outbox, and snapshot replay.
- **Schema discipline is non-negotiable** — once an event is published, its schema is forever (§5.8). Mistakes are expensive.
- **Operational surface area** is larger: more services, more queues, more dashboards, more reconciliation jobs.
- **Eventual consistency on display** can confuse users; the UI must surface "as of HH:MM:SS" timestamps and use optimistic-update patterns honestly.
- **Cost** (~$50K/month at steady state) is meaningfully higher than a single-DB monolith and only justified by the multi-tenant scale and audit requirements.

### 9.3 Risks and mitigations

| Risk | Mitigation |
|---|---|
| Hot-tenant noisy-neighbor | Per-tenant rate limits at gateway; per-tenant pool quotas; fast-track to dedicated shard |
| Projector drift from ledger | 5-min rolling checksum + nightly full recompute; non-zero delta = P1 |
| Lost notification delivery | Multi-channel fan-out + delivery receipts + retry with DLQ + portal fallback view |
| Wrong qty at intake | Mandatory dual-scan (barcode + weight) for high-value SKUs; supervisor approval for outliers |
| Acknowledgement bypass / fraud | OTPs HMAC-bound to event IDs; signed PDFs (PAdES); Merkle-anchored audit; supervisor approval to release without ack |
| Schema mistake locked in forever | Schema review on every PR; v1 of every event spends 30 days behind a feature flag with internal tenants only |
| Anchor pipeline backlog | Anchor lag is an SLO with paged alerts; backlog drains in a separate process pool; ledger writes never block on it |
| Region failure | Sync replica in-AZ + async replica cross-region; documented failover runbook; quarterly DR drills |
| Regulatory data-residency | Per-tenant region pin in directory; cross-region traffic alerts |
| Vendor coupling | See §5.15 — managed honestly, not pretended away |

---

## 10. Out of scope for this ADR (future ADRs)

- ADR-0002: Mobile/handheld application architecture (offline-first sync, conflict resolution UX).
- ADR-0003: Customer billing rate plans and invoicing system (this ADR fixes the *shape* of billing events, not the *prices*).
- ADR-0004: Customs / bonded warehousing extensions.
- ADR-0005: Active-active multi-region for the largest tenants.
- ADR-0006: AI/ML — demand forecasting, anomaly detection, computer-vision intake.
- ADR-0007: Public REST/GraphQL API surface for customer ERP integrations beyond webhooks.

---

## 11. Resolved during design (kept for traceability)

1. **Fungible vs serialized goods.** Lot model accommodates both via `unit_of_measure` and optional serial-number array on the lot. Confirmed sufficient for grain (fungible) and electronics (serialized); pharma serialization (GS1 SGTIN) fits. Resolved.
2. **Ownership transfer without physical movement** — `OwnershipTransferred` event is in §5.2. Resolved.
3. **Legal weight of e-acknowledgement per jurisdiction.** OTP + signed PDF (PAdES) is sufficient under eIDAS, ESIGN, NDPR. For markets without statutory recognition (small list), paper signature fallback (§5.12) is mandated.
4. **Public API at launch?** Webhook + portal only at GA; full public REST/GraphQL is ADR-0007.
5. **Numeric precision for `quantity`.** `NUMERIC(20,3)` accommodates grain (kg to 3 dp) through individual units. Confirmed.

---

## 12. References

- Fowler, *Event Sourcing*; Vernon, *Implementing Domain-Driven Design*; Young, *CQRS Documents*.
- Microsoft Azure Architecture Center — *Multitenant SaaS patterns*; *Transactional Outbox*; *CQRS*; *Materialized View*.
- RFC 3161 — *Internet X.509 Time-Stamp Protocol*.
- ISO 28000 (supply chain security); WCO SAFE Framework (customs-bonded use cases).
- GS1 standards — SKU, lot, serial number encoding (SSCC, GTIN, SGTIN).
- ETSI EN 319 142 — *PAdES*: PDF Advanced Electronic Signatures.
