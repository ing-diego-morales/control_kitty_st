<script setup>
import { ref, computed, onMounted } from 'vue'
import { AlertTriangle, MessageCircle, Check } from 'lucide-vue-next'
import { api } from '../api'
import { daysChip, formatPhone } from '../utils'
import { useToast } from '../toast'
import BaseModal from './BaseModal.vue'
import { btnGhost, btnPrimary } from '../ui'
import { downUrl } from '../whatsapp'

const props = defineProps({ auto: { type: Boolean, default: true } })

const toast = useToast()
const items = ref([])
const open = ref(false)
const loading = ref(false)

const pending = computed(() => items.value.filter((r) => !r.notified))

const SEEN_KEY = 'down_alert_seen'
const keyOf = (r) => `${r.kind}-${r.id}-${r.down_since}`
const readSeen = () => {
  try { return JSON.parse(sessionStorage.getItem(SEEN_KEY) || '[]') } catch { return [] }
}
const writeSeen = (list) => {
  try { sessionStorage.setItem(SEEN_KEY, JSON.stringify(list)) } catch { /* se ignora */ }
}

let seq = 0
async function refresh() {
  const mine = ++seq
  loading.value = true
  try {
    const res = await api.get('/notices/down')
    if (mine !== seq) return
    items.value = res.data
  } catch (e) {
    if (mine === seq) toast.error(e.message)
  } finally {
    if (mine === seq) loading.value = false
  }
}

async function show() {
  await refresh()
  if (pending.value.length) open.value = true
}

function close() {
  open.value = false
  const seen = new Set(readSeen())
  pending.value.forEach((r) => seen.add(keyOf(r)))
  writeSeen([...seen])
}

async function mark(list, value) {
  if (!list.length) return
  const prev = list.map((r) => ({ r, notified: r.notified, notified_at: r.notified_at }))
  const now = new Date().toISOString()
  list.forEach((r) => { r.notified = value; r.notified_at = value ? now : null })
  try {
    await api.post('/notices/down-mark', {
      items: list.map((r) => ({ kind: r.kind, id: r.id })),
      notified: value,
    })
  } catch (e) {
    prev.forEach((p) => { p.r.notified = p.notified; p.r.notified_at = p.notified_at })
    toast.error(e.message)
  }
}

function markAll() {
  const n = pending.value.length
  mark([...pending.value], true)
  toast.success(`${n} ${n === 1 ? 'cliente marcado' : 'clientes marcados'} como avisados`)
  open.value = false
}

function when(stamp) {
  if (!stamp) return ''
  const d = new Date(String(stamp).replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

onMounted(async () => {
  await refresh()
  if (props.auto) {
    const seen = new Set(readSeen())
    if (pending.value.some((r) => !seen.has(keyOf(r)))) open.value = true
  }
})

defineExpose({ show, refresh })
</script>

<template>
  <div>
    <div v-if="pending.length" class="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-rose-50 px-4 py-2.5 text-sm text-rose-700">
      <AlertTriangle class="size-4 shrink-0" />
      <span class="min-w-0 flex-1">
        <strong>{{ pending.length }}</strong>
        {{ pending.length === 1 ? 'servicio tiene la cuenta caída y no se le ha avisado al cliente' : 'servicios tienen la cuenta caída y no se les ha avisado a los clientes' }}.
      </span>
      <button type="button" class="rounded-md bg-rose-600 px-3 py-1 font-medium text-white hover:bg-rose-700" @click="open = true">
        Ver y avisar
      </button>
    </div>

    <BaseModal :open="open" size="lg" title="Cuenta caída: clientes afectados" @close="close">
      <p class="text-slate-500">
        Estas cuentas se marcaron como caídas y alguien las tenía. Avísales y ayúdales con una solución para que no se queden sin servicio.
      </p>

      <p v-if="!items.length" class="py-4 text-center text-slate-500">No hay clientes afectados.</p>

      <ul v-else class="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
        <li v-for="r in items" :key="keyOf(r)" class="flex items-center gap-3 px-3 py-2.5">
          <button type="button" role="checkbox" :aria-checked="r.notified"
            :title="r.notified ? 'Quitar la marca de avisado' : 'Marcar como avisado'"
            :class="['grid size-6 shrink-0 place-items-center rounded-full border transition', r.notified ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 text-transparent hover:border-emerald-500']"
            @click="mark([r], !r.notified)">
            <Check class="size-3.5" />
          </button>

          <div class="min-w-0 flex-1">
            <p class="flex items-center gap-1.5">
              <span class="truncate text-sm font-medium">{{ r.customer_name }}</span>
              <span :class="['shrink-0 rounded px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide', r.kind === 'profile' ? 'bg-violet-100 text-violet-700' : 'bg-indigo-100 text-indigo-700']">
                {{ r.kind === 'profile' ? 'Perfil' : 'Completa' }}
              </span>
            </p>
            <p class="truncate text-xs text-slate-500">
              {{ r.customer_phone ? formatPhone(r.customer_phone) : 'Sin celular' }} · {{ r.product_name }}<template v-if="r.profile_name"> · {{ r.profile_name }}</template> · {{ r.account_email }}
            </p>
            <p class="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
              <span :class="['rounded-full px-2 py-0.5 font-medium', daysChip(r.days_left).cls]">{{ daysChip(r.days_left).text }}</span>
              <span v-if="r.down_since" class="text-rose-600">Caída desde {{ when(r.down_since) }}</span>
              <span v-if="r.notified" class="text-emerald-600">Avisado {{ when(r.notified_at) }}</span>
            </p>
          </div>

          <a v-if="r.customer_phone" :href="downUrl(r, r.kind)" target="_blank" rel="noopener"
            title="Abrir WhatsApp y marcar como avisado"
            class="flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
            @click="r.notified || mark([r], true)">
            <MessageCircle class="size-4" /> Avisar
          </a>
        </li>
      </ul>

      <template #footer>
        <button type="button" :class="btnGhost" @click="close">Después</button>
        <button type="button" :class="btnPrimary" :disabled="!pending.length" @click="markAll">Marcar todos como avisados</button>
      </template>
    </BaseModal>
  </div>
</template>