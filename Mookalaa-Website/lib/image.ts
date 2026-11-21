/**
 * Shrinks a photo in the browser before it is uploaded: at most 1280 pixels on
 * the long side, JPEG at about 80% quality. The backend rejects images above
 * roughly 1.5 MB. Returns raw base64 (no `data:` prefix), which is the form
 * the mobile app stores and reads.
 */
export async function photoToBase64(file: File, maxSide = 1280, quality = 0.8): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.")

  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error("This image could not be read. Please choose another one."))
      element.src = url
    })

    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext("2d")
    if (!context) throw new Error("This browser cannot prepare the image for upload.")
    // JPEG has no transparency: paint white behind transparent PNGs.
    context.fillStyle = "#ffffff"
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)

    const dataUrl = canvas.toDataURL("image/jpeg", quality)
    return dataUrl.slice(dataUrl.indexOf(",") + 1)
  } finally {
    URL.revokeObjectURL(url)
  }
}
