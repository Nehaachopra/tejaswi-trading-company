# Project Introduction — Tejaswi Trading Company EMS

## 1. What We Are Building

I want to build a complete **Enterprise Management System (EMS)** for **Tejaswi Trading Company**, a wholesale grocery business that deals primarily in rice.

The application will help us manage our daily business operations in one place, including sales, purchases, inventory, customers, suppliers, payments, receipts, and accounting.

The application should be practical for everyday use in a wholesale business. It should make entering transactions fast and simple while maintaining accurate inventory and financial records.

## 2. Technology Stack and Project Structure

This project uses a **tRPC monorepo architecture**.

The project is organized into applications and shared packages. The existing structure includes:

- `apps/web` — Frontend application built with Next.js and React.
- `apps/api` — Backend application using tRPC.
- `packages/database` — Database schema, models, relations, and database configuration.
- `packages/services` — Shared business logic and services.
- `packages/trpc` — tRPC routers and API procedures.

The project uses TypeScript, Drizzle ORM, PostgreSQL, and shadcn components.

**Important:** First inspect the existing repository and understand its actual structure, conventions, database schema.

## 3. Main Business Operations

The system should support the following operations:

- **Products:** Manage products, categories, subcategories, brands, pack sizes, prices, and GST rates. Hierarchy is category → sub-category → brand (e.g. rice → sona masoori → aishwarya); pack size (25 kg, 50 kg) is the variant under the brand. "Pack size" is the term everywhere (not "unit quantity" / "unit size"). Brand is a column on products, not a table. Product name is residual: used only when category, sub-category and brand don't fully describe the product. All product data (category, sub-category, brand, name) is stored in lowercase.
- **Sales:** Refer .claude/pages/create-transaction/sale/sale.md.
- **Purchases:** Refer .claude/pages/create-transaction/purchase.md.
- **Sale Returns:** Record goods returned by customers and link returns to their original sale wherever applicable.
- **Purchase Returns:** Record goods returned to suppliers and link returns to their original purchase wherever applicable.
- **Receipts:** Record money received from customers and other sources.
- **Payments:** Record money paid to suppliers and other parties.
- **Deposits and Withdrawals:** Record relevant cash and bank movements.
- **Drawings:** Record money or other business assets withdrawn by the owner for personal use.
- **Other Transactions:** Record additional business transactions that do not fit into the categories above.
- **Inventory:** Track stock quantities across different godowns, stock movements, adjustments, and reconciliation.
- **Parties:** Manage customers, suppliers, and other business parties, including their contact details, addresses, GSTINs, and outstanding balances.
- **Accounts:** Maintain ledgers, ledger groups, financial transactions, and reports.

Basically from accounting point of view, transaction is journal entry. After each transaction, entry needs to be posted in ledger!

- Every transaction and its ledger entries are written in the same database transaction — all or nothing.
- Receipts and payments reduce the party's running balance. No bill-wise matching.

# Modules

Routers and services are named by these five modules:

1. **Transactions** — all home-page pills (sale, purchase, receipt, payment, deposit, withdrawal, drawings, returns, other) plus sale and purchase orders.
2. **Accounts** — ledgers, receivables and payables, parties, bank and cash, statements, GST.
3. **Analytics** — read-only insight.
4. **Inventory** — product master, godowns, stock, stock count.
5. **Admin** — staff and roles, behind passkey elevation.

# Ledger structure

Ledger group → ledger master (optional) → ledger → ledger entries.

- Example: asset → debtors → Suresh (ledger references the party). A party that is also a creditor gets a second ledger under liability → creditors.
- Not every ledger needs a master (e.g. sale).
- Balances can be debit or credit.
- Ledger entries store no running balance: entries can be pre- or post-dated, so a statement adds the balance up in date order when it is read. `ledgers.balance` is the total of all entries, post-dated ones included; lists show the balance as of today with a "+ ₹X post-dated" note when any exist.
- Contra entries are business money moving from one form to another, both sides business assets: cash in hand → bank (deposit), bank → cash in hand (withdrawal), and one bank account → another (transfer).

The app creates this accounting structure itself:

| Group | Masters | Fixed ledgers |
|---|---|---|
| Asset | Debtors, Bank (one ledger per bank account) | Cash, Input CGST, Input SGST, Input IGST, TDS receivable (TDS customers deduct from us) |
| Liability | Creditors, Employees (one ledger per employee: salary owed to them; an advance shows as what they owe us) | Output CGST, Output SGST, Output IGST, Output CGST (RCM), Output SGST (RCM), Output IGST (RCM), TDS payable (TDS we deduct from others), TCS, Drawings |
| Income | — | Sale, Sale return, Discount received |
| Expense | — | Salary, Purchase, Purchase return, Discount given, Rent, Electricity, Wifi expense |
| Profit / Loss | — | none, calculated |

Reverse-charge GST (e.g. rent from an unregistered landlord) is kept in its own RCM output ledgers, never mixed with the normal output GST ledgers, so it is easy to report in GSTR-3B.

# Data

- No seed or sample data, ever. If a feature needs data (products, parties, stock), build its entry screen first so real data can be typed in. The only exception is the accounting structure above.

# roles

There are just 2 roles (there is no accountant role) - 
1. admin - full access; the only role that sees balances and Accounts
2. staff - limited access

- Permissions for each role are fixed in code; there is no editable permission matrix.
- Assigning staff means assigning a role only (no godown or task assignment).

# Services

- OTP SMS via MSG91. It needs a DLT number, which we don't have yet; until then use a temporary delivery workaround that keeps the login flow identical. The first admin's phone number is `PHONE_NUMBER` in `.env`.
- File storage on Cloudflare R2.

# Things to keep in mind 

- I want this application in 3 languages - Kannada, english and hindi!

- We always build admin part first!

- I want this project to be mobile first! I want to prove that modern systems are so powerful that they can be easily accessed on mobile phones! I want to add convinience!

- backend first, frontend later for every feature.

- Try using shadcn pre built components. But nothing strict. You can always create your own components. But consistency in style is the only thing i value.

# Fun facts

- I have shared cute logo already.
- I have also done the hardwork of choosing shadcn prset and downloading components.