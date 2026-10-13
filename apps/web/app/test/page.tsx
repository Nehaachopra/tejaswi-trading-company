"use client";

import { useState } from "react";
import {
  Package,
  CircleDollarSign,
  Coins,
  ShoppingBag,
  Warehouse,
  Pencil,
  Save,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

const packSizes = ["100 Kg", "50 Kg", "25 Kg", "20 Kg"];

const initialProduct = {
  name: "Sona masoori",
  available: "100000",
  price: "6000",
  gstRate: "12",
  quantity: "100000",
  godown: "A",
  godownQuantity: "100000",
};

const formatNumber = (value: string) => {
  const number = Number(value);
  return Number.isFinite(number) && value !== ""
    ? new Intl.NumberFormat("en-IN", {
        maximumFractionDigits: 2,
      }).format(number)
    : "—";
};

export default function ProductInventoryCard() {
  const [product, setProduct] = useState(initialProduct);
  const [savedProduct, setSavedProduct] = useState(initialProduct);
  const [selectedPack, setSelectedPack] = useState("100 Kg");
  const [isEditing, setIsEditing] = useState(false);

  const update = (key: keyof typeof product, value: string) => {
    setProduct((current) => ({ ...current, [key]: value }));
  };

  const price = Number(product.price) || 0;
  const gstRate = Number(product.gstRate) || 0;
  const priceWithGst = price * (1 + gstRate / 100);

  function save() {
    setSavedProduct(product);
    setIsEditing(false);
    // Replace with your API mutation.
  }

  function cancel() {
    setProduct(savedProduct);
    setIsEditing(false);
  }

  return (
    <div className="bg-muted w-screen h-screen flex items-center justify-center">
      <Card className="w-full max-w-2xl overflow-hidden  border-border shadow-sm bg-card">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4 font-heading ">
        <CardTitle className="text-xl tracking-tight sm:text-2xl font-bold">
          {product.name}
        </CardTitle>

        <div className="flex flex-wrap gap-2">
          {packSizes.map((size) => (
            <Button
              key={size}
              size="sm"
              variant={selectedPack === size ? "default" : "outline"}
              className=""
              onClick={() => setSelectedPack(size)}
            >
              {size}
            </Button>
          ))}
        </div>
      </CardHeader>

      <div className="px-5 sm:px-7">
        <Separator />
      </div>

      <CardContent className="grid grid-cols-1 gap-6 p-5 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-8 sm:p-4">
        <div className="flex items-start justify-center">
          <div className="flex aspect-square w-full max-w-[180px] items-center justify-center overflow-hidden rounded-lg border bg-muted/30 p-3">
            <img
              src="/products/sona-masoori.png"
              alt={product.name}
              className="h-full w-full object-contain"
            />
          </div>
        </div>

        <div className="flex min-w-0 flex-col justify-center gap-5">
          <DetailRow
            icon={<Package />}
            label="Available"
            value={formatNumber(product.available)}
          />

          {isEditing ? (
            <EditableField
              id="price"
              label="Price"
              value={product.price}
              onChange={(value) => update("price", value)}
            />
          ) : (
            <DetailRow
              icon={<CircleDollarSign />}
              label="Price"
              value={formatNumber(product.price)}
            />
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {isEditing ? (
              <div className="space-y-2">
                <Label htmlFor="gstRate">GST (%)</Label>
                <Input
                  id="gstRate"
                  type="number"
                  min="0"
                  max="100"
                  value={product.gstRate}
                  onChange={(event) =>
                    update("gstRate", event.target.value)
                  }
                  className=""
                />
              </div>
            ) : null}

            <div className={isEditing ? "flex items-end" : ""}>
              <DetailRow
                icon={<Coins />}
                label="Price + GST"
                value={formatNumber(priceWithGst.toFixed(2))}
              />
            </div>
          </div>

          {isEditing ? (
            <EditableField
              id="quantity"
              label="Quantity"
              value={product.quantity}
              onChange={(value) => update("quantity", value)}
            />
          ) : (
            <DetailRow
              icon={<ShoppingBag />}
              label="Quantity"
              value={formatNumber(product.quantity)}
              muted
            />
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="godown">Godown</Label>
              <Select
                value={product.godown}
                onValueChange={(value) => update("godown", value)}
                disabled={!isEditing}
              >
                <SelectTrigger id="godown" className="">
                  <SelectValue placeholder="Select godown" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">Godown A</SelectItem>
                  <SelectItem value="B">Godown B</SelectItem>
                  <SelectItem value="C">Godown C</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <EditableField
              id="godownQuantity"
              label="Godown quantity"
              value={product.godownQuantity}
              onChange={(value) => update("godownQuantity", value)}
              disabled={!isEditing}
            />
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
            {isEditing ? (
              <>
                <Button
                  variant="outline"
                  className=""
                  onClick={cancel}
                >
                  <X className="mr-2 size-4" />
                  Cancel
                </Button>
                <Button className="" onClick={save}>
                  <Save className="mr-2 size-4" />
                  Save changes
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                className=""
                onClick={() => setIsEditing(true)}
              >
                <Pencil className="mr-2 size-4" />
                Edit product
              </Button>
            )}
          </div>
        </div>
      </CardContent>

      <Badge>Sale</Badge>
    </Card>
    </div>
    
  );
}

function DetailRow({
  icon,
  label,
  value,
  muted = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="shrink-0 text-muted-foreground [&_svg]:size-5">
          {icon}
        </span>
        <span className="truncate text-sm text-muted-foreground sm:text-base">
          {label}
        </span>
      </div>
      <span
        className={`text-right text-lg font-semibold tabular-nums sm:text-2xl ${
          muted ? "text-muted-foreground" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function EditableField({
  id,
  label,
  value,
  onChange,
  disabled = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        min="0"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className=" tabular-nums"
      />
    </div>
  );
}
