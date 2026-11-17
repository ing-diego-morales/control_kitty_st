<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import {
  Plus, Search, Pencil, Trash2, ChevronLeft, ChevronRight,
  ArrowUp, ArrowDown, ArrowUpDown, Eye, EyeOff,
} from 'lucide-vue-next'
import { api } from '../api'
import { useToast } from '../toast'
import { useConfirm } from '../confirm'
import PhoneInput from './PhoneInput.vue'
import BaseModal from './BaseModal.vue'
import { inputCls, btnGhost, btnPrimary } from '../ui'

const props = defineProps({
  title: String,
  endpoint: String,
  noun: { type: String, default: 'registro' },
  plural: { type: String, default: 'registros' },
  columns: Array,
  fields: Array,
  pageSize: { type: Number, default: 15 },
  params: { type: Object, default: () => ({}) },
})

const toast = useToast()
const { ask } = useConfirm()

const rows = ref([])
const loading = ref(false)
const q = ref('')
const page = ref(1)
const sort = reactive({ col: null, key: null, dir: 1 })
const revealed = ref({})

let loadSeq = 0
async function load(resetPage = false) {
  const mine = ++loadSeq
  loading.value = true
  try {
    const sp = new URLSearchParams()
    if (q.value.trim()) sp.set('q', q.value.trim())
    for (const [k, v] of Object.entries(props.params)) {
      if (v !== '' && v !== null && v !== undefined) sp.set(k, v)
    }
    const data = await api.get(`${props.endpoint}${sp.toString() ? `?${sp}` : ''}`)
    if (mine !== loadSeq) return
    rows.value = data
    if (resetPage) page.value = 1
  } catch (e) {
    if (mine === loadSeq) toast.error(e.message)
  } finally {
    if (mine === loadSeq) loading.value = false
  }
}

let timer
const reloadSoon = () => { clearTimeout(timer); timer = setTimeout(() => load(true), 300) }
watch(q, reloadSoon)
watch(() => props.params, reloadSoon, { deep: true })

const sortable = computed(() => props.columns.filter((c) => c.sortable !== false))
const sorted = computed(() => {
  if (!sort.key) return rows.value
  return [...rows.value].sort((a, b) =>
    String(a[sort.key] ?? '').localeCompare(String(b[sort.key] ?? ''), 'es', { numeric: true }) * sort.dir)
})
const pages = computed(() => Math.max(1, Math.ceil(sorted.value.length / props.pageSize)))
const visible = computed(() => sorted.value.slice((page.value - 1) * props.pageSize, page.value * props.pageSize))
watch(pages, (p) => { if (page.value > p) page.value = p })

function applySort(col) {
  sort.col = col.key
  sort.key = col.sortKey ?? col.key
}
function sortBy(col) {
  if (col.sortable === false) return
  if (sort.col === col.key) sort.dir *= -1
  else { applySort(col); sort.dir = 1 }
}
function pickSort(colKey) {
  const col = props.columns.find((c) => c.key === colKey)
  if (!col) { sort.col = null; sort.key = null; sort.dir = 1; return }
  applySort(col)
  sort.dir = 1
}

function cell(row, c) {
  const v = c.format ? c.format(row) : row[c.key]
  return v === '' || v === null || v === undefined ? '—' : v
}
const titleOf = (row) => String(row.name ?? row[props.columns[0].key] ?? '')

const opts = reactive({})
async function loadOptions() {
  try {
    for (const f of props.fields) {
      if (f.optionsFrom) opts[f.key] = await f.optionsFrom()
      else if (f.options) opts[f.key] = f.options
    }
  } catch (e) {
    toast.error(e.message)
  }
}

onMounted(() => { load(true); loadOptions() })

const showForm = ref(false)
const editingId = ref(null)
const saving = ref(false)
const form = reactive({})

const blank = () =>
  Object.fromEntries(props.fields.map((f) => [f.key, f.default ?? (f.type === 'number' ? 0 : '')]))

function openNew() {
  editingId.value = null
  Object.assign(form, blank())
  showForm.value = true
}

function openEdit(row) {
  editingId.value = row.id
  const base = blank()
  for (const f of props.fields) {
    const v = row[f.key]
    base[f.key] = v === null || v === undefined ? base[f.key] : f.type === 'number' ? Number(v) : v
  }
  Object.assign(form, base)
  showForm.value = true
}

async function save() {
  const body = {}
  for (const f of props.fields) {
    let v = form[f.key]
    if (f.required && (v === '' || v === null || v === undefined)) {
      toast.error(f.type === 'phone'
        ? `Escribe un número de teléfono válido en "${f.label}"`
        : `Completa el campo "${f.label}"`)
      return
    }
    if (f.type === 'number') v = v === '' || v === null ? 0 : Number(v)
    else if (f.type === 'select' && v === '') v = null
    else if (typeof v === 'string') v = v.trim()
    body[f.key] = v
  }
  saving.value = true
  try {
    const wasEditing = !!editingId.value
    if (wasEditing) await api.put(`${props.endpoint}/${editingId.value}`, body)
    else await api.post(props.endpoint, body)
    showForm.value = false
    toast.success(wasEditing ? 'Cambios guardados' : 'Agregado correctamente')
    await load()
  } catch (e) {
    toast.error(e.message)
  } finally {
    saving.value = false
  }
}

async function remove(row) {
  const ok = await ask({
    title: `Eliminar ${props.noun}`,
    message: 'Esta acción no se puede deshacer.',
    detail: titleOf(row),
    confirmText: 'Eliminar',
    tone: 'danger',
  })
  if (!ok) return
  try {
    await api.del(`${props.endpoint}/${row.id}`)
    toast.success('Eliminado correctamente')
    await load()
  } catch (e) {
    toast.error(e.message)
  }
}
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold">{{ title }}</h1>
        <p class="text-slate-500">{{ rows.length }} {{ rows.length === 1 ? noun : plural }}</p>
      </div>
      <button class="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white transition hover:bg-emerald-700" @click="openNew">
        <Plus class="size-5" /> Agregar
      </button>
    </div>

    <div class="mt-6 flex flex-wrap items-center gap-3">
      <div class="relative w-full max-w-sm">
        <Search class="absolute left-3 top-2.5 size-4 text-slate-400" />
        <input v-model="q" :placeholder="`Buscar ${noun}`" class="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm" />
      </div>

      <slot name="filters" />

      <div v-if="sortable.length" class="flex items-center gap-1.5 lg:hidden">
        <select :value="sort.col ?? ''" class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" aria-label="Ordenar por"
          @change="pickSort($event.target.value)">
          <option value="">Sin orden</option>
          <option v-for="c in sortable" :key="c.key" :value="c.key">{{ c.label }}</option>
        </select>
        <button type="button" :disabled="!sort.col"
          class="grid size-9 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40"
          :title="sort.dir === 1 ? 'Ascendente (clic para invertir)' : 'Descendente (clic para invertir)'"
          @click="sort.dir *= -1">
          <component :is="sort.dir === 1 ? ArrowUp : ArrowDown" class="size-4" />
        </button>
      </div>
    </div>

    <ul class="mt-4 grid gap-3 sm:grid-cols-2 lg:hidden">
      <li v-if="!loading && !visible.length" class="rounded-xl bg-white p-6 text-center text-sm text-slate-500 shadow-sm sm:col-span-2">
        {{ q ? 'No hay resultados para esa búsqueda.' : `Aún no hay ${plural}. Pulsa "Agregar" para crear el primero.` }}
      </li>
      <li v-for="row in visible" :key="row.id" class="rounded-xl bg-white p-4 shadow-sm">
        <p class="truncate font-medium">{{ cell(row, columns[0]) }}</p>

        <dl class="mt-2 space-y-1.5 text-sm">
          <div v-for="c in columns.slice(1)" :key="c.key" class="flex gap-3">
            <dt class="w-20 shrink-0 text-slate-500">{{ c.label }}</dt>
            <dd class="min-w-0 flex-1 break-words">
              <template v-if="c.secret">
                <span class="font-mono">{{ revealed[row.id] ? row[c.key] || '—' : '••••••' }}</span>
                <button type="button" class="ml-2 align-middle text-slate-400 hover:text-slate-700" aria-label="Mostrar u ocultar" @click="revealed[row.id] = !revealed[row.id]">
                  <component :is="revealed[row.id] ? EyeOff : Eye" class="inline size-4" />
                </button>
              </template>
              <template v-else-if="c.chip">
                <span :class="['rounded-full px-2.5 py-1 text-xs font-medium', c.chip(row).cls]">{{ c.chip(row).text }}</span>
                <p v-if="c.chip(row).hint" class="mt-1 text-xs text-slate-500">{{ c.chip(row).hint }}</p>
              </template>
              <template v-else>{{ cell(row, c) }}</template>
            </dd>
          </div>
        </dl>

        <div class="mt-3 flex justify-end gap-1.5 border-t border-slate-100 pt-3">
          <slot name="row-actions" :row="row" />
          <button title="Editar" class="grid size-9 place-items-center rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100" @click="openEdit(row)"><Pencil class="size-4" /></button>
          <button title="Eliminar" class="grid size-9 place-items-center rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100" @click="remove(row)"><Trash2 class="size-4" /></button>
        </div>
      </li>
    </ul>

    <div class="mt-4 hidden overflow-x-auto rounded-xl bg-white shadow-sm lg:block">
      <table class="w-full min-w-[640px] text-left text-sm">
        <thead class="border-b border-slate-100 text-slate-500">
          <tr>
            <th v-for="c in columns" :key="c.key"
              :aria-sort="sort.col === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'"
              class="px-4 py-3 font-medium">
              <button type="button"
                :class="['inline-flex items-center gap-1 transition', c.sortable === false ? 'cursor-default' : 'hover:text-slate-900', sort.col === c.key && 'text-slate-900']"
                :title="c.sortable === false ? undefined : `Ordenar por ${c.label.toLowerCase()}`" @click="sortBy(c)">
                {{ c.label }}
                <component v-if="c.sortable !== false" :is="sort.col === c.key ? (sort.dir === 1 ? ArrowUp : ArrowDown) : ArrowUpDown"
                  :class="['size-3.5', sort.col === c.key ? 'text-indigo-500' : 'opacity-40']" />
              </button>
            </th>
            <th class="px-4 py-3 text-right font-medium">Acciones</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-if="!loading && !visible.length">
            <td :colspan="columns.length + 1" class="px-4 py-10 text-center text-slate-500">
              {{ q ? 'No hay resultados para esa búsqueda.' : `Aún no hay ${plural}. Pulsa "Agregar" para crear el primero.` }}
            </td>
          </tr>
          <tr v-for="row in visible" :key="row.id" class="hover:bg-slate-50">
            <td v-for="c in columns" :key="c.key" :class="['px-4 py-3', !c.chip && 'max-w-xs truncate']"
              :title="c.secret || c.chip ? undefined : String(cell(row, c))">
              <template v-if="c.secret">
                <span class="font-mono">{{ revealed[row.id] ? row[c.key] || '—' : '••••••' }}</span>
                <button type="button" class="ml-2 align-middle text-slate-400 hover:text-slate-700" aria-label="Mostrar u ocultar" @click="revealed[row.id] = !revealed[row.id]">
                  <component :is="revealed[row.id] ? EyeOff : Eye" class="inline size-4" />
                </button>
              </template>
              <template v-else-if="c.chip">
                <span :class="['whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium', c.chip(row).cls]">{{ c.chip(row).text }}</span>
                <p v-if="c.chip(row).hint" class="mt-1 text-xs text-slate-500">{{ c.chip(row).hint }}</p>
              </template>
              <template v-else>{{ cell(row, c) }}</template>
            </td>
            <td class="px-4 py-3">
              <div class="flex justify-end gap-1.5">
                <slot name="row-actions" :row="row" />
                <button title="Editar" class="grid size-9 place-items-center rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100" @click="openEdit(row)"><Pencil class="size-4" /></button>
                <button title="Eliminar" class="grid size-9 place-items-center rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100" @click="remove(row)"><Trash2 class="size-4" /></button>
              </div>
            </td>
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

    <BaseModal :open="showForm" size="lg" :busy="saving"
      :title="editingId ? `Editar ${noun}` : `Nuevo ${noun}`"
      @close="showForm = false" @submit="save">
      <div class="grid gap-3 sm:grid-cols-2">
        <label v-for="f in fields" :key="f.key" :class="['block', f.wide && 'sm:col-span-2']">
          {{ f.label }}<span v-if="f.required" class="text-rose-500"> *</span>
          <textarea v-if="f.type === 'textarea'" v-model="form[f.key]" rows="3" :class="inputCls" />
          <select v-else-if="f.type === 'select'" v-model="form[f.key]" :class="inputCls">
            <option value="">{{ f.required ? 'Elige una opción' : 'Sin asignar' }}</option>
            <option v-for="o in opts[f.key] || []" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
          <PhoneInput v-else-if="f.type === 'phone'" v-model="form[f.key]" />
          <input v-else v-model="form[f.key]" :type="f.type === 'number' ? 'number' : f.type === 'email' ? 'email' : 'text'"
            :min="f.type === 'number' ? 0 : undefined" :placeholder="f.placeholder" :class="inputCls" />
        </label>
      </div>

      <template #footer>
        <button type="button" :class="btnGhost" @click="showForm = false">Cancelar</button>
        <button :disabled="saving" :class="btnPrimary">{{ saving ? 'Guardando…' : 'Guardar' }}</button>
      </template>
    </BaseModal>
  </div>
</template>