<script setup>
import { ref, computed, watch } from 'vue'
import { Wallet, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { api } from '../api'
import { useToast } from '../toast'
import { money } from '../utils'

defineProps({ activeTotal: { type: [Number, String], default: 0 } })

const toast = useToast()
const pad = (n) => String(n).padStart(2, '0')
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parse = (s) => new Date(`${s}T00:00:00`)
const monthRange = (y, m) => ({ from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) })

const now = new Date()
const first = monthRange(now.getFullYear(), now.getMonth())
const from = ref(first.from)
const to = ref(first.to)
const data = ref(null)
const loading = ref(false)
let seq = 0

const emptyDate = computed(() => !from.value || !to.value)
const reversed = computed(() => !emptyDate.value && from.value > to.value)
const invalid = computed(() => emptyDate.value || reversed.value)

const label = computed(() => {
  if (invalid.value) return 'Rango no válido'
  const a = parse(from.value)
  const full = monthRange(a.getFullYear(), a.getMonth())
  if (from.value === full.from && to.value === full.to)
    return a.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })
  const f = (s) => parse(s).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${f(from.value)} → ${f(to.value)}`
})

function shift(delta) {
  const base = parse(from.value || iso(new Date()))
  const r = monthRange(base.getFullYear(), base.getMonth() + delta)
  from.value = r.from
  to.value = r.to
}

function thisMonth() {
  const d = new Date()
  const r = monthRange(d.getFullYear(), d.getMonth())
  from.value = r.from
  to.value = r.to
}

async function load() {
  if (invalid.value) {
    seq++           
    data.value = null
    return
  }
  const mine = ++seq
  loading.value = true
  try {
    const r = await api.get(`/dashboard/income?from=${from.value}&to=${to.value}`)
    if (mine === seq) data.value = r
  } catch (e) { toast.error(e.message) }
  finally { if (mine === seq) loading.value = false }
}

watch([from, to], load, { immediate: true })
</script>

<template>
  <div class="rounded-xl border-l-4 border-indigo-500 bg-white p-5 shadow-sm">
    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-2 text-sm text-slate-500">
        <Wallet class="size-4 text-indigo-500" />Ingresos
      </div>
      <div class="flex items-center gap-0.5">
        <button type="button" aria-label="Mes anterior"
          class="grid size-7 place-items-center rounded-md text-slate-500 hover:bg-slate-100" @click="shift(-1)">
          <ChevronLeft class="size-4" />
        </button>
        <button type="button" aria-label="Mes siguiente"
          class="grid size-7 place-items-center rounded-md text-slate-500 hover:bg-slate-100" @click="shift(1)">
          <ChevronRight class="size-4" />
        </button>
      </div>
    </div>

    <p class="mt-1 text-xs text-slate-400 first-letter:uppercase">{{ label }}</p>
    <p :class="['mt-1 text-3xl font-semibold transition-opacity', loading && 'opacity-50']">
      {{ invalid ? '—' : money.format(Number(data?.total ?? 0)) }}
    </p>
    <div v-if="data && !invalid" class="mt-2 space-y-0.5 text-xs text-slate-400">
      <p>{{ data.new_count }} nuevas · {{ money.format(Number(data.new_total)) }}</p>
      <p>{{ data.renewal_count }} renovaciones · {{ money.format(Number(data.renewal_total)) }}</p>
    </div>

    <details class="group mt-3">
      <summary class="cursor-pointer list-none text-xs font-medium text-indigo-600 hover:underline">
        Elegir fechas
      </summary>
      <div class="mt-2 space-y-2">
        <label class="block text-xs text-slate-500">Desde
          <input v-model="from" type="date" :max="to || undefined"
            class="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
        </label>
        <label class="block text-xs text-slate-500">Hasta
          <input v-model="to" type="date" :min="from || undefined"
            class="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
        </label>

        <p v-if="emptyDate" class="text-xs text-rose-600">
          Fecha incompleta o inexistente. Revisa el día (por ejemplo, noviembre solo tiene 30).
        </p>
        <p v-else-if="reversed" class="text-xs text-rose-600">
          La fecha inicial debe ser anterior a la final.
        </p>

        <button type="button" class="text-xs font-medium text-slate-500 hover:text-slate-800" @click="thisMonth">
          Volver a este mes
        </button>
        <p class="border-t border-slate-100 pt-2 text-xs text-slate-400">
          En alquileres activos hoy: {{ money.format(Number(activeTotal)) }}
        </p>
      </div>
    </details>
  </div>
</template>