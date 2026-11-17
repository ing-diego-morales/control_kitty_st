<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import {
  ChevronDown, ChevronLeft, ChevronRight, CalendarPlus, UserMinus, Users, Search, ExternalLink,
} from 'lucide-vue-next'
import { api } from '../api'
import { useToast } from '../toast'
import { useConfirm } from '../confirm'
import { money } from '../utils'

const PER_PAGE = 10

const toast = useToast()
const { ask } = useConfirm()

const customers = ref([])
const loading = ref(true)
const openId = ref(null)
const rentals = ref({})
const noteDraft = ref({})
const busy = ref(null)
const page = ref(1)
const search = ref('')

const whenLabel = (d) =>
  d < 0 ? `Venció hace ${-d} ${-d === 1 ? 'día' : 'días'}`
  : d === 0 ? 'Vence hoy'
  : `Vence en ${d} ${d === 1 ? 'día' : 'días'}`
const badge = (d) =>
  d < 0 ? 'bg-rose-100 text-rose-700'
  : d <= 3 ? 'bg-amber-100 text-amber-800'
  : 'bg-slate-100 text-slate-600'

const list = computed(() => rentals.value[openId.value] ?? [])
const filtered = computed(() => {
  const t = search.value.trim().toLowerCase()
  if (!t) return list.value
  return list.value.filter(
    (r) => r.account_email.toLowerCase().includes(t) || r.product_name.toLowerCase().includes(t),
  )
})
const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / PER_PAGE)))
const pageRows = computed(() => filtered.value.slice((page.value - 1) * PER_PAGE, page.value * PER_PAGE))
const rangeFrom = computed(() => (filtered.value.length ? (page.value - 1) * PER_PAGE + 1 : 0))
const rangeTo = computed(() => Math.min(page.value * PER_PAGE, filtered.value.length))

watch(search, () => { page.value = 1 })
watch(pages, (p) => { if (page.value > p) page.value = p })

async function loadTop() {
  try { customers.value = await api.get('/dashboard/customers') }
  catch (e) { toast.error(e.message) }
  finally { loading.value = false }
}

async function loadRentals(id) {
  try {
    const rows = await api.get(`/rentals/by-customer/${id}`)
    rentals.value[id] = rows
    rows.forEach((r) => { noteDraft.value[r.id] = r.notes ?? '' })
  } catch (e) { toast.error(e.message) }
}

async function toggle(c) {
  if (openId.value === c.id) { openId.value = null; return }
  openId.value = c.id
  page.value = 1
  search.value = ''
  await loadRentals(c.id)
}

async function renew(r, days) {
  busy.value = r.id
  try {
    const amount = days === 30 ? undefined : Math.round(Number(r.price) * days / 30)
    await api.post('/rentals/renew', { ids: [r.id], days, amount })
    toast.success(`Renovado +${days} días`)
    await Promise.all([loadRentals(r.customer_id), loadTop()])
  } catch (e) { toast.error(e.message) }
  finally { busy.value = null }
}

async function remove(r) {
  const ok = await ask({
    title: 'Quitar servicio',
    message: 'Se cancela el alquiler y la cuenta queda libre.',
    detail: `${r.product_name} · ${r.account_email}`,
    confirmText: 'Quitar',
    tone: 'danger',
  })
  if (!ok) return
  busy.value = r.id
  try {
    await api.post('/rentals/cancel', { ids: [r.id], account_action: 'free' })
    toast.success('Alquiler cancelado y cuenta liberada')
    await Promise.all([loadRentals(r.customer_id), loadTop()])
  } catch (e) { toast.error(e.message) }
  finally { busy.value = null }
}

async function saveNote(r) {
  const text = noteDraft.value[r.id] ?? ''
  if (text === (r.notes ?? '')) return
  try {
    await api.post(`/rentals/${r.id}/note`, { notes: text })
    r.notes = text
    toast.success('Nota guardada')
  } catch (e) { toast.error(e.message) }
}

onMounted(loadTop)
</script>

<template>
  <section class="rounded-xl bg-white p-5 shadow-sm">
    <div class="flex items-center gap-2">
      <Users class="size-5 text-indigo-500" />
      <h2 class="font-semibold">Mejores clientes</h2>
    </div>
    <p class="text-sm text-slate-500">Ordenados por servicios activos. Toca uno para ver sus cuentas.</p>

    <p v-if="loading" class="mt-4 text-slate-500">Cargando…</p>
    <p v-else-if="!customers.length" class="mt-4 text-slate-500">Aún no hay clientes con alquileres activos.</p>

    <ul v-else class="mt-4 space-y-2">
      <li v-for="(c, i) in customers" :key="c.id" class="rounded-lg border border-slate-200">
        <button type="button" class="flex w-full items-center gap-3 px-3 py-2.5 text-left"
          :aria-expanded="openId === c.id" @click="toggle(c)">
          <span class="grid size-8 shrink-0 place-items-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">{{ i + 1 }}</span>
          <span class="min-w-0 flex-1">
            <span class="block truncate font-medium">{{ c.name }}</span>
            <span class="block truncate text-xs text-slate-500">
              {{ c.lifetime }} compras en total · próximo vencimiento {{ c.next_end }}
            </span>
          </span>
          <span class="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">{{ c.active_count }} activos</span>
          <span class="hidden shrink-0 text-sm text-slate-500 sm:block">{{ money.format(Number(c.active_total)) }}</span>
          <ChevronDown :class="['size-4 shrink-0 transition', openId === c.id && 'rotate-180']" />
        </button>

        <div v-if="openId === c.id" class="border-t border-slate-100 px-3 pb-3 pt-2">
          <p v-if="!rentals[c.id]" class="py-3 text-sm text-slate-500">Cargando…</p>

          <template v-else>
            <div v-if="list.length > PER_PAGE" class="relative mb-1 max-w-xs">
              <Search class="absolute left-2.5 top-2 size-3.5 text-slate-400" />
              <input v-model="search" placeholder="Buscar correo o servicio"
                class="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-2.5 text-xs" />
            </div>

            <p v-if="!pageRows.length" class="py-3 text-sm text-slate-500">
              {{ list.length ? 'Sin resultados.' : 'No tiene alquileres activos.' }}
            </p>

            <ul v-else class="divide-y divide-slate-100">
              <li v-for="r in pageRows" :key="r.id" class="flex flex-wrap items-center gap-2 py-2">
                <div class="min-w-0 flex-1 basis-52">
                  <p class="truncate text-sm font-medium">{{ r.product_name }}</p>
                  <p class="truncate text-xs text-slate-500">{{ r.account_email }}</p>
                </div>

                <span :class="['shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium', badge(r.days_left)]">
                  {{ whenLabel(r.days_left) }} · {{ r.end_date }}
                </span>

                <input v-model="noteDraft[r.id]" maxlength="255" placeholder="Nota (ej. cobrar el 15)"
                  class="min-w-32 flex-1 basis-40 rounded-lg border border-slate-300 px-2.5 py-1 text-xs"
                  @blur="saveNote(r)" @keyup.enter="$event.target.blur()" />

                <div class="flex shrink-0 gap-1">
                  <button v-for="d in [15, 30]" :key="d" type="button" :disabled="busy === r.id"
                    class="flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                    @click="renew(r, d)">
                    <CalendarPlus class="size-3.5" />+{{ d }} días
                  </button>
                  <button type="button" :disabled="busy === r.id"
                    class="flex items-center gap-1 rounded-lg bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                    @click="remove(r)">
                    <UserMinus class="size-3.5" />Quitar
                  </button>
                </div>
              </li>
            </ul>

            <div class="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span>Mostrando {{ rangeFrom }}–{{ rangeTo }} de {{ filtered.length }}</span>
              <div class="flex items-center gap-3">
                <RouterLink :to="{ path: '/alquileres', query: { state: 'live', q: c.name } }"
                  class="inline-flex items-center gap-1 font-medium text-indigo-600 hover:underline">
                  Ver todas en Alquileres <ExternalLink class="size-3.5" />
                </RouterLink>
                <div v-if="filtered.length > PER_PAGE" class="flex items-center gap-1.5">
                  <button type="button" :disabled="page <= 1" aria-label="Anterior"
                    class="rounded-lg bg-slate-100 p-1.5 disabled:opacity-40" @click="page--">
                    <ChevronLeft class="size-4" />
                  </button>
                  <span>{{ page }} / {{ pages }}</span>
                  <button type="button" :disabled="page >= pages" aria-label="Siguiente"
                    class="rounded-lg bg-slate-100 p-1.5 disabled:opacity-40" @click="page++">
                    <ChevronRight class="size-4" />
                  </button>
                </div>
              </div>
            </div>
          </template>
        </div>
      </li>
    </ul>
  </section>
</template>