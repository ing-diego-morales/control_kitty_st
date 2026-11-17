<script setup>
defineProps({
  rows: { type: Number, default: 6 },
  cols: { type: Number, default: 4 },
})
</script>

<template>
  <div class="space-y-3" aria-busy="true" aria-label="Cargando datos">
    <div v-for="r in rows" :key="r" class="flex gap-4">
      <div v-for="c in cols" :key="c"
        class="h-5 flex-1 animate-pulse rounded-md bg-slate-200"
        :style="{ animationDelay: `${(r + c) * 60}ms` }" />
    </div>
  </div>
</template>