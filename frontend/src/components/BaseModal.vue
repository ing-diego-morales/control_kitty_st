<script setup>
import { watch, onBeforeUnmount } from 'vue'
import { X } from 'lucide-vue-next'
import { useConfirm } from '../confirm'

const props = defineProps({
  open: Boolean,
  title: { type: String, default: '' },
  size: { type: String, default: 'md' }, 
  busy: Boolean,
})
const emit = defineEmits(['close', 'submit'])

const { state: confirmState } = useConfirm()
const widths = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-2xl' }

function onKey(e) {
  if (e.key === 'Escape' && !confirmState.open && !props.busy) emit('close')
}

watch(() => props.open, (o) => {
  if (o) window.addEventListener('keydown', onKey)
  else window.removeEventListener('keydown', onKey)
}, { immediate: true })

onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-150"
      enter-from-class="opacity-0"
      leave-active-class="transition duration-100"
      leave-to-class="opacity-0"
    >
      <div v-if="open"
        class="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4 backdrop-blur-[2px]"
        @mousedown.self="!busy && emit('close')">
        <form role="dialog" aria-modal="true" :aria-label="title"
          :class="['flex max-h-[90vh] w-full flex-col rounded-2xl bg-white shadow-2xl ring-1 ring-black/5', widths[size]]"
          @submit.prevent="emit('submit')">
          <header class="flex items-center justify-between gap-3 px-5 pt-4">
            <h2 class="font-semibold">{{ title }}</h2>
            <button type="button" aria-label="Cerrar"
              class="grid size-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              @click="emit('close')">
              <X class="size-4" />
            </button>
          </header>

          <div class="space-y-3 overflow-y-auto px-5 py-3 text-sm"><slot /></div>

          <footer v-if="$slots.footer" class="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
            <slot name="footer" />
          </footer>
        </form>
      </div>
    </Transition>
  </Teleport>
</template>