# How to use the Tootechy Warehouse Management Solution

A simple, plain-English guide for warehouse staff and customers. No technical knowledge required.

> **For the live demo:** open <https://warehouse-management-lab.vercel.app>. Demo logins are listed on the sign-in page — one click to try it.

---

## What this app does (in 30 seconds)

You (or your customer) bring goods to a warehouse. The warehouse stores them. Later, someone returns to collect **some or all** of the goods. This app keeps track of:

1. **What was deposited** — how much, when, what kind of goods.
2. **What was taken out** — how much, when, by whom.
3. **What's still in the warehouse** — updated automatically and visible in real time.
4. **A signed receipt for every movement** — so there's never a dispute about "how much is left."

Think of it as a digital coat-check that handles partial collections. You can come back today for *some* of what you deposited and tomorrow for the rest — the system always knows what's still on the rack.

---

## Two kinds of user

| You are… | You see… |
|---|---|
| **Customer** (depositor) — the company or person whose goods are stored | Your own lots, your own balances, a button to request withdrawals |
| **Operator** (warehouse staff) | All customers and all their goods, plus controls to receive and release |

The app shows you only what your role allows. Customers cannot see other customers' goods. Operators can see everything.

---

# Part 1 — For Customers (Depositors)

## Step 1 · Sign in

1. Open the website your warehouse operator gave you. *(For the demo: <https://warehouse-management-lab.vercel.app>)*
2. Click **Sign in** (top right corner, or the blue button on the home page).
3. Enter your email and password. *(Demo: `alice@acmefoods.demo` / `demo1234`)*
4. Click **Sign in**.

You'll land on **your dashboard**.

## Step 2 · See what you have in storage

On the dashboard you'll see:

- **Three summary cards** at the top: total units stored, number of lots, pending withdrawal requests.
- **"Your lots" table** — every batch of goods you've deposited:
  - **Lot** — a unique code like `LOT-RICE-2026-001`
  - **SKU** — what the item is (e.g., "Premium Basmati Rice 50kg bag")
  - **Initial** — how much you originally deposited
  - **On hand** — how much is still in the warehouse *(this number is the live truth)*
  - **Withdrawn** — how much you've already collected
  - **Expiry** — if the goods expire, when

The little blue bar next to the on-hand number visually shows how much is left vs how much you started with.

## Step 3 · Ask to collect some of your goods

When you want to take part of a lot out:

1. Click **Request a withdrawal** (blue button on the dashboard, or the menu link).
2. **Pick a lot** from the dropdown.
3. **Type the quantity** you want to collect. Any amount up to the on-hand balance is allowed.
4. (Optional) **Add a note** — for example, the name of the driver who will pick the goods up.
5. Click **Submit request**.

You're taken to a page showing the request with status **"Requested"**. Warehouse staff see it instantly.

## Step 4 · Wait for the warehouse to approve

The operator reviews your request. When they approve it:

- Your request status changes to **"Awaiting ack"** *(short for "awaiting your acknowledgement")*.
- A 6-digit **release code** is emailed to you. *(In the demo, the operator can also see this code on their own screen so the demo always works without email setup.)*

## Step 5 · Acknowledge and release

When you (or your driver) arrive at the warehouse to pick up:

1. Open your withdrawal request page on your phone. *(There's a link to it from your dashboard.)*
2. **Type the 6-digit release code** into the box.
3. Click **Acknowledge & release goods**.

The status flips to **"Released"**. Your dashboard updates instantly — the "On hand" number drops by exactly the amount you took, and the blue bar shrinks.

## Step 6 · Download your receipt

After release:

- A green banner appears at the top: **Download signed receipt**.
- Click it. A PDF opens in your browser. Save or print it.

The receipt shows the lot code, what was released, how much is still on hand, and a unique reference number tied to the warehouse's tamper-proof records.

## When something goes wrong (Customer)

| Problem | What to do |
|---|---|
| **I forgot the release code.** | Ask the operator. They can see it on their screen and read it to you. |
| **The system says "invalid OTP."** | Check the digits — it's six numbers, no spaces. Codes expire after 4 hours; if yours is older, ask the operator to re-issue. |
| **My new deposit doesn't show on the dashboard.** | Wait a couple of seconds and the page should update on its own. If not, refresh once. |
| **I want to cancel my request.** | Tell the operator *before* they approve. After approval, the goods are reserved for you and the request can only be cancelled by warehouse admin. |

---

# Part 2 — For Operators (Warehouse Staff)

## Step 1 · Sign in

1. Open the website. *(For the demo: <https://warehouse-management-lab.vercel.app>)*
2. Click **Sign in**.
3. Enter your email and password. *(Demo: `ops@warehouse.demo` / `demo1234`)*
4. Click **Sign in**.

You'll land on the **operator dashboard** — a different view from customers, showing every customer and every lot.

## Step 2 · Receive new goods (Intake)

When a customer's truck arrives:

1. Click **Intake** in the menu.
2. Fill in the form:
   - **Customer** — which customer the goods belong to.
   - **SKU** — the type of item.
   - **Lot code** — a unique code you assign, e.g., `LOT-RICE-2026-005`. This will identify this batch forever.
   - **Quantity** — how much was actually delivered.
   - **Expiry** *(optional)* — if the goods expire.
   - **Notes / location** *(optional)* — where in the warehouse it's stored, e.g., "Zone A, rack 12".
3. Click **Receive goods**.

The customer's dashboard updates immediately — the new lot appears for them with the full quantity.

## Step 3 · See pending withdrawal requests

The dashboard's **"Pending withdrawals"** card lists every request waiting for you.

1. Click **Open →** next to a request.
2. The detail page shows the customer, the lot, the requested quantity, the current on-hand balance, and when it was requested.

## Step 4 · Approve (or reject) a request

If the request looks good:

1. Click **Approve & issue OTP**.
2. The system, in one atomic step:
   - Locks the lot so two operators cannot accidentally over-issue it.
   - Reduces the on-hand count by the requested amount *(the goods are now "reserved")*.
   - Generates a 6-digit release code.
   - Emails the code to the customer.
   - Shows the code on your screen too, so the demo always works.
3. The status flips to **"Awaiting ack"**.

If something's wrong (wrong customer, suspicious request, customer just called to cancel):

1. Type a short reason in the **"reject with reason"** box.
2. Click **Reject**.

The customer is notified; the goods stay exactly where they were.

## Step 5 · When the customer arrives at the dock

1. The customer (or their driver) shows up to collect.
2. The customer opens their withdrawal page on their phone and types the 6-digit code they received.
3. The moment they tap **Acknowledge & release goods**, the status on **your** screen flips from "Awaiting ack" to **"Released"** — in real time.
4. Hand over the goods.
5. A **Download release receipt** link appears on your screen. The customer also sees it on theirs. Either of you can save the PDF for records.

> If the customer can't use their phone, read them the link to their withdrawal page from your screen, or in the production system an "operator enters OTP for the customer" mode can be enabled.

## Step 6 · Daily habits worth building

- **First thing in the morning:** scan the "Pending withdrawals" list for anything from yesterday still in "Awaiting ack." Codes expire after 4 hours; older ones need to be re-issued.
- **End of day:** glance at "Recent movements" — confirm what came in and went out today matches your dock notes.

## When something goes wrong (Operator)

| Problem | What to do |
|---|---|
| **Customer says they didn't get the email.** | The release code is on your screen on the withdrawal detail page. Read it to them. (For the live demo, real emails are optional; the on-screen code always works.) |
| **I approved by mistake.** | The customer's code will expire in 4 hours and the goods automatically return to the lot. For urgent reversal, contact admin. |
| **A request disappeared.** | Refresh the page. Auto-update is on, but a network blink can leave a stale view. |
| **Two of us approved the same request at the same time.** | The system prevents it — only one approval can lock a lot at a time. The second operator will see an error and just needs to refresh. |
| **An "insufficient stock" error.** | Means another withdrawal already used some of that lot. The on-hand number on screen is now correct; ask the customer to re-submit for the smaller amount. |

---

# Quick glossary

- **Lot** — a specific batch of goods deposited together. Identified by a unique code.
- **SKU** — Stock Keeping Unit. The kind of item (e.g., "50 kg rice bag"). One SKU can have many lots.
- **Withdrawal** — the customer's request to collect part or all of a lot.
- **Acknowledgement / "ack"** — the customer confirming, with a release code, that they're collecting the goods.
- **Release code / OTP** — a 6-digit number that proves the customer is the right person to collect.
- **On hand** — how much is currently in the warehouse, available to collect.
- **Ledger** — the running list of every event that ever happened to a lot. Like a bank statement, but for goods.

---

# Five tips for a great first session

1. **Open two browsers side by side** — one as operator, one as customer (use a private/incognito window for the second). You'll see both sides of the same transaction at once. This is the fastest way to learn the flow.
2. **Use small test quantities first.** Request 5 of 500. Faster to learn with low stakes.
3. **The on-screen release code is by design** — it makes the demo work without email setup. In production you can hide it from operators so only the customer ever sees it.
4. **Refresh if anything looks stale.** It almost never will — pages update on their own — but a refresh costs nothing and rules out a network glitch.
5. **The receipts are real PDFs.** Save them. Each one is signed, numbered, and linked to a tamper-proof record on the warehouse's audit ledger.

---

If you get stuck, contact your account manager at **Tootechy IT Professional Services**.
