import { getTranslations } from "next-intl/server";

import { TransactionPills } from "~/components/home/transaction-pills";

export default async function HomePage() {
  const t = await getTranslations("home");

  return (
    <div className="flex flex-col">
      {/* warehouse photo: drop it in as public/home.jpg; until then the warm gradient shows */}
      <div
        role="img"
        aria-label="Tejaswi Trading Company warehouse"
        className="aspect-video w-full bg-cover bg-center sm:aspect-[21/9] md:rounded-b-3xl"
        style={{
          backgroundImage:
            "url(/home.jpg), linear-gradient(135deg, var(--brand-surface) 0%, var(--hero-via) 45%, var(--hero-to) 100%)",
        }}
      />

      <section className="flex flex-col gap-3 px-4 pt-5">
        <h1 className="font-heading text-base font-semibold text-muted-foreground">{t("title")}</h1>
        <TransactionPills />
      </section>
    </div>
  );
}
