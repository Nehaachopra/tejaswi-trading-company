"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Minus,
  Pencil,
  Plus,
  ShoppingCart,
  Trash2,
  Warehouse,
  Wheat,
} from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "~/components/ui/input-otp";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "~/components/ui/item";
import { Label } from "~/components/ui/label";
import { Progress } from "~/components/ui/progress";
import { Separator } from "~/components/ui/separator";
import { Slider } from "~/components/ui/slider";
import { Switch } from "~/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";

// Living style guide: real components with real-looking content, not tokens.
// Content here is static illustration only; nothing is read from or written to the database.

const first = (value: number | readonly number[]) => (Array.isArray(value) ? value[0]! : (value as number));

function Section({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="font-heading text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{note}</p>
      </div>
      {children}
    </section>
  );
}

function ImagePlaceholder({ className }: { className?: string }) {
  return (
    <div
      className={`flex items-center justify-center bg-linear-135 from-brand-surface via-hero-via to-hero-to text-brand-ink/40 ${className ?? ""}`}
    >
      <Wheat className="size-10" />
    </div>
  );
}

function ProductCard() {
  const [pack, setPack] = useState<string[]>(["25"]);
  const [showTax, setShowTax] = useState(false);
  const [quantity, setQuantity] = useState(40);
  const [allocated, setAllocated] = useState(25);

  return (
    <Card className="overflow-hidden pt-0">
      <ImagePlaceholder className="aspect-4/3 w-full" />
      <CardHeader>
        <CardTitle className="font-heading text-base capitalize">sona masoori · aishwarya</CardTitle>
        <CardDescription className="capitalize">rice</CardDescription>
        <CardAction>
          <Badge variant="secondary">In stock</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ToggleGroup variant="outline" size="sm" value={pack} onValueChange={(v) => setPack(v.length ? v : pack)}>
          {["10", "25", "50"].map((kg) => (
            <ToggleGroupItem key={kg} value={kg} className="h-11 px-4">
              {kg} kg
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Available stock</dt>
          <dd className="text-right font-medium">320 bags</dd>
          {showTax && (
            <>
              <dt className="text-muted-foreground">Price before GST</dt>
              <dd className="text-right">₹1,190.48</dd>
              <dt className="text-muted-foreground">GST 5%</dt>
              <dd className="text-right">₹59.52</dd>
            </>
          )}
          <dt className="flex items-center gap-1 text-muted-foreground">
            Price after GST
            <Button variant="ghost" size="icon" className="-my-3 size-11" onClick={() => setShowTax(!showTax)} aria-label="Show tax">
              {showTax ? <ChevronUp /> : <ChevronDown />}
            </Button>
          </dt>
          <dd className="text-right text-base font-semibold">₹1,250.00</dd>
        </dl>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="price">Transaction price</Label>
            <Input id="price" inputMode="decimal" defaultValue="1,240" className="h-11" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="qty">Quantity</Label>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="size-11" onClick={() => setQuantity(Math.max(0, quantity - 1))} aria-label="Less">
                <Minus />
              </Button>
              <Input
                id="qty"
                inputMode="numeric"
                className="h-11 text-center"
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value.replace(/\D/g, "")) || 0)}
              />
              <Button variant="outline" size="icon" className="size-11" onClick={() => setQuantity(quantity + 1)} aria-label="More">
                <Plus />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
      <Separator />
      <CardFooter className="flex flex-col items-stretch gap-3 pt-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Allocate to godowns</span>
          <span className="font-medium">
            {Math.min(allocated, quantity)} / {quantity}
          </span>
        </div>
        <Slider
          value={[Math.min(allocated, quantity)]}
          max={quantity}
          onValueChange={(v) => setAllocated(first(v))}
        />
        <div className="flex flex-wrap gap-2">
          {[
            { name: "Main godown", stock: 210, take: Math.min(allocated, quantity) },
            { name: "Market yard", stock: 110, take: quantity - Math.min(allocated, quantity) },
          ].map((g) => (
            <div key={g.name} className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs">
              <Warehouse className="size-3.5 text-muted-foreground" />
              <span className="font-medium">{g.name}</span>
              <span className="text-muted-foreground">{g.stock} avail.</span>
              <Badge variant="outline">{g.take}</Badge>
            </div>
          ))}
        </div>
        <Button size="lg" className="w-full">
          <ShoppingCart data-icon="inline-start" />
          Add to cart
        </Button>
      </CardFooter>
    </Card>
  );
}

const cartRows = [
  { name: "sona masoori · aishwarya", pack: "25 kg", qty: 40, price: 1240 },
  { name: "basmati · india gate · classic", pack: "10 kg", qty: 12, price: 980 },
  { name: "toor dal · tata sampann", pack: "1 kg", qty: 50, price: 142 },
];

const ledgerRows = [
  { date: "12 Oct", particulars: "Sale SA26000041", debit: 49600, credit: 0, balance: "49,600 Dr" },
  { date: "13 Oct", particulars: "Receipt RE26000018", debit: 0, credit: 30000, balance: "19,600 Dr" },
  { date: "14 Oct", particulars: "Sale return SR26000003", debit: 0, credit: 2480, balance: "17,120 Dr" },
];

const inr = (n: number) => (n ? `₹${n.toLocaleString("en-IN")}` : "—");

export default function DesignPage() {
  const [priceRange, setPriceRange] = useState<number[]>([800, 1600]);
  const [counted, setCounted] = useState(68);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-10 px-4 py-8">
      <header>
        <p className="text-sm font-medium text-primary">Tejaswi Trading Company</p>
        <h1 className="font-heading text-2xl font-bold">Design system</h1>
        <p className="text-muted-foreground">
          The building blocks every screen is made from. Mobile first; widen the window to see the desktop layout.
        </p>
      </header>

      <Section title="Call to action" note="One primary action per screen; everything else steps down.">
        <div className="flex flex-wrap items-center gap-2">
          <Button>Proceed to checkout</Button>
          <Button variant="secondary">Save as order</Button>
          <Button variant="outline">Add product</Button>
          <Button variant="ghost">Cancel</Button>
          <Button variant="destructive">
            <Trash2 data-icon="inline-start" />
            Remove
          </Button>
          <Button variant="outline" size="icon" className="size-11" aria-label="Add">
            <Plus />
          </Button>
        </div>
        <Button size="lg" className="w-full sm:w-auto">
          Confirm sale · ₹77,140
        </Button>
      </Section>

      <Section title="Labels" note="Badges for status, field labels for inputs.">
        <div className="flex flex-wrap gap-2">
          <Badge>Paid</Badge>
          <Badge variant="secondary">In stock</Badge>
          <Badge variant="outline">25 kg</Badge>
          <Badge variant="destructive">Low stock</Badge>
          <Badge variant="outline">Reserved 40</Badge>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">Phone number</Label>
            <Input id="phone" inputMode="tel" placeholder="98765 43210" className="h-11" />
            <p className="text-xs text-muted-foreground">We'll send a 6-digit code to this number.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>OTP</Label>
            <InputOTP maxLength={6}>
              <InputOTPGroup>
                {Array.from({ length: 6 }, (_, i) => (
                  <InputOTPSlot key={i} index={i} />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>
        </div>
      </Section>

      <Section title="Cards with heading and paragraph" note="Summaries and explanations.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="font-heading">Receivables</CardTitle>
              <CardDescription>Money customers owe you</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              <p className="font-heading text-3xl font-bold">₹4,82,300</p>
              <p className="text-sm text-muted-foreground">
                Across 23 customers. 6 of them haven't paid in over 30 days.
              </p>
            </CardContent>
            <CardFooter>
              <Button variant="outline" className="w-full">
                View customers
              </Button>
            </CardFooter>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="font-heading">Stock count</CardTitle>
              <CardDescription>Last reconciled on 10 Oct 2026</CardDescription>
              <CardAction>
                <Switch defaultChecked aria-label="Count mode" />
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Count every product in a godown, then tick the godown. The day turns green when every godown is
                checked, red if anything didn't match.
              </p>
              <Progress value={counted} />
              <p className="text-xs text-muted-foreground">{counted}% of products counted</p>
            </CardContent>
            <CardFooter className="gap-2">
              <Button variant="secondary" onClick={() => setCounted(Math.min(100, counted + 8))}>
                Count next
              </Button>
            </CardFooter>
          </Card>
        </div>
      </Section>

      <Section title="Product card" note="From the sale page spec: pack size, hidden tax details, price and quantity, godown allocation.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ProductCard />
        </div>
      </Section>

      <Section title="Rows of data" note="Lists on mobile, tables where columns matter.">
        <Card className="py-2">
          <ItemGroup>
            {cartRows.map((row, i) => (
              <div key={row.name}>
                {i > 0 && <ItemSeparator />}
                <Item size="sm">
                  <ItemMedia variant="image">
                    <ImagePlaceholder className="size-full [&_svg]:size-5" />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle className="capitalize">{row.name}</ItemTitle>
                    <ItemDescription>
                      {row.pack} · {row.qty} × {inr(row.price)}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <span className="font-medium">{inr(row.qty * row.price)}</span>
                    <Button variant="ghost" size="icon" className="size-11" aria-label="Edit">
                      <Pencil />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-11" aria-label="Remove">
                      <Trash2 />
                    </Button>
                  </ItemActions>
                </Item>
              </div>
            ))}
          </ItemGroup>
          <Separator className="my-2" />
          <dl className="grid grid-cols-2 gap-y-1 px-4 pb-2 text-sm">
            <dt className="text-muted-foreground">Total before GST</dt>
            <dd className="text-right">₹73,467</dd>
            <dt className="text-muted-foreground">GST</dt>
            <dd className="text-right">₹3,673</dd>
            <dt className="font-medium">Grand total</dt>
            <dd className="text-right font-heading text-lg font-bold">₹77,140</dd>
          </dl>
        </Card>

        {/* ledger on phones: one row per entry, amount and running balance on the right */}
        <Card className="py-2 md:hidden">
          <ItemGroup>
            {ledgerRows.map((row, i) => (
              <div key={row.particulars}>
                {i > 0 && <ItemSeparator />}
                <Item size="sm">
                  <ItemContent>
                    <ItemTitle>{row.particulars}</ItemTitle>
                    <ItemDescription>{row.date}</ItemDescription>
                  </ItemContent>
                  <ItemActions className="flex-col items-end gap-0.5">
                    <span className={`font-medium ${row.credit ? "text-primary" : ""}`}>
                      {row.debit ? `${inr(row.debit)} Dr` : `${inr(row.credit)} Cr`}
                    </span>
                    <span className="text-xs text-muted-foreground">Bal ₹{row.balance}</span>
                  </ItemActions>
                </Item>
              </div>
            ))}
          </ItemGroup>
        </Card>

        {/* same ledger from tablet width up, where columns fit */}
        <Card className="hidden py-0 md:flex">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Particulars</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ledgerRows.map((row) => (
                <TableRow key={row.particulars}>
                  <TableCell className="text-muted-foreground">{row.date}</TableCell>
                  <TableCell className="font-medium">{row.particulars}</TableCell>
                  <TableCell className="text-right">{inr(row.debit)}</TableCell>
                  <TableCell className="text-right">{inr(row.credit)}</TableCell>
                  <TableCell className="text-right font-medium">₹{row.balance}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </Section>

      <Section title="Sliders" note="Allocation on the product card, ranges in filters.">
        <Card>
          <CardContent className="flex flex-col gap-6">
            <div className="flex flex-col gap-3">
              <div className="flex justify-between text-sm">
                <Label>Price range</Label>
                <span className="font-medium">
                  {inr(priceRange[0]!)} – {inr(priceRange[1]!)}
                </span>
              </div>
              <Slider
                value={priceRange}
                min={0}
                max={3000}
                step={50}
                onValueChange={(v) => setPriceRange(Array.isArray(v) ? [...v] : [v as number])}
              />
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex justify-between text-sm">
                <Label>Stock count progress</Label>
                <span className="font-medium">{counted}%</span>
              </div>
              <Slider value={[counted]} max={100} onValueChange={(v) => setCounted(first(v))} />
            </div>
          </CardContent>
        </Card>
      </Section>
    </main>
  );
}
