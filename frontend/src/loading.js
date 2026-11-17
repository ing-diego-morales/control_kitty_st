import { ref, computed } from 'vue'

const pending = ref(0)
export const isLoading = computed(() => pending.value > 0)
export const startLoading = () => { pending.value++ }
export const stopLoading = () => { pending.value = Math.max(0, pending.value - 1) }