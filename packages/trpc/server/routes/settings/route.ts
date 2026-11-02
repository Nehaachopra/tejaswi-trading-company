import { setTaxAuditInputModel, setTds194qInputModel, settingsPageModel } from "@repo/services/setting/model";

import { settingService } from "../../services";
import { adminProcedure, router } from "../../trpc";

// the website's settings; the admin's only
export const settingsRouter = router({
  // this financial year and what's set for it
  page: adminProcedure
    .meta({ openapi: { method: "GET", path: "/settings", tags: ["settings"] } })
    .output(settingsPageModel)
    .query(() => settingService.page()),

  // TDS on rent, transport, labour and brokerage on or off for this financial year (turnover above ₹1 crore last year)
  setTaxAudit: adminProcedure
    .meta({ openapi: { method: "PUT", path: "/settings/tax-audit", tags: ["settings"] } })
    .input(setTaxAuditInputModel)
    .output(settingsPageModel)
    .mutation(({ input }) => settingService.setTaxAudit(input)),

  // TDS on suppliers (section 194Q) on or off for this financial year
  setTds194q: adminProcedure
    .meta({ openapi: { method: "PUT", path: "/settings/tds-194q", tags: ["settings"] } })
    .input(setTds194qInputModel)
    .output(settingsPageModel)
    .mutation(({ input }) => settingService.setTds194q(input)),
});
