import { reactive } from 'vue'

const toasts = reactive([])
let nextId = 0

function remove(id) {
  const i = toasts.findIndex((t) => t.id === id)
  if (i > -1) toasts.splice(i, 1)
}

function show(message, type = 'info', duration = 5000) {
  const id = ++nextId
  toasts.push({ id, message, type })
  if (duration) setTimeout(() => remove(id), duration)
}

export function useToast() {
  return {
    toasts,
    remove,
    success: (m) => show(m, 'success', 3500),
    error: (m) => show(m, 'error', 6000),
    info: (m) => show(m, 'info'),
  }
}