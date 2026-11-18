import type { ProductGroup } from "./product-tile";

// letters and digits only, lower case: "Aishwarya-Gold " and "aishwaryagold" read the same
const plain = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");

// how many letters must change to turn one into the other
function distance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let last = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const was = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
      last = was;
    }
  }
  return row[b.length]!;
}

// two names close enough to be the same product: one inside the other, or a slip of a letter or two
function close(a: string, b: string) {
  if (a.length < 3 || b.length < 3) return a === b && a !== "";
  if (a.includes(b) || b.includes(a)) return true;
  return distance(a, b) <= (Math.min(a.length, b.length) >= 6 ? 2 : 1);
}

// the products already listed that look like the one being typed (by brand, or brand and name together), in the
// category picked when there is one; at most five
export function similarProducts(
  products: ProductGroup[],
  typed: { brand: string; name: string; categoryId: string | null },
) {
  const brand = plain(typed.brand);
  if (brand.length < 3) return [];
  const whole = plain(typed.brand + typed.name);
  return products
    .filter((g) => !typed.categoryId || g.categoryId === typed.categoryId)
    .filter((g) => close(plain(g.brand), brand) || close(plain(g.brand + (g.name ?? "")), whole))
    .slice(0, 5);
}
