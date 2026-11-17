<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Search, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, ArrowUpDown, X } from 'lucide-vue-next'
import { api } from '../api'
import { money, formatPhone } from '../utils'
import { useToast } from '../toast'

const route = useRoute()
const router = useRouter()
const toast = useToast()

const cols = [
  { key: 'date', label: 'Fecha' },
  { key: 'customer', label: 'Cliente' },
  { key: 'product', label: 'Servicio' },
  { key: 'kind', label: 'Concepto' },
  { key: 'amount', label: 'Monto', right: true },
]
const kindUi = {
  new: { label: 'Nueva', cls: 'bg-indigo-100 text-indigo-700' },
  renewal: { label: 'Renovación', cls: 'bg-emerald-100 text-emerald-700' },
}

const pad = (n) => String(n).padStart(2, '0')
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const monthRange = (y, m) => ({ from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) })
const now = new Date()
const thisM = monthRange(now.getFullYear(), now.getMonth())
const lastM = monthRange(now.getFullYear(), now.getMonth() - 1)

const from = ref(thisM.from)
const to = ref(thisM.to)
const kind = ref('')
const type = ref('')
const q = ref('')
const customerId = ref(route.query.customer_id || '')
const customerName = ref(route.query.customer_name || '')
const sortKey = ref('date')
const sortDir = ref('desc')
const page = ref(1)
const limit = 25

const rows = ref([])
const total = ref(0)
const sum = ref(null)
const loading = ref(false)
const pages = computed(() => Math.max(1, Math.ceil(total.value / limit)))

const invalid = computed(() => !!(from.value && to.value && from.value > to.value))
const preset = computed(() =>
  from.value === thisM.from && to.value === thisM.to ? 'month'
  : from.value === lastM.from && to.value === lastM.to ? 'last'
  : !from.value && !to.value ? 'all' : 'custom')
const hasFilters = computed(() =>
  preset.value !== 'month' || !!(kind.value || type.value || q.value.trim() || customerId.value)
  || sortKey.value !== 'date' || sortDir.value !== 'desc')

let seq = 0
async function load() {
  if (invalid.value) return
  const mine = ++seq
  loading.value = true
  try {
    const p = new URLSearchParams({ page: page.value, limit, sort: sortKey.value, dir: sortDir.value })
    if (from.value) p.set('from', from.value)
    if (to.value) p.set('to', to.value)
    if (kind.value) p.set('kind', kind.value)
    if (type.value) p.set('type', type.value)
    if (q.value.trim()) p.set('q', q.value.trim())
    if (customerId.value) p.set('customer_id', customerId.value)
    const res = await api.get(`/transactions?${p}`)
    if (mine !== seq) return
    if (!res.data.length && page.value > 1) { page.value--; return }
    rows.value = res.data
    total.value = res.total
    sum.value = res.summary
  } catch (e) {
    if (mine === seq) toast.error(e.message)
  } finally {
    if (mine === seq) loading.value = false
  }
}

const reload = () => (page.value === 1 ? load() : (page.value = 1))
let timer
watch(q, () => { clearTimeout(timer); timer = setTimeout(reload, 300) })
watch([from, to, kind, type, sortKey, sortDir, customerId], reload)
watch(page, load)
onMounted(load)

function setRange(r) { from.value = r.from; to.value = r.to }
function sortBy(key) {
  if (sortKey.value === key) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  else { sortKey.value = key; sortDir.value = key === 'date' || key === 'amount' ? 'desc' : 'asc' }
}
function pickSort(key) {
  sortKey.value = key
  sortDir.value = key === 'date' || key === 'amount' ? 'desc' : 'asc'
}
function clearCustomer() {
  customerId.value = ''
  customerName.value = ''
  router.replace({ query: {} })
}
function clearFilters() {
  setRange(thisM)
  kind.value = ''
  type.value = ''
  q.value = ''
  sortKey.value = 'date'
  sortDir.value = 'desc'
  if (customerId.value) clearCustomer()
}

const n = (v) => Number(v ?? 0)
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold">Transacciones</h1>
        <p class="text-slate-500">{{ total }} {{ total === 1 ? 'movimiento' : 'movimientos' }} registrados</p>
      </div>
    </div>

    <div v-if="sum" class="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div class="rounded-xl border-l-4 border-indigo-500 bg-white p-4 shadow-sm">
        <p class="text-xs text-slate-500">Total del filtro</p>
        <p class="mt-1 text-2xl font-semibold">{{ money.format(n(sum.total)) }}</p>
        <p class="text-xs text-slate-400">{{ sum.n }} {{ Number(sum.n) === 1 ? 'pago' : 'pagos' }}</p>
      </div>
      <div class="rounded-xl border-l-4 border-emerald-500 bg-white p-4 shadow-sm">
        <p class="text-xs text-slate-500">Ventas nuevas</p>
        <p class="mt-1 text-2xl font-semibold">{{ money.format(n(sum.new_total)) }}</p>
        <p class="text-xs text-slate-400">{{ sum.new_count }} {{ Number(sum.new_count) === 1 ? 'venta' : 'ventas' }}</p>
      </div>
      <div class="rounded-xl border-l-4 border-amber-500 bg-white p-4 shadow-sm">
        <p class="text-xs text-slate-500">Renovaciones</p>
        <p class="mt-1 text-2xl font-semibold">{{ money.format(n(sum.renewal_total)) }}</p>
        <p class="text-xs text-slate-400">{{ sum.renewal_count }} {{ Number(sum.renewal_count) === 1 ? 'renovación' : 'renovaciones' }}</p>
      </div>
      <div class="rounded-xl border-l-4 border-violet-500 bg-white p-4 shadow-sm">
        <p class="text-xs text-slate-500">Completas · Perfiles</p>
        <p class="mt-1 text-lg font-semibold">{{ money.format(n(sum.full_total)) }}</p>
        <p class="text-xs text-slate-400">Perfiles: {{ money.format(n(sum.profile_total)) }}</p>
      </div>
    </div>

    <div class="mt-6 flex flex-wrap items-center gap-3">
      <div class="flex gap-1 rounded-lg bg-white p-1 shadow-sm">
        <button type="button" :class="['rounded-md px-3 py-1.5 text-sm transition', preset === 'month' ? 'bg-indigo-950 text-white' : 'text-slate-600 hover:bg-slate-100']" @click="setRange(thisM)">Este mes</button>
        <button type="button" :class="['rounded-md px-3 py-1.5 text-sm transition', preset === 'last' ? 'bg-indigo-950 text-white' : 'text-slate-600 hover:bg-slate-100']" @click="setRange(lastM)">Mes pasado</button>
        <button type="button" :class="['rounded-md px-3 py-1.5 text-sm transition', preset === 'all' ? 'bg-indigo-950 text-white' : 'text-slate-600 hover:bg-slate-100']" @click="setRange({ from: '', to: '' })">Todo</button>
      </div>

      <div class="flex items-center gap-1.5 text-sm">
        <input v-model="from" type="date" class="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm" aria-label="Desde" />
        <span class="text-slate-400">→</span>
        <input v-model="to" type="date" class="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm" aria-label="Hasta" />
      </div>

      <select v-model="kind" class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" aria-label="Concepto">
        <option value="">Nuevas y renovaciones</option>
        <option value="new">Solo nuevas</option>
        <option value="renewal">Solo renovaciones</option>
      </select>
      <select v-model="type" class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" aria-label="Tipo de venta">
        <option value="">Completas y perfiles</option>
        <option value="full">Solo completas</option>
        <option value="profile">Solo perfiles</option>
      </select>

      <div class="flex min-w-0 flex-1 items-center gap-1.5 sm:flex-none xl:hidden">
        <select :value="sortKey" class="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" aria-label="Ordenar por" @change="pickSort($event.target.value)">
          <option v-for="c in cols" :key="c.key" :value="c.key">{{ c.label }}</option>
        </select>
        <button type="button" class="grid size-9 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
          @click="sortDir = sortDir === 'asc' ? 'desc' : 'asc'">
          <component :is="sortDir === 'asc' ? ArrowUp : ArrowDown" class="size-4" />
        </button>
      </div>

      <div class="relative w-full min-w-56 sm:w-auto sm:max-w-xs sm:flex-1">
        <Search class="absolute left-3 top-2.5 size-4 text-slate-400" />
        <input v-model="q" placeholder="Buscar cliente, servicio o cuenta" class="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm" />
      </div>

      <span v-if="customerId" class="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-3 py-1 text-sm font-medium text-indigo-700">
        Cliente: {{ customerName || `#${customerId}` }}
        <button type="button" aria-label="Quitar filtro de cliente" @click="clearCustomer"><X class="size-3.5" /></button>
      </span>

      <button v-if="hasFilters" type="button" class="text-sm font-medium text-indigo-600 hover:underline" @click="clearFilters">Limpiar filtros</button>
    </div>
    <p v-if="invalid" class="mt-2 text-xs text-rose-600">La fecha inicial debe ser anterior a la final.</p>

    <ul class="mt-4 grid gap-3 sm:grid-cols-2 xl:hidden">
      <li v-if="!loading && !rows.length" class="rounded-xl bg-white p-6 text-center text-sm text-slate-500 shadow-sm sm:col-span-2">No hay movimientos con ese filtro.</li>
      <li v-for="t in rows" :key="t.id" class="rounded-xl bg-white p-4 shadow-sm">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <p class="truncate font-medium">{{ t.customer_name }}</p>
            <p class="truncate text-xs text-slate-500">{{ t.customer_phone ? formatPhone(t.customer_phone) : '—' }}</p>
          </div>
          <p class="shrink-0 text-lg font-semibold">{{ money.format(n(t.amount)) }}</p>
        </div>
        <p class="mt-2 truncate text-sm">{{ t.product_name || 'Sin datos' }} <span class="text-slate-500">· {{ t.detail }}</span></p>
        <div class="mt-2 flex flex-wrap items-center gap-2">
          <span :class="['rounded-full px-2 py-0.5 text-xs font-medium', kindUi[t.kind].cls]">{{ kindUi[t.kind].label }}</span>
          <span v-if="t.type === 'profile'" class="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-violet-700">Perfil</span>
          <span class="ml-auto text-xs text-slate-500">{{ t.paid_on }}</span>
        </div>
      </li>
    </ul>

    <div class="mt-4 hidden overflow-x-auto rounded-xl bg-white shadow-sm xl:block">
      <table class="w-full min-w-[820px] text-left text-sm">
        <thead class="border-b border-slate-100 text-slate-500">
          <tr>
            <th v-for="c in cols" :key="c.key"
              :aria-sort="sortKey === c.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'"
              :class="['px-4 py-3 font-medium', c.right && 'text-right']">
              <button type="button" :class="['inline-flex items-center gap-1 transition hover:text-slate-900', sortKey === c.key && 'text-slate-900']"
                :title="`Ordenar por ${c.label.toLowerCase()}`" @click="sortBy(c.key)">
                {{ c.label }}
                <component :is="sortKey === c.key ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown"
                  :class="['size-3.5', sortKey === c.key ? 'text-indigo-500' : 'opacity-40']" />
              </button>
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-if="!loading && !rows.length">
            <td colspan="5" class="px-4 py-10 text-center text-slate-500">No hay movimientos con ese filtro.</td>
          </tr>
          <tr v-for="t in rows" :key="t.id" class="hover:bg-slate-50">
            <td class="px-4 py-3 whitespace-nowrap">{{ t.paid_on }}</td>
            <td class="px-4 py-3">
              <p class="font-medium">{{ t.customer_name }}</p>
              <p class="text-slate-500">{{ t.customer_phone ? formatPhone(t.customer_phone) : '—' }}</p>
            </td>
            <td class="px-4 py-3">
              <p>{{ t.product_name || 'Sin datos' }}</p>
              <p class="max-w-72 truncate text-slate-500">{{ t.detail }}</p>
            </td>
            <td class="px-4 py-3">
              <span :class="['rounded-full px-2.5 py-1 text-xs font-medium', kindUi[t.kind].cls]">{{ kindUi[t.kind].label }}</span>
              <span v-if="t.type === 'profile'" class="ml-1.5 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-violet-700">Perfil</span>
            </td>
            <td class="px-4 py-3 text-right font-medium">{{ money.format(n(t.amount)) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="mt-4 flex items-center justify-between text-sm text-slate-600">
      <span>Página {{ page }} de {{ pages }}</span>
      <div class="flex gap-2">
        <button :disabled="page <= 1" class="rounded-lg bg-white p-2 shadow-sm disabled:opacity-40" aria-label="Anterior" @click="page--"><ChevronLeft class="size-5" /></button>
        <button :disabled="page >= pages" class="rounded-lg bg-white p-2 shadow-sm disabled:opacity-40" aria-label="Siguiente" @click="page++"><ChevronRight class="size-5" /></button>
      </div>
    </div>
  </div>
</template>