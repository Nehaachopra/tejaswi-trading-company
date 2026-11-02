// the one look every page shares: change it here, never page by page

// a page: the same width and the same left edge everywhere (a form adds more room below with its own pb)
export const PAGE = "mx-auto w-full max-w-6xl px-4 pt-6 sm:px-6";

// the filters' row, staying under the header while the list scrolls
const BAR = "z-20 -mx-4 flex flex-wrap items-center gap-2 bg-chestnut px-4 py-2 sm:-mx-6 sm:flex-nowrap sm:px-6";
export const FILTER_BAR = `sticky top-16 ${BAR}`;
// the same row on a page with tabs that stay too: just under them
export const FILTER_BAR_UNDER_TABS = `sticky top-[6.8125rem] ${BAR}`;

// a dropdown in the filters; the same size as a filter chip
export const FILTER_TRIGGER = "min-h-9 min-w-0 max-w-48 gap-1.5 px-3 text-sm";

// a list's + Add button on the chestnut page
export const ADD_BUTTON = "on-ivory flex min-h-12 w-full items-center justify-center gap-2 rounded-control bg-ivory px-5 font-heading text-lg font-bold text-chestnut sm:w-fit";

// a + Add button on an ivory card or sheet: ivory too, with a chestnut outline so it reads as a button
export const ADD_ON_IVORY =
  "flex min-h-11 items-center justify-center gap-2 rounded-control border border-chestnut bg-ivory px-4 text-sm font-semibold text-chestnut transition-colors hover:bg-chestnut/[0.06]";

// the small square + beside pack sizes and in a drawer
export const addSquare = (size: "size-8" | "size-11") =>
  `grid ${size} shrink-0 place-items-center rounded-control border border-chestnut bg-ivory text-chestnut transition-colors hover:bg-chestnut/[0.06] aria-busy:opacity-80`;

// picking from a search on an ivory card (a ledger, a party, a landlord, a loan): the search box, its list of matches
// (two columns on a wide screen), each match, + New as the list's last row, and what's picked with its Change
export const PICK_SEARCH = "relative flex min-h-12 items-center gap-2 px-3";
export const PICK_LIST = "flex max-h-80 flex-col overflow-x-hidden overflow-y-auto";
export const PICK_TWO_COLUMNS = "sm:grid sm:grid-cols-2 sm:content-start sm:gap-x-6";
export const PICK_ROW =
  "flex min-h-12 w-full shrink-0 items-center gap-2 border-b border-chestnut/20 px-1 py-2.5 text-left transition-colors last:border-b-0 hover:bg-chestnut/[0.05]";
export const PICK_NEW = "sticky bottom-0 col-span-full mt-auto flex flex-col gap-2 bg-ivory pt-4 sm:flex-row sm:justify-center";
export const PICKED = "flex min-h-12 w-full shrink-0 items-center gap-2 rounded-control border-2 border-chestnut bg-chestnut px-3 py-2 text-left text-ivory";
