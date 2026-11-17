<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import {
  Plus, Search, MessageCircle, RefreshCw, Scissors, Pencil, Trash2, Eye, EyeOff,
  ChevronLeft, ChevronRight, ArrowUp, ArrowDown, ArrowUpDown,
} from 'lucide-vue-next'
import { api } from '../api'
import { money, daysChip, formatPhone } from '../utils'
import { renewalUrl, downUrl } from '../whatsapp'
import { useToast } from '../toast'
import { useConfirm } from '../confirm'
import BaseModal from '../components/BaseModal.vue'
import DownAlert from '../components/DownAlert.vue'
import { inputCls, btnGhost, btnPrimary, btnIndigo } from '../ui'

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
  { value: 'cancelled', label: 'Cortados' },
]
const stateUi = {
  expired: { label: 'Vencido', cls: 'bg-rose-100 text-rose-700' },
  expiring: { label: 'Por vencer', cls: 'bg-amber-100 text-amber-800' },
  active: { label: 'Al día', cls: 'bg-emerald-100 text-emerald-700' },
  cancelled: { label: 'Cortado', cls: 'bg-slate-100 text-slate-500' },
}
const cols = [
  { key: 'customer', label: 'Comprador' },
  { key: 'product', label: 'Cuenta' },
  { key: 'profile', label: 'Perfil y PIN' },
  { key: 'end_date', label: 'Corte' },
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
const sortKey = ref('end_date')
const sortDir = ref('asc')
const q = ref(route.query.q || '')
const loading = ref(false)
const selected = ref([])
const revealed = ref({})
const products = ref([])
const pages = computed(() => Math.max(1, Math.ceil(total.value / limit)))

const hasFilters = computed(() =>
  !!(state.value || productId.value || q.value.trim() || sortKey.value !== 'end_date' || sortDir.value !== 'asc'))

let loadSeq = 0
async function load() {
  const mine = ++loadSeq
  loading.value = true
  try {
    const params = new URLSearchParams({ page: page.value, limit, sort: sortKey.value, dir: sortDir.value })
    if (state.value) params.set('state', state.value)
    if (productId.value) params.set('product_id', productId.value)
    if (q.value.trim()) params.set('q', q.value.trim())
    const res = await api.get(`/profiles?${params}`)
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

const reload = () => (page.value === 1 ? load() : (page.value = 1))
let timer
watch(q, () => { clearTimeout(timer); timer = setTimeout(reload, 300) })
watch([state, productId, sortKey, sortDir], reload)
watch(() => route.query.state, (s) => { state.value = s || '' })
watch(() => route.query.q, (v) => { q.value = v || '' })
watch(() => route.query.product_id, (v) => { productId.value = v ? Number(v) : '' })
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

const showNew = ref(false)
const slotAccounts = ref([])
const loadingSlots = ref(false)
const saving = ref(false)
const np = reactive({ product_id: '', account_id: '', profile_name: '', pin: '', buyer_name: '', buyer_phone: '', price: 0, end_date: '' })
let slotSeq = 0

function openNew() {
  slotAccounts.value = []
  Object.assign(np, { product_id: '', account_id: '', profile_name: '', pin: '', buyer_name: '', buyer_phone: '', price: 0, end_date: inDays(30) })
  showNew.value = true
}

watch(() => np.product_id, async (id) => {
  slotAccounts.value = []
  np.account_id = ''
  if (!id) return
  const mine = ++slotSeq
  loadingSlots.value = true
  try {
    const list = await api.get(`/profiles/slots?product_id=${id}`)
    if (mine !== slotSeq) return
    slotAccounts.value = list
    if (list.length) np.account_id = list[0].id
  } catch (e) {
    if (mine === slotSeq) toast.error(e.message)
  } finally {
    if (mine === slotSeq) loadingSlots.value = false
  }
})

async function saveNew() {
  if (!np.product_id) { toast.error('Elige el servicio'); return }
  if (!np.account_id) { toast.error('Elige la cuenta'); return }
  if (!np.buyer_name.trim()) { toast.error('Escribe el nombre de quien compra'); return }
  if (!np.end_date) { toast.error('Indica la fecha de corte'); return }
  saving.value = true
  try {
    await api.post('/profiles', {
      account_id: np.account_id,
      profile_name: np.profile_name,
      pin: np.pin,
      buyer_name: np.buyer_name,
      buyer_phone: np.buyer_phone,
      price: Number(np.price) || 0,
      end_date: np.end_date,
    })
    showNew.value = false
    toast.success('Perfil vendido')
    await reload()
  } catch (e) {
    toast.error(e.message)
  } finally {
    saving.value = false
  }
}

const renewIds = ref([])
const renewing = ref(false)
const renew = reactive({ mode: 'days', days: 30, date: '', amount: '' })

function askRenew(ids) {
  Object.assign(renew, { mode: 'days', days: 30, date: inDays(30), amount: '' })
  renewIds.value = ids
}

async function confirmRenew() {
  const body = { ids: renewIds.value }
  if (renew.mode === 'date') {
    if (!renew.date) { toast.error('Elige la fecha de corte'); return }
    body.end_date = renew.date
  } else {
    body.days = Number(renew.days) || 30
  }
  if (String(renew.amount).trim() !== '') body.amount = Number(renew.amount)

  renewing.value = true
  try {
    const r = await api.post('/profiles/renew', body)
    renewIds.value = []
    toast.success(`${r.renewed} ${r.renewed === 1 ? 'perfil renovado' : 'perfiles renovados'}`)
    await load()
  } catch (e) {
    toast.error(e.message)
  } finally {
    renewing.value = false
  }
}

async function askCut(ids, row) {
  const ok = await ask({
    title: ids.length === 1 ? 'Cortar perfil' : `Cortar ${ids.length} perfiles`,
    message: 'El perfil queda libre en el sistema para venderlo de nuevo. Acuérdate de quitarlo también en la plataforma.',
    detail: row ? `${row.product_name} · ${row.profile_name || row.account_email} · ${row.customer_name}` : '',
    confirmText: 'Cortar',
    tone: 'danger',
  })
  if (!ok) return
  try {
    const r = await api.post('/profiles/cancel', { ids })
    toast.success(`${r.cancelled} ${r.cancelled === 1 ? 'perfil cortado' : 'perfiles cortados'}`)
    downAlert.value?.refresh()
    await load()
  } catch (e) {
    toast.error(e.message)
  }
}

async function markDown(r) {
  try {
    await api.post('/notices/down-mark', { items: [{ kind: 'profile', id: r.id }], notified: true })
    downAlert.value?.refresh()
  } catch { /* si falla, el aviso sigue pendiente */ }
}

async function askDelete(ids, row) {
  const ok = await ask({
    title: ids.length === 1 ? 'Eliminar perfil' : `Eliminar ${ids.length} perfiles`,
    message: 'Se borra del historial. Los ingresos ya registrados se conservan.',
    detail: row ? `${row.product_name} · ${row.profile_name || row.account_email}` : '',
    confirmText: 'Eliminar',
    tone: 'danger',
  })
  if (!ok) return
  try {
    const r = await api.post('/profiles/delete-many', { ids })
    toast.success(`${r.deleted} ${r.deleted === 1 ? 'perfil eliminado' : 'perfiles eliminados'}`)
    if (r.skipped) toast.info(`${r.skipped} no se eliminaron porque siguen activos (córtalos primero)`)
    await load()
  } catch (e) {
    toast.error(e.message)
  }
}

const editRow = ref(null)
const editing = ref(false)
const ef = reactive({ profile_name: '', pin: '', buyer_name: '', buyer_phone: '', price: 0, end_date: '', notes: '' })

function openEdit(r) {
  Object.assign(ef, {
    profile_name: r.profile_name || '', pin: r.pin || '', buyer_name: r.customer_name,
    buyer_phone: r.customer_phone || '', price: Number(r.price), end_date: r.end_date, notes: r.notes || '',
  })
  editRow.value = r
}

async function saveEdit() {
  if (!ef.buyer_name.trim()) { toast.error('Escribe el nombre de quien compra'); return }
  if (!ef.end_date) { toast.error('Indica la fecha de corte'); return }
  editing.value = true
  try {
    await api.put(`/profiles/${editRow.value.id}`, { ...ef, price: Number(ef.price) || 0 })
    editRow.value = null
    toast.success('Perfil actualizado')
    await load()
  } catch (e) {
    toast.error(e.message)
  } finally {
    editing.value = false
  }
}
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold">Perfiles</h1>
        <p class="text-slate-500">{{ total }} {{ total === 1 ? 'perfil vendido' : 'perfiles vendidos' }}</p>
      </div>
      <button class="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white transition hover:bg-emerald-700" @click="openNew">
        <Plus class="size-5" /> Vender perfil
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
        <input v-model="q" placeholder="Buscar comprador, cuenta o perfil" class="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm" />
      </div>
      <button v-if="hasFilters" type="button" class="text-sm font-medium text-indigo-600 hover:underline" @click="clearFilters">
        Limpiar filtros
      </button>
    </div>

    <div v-if="selected.length" class="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-indigo-50 px-4 py-2.5 text-sm text-indigo-700">
      <span class="font-medium">{{ selected.length }} {{ selected.length === 1 ? 'seleccionado' : 'seleccionados' }}</span>
      <template v-if="selectedLive.length">
        <button class="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 font-medium text-white hover:bg-indigo-700" @click="askRenew(selectedLive)"><RefreshCw class="size-4" /> Renovar</button>
        <button class="flex items-center gap-1.5 rounded-md bg-rose-600 px-3 py-1.5 font-medium text-white hover:bg-rose-700" @click="askCut(selectedLive)"><Scissors class="size-4" /> Cortar</button>
      </template>
      <button v-if="selectedCancelled.length" class="flex items-center gap-1.5 rounded-md bg-rose-600 px-3 py-1.5 font-medium text-white hover:bg-rose-700" @click="askDelete(selectedCancelled)">
        <Trash2 class="size-4" /> Eliminar {{ selectedCancelled.length }} {{ selectedCancelled.length === 1 ? 'cortado' : 'cortados' }}
      </button>
      <button class="underline" @click="selected = []">Quitar selección</button>
    </div>

    <div class="mt-4 overflow-x-auto rounded-xl bg-white shadow-sm">
      <table class="w-full min-w-[980px] text-left text-sm">
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
            <td colspan="8" class="px-4 py-10 text-center text-slate-500">No hay perfiles con ese filtro.</td>
          </tr>
          <tr v-for="r in rows" :key="r.id" class="hover:bg-slate-50">
            <td class="px-4 py-3"><input type="checkbox" :checked="selected.includes(r.id)" @change="toggle(r.id)" /></td>
            <td class="px-4 py-3">
              <p class="font-medium">{{ r.customer_name }}</p>
              <p class="text-slate-500">{{ r.customer_phone ? formatPhone(r.customer_phone) : '—' }}</p>
            </td>
            <td class="px-4 py-3">
              <p>{{ r.product_name }}</p>
              <p class="max-w-56 truncate text-slate-500">{{ r.account_email }}</p>
            </td>
            <td class="px-4 py-3">
              <p class="font-medium">{{ r.profile_name || '—' }}</p>
              <p class="flex items-center gap-1.5 font-mono text-xs text-slate-500">
                <span>PIN {{ revealed[r.id] ? r.pin || '—' : '••••' }}</span>
                <button type="button" class="text-slate-400 hover:text-slate-700" aria-label="Mostrar u ocultar PIN y contraseña" @click="revealed[r.id] = !revealed[r.id]">
                  <component :is="revealed[r.id] ? EyeOff : Eye" class="inline size-3.5" />
                </button>
              </p>
              <p v-if="revealed[r.id]" class="font-mono text-xs text-slate-500">Clave {{ r.account_password || '—' }}</p>
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
                <a v-if="r.customer_phone && r.account_down && r.state !== 'cancelled'" :href="downUrl(r, 'profile')" target="_blank" rel="noopener" title="Avisar que su cuenta se cayó" class="grid size-9 place-items-center rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100" @click="markDown(r)"><MessageCircle class="size-5" /></a>
                <a v-else-if="r.customer_phone" :href="renewalUrl(r, 'profile')" target="_blank" rel="noopener" title="WhatsApp" class="grid size-9 place-items-center rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100"><MessageCircle class="size-5" /></a>
                <template v-if="r.state !== 'cancelled'">
                  <button title="Renovar" class="grid size-9 place-items-center rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100" @click="askRenew([r.id])"><RefreshCw class="size-5" /></button>
                  <button title="Editar perfil" class="grid size-9 place-items-center rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200" @click="openEdit(r)"><Pencil class="size-5" /></button>
                  <button title="Cortar perfil" class="grid size-9 place-items-center rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100" @click="askCut([r.id], r)"><Scissors class="size-5" /></button>
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

    <BaseModal :open="showNew" title="Vender perfil" size="lg" :busy="saving"
      @close="showNew = false" @submit="saveNew">
      <label class="block">Servicio <span class="text-rose-500">*</span>
        <select v-model="np.product_id" :class="inputCls">
          <option value="">Elige el servicio</option>
          <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
      </label>

      <p v-if="loadingSlots" class="text-slate-400">Buscando cuentas con perfiles libres…</p>
      <p v-else-if="np.product_id && !slotAccounts.length" class="rounded-lg bg-amber-100 px-3 py-2 text-amber-800">
        No hay cuentas por perfiles con espacio para este servicio. En Cuentas, edita una y elige "Por perfiles".
      </p>
      <label v-else-if="slotAccounts.length" class="block">Cuenta <span class="text-rose-500">*</span>
        <select v-model="np.account_id" :class="inputCls">
          <option v-for="a in slotAccounts" :key="a.id" :value="a.id">
            {{ a.email }} · {{ a.free }} de {{ a.profile_slots }} libres
          </option>
        </select>
      </label>

      <div class="grid gap-3 sm:grid-cols-2">
        <label class="block">Perfil
          <input v-model="np.profile_name" placeholder="Ej. Perfil 2" :class="inputCls" />
        </label>
        <label class="block">PIN
          <input v-model="np.pin" inputmode="numeric" maxlength="20" :class="inputCls" />
        </label>
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="block">Nombre de quien compra <span class="text-rose-500">*</span>
          <input v-model="np.buyer_name" :class="inputCls" />
        </label>
        <label class="block">Celular
          <input v-model="np.buyer_phone" type="tel" placeholder="3001234567" :class="inputCls" />
        </label>
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="block">Precio
          <input v-model.number="np.price" type="number" min="0" :class="inputCls" />
        </label>
        <label class="block">Fecha de corte <span class="text-rose-500">*</span>
          <input v-model="np.end_date" type="date" :class="inputCls" />
        </label>
      </div>

      <template #footer>
        <button type="button" :class="btnGhost" @click="showNew = false">Cancelar</button>
        <button :disabled="saving || !slotAccounts.length" :class="btnPrimary">{{ saving ? 'Guardando…' : 'Vender perfil' }}</button>
      </template>
    </BaseModal>

    <BaseModal :open="renewIds.length > 0" size="md" :busy="renewing"
      :title="`Renovar ${renewIds.length} ${renewIds.length === 1 ? 'perfil' : 'perfiles'}`"
      @close="renewIds = []" @submit="confirmRenew">
      <label :class="radioRow">
        <input v-model="renew.mode" type="radio" value="days" />
        <span class="flex-1">Sumar días a la fecha de corte</span>
        <input v-model.number="renew.days" type="number" min="1" :disabled="renew.mode !== 'days'" class="w-20 rounded-lg border border-slate-300 px-2 py-1 text-right" />
      </label>
      <label :class="radioRow">
        <input v-model="renew.mode" type="radio" value="date" />
        <span class="flex-1">Poner una fecha exacta</span>
        <input v-model="renew.date" type="date" :disabled="renew.mode !== 'date'" class="rounded-lg border border-slate-300 px-2 py-1" />
      </label>
      <label class="block">Valor cobrado por perfil <span class="text-slate-400">(opcional)</span>
        <input v-model="renew.amount" type="number" min="0" placeholder="Por defecto, el precio del perfil" :class="inputCls" />
      </label>
      <p class="text-xs text-slate-500">Si ya estaba vencido, los días se cuentan desde hoy. El valor cobrado suma a los Ingresos del Panel.</p>

      <template #footer>
        <button type="button" :class="btnGhost" @click="renewIds = []">Cancelar</button>
        <button :disabled="renewing" :class="btnIndigo">{{ renewing ? 'Renovando…' : 'Renovar' }}</button>
      </template>
    </BaseModal>

    <BaseModal :open="!!editRow" size="lg" :busy="editing"
      :title="`Editar perfil de ${editRow?.customer_name ?? ''}`"
      @close="editRow = null" @submit="saveEdit">
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="block">Perfil
          <input v-model="ef.profile_name" :class="inputCls" />
        </label>
        <label class="block">PIN
          <input v-model="ef.pin" inputmode="numeric" maxlength="20" :class="inputCls" />
        </label>
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="block">Nombre de quien compra <span class="text-rose-500">*</span>
          <input v-model="ef.buyer_name" :class="inputCls" />
        </label>
        <label class="block">Celular
          <input v-model="ef.buyer_phone" type="tel" :class="inputCls" />
        </label>
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="block">Precio
          <input v-model.number="ef.price" type="number" min="0" :class="inputCls" />
        </label>
        <label class="block">Fecha de corte
          <input v-model="ef.end_date" type="date" :class="inputCls" />
        </label>
      </div>
      <label class="block">Nota
        <input v-model="ef.notes" maxlength="255" placeholder="Ej. cobrar el 15" :class="inputCls" />
      </label>
      <template #footer>
        <button type="button" :class="btnGhost" @click="editRow = null">Cancelar</button>
        <button :disabled="editing" :class="btnPrimary">{{ editing ? 'Guardando…' : 'Guardar' }}</button>
      </template>
    </BaseModal>
  </div>
</template>