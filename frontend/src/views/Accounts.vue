<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import {
  Plus, Upload, Search, Pencil, Trash2, ChevronLeft, ChevronRight, Eye, EyeOff,
  AlertTriangle, RotateCcw, Copy, ArrowUp, ArrowDown, ArrowUpDown,
} from 'lucide-vue-next'
import { api } from '../api'
import { trashReasons, daysChip } from '../utils'
import { useToast } from '../toast'
import BaseModal from '../components/BaseModal.vue'
import { inputCls, btnGhost, btnPrimary, btnDanger } from '../ui'
import DownAlert from '../components/DownAlert.vue'

const route = useRoute()
const toast = useToast()
const downAlert = ref(null)

const stateUi = {
  free: { label: 'Libre', cls: 'bg-emerald-100 text-emerald-700' },
  assigned: { label: 'Asignada', cls: 'bg-indigo-100 text-indigo-700' },
  profiles: { label: 'Perfiles', cls: 'bg-violet-100 text-violet-700' },
  down: { label: 'Caída', cls: 'bg-rose-100 text-rose-700' },
}
const tabs = [
  { value: '', label: 'Todas' },
  { value: 'free', label: 'Libres' },
  { value: 'assigned', label: 'Asignadas' },
  { value: 'profiles', label: 'Por perfiles' },
  { value: 'down', label: 'Caídas' },
]
const cols = [
  { key: 'product', label: 'Servicio' },
  { key: 'email', label: 'Correo' },
  { key: 'password', label: 'Contraseña' },
  { key: 'state', label: 'Estado' },
  { key: 'customer', label: 'Cliente / perfiles' },
]
const sortOptions = [
  { key: 'recent', label: 'Más recientes' },
  { key: 'days', label: 'Días restantes' },
  ...cols,
]
const saleModes = [
  { value: 'full', label: 'Cuenta completa' },
  { value: 'profiles', label: 'Por perfiles' },
]
const segCls = (active, locked) => [
  'rounded-md px-3 py-1.5 text-sm transition',
  active ? 'bg-white font-medium shadow-sm' : 'text-slate-500 hover:text-slate-700',
  locked && 'cursor-not-allowed opacity-60',
]

const rows = ref([])
const total = ref(0)
const counts = reactive({ free: 0, assigned: 0, down: 0, profiles: 0 })
const page = ref(1)
const limit = 25
const state = ref(route.query.state || '')
const productId = ref(route.query.product_id ? Number(route.query.product_id) : '')
const sortKey = ref('recent')
const sortDir = ref('desc')
const q = ref('')
const loading = ref(false)
const products = ref([])
const revealed = ref({})
const selected = ref([])

const pages = computed(() => Math.max(1, Math.ceil(total.value / limit)))
const countOf = (v) => (v === '' ? counts.free + counts.assigned + counts.down + counts.profiles : counts[v])
const hasFilters = computed(() =>
  !!(state.value || productId.value || q.value.trim() || sortKey.value !== 'recent' || sortDir.value !== 'desc'))

let loadSeq = 0
async function load() {
  const mine = ++loadSeq
  loading.value = true
  try {
    const params = new URLSearchParams({ page: page.value, limit, sort: sortKey.value, dir: sortDir.value })
    if (state.value) params.set('state', state.value)
    if (productId.value) params.set('product_id', productId.value)
    if (q.value.trim()) params.set('q', q.value.trim())
    const res = await api.get(`/accounts?${params}`)
    if (mine !== loadSeq) return
    if (!res.data.length && page.value > 1) { page.value--; return }
    rows.value = res.data
    total.value = res.total
    Object.assign(counts, res.counts)
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
function pickSort(key) {
  sortKey.value = key
  sortDir.value = key === 'recent' ? 'desc' : 'asc'
}
function clearFilters() {
  q.value = ''
  state.value = ''
  productId.value = ''
  sortKey.value = 'recent'
  sortDir.value = 'desc'
}

async function copy(text, label) {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${label} copiado`)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.cssText = 'position:fixed;opacity:0'
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy'); toast.success(`${label} copiado`) }
    catch { toast.error('No se pudo copiar') }
    ta.remove()
  }
}

const allOnPage = computed(() => rows.value.length > 0 && rows.value.every((r) => selected.value.includes(r.id)))
const toggleAll = () => { selected.value = allOnPage.value ? [] : rows.value.map((r) => r.id) }
const toggle = (id) => {
  selected.value = selected.value.includes(id) ? selected.value.filter((x) => x !== id) : [...selected.value, id]
}

const showForm = ref(false)
const editingId = ref(null)
const editingRow = ref(null)
const saving = ref(false)
const form = reactive({ product_id: '', email: '', password: '', notes: '', sale_mode: 'full', profile_slots: 5 })

const modeLocked = computed(() =>
  !!editingRow.value && (!!editingRow.value.rental_id || Number(editingRow.value.profiles_used) > 0))

function openNew() {
  editingId.value = null
  editingRow.value = null
  Object.assign(form, { product_id: productId.value || '', email: '', password: '', notes: '', sale_mode: 'full', profile_slots: 5 })
  showForm.value = true
}

function openEdit(r) {
  editingId.value = r.id
  editingRow.value = r
  Object.assign(form, {
    product_id: r.product_id, email: r.email, password: r.password || '', notes: r.notes || '',
    sale_mode: r.sale_mode, profile_slots: r.profile_slots || 5,
  })
  showForm.value = true
}

async function save() {
  if (!form.product_id || !form.email.trim()) {
    toast.error('Elige el servicio y escribe el correo')
    return
  }
  const slots = Number(form.profile_slots)
  if (form.sale_mode === 'profiles' && !(slots >= 1 && slots <= 20)) {
    toast.error('Indica cuántos perfiles tiene la cuenta (de 1 a 20)')
    return
  }
  saving.value = true
  try {
    const body = {
      product_id: form.product_id,
      email: form.email.trim(),
      password: form.password.trim(),
      notes: form.notes,
      sale_mode: form.sale_mode,
      profile_slots: form.sale_mode === 'profiles' ? slots : 0,
    }
    const wasEditing = !!editingId.value
    if (wasEditing) await api.put(`/accounts/${editingId.value}`, body)
    else await api.post('/accounts', body)
    showForm.value = false
    toast.success(wasEditing ? 'Cuenta actualizada' : 'Cuenta agregada')
    await load()
  } catch (e) {
    toast.error(e.message)
  } finally {
    saving.value = false
  }
}

const showBulk = ref(false)
const bulk = reactive({ product_id: '', text: '', sale_mode: 'full', profile_slots: 5 })
const bulkResult = ref(null)
const uploading = ref(false)

function parseBulk(text) {
  const ok = []
  const bad = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const m = line.match(/^([^\s,;:|]+@[^\s,;:|]+)[\s,;:|]+(.+)$/)
    if (m) ok.push({ email: m[1], password: m[2].trim() })
    else bad.push(line)
  }
  return { ok, bad }
}
const parsed = computed(() => parseBulk(bulk.text))

function openBulk() {
  Object.assign(bulk, { product_id: productId.value || '', text: '', sale_mode: 'full', profile_slots: 5 })
  bulkResult.value = null
  showBulk.value = true
}

async function uploadBulk() {
  if (!bulk.product_id) { toast.error('Elige el servicio'); return }
  if (!parsed.value.ok.length) { toast.error('No hay líneas válidas para subir'); return }
  const slots = Number(bulk.profile_slots)
  if (bulk.sale_mode === 'profiles' && !(slots >= 1 && slots <= 20)) {
    toast.error('Indica cuántos perfiles tiene cada cuenta (de 1 a 20)')
    return
  }
  uploading.value = true
  try {
    bulkResult.value = await api.post('/accounts/bulk', {
      product_id: bulk.product_id,
      sale_mode: bulk.sale_mode,
      profile_slots: bulk.sale_mode === 'profiles' ? slots : 0,
      items: parsed.value.ok,
    })
    bulk.text = ''
    await load()
  } catch (e) {
    toast.error(e.message)
  } finally {
    uploading.value = false
  }
}

async function setDown(r, down) {
  const hadCustomer = down && (!!r.rental_id || Number(r.profiles_used) > 0)
  try {
    await api.post(`/accounts/${r.id}/down`, { down })
    toast.success(down ? 'Cuenta marcada como caída' : 'Cuenta restaurada')
    await load()
    if (hadCustomer) downAlert.value?.show()
    else downAlert.value?.refresh()
  } catch (e) { toast.error(e.message) }
}

const trashIds = ref([])
const trashReason = ref('down')

function askTrash(ids) {
  trashReason.value = 'down'
  trashIds.value = ids
}

async function confirmTrash() {
  try {
    const r = await api.post('/accounts/trash-many', { ids: trashIds.value, reason: trashReason.value })
    trashIds.value = []
    if (r.skipped) toast.info(`${r.trashed} enviadas a la papelera. ${r.skipped} no se enviaron porque tienen un alquiler o perfiles activos (córtalos primero).`)
    else toast.success(`${r.trashed} ${r.trashed === 1 ? 'cuenta enviada' : 'cuentas enviadas'} a la papelera`)
    await load()
  } catch (e) {
    trashIds.value = []
    toast.error(e.message)
  }
}
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold">Cuentas</h1>
        <p class="text-slate-500">{{ countOf('') }} en total · {{ counts.free }} libres · {{ counts.profiles }} por perfiles</p>
      </div>
      <div class="flex gap-2">
        <button class="flex items-center gap-2 rounded-lg bg-white px-4 py-2 font-medium shadow-sm hover:bg-slate-100" @click="openBulk">
          <Upload class="size-5" /> <span class="hidden sm:inline">Carga masiva</span><span class="sm:hidden">Masiva</span>
        </button>
        <button class="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white transition hover:bg-emerald-700" @click="openNew">
          <Plus class="size-5" /> Agregar
        </button>
      </div>
    </div>
    <DownAlert ref="downAlert" :auto="false" />
    <div class="mt-6 flex flex-wrap items-center gap-3">
      <div class="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-white p-1 shadow-sm">
        <button v-for="t in tabs" :key="t.value"
          :class="['shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition', state === t.value ? 'bg-indigo-950 text-white' : 'text-slate-600 hover:bg-slate-100']"
          @click="state = t.value">
          {{ t.label }} <span class="opacity-60">{{ countOf(t.value) }}</span>
        </button>
      </div>

      <select v-model="productId" class="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm sm:flex-none" aria-label="Filtrar por servicio">
        <option value="">Todos los servicios</option>
        <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select>

      <div class="flex min-w-0 flex-1 items-center gap-1.5 sm:flex-none">
        <select :value="sortKey" class="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" aria-label="Ordenar por"
          @change="pickSort($event.target.value)">
          <option v-for="s in sortOptions" :key="s.key" :value="s.key">{{ s.label }}</option>
        </select>
        <button type="button" class="grid size-9 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
          :title="sortDir === 'asc' ? 'Ascendente (clic para invertir)' : 'Descendente (clic para invertir)'"
          @click="sortDir = sortDir === 'asc' ? 'desc' : 'asc'">
          <component :is="sortDir === 'asc' ? ArrowUp : ArrowDown" class="size-4" />
        </button>
      </div>

      <div class="relative w-full min-w-56 sm:w-auto sm:max-w-xs sm:flex-1">
        <Search class="absolute left-3 top-2.5 size-4 text-slate-400" />
        <input v-model="q" placeholder="Buscar correo, servicio o cliente" class="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm" />
      </div>

      <button v-if="hasFilters" type="button" class="text-sm font-medium text-indigo-600 hover:underline" @click="clearFilters">
        Limpiar filtros
      </button>
    </div>

    <div v-if="selected.length" class="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-indigo-50 px-4 py-2.5 text-sm text-indigo-700">
      <span class="font-medium">{{ selected.length }} {{ selected.length === 1 ? 'seleccionada' : 'seleccionadas' }}</span>
      <button class="flex items-center gap-1.5 rounded-md bg-rose-600 px-3 py-1.5 font-medium text-white hover:bg-rose-700" @click="askTrash(selected)">
        <Trash2 class="size-4" /> Enviar a papelera
      </button>
      <button class="underline" @click="selected = []">Quitar selección</button>
    </div>

    <label class="mt-4 flex items-center gap-2 text-sm text-slate-600 xl:hidden">
      <input type="checkbox" :checked="allOnPage" @change="toggleAll" /> Seleccionar todas las de esta página
    </label>
    <ul class="mt-2 grid gap-3 sm:grid-cols-2 xl:hidden">
      <li v-if="!loading && !rows.length" class="rounded-xl bg-white p-6 text-center text-sm text-slate-500 shadow-sm sm:col-span-2">
        No hay cuentas con ese filtro. Usa "Agregar" o "Carga masiva".
      </li>
      <li v-for="r in rows" :key="r.id" class="rounded-xl bg-white p-4 shadow-sm">
        <div class="flex items-start gap-3">
          <input type="checkbox" class="mt-1" :checked="selected.includes(r.id)" :aria-label="`Seleccionar ${r.email}`" @change="toggle(r.id)" />
          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between gap-2">
              <p class="min-w-0 truncate font-medium">{{ r.product_name }} <span class="font-normal text-slate-500">· {{ r.category_name }}</span></p>
              <span :class="['shrink-0 rounded-full px-2.5 py-1 text-xs font-medium', stateUi[r.state].cls]">{{ stateUi[r.state].label }}</span>
            </div>

            <div class="mt-2 space-y-1.5 text-sm">
              <p class="flex items-center gap-2">
                <span class="min-w-0 flex-1 truncate" :title="r.email">{{ r.email }}</span>
                <button type="button" class="shrink-0 text-slate-400 hover:text-slate-700" aria-label="Copiar correo" @click="copy(r.email, 'Correo')"><Copy class="size-4" /></button>
              </p>
              <p class="flex items-center gap-2 font-mono text-xs">
                <span class="min-w-0 flex-1 truncate">{{ revealed[r.id] ? r.password || '—' : '••••••' }}</span>
                <button type="button" class="shrink-0 text-slate-400 hover:text-slate-700" aria-label="Mostrar u ocultar contraseña" @click="revealed[r.id] = !revealed[r.id]">
                  <component :is="revealed[r.id] ? EyeOff : Eye" class="size-4" />
                </button>
                <button v-if="r.password" type="button" class="shrink-0 text-slate-400 hover:text-slate-700" aria-label="Copiar contraseña" @click="copy(r.password, 'Contraseña')"><Copy class="size-4" /></button>
              </p>
            </div>

            <div class="mt-2 text-sm">
              <template v-if="r.sale_mode === 'profiles'">
                <span>{{ r.profiles_used }} de {{ r.profile_slots }} {{ Number(r.profile_slots) === 1 ? 'perfil' : 'perfiles' }}</span>
                <RouterLink :to="{ path: '/perfiles', query: { q: r.email } }" class="ml-2 text-xs font-medium text-indigo-600 hover:underline">Ver perfiles</RouterLink>
              </template>
              <template v-else-if="r.customer_name">
                <span>{{ r.customer_name }}</span>
                <span :class="['ml-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium', daysChip(r.days_left).cls]">{{ daysChip(r.days_left).text }}</span>
              </template>
              <span v-else class="text-slate-400">Sin cliente</span>
            </div>
          </div>
        </div>

        <div class="mt-3 flex justify-end gap-1.5 border-t border-slate-100 pt-3">
          <button title="Editar" class="grid size-9 place-items-center rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100" @click="openEdit(r)"><Pencil class="size-4" /></button>
          <button v-if="r.state !== 'down'" title="Marcar como caída" class="grid size-9 place-items-center rounded-lg bg-amber-100 text-amber-800 hover:opacity-80" @click="setDown(r, true)"><AlertTriangle class="size-4" /></button>
          <button v-else title="Quitar estado de caída" class="grid size-9 place-items-center rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100" @click="setDown(r, false)"><RotateCcw class="size-4" /></button>
          <button title="Enviar a la papelera" class="grid size-9 place-items-center rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100" @click="askTrash([r.id])"><Trash2 class="size-4" /></button>
        </div>
      </li>
    </ul>

    <div class="mt-4 hidden overflow-x-auto rounded-xl bg-white shadow-sm xl:block">
      <table class="w-full min-w-[860px] text-left text-sm">
        <thead class="border-b border-slate-100 text-slate-500">
          <tr>
            <th class="w-10 px-4 py-3"><input type="checkbox" :checked="allOnPage" aria-label="Seleccionar todas" @change="toggleAll" /></th>
            <th v-for="c in cols" :key="c.key"
              :aria-sort="sortKey === c.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'"
              class="px-4 py-3 font-medium">
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
            <td colspan="7" class="px-4 py-10 text-center text-slate-500">
              No hay cuentas con ese filtro. Usa "Agregar" o "Carga masiva".
            </td>
          </tr>
          <tr v-for="r in rows" :key="r.id" class="hover:bg-slate-50">
            <td class="px-4 py-3"><input type="checkbox" :checked="selected.includes(r.id)" @change="toggle(r.id)" /></td>
            <td class="px-4 py-3">
              <p class="font-medium">{{ r.product_name }}</p>
              <p class="text-slate-500">{{ r.category_name }}</p>
            </td>
            <td class="px-4 py-3">
              <div class="flex max-w-60 items-center gap-1.5">
                <span class="min-w-0 flex-1 truncate" :title="r.email">{{ r.email }}</span>
                <button type="button" class="shrink-0 text-slate-400 hover:text-slate-700" aria-label="Copiar correo" @click="copy(r.email, 'Correo')"><Copy class="size-4" /></button>
              </div>
            </td>
            <td class="px-4 py-3">
              <div class="flex w-48 items-center gap-1.5">
                <span class="min-w-0 flex-1 truncate font-mono text-xs" :title="revealed[r.id] ? r.password : undefined">{{ revealed[r.id] ? r.password || '—' : '••••••' }}</span>
                <button type="button" class="shrink-0 text-slate-400 hover:text-slate-700" aria-label="Mostrar u ocultar contraseña" @click="revealed[r.id] = !revealed[r.id]">
                  <component :is="revealed[r.id] ? EyeOff : Eye" class="size-4" />
                </button>
                <button v-if="r.password" type="button" class="shrink-0 text-slate-400 hover:text-slate-700" aria-label="Copiar contraseña" @click="copy(r.password, 'Contraseña')"><Copy class="size-4" /></button>
              </div>
            </td>
            <td class="px-4 py-3">
              <span :class="['rounded-full px-2.5 py-1 text-xs font-medium', stateUi[r.state].cls]">{{ stateUi[r.state].label }}</span>
            </td>
            <td class="px-4 py-3">
              <template v-if="r.sale_mode === 'profiles'">
                <p>{{ r.profiles_used }} de {{ r.profile_slots }} {{ Number(r.profile_slots) === 1 ? 'perfil' : 'perfiles' }}</p>
                <RouterLink :to="{ path: '/perfiles', query: { q: r.email } }" class="text-xs font-medium text-indigo-600 hover:underline">Ver perfiles</RouterLink>
              </template>
              <template v-else-if="r.customer_name">
                <p>{{ r.customer_name }}</p>
                <span :class="['mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium', daysChip(r.days_left).cls]">{{ daysChip(r.days_left).text }}</span>
              </template>
              <span v-else class="text-slate-400">—</span>
            </td>
            <td class="px-4 py-3">
              <div class="flex justify-end gap-1.5">
                <button title="Editar" class="grid size-9 place-items-center rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100" @click="openEdit(r)"><Pencil class="size-4" /></button>
                <button v-if="r.state !== 'down'" title="Marcar como caída" class="grid size-9 place-items-center rounded-lg bg-amber-100 text-amber-800 hover:opacity-80" @click="setDown(r, true)"><AlertTriangle class="size-4" /></button>
                <button v-else title="Quitar estado de caída" class="grid size-9 place-items-center rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100" @click="setDown(r, false)"><RotateCcw class="size-4" /></button>
                <button title="Enviar a la papelera" class="grid size-9 place-items-center rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100" @click="askTrash([r.id])"><Trash2 class="size-4" /></button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="mt-4 flex items-center justify-between text-sm text-slate-600">
      <span>Página {{ page }} de {{ pages }} · {{ total }} resultados</span>
      <div class="flex gap-2">
        <button :disabled="page <= 1" class="rounded-lg bg-white p-2 shadow-sm disabled:opacity-40" aria-label="Anterior" @click="page--"><ChevronLeft class="size-5" /></button>
        <button :disabled="page >= pages" class="rounded-lg bg-white p-2 shadow-sm disabled:opacity-40" aria-label="Siguiente" @click="page++"><ChevronRight class="size-5" /></button>
      </div>
    </div>

    <BaseModal :open="showForm" :title="editingId ? 'Editar cuenta' : 'Nueva cuenta'" :busy="saving"
      @close="showForm = false" @submit="save">
      <label class="block">Servicio <span class="text-rose-500">*</span>
        <select v-model="form.product_id" :class="inputCls">
          <option value="">Elige el servicio</option>
          <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
      </label>
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="block">Correo <span class="text-rose-500">*</span>
          <input v-model="form.email" :class="inputCls" />
        </label>
        <label class="block">Contraseña
          <input v-model="form.password" :class="inputCls" />
        </label>
      </div>

      <div>
        <p class="mb-1">Tipo de venta</p>
        <div class="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
          <button v-for="m in saleModes" :key="m.value" type="button" :disabled="modeLocked"
            :class="segCls(form.sale_mode === m.value, modeLocked)" @click="form.sale_mode = m.value">{{ m.label }}</button>
        </div>
        <p v-if="modeLocked" class="mt-1 text-xs text-amber-600">
          No se puede cambiar mientras tenga un alquiler o perfiles activos. Córtalos primero.
        </p>
        <p v-else class="mt-1 text-xs text-slate-500">
          {{ form.sale_mode === 'full' ? 'Se alquila entera desde Alquileres.' : 'Se vende por perfiles desde Perfiles y no se puede alquilar completa.' }}
        </p>
      </div>
      <label v-if="form.sale_mode === 'profiles'" class="block">Cantidad de perfiles de la cuenta
        <input v-model.number="form.profile_slots" type="number" min="1" max="20" :class="inputCls" />
      </label>

      <label class="block">Notas
        <textarea v-model="form.notes" rows="2" :class="inputCls" />
      </label>
      <template #footer>
        <button type="button" :class="btnGhost" @click="showForm = false">Cancelar</button>
        <button :disabled="saving" :class="btnPrimary">{{ saving ? 'Guardando…' : 'Guardar' }}</button>
      </template>
    </BaseModal>

    <BaseModal :open="showBulk" title="Carga masiva de cuentas" size="xl" :busy="uploading"
      @close="showBulk = false" @submit="uploadBulk">
      <div v-if="bulkResult" class="space-y-1 rounded-lg bg-emerald-50 px-3 py-2 text-emerald-700">
        <p class="font-medium">Se subieron {{ bulkResult.created }} cuentas.</p>
        <p v-if="bulkResult.duplicates">
          {{ bulkResult.duplicates }} ya existían y se omitieron<span v-if="bulkResult.duplicate_list.length">: {{ bulkResult.duplicate_list.join(', ') }}<span v-if="bulkResult.duplicates > 20">…</span></span>
        </p>
      </div>

      <div class="grid gap-3 sm:grid-cols-2">
        <label class="block">Servicio (para todas) <span class="text-rose-500">*</span>
          <select v-model="bulk.product_id" :class="inputCls">
            <option value="">Elige el servicio</option>
            <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </label>
        <div>
          <p>Tipo de venta (para todas)</p>
          <div class="mt-1 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
            <button v-for="m in saleModes" :key="m.value" type="button"
              :class="segCls(bulk.sale_mode === m.value, false)" @click="bulk.sale_mode = m.value">{{ m.label }}</button>
          </div>
        </div>
      </div>
      <label v-if="bulk.sale_mode === 'profiles'" class="block">Perfiles por cuenta
        <input v-model.number="bulk.profile_slots" type="number" min="1" max="20" :class="inputCls" />
      </label>

      <label class="block">Una cuenta por línea: correo y contraseña
        <textarea v-model="bulk.text" rows="8" placeholder="correo1@gmail.com clave123&#10;correo2@gmail.com:clave456&#10;correo3@gmail.com,clave789"
          :class="[inputCls, 'font-mono text-xs']" />
      </label>
      <p class="text-xs text-slate-500">
        Separa con espacio, coma, dos puntos o tabulador (puedes copiar dos columnas de Excel). Todas entran sin vender.
      </p>
      <p>
        <span class="font-medium text-emerald-600">{{ parsed.ok.length }} válidas</span>
        <span v-if="parsed.bad.length" class="ml-3 font-medium text-rose-600">{{ parsed.bad.length }} no se entienden</span>
      </p>

      <template #footer>
        <button type="button" :class="btnGhost" @click="showBulk = false">Cerrar</button>
        <button :disabled="uploading || !parsed.ok.length" :class="btnPrimary">
          {{ uploading ? 'Subiendo…' : `Subir ${parsed.ok.length} cuentas` }}
        </button>
      </template>
    </BaseModal>

    <BaseModal :open="trashIds.length > 0" size="sm"
      :title="`Enviar ${trashIds.length} ${trashIds.length === 1 ? 'cuenta' : 'cuentas'} a la papelera`"
      @close="trashIds = []" @submit="confirmTrash">
      <p class="text-slate-500">Se guardan 30 días por si necesitas recuperarlas; después se borran solas.</p>
      <label class="block">Motivo
        <select v-model="trashReason" :class="inputCls">
          <option v-for="r in trashReasons" :key="r.value" :value="r.value">{{ r.label }}</option>
        </select>
      </label>
      <template #footer>
        <button type="button" :class="btnGhost" @click="trashIds = []">Cancelar</button>
        <button :class="btnDanger">Enviar a papelera</button>
      </template>
    </BaseModal>
  </div>
</template>