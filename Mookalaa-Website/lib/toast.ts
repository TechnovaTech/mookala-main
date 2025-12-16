// Toast notification system
export const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
  // Remove existing toast
  const existingToast = document.getElementById('toast-notification')
  if (existingToast) {
    existingToast.remove()
  }

  // Create toast element
  const toast = document.createElement('div')
  toast.id = 'toast-notification'
  toast.className = `fixed top-4 right-4 z-50 px-6 py-4 rounded-lg shadow-lg text-white font-medium transform transition-all duration-300 translate-x-full`
  
  // Set background color based on type
  const colors = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    info: 'bg-blue-500'
  }
  toast.classList.add(colors[type])
  
  // Add icon based on type
  const icons = {
    success: '✓',
    error: '✕',
    info: 'ℹ'
  }
  
  toast.innerHTML = `
    <div class="flex items-center gap-3">
      <span class="text-lg">${icons[type]}</span>
      <span>${message}</span>
    </div>
  `
  
  // Add to document
  document.body.appendChild(toast)
  
  // Animate in
  setTimeout(() => {
    toast.classList.remove('translate-x-full')
  }, 100)
  
  // Auto remove after 3 seconds
  setTimeout(() => {
    toast.classList.add('translate-x-full')
    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove()
      }
    }, 300)
  }, 3000)
}

// Confirmation dialog
export const showConfirmation = (message: string, onConfirm: () => void) => {
  const modal = document.createElement('div')
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'
  modal.innerHTML = `
    <div class="bg-white rounded-lg p-6 max-w-sm w-full mx-4 shadow-xl">
      <h3 class="text-lg font-semibold mb-4 text-gray-900">Confirm Action</h3>
      <p class="text-gray-600 mb-6">${message}</p>
      <div class="flex gap-3">
        <button id="confirm-cancel" class="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
          Cancel
        </button>
        <button id="confirm-ok" class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          Confirm
        </button>
      </div>
    </div>
  `
  
  document.body.appendChild(modal)
  
  // Handle buttons
  const cancelBtn = modal.querySelector('#confirm-cancel')
  const okBtn = modal.querySelector('#confirm-ok')
  
  cancelBtn?.addEventListener('click', () => {
    modal.remove()
  })
  
  okBtn?.addEventListener('click', () => {
    modal.remove()
    onConfirm()
  })
  
  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove()
    }
  })
}