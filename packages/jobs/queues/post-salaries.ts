import SalaryService from "@repo/services/salary";

const salaries = new SalaryService();

// each employee's month booked as owed on their pay day: run every hour (a pay day the server was down for is caught up
// on the next run; a month is never posted twice)
export const postSalariesQueue = {
  name: "post-salaries",
  options: { retryLimit: 3, retryDelay: 120, retryBackoff: true, expireInSeconds: 600 },
  cron: "5 * * * *",
} as const;

export const postSalaries = () => salaries.postDue().then(() => undefined);
