import { reactive } from 'vue'

const DEFAULTS = {
  title: 'Confirmar',
  message: '',
  detail: '',
  confirmText: 'Confirmar',
  cancelText: 'Cancelar',
  tone: 'default',
}

const state = reactive({ open: false, ...DEFAULTS })
let resolver = null

function ask(opts = {}) {
  if (resolver) resolver(false) 
  Object.assign(state, DEFAULTS, opts, { open: true })
  return new Promise((resolve) => { resolver = resolve })
}

function answer(ok) {
  state.open = false
  resolver?.(ok)
  resolver = null
}

export function useConfirm() {
  return { state, ask, answer }
}