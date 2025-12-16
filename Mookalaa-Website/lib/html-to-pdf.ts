// HTML to PDF converter using browser's print functionality
export const convertHTMLToPDF = (htmlContent: string, filename: string) => {
  // Create a new window for printing
  const printWindow = window.open('', '_blank')
  
  if (!printWindow) {
    alert('Please allow popups to download PDF')
    return
  }

  // Write HTML content to the new window
  printWindow.document.write(htmlContent)
  printWindow.document.close()

  // Wait for content to load, then trigger print
  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.print()
      
      // Close the window after printing
      setTimeout(() => {
        printWindow.close()
      }, 1000)
    }, 500)
  }
}

// Alternative: Create downloadable PDF using jsPDF (if available)
export const generatePDFBlob = async (htmlContent: string): Promise<Blob> => {
  // For now, create a styled HTML that looks like PDF when printed
  const styledHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        @media print {
          body { margin: 0; }
          .no-print { display: none; }
        }
        @page {
          size: A4;
          margin: 0;
        }
      </style>
    </head>
    <body>
      ${htmlContent}
      <script>
        window.onload = function() {
          setTimeout(function() {
            window.print();
          }, 500);
        }
      </script>
    </body>
    </html>
  `
  
  return new Blob([styledHTML], { type: 'text/html' })
}