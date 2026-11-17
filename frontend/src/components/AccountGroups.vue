<script setup>
import { RouterLink } from 'vue-router'
import { ChevronDown } from 'lucide-vue-next'

defineProps({
  groups: { type: Array, default: () => [] },
  kind: { type: String, default: 'free' }, 
  empty: { type: String, default: '' },
})

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
</script>

<template>
  <p v-if="!groups.length" class="mt-4 text-slate-500">{{ empty }}</p>
  <div v-else class="mt-4 space-y-2">
    <details v-for="g in groups" :key="g.name" class="group rounded-lg border border-slate-200">
      <summary class="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5">
        <span class="font-medium">{{ g.name }}</span>
        <span class="flex items-center gap-2 text-sm text-slate-500">
          {{ plural(g.total, 'cuenta', 'cuentas') }}<template v-if="kind === 'rented' && g.profiles"> · {{ plural(g.profiles, 'perfil', 'perfiles') }}</template>
          <ChevronDown class="size-4 transition group-open:rotate-180" />
        </span>
      </summary>

      <ul class="divide-y divide-slate-100 border-t border-slate-100 px-3">
        <li v-for="p in g.products" :key="p.product_id" class="flex items-center justify-between gap-3 py-2.5">
          <RouterLink v-if="kind === 'free'"
            :to="{ path: '/cuentas', query: { state: 'free', product_id: p.product_id } }"
            class="flex flex-1 items-center justify-between gap-3 hover:text-emerald-600">
            <span class="text-sm font-medium">{{ p.product_name }}</span>
            <span class="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">{{ p.total }} libres</span>
          </RouterLink>

          <template v-else>
            <span class="min-w-0 truncate text-sm font-medium">{{ p.product_name }}</span>
            <span class="flex shrink-0 gap-1.5">
              <RouterLink v-if="p.total"
                :to="{ path: '/alquileres', query: { state: 'live', product_id: p.product_id } }"
                class="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-700 transition hover:opacity-80">
                {{ plural(p.total, 'cuenta', 'cuentas') }}
              </RouterLink>
              <RouterLink v-if="p.profiles"
                :to="{ path: '/perfiles', query: { state: 'live', product_id: p.product_id } }"
                class="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-medium text-violet-700 transition hover:opacity-80">
                {{ plural(p.profiles, 'perfil', 'perfiles') }}
              </RouterLink>
            </span>
          </template>
        </li>
      </ul>
    </details>
  </div>
</template>