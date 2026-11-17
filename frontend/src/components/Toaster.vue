<script setup>
import { CircleAlert, CircleCheck, Info, X } from "lucide-vue-next";
import { useToast } from "../toast";

const { toasts, remove } = useToast();
const styles = {
  error:
    "border-rose-500/40 bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
  success:
    "border-emerald-500/40 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  info: "border-indigo-500/40 bg-indigo-50 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200",
};
const icons = { error: CircleAlert, success: CircleCheck, info: Info };
</script>

<template>
  <div
    class="pointer-events-none fixed right-4 top-4 z-70 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2"
  >
    <TransitionGroup
      enter-active-class="transition duration-200"
      enter-from-class="translate-x-6 opacity-0"
      leave-active-class="transition duration-150"
      leave-to-class="translate-x-6 opacity-0"
      move-class="transition duration-200"
    >
      <div
        v-for="t in toasts"
        :key="t.id"
        role="alert"
        :class="[
          'pointer-events-auto flex items-start gap-3 rounded-xl border p-3 text-sm shadow-lg',
          styles[t.type],
        ]"
      >
        <component :is="icons[t.type]" class="mt-0.5 size-5 shrink-0" />
        <p class="flex-1">{{ t.message }}</p>
        <button
          class="opacity-60 hover:opacity-100"
          aria-label="Cerrar"
          @click="remove(t.id)"
        >
          <X class="size-4" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>
