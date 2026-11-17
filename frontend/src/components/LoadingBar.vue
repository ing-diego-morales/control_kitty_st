<script setup>
import { isLoading } from '../loading'
</script>

<template>
  <Transition enter-active-class="transition-opacity duration-150" leave-active-class="transition-opacity duration-300"
    enter-from-class="opacity-0" leave-to-class="opacity-0">
    <div v-if="isLoading" class="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-emerald-500/20">
      <div class="loading-bar h-full w-1/3 bg-emerald-500" />
    </div>
  </Transition>
</template>