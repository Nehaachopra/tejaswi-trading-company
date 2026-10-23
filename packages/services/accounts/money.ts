// money is added up in whole paise, never as floating-point rupees, and stored as numeric(15,2) text

export const toPaise = (rupees: number | string) => Math.round(Number(rupees) * 100);

export const fromPaise = (paise: number) => (paise / 100).toFixed(2);

// above zero, with at most two decimals
export const isAmount = (rupees: number) => Number.isFinite(rupees) && rupees > 0 && Math.abs(rupees * 100 - Math.round(rupees * 100)) < 1e-6;
