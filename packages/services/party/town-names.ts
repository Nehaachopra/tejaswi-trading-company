// towns and districts known by more than one name since they were renamed: today's name first, then the older
// spellings still in use (India Post's directory keeps many old ones). A town typed in any of them is looked up under
// all of them, and a name that comes back old is shown as today's. Only official renames; a name not here matches
// only itself
const TOWN_NAMES: readonly (readonly string[])[] = [
  // Karnataka
  ["Bengaluru", "Bangalore"],
  ["Bengaluru Urban", "Bangalore Urban"],
  ["Bengaluru Rural", "Bangalore Rural"],
  ["Mysuru", "Mysore"],
  ["Mangaluru", "Mangalore"],
  ["Belagavi", "Belgaum"],
  ["Kalaburagi", "Gulbarga"],
  ["Ballari", "Bellary"],
  ["Vijayapura", "Bijapur"],
  ["Shivamogga", "Shimoga"],
  ["Tumakuru", "Tumkur"],
  ["Chikkamagaluru", "Chikmagalur"],
  ["Hubballi", "Hubli"],
  ["Hosapete", "Hospet"],
  ["Davanagere", "Davangere"],
  ["Chikkaballapur", "Chikballapur"],
  ["Madikeri", "Mercara"],
  // elsewhere
  ["Mumbai", "Bombay"],
  ["Chennai", "Madras"],
  ["Kolkata", "Calcutta"],
  ["Prayagraj", "Allahabad"],
  ["Gurugram", "Gurgaon"],
  ["Puducherry", "Pondicherry"],
  ["Thiruvananthapuram", "Trivandrum"],
  ["Kochi", "Cochin"],
  ["Kozhikode", "Calicut"],
  ["Thrissur", "Trichur"],
  ["Vadodara", "Baroda"],
  ["Pune", "Poona"],
  ["Varanasi", "Benares", "Banaras"],
  ["Tiruchirappalli", "Trichy", "Trichinopoly"],
  ["Thoothukudi", "Tuticorin"],
  ["Ayodhya", "Faizabad"],
  ["Ahilyanagar", "Ahmednagar"],
  ["Dharashiv", "Osmanabad"],
];

const groupOf = (name: string) => {
  const key = name.trim().toLowerCase();
  return TOWN_NAMES.find((group) => group.some((n) => n.toLowerCase() === key));
};

// every name a town goes by (the one given, when it has no other)
export const townNames = (name: string): string[] => [...(groupOf(name) ?? [name.trim()])];

// a town's or district's name today (as given, when it was never renamed)
export const currentTownName = (name: string): string => groupOf(name)?.[0] ?? name;
