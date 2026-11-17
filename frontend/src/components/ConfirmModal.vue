<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { AlertTriangle, Info } from 'lucide-vue-next'
import { useConfirm } from '../confirm'

const { state, answer } = useConfirm()
const danger = computed(() => state.tone === 'danger')
const cancelBtn = ref(null)
const confirmBtn = ref(null)

watch(() => state.open, async (open) => {
  if (!open) return
  await nextTick()
  ;(danger.value ? cancelBtn : confirmBtn).value?.focus()
})

function onKey(e) {
  if (!state.open) return
  if (e.key === 'Escape') answer(false)
  if (e.key === 'Tab') {
    e.preventDefault()
    ;(document.activeElement === cancelBtn.value ? confirmBtn : cancelBtn).value?.focus()
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
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
      <div v-if="state.open"
        class="fixed inset-0 z-[60] grid place-items-center bg-slate-950/60 p-4 backdrop-blur-[2px]"
        @mousedown.self="answer(false)">
        <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-msg"
          class="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-black/5">
          <div class="flex items-start gap-3">
            <span :class="['grid size-9 shrink-0 place-items-center rounded-full',
              danger ? 'bg-rose-100 text-rose-600' : 'bg-indigo-100 text-indigo-600']">
              <component :is="danger ? AlertTriangle : Info" class="size-5" />
            </span>
            <div class="min-w-0 flex-1">
              <h2 id="confirm-title" class="font-semibold">{{ state.title }}</h2>
              <p v-if="state.message" id="confirm-msg" class="mt-1 text-sm text-slate-500">{{ state.message }}</p>
              <p v-if="state.detail"
                class="mt-2 truncate rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-600">{{ state.detail }}</p>
            </div>
          </div>

          <div class="mt-5 flex justify-end gap-2">
            <button ref="cancelBtn" type="button"
              class="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
              @click="answer(false)">{{ state.cancelText }}</button>
            <button ref="confirmBtn" type="button"
              :class="['rounded-lg px-3.5 py-2 text-sm font-medium text-white transition',
                danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700']"
              @click="answer(true)">{{ state.confirmText }}</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>