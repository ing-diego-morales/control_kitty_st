<script setup>
import { ref, computed, onMounted } from "vue";
import { RouterLink } from "vue-router";
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  KeyRound,
  UserCheck,
} from "lucide-vue-next";
import { api } from "../api";
import { useToast } from "../toast";
import CustomerTop from "../components/CustomerTop.vue";
import IncomeCard from "../components/IncomeCard.vue";
import DueList from "../components/DueList.vue";
import AccountGroups from "../components/AccountGroups.vue";

const toast = useToast();
const data = ref(null);
const error = ref("");
const loading = ref(true);
const dueScope = ref("");
const dueBox = ref(null);

async function loadStats(first = false) {
  try {
    data.value = await api.get("/dashboard");
  } catch (e) {
    if (first) error.value = e.message;
    else toast.error(e.message);
  } finally {
    loading.value = false;
  }
}
onMounted(() => loadStats(true));

function focusDue(scope) {
  dueScope.value = scope;
  dueBox.value?.scrollIntoView({ behavior: "smooth", block: "start" });
}

const expiredTotal = computed(
  () => Number(data.value?.stats.expired ?? 0) + Number(data.value?.stats.p_expired ?? 0),
);
const expiringTotal = computed(
  () => Number(data.value?.stats.expiring ?? 0) + Number(data.value?.stats.p_expiring ?? 0),
);
const breakdown = (full, prof) =>
  Number(full) + Number(prof) ? `${full} completas · ${prof} perfiles` : "Nada por ahora";

function groupByCategory(list) {
  const map = new Map();
  for (const r of list) {
    if (!map.has(r.category_name))
      map.set(r.category_name, { name: r.category_name, total: 0, profiles: 0, products: [] });
    const g = map.get(r.category_name);
    const total = Number(r.total) || 0;
    const profiles = Number(r.profiles) || 0;
    g.products.push({ product_id: r.product_id, product_name: r.product_name, total, profiles });
    g.total += total;
    g.profiles += profiles;
  }
  return [...map.values()];
}

const freeGroups = computed(() => groupByCategory(data.value?.free ?? []));
const rentedGroups = computed(() => groupByCategory(data.value?.rented ?? []));
const totalFree = computed(() => freeGroups.value.reduce((s, g) => s + g.total, 0));
const totalRented = computed(() => rentedGroups.value.reduce((s, g) => s + g.total, 0));
const totalSoldProfiles = computed(() => rentedGroups.value.reduce((s, g) => s + g.profiles, 0));
</script>

<template>
  <div>
    <h1 class="text-2xl font-semibold">Panel</h1>
    <p class="text-slate-500">Lo que necesita tu atención hoy.</p>

    <p v-if="error" class="mt-6 rounded-lg bg-rose-50 p-4 text-rose-700">
      {{ error }}
    </p>
    <p v-else-if="loading" class="mt-6 text-slate-500">Cargando…</p>

    <template v-else>
      <div class="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:items-start">
        <button
          type="button"
          class="rounded-xl border-l-4 border-rose-500 bg-white p-5 text-left shadow-sm transition hover:shadow-md"
          @click="focusDue('expired')"
        >
          <div class="flex items-center gap-2 text-sm text-slate-500">
            <AlertTriangle class="size-4 text-rose-500" />Vencidos sin cortar
          </div>
          <p class="mt-2 text-3xl font-semibold">{{ expiredTotal }}</p>
          <p class="mt-1 text-xs text-slate-400">
            {{ breakdown(data.stats.expired, data.stats.p_expired) }}
          </p>
        </button>

        <button
          type="button"
          class="rounded-xl border-l-4 border-amber-500 bg-white p-5 text-left shadow-sm transition hover:shadow-md"
          @click="focusDue('soon')"
        >
          <div class="flex items-center gap-2 text-sm text-slate-500">
            <Clock class="size-4 text-amber-500" />Vencen en 3 días
          </div>
          <p class="mt-2 text-3xl font-semibold">{{ expiringTotal }}</p>
          <p class="mt-1 text-xs text-slate-400">
            {{ breakdown(data.stats.expiring, data.stats.p_expiring) }}
          </p>
        </button>

        <RouterLink
          :to="{ path: '/alquileres', query: { state: 'active' } }"
          class="rounded-xl border-l-4 border-emerald-500 bg-white p-5 shadow-sm transition hover:shadow-md"
        >
          <div class="flex items-center gap-2 text-sm text-slate-500">
            <CheckCircle2 class="size-4 text-emerald-500" />Alquileres al día
          </div>
          <p class="mt-2 text-3xl font-semibold">
            {{ data.stats.active_rentals }}
          </p>
          <p class="mt-1 text-xs text-slate-400">Toca para ver cuáles son</p>
        </RouterLink>

        <IncomeCard :active-total="data.stats.monthly_income" />
      </div>

      <div class="mt-8 grid gap-6 lg:grid-cols-5">
        <div ref="dueBox" class="scroll-mt-24 lg:col-span-3">
          <DueList v-model:scope="dueScope" @changed="loadStats()" />
        </div>

        <div class="space-y-6 lg:col-span-2">
          <section class="rounded-xl bg-white p-5 shadow-sm">
            <div class="flex items-center gap-2">
              <KeyRound class="size-5 text-emerald-600" />
              <h2 class="font-semibold">Cuentas libres</h2>
            </div>
            <p class="mt-3 text-3xl font-semibold">
              {{ totalFree }}
              <span class="text-base font-normal text-slate-500">{{
                totalFree === 1 ? "cuenta disponible" : "cuentas disponibles"
              }}</span>
            </p>
            <RouterLink
              v-if="Number(data.stats.free_profiles)"
              :to="{ path: '/cuentas', query: { state: 'profiles' } }"
              class="mt-1 inline-block text-sm text-indigo-600 hover:underline"
            >
              + {{ data.stats.free_profiles }}
              {{ Number(data.stats.free_profiles) === 1 ? "perfil libre" : "perfiles libres" }}
            </RouterLink>
            <AccountGroups kind="free" :groups="freeGroups" empty="No tienes cuentas libres." />
          </section>

          <section class="rounded-xl bg-white p-5 shadow-sm">
            <div class="flex items-center gap-2">
              <UserCheck class="size-5 text-indigo-500" />
              <h2 class="font-semibold">Cuentas alquiladas</h2>
            </div>
            <p class="mt-3 text-3xl font-semibold">
              {{ totalRented }}
              <span class="text-base font-normal text-slate-500">{{
                totalRented === 1 ? "cuenta alquilada" : "cuentas alquiladas"
              }}</span>
            </p>
            <RouterLink
              v-if="totalSoldProfiles"
              :to="{ path: '/perfiles', query: { state: 'live' } }"
              class="mt-1 inline-block text-sm text-indigo-600 hover:underline"
            >
              + {{ totalSoldProfiles }}
              {{ totalSoldProfiles === 1 ? "perfil vendido" : "perfiles vendidos" }}
            </RouterLink>
            <AccountGroups kind="rented" :groups="rentedGroups" empty="Todavía no tienes cuentas alquiladas." />
          </section>
        </div>
      </div>

      <div class="mt-6"><CustomerTop /></div>
    </template>
  </div>
</template>