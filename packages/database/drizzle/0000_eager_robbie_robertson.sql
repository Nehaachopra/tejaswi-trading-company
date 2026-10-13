CREATE TYPE "public"."ledger_transaction_type" AS ENUM('debit', 'credit');--> statement-breakpoint
CREATE TYPE "public"."ledger_group_type" AS ENUM('asset', 'expense', 'loss', 'liability', 'income', 'profit');--> statement-breakpoint
CREATE TYPE "public"."bank_account_type" AS ENUM('savings', 'current', 'cash_credit', 'overdraft');--> statement-breakpoint
CREATE TYPE "public"."godown_ownership" AS ENUM('rented', 'owned');--> statement-breakpoint
CREATE TYPE "public"."unit_quantity_code_enum" AS ENUM('KGS', 'ML', 'BOX', 'PCS');--> statement-breakpoint
CREATE TYPE "public"."stock_count_status" AS ENUM('in_progress', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."drawing_type_enum" AS ENUM('cash', 'product');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('sale', 'purchase', 'sale_return', 'purchase_return', 'payment', 'receipt', 'drawing', 'deposit', 'withdrawal', 'other');--> statement-breakpoint
CREATE TYPE "public"."address_type" AS ENUM('billing', 'shipping', 'both', 'registered');--> statement-breakpoint
CREATE TYPE "public"."app_user_role" AS ENUM('admin', 'staff', 'accountant');--> statement-breakpoint
CREATE TYPE "public"."gst_place_of_supply" AS ENUM('01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '26', '27', '29', '30', '31', '32', '33', '34', '35', '36', '37', '38', '97', '99');--> statement-breakpoint
CREATE TYPE "public"."gst_type" AS ENUM('cgst', 'sgst', 'igst');--> statement-breakpoint
CREATE TYPE "public"."invoice_type" AS ENUM('regular', 'sez', 'deemed', 'export');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'fulfilled', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."product_type" AS ENUM('stock', 'non_stock');--> statement-breakpoint
CREATE TYPE "public"."return_type" AS ENUM('exchange', 'cash');--> statement-breakpoint
CREATE TYPE "public"."settled_in" AS ENUM('cash', 'bank');--> statement-breakpoint
CREATE TYPE "public"."supply_type" AS ENUM('inter', 'intra');--> statement-breakpoint
CREATE TYPE "public"."transacted_in" AS ENUM('cash', 'credit', 'both');--> statement-breakpoint
CREATE TABLE "ledgers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"ledger_master_id" uuid NOT NULL,
	"date_time" timestamp with time zone DEFAULT now() NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"transaction_type" "ledger_transaction_type",
	"balance" numeric(15, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_amount_and_balance_non_negative" CHECK ("ledgers"."amount" >= 0 AND "ledgers"."balance" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ledger_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "ledger_group_type" NOT NULL,
	"name" varchar(30) NOT NULL,
	"balance" numeric(15, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_groups_balance_non_negative" CHECK ("ledger_groups"."balance" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ledger_masters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(30) NOT NULL,
	"ledger_group_id" uuid NOT NULL,
	"reference_table" varchar(30),
	"reference_id" uuid,
	"balance" numeric(15, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_master_balance_non_negative" CHECK ("ledger_masters"."balance" >= 0)
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "two_factors" (
	"id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" text NOT NULL,
	"verified" boolean DEFAULT true,
	"failed_verification_count" integer DEFAULT 0,
	"locked_until" timestamp
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"two_factor_enabled" boolean DEFAULT false,
	"role" "app_user_role" DEFAULT 'staff' NOT NULL,
	"photo_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_details" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_holder_name" varchar(255) NOT NULL,
	"bank_name" varchar(100) NOT NULL,
	"branch_name" varchar(100) NOT NULL,
	"account_number" varchar(30) NOT NULL,
	"ifsc_code" varchar(11) NOT NULL,
	"account_type" "bank_account_type" NOT NULL,
	"upi_id" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_details_ifsc_format" CHECK ("bank_details"."ifsc_code" ~ '^[A-Z]{4}0[A-Z0-9]{6}$')
);
--> statement-breakpoint
CREATE TABLE "godowns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"godown_name" varchar(20) NOT NULL,
	"ownership" "godown_ownership" DEFAULT 'rented' NOT NULL,
	"rent" numeric(15, 2),
	"rent_timing_in_months" integer,
	"used_from" timestamp with time zone,
	"landlord_id" uuid,
	"landlord_name" varchar(255) NOT NULL,
	"landlord_country_code" varchar(5),
	"landlord_number" varchar(20),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "godowns_rented_requires_rent" CHECK ("godowns"."ownership" <> 'rented'
      OR ("godowns"."rent" IS NOT NULL AND "godowns"."rent" > 0)),
	CONSTRAINT "godowns_owned_has_no_rental_details" CHECK ("godowns"."ownership" <> 'owned'
      OR (
        "godowns"."rent" IS NULL
        AND "godowns"."rent_timing_in_months" IS NULL
        AND "godowns"."landlord_id" IS NULL
      )),
	CONSTRAINT "godowns_rent_duration_positive" CHECK ("godowns"."rent_timing_in_months" IS NULL
      OR "godowns"."rent_timing_in_months" > 0),
	CONSTRAINT "landlord_contact_fields_together" CHECK (
    ("godowns"."landlord_country_code" IS NULL)
    = ("godowns"."landlord_number" IS NULL)
  )
);
--> statement-breakpoint
CREATE TABLE "product_godowns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"godown_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"reserved_quantity" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"unreserved_quantity" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_godowns_quantities_non_negative" CHECK ("product_godowns"."quantity" >= 0
        AND "product_godowns"."reserved_quantity" >= 0
        AND "product_godowns"."unreserved_quantity" >= 0),
	CONSTRAINT "product_godowns_quantity_consistency" CHECK ("product_godowns"."quantity" = "product_godowns"."reserved_quantity" + "product_godowns"."unreserved_quantity")
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" varchar(30) NOT NULL,
	"party_id" uuid NOT NULL,
	"ordered_by_id" text,
	"ordered_by_name" varchar(255) NOT NULL,
	"expected_delivery_date" date,
	"subtotal" numeric(15, 2) DEFAULT '0' NOT NULL,
	"discount_amount" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"gst_amount" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"total_amount" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"order_date" date DEFAULT now() NOT NULL,
	"remarks" varchar(1000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_orders_amounts_non_negative" CHECK (
        "purchase_orders"."subtotal" >= 0
        AND "purchase_orders"."discount_amount" >= 0
        AND "purchase_orders"."gst_amount" >= 0
        AND "purchase_orders"."total_amount" >= 0
      ),
	CONSTRAINT "purchase_orders_discount_within_subtotal" CHECK ("purchase_orders"."discount_amount" <= "purchase_orders"."subtotal"),
	CONSTRAINT "purchase_orders_total_consistent" CHECK (
        "purchase_orders"."total_amount" =
        "purchase_orders"."subtotal"
        - "purchase_orders"."discount_amount"
        + "purchase_orders"."gst_amount"
      )
);
--> statement-breakpoint
CREATE TABLE "purchase_order_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_product_id" uuid NOT NULL,
	"vehicle_number" varchar(15),
	"quantity_delivered" integer NOT NULL,
	"delivery_date" date DEFAULT now() NOT NULL,
	"ordered_by_id" varchar,
	"ordered_by_name" varchar(255) NOT NULL,
	"remarks" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_order_deliveries_quantity_positive" CHECK ("purchase_order_deliveries"."quantity_delivered" > 0)
);
--> statement-breakpoint
CREATE TABLE "purchase_order_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"party_address_id" uuid,
	"quantity_ordered" integer NOT NULL,
	"gross_product_price" numeric(15, 2) NOT NULL,
	"discount_amount" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"gst_rate" integer NOT NULL,
	"gst_amount" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"remarks" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_order_products_quantity_ordered_positive" CHECK ("purchase_order_products"."quantity_ordered" > 0),
	CONSTRAINT "purchase_order_products_purchase_price_non_negative" CHECK ("purchase_order_products"."gross_product_price" >= 0),
	CONSTRAINT "purchase_order_products_discount_amount_valid" CHECK ("purchase_order_products"."discount_amount" <= "purchase_order_products"."gross_product_price"),
	CONSTRAINT "purchase_order_products_gst_amount_non_negative" CHECK ("purchase_order_products"."gst_amount" >= 0),
	CONSTRAINT "purchase_order_products_gst_rate_valid" CHECK ("purchase_order_products"."gst_rate" >= 0 AND "purchase_order_products"."gst_rate" <= 100)
);
--> statement-breakpoint
CREATE TABLE "sale_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" varchar(30) NOT NULL,
	"party_id" uuid NOT NULL,
	"ordered_by_id" text,
	"ordered_by_name" varchar(255) NOT NULL,
	"expected_delivery_date" date,
	"subtotal" numeric(15, 2) DEFAULT '0' NOT NULL,
	"discount_amount" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"gst_amount" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"total_amount" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"order_date" date DEFAULT now() NOT NULL,
	"remarks" varchar(1000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sale_orders_amounts_non_negative" CHECK (
        "sale_orders"."subtotal" >= 0
        AND "sale_orders"."discount_amount" >= 0
        AND "sale_orders"."gst_amount" >= 0
        AND "sale_orders"."total_amount" >= 0
      ),
	CONSTRAINT "sale_orders_discount_within_subtotal" CHECK ("sale_orders"."discount_amount" <= "sale_orders"."subtotal"),
	CONSTRAINT "sale_orders_total_consistent" CHECK (
        "sale_orders"."total_amount" =
        "sale_orders"."subtotal"
        - "sale_orders"."discount_amount"
        + "sale_orders"."gst_amount"
      )
);
--> statement-breakpoint
CREATE TABLE "sale_order_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_product_id" uuid NOT NULL,
	"vehicle_number" varchar(15),
	"quantity_delivered" integer NOT NULL,
	"delivery_date" date DEFAULT now() NOT NULL,
	"ordered_by_id" varchar,
	"ordered_by_name" varchar(255) NOT NULL,
	"remarks" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sale_order_deliveries_quantity_positive" CHECK ("sale_order_deliveries"."quantity_delivered" > 0)
);
--> statement-breakpoint
CREATE TABLE "sale_order_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"party_address_id" uuid,
	"quantity_ordered" integer NOT NULL,
	"gross_product_price" numeric(15, 2) NOT NULL,
	"discount_amount" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"gst_rate" integer NOT NULL,
	"gst_amount" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"remarks" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sale_order_products_quantity_ordered_positive" CHECK ("sale_order_products"."quantity_ordered" > 0),
	CONSTRAINT "sale_order_products_sale_price_non_negative" CHECK ("sale_order_products"."gross_product_price" >= 0),
	CONSTRAINT "sale_order_products_discount_amount_valid" CHECK ("sale_order_products"."discount_amount" <= "sale_order_products"."gross_product_price"),
	CONSTRAINT "sale_order_products_gst_amount_non_negative" CHECK ("sale_order_products"."gst_amount" >= 0),
	CONSTRAINT "sale_order_products_gst_rate_valid" CHECK ("sale_order_products"."gst_rate" >= 0 AND "sale_order_products"."gst_rate" <= 100)
);
--> statement-breakpoint
CREATE TABLE "parties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(150) NOT NULL,
	"country_code" varchar(5) DEFAULT '+91' NOT NULL,
	"phone" varchar(20),
	"email" varchar(254),
	"pan" varchar(10),
	"is_active" boolean DEFAULT true NOT NULL,
	"remarks" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "party_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"party_id" uuid NOT NULL,
	"label" varchar(100),
	"address_type" "address_type" DEFAULT 'both' NOT NULL,
	"address_line_1" varchar(200) NOT NULL,
	"address_line_2" varchar(200),
	"landmark" varchar(150),
	"city" varchar(100) NOT NULL,
	"district" varchar(100) NOT NULL,
	"state" varchar(100) NOT NULL,
	"state_code" "gst_place_of_supply" NOT NULL,
	"postal_code" varchar(6) NOT NULL,
	"country" varchar(45) DEFAULT 'india' NOT NULL,
	"gstin" varchar(15),
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(50) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"sub_category_id" uuid NOT NULL,
	"name" varchar(50) NOT NULL,
	"unit_quantity_code" "unit_quantity_code_enum" NOT NULL,
	"unit_quantity" integer NOT NULL,
	"hsn_4_digit" varchar(4),
	"hsn_8_digit" varchar(8),
	"image_url" text,
	"quantity" integer DEFAULT 0 NOT NULL,
	"reserved_quantity" integer DEFAULT 0 NOT NULL,
	"unreserved_quantity" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_unit_quantity_positive" CHECK ("products"."unit_quantity" > 0),
	CONSTRAINT "products_quantity_non_negative" CHECK ("products"."quantity" >= 0),
	CONSTRAINT "products_reserved_quantity_non_negative" CHECK ("products"."reserved_quantity" >= 0),
	CONSTRAINT "products_quantity_consistent" CHECK ("products"."quantity" = "products"."reserved_quantity" + "products"."unreserved_quantity")
);
--> statement-breakpoint
CREATE TABLE "product_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"price_before_gst" numeric(15, 2) NOT NULL,
	"gst_percent" numeric(3, 2) NOT NULL,
	"gst_amount" numeric(15, 2) NOT NULL,
	"price_after_gst" numeric(15, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_prices_before_gst_non_negative" CHECK ("product_prices"."price_before_gst" >= 0),
	CONSTRAINT "product_prices_gst_amount_non_negative" CHECK ("product_prices"."gst_amount" >= 0),
	CONSTRAINT "product_prices_after_gst_non_negative" CHECK ("product_prices"."price_after_gst" >= 0),
	CONSTRAINT "product_prices_gst_rate_valid" CHECK ("product_prices"."gst_percent" >= 0 AND "product_prices"."gst_percent" <= 100),
	CONSTRAINT "product_prices_total_consistent" CHECK ("product_prices"."price_after_gst" = "product_prices"."price_before_gst" + "product_prices"."gst_amount")
);
--> statement-breakpoint
CREATE TABLE "sub_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"name" varchar(50) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sub_category_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sub_category_id" uuid NOT NULL,
	"name" varchar(50) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_counts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "stock_count_status" DEFAULT 'in_progress' NOT NULL,
	"counted_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_count_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_count_id" uuid NOT NULL,
	"godown_id" uuid,
	"godown_name" varchar(20) NOT NULL,
	"product_id" uuid NOT NULL,
	"system_quantity" integer NOT NULL,
	"counted_quantity" integer NOT NULL,
	"remarks" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_count_godown_product_unique" UNIQUE("stock_count_id","godown_id","product_id"),
	CONSTRAINT "stock_count_quantities_non_negative" CHECK ("stock_count_products"."system_quantity" >= 0
    AND "stock_count_products"."counted_quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "deposits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assigned_id" varchar(30) NOT NULL,
	"transaction_id" uuid NOT NULL,
	"reference_number" varchar(30),
	"bank_details_id" uuid NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"remarks" varchar(100),
	"reference_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deposits_amount_non_negative" CHECK ("deposits"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "drawings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assigned_id" varchar(30) NOT NULL,
	"transaction_id" uuid NOT NULL,
	"drawing_type" "drawing_type_enum" NOT NULL,
	"bank_details_id" uuid,
	"total" numeric(15, 2),
	"remarks" varchar(100),
	"voucher_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drawings_total_non_negative" CHECK ("drawings"."total" >= 0),
	CONSTRAINT "drawings_bank_details_by_type" CHECK (("drawings"."drawing_type" = 'cash')
        OR ("drawings"."drawing_type" = 'product' AND "drawings"."bank_details_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "drawing_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drawing_id" uuid NOT NULL,
	"product_godown_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drawing_products_quantity_positive" CHECK ("drawing_products"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "others" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"dr_ledger_name" varchar(30) NOT NULL,
	"cr_ledger_name" varchar(30) NOT NULL,
	"remark" varchar(100),
	"total" numeric(15, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "others_total_non_negative" CHECK ("others"."total" >= 0),
	CONSTRAINT "others_distinct_debit_credit_ledgers" CHECK ("others"."dr_ledger_name" <> "others"."cr_ledger_name")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assigned_id" varchar(30) NOT NULL,
	"transaction_id" uuid NOT NULL,
	"towards" varchar(100) NOT NULL,
	"party_id" uuid NOT NULL,
	"party_name_snapshot" varchar(150) NOT NULL,
	"party_country_code_snapshot" varchar(5) DEFAULT '+91',
	"party_phone_snapshot" varchar(20),
	"party_email_snapshot" varchar(254),
	"settled_in" "settled_in" NOT NULL,
	"bank_details_id" uuid,
	"amount" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"tds_applicable" boolean DEFAULT false NOT NULL,
	"tds_rate" numeric(3, 2),
	"tds_amount" numeric(15, 2),
	"remarks" varchar(100),
	"voucher_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount_non_negative" CHECK ("payments"."amount" >= 0),
	CONSTRAINT "payments_tds_amount_non_negative" CHECK ("payments"."tds_amount" IS NULL OR "payments"."tds_amount" >= 0),
	CONSTRAINT "payments_tds_rate_valid" CHECK ("payments"."tds_rate" IS NULL OR ("payments"."tds_rate" >= 0 AND "payments"."tds_rate" <= 100)),
	CONSTRAINT "payments_tds_fields_consistent" CHECK ((
      "payments"."tds_applicable" = false
      AND ("payments"."tds_rate" IS NULL OR "payments"."tds_rate" = 0)
      AND ("payments"."tds_amount" IS NULL OR "payments"."tds_amount" = 0)
    ) OR "payments"."tds_applicable" = true)
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assigned_id" varchar(30) NOT NULL,
	"order_id" varchar(30),
	"transaction_id" uuid NOT NULL,
	"party_id" uuid,
	"party_name_snapshot" varchar(150) NOT NULL,
	"party_country_code_snapshot" varchar(5) DEFAULT '+91',
	"party_phone_snapshot" varchar(20),
	"party_email_snapshot" varchar(254),
	"subtotal" numeric(15, 2) DEFAULT '0' NOT NULL,
	"discount_amount" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"gst_amount" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"shipping_amount" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"other_amount" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"transacted_in" "transacted_in" NOT NULL,
	"remarks" varchar(1000),
	"invoice_date" date DEFAULT now() NOT NULL,
	"invoice_type" "invoice_type" DEFAULT 'regular' NOT NULL,
	"invoice_url" text NOT NULL,
	"rcm_applicable" boolean DEFAULT false NOT NULL,
	"is_reported" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchases_amounts_non_negative" CHECK (
        "purchases"."subtotal" >= 0
        AND "purchases"."discount_amount" >= 0
        AND "purchases"."gst_amount" >= 0
        AND "purchases"."shipping_amount" >= 0
        AND "purchases"."other_amount" >= 0
      ),
	CONSTRAINT "purchases_discount_within_subtotal" CHECK ("purchases"."discount_amount" <= "purchases"."subtotal")
);
--> statement-breakpoint
CREATE TABLE "purchase_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_id" uuid NOT NULL,
	"product_godown_id" uuid,
	"godown_name" varchar(20) NOT NULL,
	"party_address_id" uuid,
	"party_gstin_snapshot" varchar(15),
	"party_address_line_1_snapshot" varchar(200) NOT NULL,
	"party_address_line_2_snapshot" varchar(200),
	"party_city_snapshot" varchar(100) NOT NULL,
	"party_district_snapshot" varchar(100) NOT NULL,
	"party_state_snapshot" varchar(100) NOT NULL,
	"party_state_code_snapshot" "gst_place_of_supply" NOT NULL,
	"party_postal_code_snapshot" varchar(10) NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"gross_product_price" numeric(15, 2) NOT NULL,
	"discount_amount" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"supply_type" "supply_type" NOT NULL,
	"gst_rate" integer NOT NULL,
	"gst_amount" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"vehicle_number" varchar(15),
	"remarks" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_products_quantity_positive" CHECK ("purchase_products"."quantity" > 0),
	CONSTRAINT "purchase_products_gross_price_non_negative" CHECK ("purchase_products"."gross_product_price" >= 0),
	CONSTRAINT "purchase_products_discount_within_price" CHECK ("purchase_products"."discount_amount" <= "purchase_products"."gross_product_price"),
	CONSTRAINT "purchase_products_gst_amount_non_negative" CHECK ("purchase_products"."gst_amount" >= 0),
	CONSTRAINT "purchase_products_gst_rate_valid" CHECK ("purchase_products"."gst_rate" >= 0 AND "purchase_products"."gst_rate" <= 100)
);
--> statement-breakpoint
CREATE TABLE "purchase_returns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assigned_id" varchar(30) NOT NULL,
	"transaction_id" uuid NOT NULL,
	"purchase_id" uuid NOT NULL,
	"return_date" date NOT NULL,
	"subtotal" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"discount_amount" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"gst_amount" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"reason" varchar(500),
	"note_url" text NOT NULL,
	"remark" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_returns_amounts_non_negative" CHECK ("purchase_returns"."subtotal" >= 0
        AND "purchase_returns"."discount_amount" >= 0
        AND "purchase_returns"."gst_amount" >= 0),
	CONSTRAINT "purchase_returns_discount_within_subtotal" CHECK ("purchase_returns"."discount_amount" <= "purchase_returns"."subtotal")
);
--> statement-breakpoint
CREATE TABLE "purchase_return_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"return_id" uuid NOT NULL,
	"purchase_product_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"gross_product_price" numeric(15, 2) NOT NULL,
	"discount_amount" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"gst_amount" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_return_products_quantity_positive" CHECK ("purchase_return_products"."quantity" > 0),
	CONSTRAINT "purchase_return_products_amounts_non_negative" CHECK ("purchase_return_products"."gross_product_price" >= 0
        AND "purchase_return_products"."discount_amount" >= 0
        AND "purchase_return_products"."gst_amount" >= 0),
	CONSTRAINT "purchase_return_products_discount_within_amount" CHECK ("purchase_return_products"."discount_amount" <= "purchase_return_products"."quantity" * "purchase_return_products"."gross_product_price")
);
--> statement-breakpoint
CREATE TABLE "purchase_return_replacements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"return_id" uuid NOT NULL,
	"product_godown_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"gross_product_price" numeric(15, 2) NOT NULL,
	"discount_amount" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"gst_amount" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_purchase_return_replacements_quantity_positive" CHECK ("purchase_return_replacements"."quantity" > 0),
	CONSTRAINT "purchase_purchase_return_replacements_amounts_non_negative" CHECK ("purchase_return_replacements"."gross_product_price" >= 0
        AND "purchase_return_replacements"."discount_amount" >= 0
        AND "purchase_return_replacements"."gst_amount" >= 0),
	CONSTRAINT "purchase_purchase_return_replacements_discount_within_amount" CHECK ("purchase_return_replacements"."discount_amount" <= "purchase_return_replacements"."gross_product_price")
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assigned_id" varchar(30) NOT NULL,
	"transaction_id" uuid NOT NULL,
	"towards" varchar(100) NOT NULL,
	"party_id" uuid NOT NULL,
	"party_name_snapshot" varchar(150) NOT NULL,
	"party_country_code_snapshot" varchar(5) DEFAULT '+91',
	"party_phone_snapshot" varchar(20),
	"party_email_snapshot" varchar(254),
	"settled_in" "settled_in" NOT NULL,
	"bank_details_id" uuid,
	"reference_number" varchar(30),
	"amount" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"tds_applicable" boolean DEFAULT false,
	"tds_rate" numeric(3, 2),
	"tds_amount" numeric(15, 2),
	"remarks" varchar(100),
	"voucher_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receipts_amounts_non_negative" CHECK (("receipts"."amount" IS NULL OR "receipts"."amount" >= 0)
        AND ("receipts"."tds_amount" IS NULL OR "receipts"."tds_amount" >= 0)),
	CONSTRAINT "receipts_tds_rate_valid" CHECK ("receipts"."tds_rate" IS NULL
        OR ("receipts"."tds_rate" >= 0 AND "receipts"."tds_rate" <= 100)),
	CONSTRAINT "receipts_tds_fields_consistent" CHECK ((
        "receipts"."tds_applicable" = false
        AND ("receipts"."tds_rate" IS NULL OR "receipts"."tds_rate" = 0)
        AND ("receipts"."tds_amount" IS NULL OR "receipts"."tds_amount" = 0)
      ) OR (
        "receipts"."tds_applicable" = true
      ))
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assigned_id" varchar(30) NOT NULL,
	"order_id" varchar(30),
	"transaction_id" uuid NOT NULL,
	"party_id" uuid,
	"party_name_snapshot" varchar(150) NOT NULL,
	"party_country_code_snapshot" varchar(5) DEFAULT '+91',
	"party_phone_snapshot" varchar(20),
	"party_email_snapshot" varchar(254),
	"subtotal" numeric(15, 2) DEFAULT '0' NOT NULL,
	"discount_amount" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"gst_amount" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"shipping_amount" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"other_amount" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"transacted_in" "transacted_in" NOT NULL,
	"remarks" varchar(1000),
	"invoice_date" date DEFAULT now() NOT NULL,
	"invoice_type" "invoice_type" DEFAULT 'regular' NOT NULL,
	"invoice_url" text NOT NULL,
	"rcm_applicable" boolean DEFAULT false NOT NULL,
	"is_reported" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_amounts_non_negative" CHECK (
        "sales"."subtotal" >= 0
        AND "sales"."discount_amount" >= 0
        AND "sales"."gst_amount" >= 0
        AND "sales"."shipping_amount" >= 0
        AND "sales"."other_amount" >= 0
      ),
	CONSTRAINT "sales_discount_within_subtotal" CHECK ("sales"."discount_amount" <= "sales"."subtotal")
);
--> statement-breakpoint
CREATE TABLE "sale_credit_details" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"credit_period_in_days" integer,
	"interest_rate" numeric(3, 2) DEFAULT '4.50',
	"interest_applicable" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sale_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"party_address_id" uuid,
	"party_gstin_snapshot" varchar(15),
	"party_address_line_1_snapshot" varchar(200) NOT NULL,
	"party_address_line_2_snapshot" varchar(200),
	"party_city_snapshot" varchar(100) NOT NULL,
	"party_district_snapshot" varchar(100) NOT NULL,
	"party_state_snapshot" varchar(100) NOT NULL,
	"party_state_code_snapshot" "gst_place_of_supply" NOT NULL,
	"party_postal_code_snapshot" varchar(10) NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"product_godown_id" uuid,
	"godown_name" varchar(20) NOT NULL,
	"gross_product_price" numeric(15, 2) NOT NULL,
	"discount_amount" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"supply_type" "supply_type" NOT NULL,
	"gst_rate" integer NOT NULL,
	"gst_amount" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"vehicle_number" varchar(15),
	"remarks" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sale_products_quantity_positive" CHECK ("sale_products"."quantity" > 0),
	CONSTRAINT "sale_products_gross_price_non_negative" CHECK ("sale_products"."gross_product_price" >= 0),
	CONSTRAINT "sale_products_discount_within_price" CHECK ("sale_products"."discount_amount" <= "sale_products"."gross_product_price"),
	CONSTRAINT "sale_products_gst_amount_non_negative" CHECK ("sale_products"."gst_amount" >= 0),
	CONSTRAINT "sale_products_gst_rate_valid" CHECK ("sale_products"."gst_rate" >= 0 AND "sale_products"."gst_rate" <= 100)
);
--> statement-breakpoint
CREATE TABLE "sale_returns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assigned_id" varchar(30) NOT NULL,
	"transaction_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"return_date" date NOT NULL,
	"subtotal" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"discount_amount" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"gst_amount" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"reason" varchar(500),
	"note_url" text NOT NULL,
	"remark" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sale_returns_amounts_non_negative" CHECK ("sale_returns"."subtotal" >= 0
        AND "sale_returns"."discount_amount" >= 0
        AND "sale_returns"."gst_amount" >= 0),
	CONSTRAINT "sale_returns_discount_within_subtotal" CHECK ("sale_returns"."discount_amount" <= "sale_returns"."subtotal")
);
--> statement-breakpoint
CREATE TABLE "sale_return_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"return_id" uuid NOT NULL,
	"sale_product_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"gross_product_price" numeric(15, 2) NOT NULL,
	"discount_amount" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"gst_amount" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sale_return_products_quantity_positive" CHECK ("sale_return_products"."quantity" > 0),
	CONSTRAINT "sale_return_products_amounts_non_negative" CHECK ("sale_return_products"."gross_product_price" >= 0
        AND "sale_return_products"."discount_amount" >= 0
        AND "sale_return_products"."gst_amount" >= 0),
	CONSTRAINT "sale_return_products_discount_within_amount" CHECK ("sale_return_products"."discount_amount" <= "sale_return_products"."quantity" * "sale_return_products"."gross_product_price")
);
--> statement-breakpoint
CREATE TABLE "sale_return_replacements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"return_id" uuid NOT NULL,
	"product_godown_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"gross_product_price" numeric(15, 2) NOT NULL,
	"discount_amount" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"gst_amount" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sale_return_replacements_quantity_positive" CHECK ("sale_return_replacements"."quantity" > 0),
	CONSTRAINT "sale_return_replacements_amounts_non_negative" CHECK ("sale_return_replacements"."gross_product_price" >= 0
        AND "sale_return_replacements"."discount_amount" >= 0
        AND "sale_return_replacements"."gst_amount" >= 0),
	CONSTRAINT "sale_return_replacements_discount_within_amount" CHECK ("sale_return_replacements"."discount_amount" <= "sale_return_replacements"."gross_product_price")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "transaction_type" NOT NULL,
	"sub_type" varchar(30),
	"date_time" timestamp with time zone,
	"remarks" varchar(100),
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "withdrawals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assigned_id" varchar(30) NOT NULL,
	"transaction_id" uuid NOT NULL,
	"reference_number" varchar(30),
	"bank_details_id" uuid NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"remarks" varchar(100),
	"reference_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "withdrawal_amount_non_negative" CHECK ("withdrawals"."amount" >= 0)
);
--> statement-breakpoint
CREATE INDEX "ledger_table_ledger_id_idx" ON "ledgers" USING btree ("ledger_master_id");--> statement-breakpoint
CREATE INDEX "ledgers_ledger_master_datetime_idx" ON "ledgers" USING btree ("ledger_master_id","date_time");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_groups_type_name_unique" ON "ledger_groups" USING btree ("type","name");--> statement-breakpoint
CREATE INDEX "ledger_master_table_ledger_group_id_idx" ON "ledger_masters" USING btree ("ledger_group_id");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "twoFactor_secret_idx" ON "two_factors" USING btree ("secret");--> statement-breakpoint
CREATE INDEX "twoFactor_userId_idx" ON "two_factors" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verifications" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "bank_details_account_number_ifsc_unique" ON "bank_details" USING btree ("account_number","ifsc_code");--> statement-breakpoint
CREATE UNIQUE INDEX "product_godowns_godown_product_unique" ON "product_godowns" USING btree ("godown_id","product_id");--> statement-breakpoint
CREATE INDEX "product_godowns_product_id_idx" ON "product_godowns" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_orders_order_id_unique_idx" ON "purchase_orders" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "purchase_orders_party_id_idx" ON "purchase_orders" USING btree ("party_id");--> statement-breakpoint
CREATE INDEX "purchase_order_deliveries_order_product_idx" ON "purchase_order_deliveries" USING btree ("order_product_id");--> statement-breakpoint
CREATE INDEX "purchase_order_products_order_id_idx" ON "purchase_order_products" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE INDEX "purchase_order_product_godown_id_idx" ON "purchase_order_products" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sale_orders_order_id_unique_idx" ON "sale_orders" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "sale_orders_party_id_idx" ON "sale_orders" USING btree ("party_id");--> statement-breakpoint
CREATE INDEX "sale_order_deliveries_order_product_idx" ON "sale_order_deliveries" USING btree ("order_product_id");--> statement-breakpoint
CREATE INDEX "sale_order_products_order_id_idx" ON "sale_order_products" USING btree ("sale_order_id");--> statement-breakpoint
CREATE INDEX "sale_order_products_product_id_idx" ON "sale_order_products" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "party_addresses_party_id_idx" ON "party_addresses" USING btree ("party_id");--> statement-breakpoint
CREATE UNIQUE INDEX "parties_gstin_unique" ON "party_addresses" USING btree ("gstin");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_name_unique" ON "categories" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "products_category_id_idx" ON "products" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "products_sub_category_id_idx" ON "products" USING btree ("sub_category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_prices_product_id_unique" ON "product_prices" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sub_categories_name_unique" ON "sub_categories" USING btree ("category_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "sub_category_types_parent_name_unique" ON "sub_category_types" USING btree ("sub_category_id",lower(trim("name")));--> statement-breakpoint
CREATE UNIQUE INDEX "deposits_assigned_id_unique" ON "deposits" USING btree ("assigned_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deposits_transaction_id_unique" ON "deposits" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "deposits_bank_details_id_idx" ON "deposits" USING btree ("bank_details_id");--> statement-breakpoint
CREATE UNIQUE INDEX "drawings_assigned_id_unique" ON "drawings" USING btree ("assigned_id");--> statement-breakpoint
CREATE UNIQUE INDEX "drawings_transaction_id_unique" ON "drawings" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "drawings_bank_details_id_idx" ON "drawings" USING btree ("bank_details_id");--> statement-breakpoint
CREATE INDEX "drawing_products_drawing_id_idx" ON "drawing_products" USING btree ("drawing_id");--> statement-breakpoint
CREATE INDEX "drawing_products_product_godown_id_idx" ON "drawing_products" USING btree ("product_godown_id");--> statement-breakpoint
CREATE UNIQUE INDEX "drawing_products_drawing_godown_unique" ON "drawing_products" USING btree ("drawing_id","product_godown_id");--> statement-breakpoint
CREATE INDEX "others_transaction_id_idx" ON "others" USING btree ("transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_assigned_id_unique" ON "payments" USING btree ("assigned_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_transaction_id_unique" ON "payments" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "payments_party_id_idx" ON "payments" USING btree ("party_id");--> statement-breakpoint
CREATE INDEX "payments_bank_details_id_idx" ON "payments" USING btree ("bank_details_id");--> statement-breakpoint
CREATE INDEX "purchases_transaction_id_index" ON "purchases" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "purchases_party_id_idx" ON "purchases" USING btree ("party_id");--> statement-breakpoint
CREATE INDEX "purchase_products_purchase_id_idx" ON "purchase_products" USING btree ("purchase_id");--> statement-breakpoint
CREATE INDEX "purchase_products_product_godown_id_idx" ON "purchase_products" USING btree ("product_godown_id");--> statement-breakpoint
CREATE INDEX "purchase_returns_original_transaction_idx" ON "purchase_returns" USING btree ("purchase_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_returns_type_assigned_id_unique" ON "purchase_returns" USING btree ("assigned_id");--> statement-breakpoint
CREATE INDEX "purchase_return_products_return_id_idx" ON "purchase_return_products" USING btree ("return_id");--> statement-breakpoint
CREATE INDEX "purchase_return_products_original_product_idx" ON "purchase_return_products" USING btree ("purchase_product_id");--> statement-breakpoint
CREATE INDEX "purchase_purchase_return_replacements_return_id_idx" ON "purchase_return_replacements" USING btree ("return_id");--> statement-breakpoint
CREATE INDEX "purchase_purchase_return_replacements_product_godown_id_idx" ON "purchase_return_replacements" USING btree ("product_godown_id");--> statement-breakpoint
CREATE UNIQUE INDEX "receipts_assigned_id_unique" ON "receipts" USING btree ("assigned_id");--> statement-breakpoint
CREATE UNIQUE INDEX "receipts_transaction_id_unique" ON "receipts" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "receipts_party_id_idx" ON "receipts" USING btree ("party_id");--> statement-breakpoint
CREATE INDEX "receipts_bank_details_id_idx" ON "receipts" USING btree ("bank_details_id");--> statement-breakpoint
CREATE INDEX "sales_transaction_id_index" ON "sales" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "sales_party_id_idx" ON "sales" USING btree ("party_id");--> statement-breakpoint
CREATE INDEX "sale_products_sale_id_idx" ON "sale_products" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "sale_products_product_id_idx" ON "sale_products" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "sale_returns_original_transaction_idx" ON "sale_returns" USING btree ("sale_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sale_returns_type_assigned_id_unique" ON "sale_returns" USING btree ("assigned_id");--> statement-breakpoint
CREATE INDEX "sale_return_products_return_id_idx" ON "sale_return_products" USING btree ("return_id");--> statement-breakpoint
CREATE INDEX "sale_return_products_original_product_idx" ON "sale_return_products" USING btree ("sale_product_id");--> statement-breakpoint
CREATE INDEX "sale_return_replacements_return_id_idx" ON "sale_return_replacements" USING btree ("return_id");--> statement-breakpoint
CREATE INDEX "sale_return_replacements_product_godown_id_idx" ON "sale_return_replacements" USING btree ("product_godown_id");--> statement-breakpoint
CREATE INDEX "transaction_type_idx" ON "transactions" USING btree ("type");--> statement-breakpoint
CREATE UNIQUE INDEX "withdrawal_assigned_id_unique" ON "withdrawals" USING btree ("assigned_id");--> statement-breakpoint
CREATE UNIQUE INDEX "withdrawal_transaction_id_unique" ON "withdrawals" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "withdrawal_bank_details_id_idx" ON "withdrawals" USING btree ("bank_details_id");--> statement-breakpoint
ALTER TABLE "ledgers" ADD CONSTRAINT "ledgers_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledgers" ADD CONSTRAINT "ledgers_ledger_master_id_ledger_masters_id_fk" FOREIGN KEY ("ledger_master_id") REFERENCES "public"."ledger_masters"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_masters" ADD CONSTRAINT "ledger_masters_ledger_group_id_ledger_groups_id_fk" FOREIGN KEY ("ledger_group_id") REFERENCES "public"."ledger_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factors" ADD CONSTRAINT "two_factors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "godowns" ADD CONSTRAINT "godowns_landlord_id_parties_id_fk" FOREIGN KEY ("landlord_id") REFERENCES "public"."parties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_godowns" ADD CONSTRAINT "product_godowns_godown_id_godowns_id_fk" FOREIGN KEY ("godown_id") REFERENCES "public"."godowns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_godowns" ADD CONSTRAINT "product_godowns_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_ordered_by_id_users_id_fk" FOREIGN KEY ("ordered_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_deliveries" ADD CONSTRAINT "purchase_order_deliveries_order_product_id_purchase_order_products_id_fk" FOREIGN KEY ("order_product_id") REFERENCES "public"."purchase_order_products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_deliveries" ADD CONSTRAINT "purchase_order_deliveries_ordered_by_id_users_id_fk" FOREIGN KEY ("ordered_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_products" ADD CONSTRAINT "purchase_order_products_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_products" ADD CONSTRAINT "purchase_order_products_product_id_product_godowns_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product_godowns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_products" ADD CONSTRAINT "purchase_order_products_party_address_id_party_addresses_id_fk" FOREIGN KEY ("party_address_id") REFERENCES "public"."party_addresses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_orders" ADD CONSTRAINT "sale_orders_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_orders" ADD CONSTRAINT "sale_orders_ordered_by_id_users_id_fk" FOREIGN KEY ("ordered_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_order_deliveries" ADD CONSTRAINT "sale_order_deliveries_order_product_id_sale_order_products_id_fk" FOREIGN KEY ("order_product_id") REFERENCES "public"."sale_order_products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_order_deliveries" ADD CONSTRAINT "sale_order_deliveries_ordered_by_id_users_id_fk" FOREIGN KEY ("ordered_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_order_products" ADD CONSTRAINT "sale_order_products_sale_order_id_sale_orders_id_fk" FOREIGN KEY ("sale_order_id") REFERENCES "public"."sale_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_order_products" ADD CONSTRAINT "sale_order_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_order_products" ADD CONSTRAINT "sale_order_products_party_address_id_party_addresses_id_fk" FOREIGN KEY ("party_address_id") REFERENCES "public"."party_addresses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_addresses" ADD CONSTRAINT "party_addresses_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_sub_category_id_sub_categories_id_fk" FOREIGN KEY ("sub_category_id") REFERENCES "public"."sub_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_categories" ADD CONSTRAINT "sub_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_category_types" ADD CONSTRAINT "sub_category_types_sub_category_id_sub_categories_id_fk" FOREIGN KEY ("sub_category_id") REFERENCES "public"."sub_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_counted_by_users_id_fk" FOREIGN KEY ("counted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_products" ADD CONSTRAINT "stock_count_products_stock_count_id_stock_counts_id_fk" FOREIGN KEY ("stock_count_id") REFERENCES "public"."stock_counts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_products" ADD CONSTRAINT "stock_count_products_godown_id_godowns_id_fk" FOREIGN KEY ("godown_id") REFERENCES "public"."godowns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_products" ADD CONSTRAINT "stock_count_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_bank_details_id_bank_details_id_fk" FOREIGN KEY ("bank_details_id") REFERENCES "public"."bank_details"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawings" ADD CONSTRAINT "drawings_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawings" ADD CONSTRAINT "drawings_bank_details_id_bank_details_id_fk" FOREIGN KEY ("bank_details_id") REFERENCES "public"."bank_details"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_products" ADD CONSTRAINT "drawing_products_drawing_id_drawings_id_fk" FOREIGN KEY ("drawing_id") REFERENCES "public"."drawings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_products" ADD CONSTRAINT "drawing_products_product_godown_id_product_godowns_id_fk" FOREIGN KEY ("product_godown_id") REFERENCES "public"."product_godowns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "others" ADD CONSTRAINT "others_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_bank_details_id_bank_details_id_fk" FOREIGN KEY ("bank_details_id") REFERENCES "public"."bank_details"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_order_id_purchase_orders_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."purchase_orders"("order_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_products" ADD CONSTRAINT "purchase_products_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_products" ADD CONSTRAINT "purchase_products_product_godown_id_product_godowns_id_fk" FOREIGN KEY ("product_godown_id") REFERENCES "public"."product_godowns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_products" ADD CONSTRAINT "purchase_products_party_address_id_party_addresses_id_fk" FOREIGN KEY ("party_address_id") REFERENCES "public"."party_addresses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_return_products" ADD CONSTRAINT "purchase_return_products_return_id_purchase_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."purchase_returns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_return_products" ADD CONSTRAINT "purchase_return_products_purchase_product_id_purchase_products_id_fk" FOREIGN KEY ("purchase_product_id") REFERENCES "public"."purchase_products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_return_replacements" ADD CONSTRAINT "purchase_return_replacements_return_id_purchase_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."purchase_returns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_return_replacements" ADD CONSTRAINT "purchase_return_replacements_product_godown_id_product_godowns_id_fk" FOREIGN KEY ("product_godown_id") REFERENCES "public"."product_godowns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_bank_details_id_bank_details_id_fk" FOREIGN KEY ("bank_details_id") REFERENCES "public"."bank_details"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_order_id_sale_orders_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."sale_orders"("order_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_credit_details" ADD CONSTRAINT "sale_credit_details_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_products" ADD CONSTRAINT "sale_products_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_products" ADD CONSTRAINT "sale_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_products" ADD CONSTRAINT "sale_products_party_address_id_party_addresses_id_fk" FOREIGN KEY ("party_address_id") REFERENCES "public"."party_addresses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_products" ADD CONSTRAINT "sale_products_product_godown_id_product_godowns_id_fk" FOREIGN KEY ("product_godown_id") REFERENCES "public"."product_godowns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_return_products" ADD CONSTRAINT "sale_return_products_return_id_sale_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."sale_returns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_return_products" ADD CONSTRAINT "sale_return_products_sale_product_id_sale_products_id_fk" FOREIGN KEY ("sale_product_id") REFERENCES "public"."sale_products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_return_replacements" ADD CONSTRAINT "sale_return_replacements_return_id_sale_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."sale_returns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_return_replacements" ADD CONSTRAINT "sale_return_replacements_product_godown_id_product_godowns_id_fk" FOREIGN KEY ("product_godown_id") REFERENCES "public"."product_godowns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_bank_details_id_bank_details_id_fk" FOREIGN KEY ("bank_details_id") REFERENCES "public"."bank_details"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
