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

- **Products:** Manage products, categories, subcategories, brands, unit sizes, prices, and GST rates.
- **Sales:** Refer .claude/pages/sale.
- **Purchases:** Refer .claude/pages/purchase.md.
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

# roles

There are just 3 roles - 
1. admin - full access
2. accountant - wider access
3. staff - limited access

# Things to keep in mind 

- I want this application in 3 languages - Kannada, english and hindi!

- We always build admin part first!

- I want this project to be mobile first! I want to prove that modern systems are so powerful that they can be easily accessed on mobile phones! I want to add convinience!

- backend first, frontend later for every feature.

- Try using shadcn pre built components. But nothing strict. You can always create your own components. But consistency in style is the only thing i value.

# Fun facts

- I have shared cute logo already.
- I have also done the hardwork of choosing shadcn prset and downloading components.