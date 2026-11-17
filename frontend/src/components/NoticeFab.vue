<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import {
  MessageCircle, X, Send, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, Copy, Check,
} from 'lucide-vue-next'
import { api } from '../api'
import { daysChip, formatPhone } from '../utils'
import { useToast } from '../toast'
import BaseModal from './BaseModal.vue'
import { btnGhost, inputCls } from '../ui'
import {
  renewalGroupText, waUrl, waPhone, DEFAULT_GENERAL, fillGeneral, plainGeneral,
} from '../whatsapp'

const toast = useToast()
const PER_PAGE = 6

const open = ref(false)
const rows = ref([])
const loading = ref(false)
const tab = ref('pending') 
const page = ref(1)
const selected = ref([])
const expanded = ref({})

const read = (k, d) => { try { return localStorage.getItem(k) ?? d } catch { return d } }
const write = (k, v) => { try { localStorage.setItem(k, v) } catch { /* se ignora */ } }

const windows = [
  { v: 0, l: 'Hoy' },
  { v: 1, l: 'Hasta mañana' },
  { v: 3, l: 'En 3 días' },
  { v: 7, l: 'En 7 días' },
]
const sorts = [
  { v: 'urgent', l: 'Más urgentes' },
  { v: 'name', l: 'Cliente (A-Z)' },
  { v: 'count', l: 'Más servicios' },
]
const days = ref(Number(read('notice_days', '3')))
const expired = ref(read('notice_expired', '0') === '1')
const grouped = ref(read('notice_group', '1') === '1')
const sortKey = ref(read('notice_sort', 'urgent'))
const sortDir = ref(read('notice_dir', 'asc'))
const template = ref(read('notice_template', DEFAULT_GENERAL))

watch([days, expired], () => {
  write('notice_days', String(days.value))
  write('notice_expired', expired.value ? '1' : '0')
  load()
})
watch(grouped, (v) => { write('notice_group', v ? '1' : '0'); page.value = 1; selected.value = [] })
watch(sortKey, (v) => { write('notice_sort', v); page.value = 1 })
watch(sortDir, (v) => { write('notice_dir', v); page.value = 1 })
watch(template, (t) => write('notice_template', t))

let seq = 0
async function load() {
  const mine = ++seq
  loading.value = true
  try {
    const res = await api.get(`/notices?days=${days.value}&expired=${expired.value ? 1 : 0}`)
    if (mine !== seq) return
    rows.value = res.data
  } catch (e) {
    if (mine === seq && open.value) toast.error(e.message)
  } finally {
    if (mine === seq) loading.value = false
  }
}

const keyOf = (r) => {
  const d = String(r.customer_phone || '').replace(/\D/g, '')
  return d.length >= 7 ? `p:${d.slice(-10)}` : `n:${String(r.customer_name || '').trim().toLowerCase()}`
}
const ts = (v) => new Date(String(v).replace(' ', 'T')).getTime() || 0

function build(list) {
  const map = new Map()
  for (const r of list) {
    const key = grouped.value ? keyOf(r) : `${r.kind}-${r.id}`
    let g = map.get(key)
    if (!g) { g = { key, name: r.customer_name, phone: '', items: [] }; map.set(key, g) }
    if (!g.phone && r.customer_phone) g.phone = r.customer_phone
    g.items.push(r)
  }
  return [...map.values()].map((g) => {
    g.items.sort((a, b) => a.days_left - b.days_left)
    const stamps = g.items.map((i) => i.notified_at).filter(Boolean)
    const doneAt = stamps.length ? stamps.reduce((a, b) => (ts(a) >= ts(b) ? a : b)) : null
    return { ...g, minDays: g.items[0].days_left, doneAt }
  })
}

const sorters = {
  urgent: (a, b) => a.minDays - b.minDays || a.name.localeCompare(b.name, 'es'),
  name: (a, b) => a.name.localeCompare(b.name, 'es'),
  count: (a, b) => b.items.length - a.items.length || a.minDays - b.minDays,
}
function ordered(list) {
  const arr = [...list].sort(sorters[sortKey.value] || sorters.urgent)
  return sortDir.value === 'desc' ? arr.reverse() : arr
}

const pendingGroups = computed(() => ordered(build(rows.value.filter((r) => !r.notified))))
const doneGroups = computed(() => ordered(build(rows.value.filter((r) => r.notified))))
const list = computed(() => (tab.value === 'pending' ? pendingGroups.value : doneGroups.value))
const pages = computed(() => Math.max(1, Math.ceil(list.value.length / PER_PAGE)))
const pageList = computed(() => list.value.slice((page.value - 1) * PER_PAGE, page.value * PER_PAGE))

watch(pages, (p) => { if (page.value > p) page.value = p })
watch(tab, () => { page.value = 1; selected.value = [] })
watch(list, (l) => {
  const keys = new Set(l.map((g) => g.key))
  const keep = selected.value.filter((k) => keys.has(k))
  if (keep.length !== selected.value.length) selected.value = keep
})

const isSel = (g) => selected.value.includes(g.key)
const toggleSel = (g) => {
  selected.value = isSel(g) ? selected.value.filter((k) => k !== g.key) : [...selected.value, g.key]
}
const allSelected = computed(() => list.value.length > 0 && list.value.every(isSel))
const toggleAll = () => { selected.value = allSelected.value ? [] : list.value.map((g) => g.key) }
const chosen = computed(() => list.value.filter(isSel))
const chosenItems = computed(() => chosen.value.flatMap((g) => g.items))

async function mark(items, value) {
  if (!items.length) return
  const prev = items.map((r) => ({ r, notified: r.notified, notified_at: r.notified_at }))
  const now = new Date().toISOString()
  items.forEach((r) => { r.notified = value; r.notified_at = value ? now : null })
  try {
    await api.post('/notices/mark', {
      items: items.map((r) => ({ kind: r.kind, id: r.id })),
      notified: value,
    })
  } catch (e) {
    prev.forEach((p) => { p.r.notified = p.notified; p.r.notified_at = p.notified_at })
    toast.error(e.message)
  }
}

const groupUrl = (g) => waUrl(g.phone, renewalGroupText(g.items))
const onOpenGroup = (g) => mark(g.items.filter((r) => !r.notified), true)

const queuePool = computed(() =>
  (tab.value === 'pending' && chosen.value.length ? chosen.value : pendingGroups.value).filter((g) => g.phone))

function nextOne() {
  const g = queuePool.value[0]
  if (!g) { toast.info('No quedan pendientes con celular'); return }
  window.open(groupUrl(g), '_blank', 'noopener')
  mark(g.items, true)
}

function summary(g) {
  const counts = new Map()
  for (const r of g.items) counts.set(r.product_name, (counts.get(r.product_name) || 0) + 1)
  return [...counts].map(([n, c]) => (c > 1 ? `${n} ×${c}` : n)).join(', ')
}

function when(stamp) {
  if (!stamp) return ''
  const d = new Date(String(stamp).replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

const generalOpen = ref(false)
const modalGroups = ref([])
const modalWithPhone = computed(() => modalGroups.value.filter((g) => g.phone))
const generalUrlFor = (g) => waUrl(g.phone, fillGeneral(template.value, g.name))
const allNotified = (g) => g.items.every((r) => r.notified)

function openGeneral() {
  modalGroups.value = chosen.value 
  generalOpen.value = true
}

async function copyText(text, label) {
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
const copyNumbers = () =>
  copyText(modalWithPhone.value.map((g) => `+${waPhone(g.phone)}`).join('\n'), 'Números')

function markModal() {
  const items = modalGroups.value.flatMap((g) => g.items).filter((r) => !r.notified)
  mark(items, true)
  toast.success(`${modalGroups.value.length} ${modalGroups.value.length === 1 ? 'cliente marcado' : 'clientes marcados'} como avisados`)
  generalOpen.value = false
}

function toggle() {
  open.value = !open.value
  if (open.value) load()
}

let timer
const onKey = (e) => { if (e.key === 'Escape' && open.value && !generalOpen.value) open.value = false }
const onVisible = () => { if (document.visibilityState === 'visible') load() }

onMounted(() => {
  load()
  timer = setInterval(load, 5 * 60 * 1000)
  window.addEventListener('keydown', onKey)
  document.addEventListener('visibilitychange', onVisible)
})
onBeforeUnmount(() => {
  clearInterval(timer)
  window.removeEventListener('keydown', onKey)
  document.removeEventListener('visibilitychange', onVisible)
})
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-150" enter-from-class="translate-y-2 opacity-0"
      leave-active-class="transition duration-100" leave-to-class="translate-y-2 opacity-0">
      <section v-if="open" role="dialog" aria-label="Avisos de vencimiento"
        class="fixed bottom-20 right-4 z-40 flex max-h-[min(40rem,calc(100vh-7rem))] w-[calc(100vw-2rem)] max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/10">
        <header class="flex items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <div>
            <h2 class="font-semibold">Avisos de vencimiento</h2>
            <p class="text-xs text-slate-500">{{ pendingGroups.length }} por avisar · {{ doneGroups.length }} avisados</p>
          </div>
          <button type="button" aria-label="Cerrar" class="grid size-7 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" @click="open = false">
            <X class="size-4" />
          </button>
        </header>

        <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-slate-100 px-4 py-2.5 text-xs">
          <label class="flex items-center gap-1.5 text-slate-500">Vencen
            <select v-model.number="days" class="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs">
              <option v-for="w in windows" :key="w.v" :value="w.v">{{ w.l }}</option>
            </select>
          </label>
          <label class="flex items-center gap-1.5 text-slate-500"><input v-model="expired" type="checkbox" /> Incluir vencidos</label>
          <label class="flex items-center gap-1.5 text-slate-500" title="Si un cliente tiene varios servicios por vencer, recibe un solo mensaje con todos">
            <input v-model="grouped" type="checkbox" /> Un mensaje por cliente
          </label>
          <div class="ml-auto flex items-center gap-1">
            <select v-model="sortKey" class="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs" aria-label="Ordenar por">
              <option v-for="s in sorts" :key="s.v" :value="s.v">{{ s.l }}</option>
            </select>
            <button type="button" class="grid size-7 place-items-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
              title="Invertir el orden" @click="sortDir = sortDir === 'asc' ? 'desc' : 'asc'">
              <component :is="sortDir === 'asc' ? ArrowUp : ArrowDown" class="size-3.5" />
            </button>
          </div>
        </div>

        <div class="px-4 pt-3">
          <div class="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 text-sm">
            <button type="button" :class="['rounded-md px-2 py-1 transition', tab === 'pending' ? 'bg-white font-medium shadow-sm' : 'text-slate-500 hover:text-slate-700']" @click="tab = 'pending'">
              Por avisar <span class="opacity-60">{{ pendingGroups.length }}</span>
            </button>
            <button type="button" :class="['rounded-md px-2 py-1 transition', tab === 'done' ? 'bg-white font-medium shadow-sm' : 'text-slate-500 hover:text-slate-700']" @click="tab = 'done'">
              Avisados <span class="opacity-60">{{ doneGroups.length }}</span>
            </button>
          </div>
        </div>

        <div class="space-y-2 px-4 pt-2.5">
          <button v-if="tab === 'pending' && queuePool.length" type="button"
            class="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-700" @click="nextOne">
            <Send class="size-4" /> Avisar al siguiente ({{ queuePool.length }})
          </button>

          <div v-if="chosen.length" class="flex flex-wrap items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
            <span class="font-medium">{{ chosen.length }} {{ chosen.length === 1 ? 'seleccionado' : 'seleccionados' }}</span>
            <template v-if="tab === 'pending'">
              <button type="button" class="rounded-md bg-indigo-600 px-2.5 py-1 font-medium text-white hover:bg-indigo-700" @click="openGeneral">Aviso general</button>
              <button type="button" class="rounded-md bg-white px-2.5 py-1 font-medium text-indigo-700 shadow-sm hover:bg-indigo-100" @click="mark(chosenItems, true)">Marcar avisados</button>
            </template>
            <button v-else type="button" class="rounded-md bg-white px-2.5 py-1 font-medium text-indigo-700 shadow-sm hover:bg-indigo-100" @click="mark(chosenItems, false)">Quitar marca</button>
            <button type="button" class="ml-auto underline" @click="selected = []">Limpiar</button>
          </div>
        </div>

        <label v-if="list.length" class="flex cursor-pointer items-center gap-2 px-4 pt-2.5 text-xs text-slate-500">
          <input type="checkbox" :checked="allSelected" @change="toggleAll" />
          {{ allSelected ? 'Quitar la selección' : `Seleccionar todos (${list.length})` }}
        </label>

        <p v-if="!list.length" class="px-4 py-8 text-center text-sm text-slate-500">
          <template v-if="loading">Cargando…</template>
          <template v-else-if="tab === 'pending'">No hay nadie por avisar en este rango.</template>
          <template v-else>Todavía no has avisado a nadie en este rango.</template>
        </p>

        <ul v-else class="mt-1.5 min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto px-2">
          <li v-for="g in pageList" :key="g.key" class="px-2 py-2.5">
            <div class="flex items-start gap-2.5">
              <input type="checkbox" class="mt-1.5 shrink-0" :checked="isSel(g)" :aria-label="`Seleccionar a ${g.name}`" @change="toggleSel(g)" />

              <div class="min-w-0 flex-1">
                <p class="flex items-center gap-1.5">
                  <span class="truncate text-sm font-medium">{{ g.name }}</span>
                  <span v-if="g.items.length > 1" class="shrink-0 rounded bg-indigo-100 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-indigo-700">{{ g.items.length }} servicios</span>
                  <span v-else :class="['shrink-0 rounded px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide', g.items[0].kind === 'profile' ? 'bg-violet-100 text-violet-700' : 'bg-indigo-100 text-indigo-700']">
                    {{ g.items[0].kind === 'profile' ? 'Perfil' : 'Completa' }}
                  </span>
                </p>
                <p class="truncate text-xs text-slate-500">
                  <template v-if="g.items.length === 1">
                    {{ g.items[0].product_name }}<template v-if="g.items[0].profile_name"> · {{ g.items[0].profile_name }}</template> · {{ g.items[0].account_email }}
                  </template>
                  <template v-else>{{ summary(g) }}</template>
                </p>
                <p class="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
                  <span :class="['rounded-full px-2 py-0.5 font-medium', daysChip(g.minDays).cls]">{{ daysChip(g.minDays).text }}</span>
                  <span v-if="tab === 'done' && g.doneAt" class="text-emerald-600">Avisado {{ when(g.doneAt) }}</span>
                  <button v-if="g.items.length > 1" type="button" class="text-indigo-600 hover:underline" @click="expanded[g.key] = !expanded[g.key]">
                    {{ expanded[g.key] ? 'Ocultar detalle' : 'Ver detalle' }}
                  </button>
                </p>
                <ul v-if="expanded[g.key]" class="mt-1.5 space-y-1 rounded-lg bg-slate-100 px-2.5 py-2 text-xs">
                  <li v-for="r in g.items" :key="`${r.kind}-${r.id}`" class="flex items-center justify-between gap-2">
                    <span class="min-w-0 truncate">
                      {{ r.product_name }}<template v-if="r.profile_name"> · {{ r.profile_name }}</template> · {{ r.account_email }}
                    </span>
                    <span :class="['shrink-0 rounded-full px-1.5 py-0.5 font-medium', daysChip(r.days_left).cls]">{{ daysChip(r.days_left).text }}</span>
                  </li>
                </ul>
              </div>

              <a v-if="g.phone" :href="groupUrl(g)" target="_blank" rel="noopener" title="Abrir WhatsApp y marcar como avisado"
                class="grid size-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700 transition hover:bg-emerald-100"
                @click="onOpenGroup(g)">
                <MessageCircle class="size-5" />
              </a>
              <span v-else class="shrink-0 pt-2 text-[10px] text-slate-400">Sin celular</span>
            </div>
          </li>
        </ul>

        <footer v-if="list.length > PER_PAGE" class="flex items-center justify-between border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
          <span>{{ (page - 1) * PER_PAGE + 1 }}–{{ Math.min(page * PER_PAGE, list.length) }} de {{ list.length }}</span>
          <div class="flex items-center gap-1.5">
            <button type="button" :disabled="page <= 1" class="rounded-lg bg-slate-100 p-1.5 disabled:opacity-40" aria-label="Anterior" @click="page--"><ChevronLeft class="size-4" /></button>
            <span>{{ page }} / {{ pages }}</span>
            <button type="button" :disabled="page >= pages" class="rounded-lg bg-slate-100 p-1.5 disabled:opacity-40" aria-label="Siguiente" @click="page++"><ChevronRight class="size-4" /></button>
          </div>
        </footer>
      </section>
    </Transition>

    <button type="button" :aria-label="open ? 'Cerrar avisos' : 'Abrir avisos de vencimiento'" :aria-expanded="open"
      class="fixed bottom-4 right-4 z-40 grid size-14 place-items-center rounded-full bg-emerald-600 text-white shadow-lg transition hover:bg-emerald-700 active:scale-95"
      @click="toggle">
      <component :is="open ? X : MessageCircle" class="size-6" />
      <span v-if="!open && pendingGroups.length"
        class="absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[11px] font-semibold leading-5 text-white ring-2 ring-slate-50">
        {{ pendingGroups.length > 99 ? '99+' : pendingGroups.length }}
      </span>
    </button>

    <BaseModal :open="generalOpen" title="Aviso general" size="lg" @close="generalOpen = false">
      <p class="text-slate-500">
        Para {{ modalGroups.length }} {{ modalGroups.length === 1 ? 'cliente' : 'clientes' }}.
        Escribe un solo mensaje; <code class="rounded bg-slate-100 px-1">{{ '{nombre}' }}</code> se cambia por el primer nombre de cada uno.
      </p>
      <textarea v-model="template" rows="4" :class="inputCls" />

      <div class="flex flex-wrap gap-2">
        <button type="button" class="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700" @click="copyText(plainGeneral(template), 'Mensaje')">
          <Copy class="size-4" /> Copiar mensaje
        </button>
        <button type="button" class="flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200" @click="copyNumbers">
          <Copy class="size-4" /> Copiar números ({{ modalWithPhone.length }})
        </button>
        <button type="button" class="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700" @click="markModal">
          <Check class="size-4" /> Marcar todos como avisados
        </button>
      </div>

      <p class="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-500">
        WhatsApp no permite enviar a varios chats con un solo clic desde una página. Para mandarlo a todos de una vez:
        crea una <strong>lista de difusión</strong> con los números copiados (cada persona debe tener tu número guardado),
        pega el mensaje y envía; luego pulsa "Marcar todos como avisados". O abre cada chat desde la lista de abajo: sale con el texto ya escrito.
      </p>

      <ul class="max-h-52 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
        <li v-for="g in modalGroups" :key="g.key" class="flex items-center gap-2.5 px-3 py-2">
          <span :class="['grid size-5 shrink-0 place-items-center rounded-full', allNotified(g) ? 'bg-emerald-500 text-white' : 'border border-slate-300 text-transparent']">
            <Check class="size-3" />
          </span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium">{{ g.name }}</p>
            <p class="truncate text-xs text-slate-500">{{ g.phone ? formatPhone(g.phone) : 'Sin celular' }} · {{ g.items.length }} {{ g.items.length === 1 ? 'servicio' : 'servicios' }}</p>
          </div>
          <a v-if="g.phone" :href="generalUrlFor(g)" target="_blank" rel="noopener"
            class="shrink-0 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
            @click="mark(g.items.filter((r) => !r.notified), true)">
            Abrir WhatsApp
          </a>
        </li>
      </ul>

      <template #footer>
        <button type="button" :class="btnGhost" @click="generalOpen = false">Cerrar</button>
      </template>
    </BaseModal>
  </Teleport>
</template>