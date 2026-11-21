type ToastType = "success" | "error" | "info"

const COLOURS: Record<ToastType, string> = {
  success: "#16a34a",
  error: "#dc2626",
  info: "#2563eb",
}

/**
 * A short message in the corner of the page. The text is set with
 * `textContent`, never as HTML, so a message that quotes an event or venue
 * name cannot inject markup.
 */
export function showToast(message: string, type: ToastType = "info") {
  if (typeof document === "undefined") return
  document.getElementById("toast-notification")?.remove()

  const toast = document.createElement("div")
  toast.id = "toast-notification"
  toast.setAttribute("role", type === "error" ? "alert" : "status")
  toast.setAttribute("aria-live", type === "error" ? "assertive" : "polite")
  toast.textContent = message
  Object.assign(toast.style, {
    position: "fixed",
    top: "5.5rem",
    right: "1rem",
    zIndex: "100",
    maxWidth: "min(24rem, calc(100vw - 2rem))",
    padding: "0.875rem 1.25rem",
    borderRadius: "0.5rem",
    boxShadow: "0 10px 25px rgba(0,0,0,0.35)",
    color: "#ffffff",
    fontWeight: "500",
    fontSize: "0.95rem",
    lineHeight: "1.4",
    background: COLOURS[type],
    transition: "opacity 0.25s ease, transform 0.25s ease",
    opacity: "0",
    transform: "translateY(-0.5rem)",
  })
  document.body.appendChild(toast)

  requestAnimationFrame(() => {
    toast.style.opacity = "1"
    toast.style.transform = "translateY(0)"
  })

  window.setTimeout(
    () => {
      toast.style.opacity = "0"
      window.setTimeout(() => toast.remove(), 300)
    },
    type === "error" ? 6000 : 4000,
  )
}
