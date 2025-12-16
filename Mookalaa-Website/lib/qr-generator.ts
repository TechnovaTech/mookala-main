// Simple QR code generator using external service
export const generateQRCode = (data: string): string => {
  // Using QR Server API for QR code generation
  const encodedData = encodeURIComponent(data)
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodedData}`
}

// Alternative: Generate QR code as SVG
export const generateQRCodeSVG = (data: string): string => {
  // Simple QR code pattern (for demo - in production use proper QR library)
  const size = 200
  const modules = 25
  const moduleSize = size / modules
  
  let svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">`
  
  // Create a simple pattern based on data hash
  const hash = data.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0)
    return a & a
  }, 0)
  
  for (let i = 0; i < modules; i++) {
    for (let j = 0; j < modules; j++) {
      const shouldFill = (hash + i * j) % 3 === 0
      if (shouldFill) {
        svg += `<rect x="${i * moduleSize}" y="${j * moduleSize}" width="${moduleSize}" height="${moduleSize}" fill="black"/>`
      }
    }
  }
  
  svg += '</svg>'
  return `data:image/svg+xml;base64,${btoa(svg)}`
}