"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchCart, placeOrder, validateCouponCode, type CouponValidationResult } from "@/lib/api";
import { toast } from "sonner";
import { Truck, CreditCard, Tag, X } from "lucide-react";

export default function CheckoutPage() {
  const router = useRouter();
  const [cartItems, setCartItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shippingAddress, setShippingAddress] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash on Delivery");
  const [couponInput, setCouponInput] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<CouponValidationResult | null>(null);

  const DELIVERY_FEE = 60;

  // Fetch cart on component mount
  useEffect(() => {
    const loadCart = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetchCart();
        setCartItems(response.data || []);
      } catch (err: any) {
        if (err.message.includes("Unauthorized")) {
          setError("Please login to checkout");
          // Redirect to login after 2 seconds
          setTimeout(() => router.push("/login"), 2000);
        } else {
          setError(err.message || "Failed to load cart");
        }
        setCartItems([]);
      } finally {
        setLoading(false);
      }
    };

    loadCart();
  }, [router]);

  const cartTotal = cartItems.reduce((acc, curr) => acc + curr.total_price, 0);
  const discountAmount = appliedCoupon?.discount_amount ?? 0;
  const totalPayment = cartTotal - discountAmount + DELIVERY_FEE;

  const handleApplyCoupon = async () => {
    if (!couponInput.trim()) {
      toast.error("Enter a coupon code");
      return;
    }
    setCouponLoading(true);
    try {
      const result = await validateCouponCode(couponInput.trim(), cartTotal);
      setAppliedCoupon(result);
      toast.success(`Coupon applied! You save ৳${result.discount_amount.toLocaleString()}`);
    } catch (err: any) {
      toast.error(err.message || "Invalid coupon");
      setAppliedCoupon(null);
    } finally {
      setCouponLoading(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponInput("");
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!shippingAddress.trim()) {
      toast.error("Please enter a shipping address");
      return;
    }

    if (cartItems.length === 0) {
      toast.error("Your cart is empty");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const response = await placeOrder(paymentMethod, shippingAddress, appliedCoupon?.code);

      if (response.data.redirect && response.data.checkout_url) {
        // Online Payment — redirect to SSLCommerz gateway
        toast.success("Redirecting to payment gateway...");
        window.location.href = response.data.checkout_url;
      } else {
        // COD — redirect to orders page
        toast.success(
          "Order placed successfully! Redirecting to your orders...",
        );
        setTimeout(() => {
          router.push("/profile/orders");
        }, 2000);
      }
    } catch (err: any) {
      console.error("[Checkout] Error placing order:", err);
      const errorMessage = err.message || "Failed to place order";
      setError(errorMessage);
      toast.error(errorMessage);
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <h2 className="text-2xl font-bold mb-4 text-gray-800">
          Loading checkout...
        </h2>
        <p className="text-gray-500">Please wait while we fetch your cart.</p>
      </div>
    );
  }

  if (error && cartItems.length === 0) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <h2 className="text-2xl font-bold mb-4 text-red-600">Error</h2>
        <p className="text-gray-500 mb-8">{error}</p>
        <Link href="/search">
          <Button className="bg-primary hover:bg-primary/90">
            Continue Shopping
          </Button>
        </Link>
      </div>
    );
  }

  if (cartItems.length === 0) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <h2 className="text-2xl font-bold mb-4 text-gray-800">
          Your Cart is Empty
        </h2>
        <p className="text-gray-500 mb-8">
          Please add items to your cart before checking out.
        </p>
        <Link href="/search">
          <Button className="bg-primary hover:bg-primary/90">
            Continue Shopping
          </Button>
        </Link>
      </div>
    );
  }

  const paymentOptions = [
    {
      value: "Cash on Delivery",
      label: "Cash on Delivery",
      description: "Pay when you receive your order",
      icon: Truck,
    },
    {
      value: "Online Payment",
      label: "Online Payment",
      description: "Pay securely via SSLCommerz",
      icon: CreditCard,
    },
  ];

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Checkout</h1>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      <form
        onSubmit={handlePlaceOrder}
        className="flex flex-col lg:flex-row gap-8"
      >
        {/* Left Forms */}
        <div className="flex-1 space-y-8">
          {/* Order Items */}
          <Card className="shadow-sm border-gray-100">
            <CardHeader>
              <CardTitle className="text-xl">Order Items</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {cartItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex justify-between items-center pb-4 border-b last:border-b-0"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{item.name}</p>
                      <p className="text-sm text-gray-500">
                        Quantity: {item.quantity}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-gray-900">
                        ৳ {item.total_price.toLocaleString()}
                      </p>
                      <p className="text-sm text-gray-500">
                        ৳ {item.price.toLocaleString()} each
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-gray-100">
            <CardHeader>
              <CardTitle className="text-xl">Shipping Address</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label
                    className="text-sm font-medium leading-none"
                    htmlFor="address"
                  >
                    Full Address
                  </label>
                  <Input
                    id="address"
                    placeholder="123 Main St, Dhaka, Bangladesh"
                    value={shippingAddress}
                    onChange={(e) => setShippingAddress(e.target.value)}
                    required
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Coupon Code */}
          <Card className="shadow-sm border-gray-100">
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <Tag className="h-5 w-5" />
                Coupon Code
              </CardTitle>
            </CardHeader>
            <CardContent>
              {appliedCoupon ? (
                <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-4 py-3">
                  <div>
                    <p className="font-semibold text-green-800">{appliedCoupon.code}</p>
                    <p className="text-sm text-green-600">
                      You save ৳{appliedCoupon.discount_amount.toLocaleString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveCoupon}
                    className="rounded-full p-1 text-green-600 hover:bg-green-100"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter coupon code"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleApplyCoupon())}
                    disabled={couponLoading}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleApplyCoupon}
                    disabled={couponLoading}
                    className="shrink-0"
                  >
                    {couponLoading ? "Applying..." : "Apply"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm border-gray-100">
            <CardHeader>
              <CardTitle className="text-xl">Payment Method</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {paymentOptions.map((option) => {
                  const isSelected = paymentMethod === option.value;
                  const Icon = option.icon;
                  return (
                    <label
                      key={option.value}
                      className={`flex items-center gap-4 p-4 border-2 rounded-xl cursor-pointer transition-all duration-200 ${
                        isSelected
                          ? "border-primary bg-orange-50 shadow-sm"
                          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="paymentMethod"
                        value={option.value}
                        checked={isSelected}
                        onChange={() => setPaymentMethod(option.value)}
                        className="sr-only"
                      />
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                          isSelected
                            ? "bg-primary text-white"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <p
                          className={`font-semibold ${isSelected ? "text-primary" : "text-gray-700"}`}
                        >
                          {option.label}
                        </p>
                        <p className="text-sm text-gray-500">
                          {option.description}
                        </p>
                      </div>
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          isSelected ? "border-primary" : "border-gray-300"
                        }`}
                      >
                        {isSelected && (
                          <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Summary */}
        <div className="w-full lg:w-96 shrink-0">
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm sticky top-24">
            <h2 className="text-xl font-bold text-gray-900 mb-6">
              Order Summary
            </h2>
            <div className="space-y-4 text-sm text-gray-600 mb-6 border-b pb-6">
              <div className="flex justify-between">
                <span>Items Total ({cartItems.length})</span>
                <span>৳ {cartTotal.toLocaleString()}</span>
              </div>
              {appliedCoupon && (
                <div className="flex justify-between text-green-600 font-medium">
                  <span className="flex items-center gap-1">
                    <Tag className="h-3.5 w-3.5" />
                    Coupon ({appliedCoupon.code})
                  </span>
                  <span>− ৳ {appliedCoupon.discount_amount.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Delivery Fee</span>
                <span>৳ {DELIVERY_FEE.toLocaleString()}</span>
              </div>
            </div>
            <div className="flex justify-between font-bold text-xl text-gray-900 mb-8">
              <span>Total Payment</span>
              <span className="text-primary">
                ৳ {totalPayment.toLocaleString()}
              </span>
            </div>

            <Button
              type="submit"
              disabled={submitting || cartItems.length === 0}
              className="w-full bg-primary hover:bg-primary/90 text-white font-bold h-14 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting
                ? paymentMethod === "Online Payment"
                  ? "Redirecting to Payment..."
                  : "Placing Order..."
                : paymentMethod === "Online Payment"
                  ? "Pay Now"
                  : "Place Order"}
            </Button>

            {paymentMethod === "Online Payment" && (
              <p className="text-xs text-center text-amber-600 mt-3 font-medium">
                ⏱ Products will be reserved for 10 minutes during payment
              </p>
            )}

            <p className="text-xs text-center text-gray-400 mt-4">
              By clicking &quot;{paymentMethod === "Online Payment" ? "Pay Now" : "Place Order"}&quot; you agree to our Terms &
              Conditions.
            </p>
          </div>
        </div>
      </form>
    </div>
  );
}
