// how many digits each bank's account numbers have, for the banks that keep to fixed lengths (every length a
// bank is known to issue is listed, so no real account is refused). A bank not listed takes 9 to 18 digits.
// Shared by the server and the bank form, so both say the same thing. Names are as the IFSC directory writes them
export const ACCOUNT_LENGTHS: Record<string, readonly number[]> = {
  "state bank of india": [11, 17],
  "hdfc bank": [13, 14],
  "icici bank": [12],
  "axis bank": [12, 15],
  "punjab national bank": [16],
  "bank of baroda": [14],
  "canara bank": [13],
  "bank of india": [15],
  "central bank of india": [10],
  "indian overseas bank": [15],
  "uco bank": [14],
  "bank of maharashtra": [11],
  "karnataka bank": [16],
  "federal bank": [14],
  "south indian bank": [16],
  "karur vysya bank": [16],
  "city union bank": [15],
  "yes bank": [15],
  "idfc first bank": [11],
};

// the lengths a bank's account numbers take, if it keeps to fixed ones
export const lengthsFor = (bank: string) => ACCOUNT_LENGTHS[bank.trim().toLowerCase()] ?? null;

// whether an account number has a length its bank uses (or 9 to 18 digits for a bank not listed)
export const lengthFits = (bank: string, accountNumber: string) => {
  const lengths = lengthsFor(bank);
  return lengths ? lengths.includes(accountNumber.length) : accountNumber.length >= 9 && accountNumber.length <= 18;
};
