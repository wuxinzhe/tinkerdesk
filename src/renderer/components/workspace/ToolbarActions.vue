<template>
  <Teleport v-if="mounted" to="#l3-toolbar-actions">
    <slot />
  </Teleport>
  <Teleport v-if="mounted" to="#mobile-toolbar-actions">
    <slot />
  </Teleport>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const mounted = ref(false)
onMounted(() => { mounted.value = true })
</script>
