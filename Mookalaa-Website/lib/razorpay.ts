const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js"

export interface RazorpaySuccess {
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
}

interface RazorpayOptions {
  key: string
  amount: number
  currency: string
  order_id: string
  name: string
  description: string
  prefill?: { contact?: string; name?: string; email?: string }
  theme?: { color: string }
  handler: (response: RazorpaySuccess) => void
  modal?: { ondismiss?: () => void }
}

interface RazorpayInstance {
  open: () => void
  on: (event: "payment.failed", handler: (response: { error?: { description?: string } }) => void) => void
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance
  }
}

let loading: Promise<boolean> | null = null

/** Loads Razorpay Checkout when it is first needed. Resolves false when it cannot be loaded. */
export function loadRazorpay(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false)
  if (window.Razorpay) return Promise.resolve(true)
  if (!loading) {
    loading = new Promise<boolean>((resolve) => {
      const script = document.createElement("script")
      script.src = CHECKOUT_SRC
      script.async = true
      script.onload = () => resolve(Boolean(window.Razorpay))
      script.onerror = () => {
        script.remove()
        resolve(false)
      }
      document.head.appendChild(script)
    }).then((ok) => {
      if (!ok) loading = null // allow another try
      return ok
    })
  }
  return loading
}

/** Opens Checkout for an order the server created. Throws when Checkout is not loaded. */
export function openRazorpay(options: RazorpayOptions, onFailed: (message: string) => void) {
  if (!window.Razorpay) throw new Error("Razorpay Checkout is not loaded")
  const checkout = new window.Razorpay(options)
  checkout.on("payment.failed", (response) => {
    onFailed(response?.error?.description || "The payment did not go through.")
  })
  checkout.open()
}
