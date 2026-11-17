<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import {
  Search, RotateCcw, Trash2, Eye, EyeOff, ChevronLeft, ChevronRight, Info,
  Copy, ArrowUp, ArrowDown, ArrowUpDown,
} from 'lucide-vue-next'
import { api } from '../api'
import { trashReasons, reasonLabel } from '../utils'
import { useToast } from '../toast'
import { useConfirm } from '../confirm'

const toast = useToast()
const { ask } = useConfirm()

const cols = [
  { key: 'product', label: 'Servicio' },
  { key: 'email', label: 'Correo' },
  { key: 'password', label: 'Contraseña' },
  { key: 'reason', label: 'Motivo' },
  { key: 'deleted', label: 'Eliminada' },
  { key: 'days', label: 'Se borra en' },
]

const rows = ref([])
const total = ref(0)
const page = ref(1)
const limit = 25
const reason = ref('')
const q = ref('')
const sortKey = ref('deleted')
const sortDir = ref('desc')
const loading = ref(false)
const revealed = ref({})
const pages = computed(() => Math.max(1, Math.ceil(total.value / limit)))

const tabs = [{ value: '', label: 'Todas' }, ...trashReasons]
const hasFilters = computed(() =>
  !!(reason.value || q.value.trim() || sortKey.value !== 'deleted' || sortDir.value !== 'desc'))

let loadSeq = 0
async function load() {
  const mine = ++loadSeq
  loading.value = true
  try {
    const params = new URLSearchParams({ page: page.value, limit, sort: sortKey.value, dir: sortDir.value })
    if (reason.value) params.set('reason', reason.value)
    if (q.value.trim()) params.set('q', q.value.trim())
    const res = await api.get(`/accounts/trash?${params}`)
    if (mine !== loadSeq) return
    if (!res.data.length && page.value > 1) { page.value--; return }
    rows.value = res.data
    total.value = res.total
  } catch (e) {
    if (mine === loadSeq) toast.error(e.message)
  } finally {
    if (mine === loadSeq) loading.value = false
  }
}

const reload = () => (page.value === 1 ? load() : (page.value = 1))
let timer
watch(q, () => { clearTimeout(timer); timer = setTimeout(reload, 300) })
watch([reason, sortKey, sortDir], reload)
watch(page, load)
onMounted(load)

function sortBy(key) {
  if (sortKey.value === key) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  else { sortKey.value = key; sortDir.value = 'asc' }
}
function pickSort(key) {
  sortKey.value = key
  sortDir.value = key === 'deleted' ? 'desc' : 'asc'
}
function clearFilters() {
  q.value = ''
  reason.value = ''
  sortKey.value = 'deleted'
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

async function restore(r) {
  try {
    await api.post(`/accounts/${r.id}/restore`)
    toast.success(`${r.email} volvió a Cuentas como libre`)
    await load()
  } catch (e) { toast.error(e.message) }
}

async function purge(r) {
  const ok = await ask({
    title: 'Eliminar definitivamente',
    message: 'Esta acción no se puede deshacer.',
    detail: r.email,
    confirmText: 'Eliminar',
    tone: 'danger',
  })
  if (!ok) return
  try {
    await api.del(`/accounts/${r.id}/purge`)
    toast.success('Cuenta eliminada definitivamente')
    await load()
  } catch (e) { toast.error(e.message) }
}

async function emptyAll() {
  const ok = await ask({
    title: 'Vaciar papelera',
    message: 'Se borrarán definitivamente todas las cuentas de la papelera. No se puede deshacer.',
    confirmText: 'Vaciar',
    tone: 'danger',
  })
  if (!ok) return
  try {
    const r = await api.del('/accounts/trash')
    toast.success(`${r.deleted} ${r.deleted === 1 ? 'cuenta eliminada' : 'cuentas eliminadas'} definitivamente`)
    await load()
  } catch (e) { toast.error(e.message) }
}
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold">Papelera</h1>
        <p class="text-slate-500">{{ total }} {{ total === 1 ? 'cuenta' : 'cuentas' }}</p>
      </div>
      <button :disabled="!total" class="flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 font-medium text-white transition hover:bg-rose-700 disabled:opacity-40" @click="emptyAll">
        <Trash2 class="size-5" /> Vaciar papelera
      </button>
    </div>

    <p class="mt-4 flex items-start gap-2 rounded-lg bg-indigo-50 p-3 text-sm text-indigo-700">
      <Info class="mt-0.5 size-4 shrink-0" />
      Las cuentas se borran automáticamente a los 30 días. Antes de eso puedes restaurarlas (vuelven a Cuentas como libres) o eliminarlas a mano.
    </p>

    <div class="mt-6 flex flex-wrap items-center gap-3">
      <div class="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-white p-1 shadow-sm">
        <button v-for="t in tabs" :key="t.value"
          :class="['shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition', reason === t.value ? 'bg-indigo-950 text-white' : 'text-slate-600 hover:bg-slate-100']"
          @click="reason = t.value">{{ t.label }}</button>
      </div>

      <div class="flex min-w-0 flex-1 items-center gap-1.5 sm:flex-none">
        <select :value="sortKey" class="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" aria-label="Ordenar por"
          @change="pickSort($event.target.value)">
          <option v-for="c in cols" :key="c.key" :value="c.key">{{ c.label }}</option>
        </select>
        <button type="button" class="grid size-9 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
          :title="sortDir === 'asc' ? 'Ascendente (clic para invertir)' : 'Descendente (clic para invertir)'"
          @click="sortDir = sortDir === 'asc' ? 'desc' : 'asc'">
          <component :is="sortDir === 'asc' ? ArrowUp : ArrowDown" class="size-4" />
        </button>
      </div>

      <div class="relative w-full min-w-56 sm:w-auto sm:max-w-xs sm:flex-1">
        <Search class="absolute left-3 top-2.5 size-4 text-slate-400" />
        <input v-model="q" placeholder="Buscar correo o servicio" class="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm" />
      </div>

      <button v-if="hasFilters" type="button" class="text-sm font-medium text-indigo-600 hover:underline" @click="clearFilters">
        Limpiar filtros
      </button>
    </div>

    <ul class="mt-4 grid gap-3 sm:grid-cols-2 xl:hidden">
      <li v-if="!loading && !rows.length" class="rounded-xl bg-white p-6 text-center text-sm text-slate-500 shadow-sm sm:col-span-2">
        {{ hasFilters ? 'No hay cuentas con ese filtro.' : 'La papelera está vacía.' }}
      </li>
      <li v-for="r in rows" :key="r.id" class="rounded-xl bg-white p-4 shadow-sm">
        <div class="flex items-center justify-between gap-2">
          <p class="min-w-0 truncate font-medium">{{ r.product_name }}</p>
          <span :class="['shrink-0 rounded-full px-2.5 py-1 text-xs font-medium', r.days_left <= 5 ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600']">
            Se borra en {{ r.days_left }} {{ Number(r.days_left) === 1 ? 'día' : 'días' }}
          </span>
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

        <p class="mt-2 text-sm text-slate-500">{{ reasonLabel(r.delete_reason) }} · eliminada el {{ r.deleted_at.slice(0, 10) }}</p>

        <div class="mt-3 flex justify-end gap-1.5 border-t border-slate-100 pt-3">
          <button title="Restaurar" class="grid size-9 place-items-center rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100" @click="restore(r)"><RotateCcw class="size-4" /></button>
          <button title="Eliminar definitivamente" class="grid size-9 place-items-center rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100" @click="purge(r)"><Trash2 class="size-4" /></button>
        </div>
      </li>
    </ul>

    <div class="mt-4 hidden overflow-x-auto rounded-xl bg-white shadow-sm xl:block">
      <table class="w-full min-w-[800px] text-left text-sm">
        <thead class="border-b border-slate-100 text-slate-500">
          <tr>
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
              {{ hasFilters ? 'No hay cuentas con ese filtro.' : 'La papelera está vacía.' }}
            </td>
          </tr>
          <tr v-for="r in rows" :key="r.id" class="hover:bg-slate-50">
            <td class="px-4 py-3 font-medium">{{ r.product_name }}</td>
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
            <td class="px-4 py-3">{{ reasonLabel(r.delete_reason) }}</td>
            <td class="px-4 py-3">{{ r.deleted_at.slice(0, 10) }}</td>
            <td class="px-4 py-3">
              <span :class="['rounded-full px-2.5 py-1 text-xs font-medium', r.days_left <= 5 ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600']">
                {{ r.days_left }} {{ Number(r.days_left) === 1 ? 'día' : 'días' }}
              </span>
            </td>
            <td class="px-4 py-3">
              <div class="flex justify-end gap-1.5">
                <button title="Restaurar" class="grid size-9 place-items-center rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100" @click="restore(r)"><RotateCcw class="size-4" /></button>
                <button title="Eliminar definitivamente" class="grid size-9 place-items-center rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100" @click="purge(r)"><Trash2 class="size-4" /></button>
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
  </div>
</template>