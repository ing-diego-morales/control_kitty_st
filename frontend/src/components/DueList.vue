<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { MessageCircle, RefreshCw, ExternalLink, Search, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { api } from '../api'
import { money } from '../utils'
import { renewalUrl } from '../whatsapp'
import { useToast } from '../toast'
import { useConfirm } from '../confirm'

const props = defineProps({ scope: { type: String, default: '' } })
const emit = defineEmits(['update:scope', 'changed'])

const toast = useToast()
const { ask } = useConfirm()

const limit = 8
const rows = ref([])
const total = ref(0)
const page = ref(1)
const kind = ref('')
const q = ref('')
const loading = ref(true)
const busy = ref('')
const counts = reactive({ total: 0, expired: 0, soon: 0, week: 0, completas: 0, perfiles: 0 })
const pages = computed(() => Math.max(1, Math.ceil(total.value / limit)))

const scopes = computed(() => [
  { value: '', label: 'Todos', n: counts.total },
  { value: 'expired', label: 'Vencidos', n: counts.expired },
  { value: 'soon', label: '0 a 3 días', n: counts.soon },
  { value: 'week', label: '4 a 7 días', n: counts.week },
])

const whenLabel = (d) =>
  d < 0
    ? `Venció hace ${-d} ${-d === 1 ? 'día' : 'días'}`
    : d === 0
      ? 'Vence hoy'
      : `Vence en ${d} ${d === 1 ? 'día' : 'días'}`

const badge = (d) =>
  d < 0
    ? 'bg-rose-100 text-rose-700'
    : d <= 3
      ? 'bg-amber-100 text-amber-800'
      : 'bg-slate-100 text-slate-600'

const openTo = (r) => ({
  path: r.kind === 'profile' ? '/perfiles' : '/alquileres',
  query: { q: r.account_email },
})

let seq = 0
async function load() {
  const mine = ++seq
  loading.value = true
  try {
    const params = new URLSearchParams({ page: page.value, limit })
    if (props.scope) params.set('scope', props.scope)
    if (kind.value) params.set('kind', kind.value)
    if (q.value.trim()) params.set('q', q.value.trim())
    const res = await api.get(`/dashboard/due?${params}`)
    if (mine !== seq) return
    if (!res.data.length && page.value > 1) { page.value--; return }
    rows.value = res.data
    total.value = res.total
    Object.keys(counts).forEach((k) => { counts[k] = Number(res.counts[k]) || 0 })
  } catch (e) {
    if (mine === seq) toast.error(e.message)
  } finally {
    if (mine === seq) loading.value = false
  }
}

const reload = () => (page.value === 1 ? load() : (page.value = 1))
let timer
watch(q, () => { clearTimeout(timer); timer = setTimeout(reload, 300) })
watch([() => props.scope, kind], reload)
watch(page, load)
onMounted(load)

async function renew(r) {
  const ok = await ask({
    title: r.kind === 'profile' ? 'Renovar perfil' : 'Renovar alquiler',
    message: `Suma 30 días y registra un cobro de ${money.format(Number(r.price))}.`,
    detail: `${r.customer_name} · ${r.product_name}${r.profile_name ? ' · ' + r.profile_name : ''}`,
    confirmText: 'Renovar',
  })
  if (!ok) return
  busy.value = `${r.kind}-${r.id}`
  try {
    await api.post(r.kind === 'profile' ? '/profiles/renew' : '/rentals/renew', { ids: [r.id], days: 30 })
    toast.success('Renovado 30 días')
    await load()
    emit('changed')
  } catch (e) {
    toast.error(e.message)
  } finally {
    busy.value = ''
  }
}
</script>

<template>
  <section class="rounded-xl bg-white p-5 shadow-sm">
    <div class="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 class="font-semibold">Para renovar o cortar</h2>
        <p class="text-sm text-slate-500">Vencidos y próximos 7 días, del más urgente al menos.</p>
      </div>
      <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{{ counts.total }} en total</span>
    </div>

    <div class="mt-3 flex flex-wrap items-center gap-2">
      <div class="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
        <button v-for="s in scopes" :key="s.value" type="button"
          :class="['rounded-md px-2.5 py-1 text-xs transition', scope === s.value ? 'bg-white font-medium shadow-sm' : 'text-slate-500 hover:text-slate-700']"
          @click="emit('update:scope', s.value)">
          {{ s.label }} <span class="opacity-60">{{ s.n }}</span>
        </button>
      </div>
      <select v-model="kind" class="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs" aria-label="Tipo de venta">
        <option value="">Todo</option>
        <option value="full">Completas ({{ counts.completas }})</option>
        <option value="profile">Perfiles ({{ counts.perfiles }})</option>
      </select>
      <div class="relative min-w-36 flex-1">
        <Search class="absolute left-2.5 top-2 size-3.5 text-slate-400" />
        <input v-model="q" placeholder="Buscar" class="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-2.5 text-xs" />
      </div>
    </div>

    <p v-if="!loading && !rows.length" class="mt-4 text-sm text-slate-500">
      {{ counts.total ? 'No hay resultados con ese filtro.' : 'Nada pendiente por ahora.' }}
    </p>
    <ul v-else :class="['mt-3 divide-y divide-slate-100 transition-opacity', loading && 'opacity-60']">
      <li v-for="r in rows" :key="`${r.kind}-${r.id}`" class="flex items-center gap-3 py-2.5">
        <div class="min-w-0 flex-1">
          <p class="flex items-center gap-2">
            <span class="truncate font-medium">{{ r.customer_name }}</span>
            <span :class="['shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
              r.kind === 'profile' ? 'bg-violet-100 text-violet-700' : 'bg-indigo-100 text-indigo-700']">
              {{ r.kind === 'profile' ? 'Perfil' : 'Completa' }}
            </span>
          </p>
          <p class="truncate text-sm text-slate-500">
            {{ r.product_name }}<template v-if="r.profile_name"> · {{ r.profile_name }}</template> · {{ r.account_email }}
          </p>
        </div>
        <span :class="['shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium', badge(r.days_left)]">{{ whenLabel(r.days_left) }}</span>
        <div class="flex shrink-0 gap-1">
          <a v-if="r.customer_phone" :href="renewalUrl(r, r.kind)" target="_blank" rel="noopener" title="WhatsApp"
            class="grid size-8 place-items-center rounded-lg bg-emerald-50 text-emerald-700 transition hover:bg-emerald-100">
            <MessageCircle class="size-4" />
          </a>
          <button type="button" title="Renovar 30 días" :disabled="busy === `${r.kind}-${r.id}`"
            class="grid size-8 place-items-center rounded-lg bg-indigo-50 text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-50"
            @click="renew(r)">
            <RefreshCw class="size-4" />
          </button>
          <RouterLink :to="openTo(r)" :title="r.kind === 'profile' ? 'Abrir en Perfiles' : 'Abrir en Alquileres'"
            class="grid size-8 place-items-center rounded-lg bg-slate-100 text-slate-700 transition hover:bg-slate-200">
            <ExternalLink class="size-4" />
          </RouterLink>
        </div>
      </li>
    </ul>

    <div v-if="total > limit" class="mt-3 flex items-center justify-between text-xs text-slate-500">
      <span>Página {{ page }} de {{ pages }} · {{ total }} resultados</span>
      <div class="flex gap-1.5">
        <button type="button" :disabled="page <= 1" class="rounded-lg bg-slate-100 p-1.5 disabled:opacity-40" aria-label="Anterior" @click="page--"><ChevronLeft class="size-4" /></button>
        <button type="button" :disabled="page >= pages" class="rounded-lg bg-slate-100 p-1.5 disabled:opacity-40" aria-label="Siguiente" @click="page++"><ChevronRight class="size-4" /></button>
      </div>
    </div>
  </section>
</template>