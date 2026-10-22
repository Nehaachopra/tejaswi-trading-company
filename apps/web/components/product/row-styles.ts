// shared by the category and sub-category rows (rows on phones, tiles from 1024px)

// the row itself: both kinds carry a 2px ivory border (invisible on the ivory fill), so they're the same size;
// active is solid ivory with chestnut ink, inactive has no fill and ivory ink
export const rowShell = (active: boolean) =>
  `rounded-control border-2 border-ivory px-2.5 py-1.5 ${active ? "on-ivory bg-ivory text-chestnut" : "text-ivory"}`;

// a row inside an ivory drawer, the same idea turned around: active is filled (a light chestnut tint),
// inactive is only outlined in chestnut
export const rowShellOnIvory = (active: boolean) =>
  `rounded-control border-2 px-2.5 py-1.5 text-chestnut ${active ? "border-transparent bg-chestnut/6" : "border-chestnut/70"}`;

// name and counts on the left (phones) or on top (tiles); the action box after them
export const rowBody = "flex items-center gap-2 lg:flex-col lg:items-stretch lg:gap-3";

// always a row, at every width (inside a drawer)
export const rowBodyInline = "flex items-center gap-2";

// the action box: one outline around all the buttons, with lines between them
export const actionBox = "flex shrink-0 divide-x divide-current/30 overflow-hidden rounded-control border border-current/40";

// one segment of the action box
export const segment =
  "grid h-11 w-11 place-items-center hover:bg-current/10 disabled:not-aria-busy:opacity-30 aria-busy:opacity-80 lg:w-auto lg:flex-1";

// one segment of the action box, always 44px square (inside a drawer)
export const segmentInline = "grid size-11 place-items-center hover:bg-current/10 disabled:not-aria-busy:opacity-30 aria-busy:opacity-80";

// a standalone 44px icon button (Save and Cancel while renaming)
export const iconButton =
  "grid size-11 shrink-0 place-items-center rounded-control border border-current/40 hover:border-current disabled:not-aria-busy:opacity-30 aria-busy:opacity-80";

// a filter chip on the chestnut page
export const chip = (pressed: boolean) =>
  `min-h-9 shrink-0 rounded-control border px-4 text-sm transition-colors ${
    pressed ? "border-ivory bg-ivory font-medium text-chestnut" : "hover:border-ivory/60"
  }`;
