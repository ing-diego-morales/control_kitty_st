<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import {
  Plus, Search, MessageCircle, RefreshCw, Scissors, Pencil, Trash2, Layers, Unlink,
  ChevronLeft, ChevronRight, ArrowUp, ArrowDown, ArrowUpDown,
} from 'lucide-vue-next'
import { api } from '../api'
import { money, daysChip, formatPhone, trashReasons } from '../utils'
import { renewalUrl, downUrl } from '../whatsapp'
import { useToast } from '../toast'
import { useConfirm } from '../confirm'
import BaseModal from '../components/BaseModal.vue'
import DownAlert from '../components/DownAlert.vue'
import { inputCls, btnGhost, btnPrimary, btnIndigo, btnDanger } from '../ui'

const route = useRoute()
const toast = useToast()
const { ask } = useConfirm()
const downAlert = ref(null)

const tabs = [
  { value: '', label: 'Todos' },
  { value: 'live', label: 'Activos' },
  { value: 'expired', label: 'Vencidos' },
  { value: 'expiring', label: 'Por vencer' },
  { value: 'active', label: 'Al día' },
  { value: 'down', label: 'Cuenta caída' },
  { value: 'cancelled', label: 'Cancelados' },
]
const stateUi = {
  expired: { label: 'Vencido', cls: 'bg-rose-100 text-rose-700' },
  expiring: { label: 'Por vencer', cls: 'bg-amber-100 text-amber-800' },
  active: { label: 'Al día', cls: 'bg-emerald-100 text-emerald-700' },
  cancelled: { label: 'Cancelado', cls: 'bg-slate-100 text-slate-500' },
}
const modes = [
  { value: 'pick', label: 'Elegir cuentas' },
  { value: 'auto', label: 'Automática' },
]
const cols = [
  { key: 'customer', label: 'Cliente' },
  { key: 'product', label: 'Servicio' },
  { key: 'end_date', label: 'Vencimiento' },
  { key: 'state', label: 'Estado' },
  { key: 'price', label: 'Precio', right: true },
]

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const inDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d) }
const radioRow = 'flex items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2'

const rows = ref([])
const total = ref(0)
const page = ref(1)
const limit = 25
const state = ref(route.query.state || '')
const productId = ref(route.query.product_id ? Number(route.query.product_id) : '')
const batchId = ref(route.query.batch_id ? Number(route.query.batch_id) : '')
const batchInfo = ref(null)
const sortKey = ref('end_date')
const sortDir = ref('asc')
const q = ref(route.query.q || '')
const loading = ref(false)
const selected = ref([])
const products = ref([])
const pages = computed(() => Math.max(1, Math.ceil(total.value / limit)))

const hasFilters = computed(() =>
  !!(state.value || productId.value || batchId.value || q.value.trim() || sortKey.value !== 'end_date' || sortDir.value !== 'asc'))

let loadSeq = 0
async function load() {
  const mine = ++loadSeq
  loading.value = true
  try {
    const params = new URLSearchParams({ page: page.value, limit, sort: sortKey.value, dir: sortDir.value })
    if (state.value) params.set('state', state.value)
    if (productId.value) params.set('product_id', productId.value)
    if (batchId.value) params.set('batch_id', batchId.value)
    if (q.value.trim()) params.set('q', q.value.trim())
    const res = await api.get(`/rentals?${params}`)
    if (mine !== loadSeq) return
    if (!res.data.length && page.value > 1) { page.value--; return }
    rows.value = res.data
    total.value = res.total
    selected.value = []
  } catch (e) {
    if (mine === loadSeq) toast.error(e.message)
  } finally {
    if (mine === loadSeq) loading.value = false
  }
}

async function fetchBatch() {
  if (!batchId.value) { batchInfo.value = null; return }
  try {
    batchInfo.value = await api.get(`/rentals/batch/${batchId.value}`)
  } catch {
    toast.info('Ese lote ya no existe')
    batchId.value = ''
    batchInfo.value = null
  }
}

async function refresh() {
  await load()
  if (batchId.value) fetchBatch()
}

const reload = () => (page.value === 1 ? load() : (page.value = 1))
let timer
watch(q, () => { clearTimeout(timer); timer = setTimeout(reload, 300) })
watch([state, productId, batchId, sortKey, sortDir], reload)
watch(batchId, () => { batchInfo.value = null; fetchBatch() }, { immediate: true })
watch(() => route.query.q, (v) => { q.value = v || '' })
watch(() => route.query.product_id, (v) => { productId.value = v ? Number(v) : '' })
watch(() => route.query.batch_id, (v) => { batchId.value = v ? Number(v) : '' })
watch(page, load)

onMounted(async () => {
  load()
  try { products.value = await api.get('/products') } catch (e) { toast.error(e.message) }
})

function sortBy(key) {
  if (sortKey.value === key) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  else { sortKey.value = key; sortDir.value = 'asc' }
}

function clearFilters() {
  q.value = ''
  state.value = ''
  productId.value = ''
  batchId.value = ''
  sortKey.value = 'end_date'
  sortDir.value = 'asc'
}

const allOnPage = computed(() => rows.value.length > 0 && rows.value.every((r) => selected.value.includes(r.id)))
const toggleAll = () => { selected.value = allOnPage.value ? [] : rows.value.map((r) => r.id) }
const toggle = (id) => {
  selected.value = selected.value.includes(id) ? selected.value.filter((x) => x !== id) : [...selected.value, id]
}

const selectedLive = computed(() =>
  rows.value.filter((r) => selected.value.includes(r.id) && r.state !== 'cancelled').map((r) => r.id))
const selectedCancelled = computed(() =>
  rows.value.filter((r) => selected.value.includes(r.id) && r.state === 'cancelled').map((r) => r.id))
const selectedBatched = computed(() =>
  rows.value.filter((r) => selected.value.includes(r.id) && r.batch_id).map((r) => r.id))

function batchExtra(ids) {
  const set = new Set(ids)
  const per = new Map()
  for (const r of rows.value) {
    if (!set.has(r.id) || !r.batch_id || r.state === 'cancelled') continue
    const e = per.get(r.batch_id) || { live: Number(r.batch_live), n: 0 }
    e.n++
    per.set(r.batch_id, e)
  }
  let extra = 0
  for (const e of per.values()) extra += Math.max(0, e.live - e.n)
  return extra
}

const showNew = ref(false)
const customers = ref([])
const freeList = ref([])
const freeCount = ref(null)
const loadingFree = ref(false)
const nfSaving = ref(false)
const nf = reactive({ customer_id: '', product_id: '', quantity: 1, price: 0, end_date: '', mode: 'pick', as_batch: true })
const picked = ref([])
const pickSearch = ref('')
let freeSeq = 0

const customerNote = computed(() => customers.value.find((c) => c.id === nf.customer_id)?.notes || '')
const qtyEffective = computed(() => (nf.mode === 'pick' ? picked.value.length : Number(nf.quantity) || 0))
const totalPrice = computed(() => (Number(nf.price) || 0) * qtyEffective.value)
const visibleFree = computed(() => {
  const t = pickSearch.value.trim().toLowerCase()
  return t ? freeList.value.filter((a) => a.email.toLowerCase().includes(t)) : freeList.value
})
const isPicked = (id) => picked.value.includes(id)
const togglePick = (id) => {
  picked.value = isPicked(id) ? picked.value.filter((x) => x !== id) : [...picked.value, id]
}

async function openNew() {
  freeCount.value = null
  freeList.value = []
  picked.value = []
  pickSearch.value = ''
  Object.assign(nf, { customer_id: '', product_id: '', quantity: 1, price: 0, end_date: inDays(30), mode: 'pick', as_batch: true })
  showNew.value = true
  try {
    const [c, p] = await Promise.all([api.get('/customers'), api.get('/products')])
    customers.value = c
    products.value = p
  } catch (e) {
    toast.error(e.message)
  }
}

watch(() => nf.product_id, async (id) => {
  freeCount.value = null
  freeList.value = []
  picked.value = []
  pickSearch.value = ''
  const p = products.value.find((x) => x.id === id)
  if (!p) return
  nf.price = Number(p.price)
  nf.end_date = inDays(Number(p.duration_days) || 30)

  const mine = ++freeSeq
  loadingFree.value = true
  try {
    const res = await api.get(`/accounts?state=free&product_id=${id}&limit=200&sort=recent`)
    if (mine !== freeSeq) return
    freeCount.value = res.total
    freeList.value = [...res.data].sort((a, b) => a.id - b.id)
  } catch { /* se ignora */ }
  finally { if (mine === freeSeq) loadingFree.value = false }
})

async function saveNew() {
  if (!nf.customer_id || !nf.product_id) { toast.error('Elige el cliente y el servicio'); return }
  if (!nf.end_date) { toast.error('Indica la fecha de vencimiento'); return }

  const body = {
    customer_id: nf.customer_id,
    product_id: nf.product_id,
    price: Number(nf.price) || 0,
    end_date: nf.end_date,
  }
  let qty
  if (nf.mode === 'pick') {
    if (!picked.value.length) { toast.error('Elige al menos una cuenta'); return }
    body.account_ids = picked.value
    qty = picked.value.length
  } else {
    qty = Number(nf.quantity)
    if (!qty || qty < 1) { toast.error('La cantidad debe ser al menos 1'); return }
    if (freeCount.value !== null && qty > freeCount.value) {
      toast.error(`Solo hay ${freeCount.value} ${freeCount.value === 1 ? 'cuenta libre' : 'cuentas libres'} de este servicio`)
      return
    }
    body.quantity = qty
  }
  if (nf.as_batch && qty >= 2) body.as_batch = true

  nfSaving.value = true
  try {
    const res = await api.post('/rentals', body)
    showNew.value = false
    toast.success(`${qty} ${qty === 1 ? 'cuenta asignada' : 'cuentas asignadas'}${res.batch_id ? ' como lote' : ''} correctamente`)
    await reload()
  } catch (e) {
    toast.error(e.message)
  } finally {
    nfSaving.value = false
  }
}

const renewIds = ref([])
const renewBatch = ref(false)   
const renewLocked = ref(false)  
const renewing = ref(false)
const renew = reactive({ mode: 'days', days: 30, date: '', amount: '' })

const renewExtra = computed(() => (renewLocked.value ? 0 : batchExtra(renewIds.value)))
const renewCount = computed(() => renewIds.value.length + (renewBatch.value ? renewExtra.value : 0))

function askRenew(ids, whole = false) {
  Object.assign(renew, { mode: 'days', days: 30, date: inDays(30), amount: '' })
  renewBatch.value = false
  renewLocked.value = whole
  renewIds.value = ids
}

async function confirmRenew() {
  const body = { ids: renewIds.value, include_batch: renewBatch.value }
  if (renew.mode === 'date') {
    if (!renew.date) { toast.error('Elige la fecha de vencimiento'); return }
    body.end_date = renew.date
  } else {
    body.days = Number(renew.days) || 30
  }
  if (String(renew.amount).trim() !== '') body.amount = Number(renew.amount)

  renewing.value = true
  try {
    const r = await api.post('/rentals/renew', body)
    renewIds.value = []
    toast.success(`${r.renewed} ${r.renewed === 1 ? 'alquiler renovado' : 'alquileres renovados'}`)
    await refresh()
  } catch (e) {
    toast.error(e.message)
  } finally {
    renewing.value = false
  }
}

const cutIds = ref([])
const cutBatch = ref(false)
const cutLocked = ref(false)
const cutting = ref(false)
const cut = reactive({ action: 'free', reason: 'down' })

const cutExtra = computed(() => (cutLocked.value ? 0 : batchExtra(cutIds.value)))
const cutCount = computed(() => cutIds.value.length + (cutBatch.value ? cutExtra.value : 0))

function askCut(ids, whole = false) {
  Object.assign(cut, { action: 'free', reason: 'down' })
  cutBatch.value = false
  cutLocked.value = whole
  cutIds.value = ids
}

async function confirmCut() {
  cutting.value = true
  try {
    const r = await api.post('/rentals/cancel', {
      ids: cutIds.value, include_batch: cutBatch.value, account_action: cut.action, reason: cut.reason,
    })
    cutIds.value = []
    toast.success(`${r.cancelled} ${r.cancelled === 1 ? 'alquiler cortado' : 'alquileres cortados'}`)
    downAlert.value?.refresh()
    await refresh()
  } catch (e) {
    toast.error(e.message)
  } finally {
    cutting.value = false
  }
}

async function askBatch(ids) {
  const ok = await ask({
    title: `Crear lote con ${ids.length} alquileres`,
    message: 'Se agrupan para poder renovarlos o cortarlos juntos cuando quieras. Siguen funcionando también uno por uno.',
    confirmText: 'Crear lote',
  })
  if (!ok) return
  try {
    const r = await api.post('/rentals/batch', { ids })
    toast.success(`Lote creado con ${r.grouped} cuentas`)
    await refresh()
  } catch (e) {
    toast.error(e.message)
  }
}

async function askUnbatch(ids, wholeBatchId = null) {
  const ok = await ask({
    title: wholeBatchId ? 'Deshacer lote' : `Quitar ${ids.length} ${ids.length === 1 ? 'alquiler' : 'alquileres'} del lote`,
    message: wholeBatchId
      ? 'Las cuentas dejan de estar agrupadas. No se renueva ni se corta nada.'
      : 'Salen del lote pero siguen activas. No se renueva ni se corta nada.',
    confirmText: wholeBatchId ? 'Deshacer lote' : 'Quitar del lote',
  })
  if (!ok) return
  try {
    await api.post('/rentals/unbatch', wholeBatchId ? { batch_id: wholeBatchId } : { ids })
    toast.success(wholeBatchId ? 'Lote deshecho' : 'Cuentas quitadas del lote')
    if (wholeBatchId) batchId.value = ''
    else await refresh()
  } catch (e) {
    toast.error(e.message)
  }
}

async function markDown(r) {
  try {
    await api.post('/notices/down-mark', { items: [{ kind: 'full', id: r.id }], notified: true })
    downAlert.value?.refresh()
  } catch { }
}

const editRow = ref(null)
const editing = ref(false)
const ef = reactive({ price: 0, end_date: '' })

function openEdit(r) {
  Object.assign(ef, { price: Number(r.price), end_date: r.end_date })
  editRow.value = r
}

async function saveEdit() {
  if (!ef.end_date) { toast.error('Indica la fecha de vencimiento'); return }
  editing.value = true
  try {
    await api.put(`/rentals/${editRow.value.id}`, { price: Number(ef.price) || 0, end_date: ef.end_date })
    editRow.value = null
    toast.success('Alquiler corregido')
    await refresh()
  } catch (e) {
    toast.error(e.message)
  } finally {
    editing.value = false
  }
}

async function askDelete(ids, row) {
  const n = ids.length
  const ok = await ask({
    title: n === 1 ? 'Eliminar alquiler' : `Eliminar ${n} alquileres`,
    message: 'Se borra del historial. La cuenta no se toca y los ingresos ya registrados se conservan.',
    detail: row ? `${row.product_name} · ${row.account_email}` : '',
    confirmText: 'Eliminar',
    tone: 'danger',
  })
  if (!ok) return
  try {
    const r = await api.post('/rentals/delete-many', { ids })
    toast.success(`${r.deleted} ${r.deleted === 1 ? 'alquiler eliminado' : 'alquileres eliminados'}`)
    if (r.skipped) toast.info(`${r.skipped} no se eliminaron porque siguen activos (córtalos primero)`)
    await refresh()
  } catch (e) {
    toast.error(e.message)
  }
}
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold">Alquileres</h1>
        <p class="text-slate-500">{{ total }} {{ total === 1 ? 'cuenta alquilada' : 'cuentas alquiladas' }}</p>
      </div>
      <button class="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white transition hover:bg-emerald-700" @click="openNew">
        <Plus class="size-5" /> Nuevo alquiler
      </button>
    </div>

    <DownAlert ref="downAlert" />

    <div class="mt-6 flex flex-wrap items-center gap-3">
      <div class="flex flex-wrap gap-1 rounded-lg bg-white p-1 shadow-sm">
        <button v-for="t in tabs" :key="t.value"
          :class="['rounded-md px-3 py-1.5 text-sm transition', state === t.value ? 'bg-indigo-950 text-white' : 'text-slate-600 hover:bg-slate-100']"
          @click="state = t.value">{{ t.label }}</button>
      </div>
      <select v-model="productId" class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" aria-label="Filtrar por servicio">
        <option value="">Todos los servicios</option>
        <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select>
      <div class="relative min-w-56 flex-1 sm:max-w-xs">
        <Search class="absolute left-3 top-2.5 size-4 text-slate-400" />
        <input v-model="q" placeholder="Buscar cliente, correo o servicio" class="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm" />
      </div>
      <button v-if="hasFilters" type="button" class="text-sm font-medium text-indigo-600 hover:underline" @click="clearFilters">
        Limpiar filtros
      </button>
    </div>

    <div v-if="batchInfo" class="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-violet-50 px-4 py-3 text-sm text-violet-700">
      <Layers class="size-5 shrink-0" />
      <div class="min-w-0 flex-1">
        <p class="font-medium">
          Lote de {{ batchInfo.customer_name }} · {{ batchInfo.live }} {{ batchInfo.live === 1 ? 'cuenta activa' : 'cuentas activas' }} de {{ batchInfo.total }}
        </p>
        <p class="text-xs opacity-80">
          Creado el {{ batchInfo.start_date }}
          <template v-if="batchInfo.first_end"> · vence {{ batchInfo.first_end }}<template v-if="batchInfo.last_end !== batchInfo.first_end"> a {{ batchInfo.last_end }}</template></template>
          · {{ money.format(batchInfo.live_price) }} por ciclo
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <template v-if="batchInfo.live">
          <button type="button" class="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 font-medium text-white hover:bg-indigo-700" @click="askRenew(batchInfo.live_ids, true)"><RefreshCw class="size-4" /> Renovar lote</button>
          <button type="button" class="flex items-center gap-1.5 rounded-md bg-rose-600 px-3 py-1.5 font-medium text-white hover:bg-rose-700" @click="askCut(batchInfo.live_ids, true)"><Scissors class="size-4" /> Cortar lote</button>
        </template>
        <button type="button" class="flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 font-medium text-violet-700 shadow-sm hover:bg-violet-100" @click="askUnbatch([], batchInfo.batch_id)"><Unlink class="size-4" /> Deshacer lote</button>
        <button type="button" class="px-1 underline" @click="batchId = ''">Ver todos</button>
      </div>
    </div>

    <div v-if="selected.length" class="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-indigo-50 px-4 py-2.5 text-sm text-indigo-700">
      <span class="font-medium">{{ selected.length }} {{ selected.length === 1 ? 'seleccionado' : 'seleccionados' }}</span>
      <template v-if="selectedLive.length">
        <button class="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 font-medium text-white hover:bg-indigo-700" @click="askRenew(selectedLive)"><RefreshCw class="size-4" /> Renovar</button>
        <button class="flex items-center gap-1.5 rounded-md bg-rose-600 px-3 py-1.5 font-medium text-white hover:bg-rose-700" @click="askCut(selectedLive)"><Scissors class="size-4" /> Cortar</button>
        <button v-if="selectedLive.length >= 2" class="flex items-center gap-1.5 rounded-md bg-violet-600 px-3 py-1.5 font-medium text-white hover:bg-violet-700" @click="askBatch(selectedLive)"><Layers class="size-4" /> Crear lote</button>
      </template>
      <button v-if="selectedBatched.length" class="flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 font-medium text-violet-700 shadow-sm hover:bg-violet-100" @click="askUnbatch(selectedBatched)"><Unlink class="size-4" /> Quitar del lote</button>
      <button v-if="selectedCancelled.length" class="flex items-center gap-1.5 rounded-md bg-rose-600 px-3 py-1.5 font-medium text-white hover:bg-rose-700" @click="askDelete(selectedCancelled)">
        <Trash2 class="size-4" /> Eliminar {{ selectedCancelled.length }} {{ selectedCancelled.length === 1 ? 'cancelado' : 'cancelados' }}
      </button>
      <button class="underline" @click="selected = []">Quitar selección</button>
    </div>

    <div class="mt-4 overflow-x-auto rounded-xl bg-white shadow-sm">
      <table class="w-full min-w-[820px] text-left text-sm">
        <thead class="border-b border-slate-100 text-slate-500">
          <tr>
            <th class="w-10 px-4 py-3"><input type="checkbox" :checked="allOnPage" aria-label="Seleccionar todos" @change="toggleAll" /></th>
            <th v-for="c in cols" :key="c.key"
              :aria-sort="sortKey === c.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'"
              :class="['px-4 py-3 font-medium', c.right && 'text-right']">
              <button type="button"
                :class="['inline-flex items-center gap-1 transition hover:text-slate-900', sortKey === c.key && 'text-slate-900']"
                :title="`Ordenar por ${c.label.toLowerCase()}`" @click="sortBy(c.key)">
                {{ c.label }}
                <component :is="sortKey === c.key ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown"
                  :class="['size-3.5', sortKey === c.key ? 'text-indigo-500' : 'opacity-40']" />
              </button>
            </th>
            <th class="px-4 py-3 text-right font-medium">Acciones</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-if="!loading && !rows.length">
            <td colspan="7" class="px-4 py-10 text-center text-slate-500">No hay alquileres con ese filtro.</td>
          </tr>
          <tr v-for="r in rows" :key="r.id" class="hover:bg-slate-50">
            <td class="px-4 py-3"><input type="checkbox" :checked="selected.includes(r.id)" @change="toggle(r.id)" /></td>
            <td class="px-4 py-3">
              <p class="font-medium">{{ r.customer_name }}</p>
              <p class="text-slate-500">{{ formatPhone(r.customer_phone) }}</p>
              <button v-if="r.batch_id" type="button"
                class="mt-1 inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700 hover:opacity-80"
                :title="`Ver las ${r.batch_total} cuentas de este lote`" @click="batchId = r.batch_id">
                <Layers class="size-3" /> Lote · {{ r.batch_live }} de {{ r.batch_total }}
              </button>
            </td>
            <td class="px-4 py-3">
              <p>{{ r.product_name }}</p>
              <p class="max-w-56 truncate text-slate-500">{{ r.account_email }}</p>
            </td>
            <td class="px-4 py-3">
              <template v-if="r.state !== 'cancelled'">
                <span :class="['rounded-full px-2.5 py-1 text-xs font-medium', daysChip(r.days_left).cls]">{{ daysChip(r.days_left).text }}</span>
                <p class="mt-1 text-xs text-slate-500">{{ r.end_date }}</p>
              </template>
              <p v-else class="text-slate-500">{{ r.end_date }}</p>
            </td>
            <td class="px-4 py-3">
              <span :class="['rounded-full px-2.5 py-1 text-xs font-medium', stateUi[r.state].cls]">{{ stateUi[r.state].label }}</span>
              <span v-if="r.account_down && r.state !== 'cancelled'" class="mt-1 block w-fit rounded-full bg-rose-100 px-2.5 py-1 text-xs font-medium text-rose-700">Cuenta caída</span>
            </td>
            <td class="px-4 py-3 text-right">{{ money.format(r.price) }}</td>
            <td class="px-4 py-3">
              <div class="flex justify-end gap-1.5">
                <a v-if="r.account_down && r.state !== 'cancelled'" :href="downUrl(r, 'full')" target="_blank" rel="noopener" title="Avisar que su cuenta se cayó" class="grid size-9 place-items-center rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100" @click="markDown(r)"><MessageCircle class="size-5" /></a>
                <a v-else :href="renewalUrl(r, 'full')" target="_blank" rel="noopener" title="WhatsApp" class="grid size-9 place-items-center rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100"><MessageCircle class="size-5" /></a>
                <template v-if="r.state !== 'cancelled'">
                  <button title="Renovar" class="grid size-9 place-items-center rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100" @click="askRenew([r.id])"><RefreshCw class="size-5" /></button>
                  <button title="Corregir precio o fecha" class="grid size-9 place-items-center rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200" @click="openEdit(r)"><Pencil class="size-5" /></button>
                  <button title="Cortar servicio" class="grid size-9 place-items-center rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100" @click="askCut([r.id])"><Scissors class="size-5" /></button>
                </template>
                <button v-else title="Eliminar del historial" class="grid size-9 place-items-center rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100" @click="askDelete([r.id], r)"><Trash2 class="size-5" /></button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="mt-4 flex items-center justify-between text-sm text-slate-600">
      <span>Página {{ page }} de {{ pages }}</span>
      <div class="flex gap-2">
        <button :disabled="page <= 1" class="rounded-lg bg-white p-2 shadow-sm disabled:opacity-40" @click="page--"><ChevronLeft class="size-5" /></button>
        <button :disabled="page >= pages" class="rounded-lg bg-white p-2 shadow-sm disabled:opacity-40" @click="page++"><ChevronRight class="size-5" /></button>
      </div>
    </div>

    <BaseModal :open="showNew" title="Nuevo alquiler" size="lg" :busy="nfSaving"
      @close="showNew = false" @submit="saveNew">
      <label class="block">Cliente <span class="text-rose-500">*</span>
        <select v-model="nf.customer_id" :class="inputCls">
          <option value="">Elige un cliente</option>
          <option v-for="c in customers" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
      </label>
      <p v-if="customerNote" class="rounded-lg bg-amber-100 px-3 py-2 text-amber-800"><strong>Nota del cliente:</strong> {{ customerNote }}</p>

      <label class="block">Servicio <span class="text-rose-500">*</span>
        <select v-model="nf.product_id" :class="inputCls">
          <option value="">Elige el servicio</option>
          <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
      </label>

      <p v-if="loadingFree" class="text-slate-400">Buscando cuentas libres…</p>
      <p v-else-if="freeCount !== null" :class="freeCount ? 'text-emerald-600' : 'text-rose-600'">
        {{ freeCount }} {{ freeCount === 1 ? 'cuenta libre' : 'cuentas libres' }} de este servicio
      </p>

      <template v-if="freeCount">
        <div class="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
          <button v-for="m in modes" :key="m.value" type="button"
            :class="['rounded-md px-3 py-1.5 text-sm transition', nf.mode === m.value ? 'bg-white font-medium shadow-sm' : 'text-slate-500 hover:text-slate-700']"
            @click="nf.mode = m.value">{{ m.label }}</button>
        </div>

        <div v-if="nf.mode === 'pick'" class="rounded-lg border border-slate-200">
          <div class="flex items-center gap-2 border-b border-slate-100 px-2.5 py-1.5">
            <Search class="size-4 shrink-0 text-slate-400" />
            <input v-model="pickSearch" placeholder="Buscar correo" class="min-w-0 flex-1 bg-transparent text-sm outline-none"
              @keydown.enter.prevent />
            <span class="shrink-0 text-xs text-slate-500">{{ picked.length }} {{ picked.length === 1 ? 'elegida' : 'elegidas' }}</span>
          </div>
          <ul class="max-h-44 divide-y divide-slate-100 overflow-y-auto">
            <li v-for="a in visibleFree" :key="a.id">
              <label class="flex cursor-pointer items-center gap-2.5 px-2.5 py-1.5 hover:bg-slate-50">
                <input type="checkbox" :checked="isPicked(a.id)" @change="togglePick(a.id)" />
                <span class="min-w-0 flex-1 truncate">{{ a.email }}</span>
                <span v-if="a.notes" class="max-w-28 shrink-0 truncate text-xs text-slate-400">{{ a.notes }}</span>
              </label>
            </li>
            <li v-if="!visibleFree.length" class="px-2.5 py-3 text-center text-slate-400">Sin resultados</li>
          </ul>
          <p v-if="freeCount > freeList.length" class="border-t border-slate-100 px-2.5 py-1.5 text-xs text-slate-400">
            Mostrando las primeras {{ freeList.length }} de {{ freeCount }}.
          </p>
        </div>
      </template>

      <div :class="['grid gap-3', nf.mode === 'auto' ? 'sm:grid-cols-3' : 'sm:grid-cols-2']">
        <label v-if="nf.mode === 'auto'" class="block">Cantidad
          <input v-model.number="nf.quantity" type="number" min="1" :max="freeCount ?? undefined" :class="inputCls" />
        </label>
        <label class="block">Precio por cuenta
          <input v-model.number="nf.price" type="number" min="0" :class="inputCls" />
        </label>
        <label class="block">Vence el
          <input v-model="nf.end_date" type="date" :class="inputCls" />
        </label>
      </div>

      <label v-if="qtyEffective >= 2" :class="[radioRow, 'border-violet-200 bg-violet-50 text-violet-700']">
        <input v-model="nf.as_batch" type="checkbox" />
        <Layers class="size-4 shrink-0" />
        <span class="flex-1">Guardar estas {{ qtyEffective }} cuentas como un lote <span class="opacity-80">(para renovarlas o cortarlas juntas; es opcional)</span></span>
      </label>

      <p class="text-slate-500">
        Total: <strong class="text-slate-900">{{ money.format(totalPrice) }}</strong>
        <template v-if="nf.mode === 'pick'"> · {{ picked.length }} {{ picked.length === 1 ? 'cuenta elegida' : 'cuentas elegidas' }}</template>
        <template v-else> · las cuentas se asignan solas (las más antiguas primero)</template>
      </p>

      <template #footer>
        <button type="button" :class="btnGhost" @click="showNew = false">Cancelar</button>
        <button :disabled="nfSaving || freeCount === 0" :class="btnPrimary">{{ nfSaving ? 'Asignando…' : 'Asignar cuentas' }}</button>
      </template>
    </BaseModal>

    <BaseModal :open="renewIds.length > 0" size="md" :busy="renewing"
      :title="`Renovar ${renewCount} ${renewCount === 1 ? 'alquiler' : 'alquileres'}`"
      @close="renewIds = []" @submit="confirmRenew">
      <label v-if="renewExtra > 0" :class="[radioRow, 'border-violet-200 bg-violet-50 text-violet-700']">
        <input v-model="renewBatch" type="checkbox" />
        <Layers class="size-4 shrink-0" />
        <span class="flex-1">Renovar también el resto del lote <strong>(+{{ renewExtra }} {{ renewExtra === 1 ? 'cuenta' : 'cuentas' }})</strong></span>
      </label>
      <p v-else-if="renewLocked" class="rounded-lg bg-violet-50 px-3 py-2 text-violet-700">
        Se renueva todo el lote: {{ renewIds.length }} {{ renewIds.length === 1 ? 'cuenta' : 'cuentas' }}.
      </p>

      <label :class="radioRow">
        <input v-model="renew.mode" type="radio" value="days" />
        <span class="flex-1">Sumar días al vencimiento</span>
        <input v-model.number="renew.days" type="number" min="1" :disabled="renew.mode !== 'days'" class="w-20 rounded-lg border border-slate-300 px-2 py-1 text-right" />
      </label>
      <label :class="radioRow">
        <input v-model="renew.mode" type="radio" value="date" />
        <span class="flex-1">Poner una fecha exacta</span>
        <input v-model="renew.date" type="date" :disabled="renew.mode !== 'date'" class="rounded-lg border border-slate-300 px-2 py-1" />
      </label>
      <label class="block">Valor cobrado por cuenta <span class="text-slate-400">(opcional)</span>
        <input v-model="renew.amount" type="number" min="0" placeholder="Por defecto, el precio del alquiler" :class="inputCls" />
      </label>
      <p v-if="String(renew.amount).trim() !== ''" class="text-xs text-slate-500">
        Total a registrar: <strong class="text-slate-900">{{ money.format((Number(renew.amount) || 0) * renewCount) }}</strong>
      </p>
      <p class="text-xs text-slate-500">Si ya estaba vencido, los días se cuentan desde hoy. Si las cuentas vencen en fechas distintas y sumas días, cada una conserva su propia fecha; con "fecha exacta" todas quedan igual. El valor cobrado suma a los Ingresos del Panel.</p>

      <template #footer>
        <button type="button" :class="btnGhost" @click="renewIds = []">Cancelar</button>
        <button :disabled="renewing" :class="btnIndigo">{{ renewing ? 'Renovando…' : 'Renovar' }}</button>
      </template>
    </BaseModal>

    <BaseModal :open="cutIds.length > 0" size="md" :busy="cutting"
      :title="`Cortar ${cutCount} ${cutCount === 1 ? 'alquiler' : 'alquileres'}`"
      @close="cutIds = []" @submit="confirmCut">
      <label v-if="cutExtra > 0" :class="[radioRow, 'border-rose-200 bg-rose-50 text-rose-700']">
        <input v-model="cutBatch" type="checkbox" />
        <Layers class="size-4 shrink-0" />
        <span class="flex-1">Cortar también el resto del lote <strong>(+{{ cutExtra }} {{ cutExtra === 1 ? 'cuenta' : 'cuentas' }})</strong></span>
      </label>
      <p v-else-if="cutLocked" class="rounded-lg bg-rose-50 px-3 py-2 text-rose-700">
        Se corta todo el lote: {{ cutIds.length }} {{ cutIds.length === 1 ? 'cuenta' : 'cuentas' }}.
      </p>

      <p class="text-slate-500">¿Qué hacemos con {{ cutCount === 1 ? 'la cuenta' : 'las cuentas' }}?</p>
      <label :class="radioRow"><input v-model="cut.action" type="radio" value="free" /> Dejarla libre para volver a alquilarla</label>
      <label :class="radioRow"><input v-model="cut.action" type="radio" value="down" /> Marcarla como caída (la reviso después)</label>
      <label :class="radioRow">
        <input v-model="cut.action" type="radio" value="trash" />
        <span class="flex-1">Enviarla a la papelera</span>
        <select v-model="cut.reason" :disabled="cut.action !== 'trash'" class="rounded-lg border border-slate-300 px-2 py-1">
          <option v-for="r in trashReasons" :key="r.value" :value="r.value">{{ r.label }}</option>
        </select>
      </label>

      <template #footer>
        <button type="button" :class="btnGhost" @click="cutIds = []">Cancelar</button>
        <button :disabled="cutting" :class="btnDanger">{{ cutting ? 'Cortando…' : 'Cortar' }}</button>
      </template>
    </BaseModal>

    <BaseModal :open="!!editRow" size="sm" :busy="editing"
      :title="`Corregir alquiler de ${editRow?.customer_name ?? ''}`"
      @close="editRow = null" @submit="saveEdit">
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="block">Precio
          <input v-model.number="ef.price" type="number" min="0" :class="inputCls" />
        </label>
        <label class="block">Vence el
          <input v-model="ef.end_date" type="date" :class="inputCls" />
        </label>
      </div>
      <template #footer>
        <button type="button" :class="btnGhost" @click="editRow = null">Cancelar</button>
        <button :disabled="editing" :class="btnPrimary">{{ editing ? 'Guardando…' : 'Guardar' }}</button>
      </template>
    </BaseModal>
  </div>
</template>