<script setup>
import { ref, computed, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-vue-next'
import { api } from '../api'
import { money } from '../utils'
import { useToast } from '../toast'
import BaseModal from './BaseModal.vue'
import { btnGhost } from '../ui'

const props = defineProps({ customer: { type: Object, default: null } })
const emit = defineEmits(['close'])

const toast = useToast()
const PER = 10
const rows = ref([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const summary = ref(null)
const pages = computed(() => Math.max(1, Math.ceil(total.value / PER)))

const days = computed(() => Number(props.customer?.idle_days ?? 0))
const services = computed(() => Number(props.customer?.active_services ?? 0))

let seq = 0
async function load() {
  if (!props.customer) return
  const mine = ++seq
  loading.value = true
  try {
    const p = new URLSearchParams({
      customer_id: props.customer.id, page: page.value, limit: PER, sort: 'date', dir: 'desc',
    })
    const res = await api.get(`/transactions?${p}`)
    if (mine !== seq) return
    rows.value = res.data
    total.value = res.total
    summary.value = res.summary
  } catch (e) {
    if (mine === seq) toast.error(e.message)
  } finally {
    if (mine === seq) loading.value = false
  }
}

watch(() => props.customer, (c) => {
  rows.value = []
  total.value = 0
  summary.value = null
  const was = page.value
  page.value = 1
  if (c && was === 1) load()
})
watch(page, load)

const kindUi = {
  new: { label: 'Nueva', cls: 'bg-indigo-100 text-indigo-700' },
  renewal: { label: 'Renovación', cls: 'bg-emerald-100 text-emerald-700' },
}
</script>

<template>
  <BaseModal :open="!!customer" size="xl" :title="`Pagos de ${customer?.name ?? ''}`" @close="emit('close')">
    <div v-if="customer?.status === 'active'" class="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
      Activo con <strong>{{ services }} {{ services === 1 ? 'servicio' : 'servicios' }}</strong>
      <template v-if="customer.last_end"> · el último vence el {{ customer.last_end }}</template>
    </div>
    <div v-else-if="customer?.status === 'never'" class="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
      Este cliente todavía no ha comprado nada.
    </div>
    <div v-else-if="customer?.status === 'inactive'" class="rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-800">
      Inactivo: <strong>{{ days }} {{ days === 1 ? 'día' : 'días' }} sin comprar nada</strong> · último vencimiento {{ customer.last_end }}
    </div>
    <div v-else-if="customer?.status === 'recent'" class="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
      Su servicio venció hace {{ days }} {{ days === 1 ? 'día' : 'días' }} ({{ customer.last_end }}).
    </div>

    <div v-if="summary" class="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <div class="rounded-lg bg-slate-100 px-3 py-2">
        <p class="text-xs text-slate-500">Total pagado</p>
        <p class="font-semibold">{{ money.format(Number(summary.total)) }}</p>
      </div>
      <div class="rounded-lg bg-slate-100 px-3 py-2">
        <p class="text-xs text-slate-500">Pagos</p>
        <p class="font-semibold">{{ summary.n }}</p>
      </div>
      <div class="rounded-lg bg-slate-100 px-3 py-2">
        <p class="text-xs text-slate-500">Nuevas</p>
        <p class="font-semibold">{{ money.format(Number(summary.new_total)) }}</p>
      </div>
      <div class="rounded-lg bg-slate-100 px-3 py-2">
        <p class="text-xs text-slate-500">Renovaciones</p>
        <p class="font-semibold">{{ money.format(Number(summary.renewal_total)) }}</p>
      </div>
    </div>
    <p v-if="summary && summary.first_on" class="text-xs text-slate-500">
      Primer pago {{ summary.first_on }} · último pago {{ summary.last_on }}
    </p>

    <p v-if="loading && !rows.length" class="py-4 text-slate-500">Cargando…</p>
    <p v-else-if="!rows.length" class="py-4 text-slate-500">Este cliente aún no tiene pagos registrados.</p>

    <ul v-else :class="['divide-y divide-slate-100 transition-opacity', loading && 'opacity-60']">
      <li v-for="t in rows" :key="t.id" class="flex items-center gap-3 py-2.5">
        <div class="min-w-0 flex-1">
          <p class="truncate font-medium">{{ t.product_name || 'Sin datos' }}</p>
          <p class="truncate text-xs text-slate-500">{{ t.detail }}</p>
        </div>
        <div class="flex shrink-0 flex-col items-end gap-1">
          <span :class="['rounded-full px-2 py-0.5 text-xs font-medium', kindUi[t.kind].cls]">{{ kindUi[t.kind].label }}</span>
          <span v-if="t.type === 'profile'" class="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-violet-700">Perfil</span>
        </div>
        <div class="w-24 shrink-0 text-right">
          <p class="font-medium">{{ money.format(Number(t.amount)) }}</p>
          <p class="text-xs text-slate-500">{{ t.paid_on }}</p>
        </div>
      </li>
    </ul>

    <div v-if="total > PER" class="flex items-center justify-between text-xs text-slate-500">
      <span>Página {{ page }} de {{ pages }} · {{ total }} pagos</span>
      <div class="flex gap-1.5">
        <button type="button" :disabled="page <= 1" class="rounded-lg bg-slate-100 p-1.5 disabled:opacity-40" aria-label="Anterior" @click="page--"><ChevronLeft class="size-4" /></button>
        <button type="button" :disabled="page >= pages" class="rounded-lg bg-slate-100 p-1.5 disabled:opacity-40" aria-label="Siguiente" @click="page++"><ChevronRight class="size-4" /></button>
      </div>
    </div>

    <template #footer>
      <RouterLink v-if="customer"
        :to="{ path: '/transacciones', query: { customer_id: customer.id, customer_name: customer.name } }"
        class="mr-auto inline-flex items-center gap-1 self-center text-sm font-medium text-indigo-600 hover:underline">
        Ver en Transacciones <ExternalLink class="size-3.5" />
      </RouterLink>
      <button type="button" :class="btnGhost" @click="emit('close')">Cerrar</button>
    </template>
  </BaseModal>
</template>